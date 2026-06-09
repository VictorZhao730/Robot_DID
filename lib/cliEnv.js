// Shared .env parsing and anchor/consumption options for CLI scripts.
const fs = require("fs");
const { ethers } = require("ethers");
const { credentialStatusHash, tokenIdFromRobotDid } = require("./didUzheth");
const {
  CONTROLLER_KEY_ROTATION,
  CONTROLLER_CREDENTIAL_REVOCATION,
  CONTROLLER_ASSERTION,
  CONSUMPTION_LIMITED,
  CONSUMPTION_UNLIMITED,
} = require("./registryAbis");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

function optionalEnv(name, defaultValue = "") {
  return process.env[name] || defaultValue;
}

function loadCredentialFile(filePath) {
  if (!filePath) {
    throw new Error("Credential file path is required");
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertCredentialHashMatches(credential) {
  const credentialHash = credential.credentialStatus?.credentialHash;
  if (!credentialHash) {
    throw new Error("credentialStatus.credentialHash is missing");
  }
  const expected = credentialStatusHash(credential);
  if (credentialHash.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("credentialStatus.credentialHash does not match credential content");
  }
  return credentialHash;
}

function parseControllerPermissions(value) {
  if (value == null || value === "") {
    return CONTROLLER_KEY_ROTATION | CONTROLLER_CREDENTIAL_REVOCATION | CONTROLLER_ASSERTION;
  }

  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) {
    const permissions = Number(trimmed);
    if (permissions <= 0) {
      throw new Error("CONTROLLER_PERMISSIONS must be > 0");
    }
    return permissions;
  }

  const flags = trimmed
    .split(/[,|+]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  let permissions = 0;
  for (const flag of flags) {
    if (flag === "rotate" || flag === "key_rotation" || flag === "1") {
      permissions |= CONTROLLER_KEY_ROTATION;
    } else if (flag === "revoke" || flag === "credential_revocation" || flag === "2") {
      permissions |= CONTROLLER_CREDENTIAL_REVOCATION;
    } else if (flag === "assert" || flag === "assertion" || flag === "4") {
      permissions |= CONTROLLER_ASSERTION;
    } else {
      throw new Error(`Unknown controller permission flag: ${flag}`);
    }
  }
  if (permissions === 0) {
    throw new Error("Select at least one controller permission");
  }
  return permissions;
}

function parseAnchorGasMode(value = process.env.ANCHOR_GAS_MODE) {
  const mode = (value || "offchain").toLowerCase();
  if (!["offchain", "owner", "actor"].includes(mode)) {
    throw new Error("ANCHOR_GAS_MODE must be offchain, owner, or actor");
  }
  return mode;
}

function parseConsumptionOptions() {
  const mode = (process.env.ANCHOR_CONSUMPTION_MODE || "unlimited").toLowerCase();
  if (mode === "unlimited") {
    return { consumptionMode: CONSUMPTION_UNLIMITED, maxUses: 0 };
  }
  if (mode === "limited") {
    const maxUses = Number(process.env.ANCHOR_MAX_USES || "1");
    if (!Number.isFinite(maxUses) || maxUses < 1) {
      throw new Error("ANCHOR_MAX_USES must be >= 1 when ANCHOR_CONSUMPTION_MODE=limited");
    }
    return { consumptionMode: CONSUMPTION_LIMITED, maxUses };
  }
  throw new Error("ANCHOR_CONSUMPTION_MODE must be unlimited or limited");
}

function buildIssuerMetadata() {
  if (process.env.ISSUER_METADATA) {
    JSON.parse(process.env.ISSUER_METADATA);
    return process.env.ISSUER_METADATA;
  }
  const name = requireEnv("ISSUER_PROFILE_NAME");
  const type = optionalEnv("ISSUER_PROFILE_TYPE");
  const remark = optionalEnv("ISSUER_PROFILE_REMARK");
  return JSON.stringify({
    name,
    ...(type ? { type } : {}),
    ...(remark ? { remark } : {}),
  });
}

function robotTokenIdFromEnv() {
  if (process.env.ROBOT_TOKEN_ID) {
    return BigInt(process.env.ROBOT_TOKEN_ID);
  }
  const did = requireEnv("ROBOT_DID");
  return BigInt(tokenIdFromRobotDid(did));
}

async function getHardhatRegistry(registryAddress) {
  const { ethers: hardhatEthers } = require("hardhat");
  return hardhatEthers.getContractAt("RobotDIDRegistry", registryAddress);
}

async function getHardhatRobotNft(registryAddress) {
  const { ethers: hardhatEthers } = require("hardhat");
  const registry = await getHardhatRegistry(registryAddress);
  const robotNftAddress = await registry.robotIdentityNFT();
  return hardhatEthers.getContractAt("RobotIdentityNFT", robotNftAddress);
}

async function getHardhatIssuerRegistry(registryAddress) {
  const { ethers: hardhatEthers } = require("hardhat");
  const registry = await getHardhatRegistry(registryAddress);
  const issuerRegistryAddress = await registry.credentialIssuerRegistry();
  return hardhatEthers.getContractAt("CredentialIssuerRegistry", issuerRegistryAddress);
}

async function resolveHardhatAnchorSigner(gasMode, actorPrivateKey) {
  const { ethers: hardhatEthers } = require("hardhat");
  if (gasMode === "owner") {
    const [signer] = await hardhatEthers.getSigners();
    return signer;
  }
  const privateKey = actorPrivateKey || process.env.ANCHOR_ACTOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ANCHOR_ACTOR_PRIVATE_KEY is required when ANCHOR_GAS_MODE=actor");
  }
  return new hardhatEthers.Wallet(privateKey, hardhatEthers.provider);
}

async function getNodeRegistrySigner(privateKey, rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

module.exports = {
  assertCredentialHashMatches,
  buildIssuerMetadata,
  getHardhatIssuerRegistry,
  getHardhatRegistry,
  getHardhatRobotNft,
  getNodeRegistrySigner,
  loadCredentialFile,
  optionalEnv,
  parseAnchorGasMode,
  parseConsumptionOptions,
  parseControllerPermissions,
  requireEnv,
  resolveHardhatAnchorSigner,
  robotTokenIdFromEnv,
};
