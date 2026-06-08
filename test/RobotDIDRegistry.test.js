const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  robotDidFromRegistry,
  signRegisterChallenge,
} = require("../lib/didUzheth");

describe("RobotDIDRegistry", function () {
  const publicKey = "0x04robotPublicKey";
  const metadataURI = "";

  async function deployRegistryFixture() {
    const [owner, otherAccount, robotSigner, secondRobotKey] = await ethers.getSigners();
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

    return {
      registry,
      robotNFT,
      issuerRegistry,
      robotTokenId,
      owner,
      otherAccount,
      robotSigner,
      secondRobotKey,
    };
  }

  async function registerRobot(
    registry,
    owner,
    robotTokenId,
    { publicKey: pk = publicKey, robotKeyAddress, robotSigner }
  ) {
    const did = await robotDidFromRegistry(registry, robotTokenId);
    const signer = robotSigner || owner;
    const challenge = await signRegisterChallenge(signer, did, pk, robotKeyAddress);
    return registry.connect(owner).registerDID(pk, robotKeyAddress, metadataURI, robotTokenId, challenge.signature);
  }

  it("registers a stable robot DID with robot key challenge signature", async function () {
    const { registry, owner, robotTokenId, robotNFT } = await deployRegistryFixture();
    const did = await robotDidFromRegistry(registry, robotTokenId);
    const network = await ethers.provider.getNetwork();
    expect(did).to.match(/^did:uzheth:robot:\d+:0x[a-f0-9]{40}:\d+$/);
    expect(did).to.equal(
      `did:uzheth:robot:${network.chainId}:${(await robotNFT.getAddress()).toLowerCase()}:${robotTokenId}`
    );

    await expect(
      registerRobot(registry, owner, robotTokenId, { robotKeyAddress: owner.address })
    )
      .to.emit(registry, "DIDRegistered")
      .withArgs(
        did,
        owner.address,
        robotTokenId,
        owner.address,
        publicKey,
        metadataURI,
        anyValue
      );

    expect(await registry.didExists(did)).to.equal(true);
    expect(await registry.isActive(did)).to.equal(true);
    expect(await registry.isSuspended(did)).to.equal(false);
  });

  it("rejects registration without valid robot key signature", async function () {
    const { registry, owner, robotTokenId, otherAccount } = await deployRegistryFixture();
    const did = await robotDidFromRegistry(registry, robotTokenId);
    const wrongChallenge = await signRegisterChallenge(
      otherAccount,
      did,
      publicKey,
      owner.address
    );

    await expect(
      registry
        .connect(owner)
        .registerDID(publicKey, owner.address, metadataURI, robotTokenId, wrongChallenge.signature)
    ).to.be.revertedWith("Invalid robot key signature");
  });

  it("suspends issuance while keeping DID active", async function () {
    const { registry, owner, robotTokenId } = await deployRegistryFixture();
    const did = await robotDidFromRegistry(registry, robotTokenId);

    await registerRobot(registry, owner, robotTokenId, { robotKeyAddress: owner.address });
    await expect(registry.suspendDID(did)).to.emit(registry, "DIDSuspended");

    const suspendedAt = await registry.getSuspendedAt(did);
    expect(await registry.isActive(did)).to.equal(true);
    expect(await registry.isSuspended(did)).to.equal(true);
    expect(await registry.isIssuanceAllowedAt(did, suspendedAt - 1n)).to.equal(true);
    expect(await registry.isIssuanceAllowedAt(did, suspendedAt)).to.equal(false);
  });

  it("keeps suspension-window issuance invalid after unsuspend", async function () {
    const { registry, owner, robotTokenId } = await deployRegistryFixture();
    const did = await robotDidFromRegistry(registry, robotTokenId);

    await registerRobot(registry, owner, robotTokenId, { robotKeyAddress: owner.address });
    await registry.suspendDID(did);
    const suspendedAt = await registry.getSuspendedAt(did);

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    const duringSuspend = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    expect(duringSuspend).to.be.gt(suspendedAt);
    expect(await registry.isIssuanceAllowedAt(did, duringSuspend)).to.equal(false);

    await registry.unsuspendDID(did);
    expect(await registry.isSuspended(did)).to.equal(false);

    expect(await registry.isIssuanceAllowedAt(did, suspendedAt - 1n)).to.equal(true);
    expect(await registry.isIssuanceAllowedAt(did, duringSuspend)).to.equal(false);

    await ethers.provider.send("evm_increaseTime", [60]);
    await ethers.provider.send("evm_mine", []);
    const afterUnsuspend = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    expect(await registry.isIssuanceAllowedAt(did, afterUnsuspend)).to.equal(true);
  });

  it("configures consumption on anchor and consumes single-use credentials once", async function () {
    const { registry, owner, robotTokenId } = await deployRegistryFixture();
    const did = await robotDidFromRegistry(registry, robotTokenId);
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("single-use"));

    await registerRobot(registry, owner, robotTokenId, { robotKeyAddress: owner.address });
    await registry.anchorCredential(did, credentialHash, "RobotSensorDataCredential", 1, 1);

    expect(await registry.isConsumptionAvailable(credentialHash)).to.equal(true);
    await registry.consumeCredential(credentialHash);
    expect(await registry.isConsumptionAvailable(credentialHash)).to.equal(false);
  });

  it("supports limited consumption with maxUses greater than 1", async function () {
    const { registry, owner, robotTokenId } = await deployRegistryFixture();
    const did = await robotDidFromRegistry(registry, robotTokenId);
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("limited-use"));

    await registerRobot(registry, owner, robotTokenId, { robotKeyAddress: owner.address });
    await registry.anchorCredential(did, credentialHash, "RobotSensorDataCredential", 1, 3);

    await registry.consumeCredential(credentialHash);
    await registry.consumeCredential(credentialHash);
    expect(await registry.isConsumptionAvailable(credentialHash)).to.equal(true);
    await registry.consumeCredential(credentialHash);
    expect(await registry.isConsumptionAvailable(credentialHash)).to.equal(false);
  });
});

const anyValue = require("@nomicfoundation/hardhat-chai-matchers/withArgs").anyValue;
