function selectedControllerPermissions() {
  let permissions = 0;
  if (document.getElementById("controllerCanRotateKey").checked) {
    permissions |= controllerPermissions.keyRotation;
  }
  if (document.getElementById("controllerCanRevokeCredential").checked) {
    permissions |= controllerPermissions.credentialRevocation;
  }
  if (document.getElementById("controllerCanAssert").checked) {
    permissions |= controllerPermissions.assertion;
  }
  if (permissions === 0) {
    throw new Error("Select at least one controller permission");
  }

  return permissions;
}

function hasControllerPermission(permissions, permission) {
  return (Number(permissions) & permission) !== 0;
}

async function rotateSelectedRobotKey() {
  if (!selectedRobot) {
    throw new Error("Click a robot NFT avatar first");
  }
  if (!selectedRobot.activeDID) {
    throw new Error("Selected robot has no active DID");
  }

  const newPrivateKey = document.getElementById("rotatedRobotPrivateKey").value.trim();
  if (!newPrivateKey) {
    throw new Error("Enter or generate a new rotation private key");
  }

  const newWallet = new ethers.Wallet(newPrivateKey);
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const signer = await connectAdminWallet();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  if (await registry.isUsedRobotKey(newWallet.address)) {
    throw new Error("Rotation key already used by another robot");
  }
  const tx = await registry.updatePublicKey(
    selectedRobot.activeDID,
    newWallet.signingKey.publicKey,
    newWallet.address
  );
  const receipt = await tx.wait();

  document.getElementById("selfSignedRobotPrivateKey").value = newPrivateKey;
  document.getElementById("did").value = selectedRobot.activeDID;
  const record = await getRegistryRecord();
  const didResolution = buildDidResolution(selectedRobot.activeDID, record);

  const output = {
    result: "Robot key rotated successfully",
    did: selectedRobot.activeDID,
    newKeyAddress: newWallet.address,
    newPublicKey: newWallet.signingKey.publicKey,
    updateTransaction: receipt.hash,
  };

  setControllerOutput(stringifyForDisplay(output));
  setPanelOutput("registryPanel", "registryOutput", record);
  setPanelOutput(
    "didDocumentPanel",
    "didDocumentOutput",
    didResolution
  );
}

async function updateDidController(action) {
  if (!selectedRobot) {
    throw new Error("Click a robot NFT avatar first");
  }
  if (!selectedRobot.activeDID) {
    throw new Error("Selected robot has no active DID");
  }

  const controller = ethers.getAddress(
    document.getElementById("controllerAddress").value.trim()
  );
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const signer = await connectAdminWallet();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  let tx;
  if (action === "add") {
    tx = await registry["addController(string,address,uint256)"](
      selectedRobot.activeDID,
      controller,
      selectedControllerPermissions()
    );
  } else if (action === "update") {
    tx = await registry.updateControllerPermissions(
      selectedRobot.activeDID,
      controller,
      selectedControllerPermissions()
    );
  } else {
    tx = await registry.removeController(selectedRobot.activeDID, controller);
  }
  const receipt = await tx.wait();

  document.getElementById("did").value = selectedRobot.activeDID;
  const record = await getRegistryRecord();
  const output = {
    result:
      action === "add"
        ? "DID controller added"
        : action === "update"
          ? "DID controller permissions updated"
          : "DID controller removed",
    did: selectedRobot.activeDID,
    controller,
    controllers: record.controllers,
    controllerDetails: record.controllerDetails,
    transactionHash: receipt.hash,
  };

  setControllerOutput(stringifyForDisplay(output));
  setPanelOutput("registryPanel", "registryOutput", record);
  setPanelOutput(
    "didDocumentPanel",
    "didDocumentOutput",
    buildDidResolution(selectedRobot.activeDID, record)
  );
}
