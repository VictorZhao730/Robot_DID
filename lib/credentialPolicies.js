// Credential type definitions and which issuance model each type allows.
const ISSUANCE_MODEL = {
  ROBOT_SELF_SIGNED: "ROBOT_SELF_SIGNED",
  CONTROLLER_DELEGATED: "CONTROLLER_DELEGATED",
  EXTERNAL_ISSUER_SIGNED: "EXTERNAL_ISSUER_SIGNED",
};

const CONTROLLER_ASSERTION_PERMISSION = 4;

const CREDENTIAL_POLICIES = {
  RobotSensorDataCredential: {
    allowedIssuanceModels: [ISSUANCE_MODEL.ROBOT_SELF_SIGNED],
    description: "Robot proves sensor data it produced",
    requiredSubjectFields: ["sensorType", "value", "unit", "timestamp"],
    maxValidityDays: 1,
  },
  RobotHeartbeatCredential: {
    allowedIssuanceModels: [ISSUANCE_MODEL.ROBOT_SELF_SIGNED],
    description: "Robot proves it is online",
    requiredSubjectFields: ["onlineStatus", "lastHeartbeat", "timestamp"],
    maxValidityDays: 1,
  },
  RobotOperationalLogCredential: {
    allowedIssuanceModels: [
      ISSUANCE_MODEL.ROBOT_SELF_SIGNED,
      ISSUANCE_MODEL.CONTROLLER_DELEGATED,
    ],
    description: "Operational log recorded by robot or authorized operator",
    requiredSubjectFields: ["eventType", "logMessage", "timestamp"],
    maxValidityDays: 7,
  },
  RobotMaintenanceLogCredential: {
    allowedIssuanceModels: [ISSUANCE_MODEL.CONTROLLER_DELEGATED],
    description: "On-site maintenance log recorded by authorized operator",
    requiredSubjectFields: [
      "operator",
      "maintenanceAction",
      "site",
      "timestamp",
    ],
    maxValidityDays: 30,
  },
  RobotMaintenanceCredential: {
    allowedIssuanceModels: [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED],
    description: "Third party certifies robot passed formal maintenance",
    requiredIssuerRole: "MAINTAINER_ROLE",
    requiredSubjectFields: [
      "maintenanceProvider",
      "maintenanceType",
      "maintenanceDate",
      "softwareVersion",
      "complianceStatus",
    ],
    maxValidityDays: 180,
  },
  RobotSafetyInspectionCredential: {
    allowedIssuanceModels: [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED],
    description: "Independent authority certifies safety inspection",
    requiredIssuerRole: "SAFETY_INSPECTOR_ROLE",
    requiredSubjectFields: [
      "inspector",
      "inspectionDate",
      "safetyStatus",
      "validUntil",
    ],
    maxValidityDays: 365,
  },
  RobotManufacturingCredential: {
    allowedIssuanceModels: [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED],
    description: "Manufacturer certifies manufacturing authenticity",
    requiredIssuerRole: "MANUFACTURER_ROLE",
    requiredSubjectFields: [
      "manufacturer",
      "productionDate",
      "hardwareRevision",
      "factoryCertification",
    ],
    maxValidityDays: 3650,
  },
  RobotOperationLicenseCredential: {
    allowedIssuanceModels: [ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED],
    description: "Licensed authority certifies operation permission",
    requiredIssuerRole: "OPERATION_LICENSE_ISSUER_ROLE",
    requiredSubjectFields: [
      "licenseIssuer",
      "operationScope",
      "licenseStatus",
      "validUntil",
    ],
    maxValidityDays: 365,
  },
};

function getAllowedIssuanceModels(policy) {
  if (!policy) {
    return [];
  }

  if (Array.isArray(policy.allowedIssuanceModels)) {
    return policy.allowedIssuanceModels;
  }

  return policy.issuanceModel ? [policy.issuanceModel] : [];
}

function supportsIssuanceModel(policy, model) {
  return getAllowedIssuanceModels(policy).includes(model);
}

function getPrimaryCredentialType(credential) {
  if (!Array.isArray(credential.type)) {
    return credential.type || null;
  }

  return credential.type.find((type) => type !== "VerifiableCredential") || null;
}

function getCredentialPolicy(credentialType) {
  return CREDENTIAL_POLICIES[credentialType] || null;
}

function isRobotSelfSignedPolicy(policy) {
  return supportsIssuanceModel(policy, ISSUANCE_MODEL.ROBOT_SELF_SIGNED);
}

function isControllerDelegatedPolicy(policy) {
  return supportsIssuanceModel(policy, ISSUANCE_MODEL.CONTROLLER_DELEGATED);
}

function isExternalIssuerSignedPolicy(policy) {
  return supportsIssuanceModel(policy, ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED);
}

// Infer model from issuer vs subject: same DID = self-signed, else controller or external issuer.
function detectIssuanceModel(credential, policy) {
  const issuer = credential.issuer;
  const subjectId = credential.credentialSubject?.id;
  if (!issuer || !subjectId || !policy) {
    return null;
  }

  if (issuer.toLowerCase() === subjectId.toLowerCase()) {
    return supportsIssuanceModel(policy, ISSUANCE_MODEL.ROBOT_SELF_SIGNED)
      ? ISSUANCE_MODEL.ROBOT_SELF_SIGNED
      : null;
  }

  if (supportsIssuanceModel(policy, ISSUANCE_MODEL.CONTROLLER_DELEGATED)) {
    return ISSUANCE_MODEL.CONTROLLER_DELEGATED;
  }

  if (supportsIssuanceModel(policy, ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED)) {
    return ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED;
  }

  return null;
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
      operator: "UZH Field Operator",
      maintenanceAction: "Replaced wheel assembly",
      site: "UZH Lab A",
      timestamp: now,
    },
    RobotMaintenanceCredential: {
      maintenanceProvider: "UZH Robotics Lab",
      maintenanceType: "Battery replacement and sensor calibration",
      maintenanceDate: "2026-05-20",
      softwareVersion: "v2.4.1",
      complianceStatus: "passed",
    },
    RobotSafetyInspectionCredential: {
      inspector: "UZH Safety Office",
      inspectionDate: "2026-05-22",
      safetyStatus: "approved",
      validUntil: "2026-11-22",
    },
    RobotManufacturingCredential: {
      manufacturer: "UZH Robotics Lab",
      productionDate: "2026-05-01",
      hardwareRevision: "rev-a",
      factoryCertification: "approved",
    },
    RobotOperationLicenseCredential: {
      licenseIssuer: "UZH Robotics Lab",
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

module.exports = {
  CONTROLLER_ASSERTION_PERMISSION,
  ISSUANCE_MODEL,
  CREDENTIAL_POLICIES,
  credentialSubjectForType,
  detectIssuanceModel,
  getAllowedIssuanceModels,
  getCredentialPolicy,
  getPrimaryCredentialType,
  isControllerDelegatedPolicy,
  isExternalIssuerSignedPolicy,
  isRobotSelfSignedPolicy,
  supportsIssuanceModel,
  verifyCredentialTypeAndSchema,
};
