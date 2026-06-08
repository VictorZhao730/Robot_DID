require("dotenv").config();

const { ethers } = require("hardhat");
const {
  getHardhatRegistry,
  getHardhatRobotNft,
  requireEnv,
  robotTokenIdFromEnv,
} = require("../lib/cliEnv");

async function main() {
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const toAddress = ethers.getAddress(requireEnv("NFT_TRANSFER_TO"));
  const tokenId = robotTokenIdFromEnv();
  const registry = await getHardhatRegistry(registryAddress);
  const robotNft = await getHardhatRobotNft(registryAddress);
  const [signer] = await ethers.getSigners();
  const fromAddress = await signer.getAddress();
  const currentOwner = await robotNft.ownerOf(tokenId);

  if (currentOwner.toLowerCase() !== fromAddress.toLowerCase()) {
    throw new Error(
      `PRIVATE_KEY account (${fromAddress}) is not the current NFT owner (${currentOwner})`
    );
  }

  const tx = await robotNft.safeTransferFrom(fromAddress, toAddress, tokenId);
  const receipt = await tx.wait();
  console.log("Robot NFT transferred");
  console.log("Token ID:", tokenId.toString());
  console.log("From:", fromAddress);
  console.log("To:", toAddress);
  console.log("Transaction hash:", receipt.hash);
  console.log("Note: DID management rights follow the NFT owner automatically.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
