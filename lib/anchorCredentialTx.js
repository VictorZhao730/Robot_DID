const { getPrimaryCredentialType } = require("./credentialPolicies");
const {
  assertCredentialHashMatches,
  getHardhatRegistry,
  parseAnchorGasMode,
  parseConsumptionOptions,
  requireEnv,
  resolveHardhatAnchorSigner,
} = require("./cliEnv");

async function anchorCredentialFromObject(credential, { actorPrivateKey = null } = {}) {
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const gasMode = parseAnchorGasMode(process.env.ANCHOR_GAS_MODE || "actor");
  if (gasMode === "offchain") {
    throw new Error("Set ANCHOR_GAS_MODE to owner or actor to anchor on-chain");
  }

  const subjectDid = credential.credentialSubject?.id;
  if (!subjectDid) {
    throw new Error("Credential missing credentialSubject.id");
  }

  const credentialHash = assertCredentialHashMatches(credential);
  const credentialType = getPrimaryCredentialType(credential) || "";
  const { consumptionMode, maxUses } = parseConsumptionOptions();
  const signer = await resolveHardhatAnchorSigner(gasMode, actorPrivateKey);
  const registry = await getHardhatRegistry(registryAddress);
  const registryWithSigner = registry.connect(signer);
  const tx = await registryWithSigner.anchorCredential(
    subjectDid,
    credentialHash,
    credentialType,
    consumptionMode,
    maxUses
  );
  const receipt = await tx.wait();

  return {
    anchorTransactionHash: receipt.hash,
    subjectDid,
    credentialHash,
    credentialType,
    gasMode,
    consumptionMode,
    maxUses,
    gasPaidBy: gasMode,
  };
}

module.exports = {
  anchorCredentialFromObject,
};
