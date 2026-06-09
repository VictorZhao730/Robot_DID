// Optional post-issuance anchor tx (ANCHOR_GAS_MODE: offchain | owner | actor).
const { ethers } = require("ethers");
const { getPrimaryCredentialType } = require("./credentialPolicies");
const {
  assertCredentialHashMatches,
  getNodeRegistrySigner,
  optionalEnv,
  parseAnchorGasMode,
  parseConsumptionOptions,
  requireEnv,
} = require("./cliEnv");
const { REGISTRY_ABI } = require("./registryAbis");

async function maybeAnchorCredential(credential, { actorPrivateKeyEnv }) {
  const gasMode = parseAnchorGasMode();
  if (gasMode === "offchain") {
    return null;
  }

  const rpcUrl = requireEnv("UZHETH_POS_RPC_URL");
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const subjectDid = credential.credentialSubject?.id;
  if (!subjectDid) {
    throw new Error("Credential missing credentialSubject.id");
  }

  const credentialHash = assertCredentialHashMatches(credential);
  const credentialType = getPrimaryCredentialType(credential) || "";
  const { consumptionMode, maxUses } = parseConsumptionOptions();

  let privateKey;
  if (gasMode === "owner") {
    privateKey = requireEnv("PRIVATE_KEY");
  } else {
    privateKey = optionalEnv(actorPrivateKeyEnv) || optionalEnv("ANCHOR_ACTOR_PRIVATE_KEY");
    if (!privateKey) {
      throw new Error(`${actorPrivateKeyEnv} or ANCHOR_ACTOR_PRIVATE_KEY is required when ANCHOR_GAS_MODE=actor`);
    }
  }

  const signer = await getNodeRegistrySigner(privateKey, rpcUrl);
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);
  const tx = await registry.anchorCredential(
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
    gasPaidBy: gasMode === "owner" ? "owner" : "actor",
  };
}

module.exports = {
  maybeAnchorCredential,
};
