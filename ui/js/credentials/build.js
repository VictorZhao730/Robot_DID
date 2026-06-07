function credentialStatusHash(credential) {
  const credentialForStatus = { ...credential };
  delete credentialForStatus.proof;
  delete credentialForStatus.id;
  delete credentialForStatus.credentialStatus;
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalize(credentialForStatus)));
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInRange(min, max, decimals = 1) {
  const value = min + Math.random() * (max - min);
  return decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
}

function generateRobotSelfSignedSubjectData(credentialType) {
  const timestamp = new Date().toISOString();

  if (credentialType === "RobotSensorDataCredential") {
    const sensorProfiles = [
      { sensorType: "temperature", unit: "C", min: 18, max: 28 },
      { sensorType: "humidity", unit: "%", min: 35, max: 65 },
      { sensorType: "pressure", unit: "hPa", min: 990, max: 1020, decimals: 0 },
      { sensorType: "lidar_distance", unit: "m", min: 0.3, max: 12 },
    ];
    const profile = randomItem(sensorProfiles);

    return {
      sensorType: profile.sensorType,
      value: randomInRange(profile.min, profile.max, profile.decimals ?? 1),
      unit: profile.unit,
      timestamp,
    };
  }

  if (credentialType === "RobotHeartbeatCredential") {
    return {
      onlineStatus: randomItem(["online", "online", "degraded"]),
      lastHeartbeat: timestamp,
      timestamp,
    };
  }

  if (credentialType === "RobotOperationalLogCredential") {
    const events = [
      { eventType: "patrol_started", logMessage: "Robot started patrol route" },
      { eventType: "obstacle_detected", logMessage: "Obstacle detected and avoided" },
      { eventType: "charging_started", logMessage: "Robot entered charging mode" },
      { eventType: "task_completed", logMessage: "Assigned task completed successfully" },
    ];
    const event = randomItem(events);
    return {
      eventType: event.eventType,
      logMessage: event.logMessage,
      timestamp,
    };
  }

  return {
    onlineStatus: "online",
    lastHeartbeat: timestamp,
    timestamp,
  };
}

function generateControllerDelegatedSubjectData(credentialType, operatorDid) {
  const timestamp = new Date().toISOString();
  const operator = operatorDid || "did:uzheth:operator";

  if (credentialType === "RobotMaintenanceLogCredential") {
    const actions = [
      "Replaced wheel assembly",
      "Calibrated lidar sensor",
      "Cleaned charging contacts",
      "Updated firmware to v2.4.1",
    ];
    return {
      operator,
      maintenanceAction: randomItem(actions),
      site: randomItem(["UZH Lab A", "UZH Lab B", "Charging Bay", "Field Site 2"]),
      timestamp,
    };
  }

  const events = [
    { eventType: "manual_override", logMessage: "Operator approved manual override" },
    { eventType: "incident_reported", logMessage: "Operator logged field incident" },
    { eventType: "shift_handover", logMessage: "Operator recorded shift handover" },
  ];
  const event = randomItem(events);
  return {
    eventType: event.eventType,
    logMessage: event.logMessage,
    operator,
    timestamp,
  };
}

function credentialSubjectForType(type, did, extra = {}) {
  const shared = { id: did };
  const now = new Date().toISOString();
  const templates = {
    RobotSensorDataCredential: {
      sensorType: "temperature",
      value: "22.4",
      unit: "C",
      timestamp: now,
    },
    RobotHeartbeatCredential: {
      onlineStatus: "online",
      lastHeartbeat: now,
      timestamp: now,
    },
    RobotOperationalLogCredential: {
      eventType: "patrol_started",
      logMessage: "Robot started patrol route A",
      timestamp: now,
    },
    RobotMaintenanceLogCredential: {
      operator: "Field Operator",
      maintenanceAction: "Replaced wheel assembly",
      site: "Lab A",
      timestamp: now,
    },
    RobotMaintenanceCredential: {
      maintenanceProvider: "Robotics Lab",
      maintenanceType: "Battery replacement and sensor calibration",
      maintenanceDate: "2026-05-20",
      softwareVersion: "v2.4.1",
      complianceStatus: "passed",
    },
    RobotSafetyInspectionCredential: {
      inspector: "Safety Office",
      inspectionDate: "2026-05-22",
      safetyStatus: "approved",
      validUntil: "2026-11-22",
    },
    RobotManufacturingCredential: {
      manufacturer: "Robotics Lab",
      productionDate: "2026-05-01",
      hardwareRevision: "rev-a",
      factoryCertification: "approved",
    },
    RobotOperationLicenseCredential: {
      licenseIssuer: "Robotics Lab",
      operationScope: "teaching-chain-demo",
      licenseStatus: "active",
      validUntil: "2026-11-22",
    },
  };

  return {
    ...shared,
    ...(templates[type] || templates.RobotSensorDataCredential),
    ...extra,
  };
}

