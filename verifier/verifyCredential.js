require("dotenv").config();

const fs = require("fs");
const { ethers } = require("ethers");
const { buildDidDocument } = require("../lib/didUzheth");
const { verifyCredentialPolicy } = require("../lib/verifyCredentialCore");
const { getIssuerRegistryLinkedTo } = require("../lib/registryClients");

const registryAbi = [
  "function credentialIssuerRegistry() view returns (address)",
  "function getDID(string did) view returns (address owner, string publicKey, string metadataURI, uint256 robotTokenId, bool active, bool suspended, uint256 suspendedAt, uint256 createdAt, uint256 updatedAt)",
  "function isActive(string did) view returns (bool)",
  "function isSuspended(string did) view returns (bool)",
  "function isRevoked(string did) view returns (bool)",
  "function isIssuanceAllowedAt(string did, uint256 timestamp) view returns (bool)",
  "function didExists(string did) view returns (bool)",
  "function isCredentialRevoked(bytes32 credentialHash) view returns (bool)",
  "function isCredentialAnchored(bytes32 credentialHash) view returns (bool)",
  "function getCredentialAnchor(bytes32 credentialHash) view returns (string subjectDid, address publisher, string credentialType, uint256 publishedAt)",
  "function getControllers(string did) view returns (address[])",
  "function getControllerPermissions(string did, address controller) view returns (uint256)",
  "function isRobotKeyAuthorizedAt(string did, address robotKeyAddress, uint256 timestamp) view returns (bool)",
  "function getConsumptionRecord(bytes32 credentialHash) view returns (uint8 mode, uint256 maxUses, uint256 useCount, bool configured)",
  "function isConsumptionAvailable(bytes32 credentialHash) view returns (bool)",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log("INVALID: Credential file path is required");
    process.exitCode = 1;
    return;
  }

  const provider = new ethers.JsonRpcProvider(requireEnv("UZHETH_POS_RPC_URL"));
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const registry = new ethers.Contract(registryAddress, registryAbi, provider);
  const issuerRegistry = await getIssuerRegistryLinkedTo(registryAddress, provider);
  const credential = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });

  if (!result.valid) {
    console.log("INVALID: Credential failed verification policy");
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  const subjectId = credential.credentialSubject.id;
  const [record, controllers] = await Promise.all([
    registry.getDID(subjectId),
    registry.getControllers(subjectId),
  ]);

  console.log("VALID: Credential verified successfully");
  console.log(
    "Linked CredentialIssuerRegistry:",
    await issuerRegistry.getAddress()
  );
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "DID Document:",
    JSON.stringify(
      buildDidDocument({
        did: subjectId,
        publicKey: record.publicKey,
        metadataURI: record.metadataURI,
        robotTokenId: record.robotTokenId,
        active: record.active,
        controllers,
      }),
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`INVALID: ${error.message}`);
  process.exitCode = 1;
});
