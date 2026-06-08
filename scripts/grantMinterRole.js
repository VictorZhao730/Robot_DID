require("dotenv").config();

const { ethers } = require("hardhat");
const { getHardhatRobotNft, requireEnv } = require("../lib/cliEnv");

async function main() {
  const account = ethers.getAddress(requireEnv("MINTER_ADDRESS"));
  const robotNft = await getHardhatRobotNft(requireEnv("REGISTRY_ADDRESS"));
  const minterRole = await robotNft.MINTER_ROLE();
  const tx = await robotNft.grantRole(minterRole, account);
  const receipt = await tx.wait();
  console.log("MINTER_ROLE granted to:", account);
  console.log("Transaction hash:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
