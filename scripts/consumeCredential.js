require("dotenv").config();

const { assertCredentialHashMatches, getHardhatRegistry, loadCredentialFile, requireEnv } = require("../lib/cliEnv");

async function main() {
  const filePath = process.argv[2] || requireEnv("CREDENTIAL_FILE");
  const credential = loadCredentialFile(filePath);
  const credentialHash = assertCredentialHashMatches(credential);
  const registry = await getHardhatRegistry(requireEnv("REGISTRY_ADDRESS"));
  const tx = await registry.consumeCredential(credentialHash);
  const receipt = await tx.wait();
  const record = await registry.getConsumptionRecord(credentialHash);
  console.log("Credential consumed on-chain");
  console.log("Credential hash:", credentialHash);
  console.log("Transaction hash:", receipt.hash);
  console.log(
    JSON.stringify(
      {
        mode: Number(record.mode),
        maxUses: record.maxUses.toString(),
        useCount: record.useCount.toString(),
        available: await registry.isConsumptionAvailable(credentialHash),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
