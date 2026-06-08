require("dotenv").config();

const { getHardhatRegistry, requireEnv } = require("../lib/cliEnv");

async function main() {
  const registry = await getHardhatRegistry(requireEnv("REGISTRY_ADDRESS"));
  const did = requireEnv("ROBOT_DID");
  const tx = await registry.suspendDID(did);
  const receipt = await tx.wait();
  console.log("DID suspended:", did);
  console.log("Transaction hash:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
