// Project-specific did:uzheth method, canonical JSON, and register-challenge helpers.
const { ethers } = require("ethers");

const DID_METHOD_PREFIX = "did:uzheth:";
const ROBOT_DID_PREFIX = `${DID_METHOD_PREFIX}robot:`;
const ROBOT_DID_BODY_PATTERN = /^(\d+):(0x[a-fA-F0-9]{40}):(\d+)$/;
const UZHETH_CHAIN_ID = 70207;
const KEY_FRAGMENT = "#keys-1";
const VERIFICATION_METHOD_TYPE = "EcdsaSecp256k1RecoveryMethod2020";
const REGISTER_CHALLENGE_TYPE = "RegisterRobotKey";

const CONSUMPTION_UNLIMITED = 0;
const CONSUMPTION_LIMITED = 1;

// Deterministic JSON for signing: sorted keys, no whitespace (EIP-191 over keccak256 digest).
function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function isRobotDid(did) {
  return typeof did === "string" && did.startsWith(ROBOT_DID_PREFIX);
}

function isAddressDid(did) {
  if (typeof did !== "string" || !did.startsWith(DID_METHOD_PREFIX) || isRobotDid(did)) {
    return false;
  }
  try {
    ethers.getAddress(did.slice(DID_METHOD_PREFIX.length));
    return true;
  } catch (_error) {
    return false;
  }
}

function didFromAddress(address) {
  return `${DID_METHOD_PREFIX}${ethers.getAddress(address)}`;
}

function didFromRobotTokenId(tokenId, chainId, nftAddress) {
  if (tokenId === undefined || chainId === undefined || !nftAddress) {
    throw new Error(
      "didFromRobotTokenId(tokenId, chainId, nftAddress) requires all three arguments"
    );
  }
  const token = String(tokenId);
  if (!/^\d+$/.test(token) || (token.length > 1 && token.startsWith("0"))) {
    throw new Error("Invalid robot token ID");
  }
  const normalizedNft = ethers.getAddress(nftAddress).toLowerCase();
  return `${ROBOT_DID_PREFIX}${String(chainId)}:${normalizedNft}:${token}`;
}

function parseRobotDid(did) {
  if (!isRobotDid(did)) {
    throw new Error(
      "Expected robot DID format did:uzheth:robot:<chainId>:0x<nftAddress>:<tokenId>"
    );
  }
  const match = did.slice(ROBOT_DID_PREFIX.length).match(ROBOT_DID_BODY_PATTERN);
  if (!match) {
    throw new Error(`Invalid robot DID format: ${did}`);
  }
  const tokenId = match[3];
  if (tokenId.length > 1 && tokenId.startsWith("0")) {
    throw new Error("Robot DID token ID must be canonical decimal form");
  }
  return {
    chainId: match[1],
    nftAddress: ethers.getAddress(match[2]),
    tokenId,
  };
}

function tokenIdFromRobotDid(did) {
  return parseRobotDid(did).tokenId;
}

function chainIdFromRobotDid(did) {
  return parseRobotDid(did).chainId;
}

function nftAddressFromRobotDid(did) {
  return parseRobotDid(did).nftAddress;
}

function validateRobotDid(did) {
  parseRobotDid(did);
  return did;
}

async function robotDidFromRegistry(registry, tokenId) {
  return registry.robotDidForToken(tokenId);
}

// Must match RobotDIDRegistry._verifyRegisterChallenge (abi.encode + EIP-191).
function buildRegisterChallengeDigest(did, publicKey, robotKeyAddress) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "string", "address"],
      [REGISTER_CHALLENGE_TYPE, did, publicKey, robotKeyAddress]
    )
  );
}

function buildRegisterChallengePayload(did, publicKey, robotKeyAddress) {
  return {
    type: REGISTER_CHALLENGE_TYPE,
    did,
    publicKey,
    robotKeyAddress: ethers.getAddress(robotKeyAddress),
  };
}

async function signRegisterChallenge(wallet, did, publicKey, robotKeyAddress) {
  const payload = buildRegisterChallengePayload(did, publicKey, robotKeyAddress);
  const digest = buildRegisterChallengeDigest(did, publicKey, payload.robotKeyAddress);
  const signature = await wallet.signMessage(ethers.getBytes(digest));
  const recovered = ethers.verifyMessage(ethers.getBytes(digest), signature);
  return {
    payload,
    digest,
    signature,
    recovered,
    signatureValid: recovered.toLowerCase() === payload.robotKeyAddress.toLowerCase(),
  };
}

function addressFromDid(did) {
  if (!isAddressDid(did)) {
    throw new Error("Expected address-based DID format did:uzheth:0x...");
  }
  return ethers.getAddress(did.slice(DID_METHOD_PREFIX.length));
}

