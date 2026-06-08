require("dotenv").config();

const { ethers } = require("hardhat");
const { getHardhatIssuerRegistry, requireEnv } = require("../lib/cliEnv");

async function main() {
  const account = ethers.getAddress(requireEnv("ISSUER_ADDRESS"));
  const issuerRegistry = await getHardhatIssuerRegistry(requireEnv("REGISTRY_ADDRESS"));
  const adminRole = await issuerRegistry.DEFAULT_ADMIN_ROLE();
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  if (!(await issuerRegistry.hasRole(adminRole, signerAddress)) {
    throw new Error(`PRIVATE_KEY account lacks DEFAULT_ADMIN_ROLE on issuer registry`);
  }

  const tx = await issuerRegistry.revokeIssuer(account);
  const receipt = await tx.wait();
  console.log("Issuer revoked:", account);
  console.log("Transaction hash:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
