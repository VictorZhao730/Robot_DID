const { ethers } = require("ethers");

const REGISTRY_LINK_ABI = [
  "function credentialIssuerRegistry() view returns (address)",
];

const ISSUER_REGISTRY_READ_ABI = [
  "function isIssuerActive(address issuer) view returns (bool)",
  "function getIssuer(address issuer) view returns (bool active, string metadataURI, uint256 updatedAt)",
  "function isAuthorizedIssuer(string credentialType, address issuer) view returns (bool)",
];

async function getIssuerRegistryLinkedTo(registryAddress, runner, issuerRegistryAbi = ISSUER_REGISTRY_READ_ABI) {
  const registry = new ethers.Contract(registryAddress, REGISTRY_LINK_ABI, runner);
  const issuerRegistryAddress = await registry.credentialIssuerRegistry();
  return new ethers.Contract(issuerRegistryAddress, issuerRegistryAbi, runner);
}

module.exports = {
  ISSUER_REGISTRY_READ_ABI,
  REGISTRY_LINK_ABI,
  getIssuerRegistryLinkedTo,
};
