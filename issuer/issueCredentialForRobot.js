require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const {
  canonicalize,
  credentialStatusHash,
  didFromAddress,
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
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const issuerPrivateKey = requireEnv("ISSUER_PRIVATE_KEY");
  const credentialType = process.env.CREDENTIAL_TYPE || "RobotMaintenanceCredential";
  const policy = getCredentialPolicy(credentialType);
  if (!policy || !supportsIssuanceModel(policy, ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED)) {
    throw new Error(`${credentialType} is not an external issuer-signed credential type`);
  }

  const validDays = Number(process.env.CREDENTIAL_VALID_DAYS || String(policy.maxValidityDays));
  const issuerWallet = new ethers.Wallet(issuerPrivateKey);
  const issuerDid = didFromAddress(await issuerWallet.getAddress());
  const subjectDid = process.env.CREDENTIAL_SUBJECT_DID;
  if (!subjectDid) {
    throw new Error("CREDENTIAL_SUBJECT_DID is required");
  }

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
    credentialSubject: credentialSubjectForType(credentialType, subjectDid),
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
    verificationMethod: verificationMethodId(issuerDid),
    signature: await issuerWallet.signMessage(ethers.getBytes(digest)),
  };

  const outputPath = path.join(__dirname, "..", "credentials", `${credentialType}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(credential, null, 2)}\n`);

  console.log("External issuer-signed VC created");
  console.log("Meaning: third party certifies a claim about the robot");
  console.log("Saved path:", outputPath);
  console.log("Issuer DID:", issuerDid);
  console.log("Subject robot DID:", subjectDid);
  console.log("Credential type:", credentialType);

  const anchorResult = await maybeAnchorCredential(credential, {
    actorPrivateKeyEnv: "ISSUER_PRIVATE_KEY",
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
