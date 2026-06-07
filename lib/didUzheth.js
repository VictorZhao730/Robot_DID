const { ethers } = require("ethers");

const DID_METHOD_PREFIX = "did:uzheth:";
const ROBOT_DID_PREFIX = `${DID_METHOD_PREFIX}robot:`;
const UZHETH_CHAIN_ID = 70207;
const KEY_FRAGMENT = "#keys-1";
const VERIFICATION_METHOD_TYPE = "EcdsaSecp256k1RecoveryMethod2020";
const REGISTER_CHALLENGE_TYPE = "RegisterRobotKey";

const CONSUMPTION_UNLIMITED = 0;
const CONSUMPTION_LIMITED = 1;

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

function didFromRobotTokenId(tokenId) {
  return `${ROBOT_DID_PREFIX}${String(tokenId)}`;
}

function tokenIdFromRobotDid(did) {
  if (!isRobotDid(did)) {
    throw new Error("Expected robot DID format did:uzheth:robot:<tokenId>");
  }
  const tokenId = did.slice(ROBOT_DID_PREFIX.length);
  if (!/^\d+$/.test(tokenId)) {
    throw new Error("Invalid robot token ID in DID");
  }
  if (tokenId.length > 1 && tokenId.startsWith("0")) {
    throw new Error("Robot DID token ID must be canonical decimal form");
  }
  return tokenId;
}

function validateRobotDid(did) {
  if (!isRobotDid(did)) {
    throw new Error("Expected robot DID format did:uzheth:robot:<tokenId>");
  }
  tokenIdFromRobotDid(did);
  return did;
}

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
  active = true,
  chainId = UZHETH_CHAIN_ID,
  controllers,
}) {
  const methodId = verificationMethodId(did);
  const signingAddress = publicKeyToAddress(publicKey);
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

  if (robotTokenId !== undefined) {
    services.push({
      id: `${did}#robot-asset`,
      type: "RobotIdentityNFT",
      serviceEndpoint: `eip155:${chainId}/erc721/${robotTokenId.toString()}`,
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
        blockchainAccountId: blockchainAccountId(signingAddress, chainId),
        publicKeyHex: publicKey,
      },
    ],
    authentication: [methodId],
    assertionMethod: [methodId],
    capabilityInvocation: [methodId],
    service: services,
    robotTokenId: robotTokenId !== undefined ? robotTokenId.toString() : undefined,
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
  credentialIssuedAtSeconds,
  credentialStatusHash,
  didFromAddress,
  didFromRobotTokenId,
  isAddressDid,
  isRobotDid,
  isRobotKeyAuthorizedAt,
  publicKeyToAddress,
  signRegisterChallenge,
  tokenIdFromRobotDid,
  validateRobotDid,
  verificationMethodId,
};
