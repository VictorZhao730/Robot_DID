const CREDENTIAL_ISSUANCE_OUTPUTS = {
  [ISSUANCE_MODEL.ROBOT_SELF_SIGNED]: "selfSignedCredentialOutput",
  [ISSUANCE_MODEL.CONTROLLER_DELEGATED]: "controllerDelegatedCredentialOutput",
  [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED]: "externalIssuerCredentialOutput",
};

const CREDENTIAL_OUTPUT_PLACEHOLDER = "Generated credential will appear here.";

function credentialOutputElementId(issuanceModel) {
  return (
    CREDENTIAL_ISSUANCE_OUTPUTS[issuanceModel] || "externalIssuerCredentialOutput"
  );
}

function setCredentialIssuanceMessage(issuanceModel, message) {
  Object.entries(CREDENTIAL_ISSUANCE_OUTPUTS).forEach(([model, elementId]) => {
    document.getElementById(elementId).textContent =
      model === issuanceModel
        ? message
        : CREDENTIAL_OUTPUT_PLACEHOLDER;
  });
}

function writeCredentialOutput(credential, issuanceModel) {
  const policy = getCredentialPolicy(getPrimaryCredentialType(credential));
  const resolvedModel =
    issuanceModel || detectIssuanceModel(credential, policy) || ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED;
  const json = stringifyForDisplay(credential);
  const targetId = credentialOutputElementId(resolvedModel);

  Object.values(CREDENTIAL_ISSUANCE_OUTPUTS).forEach((elementId) => {
    document.getElementById(elementId).textContent =
      elementId === targetId ? json : CREDENTIAL_OUTPUT_PLACEHOLDER;
  });
  document.getElementById("credentialText").value = json;
}

const ANCHOR_CONSUMPTION_INPUTS = {
  [ISSUANCE_MODEL.ROBOT_SELF_SIGNED]: {
    mode: "selfSignedConsumptionMode",
    maxUses: "selfSignedConsumptionMaxUses",
  },
  [ISSUANCE_MODEL.CONTROLLER_DELEGATED]: {
    mode: "controllerDelegatedConsumptionMode",
    maxUses: "controllerDelegatedConsumptionMaxUses",
  },
  [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED]: {
    mode: "externalIssuerConsumptionMode",
    maxUses: "externalIssuerConsumptionMaxUses",
  },
};

function getAnchorConsumptionOptions(issuanceModel) {
  const config = ANCHOR_CONSUMPTION_INPUTS[issuanceModel];
  if (!config) {
    return { consumptionMode: CONSUMPTION_UNLIMITED, maxUses: 0 };
  }

  const consumptionMode = Number(document.getElementById(config.mode)?.value || CONSUMPTION_UNLIMITED);
  const maxUses = Number(document.getElementById(config.maxUses)?.value || 1);
  if (consumptionMode === CONSUMPTION_LIMITED && (!Number.isFinite(maxUses) || maxUses < 1)) {
    throw new Error("Limited consumption requires maxUses >= 1");
  }

  return {
    consumptionMode,
    maxUses: consumptionMode === CONSUMPTION_LIMITED ? maxUses : 0,
  };
}

function consumptionModeLabel(mode, maxUses = 0) {
  if (Number(mode) === CONSUMPTION_LIMITED) {
    const uses = Number(maxUses);
    return uses === 1 ? "limited (single-use)" : `limited (${uses} uses)`;
  }
  return "unlimited";
}

