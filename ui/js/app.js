document.querySelectorAll("[data-close-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    hidePanel(button.dataset.closePanel);
  });
});

document.getElementById("robotsOutput").addEventListener("click", (event) => {
  const card = event.target.closest(".robot-card");
  if (!card) {
    return;
  }
  const robot = getVisibleRobotByTokenId(card.dataset.tokenId);
  if (robot) {
    toggleRobotSelection(robot);
  }
});

document.getElementById("robotsOutput").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const card = event.target.closest(".robot-card");
  if (!card) {
    return;
  }
  event.preventDefault();
  const robot = getVisibleRobotByTokenId(card.dataset.tokenId);
  if (robot) {
    toggleRobotSelection(robot);
  }
});

addTextFieldControls();
initQueryPanelToggles();
bindAnchorGasModePanels();
bindConsumptionLimitedPanels();

document.getElementById("checkMinterRole").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await checkMinterRole())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("grantMinterRole").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await grantMinterRole())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("revokeMinterRole").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await revokeMinterRole())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("checkIssuerRegistryAdmin").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await checkIssuerRegistryAdmin())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("grantIssuerRegistryAdmin").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await grantIssuerRegistryAdmin())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("checkIssuerRole").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await checkIssuerRole())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("grantIssuerRole").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await grantIssuerRole())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("registerIssuerDid").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await registerIssuerDid())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("revokeIssuerDid").addEventListener("click", async () => {
  try {
    setPanelOutput(
      "registryPanel",
      "registryOutput",
      stringifyForDisplay(await revokeIssuerDid())
    );
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("showRoleMatrix").addEventListener("click", async () => {
  try {
    await showRoleMatrix();
  } catch (error) {
    setPanelOutput("matrixPanel", "matrixOutput", `INVALID: ${error.message}`);
    showPanel("matrixPanel");
  }
});

document.getElementById("addDidController").addEventListener("click", async () => {
  try {
    await updateDidController("add");
  } catch (error) {
    setControllerOutput(`INVALID: ${error.message}`);
  }
});

document
  .getElementById("updateDidControllerPermissions")
  .addEventListener("click", async () => {
    try {
      await updateDidController("update");
    } catch (error) {
      setControllerOutput(`INVALID: ${error.message}`);
    }
  });

document.getElementById("showPermissionMatrix").addEventListener("click", async () => {
  try {
    await showPermissionMatrix();
  } catch (error) {
    setPanelOutput("matrixPanel", "matrixOutput", `INVALID: ${error.message}`);
    showPanel("matrixPanel");
  }
});

document.getElementById("removeDidController").addEventListener("click", async () => {
  try {
    await updateDidController("remove");
  } catch (error) {
    setControllerOutput(`INVALID: ${error.message}`);
  }
});

document.getElementById("issueSelfSignedCredential").addEventListener("click", async () => {
  try {
    await issueSelfSignedCredentialForSelectedRobot();
  } catch (error) {
    setCredentialIssuanceMessage(
      ISSUANCE_MODEL.ROBOT_SELF_SIGNED,
      `INVALID: ${error.message}`
    );
  }
});

document.getElementById("issueControllerDelegatedCredential").addEventListener("click", async () => {
  try {
    await issueControllerDelegatedCredentialForSelectedRobot();
  } catch (error) {
    setCredentialIssuanceMessage(
      ISSUANCE_MODEL.CONTROLLER_DELEGATED,
      `INVALID: ${error.message}`
    );
  }
});

document.getElementById("issueCredential").addEventListener("click", async () => {
  try {
    await issueCredentialForSelectedRobot();
  } catch (error) {
    setCredentialIssuanceMessage(
      ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED,
      `INVALID: ${error.message}`
    );
  }
});

document.getElementById("generateRotationKey").addEventListener("click", () => {
  const wallet = ethers.Wallet.createRandom();
  document.getElementById("rotatedRobotPrivateKey").value = wallet.privateKey;
  setControllerOutput(
    stringifyForDisplay({
      result: "New rotation key generated",
      newRotationKeyAddress: wallet.address,
      newPublicKey: wallet.signingKey.publicKey,
    })
  );
});

document.getElementById("rotateSelectedRobotKey").addEventListener("click", async () => {
  try {
    await rotateSelectedRobotKey();
  } catch (error) {
    setControllerOutput(`INVALID: ${error.message}`);
  }
});

document.getElementById("generateRobotWallet").addEventListener("click", () => {
  generatedRobotWallet = ethers.Wallet.createRandom();

  document.getElementById("generatedRobotAddress").value = generatedRobotWallet.address;
  document.getElementById("generatedRobotPrivateKey").value =
    generatedRobotWallet.privateKey;
  document.getElementById("generatedRobotDid").value =
    selectedRobot?.activeDID ||
    (selectedRobot?.tokenId
      ? selectedRobot.activeDID
      : "Assigned after NFT registration (did:uzheth:robot:<chainId>:0x<nft>:<tokenId>)");
  if (selectedRobot?.activeDID) {
    document.getElementById("did").value = selectedRobot.activeDID;
  }
  renderRobotSummary();
});

document.getElementById("generatedRobotPrivateKey").addEventListener("change", () => {
  try {
    getCreateRobotWallet();
    renderRobotSummary();
  } catch (error) {
    document.getElementById("registrationOutput").textContent =
      `INVALID: ${error.message}`;
  }
});

document.getElementById("clearMintRegisterProgress").addEventListener("click", () => {
  clearMintRegisterProgress();
});

document.getElementById("mintAndRegisterRobot").addEventListener("click", async () => {
  const outputEl = document.getElementById("robotRegistrationOutput");
  resetMintRegisterSteps();
  outputEl.textContent = "Running mint + register flow...";
  try {
    const output = await mintAndRegisterRobot({
      onStepUpdate: ({ id, status }) => updateMintRegisterStep(id, { status }),
    });
    outputEl.textContent = stringifyForDisplay(output);
    renderRobotSummary({
      tokenId: output.robotTokenId,
      owner: output.nftOwner,
    });
    setPanelOutput("registryPanel", "registryOutput", output.registryRecord);
    setPanelOutput("didDocumentPanel", "didDocumentOutput", output.didResolution);
    await loadRobotsBrowser();
  } catch (error) {
    markMintRegisterStepError();
    outputEl.textContent = `INVALID: ${error.message}`;
  }
});

document.getElementById("checkDid").addEventListener("click", async () => {
  try {
    await lookupAndRenderDid(document.getElementById("did").value);
  } catch (error) {
    setPanelOutput("registryPanel", "registryOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("showRobots").addEventListener("click", async () => {
  try {
    if (robotsBrowserVisible) {
      resetRobotsBrowser();
      return;
    }
    await loadRobotsBrowser();
  } catch (error) {
    robotsBrowserVisible = false;
    updateShowRobotsButtonLabel();
    document.getElementById("robotsSummary").textContent = `INVALID: ${error.message}`;
    document.getElementById("robotsOutput").innerHTML = "";
  }
});

document.getElementById("hideDeactivatedRobots").addEventListener("change", () => {
  if (lastRobotsResult && robotsBrowserVisible) {
    renderRobots(lastRobotsResult);
  }
});

document.getElementById("showSelectedRobotDid").addEventListener("click", async () => {
  try {
    if (!selectedRobot) {
      throw new Error("Click a robot NFT avatar first");
    }

    if (!selectedRobot.activeDID) {
      throw new Error("Selected robot has no active DID");
    }

    await lookupAndRenderDid(selectedRobot.activeDID);
    document.getElementById("robotDetailsOutput").textContent =
      stringifyForDisplay({
        selected: true,
        didDetailsLoaded: true,
        ...displayRobot(selectedRobot),
      });
  } catch (error) {
    document.getElementById("robotDetailsOutput").textContent =
      `INVALID: ${error.message}`;
  }
});

document.getElementById("showSelectedRobotTimeline").addEventListener("click", async () => {
  try {
    setPanelOutput("timelinePanel", "timelineOutput", "Loading on-chain timeline...");
    setPanelOutput("timelinePanel", "timelineOutput", await getSelectedRobotTimeline());
  } catch (error) {
    setPanelOutput("timelinePanel", "timelineOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("transferSelectedRobotNft").addEventListener("click", async () => {
  try {
    const output = await transferSelectedRobotNft();
    setControllerOutput(stringifyForDisplay(output));
    await loadRobotsBrowser();
  } catch (error) {
    setControllerOutput(`INVALID: ${error.message}`);
  }
});

document.getElementById("suspendSelectedRobot").addEventListener("click", async () => {
  try {
    if (!selectedRobot?.activeDID) {
      throw new Error("Select an active robot first");
    }
    document.getElementById("did").value = selectedRobot.activeDID;
    const output = await suspendSelectedRobotDID();
    setControllerOutput(stringifyForDisplay(output));
    setPanelOutput("registryPanel", "registryOutput", output.registryRecord);
    await loadRobotsBrowser();
  } catch (error) {
    setControllerOutput(`INVALID: ${error.message}`);
  }
});

document.getElementById("unsuspendSelectedRobot").addEventListener("click", async () => {
  try {
    if (!selectedRobot?.activeDID) {
      throw new Error("Select an active robot first");
    }
    document.getElementById("did").value = selectedRobot.activeDID;
    const output = await unsuspendSelectedRobotDID();
    setControllerOutput(stringifyForDisplay(output));
    setPanelOutput("registryPanel", "registryOutput", output.registryRecord);
    await loadRobotsBrowser();
  } catch (error) {
    setControllerOutput(`INVALID: ${error.message}`);
  }
});

document.getElementById("revokeSelectedRobot").addEventListener("click", async () => {
  try {
    if (!selectedRobot) {
      throw new Error("Click a robot NFT avatar first");
    }

    if (!selectedRobot.activeDID) {
      throw new Error("Selected robot has no active DID to revoke");
    }

    const registryAddress =
      document.getElementById("registryAddress").value || demoValues.registryAddress;

    document.getElementById("robotDetailsOutput").textContent =
      "Connecting MetaMask for DID revocation...";
    const signer = await connectAdminWallet();
    const registry = new ethers.Contract(registryAddress, registryAbi, signer);
    const revokeTx = await registry.revokeDID(selectedRobot.activeDID);

    document.getElementById("robotDetailsOutput").textContent =
      "Waiting for revoke transaction confirmation...";
    const revokeReceipt = await revokeTx.wait();
    const revokedDID = selectedRobot.activeDID;

    selectedRobot = {
      ...selectedRobot,
      activeDID: null,
      revokeTransaction: revokeReceipt.hash,
    };

    document.getElementById("robotDetailsOutput").textContent = stringifyForDisplay({
      result: "DID revoked permanently — all VCs now invalid",
      revokedDID,
      robotTokenId: selectedRobot.tokenId,
      revokeTransaction: revokeReceipt.hash,
    });

    await refreshSelectedRobotAfterRevoke(revokedDID);
    const result = await listRobots();
    renderRobots(result);
  } catch (error) {
    document.getElementById("robotDetailsOutput").textContent =
      `INVALID: ${error.message}`;
  }
});

document.getElementById("verifyCredential").addEventListener("click", async () => {
  try {
    await verifyCredentialObject(await readCredentialInput());
  } catch (error) {
    document.getElementById("verificationStatus").textContent = `INVALID: ${error.message}`;
    setPanelOutput("verificationPanel", "verificationOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("revokeCredential").addEventListener("click", async () => {
  try {
    await revokeCredentialFromInput();
  } catch (error) {
    document.getElementById("verificationStatus").textContent = `INVALID: ${error.message}`;
    setPanelOutput("verificationPanel", "verificationOutput", `INVALID: ${error.message}`);
  }
});

document.getElementById("verifyAndConsumeCredential").addEventListener("click", async () => {
  try {
    await verifyAndConsumeCredentialFromInput();
  } catch (error) {
    document.getElementById("verificationStatus").textContent = `INVALID: ${error.message}`;
    setPanelOutput("verificationPanel", "verificationOutput", `INVALID: ${error.message}`);
  }
});
