require("dotenv").config();

const { ethers } = require("hardhat");
const { getHardhatRobotNft, requireEnv } = require("../lib/cliEnv");

async function main() {
  const account = ethers.getAddress(requireEnv("MINTER_ADDRESS"));
  const robotNft = await getHardhatRobotNft(requireEnv("REGISTRY_ADDRESS"));
  const minterRole = await robotNft.MINTER_ROLE();
  const hasRole = await robotNft.hasRole(minterRole, account);
  console.log("Account:", account);
  console.log("RobotIdentityNFT:", await robotNft.getAddress());
  console.log("Has MINTER_ROLE:", hasRole);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
