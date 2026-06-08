const DID_METHOD_PREFIX = "did:uzheth:";
const ROBOT_DID_PREFIX = `${DID_METHOD_PREFIX}robot:`;
const UZHETH_CHAIN_ID = 70207;

const ISSUANCE_MODEL = {
  ROBOT_SELF_SIGNED: "ROBOT_SELF_SIGNED",
  CONTROLLER_DELEGATED: "CONTROLLER_DELEGATED",
  EXTERNAL_ISSUER_SIGNED: "EXTERNAL_ISSUER_SIGNED",
};

const CONTROLLER_ASSERTION_PERMISSION = 4;

const CONSUMPTION_UNLIMITED = 0;
const CONSUMPTION_LIMITED = 1;

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

const credentialTypeRequirements = Object.fromEntries(
  Object.entries(CREDENTIAL_POLICIES).map(([type, policy]) => [
    type,
    policy.requiredSubjectFields,
  ])
);

const demoValues = {
  registryAddress: "0x4Db5ef3b22a0D6d3E05EF3BE80710c78e576c152",
  did: "did:uzheth:robot:70207:0x4db5ef3b22a0d6d3e05ef3be80710c78e576c152:1",
  robotNftOwnerAddress: "0x3e453c9D3B8438CCF8f973A8AB8b3A70B9e1f81c",
};
const controllerPermissions = {
  keyRotation: 1,
  credentialRevocation: 2,
  assertion: 4,
};
const roleMatrixCredentialTypes = [
  {
    label: "maintainer",
    credentialType: "RobotMaintenanceCredential",
  },
  {
    label: "manufacturer",
    credentialType: "RobotManufacturingCredential",
  },
  {
    label: "safety inspector",
    credentialType: "RobotSafetyInspectionCredential",
  },
  {
    label: "license issuer",
    credentialType: "RobotOperationLicenseCredential",
  },
];

let lastRecord = null;
let lastDidDocument = null;
let generatedRobotWallet = null;
let selectedRobot = null;
let lastRobotsResult = null;
let lastVisibleRobots = [];
let robotsBrowserVisible = false;

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

