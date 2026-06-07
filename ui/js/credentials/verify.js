async function verifyCredentialObject(credential) {
  const issuer = credential.issuer;
  const subjectId = credential.credentialSubject?.id;
  const signature = credential.proof?.signature;

  if (!issuer || !subjectId || !signature) {
    throw new Error("Credential is missing issuer, subject, or signature");
  }

  try {
    validateRobotDid(subjectId);
  } catch (error) {
    throw new Error(`Invalid subject DID: ${error.message}`);
  }

  const issuerAddress = isAddressDid(issuer) ? addressFromDid(issuer) : null;
  const issuedAtSeconds = credentialIssuedAtSeconds(credential);
  const credentialTypeCheck = verifyCredentialTypeAndSchema(credential);
  const policyConfig = credentialTypeCheck.policy;
  const detectedModel = credentialTypeCheck.detectedIssuanceModel;
  const notExpired =
    credential.expirationDate &&
    new Date(credential.expirationDate).getTime() > Date.now();

  document.getElementById("did").value = subjectId;
  const subjectRecord = await getRegistryRecord();
  const registry = getRegistryContract();
  const issuerRegistry = await getIssuerRegistryContract();
  const credentialHash = credential.credentialStatus?.credentialHash || "";
  const credentialHashMatchesContent =
    Boolean(credentialHash) &&
    credentialHash.toLowerCase() === credentialStatusHash(credential).toLowerCase();
  const { recovered, signatureValid } = recoverSignerFromCredential(credential);
  const signerControlsIssuerDID =
    Boolean(recovered) &&
    Boolean(issuerAddress) &&
    recovered.toLowerCase() === issuerAddress.toLowerCase();
  const proofMethodMatchesIssuer =
    credential.proof.verificationMethod === verificationMethodId(issuer);
  const credentialRevoked = credentialHashMatchesContent
    ? await registry.isCredentialRevoked(credentialHash)
    : false;
  const subjectRevoked = await registry.isRevoked(subjectId);
  const subjectIssuanceAllowed =
    issuedAtSeconds != null
      ? await registry.isIssuanceAllowedAt(subjectId, issuedAtSeconds)
      : false;
  const consumptionStatus = await fetchConsumptionStatus(
    registry,
    credentialHash,
    credentialHashMatchesContent
  );
  const consumptionAvailable = consumptionStatus ? consumptionStatus.available : true;
  const onChainAnchor = await fetchOnChainAnchor(
    registry,
    credentialHash,
    credentialHashMatchesContent
  );
  const anchorTiming = verifyAnchorIssuanceTiming(
    issuedAtSeconds,
    onChainAnchor,
    getMaxPublishDelaySeconds()
  );

  const schemaValid =
    credentialTypeCheck.verifiableCredentialTypePresent &&
    credentialTypeCheck.credentialTypeSupported &&
    credentialTypeCheck.credentialSchemaMatchesType &&
    credentialTypeCheck.credentialSubjectMatchesSchema &&
    credentialHashMatchesContent &&
    issuedAtSeconds != null;

  let policy = {};
  let verificationBreakdown = {};
  let valid = false;
  const meaning = policyConfig?.description || "Unsupported credential type";

  const decentralizedInputsChecked = {
    issuerDID: issuer,
    subjectRobotDID: subjectId,
    robotTokenId: subjectRecord.robotTokenId.toString(),
    registryOwner: subjectRecord.owner,
    credentialHash,
    recoveredSigner: recovered,
    issuerAddress,
    issuedAt: issuedAtSeconds,
    detectedIssuanceModel: detectedModel,
    allowedIssuanceModels: credentialTypeCheck.allowedIssuanceModels,
  };

  if (!schemaValid || !detectedModel) {
    policy = {
      verifiableCredentialTypePresent:
        credentialTypeCheck.verifiableCredentialTypePresent,
      credentialTypeSupported: credentialTypeCheck.credentialTypeSupported,
      credentialSchemaMatchesType: credentialTypeCheck.credentialSchemaMatchesType,
      credentialSubjectMatchesSchema:
        credentialTypeCheck.credentialSubjectMatchesSchema,
      credentialHashMatchesContent,
      issuanceModelAllowed: Boolean(detectedModel),
    };
    verificationBreakdown = { ...policy };
  } else if (detectedModel === ISSUANCE_MODEL.ROBOT_SELF_SIGNED) {
    const robotKeyAuthorizedAtIssuance =
      isRobotDid(subjectId) &&
      Boolean(recovered) &&
      (await isRobotKeyAuthorizedAt(registry, subjectId, recovered, issuedAtSeconds));
    policy = {
      signatureValid,
      issuerEqualsSubject: issuer.toLowerCase() === subjectId.toLowerCase(),
      subjectDidValid: true,
      subjectNotRevoked: !subjectRevoked,
      issuanceAllowedAtTimestamp: subjectIssuanceAllowed,
      assertionMethodAuthorized: proofMethodMatchesIssuer,
      robotKeyAuthorizedAtIssuance,
      notExpired,
      credentialNotRevoked: !credentialRevoked,
      consumptionAvailable,
      anchorIssuanceTimingValid: anchorTiming.anchorIssuanceTimingValid,
    };
    valid = schemaValid && Object.values(policy).every(Boolean);
    verificationBreakdown = {
      issuanceModel: ISSUANCE_MODEL.ROBOT_SELF_SIGNED,
      meaning,
      ...policy,
      credentialHashMatchesContent,
    };
  } else if (detectedModel === ISSUANCE_MODEL.CONTROLLER_DELEGATED) {
    const permissions = Number(
      await registry.getControllerPermissions(subjectId, issuerAddress)
    );
    const controllerAssertionAuthorized =
      (permissions & controllerPermissions.assertion) !== 0;
    policy = {
      signatureValid,
      issuerDiffersFromSubject: issuer.toLowerCase() !== subjectId.toLowerCase(),
      subjectDidValid: true,
      subjectNotRevoked: !subjectRevoked,
      subjectIssuanceAllowedAtTimestamp: subjectIssuanceAllowed,
      controllerAssertionAuthorized,
      assertionMethodAuthorized: proofMethodMatchesIssuer,
      signerControlsControllerDID: signerControlsIssuerDID,
      notExpired,
      credentialNotRevoked: !credentialRevoked,
      consumptionAvailable,
      anchorIssuanceTimingValid: anchorTiming.anchorIssuanceTimingValid,
    };
    valid = schemaValid && Object.values(policy).every(Boolean);
    verificationBreakdown = {
      issuanceModel: ISSUANCE_MODEL.CONTROLLER_DELEGATED,
      meaning,
      ...policy,
      credentialHashMatchesContent,
    };
  } else if (detectedModel === ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED) {
    const issuerRecord = await issuerRegistry.getIssuer(issuerAddress);
    const issuerProfile = formatIssuerProfile(issuerRecord);
    const issuerRoleValid = await issuerRegistry.isAuthorizedIssuer(
      credentialTypeCheck.primaryCredentialType,
      issuerAddress
    );
    policy = {
      signatureValid,
      issuerDiffersFromSubject: issuer.toLowerCase() !== subjectId.toLowerCase(),
      subjectDidValid: true,
      subjectNotRevoked: !subjectRevoked,
      subjectIssuanceAllowedAtTimestamp: subjectIssuanceAllowed,
      issuerDIDActive: issuerProfile.active,
      issuerHasRequiredRole: issuerRoleValid,
      assertionMethodAuthorized: proofMethodMatchesIssuer,
      signerControlsIssuerDID,
      notExpired,
      credentialNotRevoked: !credentialRevoked,
      consumptionAvailable,
      anchorIssuanceTimingValid: anchorTiming.anchorIssuanceTimingValid,
    };
    valid = schemaValid && Object.values(policy).every(Boolean);
    verificationBreakdown = {
      issuanceModel: ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED,
      meaning,
      ...policy,
      credentialHashMatchesContent,
    };
    decentralizedInputsChecked.issuerProfile = issuerProfile;
    decentralizedInputsChecked.issuerMetadataURI = issuerRecord.metadataURI;
  } else {
    policy = { credentialTypeSupported: false };
    verificationBreakdown = { credentialTypeSupported: false };
  }

  const output = {
    result: valid
      ? "VALID: Credential verified successfully"
      : "INVALID: Credential failed verification policy",
    issuanceModel: detectedModel,
    allowedIssuanceModels: credentialTypeCheck.allowedIssuanceModels,
    meaning,
    policyBasedVerificationResult: policy,
    credentialDetails: {
      credentialTypes: credentialTypeCheck.credentialTypes,
      primaryCredentialType: credentialTypeCheck.primaryCredentialType,
      credentialSchema: credentialTypeCheck.credentialSchema,
      requiredSubjectFields: credentialTypeCheck.requiredSubjectFields,
      expirationDate: credential.expirationDate || null,
    },
    verificationBreakdown,
    onChainAnchor,
    anchorTiming,
    consumptionStatus,
    decentralizedInputsChecked,
  };

  document.getElementById("verificationStatus").textContent = output.result;
  setPanelOutput("verificationPanel", "verificationOutput", output);
  setPanelOutput("registryPanel", "registryOutput", subjectRecord);
  setPanelOutput(
    "didDocumentPanel",
    "didDocumentOutput",
    buildDidResolution(subjectId, subjectRecord)
  );
  return output;
}

