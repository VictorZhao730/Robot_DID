require("dotenv").config();

const { assertCredentialHashMatches, getHardhatRegistry, loadCredentialFile, requireEnv } = require("../lib/cliEnv");

async function main() {
  const filePath = process.argv[2] || requireEnv("CREDENTIAL_FILE");
  const credential = loadCredentialFile(filePath);
  const subjectDid = credential.credentialSubject?.id;
  if (!subjectDid) {
    throw new Error("credentialSubject.id is missing");
  }
  const credentialHash = assertCredentialHashMatches(credential);
  const registry = await getHardhatRegistry(requireEnv("REGISTRY_ADDRESS"));
  const tx = await registry.revokeCredential(subjectDid, credentialHash);
  const receipt = await tx.wait();
  console.log("Credential revoked on-chain");
  console.log("Subject DID:", subjectDid);
  console.log("Credential hash:", credentialHash);
  console.log("Transaction hash:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
