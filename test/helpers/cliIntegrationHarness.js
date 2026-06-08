/**
 * Single-process CLI smoke harness: deploy → register → check → verify → revoke.
 * Run: npx hardhat run test/helpers/cliIntegrationHarness.js --network hardhat
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("hardhat");
const {
  buildDidDocument,
  robotDidFromRegistry,
  signRegisterChallenge,
} = require("../../lib/didUzheth");
const { verifyCredentialPolicy } = require("../../lib/verifyCredentialCore");
const { buildSelfSignedSensorCredential } = require("./credentials");

function stepOk(name) {
  console.log(`STEP ${name} OK`);
}

async function main() {
  const [registryOwner] = await ethers.getSigners();
  const robotWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  await registryOwner.sendTransaction({
    to: robotWallet.address,
    value: ethers.parseEther("1"),
  });

  const RobotIdentityNFT = await ethers.getContractFactory("RobotIdentityNFT");
  const robotNFT = await RobotIdentityNFT.deploy();
  await robotNFT.waitForDeployment();
  stepOk("deployRobotNFT");

  const CredentialIssuerRegistry = await ethers.getContractFactory("CredentialIssuerRegistry");
  const issuerRegistry = await CredentialIssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();
  stepOk("deployIssuerRegistry");

  const RobotDIDRegistry = await ethers.getContractFactory("RobotDIDRegistry");
  const registry = await RobotDIDRegistry.deploy(
    await robotNFT.getAddress(),
    await issuerRegistry.getAddress()
  );
  await registry.waitForDeployment();
  stepOk("deployRegistry");

  const metadataURI = "";
  const mintTx = await robotNFT.mintRobot(registryOwner.address, metadataURI);
  const mintReceipt = await mintTx.wait();
  const robotTokenId = mintReceipt.logs
    .map((log) => {
      try {
        return robotNFT.interface.parseLog(log);
      } catch (_error) {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "RobotMinted")?.args.tokenId;
  if (robotTokenId == null) {
    throw new Error("RobotMinted event not found");
  }

  const did = await robotDidFromRegistry(registry, robotTokenId);
  const publicKey = robotWallet.signingKey.publicKey;
  const robotKeyAddress = robotWallet.address;
  const challenge = await signRegisterChallenge(robotWallet, did, publicKey, robotKeyAddress);

  await registry.registerDID(
    publicKey,
    robotKeyAddress,
    metadataURI,
    robotTokenId,
    challenge.signature
  );
  stepOk("registerRobot");

  const exists = await registry.didExists(did);
  const active = await registry.isActive(did);
  const record = await registry.getDID(did);
  const didDocument = buildDidDocument({
    did,
    publicKey: record.publicKey,
    metadataURI: record.metadataURI,
    robotTokenId: record.robotTokenId,
    active: record.active,
  });
  if (!exists || !active || !didDocument.id) {
    throw new Error("checkRobot failed");
  }
  stepOk("checkRobot");

  const issuedAt = Number((await registry.getKeyHistoryEntry(did, 0)).validFrom);
  const credential = await buildSelfSignedSensorCredential({
    did,
    wallet: robotWallet,
    issuedAtSeconds: issuedAt,
    registryAddress: await registry.getAddress(),
  });

  const tmpCredentialPath = path.join(os.tmpdir(), `did-smoke-${Date.now()}.json`);
  fs.writeFileSync(tmpCredentialPath, JSON.stringify(credential, null, 2));

  const verifyResult = await verifyCredentialPolicy(credential, {
    registry,
    issuerRegistry,
  });
  if (!verifyResult.valid) {
    throw new Error(`verifyCredential failed: ${JSON.stringify(verifyResult.checks)}`);
  }
  stepOk("verifyCredential");

  const revokeTx = await registry.revokeDID(did);
  await revokeTx.wait();
  if (await registry.isActive(did)) {
    throw new Error("revokeRobot failed");
  }
  stepOk("revokeRobot");

  fs.unlinkSync(tmpCredentialPath);
  console.log("SMOKE_OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
