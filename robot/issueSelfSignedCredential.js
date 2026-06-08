require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const {
  canonicalize,
  credentialStatusHash,
  verificationMethodId,
} = require("../lib/didUzheth");
const {
  ISSUANCE_MODEL,
  credentialSubjectForType,
  getCredentialPolicy,
  supportsIssuanceModel,
} = require("../lib/credentialPolicies");
const { maybeAnchorCredential } = require("../lib/issueAnchor");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

async function main() {
  const robotPrivateKey = requireEnv("ROBOT_PRIVATE_KEY");
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const credentialType = process.env.CREDENTIAL_TYPE || "RobotSensorDataCredential";
  const policy = getCredentialPolicy(credentialType);
  if (!policy || !supportsIssuanceModel(policy, ISSUANCE_MODEL.ROBOT_SELF_SIGNED)) {
    throw new Error(`${credentialType} does not support robot self-signed issuance`);
  }

  const validDays = Number(process.env.CREDENTIAL_VALID_DAYS || String(policy.maxValidityDays));
  const robotWallet = new ethers.Wallet(robotPrivateKey);
  const robotDid = requireEnv("ROBOT_DID");
  const now = new Date();
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + validDays);

  const subjectExtra = { timestamp: now.toISOString() };
  if (credentialType === "RobotSensorDataCredential") {
    subjectExtra.sensorType = process.env.SENSOR_TYPE || "temperature";
    subjectExtra.value = process.env.SENSOR_VALUE || "22.4";
    subjectExtra.unit = process.env.SENSOR_UNIT || "C";
  }

  const credential = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", credentialType],
    issuer: robotDid,
    issuanceDate: now.toISOString(),
    issuedAt: Math.floor(now.getTime() / 1000),
    expirationDate: expiration.toISOString(),
    credentialSchema: {
      id: `urn:uzheth-schema:${credentialType}`,
      type: "JsonSchema2020",
    },
    credentialSubject: credentialSubjectForType(credentialType, robotDid, subjectExtra),
  };
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
  credential.proof = {
    type: "EcdsaSecp256k1Signature2019",
    created: now.toISOString(),
    proofPurpose: "assertionMethod",
    verificationMethod: verificationMethodId(robotDid),
    signature: await robotWallet.signMessage(ethers.getBytes(digest)),
  };

  const outputPath = path.join(__dirname, "..", "credentials", `${credentialType}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(credential, null, 2)}\n`);

  console.log("Robot self-signed VC created");
  console.log("Saved path:", outputPath);
  console.log("Issuer = Subject:", robotDid);
  console.log("Credential type:", credentialType);

  const anchorResult = await maybeAnchorCredential(credential, {
    actorPrivateKeyEnv: "ROBOT_PRIVATE_KEY",
  });
  if (anchorResult) {
    console.log("On-chain anchor completed");
    console.log(JSON.stringify(anchorResult, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