async function fetchConsumptionStatus(registry, credentialHash, credentialHashMatchesContent) {
  if (!credentialHashMatchesContent || !credentialHash) {
    return null;
  }

  const [record, available] = await Promise.all([
    registry.getConsumptionRecord(credentialHash),
    registry.isConsumptionAvailable(credentialHash),
  ]);

  if (!record.configured) {
    return {
      configured: false,
      mode: CONSUMPTION_UNLIMITED,
      modeLabel: consumptionModeLabel(CONSUMPTION_UNLIMITED),
      maxUses: "0",
      useCount: "0",
      available: true,
    };
  }

  return {
    configured: true,
    mode: Number(record.mode),
    modeLabel: consumptionModeLabel(record.mode, record.maxUses),
    maxUses: record.maxUses.toString(),
    useCount: record.useCount.toString(),
    available,
  };
}
const ANCHOR_GAS_MODE_INPUTS = {
  [ISSUANCE_MODEL.ROBOT_SELF_SIGNED]: "selfSignedAnchorGasMode",
  [ISSUANCE_MODEL.CONTROLLER_DELEGATED]: "controllerDelegatedAnchorGasMode",
  [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED]: "externalIssuerAnchorGasMode",
};

const ANCHOR_OWNER_PRIVATE_KEY_INPUTS = {
  [ISSUANCE_MODEL.ROBOT_SELF_SIGNED]: "selfSignedAnchorOwnerPrivateKey",
  [ISSUANCE_MODEL.CONTROLLER_DELEGATED]: "controllerDelegatedAnchorOwnerPrivateKey",
  [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED]: "externalIssuerAnchorOwnerPrivateKey",
};

function getAnchorGasMode(issuanceModel) {
  const inputName = ANCHOR_GAS_MODE_INPUTS[issuanceModel];
  if (!inputName) {
    return "offchain";
  }
  return document.querySelector(`input[name="${inputName}"]:checked`)?.value || "offchain";
}

function getAnchorOwnerPrivateKey(issuanceModel) {
  const inputId = ANCHOR_OWNER_PRIVATE_KEY_INPUTS[issuanceModel];
  if (!inputId) {
    return null;
  }
  return document.getElementById(inputId)?.value.trim() || null;
}

function bindAnchorGasModePanels() {
  document.querySelectorAll(".anchor-gas-mode").forEach((fieldset) => {
    const ownerPanel = fieldset.querySelector(".anchor-owner-key-panel");
    const radioName =
      ownerPanel?.dataset.anchorGasPanel ||
      fieldset.querySelector('input[type="radio"]')?.name;
    if (!radioName) {
      return;
    }

    const consumptionSection = document.querySelector(
      `.anchor-consumption-section[data-anchor-gas-panel="${radioName}"]`
    );

    const syncPanels = () => {
      const selected = fieldset.querySelector(`input[name="${radioName}"]:checked`);
      const gasMode = selected?.value || "offchain";
      const isOwner = gasMode === "owner";
      const isOffchain = gasMode === "offchain";

      if (ownerPanel) {
        ownerPanel.hidden = !isOwner;
      }

      if (consumptionSection) {
        consumptionSection.hidden = isOffchain;
        if (isOffchain) {
          const select = consumptionSection.querySelector("select");
          if (select) {
            select.value = String(CONSUMPTION_UNLIMITED);
            select.dispatchEvent(new Event("change"));
          }
        }
      }
    };

    fieldset.querySelectorAll(`input[name="${radioName}"]`).forEach((radio) => {
      radio.addEventListener("change", syncPanels);
    });
    syncPanels();
  });
}

function bindConsumptionLimitedPanels() {
  document.querySelectorAll(".anchor-consumption-limited-panel").forEach((panel) => {
    const selectId = panel.dataset.consumptionModeSelect;
    const select = document.getElementById(selectId);
    if (!select) {
      return;
    }

    const syncPanel = () => {
      panel.hidden = select.value !== String(CONSUMPTION_LIMITED);
    };

    select.addEventListener("change", syncPanel);
    syncPanel();
  });
}

function describeAnchorGasPayer(gasMode, { actorPrivateKey, ownerPrivateKey }) {
  if (gasMode === "owner") {
    return ownerPrivateKey ? "DID owner (private key)" : "DID owner (MetaMask)";
  }
  if (actorPrivateKey) {
    return "Actor (private key wallet)";
  }
  return "Actor (MetaMask)";
}

