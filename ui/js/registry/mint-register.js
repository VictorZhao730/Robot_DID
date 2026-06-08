function getRobotRegistrationMinterPrivateKey() {
  return document.getElementById("robotRegistrationMinterPrivateKey").value.trim();
}

async function resolveRobotNftOwnerAddress(connectedAddress) {
  const raw = document.getElementById("robotNftOwnerAddress").value.trim();
  if (!raw) {
    document.getElementById("robotNftOwnerAddress").value = connectedAddress;
    return ethers.getAddress(connectedAddress);
  }

  const ownerAddress = ethers.getAddress(raw);
  if (ownerAddress.toLowerCase() !== connectedAddress.toLowerCase()) {
    throw new Error(
      `MetaMask must be NFT owner ${ownerAddress} (connected: ${connectedAddress})`
    );
  }
  return ownerAddress;
}

async function mintAndRegisterRobot({ onStepUpdate } = {}) {
  const robotIdentity = getCreateRobotWallet();
  const minterPrivateKey = getRobotRegistrationMinterPrivateKey();

  function step(id, status, detail) {
    onStepUpdate?.({ id, status, detail });
  }

  step("connectOwner", "active");
  const registerSigner = await connectAdminWallet();
  const connectedAddress = await registerSigner.getAddress();
  const ownerAddress = await resolveRobotNftOwnerAddress(connectedAddress);
  step("connectOwner", "done", {
    connectedAddress,
    nftOwner: ownerAddress,
  });

  let mintSigner;
  let mintGasPaidBy;
  step("mintNft", "active", minterPrivateKey ? "Using minter private key" : "Using MetaMask as minter");
  if (minterPrivateKey) {
    mintSigner = await connectPrivateKeyWallet(minterPrivateKey);
    if (!(await accountHasMinterRole(mintSigner))) {
      throw new Error("Minter private key account lacks MINTER_ROLE");
    }
    mintGasPaidBy = "Minter (private key)";
  } else {
    mintSigner = registerSigner;
    if (!(await accountHasMinterRole(mintSigner))) {
      throw new Error(
        "MetaMask account lacks MINTER_ROLE. Enter minter private key if minter is a different account."
      );
    }
    mintGasPaidBy = "Owner/minter (MetaMask)";
  }

  const mintResult = await mintRobotNftToOwner(ownerAddress, mintSigner);
  const robotTokenId = mintResult.robotTokenId;
  const minterAddress = mintResult.minter;
  step("mintNft", "done", {
    robotTokenId: robotTokenId.toString(),
    mintTransactionHash: mintResult.mintTransactionHash,
    gasPaidBy: mintGasPaidBy,
  });

  const registerResult = await registerRobotDidForToken(
    robotTokenId,
    robotIdentity,
    registerSigner,
    { onStepUpdate: step }
  );

  return {
    result: "Robot NFT minted and DID registered successfully",
    gasPaidBy: {
      mint: mintGasPaidBy,
      register: "Owner (MetaMask)",
    },
    minter: minterAddress,
    nftOwner: ownerAddress,
    separateMinter: minterAddress.toLowerCase() !== ownerAddress.toLowerCase(),
    robotTokenId: robotTokenId.toString(),
    mintTransactionHash: mintResult.mintTransactionHash,
    registerTransactionHash: registerResult.registerTransactionHash,
    registerChallenge: registerResult.registerChallenge,
    did: registerResult.did,
    robotDeviceAddress: registerResult.robotDeviceAddress,
    registryRecord: registerResult.registryRecord,
    didResolution: registerResult.didResolution,
  };
}

async function mintRobotNftToOwner(ownerAddress, signer) {
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  if (!registryAddress) {
    throw new Error("Registry address is required");
  }

  const minterAddress = await signer.getAddress();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const robotNFT = await getRobotNftContract(signer);

  if (!(await accountHasMinterRole(signer))) {
    throw new Error("Mint signer lacks MINTER_ROLE on RobotIdentityNFT");
  }

  const metadataURI = "";
  const mintTx = await robotNFT.mintRobot(ownerAddress, metadataURI);
  const receipt = await mintTx.wait();
  const robotTokenId = parseRobotTokenId(robotNFT, receipt);

  return {
    minter: minterAddress,
    nftOwner: ownerAddress,
    robotTokenId,
    robotNFT,
    registry,
    mintTransactionHash: receipt.hash,
  };
}

