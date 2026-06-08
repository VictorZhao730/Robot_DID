require("dotenv").config();

const { ethers } = require("hardhat");
const { getHardhatRegistry, requireEnv } = require("../lib/cliEnv");

async function main() {
  const registry = await getHardhatRegistry(requireEnv("REGISTRY_ADDRESS"));
  const did = requireEnv("ROBOT_DID");
  const newPrivateKey = requireEnv("NEW_ROBOT_PRIVATE_KEY");
  const newWallet = new ethers.Wallet(newPrivateKey);

  if (await registry.isUsedRobotKey(newWallet.address)) {
    throw new Error(`Rotation key already used: ${newWallet.address}`);
  }

  const tx = await registry.updatePublicKey(
    did,
    newWallet.signingKey.publicKey,
    newWallet.address
  );
  const receipt = await tx.wait();
  console.log("Robot key rotated:", did);
  console.log("New key address:", newWallet.address);
  console.log("Transaction hash:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
