const { ethers } = require("ethers");
const {
  addressFromDid,
  canonicalize,
  credentialIssuedAtSeconds,
  credentialStatusHash,
  isAddressDid,
  isRobotDid,
  isRobotKeyAuthorizedAt,
  validateRobotDid,
  verificationMethodId,
} = require("./didUzheth");
const { fetchConsumptionStatus } = require("./consumptionRegistry");
const { fetchOnChainAnchor } = require("./onChainAnchor");
const {
  DEFAULT_MAX_PUBLISH_DELAY_SECONDS,
  verifyAnchorIssuanceTiming,
} = require("./anchorTiming");
const {
  CONTROLLER_ASSERTION_PERMISSION,
  ISSUANCE_MODEL,
  verifyCredentialTypeAndSchema,
} = require("./credentialPolicies");

function recoverSignerFromCredential(credential) {
  const signature = credential.proof?.signature;
  if (!signature) {
    return { recovered: null, signatureValid: false };
  }

  const { proof, ...credentialWithoutProof } = credential;
  const message = canonicalize(credentialWithoutProof);
  const digest = ethers.keccak256(ethers.toUtf8Bytes(message));

  try {
    return {
      recovered: ethers.verifyMessage(ethers.getBytes(digest), signature),
      signatureValid: true,
    };
  } catch (_error) {
    return { recovered: null, signatureValid: false };
  }
}

async function hasControllerAssertionPermission(registry, subjectId, controllerAddress) {
  const permissions = Number(await registry.getControllerPermissions(subjectId, controllerAddress));
  return (permissions & CONTROLLER_ASSERTION_PERMISSION) !== 0;
}

function issuerAddressFromDid(issuer) {
  return isAddressDid(issuer) ? addressFromDid(issuer) : null;
}

function validateSubjectDid(subjectId) {
  if (!subjectId) {
    return { valid: false, error: "Missing subject DID" };
  }
  if (!isRobotDid(subjectId)) {
    return { valid: false, error: "Subject DID must use did:uzheth:robot:<chainId>:0x<nft>:<tokenId>" };
  }
  try {
    validateRobotDid(subjectId);
  } catch (error) {
    return { valid: false, error: error.message };
  }
  return { valid: true };
}

