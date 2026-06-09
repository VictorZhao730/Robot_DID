// Deploy order: NFT → IssuerRegistry → DIDRegistry (registry holds immutable refs to both).
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "UZHETHs");

  const RobotIdentityNFT = await ethers.getContractFactory("RobotIdentityNFT");
  const robotNFT = await RobotIdentityNFT.deploy();
  await robotNFT.waitForDeployment();

  const CredentialIssuerRegistry = await ethers.getContractFactory(
    "CredentialIssuerRegistry"
  );
  const issuerRegistry = await CredentialIssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();

  const RobotDIDRegistry = await ethers.getContractFactory("RobotDIDRegistry");
  const registry = await RobotDIDRegistry.deploy(
    await robotNFT.getAddress(),
    await issuerRegistry.getAddress()
  );
  await registry.waitForDeployment();

  console.log("RobotIdentityNFT deployed to:", await robotNFT.getAddress());
  console.log("RobotDIDRegistry deployed to:", await registry.getAddress());
  console.log("CredentialIssuerRegistry deployed to:", await issuerRegistry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