async function readCredentialInput() {
  const file = document.getElementById("credentialFile").files[0];
  const pastedCredential = document.getElementById("credentialText").value.trim();
  const credential = file
    ? JSON.parse(await file.text())
    : pastedCredential
      ? JSON.parse(pastedCredential)
      : null;

  if (!credential) {
    throw new Error("Select a credential JSON file or paste credential JSON");
  }

  return credential;
}

async function revokeCredentialFromInput() {
  const credential = await readCredentialInput();
  const subjectId = credential.credentialSubject?.id;
  if (!subjectId) {
    throw new Error("credentialSubject.id is missing");
  }
  if (!credential.credentialStatus?.credentialHash) {
    throw new Error("credentialStatus.credentialHash is missing");
  }

  const credentialHash = credential.credentialStatus.credentialHash;
  if (credentialHash.toLowerCase() !== credentialStatusHash(credential).toLowerCase()) {
    throw new Error("credentialStatus.credentialHash does not match credential content");
  }

  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const signer = await connectAdminWallet();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const receipt = await (await registry.revokeCredential(subjectId, credentialHash)).wait();

  const output = {
    result: "Credential revoked successfully",
    issuer: credential.issuer,
    subject: subjectId,
    credentialHash,
    revokeTransaction: receipt.hash,
  };

  document.getElementById("verificationStatus").textContent =
    "Credential revoked on-chain";
  setPanelOutput("verificationPanel", "verificationOutput", output);
}

