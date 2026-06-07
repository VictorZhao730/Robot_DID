// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract CredentialIssuerRegistry is AccessControl {
    bytes32 public constant MAINTAINER_ROLE = keccak256("MAINTAINER_ROLE");
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant OWNER_ISSUER_ROLE = keccak256("OWNER_ISSUER_ROLE");
    bytes32 public constant SAFETY_INSPECTOR_ROLE = keccak256("SAFETY_INSPECTOR_ROLE");
    bytes32 public constant OPERATION_LICENSE_ISSUER_ROLE =
        keccak256("OPERATION_LICENSE_ISSUER_ROLE");

    struct IssuerRecord {
        bool active;
        string metadataURI;
        uint256 updatedAt;
    }

    mapping(address => IssuerRecord) private issuers;

    event IssuerRegistered(address indexed issuer, string metadataURI, uint256 timestamp);
    event IssuerRevoked(address indexed issuer, uint256 timestamp);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MAINTAINER_ROLE, msg.sender);
        _grantRole(MANUFACTURER_ROLE, msg.sender);
        _grantRole(OWNER_ISSUER_ROLE, msg.sender);
        _grantRole(SAFETY_INSPECTOR_ROLE, msg.sender);
        _grantRole(OPERATION_LICENSE_ISSUER_ROLE, msg.sender);

        issuers[msg.sender] = IssuerRecord({
            active: true,
            metadataURI: "",
            updatedAt: block.timestamp
        });
        emit IssuerRegistered(msg.sender, "", block.timestamp);
    }

    function registerIssuer(
        address issuer,
        string memory metadataURI
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(issuer != address(0), "Issuer must not be zero address");

        issuers[issuer] = IssuerRecord({
            active: true,
            metadataURI: metadataURI,
            updatedAt: block.timestamp
        });

        emit IssuerRegistered(issuer, metadataURI, block.timestamp);
    }

    function revokeIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(issuers[issuer].active, "Issuer is not active");

        issuers[issuer].active = false;
        issuers[issuer].updatedAt = block.timestamp;

        emit IssuerRevoked(issuer, block.timestamp);
    }

    function roleForCredentialType(
        string memory credentialType
    ) public pure returns (bytes32) {
        bytes32 typeHash = keccak256(bytes(credentialType));

        if (typeHash == keccak256(bytes("RobotMaintenanceCredential"))) {
            return MAINTAINER_ROLE;
        }
        if (typeHash == keccak256(bytes("RobotManufacturingCredential"))) {
            return MANUFACTURER_ROLE;
        }
        if (typeHash == keccak256(bytes("RobotOwnershipCredential"))) {
            return OWNER_ISSUER_ROLE;
        }
        if (typeHash == keccak256(bytes("RobotSafetyInspectionCredential"))) {
            return SAFETY_INSPECTOR_ROLE;
        }
        if (typeHash == keccak256(bytes("RobotOperationLicenseCredential"))) {
            return OPERATION_LICENSE_ISSUER_ROLE;
        }

        revert("Unsupported credential type");
    }

    function isAuthorizedIssuer(
        string memory credentialType,
        address issuer
    ) external view returns (bool) {
        return issuers[issuer].active && hasRole(roleForCredentialType(credentialType), issuer);
    }

    function isIssuerActive(address issuer) external view returns (bool) {
        return issuers[issuer].active;
    }

    function getIssuer(
        address issuer
    ) external view returns (bool active, string memory metadataURI, uint256 updatedAt) {
        IssuerRecord storage record = issuers[issuer];
        return (record.active, record.metadataURI, record.updatedAt);
    }
}