function formatAnchorResult(anchorResult) {
  return `\n\n// On-chain anchor completed\n${stringifyForDisplay(anchorResult)}`;
}

function appendAnchorResultToOutput(issuanceModel, anchorResult) {
  const targetId = credentialOutputElementId(issuanceModel);
  const output = document.getElementById(targetId);
  output.textContent = `${output.textContent}${formatAnchorResult(anchorResult)}`;
}

async function anchorCredentialForCredential(
  credential,
  gasMode,
  actorPrivateKey = null,
  issuanceModel = null
) {
  const subjectDid = credential.credentialSubject?.id;
  const credentialHash = credential.credentialStatus?.credentialHash;
  if (!subjectDid || !credentialHash) {
    throw new Error("Credential missing subject or credentialHash");
  }
  if (credentialHash.toLowerCase() !== credentialStatusHash(credential).toLowerCase()) {
    throw new Error("credentialStatus.credentialHash does not match credential content");
  }

  const credentialType = getPrimaryCredentialType(credential) || "";
  const policy = getCredentialPolicy(credentialType);
  const resolvedIssuanceModel =
    issuanceModel || detectIssuanceModel(credential, policy) || ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED;
  const { consumptionMode, maxUses } = getAnchorConsumptionOptions(resolvedIssuanceModel);
  const ownerPrivateKey =
    gasMode === "owner" ? getAnchorOwnerPrivateKey(resolvedIssuanceModel) : null;
  const receipt = await anchorCredentialOnChain({
    subjectDid,
    credentialHash,
    credentialType,
    gasMode,
    actorPrivateKey,
    ownerPrivateKey,
    consumptionMode,
    maxUses,
  });

  return {
    anchorTransactionHash: receipt.hash,
    subjectDid,
    credentialHash,
    credentialType,
    gasMode,
    consumptionMode,
    consumptionModeLabel: consumptionModeLabel(consumptionMode, maxUses),
    maxUses,
    gasPaidBy: describeAnchorGasPayer(gasMode, { actorPrivateKey, ownerPrivateKey }),
  };
}

async function maybeAnchorAfterIssue(credential, issuanceModel, actorPrivateKey = null) {
  const gasMode = getAnchorGasMode(issuanceModel);
  if (gasMode === "offchain") {
    return null;
  }

  const anchorResult = await anchorCredentialForCredential(
    credential,
    gasMode,
    actorPrivateKey,
    issuanceModel
  );
  appendAnchorResultToOutput(issuanceModel, anchorResult);
  return anchorResult;
}

async function issueSelfSignedCredentialForSelectedRobot() {
  if (!selectedRobot?.activeDID) {
    throw new Error("Select an active robot first");
  }

  const { wallet, actorPrivateKey } = await resolveRobotSigningWallet();
  const robotDid = selectedRobot.activeDID;
  const robotKeyAddress = await wallet.getAddress();
  const registry = getRegistryContract();
  const authorized = await isRobotKeyAuthorizedAt(
    registry,
    robotDid,
    robotKeyAddress,
    Math.floor(Date.now() / 1000)
  );
  if (!authorized) {
    throw new Error("Signing account is not the current authorized robot key");
  }

  const credentialType = document.getElementById("selfSignedCredentialType").value;
  const policy = getCredentialPolicy(credentialType);
  if (!supportsIssuanceModel(policy, ISSUANCE_MODEL.ROBOT_SELF_SIGNED)) {
    throw new Error("Selected type does not support robot self-signed issuance");
  }

  const validDays = Number(document.getElementById("selfSignedValidDays").value);
  if (!Number.isFinite(validDays)) {
    throw new Error("Credential valid days must be a number");
  }

  const subjectExtra = generateRobotSelfSignedSubjectData(credentialType);

  const credential = await buildSignedCredential({
    credentialType,
    issuerDid: robotDid,
    subjectDid: robotDid,
    wallet,
    validDays,
    subjectExtra,
  });

  writeCredentialOutput(credential, ISSUANCE_MODEL.ROBOT_SELF_SIGNED);
  await maybeAnchorAfterIssue(credential, ISSUANCE_MODEL.ROBOT_SELF_SIGNED, actorPrivateKey);
}

