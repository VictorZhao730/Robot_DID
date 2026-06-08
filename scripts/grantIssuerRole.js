require("dotenv").config();

const { ethers } = require("hardhat");
const { getHardhatIssuerRegistry, optionalEnv, requireEnv } = require("../lib/cliEnv");

async function main() {
  const account = ethers.getAddress(requireEnv("ISSUER_ADDRESS"));
  const issuerRegistry = await getHardhatIssuerRegistry(requireEnv("REGISTRY_ADDRESS"));
  const adminRole = await issuerRegistry.DEFAULT_ADMIN_ROLE();
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  if (!(await issuerRegistry.hasRole(adminRole, signerAddress)) {
    throw new Error(`PRIVATE_KEY account lacks DEFAULT_ADMIN_ROLE on issuer registry`);
  }

  const credentialTypes = optionalEnv("CREDENTIAL_TYPE", "RobotMaintenanceCredential")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const grants = [];

  for (const credentialType of credentialTypes) {
    const role = await issuerRegistry.roleForCredentialType(credentialType);
    const tx = await issuerRegistry.grantRole(role, account);
    const receipt = await tx.wait();
    grants.push({ credentialType, role, transactionHash: receipt.hash });
  }

  console.log("Issuer roles granted to:", account);
  console.log(JSON.stringify(grants, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
