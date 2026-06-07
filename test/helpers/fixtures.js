const { ethers } = require("hardhat");
const { didFromRobotTokenId, signRegisterChallenge } = require("../../lib/didUzheth");

const metadataURI = "";
const defaultPublicKey = "0x04robotPublicKey";

function publicKeyFromSigner(signer) {
  return new ethers.Wallet(signer.privateKey).signingKey.publicKey;
}

async function addControllerWithPermissions(registry, owner, did, controllerAddress, permissions) {
  const addController = registry.connect(owner).getFunction("addController(string,address,uint256)");
  return addController(did, controllerAddress, permissions);
}

async function deployFullStack() {
  const [owner, controller, issuer, otherAccount, robotWallet, secondRobotKey] =
    await ethers.getSigners();

  const RobotIdentityNFT = await ethers.getContractFactory("RobotIdentityNFT");
  const robotNFT = await RobotIdentityNFT.deploy();
  await robotNFT.waitForDeployment();
  await robotNFT.mintRobot(owner.address, metadataURI);
  const robotTokenId = 1n;

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

  const did = didFromRobotTokenId(robotTokenId);

  return {
    registry,
    robotNFT,
    issuerRegistry,
    robotTokenId,
    did,
    owner,
    controller,
    issuer,
    otherAccount,
    robotWallet,
    secondRobotKey,
  };
}

async function registerRobotDid(
  registry,
  owner,
  robotTokenId,
  {
    publicKey = defaultPublicKey,
    robotKeyAddress,
    robotSigner,
  }
) {
  const did = didFromRobotTokenId(robotTokenId);
  const signer = robotSigner || owner;
  const challenge = await signRegisterChallenge(signer, did, publicKey, robotKeyAddress);
  await registry
    .connect(owner)
    .registerDID(publicKey, robotKeyAddress, metadataURI, robotTokenId, challenge.signature);
  return did;
}

module.exports = {
  addControllerWithPermissions,
  defaultPublicKey,
  deployFullStack,
  metadataURI,
  publicKeyFromSigner,
  registerRobotDid,
};