async function verifyCredentialPolicy(
  credential,
  { registry, issuerRegistry, maxPublishDelaySeconds = DEFAULT_MAX_PUBLISH_DELAY_SECONDS }
) {
  const issuer = credential.issuer;
  const subjectId = credential.credentialSubject?.id;
  const credentialTypeCheck = verifyCredentialTypeAndSchema(credential);
  const policyConfig = credentialTypeCheck.policy;
  const detectedModel = credentialTypeCheck.detectedIssuanceModel;
  const expectedCredentialHash = credentialStatusHash(credential);
  const credentialHash = credential.credentialStatus?.credentialHash || "";
  const credentialHashMatchesContent =
    Boolean(credentialHash) &&
    credentialHash.toLowerCase() === expectedCredentialHash.toLowerCase();
  const issuedAtSeconds = credentialIssuedAtSeconds(credential);
  const onChainAnchorEarly =
    credentialHashMatchesContent && credentialHash
      ? await fetchOnChainAnchor(registry, credentialHash, true)
      : null;
  const anchorTiming = verifyAnchorIssuanceTiming(
    issuedAtSeconds,
    onChainAnchorEarly,
    maxPublishDelaySeconds
  );

  async function finish(result) {
    result.onChainAnchor =
      onChainAnchorEarly ||
      (await fetchOnChainAnchor(registry, credentialHash, credentialHashMatchesContent));
    result.anchorTiming = anchorTiming;
    result.consumptionStatus = await fetchConsumptionStatus(
      registry,
      credentialHash,
      credentialHashMatchesContent
    );
    return result;
  }

  const result = {
    valid: false,
    issuanceModel: detectedModel,
    allowedIssuanceModels: credentialTypeCheck.allowedIssuanceModels,
    credentialType: credentialTypeCheck.primaryCredentialType,
    meaning: policyConfig?.description || "Unsupported credential type",
    checks: {},
    credentialDetails: {
      credentialTypes: credentialTypeCheck.credentialTypes,
      primaryCredentialType: credentialTypeCheck.primaryCredentialType,
      expirationDate: credential.expirationDate || null,
      issuedAt: issuedAtSeconds,
    },
  };

  if (!issuer || !subjectId || !credential.proof?.signature) {
    result.checks = { structureValid: false };
    return finish(result);
  }

  const subjectDidValidation = validateSubjectDid(subjectId);
  if (!subjectDidValidation.valid) {
    result.checks = { subjectDidValid: false, subjectDidError: subjectDidValidation.error };
    return finish(result);
  }

  if (detectedModel !== ISSUANCE_MODEL.ROBOT_SELF_SIGNED && !isAddressDid(issuer)) {
    result.checks = { issuerDidValid: false };
    return finish(result);
  }

  const issuerAddress = issuerAddressFromDid(issuer);
  const expirationTime = credential.expirationDate
    ? new Date(credential.expirationDate).getTime()
    : Number.NaN;
  const notExpired = Number.isFinite(expirationTime) && expirationTime > Date.now();
  const { recovered, signatureValid } = recoverSignerFromCredential(credential);
  const proofMethodMatchesIssuer =
    credential.proof.verificationMethod === verificationMethodId(issuer);
  const subjectExists = await registry.didExists(subjectId);
  const subjectRevoked = subjectExists ? await registry.isRevoked(subjectId) : true;
  const subjectIssuanceAllowed =
    subjectExists && issuedAtSeconds != null
      ? await registry.isIssuanceAllowedAt(subjectId, issuedAtSeconds)
      : false;
  const credentialRevoked =
    credentialHashMatchesContent &&
    (await registry.isCredentialRevoked(credentialHash));
  const consumptionStatus = await fetchConsumptionStatus(
    registry,
    credentialHash,
    credentialHashMatchesContent
  );
  const consumptionAvailable = consumptionStatus ? consumptionStatus.available : true;
  const issuerDiffersFromSubject = issuer.toLowerCase() !== subjectId.toLowerCase();

  const schemaValid =
    credentialTypeCheck.verifiableCredentialTypePresent &&
    credentialTypeCheck.credentialTypeSupported &&
    credentialTypeCheck.credentialSchemaMatchesType &&
    credentialTypeCheck.credentialSubjectMatchesSchema &&
    credentialHashMatchesContent &&
    issuedAtSeconds != null;

  if (!schemaValid || !detectedModel) {
    result.checks = {
      verifiableCredentialTypePresent:
        credentialTypeCheck.verifiableCredentialTypePresent,
      credentialTypeSupported: credentialTypeCheck.credentialTypeSupported,
      credentialSchemaMatchesType: credentialTypeCheck.credentialSchemaMatchesType,
      credentialSubjectMatchesSchema:
        credentialTypeCheck.credentialSubjectMatchesSchema,
      credentialHashMatchesContent,
      issuanceTimestampPresent: issuedAtSeconds != null,
      issuanceModelAllowed: Boolean(detectedModel),
    };
    return finish(result);
  }

  if (detectedModel === ISSUANCE_MODEL.ROBOT_SELF_SIGNED) {
    const robotKeyAuthorizedAtIssuance =
      Boolean(recovered) &&
      (await isRobotKeyAuthorizedAt(registry, subjectId, recovered, issuedAtSeconds));
    const checks = {
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
    result.checks = checks;
    result.valid = Object.values(checks).every(Boolean);
    return finish(result);
  }

  if (detectedModel === ISSUANCE_MODEL.CONTROLLER_DELEGATED) {
    const controllerHasAssertionPermission =
      issuerAddress &&
      (await hasControllerAssertionPermission(registry, subjectId, issuerAddress));
    const signerControlsControllerDID =
      Boolean(recovered) &&
      Boolean(issuerAddress) &&
      recovered.toLowerCase() === issuerAddress.toLowerCase();
    const checks = {
      signatureValid,
      issuerDiffersFromSubject,
      subjectDidValid: true,
      subjectNotRevoked: !subjectRevoked,
      subjectIssuanceAllowedAtTimestamp: subjectIssuanceAllowed,
      controllerAssertionAuthorized: controllerHasAssertionPermission,
      assertionMethodAuthorized: proofMethodMatchesIssuer,
      signerControlsControllerDID,
      notExpired,
      credentialNotRevoked: !credentialRevoked,
      consumptionAvailable,
      anchorIssuanceTimingValid: anchorTiming.anchorIssuanceTimingValid,
    };
    result.checks = checks;
    result.valid = Object.values(checks).every(Boolean);
    return finish(result);
  }

  if (detectedModel === ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED) {
    const issuerProfile = issuerAddress
      ? await issuerRegistry.getIssuer(issuerAddress)
      : { active: false };
    const issuerDIDActive = issuerProfile.active;
    const issuerRoleValid =
      issuerAddress &&
      (await issuerRegistry.isAuthorizedIssuer(
        credentialTypeCheck.primaryCredentialType,
        issuerAddress
      ));
    const signerControlsIssuerDID =
      Boolean(recovered) &&
      Boolean(issuerAddress) &&
      recovered.toLowerCase() === issuerAddress.toLowerCase();
    const checks = {
      signatureValid,
      issuerDiffersFromSubject,
      subjectDidValid: true,
      subjectNotRevoked: !subjectRevoked,
      subjectIssuanceAllowedAtTimestamp: subjectIssuanceAllowed,
      issuerDIDActive,
      issuerHasRequiredRole: issuerRoleValid,
      assertionMethodAuthorized: proofMethodMatchesIssuer,
      signerControlsIssuerDID,
      notExpired,
      credentialNotRevoked: !credentialRevoked,
      consumptionAvailable,
      anchorIssuanceTimingValid: anchorTiming.anchorIssuanceTimingValid,
    };
    result.checks = checks;
    result.valid = Object.values(checks).every(Boolean);
    return finish(result);
  }

  result.checks = { issuanceModelSupported: false };
  return finish(result);
}

module.exports = {
  recoverSignerFromCredential,
  verifyCredentialPolicy,
};
