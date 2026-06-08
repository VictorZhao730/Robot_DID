require("dotenv").config();

const { ethers } = require("hardhat");
const { buildDidDocument } = require("../lib/didUzheth");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

async function main() {
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const did = requireEnv("ROBOT_DID");
  const registry = await ethers.getContractAt("RobotDIDRegistry", registryAddress);

  const exists = await registry.didExists(did);
  const active = await registry.isActive(did);

  console.log("DID:", did);
  console.log("exists:", exists);
  console.log("active:", active);

  if (!exists) {
    return;
  }

  const record = await registry.getDID(did);
  const robotNftAddress = await registry.robotIdentityNFT();
  const historyLength = await registry.getKeyHistoryLength(did);
  const keyHistory = [];
  for (let index = 0; index < Number(historyLength); index += 1) {
    keyHistory.push(await registry.getKeyHistoryEntry(did, index));
  }

  console.log("owner:", record.owner);
  console.log("publicKey:", record.publicKey);
  console.log("metadataURI:", record.metadataURI);
  console.log("robotTokenId:", record.robotTokenId.toString());
  console.log("createdAt:", record.createdAt.toString());
  console.log("updatedAt:", record.updatedAt.toString());
  console.log("keyHistory:", keyHistory);
  console.log(
    "didDocument:",
    JSON.stringify(
      buildDidDocument({
        did,
        publicKey: record.publicKey,
        metadataURI: record.metadataURI,
        robotTokenId: record.robotTokenId,
        robotNftAddress,
        active: record.active,
      }),
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