async function assertControllerAssertionPermission(subjectDid, controllerAddress) {
  const registry = getRegistryContract();
  const permissions = Number(
    await registry.getControllerPermissions(subjectDid, controllerAddress)
  );
  if ((permissions & controllerPermissions.assertion) === 0) {
    throw new Error("Controller lacks assertion permission on this robot DID");
  }
}

async function issueControllerDelegatedCredentialForSelectedRobot() {
  if (!selectedRobot?.activeDID) {
    throw new Error("Select an active robot first");
  }

  const { wallet, actorPrivateKey } = await resolveActorSigningWallet(
    "controllerDelegatedPrivateKey"
  );
  const controllerAddress = await wallet.getAddress();
  const controllerDid = didFromAddress(controllerAddress);
  document.getElementById("did").value = selectedRobot.activeDID;
  const record = await getRegistryRecord();
  if (!record.active) {
    throw new Error("Selected robot DID is not active");
  }

  await assertControllerAssertionPermission(selectedRobot.activeDID, controllerAddress);

  const credentialType = document.getElementById("controllerDelegatedCredentialType").value;
  const policy = getCredentialPolicy(credentialType);
  if (!supportsIssuanceModel(policy, ISSUANCE_MODEL.CONTROLLER_DELEGATED)) {
    throw new Error("Selected type does not support controller-delegated issuance");
  }

  const validDays = Number(document.getElementById("controllerDelegatedValidDays").value);
  if (!Number.isFinite(validDays)) {
    throw new Error("Credential valid days must be a number");
  }

  const subjectExtra = generateControllerDelegatedSubjectData(
    credentialType,
    controllerDid
  );

  const credential = await buildSignedCredential({
    credentialType,
    issuerDid: controllerDid,
    subjectDid: selectedRobot.activeDID,
    wallet,
    validDays,
    subjectExtra,
  });

  writeCredentialOutput(credential, ISSUANCE_MODEL.CONTROLLER_DELEGATED);
  await maybeAnchorAfterIssue(
    credential,
    ISSUANCE_MODEL.CONTROLLER_DELEGATED,
    actorPrivateKey
  );
}

async function issueCredentialForSelectedRobot() {
  if (!selectedRobot?.activeDID) {
    throw new Error("Select an active robot first");
  }

  const { wallet, actorPrivateKey } = await resolveActorSigningWallet(
    "credentialIssuerPrivateKey"
  );
  const issuerAddress = await wallet.getAddress();
  document.getElementById("did").value = selectedRobot.activeDID;
  const record = await getRegistryRecord();
  if (!record.active) {
    throw new Error("Selected robot DID is not active");
  }

  const credentialType = document.getElementById("credentialType").value;
  const policy = getCredentialPolicy(credentialType);
  if (!supportsIssuanceModel(policy, ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED)) {
    throw new Error("Selected type requires an external issuer");
  }

  const issuerRegistry = await getIssuerRegistryContract();
  if (!(await issuerRegistry.isIssuerActive(issuerAddress))) {
    throw new Error("Issuer DID is not active in CredentialIssuerRegistry");
  }
  if (!(await issuerRegistry.isAuthorizedIssuer(credentialType, issuerAddress))) {
    throw new Error("Issuer does not have the required role for this credential type");
  }

  const validDays = Number(document.getElementById("credentialValidDays").value);
  if (!Number.isFinite(validDays)) {
    throw new Error("Credential valid days must be a number");
  }

  const credential = await buildSignedCredential({
    credentialType,
    issuerDid: didFromAddress(issuerAddress),
    subjectDid: selectedRobot.activeDID,
    wallet,
    validDays,
  });

  writeCredentialOutput(credential, ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED);
  await maybeAnchorAfterIssue(
    credential,
    ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED,
    actorPrivateKey
  );
}
