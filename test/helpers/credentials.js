const { ethers } = require("ethers");
const {
  canonicalize,
  credentialStatusHash,
  didFromAddress,
  verificationMethodId,
} = require("../../lib/didUzheth");

async function signCredential(credential, wallet) {
  const message = canonicalize(credential);
  const digest = ethers.keccak256(ethers.toUtf8Bytes(message));
  return wallet.signMessage(ethers.getBytes(digest));
}

async function buildSignedCredential({
  credentialType,
  issuerDid,
  subjectDid,
  wallet,
  issuedAtSeconds,
  subjectExtra = {},
  registryAddress = "0x0000000000000000000000000000000000000001",
}) {
  const now = new Date(issuedAtSeconds * 1000);
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + 30);

  const credential = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", credentialType],
    issuer: issuerDid,
    issuanceDate: now.toISOString(),
    issuedAt: issuedAtSeconds,
    expirationDate: expiration.toISOString(),
    credentialSchema: {
      id: `urn:uzheth-schema:${credentialType}`,
      type: "JsonSchema2020",
    },
    credentialSubject: {
      id: subjectDid,
      ...subjectExtra,
    },
  };

  const credentialHash = credentialStatusHash(credential);
  credential.id = `urn:uzheth-vc:${credentialHash}`;
  credential.credentialStatus = {
    id: `${credential.id}#status`,
    type: "RobotCredentialStatus2026",
    revocationRegistry: registryAddress,
    credentialHash,
  };

  const signature = await signCredential(credential, wallet);
  credential.proof = {
    type: "EcdsaSecp256k1Signature2019",
    created: now.toISOString(),
    proofPurpose: "assertionMethod",
    verificationMethod: verificationMethodId(issuerDid),
    signature,
  };

  return credential;
}

async function buildSelfSignedSensorCredential({
  did,
  wallet,
  issuedAtSeconds,
  registryAddress,
}) {
  const now = new Date(issuedAtSeconds * 1000);
  return buildSignedCredential({
    credentialType: "RobotSensorDataCredential",
    issuerDid: did,
    subjectDid: did,
    wallet,
    issuedAtSeconds,
    registryAddress,
    subjectExtra: {
      sensorType: "temperature",
      value: "22.4",
      unit: "C",
      timestamp: now.toISOString(),
    },
  });
}

async function buildControllerMaintenanceLogCredential({
  subjectDid,
  controllerWallet,
  issuedAtSeconds,
  registryAddress,
}) {
  const controllerDid = didFromAddress(controllerWallet.address);
  const now = new Date(issuedAtSeconds * 1000);
  return buildSignedCredential({
    credentialType: "RobotMaintenanceLogCredential",
    issuerDid: controllerDid,
    subjectDid,
    wallet: controllerWallet,
    issuedAtSeconds,
    registryAddress,
    subjectExtra: {
      operator: controllerDid,
      maintenanceAction: "replace battery",
      site: "lab-a",
      timestamp: now.toISOString(),
    },
  });
}

async function buildExternalMaintenanceCredential({
  subjectDid,
  issuerWallet,
  issuedAtSeconds,
  registryAddress,
}) {
  const issuerDid = didFromAddress(issuerWallet.address);
  return buildSignedCredential({
    credentialType: "RobotMaintenanceCredential",
    issuerDid,
    subjectDid,
    wallet: issuerWallet,
    issuedAtSeconds,
    registryAddress,
    subjectExtra: {
      maintenanceProvider: "Acme Robotics Service",
      maintenanceType: "annual",
      maintenanceDate: new Date(issuedAtSeconds * 1000).toISOString(),
      softwareVersion: "1.2.0",
      complianceStatus: "passed",
    },
  });
}

module.exports = {
  buildControllerMaintenanceLogCredential,
  buildExternalMaintenanceCredential,
  buildSelfSignedSensorCredential,
  buildSignedCredential,
};
