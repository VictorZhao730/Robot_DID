const { expect } = require("chai");
const { ethers } = require("hardhat");
const { verifyCredentialPolicy } = require("../lib/verifyCredentialCore");
const { ISSUANCE_MODEL } = require("../lib/credentialPolicies");
const { deployFullStack, registerRobotDid, addControllerWithPermissions } = require("./helpers/fixtures");
const {
  buildControllerMaintenanceLogCredential,
  buildExternalMaintenanceCredential,
  buildSelfSignedSensorCredential,
} = require("./helpers/credentials");

describe("verifyCredentialCore extended", function () {
  const CONTROLLER_ASSERTION = 4;
  const CONTROLLER_CREDENTIAL_REVOCATION = 2;

  async function setupRegisteredRobot() {
    const fx = await deployFullStack();
    const { registry, owner, robotWallet, robotTokenId, did } = fx;

    await registerRobotDid(registry, owner, robotTokenId, {
      robotKeyAddress: robotWallet.address,
      robotSigner: robotWallet,
    });

    const issuedAt = Number((await registry.getKeyHistoryEntry(did, 0)).validFrom);
    return { ...fx, issuedAt };
  }

  it("accepts controller-delegated maintenance logs with assertion permission", async function () {
    const { registry, issuerRegistry, owner, controller, did, issuedAt } =
      await setupRegisteredRobot();

    await addControllerWithPermissions(registry, owner, did, controller.address, CONTROLLER_ASSERTION);

    const credential = await buildControllerMaintenanceLogCredential({
      subjectDid: did,
      controllerWallet: controller,
      issuedAtSeconds: issuedAt,
      registryAddress: await registry.getAddress(),
    });

    const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });
    expect(result.valid).to.equal(true);
    expect(result.issuanceModel).to.equal(ISSUANCE_MODEL.CONTROLLER_DELEGATED);
    expect(result.checks.controllerAssertionAuthorized).to.equal(true);
    expect(result.checks.signerControlsControllerDID).to.equal(true);
  });

  it("rejects controller-delegated credentials when assertion permission is missing", async function () {
    const { registry, issuerRegistry, owner, controller, did, issuedAt } =
      await setupRegisteredRobot();

    await addControllerWithPermissions(
      registry,
      owner,
      did,
      controller.address,
      CONTROLLER_CREDENTIAL_REVOCATION
    );

    const credential = await buildControllerMaintenanceLogCredential({
      subjectDid: did,
      controllerWallet: controller,
      issuedAtSeconds: issuedAt,
      registryAddress: await registry.getAddress(),
    });

    const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });
    expect(result.valid).to.equal(false);
    expect(result.checks.controllerAssertionAuthorized).to.equal(false);
  });

  it("accepts external issuer maintenance credentials with registry role", async function () {
    const { registry, issuerRegistry, owner, issuer, did, issuedAt } =
      await setupRegisteredRobot();
    const maintainerRole = await issuerRegistry.MAINTAINER_ROLE();

    await issuerRegistry.connect(owner).registerIssuer(issuer.address, "");
    await issuerRegistry.connect(owner).grantRole(maintainerRole, issuer.address);

    const credential = await buildExternalMaintenanceCredential({
      subjectDid: did,
      issuerWallet: issuer,
      issuedAtSeconds: issuedAt,
      registryAddress: await registry.getAddress(),
    });

    const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });
    expect(result.valid).to.equal(true);
    expect(result.issuanceModel).to.equal(ISSUANCE_MODEL.EXTERNAL_ISSUER_SIGNED);
    expect(result.checks.issuerHasRequiredRole).to.equal(true);
    expect(result.checks.issuerDIDActive).to.equal(true);
  });

  it("rejects external issuer credentials after issuer revocation", async function () {
    const { registry, issuerRegistry, owner, issuer, did, issuedAt } =
      await setupRegisteredRobot();
    const maintainerRole = await issuerRegistry.MAINTAINER_ROLE();

    await issuerRegistry.connect(owner).registerIssuer(issuer.address, "");
    await issuerRegistry.connect(owner).grantRole(maintainerRole, issuer.address);
    await issuerRegistry.connect(owner).revokeIssuer(issuer.address);

    const credential = await buildExternalMaintenanceCredential({
      subjectDid: did,
      issuerWallet: issuer,
      issuedAtSeconds: issuedAt,
      registryAddress: await registry.getAddress(),
    });

    const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });
    expect(result.valid).to.equal(false);
    expect(result.checks.issuerDIDActive).to.equal(false);
  });

  it("rejects credentials when on-chain consumption limit is reached", async function () {
    const { registry, issuerRegistry, robotWallet, did, issuedAt } =
      await setupRegisteredRobot();

    const credential = await buildSelfSignedSensorCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: issuedAt,
      registryAddress: await registry.getAddress(),
    });
    const credentialHash = credential.credentialStatus.credentialHash;

    await registry.anchorCredential(did, credentialHash, "RobotSensorDataCredential", 1, 1);
    await registry.consumeCredential(credentialHash);

    const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });
    expect(result.valid).to.equal(false);
    expect(result.checks.consumptionAvailable).to.equal(false);
    expect(result.consumptionStatus.available).to.equal(false);
  });

  it("rejects revoked credentials on-chain", async function () {
    const { registry, issuerRegistry, owner, did, issuedAt, robotWallet } =
      await setupRegisteredRobot();

    const credential = await buildSelfSignedSensorCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: issuedAt,
      registryAddress: await registry.getAddress(),
    });
    const credentialHash = credential.credentialStatus.credentialHash;

    await registry.connect(owner).revokeCredential(did, credentialHash);

    const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });
    expect(result.valid).to.equal(false);
    expect(result.checks.credentialNotRevoked).to.equal(false);
  });
});