async function registerRobotDidForToken(robotTokenId, robotIdentity, signer, { onStepUpdate } = {}) {
  function step(id, status, detail) {
    onStepUpdate?.(id, status, detail);
  }
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  if (!registryAddress) {
    throw new Error("Registry address is required");
  }

  const ownerAddress = await signer.getAddress();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const robotNFTAddress = await registry.robotIdentityNFT();
  const robotNFT = new ethers.Contract(robotNFTAddress, robotNftAbi, signer);
  const nftOwner = await robotNFT.ownerOf(robotTokenId);

  if (nftOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error(
      `Connected MetaMask (${ownerAddress}) is not the NFT owner (${nftOwner}) for token #${robotTokenId}. Switch to ${nftOwner}.`
    );
  }

  const activeDid = await registry.activeDIDForRobotToken(robotTokenId);
  if (activeDid && activeDid.length > 0) {
    throw new Error(`Robot NFT #${robotTokenId} already has active DID: ${activeDid}`);
  }

  const did = await registry.robotDidForToken(robotTokenId);
  const publicKey = robotIdentity.wallet.signingKey.publicKey;
  const robotKeyAddress = robotIdentity.address;
  if (await registry.isUsedRobotKey(robotKeyAddress)) {
    throw new Error("Robot key already used by another robot");
  }

  step("challengeBuild", "active");
  const challengePayload = buildRegisterChallengePayload(did, publicKey, robotKeyAddress);
  step("challengeBuild", "done", challengePayload);

  step("challengeSign", "active");
  const digest = buildRegisterChallengeDigest(did, publicKey, robotKeyAddress);
  const challenge = await signRegisterChallenge(
    robotIdentity.wallet,
    did,
    publicKey,
    robotKeyAddress
  );
  step("challengeSign", "done", {
    digest,
    signature: challenge.signature,
  });

  step("challengeVerify", "active");
  const onChainDid = await registry.robotDidForToken(robotTokenId);
  const onChainDigest = buildRegisterChallengeDigest(
    onChainDid,
    publicKey,
    robotKeyAddress
  );
  const onChainRecovered = ethers.verifyMessage(
    ethers.getBytes(onChainDigest),
    challenge.signature
  );
  const onChainSignatureValid =
    onChainRecovered.toLowerCase() === robotKeyAddress.toLowerCase();

  step("challengeVerify", "done", {
    recovered: challenge.recovered,
    signatureValid: challenge.signatureValid,
    onChainDid,
    onChainSignatureValid,
  });

  if (!challenge.signatureValid) {
    throw new Error("Register challenge signature does not match robot key address");
  }

  if (did !== onChainDid) {
    throw new Error(
      `DID mismatch: challenge used "${did}" but registry expects "${onChainDid}". Hard-refresh the page (Ctrl+Shift+R) and retry.`
    );
  }

  if (!onChainSignatureValid) {
    throw new Error(
      `Signature is not valid for on-chain DID "${onChainDid}". ` +
        "Hard-refresh the page (Ctrl+Shift+R) to load the latest UI, generate a new robot wallet, mint again, and register."
    );
  }

  const metadataURI = "";
  step("registerDid", "active", {
    did,
    robotKeyAddress,
    note: "NFT owner pays gas",
  });

  const registerTx = await registry.registerDID(
    publicKey,
    robotKeyAddress,
    metadataURI,
    robotTokenId,
    challenge.signature
  );
  const receipt = await registerTx.wait();
  step("registerDid", "done", {
    did,
    registerTransactionHash: receipt.hash,
  });
  document.getElementById("did").value = did;
  document.getElementById("generatedRobotDid").value = did;

  const record = await getRegistryRecord();

  return {
    did,
    robotDeviceAddress: robotIdentity.address,
    nftOwner: ownerAddress,
    robotTokenId: robotTokenId.toString(),
    registerTransactionHash: receipt.hash,
    registerChallenge: challenge,
    registryRecord: record,
    didResolution: buildDidResolution(did, record),
  };
}

function parseRobotTokenId(robotNFT, receipt) {
  for (const log of receipt.logs) {
    try {
      const parsedLog = robotNFT.interface.parseLog(log);
      if (parsedLog && parsedLog.name === "RobotMinted") {
        return parsedLog.args.tokenId;
      }
    } catch (_error) {
      // Ignore logs from other contracts.
    }
  }

  throw new Error("RobotMinted event not found");
}
