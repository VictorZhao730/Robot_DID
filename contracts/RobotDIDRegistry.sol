// SPDX-License-Identifier: MIT
// Central registry for robot DIDs: key history, controllers, suspension/revocation,
// and optional on-chain credential anchor / consumption tracking.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IRobotIdentityNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface ICredentialIssuerRegistry {
    function isIssuerActive(address issuer) external view returns (bool);

    function isAuthorizedIssuer(
        string memory credentialType,
        address issuer
    ) external view returns (bool);
}

contract RobotDIDRegistry {
    using Strings for uint256;

    // Controller permission bitmask (owner implicitly has all three).
    uint256 public constant CONTROLLER_KEY_ROTATION = 1;
    uint256 public constant CONTROLLER_CREDENTIAL_REVOCATION = 2;
    uint256 public constant CONTROLLER_ASSERTION = 4;

    uint8 public constant CONSUMPTION_UNLIMITED = 0;
    uint8 public constant CONSUMPTION_LIMITED = 1;

    string private constant ROBOT_DID_PREFIX = "did:uzheth:robot:";
    string private constant REGISTER_CHALLENGE_TYPE = "RegisterRobotKey";

    struct DIDRecord {
        string did;
        string publicKey;
        string metadataURI;
        uint256 robotTokenId;
        bool active;
        bool suspended;
        uint256 suspendedAt;
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct KeyHistoryEntry {
        string publicKey;
        address keyAddress;
        uint256 validFrom;
        uint256 validUntil;
    }

    struct CredentialAnchor {
        string subjectDid;
        address publisher;
        string credentialType;
        uint256 publishedAt;
        bool exists;
    }

    struct ConsumptionRecord {
        string subjectDid;
        uint8 mode;
        uint256 maxUses;
        uint256 useCount;
        bool configured;
    }

    struct SuspensionInterval {
        uint256 startedAt;
        uint256 endedAt;
    }

    IRobotIdentityNFT public immutable robotIdentityNFT;
    ICredentialIssuerRegistry public immutable credentialIssuerRegistry;

    mapping(string => DIDRecord) private records;
    mapping(string => bool) private exists;
    mapping(uint256 => string) private activeDIDByTokenId;
    mapping(bytes32 => bool) private revokedCredentialHashes;
    mapping(bytes32 => CredentialAnchor) private credentialAnchors;
    mapping(bytes32 => ConsumptionRecord) private consumptionRecords;
    mapping(string => mapping(address => uint256)) private controllerPermissions;
    mapping(string => address[]) private controllerList;
    mapping(address => bool) public usedRobotKeyAddresses;
    mapping(string => KeyHistoryEntry[]) private keyHistoryByDid;
    mapping(string => SuspensionInterval[]) private suspensionHistoryByDid;

    event DIDRegistered(
        string indexed did,
        address indexed owner,
        uint256 indexed robotTokenId,
        address robotKeyAddress,
        string publicKey,
        string metadataURI,
        uint256 timestamp
    );

    event DIDRevoked(string indexed did, uint256 timestamp);

    event DIDSuspended(string indexed did, uint256 timestamp);

    event DIDUnsuspended(string indexed did, uint256 timestamp);

    event RobotKeyRotated(
        string indexed did,
        address indexed oldKeyAddress,
        address indexed newKeyAddress,
        string oldPublicKey,
        string newPublicKey,
        uint256 timestamp
    );

    event MetadataUpdated(
        string indexed did,
        string newMetadataURI,
        uint256 timestamp
    );

    event CredentialRevoked(
        string indexed did,
        bytes32 indexed credentialHash,
        uint256 timestamp
    );

    event CredentialAnchored(
        string indexed subjectDid,
        bytes32 indexed credentialHash,
        address indexed publisher,
        string credentialType,
        uint8 consumptionMode,
        uint256 maxUses,
        uint256 timestamp
    );

    event CredentialConsumed(
        bytes32 indexed credentialHash,
        address indexed consumer,
        uint256 useCount,
        uint256 timestamp
    );

    event ControllerAdded(
        string indexed did,
        address indexed controller,
        uint256 permissions,
        uint256 timestamp
    );

    event ControllerPermissionsUpdated(
        string indexed did,
        address indexed controller,
        uint256 permissions,
        uint256 timestamp
    );

    event ControllerRemoved(
        string indexed did,
        address indexed controller,
        uint256 timestamp
    );

    constructor(
        address robotIdentityNFTAddress,
        address credentialIssuerRegistryAddress
    ) {
        require(robotIdentityNFTAddress != address(0), "NFT address must not be zero");
        robotIdentityNFT = IRobotIdentityNFT(robotIdentityNFTAddress);
        credentialIssuerRegistry = ICredentialIssuerRegistry(
            credentialIssuerRegistryAddress
        );
    }

    modifier onlyOwner(string memory did) {
        require(exists[did], "DID does not exist");
        require(_managementOwner(did) == msg.sender, "Only DID owner can call this function");
        _;
    }

    modifier onlyOwnerOrController(string memory did) {
        require(exists[did], "DID does not exist");
        require(
            _managementOwner(did) == msg.sender ||
                controllerPermissions[did][msg.sender] != 0,
            "Only DID owner or controller can call this function"
        );
        _;
    }

    modifier onlyOwnerOrControllerWithPermission(
        string memory did,
        uint256 permission
    ) {
        require(exists[did], "DID does not exist");
        require(
            _managementOwner(did) == msg.sender ||
                (controllerPermissions[did][msg.sender] & permission) != 0,
            "Missing DID controller permission"
        );
        _;
    }

    function robotDidForToken(uint256 robotTokenId) public view returns (string memory) {
        return string(
            abi.encodePacked(
                ROBOT_DID_PREFIX,
                block.chainid.toString(),
                ":",
                _addressToHexString(address(robotIdentityNFT)),
                ":",
                robotTokenId.toString()
            )
        );
    }

    function _addressToHexString(address addr) internal pure returns (string memory) {
        return Strings.toHexString(uint256(uint160(addr)), 20);
    }

    // NFT owner submits registration; robot key must sign a challenge proving key possession.
    function registerDID(
        string memory publicKey,
        address robotKeyAddress,
        string memory metadataURI,
        uint256 robotTokenId,
        bytes memory robotKeySignature
    ) external {
        require(bytes(publicKey).length > 0, "Public key must not be empty");
        require(robotKeyAddress != address(0), "Robot key address must not be zero");
        require(!usedRobotKeyAddresses[robotKeyAddress], "Robot key already used");
        require(
            robotIdentityNFT.ownerOf(robotTokenId) == msg.sender,
            "Caller must own robot NFT"
        );
        require(
            bytes(activeDIDByTokenId[robotTokenId]).length == 0,
            "Robot NFT already has active DID"
        );

        string memory did = robotDidForToken(robotTokenId);
        require(!exists[did], "DID already exists");
        require(
            _verifyRegisterChallenge(did, publicKey, robotKeyAddress, robotKeySignature),
            "Invalid robot key signature"
        );

        uint256 timestamp = block.timestamp;

        records[did] = DIDRecord({
            did: did,
            publicKey: publicKey,
            metadataURI: metadataURI,
            robotTokenId: robotTokenId,
            active: true,
            suspended: false,
            suspendedAt: 0,
            createdAt: timestamp,
            updatedAt: timestamp
        });
        exists[did] = true;
        activeDIDByTokenId[robotTokenId] = did;

        usedRobotKeyAddresses[robotKeyAddress] = true;
        keyHistoryByDid[did].push(
            KeyHistoryEntry({
                publicKey: publicKey,
                keyAddress: robotKeyAddress,
                validFrom: timestamp,
                validUntil: 0
            })
        );

        emit DIDRegistered(
            did,
            msg.sender,
            robotTokenId,
            robotKeyAddress,
            publicKey,
            metadataURI,
            timestamp
        );
    }

    function updatePublicKey(
        string memory did,
        string memory newPublicKey,
        address newRobotKeyAddress
    ) external onlyOwnerOrControllerWithPermission(did, CONTROLLER_KEY_ROTATION) {
        require(records[did].active, "DID is not active");
        require(!records[did].suspended, "DID is suspended");
        require(bytes(newPublicKey).length > 0, "Public key must not be empty");
        require(newRobotKeyAddress != address(0), "Robot key address must not be zero");
        require(!usedRobotKeyAddresses[newRobotKeyAddress], "Robot key already used");

        uint256 timestamp = block.timestamp;
        string memory oldPublicKey = records[did].publicKey;
        address oldRobotKeyAddress = _currentRobotKeyAddress(did);

        _closeCurrentKeyHistoryEntry(did, timestamp);

        records[did].publicKey = newPublicKey;
        records[did].updatedAt = timestamp;

        usedRobotKeyAddresses[newRobotKeyAddress] = true;
        keyHistoryByDid[did].push(
            KeyHistoryEntry({
                publicKey: newPublicKey,
                keyAddress: newRobotKeyAddress,
                validFrom: timestamp,
                validUntil: 0
            })
        );

        emit RobotKeyRotated(
            did,
            oldRobotKeyAddress,
            newRobotKeyAddress,
            oldPublicKey,
            newPublicKey,
            timestamp
        );
    }

    function updateMetadataURI(
        string memory did,
        string memory newMetadataURI
    ) external onlyOwnerOrController(did) {
        require(records[did].active, "DID is not active");

        uint256 timestamp = block.timestamp;
        records[did].metadataURI = newMetadataURI;
        records[did].updatedAt = timestamp;

        emit MetadataUpdated(did, newMetadataURI, timestamp);
    }

    function suspendDID(string memory did) external onlyOwner(did) {
        require(records[did].active, "DID is not active");
        require(!records[did].suspended, "DID is already suspended");

        uint256 timestamp = block.timestamp;
        records[did].suspended = true;
        records[did].suspendedAt = timestamp;
        records[did].updatedAt = timestamp;

        suspensionHistoryByDid[did].push(
            SuspensionInterval({startedAt: timestamp, endedAt: 0})
        );

        emit DIDSuspended(did, timestamp);
    }

    function unsuspendDID(string memory did) external onlyOwner(did) {
        require(records[did].active, "DID is not active");
        require(records[did].suspended, "DID is not suspended");

        uint256 timestamp = block.timestamp;
        _closeOpenSuspensionInterval(did, timestamp);

        records[did].suspended = false;
        records[did].suspendedAt = 0;
        records[did].updatedAt = timestamp;

        emit DIDUnsuspended(did, timestamp);
    }

    function revokeDID(string memory did) external onlyOwner(did) {
        require(records[did].active, "DID is not active");

        uint256 timestamp = block.timestamp;
        if (records[did].suspended) {
            _closeOpenSuspensionInterval(did, timestamp);
        }

        records[did].active = false;
        records[did].suspended = false;
        records[did].suspendedAt = 0;
        records[did].updatedAt = timestamp;
        _closeCurrentKeyHistoryEntry(did, timestamp);
        delete activeDIDByTokenId[records[did].robotTokenId];

        emit DIDRevoked(did, timestamp);
    }

    function _closeOpenSuspensionInterval(string memory did, uint256 endedAt) internal {
        SuspensionInterval[] storage history = suspensionHistoryByDid[did];
        if (history.length == 0) {
            return;
        }

        SuspensionInterval storage latest = history[history.length - 1];
        if (latest.endedAt == 0) {
            latest.endedAt = endedAt;
        }
    }

    function revokeCredential(
        string memory did,
        bytes32 credentialHash
    ) external onlyOwnerOrControllerWithPermission(did, CONTROLLER_CREDENTIAL_REVOCATION) {
        require(records[did].active, "DID is not active");

        revokedCredentialHashes[credentialHash] = true;

        emit CredentialRevoked(did, credentialHash, block.timestamp);
    }

    function anchorCredential(
        string memory subjectDid,
        bytes32 credentialHash,
        string memory credentialType,
        uint8 consumptionMode,
        uint256 maxUses
    ) external {
        require(exists[subjectDid], "DID does not exist");
        require(records[subjectDid].active, "DID is not active");
        require(credentialHash != bytes32(0), "Credential hash must not be empty");
        require(!credentialAnchors[credentialHash].exists, "Credential already anchored");
        require(
            _canAnchor(subjectDid, msg.sender, credentialType),
            "Not authorized to anchor credential"
        );
        require(
            consumptionMode == CONSUMPTION_UNLIMITED ||
                consumptionMode == CONSUMPTION_LIMITED,
            "Invalid consumption mode"
        );
        require(
            consumptionMode != CONSUMPTION_LIMITED || maxUses >= 1,
            "Limited consumption requires maxUses >= 1"
        );

        uint256 timestamp = block.timestamp;
        credentialAnchors[credentialHash] = CredentialAnchor({
            subjectDid: subjectDid,
            publisher: msg.sender,
            credentialType: credentialType,
            publishedAt: timestamp,
            exists: true
        });
        consumptionRecords[credentialHash] = ConsumptionRecord({
            subjectDid: subjectDid,
            mode: consumptionMode,
            maxUses: maxUses,
            useCount: 0,
            configured: true
        });

        emit CredentialAnchored(
            subjectDid,
            credentialHash,
            msg.sender,
            credentialType,
            consumptionMode,
            maxUses,
            timestamp
        );
    }

    function consumeCredential(bytes32 credentialHash) external returns (uint256) {
        ConsumptionRecord storage record = consumptionRecords[credentialHash];
        require(record.configured, "Consumption policy not configured");
        require(isConsumptionAvailable(credentialHash), "Credential consumption limit reached");

        if (record.mode != CONSUMPTION_UNLIMITED) {
            record.useCount += 1;
        }

        emit CredentialConsumed(credentialHash, msg.sender, record.useCount, block.timestamp);
        return record.useCount;
    }

    function addController(
        string memory did,
        address controller
    ) external onlyOwner(did) {
        addController(did, controller, CONTROLLER_KEY_ROTATION | CONTROLLER_CREDENTIAL_REVOCATION);
    }

    function addController(
        string memory did,
        address controller,
        uint256 permissions
    ) public onlyOwner(did) {
        require(records[did].active, "DID is not active");
        require(controller != address(0), "Controller must not be zero address");
        require(controller != _managementOwner(did), "Owner is already a controller");
        require(controllerPermissions[did][controller] == 0, "Controller already added");
        require(permissions != 0, "Controller permissions must not be empty");

        controllerPermissions[did][controller] = permissions;
        controllerList[did].push(controller);

        emit ControllerAdded(did, controller, permissions, block.timestamp);
    }

    function updateControllerPermissions(
        string memory did,
        address controller,
        uint256 permissions
    ) external onlyOwner(did) {
        require(records[did].active, "DID is not active");
        require(controllerPermissions[did][controller] != 0, "Controller is not active");
        require(permissions != 0, "Controller permissions must not be empty");

        controllerPermissions[did][controller] = permissions;

        emit ControllerPermissionsUpdated(did, controller, permissions, block.timestamp);
    }

    function removeController(
        string memory did,
        address controller
    ) external onlyOwner(did) {
        require(records[did].active, "DID is not active");
        require(controllerPermissions[did][controller] != 0, "Controller is not active");

        controllerPermissions[did][controller] = 0;

        emit ControllerRemoved(did, controller, block.timestamp);
    }

    function getDID(
        string memory did
    )
        external
        view
        returns (
            address owner,
            string memory publicKey,
            string memory metadataURI,
            uint256 robotTokenId,
            bool active,
            bool suspended,
            uint256 suspendedAt,
            uint256 createdAt,
            uint256 updatedAt
        )
    {
        require(exists[did], "DID does not exist");

        DIDRecord storage record = records[did];
        return (
            _managementOwner(did),
            record.publicKey,
            record.metadataURI,
            record.robotTokenId,
            record.active,
            record.suspended,
            record.suspendedAt,
            record.createdAt,
            record.updatedAt
        );
    }

    function isSuspended(string memory did) external view returns (bool) {
        if (!exists[did]) {
            return false;
        }

        return records[did].suspended;
    }

    function getSuspendedAt(string memory did) external view returns (uint256) {
        if (!exists[did]) {
            return 0;
        }

        return records[did].suspendedAt;
    }

    function isRevoked(string memory did) external view returns (bool) {
        return exists[did] && !records[did].active;
    }

    // Verifiers call this with credential issuedAt to reject VCs minted during suspend windows.
    function isIssuanceAllowedAt(
        string memory did,
        uint256 timestamp
    ) external view returns (bool) {
        if (!exists[did] || !records[did].active) {
            return false;
        }

        SuspensionInterval[] storage history = suspensionHistoryByDid[did];
        for (uint256 i = 0; i < history.length; i++) {
            SuspensionInterval storage interval = history[i];
            if (timestamp >= interval.startedAt) {
                if (interval.endedAt == 0 || timestamp < interval.endedAt) {
                    return false;
                }
            }
        }

        return true;
    }

    function getSuspensionHistoryLength(
        string memory did
    ) external view returns (uint256) {
        require(exists[did], "DID does not exist");
        return suspensionHistoryByDid[did].length;
    }

    function getSuspensionInterval(
        string memory did,
        uint256 index
    ) external view returns (uint256 startedAt, uint256 endedAt) {
        require(exists[did], "DID does not exist");
        SuspensionInterval storage interval = suspensionHistoryByDid[did][index];
        return (interval.startedAt, interval.endedAt);
    }

    function isUsedRobotKey(address robotKeyAddress) external view returns (bool) {
        return usedRobotKeyAddresses[robotKeyAddress];
    }

    function getKeyHistoryLength(string memory did) external view returns (uint256) {
        require(exists[did], "DID does not exist");
        return keyHistoryByDid[did].length;
    }

    function getKeyHistoryEntry(
        string memory did,
        uint256 index
    )
        external
        view
        returns (
            string memory publicKey,
            address keyAddress,
            uint256 validFrom,
            uint256 validUntil
        )
    {
        require(exists[did], "DID does not exist");
        KeyHistoryEntry storage entry = keyHistoryByDid[did][index];
        return (entry.publicKey, entry.keyAddress, entry.validFrom, entry.validUntil);
    }

    function isRobotKeyAuthorizedAt(
        string memory did,
        address robotKeyAddress,
        uint256 timestamp
    ) external view returns (bool) {
        return _isRobotKeyAuthorizedAt(did, robotKeyAddress, timestamp);
    }

    function isActive(string memory did) external view returns (bool) {
        if (!exists[did]) {
            return false;
        }

        return records[did].active;
    }

    function didExists(string memory did) external view returns (bool) {
        return exists[did];
    }

    function isController(
        string memory did,
        address controller
    ) external view returns (bool) {
        if (!exists[did]) {
            return false;
        }

        return _managementOwner(did) == controller || controllerPermissions[did][controller] != 0;
    }

    function getControllerPermissions(
        string memory did,
        address controller
    ) external view returns (uint256) {
        if (!exists[did]) {
            return 0;
        }

        if (_managementOwner(did) == controller) {
            return
                CONTROLLER_KEY_ROTATION |
                CONTROLLER_CREDENTIAL_REVOCATION |
                CONTROLLER_ASSERTION;
        }

        return controllerPermissions[did][controller];
    }

    function getControllers(
        string memory did
    ) external view returns (address[] memory) {
        require(exists[did], "DID does not exist");

        uint256 activeControllerCount = 1;
        for (uint256 i = 0; i < controllerList[did].length; i += 1) {
            if (controllerPermissions[did][controllerList[did][i]] != 0) {
                activeControllerCount += 1;
            }
        }

        address[] memory activeControllers = new address[](activeControllerCount);
        activeControllers[0] = _managementOwner(did);
        uint256 cursor = 1;
        for (uint256 i = 0; i < controllerList[did].length; i += 1) {
            address controller = controllerList[did][i];
            if (controllerPermissions[did][controller] != 0) {
                activeControllers[cursor] = controller;
                cursor += 1;
            }
        }

        return activeControllers;
    }

    function isCredentialRevoked(
        bytes32 credentialHash
    ) external view returns (bool) {
        return revokedCredentialHashes[credentialHash];
    }

    function isCredentialAnchored(bytes32 credentialHash) external view returns (bool) {
        return credentialAnchors[credentialHash].exists;
    }

    function getCredentialAnchor(
        bytes32 credentialHash
    )
        external
        view
        returns (
            string memory subjectDid,
            address publisher,
            string memory credentialType,
            uint256 publishedAt
        )
    {
        require(credentialAnchors[credentialHash].exists, "Credential not anchored");

        CredentialAnchor storage anchor = credentialAnchors[credentialHash];
        return (
            anchor.subjectDid,
            anchor.publisher,
            anchor.credentialType,
            anchor.publishedAt
        );
    }

    function getConsumptionRecord(
        bytes32 credentialHash
    )
        external
        view
        returns (
            uint8 mode,
            uint256 maxUses,
            uint256 useCount,
            bool configured
        )
    {
        ConsumptionRecord storage record = consumptionRecords[credentialHash];
        return (record.mode, record.maxUses, record.useCount, record.configured);
    }

    function isConsumptionAvailable(bytes32 credentialHash) public view returns (bool) {
        ConsumptionRecord storage record = consumptionRecords[credentialHash];
        if (!record.configured) {
            return true;
        }

        if (record.mode == CONSUMPTION_UNLIMITED) {
            return true;
        }

        return record.useCount < record.maxUses;
    }

    function activeDIDForRobotToken(
        uint256 robotTokenId
    ) external view returns (string memory) {
        return activeDIDByTokenId[robotTokenId];
    }

    function _verifyRegisterChallenge(
        string memory did,
        string memory publicKey,
        address robotKeyAddress,
        bytes memory signature
    ) internal pure returns (bool) {
        bytes32 digest = keccak256(
            abi.encode(REGISTER_CHALLENGE_TYPE, did, publicKey, robotKeyAddress)
        );
        bytes32 ethSignedHash = ECDSA.toEthSignedMessageHash(digest);
        return ECDSA.recover(ethSignedHash, signature) == robotKeyAddress;
    }

    // Management owner = current NFT holder (may differ from the robot device signing key).
    function _managementOwner(string memory did) internal view returns (address) {
        return robotIdentityNFT.ownerOf(records[did].robotTokenId);
    }

    function _currentRobotKeyAddress(string memory did) internal view returns (address) {
        KeyHistoryEntry[] storage history = keyHistoryByDid[did];
        require(history.length > 0, "Robot key history missing");
        return history[history.length - 1].keyAddress;
    }

    function _closeCurrentKeyHistoryEntry(string memory did, uint256 timestamp) internal {
        KeyHistoryEntry[] storage history = keyHistoryByDid[did];
        require(history.length > 0, "Robot key history missing");
        KeyHistoryEntry storage currentEntry = history[history.length - 1];
        if (currentEntry.validUntil == 0) {
            currentEntry.validUntil = timestamp;
        }
    }

    function _isRobotKeyAuthorizedAt(
        string memory did,
        address robotKeyAddress,
        uint256 timestamp
    ) internal view returns (bool) {
        if (!exists[did] || !records[did].active) {
            return false;
        }

        KeyHistoryEntry[] storage history = keyHistoryByDid[did];
        for (uint256 i = 0; i < history.length; i++) {
            KeyHistoryEntry storage entry = history[i];
            if (entry.keyAddress != robotKeyAddress) {
                continue;
            }
            if (timestamp < entry.validFrom) {
                continue;
            }
            if (entry.validUntil != 0 && timestamp > entry.validUntil) {
                continue;
            }
            return true;
        }

        return false;
    }

    // Who may publish an anchor: NFT owner, current robot key, controller with assertion, or trusted issuer.
    function _canAnchor(
        string memory subjectDid,
        address publisher,
        string memory credentialType
    ) internal view returns (bool) {
        if (_managementOwner(subjectDid) == publisher) {
            return true;
        }

        if (_isRobotKeyAuthorizedAt(subjectDid, publisher, block.timestamp)) {
            return true;
        }

        if ((controllerPermissions[subjectDid][publisher] & CONTROLLER_ASSERTION) != 0) {
            return true;
        }

        if (
            address(credentialIssuerRegistry) != address(0) &&
            bytes(credentialType).length > 0 &&
            credentialIssuerRegistry.isIssuerActive(publisher) &&
            credentialIssuerRegistry.isAuthorizedIssuer(credentialType, publisher)
        ) {
            return true;
        }

        return false;
    }
}
