require("dotenv").config();

const { ethers } = require("hardhat");
const {
  buildDidDocument,
  didFromRobotTokenId,
  signRegisterChallenge,
} = require("../lib/didUzheth");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

async function main() {
  const registryAddress = requireEnv("REGISTRY_ADDRESS");
  const robotPrivateKey = requireEnv("ROBOT_PRIVATE_KEY");
  const [registryOwner] = await ethers.getSigners();

  const robotWallet = new ethers.Wallet(robotPrivateKey);
  const robotKeyAddress = await robotWallet.getAddress();
  const publicKey = robotWallet.signingKey.publicKey;
  const metadataURI = "";

  const registry = await ethers.getContractAt("RobotDIDRegistry", registryAddress);
  const robotNFTAddress = await registry.robotIdentityNFT();
  const robotNFT = await ethers.getContractAt("RobotIdentityNFT", robotNFTAddress);
  const mintTx = await robotNFT.mintRobot(registryOwner.address, metadataURI);
  const mintReceipt = await mintTx.wait();
  const robotTokenId = getRobotTokenId(robotNFT, mintReceipt);
  const did = didFromRobotTokenId(robotTokenId);

  if (await registry.isUsedRobotKey(robotKeyAddress)) {
    throw new Error(`Robot key already used: ${robotKeyAddress}`);
  }

  const challenge = await signRegisterChallenge(robotWallet, did, publicKey, robotKeyAddress);
  console.log("Register challenge:", JSON.stringify(challenge.payload, null, 2));
  console.log("Challenge digest:", challenge.digest);
  console.log("Challenge signature valid:", challenge.signatureValid);

  const tx = await registry.registerDID(
    publicKey,
    robotKeyAddress,
    metadataURI,
    robotTokenId,
    challenge.signature
  );
  const receipt = await tx.wait();
  const didDocument = buildDidDocument({
    did,
    publicKey,
    metadataURI,
    robotTokenId,
  });

  console.log("Robot NFT address:", robotNFTAddress);
  console.log("Robot NFT mint transaction:", mintReceipt.hash);
  console.log("Robot NFT tokenId:", robotTokenId.toString());
  console.log("Transaction hash:", receipt.hash);
  console.log("DID:", did);
  console.log("Robot key address:", robotKeyAddress);
  console.log("Public key:", publicKey);
  console.log("DID Document:", JSON.stringify(didDocument, null, 2));
}

function getRobotTokenId(robotNFT, receipt) {
  for (const log of receipt.logs) {
    try {
      const parsedLog = robotNFT.interface.parseLog(log);
      if (parsedLog && parsedLog.name === "RobotMinted") {
        return parsedLog.args.tokenId;
      }
    } catch (_error) {
      // Ignore logs emitted by other contracts.
    }
  }

  throw new Error("RobotMinted event not found in mint receipt");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
