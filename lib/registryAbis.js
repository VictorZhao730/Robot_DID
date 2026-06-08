const REGISTRY_ABI = [
  "function robotIdentityNFT() view returns (address)",
  "function credentialIssuerRegistry() view returns (address)",
  "function registerDID(string publicKey, address robotKeyAddress, string metadataURI, uint256 robotTokenId, bytes robotKeySignature)",
  "function updatePublicKey(string did, string newPublicKey, address newRobotKeyAddress)",
  "function suspendDID(string did)",
  "function unsuspendDID(string did)",
  "function revokeDID(string did)",
  "function revokeCredential(string did, bytes32 credentialHash)",
  "function anchorCredential(string subjectDid, bytes32 credentialHash, string credentialType, uint8 consumptionMode, uint256 maxUses)",
  "function consumeCredential(bytes32 credentialHash) returns (uint256)",
  "function addController(string did, address controller, uint256 permissions)",
  "function updateControllerPermissions(string did, address controller, uint256 permissions)",
  "function removeController(string did, address controller)",
  "function isUsedRobotKey(address robotKeyAddress) view returns (bool)",
  "function getDID(string did) view returns (address owner, string publicKey, string metadataURI, uint256 robotTokenId, bool active, bool suspended, uint256 suspendedAt, uint256 createdAt, uint256 updatedAt)",
  "function getControllers(string did) view returns (address[])",
  "function isCredentialAnchored(bytes32 credentialHash) view returns (bool)",
  "function getConsumptionRecord(bytes32 credentialHash) view returns (uint8 mode, uint256 maxUses, uint256 useCount, bool configured)",
  "function isConsumptionAvailable(bytes32 credentialHash) view returns (bool)",
];

const ROBOT_NFT_ABI = [
  "function MINTER_ROLE() view returns (bytes32)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function mintRobot(address to, string metadataURI) returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
];

const ISSUER_REGISTRY_ABI = [
  "function registerIssuer(address issuer, string metadataURI)",
  "function revokeIssuer(address issuer)",
  "function isIssuerActive(address issuer) view returns (bool)",
  "function getIssuer(address issuer) view returns (bool active, string metadataURI, uint256 updatedAt)",
  "function roleForCredentialType(string credentialType) view returns (bytes32)",
  "function isAuthorizedIssuer(string credentialType, address issuer) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
];

const CONTROLLER_KEY_ROTATION = 1;
const CONTROLLER_CREDENTIAL_REVOCATION = 2;
const CONTROLLER_ASSERTION = 4;

const CONSUMPTION_UNLIMITED = 0;
const CONSUMPTION_LIMITED = 1;

module.exports = {
  REGISTRY_ABI,
  ROBOT_NFT_ABI,
  ISSUER_REGISTRY_ABI,
  CONTROLLER_KEY_ROTATION,
  CONTROLLER_CREDENTIAL_REVOCATION,
  CONTROLLER_ASSERTION,
  CONSUMPTION_UNLIMITED,
  CONSUMPTION_LIMITED,
};