function getPrimaryCredentialType(credential) {
  if (!Array.isArray(credential.type)) {
    return credential.type || null;
  }

  return credential.type.find((type) => type !== "VerifiableCredential") || null;
}

function verifyCredentialTypeAndSchema(credential) {
  const credentialTypes = Array.isArray(credential.type)
    ? credential.type
    : credential.type
      ? [credential.type]
      : [];
  const primaryCredentialType = getPrimaryCredentialType(credential);
  const policy = getCredentialPolicy(primaryCredentialType);
  const requiredFields = policy?.requiredSubjectFields || null;
  const schemaId = primaryCredentialType
    ? `urn:uzheth-schema:${primaryCredentialType}`
    : null;
  const missingSubjectFields = requiredFields
    ? requiredFields.filter((field) => !credential.credentialSubject?.[field])
    : [];

  return {
    credentialTypes,
    primaryCredentialType,
    policy,
    allowedIssuanceModels: getAllowedIssuanceModels(policy),
    detectedIssuanceModel: detectIssuanceModel(credential, policy),
    verifiableCredentialTypePresent: credentialTypes.includes("VerifiableCredential"),
    credentialTypeSupported: Boolean(policy),
    credentialSchemaMatchesType:
      Boolean(schemaId) &&
      credential.credentialSchema?.id === schemaId &&
      credential.credentialSchema?.type === "JsonSchema2020",
    requiredSubjectFields: requiredFields || [],
    missingSubjectFields,
    credentialSubjectMatchesSchema: requiredFields
      ? missingSubjectFields.length === 0
      : false,
    credentialSchema: credential.credentialSchema || null,
  };
}

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

async function resolveRobotSigningWallet() {
  const privateKey =
    document.getElementById("selfSignedRobotPrivateKey").value.trim() ||
    document.getElementById("generatedRobotPrivateKey").value.trim();
  if (privateKey) {
    return {
      wallet: new ethers.Wallet(privateKey),
      actorPrivateKey: privateKey,
      signingVia: "privateKey",
    };
  }

  const signer = await connectAdminWallet();
  return {
    wallet: signer,
    actorPrivateKey: null,
    signingVia: "metamask",
  };
}

async function resolveActorSigningWallet(inputId) {
  const privateKey = document.getElementById(inputId).value.trim();
  if (privateKey) {
    return {
      wallet: new ethers.Wallet(privateKey),
      actorPrivateKey: privateKey,
      signingVia: "privateKey",
    };
  }

  const signer = await connectAdminWallet();
  return {
    wallet: signer,
    actorPrivateKey: null,
    signingVia: "metamask",
  };
}

async function buildSignedCredential({
  credentialType,
  issuerDid,
  subjectDid,
  wallet,
  validDays,
  subjectExtra = {},
}) {
  const now = new Date();
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + validDays);

  const credential = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", credentialType],
    issuer: issuerDid,
    issuanceDate: now.toISOString(),
    issuedAt: Math.floor(now.getTime() / 1000),
    expirationDate: expiration.toISOString(),
    credentialSchema: {
      id: `urn:uzheth-schema:${credentialType}`,
      type: "JsonSchema2020",
    },
    credentialSubject: credentialSubjectForType(credentialType, subjectDid, subjectExtra),
  };
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const credentialHash = credentialStatusHash(credential);

  credential.id = `urn:uzheth-vc:${credentialHash}`;
  credential.credentialStatus = {
    id: `${credential.id}#status`,
    type: "RobotCredentialStatus2026",
    revocationRegistry: registryAddress,
    credentialHash,
  };

  const message = canonicalize(credential);
  const digest = ethers.keccak256(ethers.toUtf8Bytes(message));
  const signature = await wallet.signMessage(ethers.getBytes(digest));

  credential.proof = {
    type: "EcdsaSecp256k1Signature2019",
    created: now.toISOString(),
    proofPurpose: "assertionMethod",
    verificationMethod: verificationMethodId(issuerDid),
    signature,
  };

  return credential;
}
