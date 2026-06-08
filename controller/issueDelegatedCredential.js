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
  const controllerPrivateKey = requireEnv("CONTROLLER_PRIVATE_KEY");
  const subjectDid = requireEnv("SUBJECT_ROBOT_DID");
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const credentialType =
    process.env.CREDENTIAL_TYPE || "RobotMaintenanceLogCredential";
  const policy = getCredentialPolicy(credentialType);
  if (!policy || !supportsIssuanceModel(policy, ISSUANCE_MODEL.CONTROLLER_DELEGATED)) {
    throw new Error(`${credentialType} does not support controller-delegated issuance`);
  }

  const provider = new ethers.JsonRpcProvider(requireEnv("UZHETH_POS_RPC_URL"));
  const registryAbi = [
    "function getControllerPermissions(string did, address controller) view returns (uint256)",
  ];
  const registry = new ethers.Contract(registryAddress, registryAbi, provider);
  const controllerWallet = new ethers.Wallet(controllerPrivateKey);
  const controllerAddress = await controllerWallet.getAddress();
  const permissions = Number(
    await registry.getControllerPermissions(subjectDid, controllerAddress)
  );
  if ((permissions & 4) === 0) {
    throw new Error("Controller lacks assertion permission on subject robot DID");
  }

  const validDays = Number(process.env.CREDENTIAL_VALID_DAYS || String(policy.maxValidityDays));
  const controllerDid = didFromAddress(controllerAddress);
  const now = new Date();
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + validDays);

  const credential = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", credentialType],
    issuer: controllerDid,
    issuanceDate: now.toISOString(),
    issuedAt: Math.floor(now.getTime() / 1000),
    expirationDate: expiration.toISOString(),
    credentialSchema: {
      id: `urn:uzheth-schema:${credentialType}`,
      type: "JsonSchema2020",
    },
    credentialSubject: credentialSubjectForType(credentialType, subjectDid, {
      operator: controllerDid,
      timestamp: now.toISOString(),
    }),
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
    verificationMethod: verificationMethodId(controllerDid),
    signature: await controllerWallet.signMessage(ethers.getBytes(digest)),
  };

  const outputPath = path.join(__dirname, "..", "credentials", `${credentialType}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(credential, null, 2)}\n`);

  console.log("Controller-delegated VC created");
  console.log("Saved path:", outputPath);
  console.log("Issuer:", controllerDid);
  console.log("Subject:", subjectDid);
  console.log("Credential type:", credentialType);

  const anchorResult = await maybeAnchorCredential(credential, {
    actorPrivateKeyEnv: "CONTROLLER_PRIVATE_KEY",
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
