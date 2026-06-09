// CLI credential verifier; exit 0 = valid, 1 = invalid. Optional --consume after verify.
require("dotenv").config();

const fs = require("fs");
const { ethers } = require("ethers");
const { buildDidDocument } = require("../lib/didUzheth");
const { verifyCredentialPolicy } = require("../lib/verifyCredentialCore");
const { getIssuerRegistryLinkedTo } = require("../lib/registryClients");
const {
  assertCredentialHashMatches,
  optionalEnv,
  requireEnv,
} = require("../lib/cliEnv");
const { REGISTRY_ABI } = require("../lib/registryAbis");
const { DEFAULT_MAX_PUBLISH_DELAY_SECONDS } = require("../lib/anchorTiming");

function parseArgs(argv) {
  const flags = new Set();
  const paths = [];
  for (const arg of argv.slice(2)) {
    if (arg === "--consume") {
      flags.add("consume");
    } else if (!arg.startsWith("-")) {
      paths.push(arg);
    }
  }
  return { flags, filePath: paths[0] || null };
}

async function main() {
  const { flags, filePath } = parseArgs(process.argv);
  if (!filePath) {
    console.log("INVALID: Credential file path is required");
    process.exitCode = 1;
    return;
  }

  const rpcUrl = requireEnv("UZHETH_POS_RPC_URL");
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const maxPublishDelaySeconds = Number(
    optionalEnv("MAX_PUBLISH_DELAY_SECONDS", String(DEFAULT_MAX_PUBLISH_DELAY_SECONDS))
  );

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
  const issuerRegistry = await getIssuerRegistryLinkedTo(registryAddress, provider);
  const credential = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const result = await verifyCredentialPolicy(credential, {
    registry,
    issuerRegistry,
    maxPublishDelaySeconds,
  });

  if (!result.valid) {
    console.log("INVALID: Credential failed verification policy");
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  const subjectId = credential.credentialSubject.id;
  const [record, controllers] = await Promise.all([
    registry.getDID(subjectId),
    registry.getControllers(subjectId),
  ]);

  console.log("VALID: Credential verified successfully");
  console.log(
    "Linked CredentialIssuerRegistry:",
    await issuerRegistry.getAddress()
  );
  console.log(JSON.stringify(result, null, 2));
  const robotNftAddress = await registry.robotIdentityNFT();
  console.log(
    "DID Document:",
    JSON.stringify(
      buildDidDocument({
        did: subjectId,
        publicKey: record.publicKey,
        metadataURI: record.metadataURI,
        robotTokenId: record.robotTokenId,
        robotNftAddress,
        active: record.active,
        controllers,
      }),
      null,
      2
    )
  );

  if (!flags.has("consume")) {
    return;
  }

  const credentialHash = assertCredentialHashMatches(credential);
  const consumptionRecord = await registry.getConsumptionRecord(credentialHash);
  if (!consumptionRecord.configured) {
    console.log(
      "VALID: Verified — consumption not configured; cannot consume on-chain"
    );
    return;
  }

  const privateKey = requireEnv("PRIVATE_KEY");
  const signer = new ethers.Wallet(privateKey, provider);
  const registryWithSigner = registry.connect(signer);
  const tx = await registryWithSigner.consumeCredential(credentialHash);
  const receipt = await tx.wait();
  const updated = await registry.getConsumptionRecord(credentialHash);
  const available = await registry.isConsumptionAvailable(credentialHash);
  console.log(
    available
      ? "Credential consumed on-chain (more uses remain)"
      : "Credential consumed on-chain (limit reached)"
  );
  console.log(
    JSON.stringify(
      {
        transactionHash: receipt.hash,
        credentialHash,
        mode: Number(updated.mode),
        maxUses: updated.maxUses.toString(),
        useCount: updated.useCount.toString(),
        available,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`INVALID: ${error.message}`);
  process.exitCode = 1;
});
