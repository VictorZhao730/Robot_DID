require("dotenv").config();

const { ethers } = require("hardhat");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

async function main() {
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const did = requireEnv("ROBOT_DID");
  const registry = await ethers.getContractAt("RobotDIDRegistry", registryAddress);

  const tx = await registry.revokeDID(did);
  const receipt = await tx.wait();

  console.log("Transaction hash:", receipt.hash);
  console.log("Revoked DID:", did);
  console.log("DID revoked successfully");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
