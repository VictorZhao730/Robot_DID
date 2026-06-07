const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFullStack, registerRobotDid, defaultPublicKey, addControllerWithPermissions } = require("./helpers/fixtures");

const anyValue = require("@nomicfoundation/hardhat-chai-matchers/withArgs").anyValue;

describe("RobotDIDRegistry lifecycle", function () {
  const CONTROLLER_KEY_ROTATION = 1;
  const CONTROLLER_CREDENTIAL_REVOCATION = 2;
  const CONTROLLER_ASSERTION = 4;

  it("rotates robot key and closes the previous history entry", async function () {
    const { registry, owner, robotWallet, robotTokenId, did } = await deployFullStack();

    await registerRobotDid(registry, owner, robotTokenId, {
      robotKeyAddress: robotWallet.address,
      robotSigner: robotWallet,
    });

    const secondRobotWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const newPublicKey = "0x04rotatedRobotPublicKey";
    const newKeyAddress = secondRobotWallet.address;

    await expect(
      registry.connect(owner).updatePublicKey(did, newPublicKey, newKeyAddress)
    )
      .to.emit(registry, "RobotKeyRotated")
      .withArgs(
        did,
        robotWallet.address,
        newKeyAddress,
        defaultPublicKey,
        newPublicKey,
        anyValue
      );

    expect(await registry.getKeyHistoryLength(did)).to.equal(2n);
    const firstEntry = await registry.getKeyHistoryEntry(did, 0);
    const secondEntry = await registry.getKeyHistoryEntry(did, 1);
    expect(firstEntry.validUntil).to.be.gt(0n);
    expect(secondEntry.keyAddress).to.equal(newKeyAddress);
    expect(secondEntry.validUntil).to.equal(0n);
  });

  it("allows a controller with key rotation permission to rotate", async function () {
    const { registry, owner, controller, robotWallet, robotTokenId, did } =
      await deployFullStack();

    await registerRobotDid(registry, owner, robotTokenId, {
      robotKeyAddress: robotWallet.address,
      robotSigner: robotWallet,
    });
    await addControllerWithPermissions(
      registry,
      owner,
      did,
      controller.address,
      CONTROLLER_KEY_ROTATION
    );

    const secondRobotWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const newPublicKey = "0x04controllerRotatedKey";
    const newKeyAddress = secondRobotWallet.address;
    await registry
      .connect(controller)
      .updatePublicKey(did, newPublicKey, newKeyAddress);

    expect(await registry.getControllerPermissions(did, controller.address)).to.equal(
      BigInt(CONTROLLER_KEY_ROTATION)
    );
  });

  it("revokes a DID and marks it inactive", async function () {
    const { registry, owner, robotWallet, robotTokenId, did } = await deployFullStack();

    await registerRobotDid(registry, owner, robotTokenId, {
      robotKeyAddress: robotWallet.address,
      robotSigner: robotWallet,
    });

    await expect(registry.connect(owner).revokeDID(did))
      .to.emit(registry, "DIDRevoked")
      .withArgs(did, anyValue);

    expect(await registry.isActive(did)).to.equal(false);
    expect(await registry.isRevoked(did)).to.equal(true);
    expect(await registry.didExists(did)).to.equal(true);
  });

  it("manages controllers, permissions, and credential revocation", async function () {
    const { registry, owner, controller, robotWallet, robotTokenId, did } =
      await deployFullStack();
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("controller-revoke"));

    await registerRobotDid(registry, owner, robotTokenId, {
      robotKeyAddress: robotWallet.address,
      robotSigner: robotWallet,
    });

    await expect(
      addControllerWithPermissions(
        registry,
        owner,
        did,
        controller.address,
        CONTROLLER_CREDENTIAL_REVOCATION | CONTROLLER_ASSERTION
      )
    )
      .to.emit(registry, "ControllerAdded")
      .withArgs(did, controller.address, CONTROLLER_CREDENTIAL_REVOCATION | CONTROLLER_ASSERTION, anyValue);

    const controllers = await registry.getControllers(did);
    expect(controllers).to.include(controller.address);

    await registry.connect(controller).revokeCredential(did, credentialHash);
    expect(await registry.isCredentialRevoked(credentialHash)).to.equal(true);

    await registry
      .connect(owner)
      .updateControllerPermissions(did, controller.address, CONTROLLER_ASSERTION);
    expect(await registry.getControllerPermissions(did, controller.address)).to.equal(
      BigInt(CONTROLLER_ASSERTION)
    );

    await expect(registry.connect(owner).removeController(did, controller.address))
      .to.emit(registry, "ControllerRemoved")
      .withArgs(did, controller.address, anyValue);
    expect(await registry.getControllerPermissions(did, controller.address)).to.equal(0n);
  });
});
