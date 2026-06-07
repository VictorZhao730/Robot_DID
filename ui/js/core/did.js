function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
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

function addressFromDid(did) {
  if (!isAddressDid(did)) {
    throw new Error("Expected address-based DID format did:uzheth:0x...");
  }
  return ethers.getAddress(did.slice(DID_METHOD_PREFIX.length));
}

function didFromAddress(address) {
  return `${DID_METHOD_PREFIX}${ethers.getAddress(address)}`;
}

function didFromRobotTokenId(tokenId) {
  return `${ROBOT_DID_PREFIX}${String(tokenId)}`;
}

const REGISTER_CHALLENGE_TYPE = "RegisterRobotKey";

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

function publicKeyToAddress(publicKey) {
  return ethers.computeAddress(publicKey);
}

function verificationMethodId(did) {
  return `${did}#keys-1`;
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

function buildDidDocument(did, record) {
  const methodId = verificationMethodId(did);
  const robotTokenId = record.robotTokenId.toString();
  const signingAddress = publicKeyToAddress(record.publicKey);
  const controllers =
    record.controllers && record.controllers.length > 0
      ? record.controllers.map((controller) => didFromAddress(controller))
      : [did];
  const services = [];

  if (record.metadataURI) {
    services.push({
      id: `${did}#metadata`,
      type: "RobotMetadata",
      serviceEndpoint: record.metadataURI,
    });
  }

  services.push({
    id: `${did}#robot-asset`,
    type: "RobotIdentityNFT",
    serviceEndpoint: `eip155:${UZHETH_CHAIN_ID}/erc721/${robotTokenId}`,
  });

  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
    ],
    id: did,
    controller: controllers,
    verificationMethod: [
      {
        id: methodId,
        type: "EcdsaSecp256k1RecoveryMethod2020",
        controller: did,
        blockchainAccountId: `eip155:${UZHETH_CHAIN_ID}:${signingAddress}`,
        publicKeyHex: record.publicKey,
      },
    ],
    authentication: [methodId],
    assertionMethod: [methodId],
    capabilityInvocation: [methodId],
    service: services,
    robotTokenId,
    active: record.active,
  };
}

function buildDidResolution(did, record) {
  return {
    resolver: "did:uzheth resolver",
    did,
    resolutionMetadata: {
      contentType: "application/did+json",
      retrievedFrom: "RobotDIDRegistry smart contract",
      registryAddress: document.getElementById("registryAddress").value,
      chainId: UZHETH_CHAIN_ID,
    },
    didDocument: buildDidDocument(did, record),
    didDocumentMetadata: {
      active: record.active,
      suspended: record.suspended,
      suspendedAt: record.suspendedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      robotTokenId: record.robotTokenId.toString(),
      controller: record.owner,
    },
  };
}