function verificationMethodId(did) {
  return `${did}${KEY_FRAGMENT}`;
}

function blockchainAccountId(address, chainId = UZHETH_CHAIN_ID) {
  return `eip155:${chainId}:${ethers.getAddress(address)}`;
}

function publicKeyToAddress(publicKey) {
  return ethers.computeAddress(publicKey);
}

function credentialStatusHash(credential) {
  const { proof, id, credentialStatus, ...credentialForStatus } = credential;
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalize(credentialForStatus)));
}

function credentialIssuedAtSeconds(credential) {
  if (Number.isFinite(credential?.issuedAt)) {
    return Math.floor(Number(credential.issuedAt));
  }
  if (credential?.issuanceDate) {
    return Math.floor(new Date(credential.issuanceDate).getTime() / 1000);
  }
  return null;
}

async function isRobotKeyAuthorizedAt(registry, did, robotKeyAddress, issuedAtSeconds) {
  if (!registry || !did || !robotKeyAddress || issuedAtSeconds == null) {
    return false;
  }
  return registry.isRobotKeyAuthorizedAt(did, robotKeyAddress, BigInt(issuedAtSeconds));
}

function buildDidDocument({
  did,
  publicKey,
  metadataURI,
  robotTokenId,
  robotNftAddress,
  active = true,
  chainId,
  controllers,
}) {
  const methodId = verificationMethodId(did);
  const signingAddress = publicKeyToAddress(publicKey);
  let resolvedChainId = chainId;
  let resolvedNftAddress = robotNftAddress;
  let resolvedTokenId = robotTokenId;

  if (isRobotDid(did)) {
    const parsed = parseRobotDid(did);
    resolvedChainId = resolvedChainId ?? Number(parsed.chainId);
    resolvedNftAddress = resolvedNftAddress ?? parsed.nftAddress;
    resolvedTokenId = resolvedTokenId ?? parsed.tokenId;
  }

  const controllerDids =
    controllers && controllers.length > 0
      ? controllers.map((controller) => didFromAddress(controller))
      : [did];
  const services = [];

  if (metadataURI) {
    services.push({
      id: `${did}#metadata`,
      type: "RobotMetadata",
      serviceEndpoint: metadataURI,
    });
  }

  if (resolvedTokenId !== undefined && resolvedNftAddress) {
    services.push({
      id: `${did}#robot-asset`,
      type: "RobotIdentityNFT",
      serviceEndpoint: `eip155:${resolvedChainId ?? UZHETH_CHAIN_ID}/erc721:${ethers
        .getAddress(resolvedNftAddress)
        .toLowerCase()}/${String(resolvedTokenId)}`,
    });
  }

  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
    ],
    id: did,
    controller: controllerDids,
    verificationMethod: [
      {
        id: methodId,
        type: VERIFICATION_METHOD_TYPE,
        controller: did,
        blockchainAccountId: blockchainAccountId(signingAddress, resolvedChainId ?? UZHETH_CHAIN_ID),
        publicKeyHex: publicKey,
      },
    ],
    authentication: [methodId],
    assertionMethod: [methodId],
    capabilityInvocation: [methodId],
    service: services,
    robotTokenId: resolvedTokenId !== undefined ? String(resolvedTokenId) : undefined,
    robotNftAddress:
      resolvedNftAddress !== undefined
        ? ethers.getAddress(resolvedNftAddress).toLowerCase()
        : undefined,
    chainId: resolvedChainId !== undefined ? String(resolvedChainId) : undefined,
    active,
  };
}

module.exports = {
  CONSUMPTION_LIMITED,
  CONSUMPTION_UNLIMITED,
  DID_METHOD_PREFIX,
  REGISTER_CHALLENGE_TYPE,
  ROBOT_DID_PREFIX,
  UZHETH_CHAIN_ID,
  VERIFICATION_METHOD_TYPE,
  addressFromDid,
  blockchainAccountId,
  buildDidDocument,
  buildRegisterChallengeDigest,
  buildRegisterChallengePayload,
  canonicalize,
  chainIdFromRobotDid,
  credentialIssuedAtSeconds,
  credentialStatusHash,
  didFromAddress,
  didFromRobotTokenId,
  isAddressDid,
  isRobotDid,
  isRobotKeyAuthorizedAt,
  nftAddressFromRobotDid,
  parseRobotDid,
  publicKeyToAddress,
  robotDidFromRegistry,
  signRegisterChallenge,
  tokenIdFromRobotDid,
  validateRobotDid,
  verificationMethodId,
};
