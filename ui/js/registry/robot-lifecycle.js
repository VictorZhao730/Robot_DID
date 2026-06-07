async function refreshSelectedRobotAfterRevoke(did) {
  try {
    document.getElementById("did").value = did;
    const record = await getRegistryRecord();
    setPanelOutput("registryPanel", "registryOutput", record);
    setPanelOutput(
      "didDocumentPanel",
      "didDocumentOutput",
      buildDidResolution(did, record)
    );
  } catch (error) {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      `DID revoked or unavailable: ${error.message}`
    );
    setPanelOutput(
      "didDocumentPanel",
      "didDocumentOutput",
      "DID resolution unavailable: DID is no longer active after revocation."
    );
  }
}

async function transferSelectedRobotNft() {
  if (!selectedRobot?.tokenId) {
    throw new Error("Select a robot in Robots Browser first");
  }

  const toAddress = ethers.getAddress(
    document.getElementById("robotNftTransferAddress").value.trim()
  );
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  if (!registryAddress) {
    throw new Error("Registry address is required");
  }

  const signer = await connectAdminWallet();
  const fromAddress = await signer.getAddress();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const robotNFTAddress = await registry.robotIdentityNFT();
  const robotNFT = new ethers.Contract(robotNFTAddress, robotNftAbi, signer);
  const tokenId = BigInt(selectedRobot.tokenId);
  const currentOwner = await robotNFT.ownerOf(tokenId);

  if (currentOwner.toLowerCase() !== fromAddress.toLowerCase()) {
    throw new Error(
      `Connected MetaMask (${fromAddress}) is not the current NFT owner (${currentOwner})`
    );
  }

  const tx = await robotNFT.safeTransferFrom(fromAddress, toAddress, tokenId);
  const receipt = await tx.wait();

  return {
    result: "Robot NFT transferred successfully",
    tokenId: tokenId.toString(),
    from: fromAddress,
    to: toAddress,
    activeDID: selectedRobot.activeDID || null,
    note: "DID management rights now follow the NFT owner automatically.",
    transferTransactionHash: receipt.hash,
  };
}

async function suspendSelectedRobotDID() {
  if (!selectedRobot?.activeDID) {
    throw new Error("Select an active robot first");
  }

  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const signer = await connectAdminWallet();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const tx = await registry.suspendDID(selectedRobot.activeDID);
  const receipt = await tx.wait();
  const record = await getRegistryRecord();

  return {
    result: "Robot DID suspended — historical VCs remain valid; new issuance blocked",
    did: selectedRobot.activeDID,
    suspendedAt: record.suspendedAt,
    transactionHash: receipt.hash,
    registryRecord: record,
  };
}

async function unsuspendSelectedRobotDID() {
  if (!selectedRobot?.activeDID) {
    throw new Error("Select an active robot first");
  }

  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const signer = await connectAdminWallet();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const tx = await registry.unsuspendDID(selectedRobot.activeDID);
  const receipt = await tx.wait();
  const record = await getRegistryRecord();

  return {
    result: "Robot DID unsuspended — new issuance allowed again",
    did: selectedRobot.activeDID,
    transactionHash: receipt.hash,
    registryRecord: record,
  };
}

async function anchorCredentialOnChain({
  subjectDid,
  credentialHash,
  credentialType = "",
  gasMode,
  actorPrivateKey = null,
  ownerPrivateKey = null,
  consumptionMode = CONSUMPTION_UNLIMITED,
  maxUses = 0,
}) {
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  let signer;

  if (gasMode === "owner") {
    if (ownerPrivateKey) {
      if (!window.ethereum) {
        throw new Error("MetaMask is required to submit owner anchor transactions");
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      signer = new ethers.Wallet(ownerPrivateKey, provider);
    } else {
      signer = await connectAdminWallet();
    }
  } else if (actorPrivateKey) {
    if (!window.ethereum) {
      throw new Error("MetaMask is required for actor gas payment");
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    signer = new ethers.Wallet(actorPrivateKey, provider);
  } else {
    signer = await connectAdminWallet();
  }

  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const tx = await registry.anchorCredential(
    subjectDid,
    credentialHash,
    credentialType,
    consumptionMode,
    maxUses
  );
  return tx.wait();
}

async function consumeCredentialOnChain(credentialHash) {
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const signer = await connectAdminWallet();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const tx = await registry.consumeCredential(credentialHash);
  const receipt = await tx.wait();
  const record = await registry.getConsumptionRecord(credentialHash);
  return {
    transactionHash: receipt.hash,
    credentialHash,
    mode: Number(record.mode),
    maxUses: record.maxUses.toString(),
    useCount: record.useCount.toString(),
    available: await registry.isConsumptionAvailable(credentialHash),
  };
}