async function verifyAndConsumeCredentialFromInput() {
  const credential = await readCredentialInput();
  const verifyOutput = await verifyCredentialObject(credential);
  const valid = String(verifyOutput.result || "").startsWith("VALID:");

  if (!valid) {
    return verifyOutput;
  }

  const consumptionStatus = verifyOutput.consumptionStatus;
  if (!consumptionStatus?.configured) {
    const output = {
      ...verifyOutput,
      consumeSkipped: true,
      consumeResult:
        "Cannot consume: this credential has no on-chain consumption policy (anchor without consumption or off-chain only).",
    };
    document.getElementById("verificationStatus").textContent =
      "VALID: Verified — consumption not configured; cannot consume on-chain";
    setPanelOutput("verificationPanel", "verificationOutput", output);
    return output;
  }

  const credentialHash = credential.credentialStatus?.credentialHash;
  const consumeOutput = await consumeCredentialOnChain(credentialHash);
  const registry = getRegistryContract();
  const updatedConsumption = await fetchConsumptionStatus(registry, credentialHash, true);
  const consumeResult = consumeOutput.available
    ? "Credential consumed on-chain (more uses remain)"
    : "Credential consumed on-chain (limit reached)";

  const output = {
    ...verifyOutput,
    consumptionStatus: updatedConsumption,
    consumeSkipped: false,
    consumeResult,
    consumeTransactionHash: consumeOutput.transactionHash,
    consumeDetails: consumeOutput,
  };
  document.getElementById("verificationStatus").textContent = consumeResult;
  setPanelOutput("verificationPanel", "verificationOutput", output);
  return output;
}

