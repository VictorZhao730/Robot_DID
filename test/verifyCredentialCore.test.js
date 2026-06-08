const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  canonicalize,
  credentialStatusHash,
  robotDidFromRegistry,
  signRegisterChallenge,
  verificationMethodId,
} = require("../lib/didUzheth");
const { verifyCredentialPolicy } = require("../lib/verifyCredentialCore");
const { ISSUANCE_MODEL } = require("../lib/credentialPolicies");

describe("verifyCredentialCore", function () {
  const metadataURI = "";
  const publicKey = "0x04robotPublicKey";

  async function deployFixture() {
    const [owner, otherAccount, robotWallet] = await ethers.getSigners();
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

    const did = await robotDidFromRegistry(registry, robotTokenId);
    const challenge = await signRegisterChallenge(robotWallet, did, publicKey, robotWallet.address);
    await registry.registerDID(
      publicKey,
      robotWallet.address,
      metadataURI,
      robotTokenId,
      challenge.signature
    );

    return {
      registry,
      issuerRegistry,
      did,
      owner,
      otherAccount,
      robotWallet,
    };
  }

  async function buildSelfSignedCredential({
    did,
    wallet,
    issuedAtSeconds,
    credentialType = "RobotSensorDataCredential",
  }) {
    const now = new Date(issuedAtSeconds * 1000);
    const expiration = new Date(now);
    expiration.setDate(expiration.getDate() + 1);

    const credential = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential", credentialType],
      issuer: did,
      issuanceDate: now.toISOString(),
      issuedAt: issuedAtSeconds,
      expirationDate: expiration.toISOString(),
      credentialSchema: {
        id: `urn:uzheth-schema:${credentialType}`,
        type: "JsonSchema2020",
      },
      credentialSubject: {
        id: did,
        sensorType: "temperature",
        value: "22.4",
        unit: "C",
        timestamp: now.toISOString(),
      },
    };

    const credentialHash = credentialStatusHash(credential);
    credential.id = `urn:uzheth-vc:${credentialHash}`;
    credential.credentialStatus = {
      id: `${credential.id}#status`,
      type: "RobotCredentialStatus2026",
      credentialHash,
    };

    const message = canonicalize(credential);
    const digest = ethers.keccak256(ethers.toUtf8Bytes(message));
    credential.proof = {
      type: "EcdsaSecp256k1Signature2019",
      created: now.toISOString(),
      proofPurpose: "assertionMethod",
      verificationMethod: verificationMethodId(did),
      signature: await wallet.signMessage(ethers.getBytes(digest)),
    };

    return credential;
  }

  it("accepts credentials signed with the robot key authorized at issuedAt", async function () {
    const { registry, issuerRegistry, did, robotWallet } = await deployFixture();
    const issuedAt = Number((await registry.getKeyHistoryEntry(did, 0)).validFrom);
    const credential = await buildSelfSignedCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: issuedAt,
    });

    const result = await verifyCredentialPolicy(credential, { registry, issuerRegistry });
    expect(result.valid).to.equal(true);
    expect(result.issuanceModel).to.equal(ISSUANCE_MODEL.ROBOT_SELF_SIGNED);
    expect(result.checks.robotKeyAuthorizedAtIssuance).to.equal(true);
  });

  it("allows historical credentials after suspend but rejects post-suspend issuance", async function () {
    const { registry, issuerRegistry, did, robotWallet } = await deployFixture();
    const issuedAt = Number((await registry.getKeyHistoryEntry(did, 0)).validFrom);
    const historicalCredential = await buildSelfSignedCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: issuedAt,
    });

    await registry.suspendDID(did);
    const suspendedAt = Number(await registry.getSuspendedAt(did));

    const historicalResult = await verifyCredentialPolicy(historicalCredential, {
      registry,
      issuerRegistry,
    });
    expect(historicalResult.valid).to.equal(true);

    const postSuspendCredential = await buildSelfSignedCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: suspendedAt + 1,
    });
    const postSuspendResult = await verifyCredentialPolicy(postSuspendCredential, {
      registry,
      issuerRegistry,
    });
    expect(postSuspendResult.valid).to.equal(false);
    expect(postSuspendResult.checks.issuanceAllowedAtTimestamp).to.equal(false);
  });

  it("rejects credentials issued during suspend after unsuspend", async function () {
    const { registry, issuerRegistry, did, robotWallet } = await deployFixture();

    await registry.suspendDID(did);
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    const duringSuspendAt = Number((await ethers.provider.getBlock("latest")).timestamp);
    const duringSuspendCredential = await buildSelfSignedCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: duringSuspendAt,
    });

    await registry.unsuspendDID(did);

    const result = await verifyCredentialPolicy(duringSuspendCredential, {
      registry,
      issuerRegistry,
    });
    expect(result.valid).to.equal(false);
    expect(result.checks.issuanceAllowedAtTimestamp).to.equal(false);
  });

  it("accepts anchored credentials when publishedAt is near issuedAt", async function () {
    const { registry, issuerRegistry, did, robotWallet } = await deployFixture();
    const issuedAt = Number((await registry.getKeyHistoryEntry(did, 0)).validFrom);
    const credential = await buildSelfSignedCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: issuedAt,
    });
    const credentialHash = credential.credentialStatus.credentialHash;

    await registry.anchorCredential(
      did,
      credentialHash,
      "RobotSensorDataCredential",
      0,
      0
    );

    const result = await verifyCredentialPolicy(credential, {
      registry,
      issuerRegistry,
      maxPublishDelaySeconds: 86400,
    });
    expect(result.valid).to.equal(true);
    expect(result.checks.anchorIssuanceTimingValid).to.equal(true);
    expect(result.anchorTiming.anchorTimingRequired).to.equal(true);
  });

  it("rejects backdated anchored credentials when publishedAt exceeds maxPublishDelay", async function () {
    const { registry, issuerRegistry, did, robotWallet } = await deployFixture();
    const issuedAt = Number((await registry.getKeyHistoryEntry(did, 0)).validFrom);
    const credential = await buildSelfSignedCredential({
      did,
      wallet: robotWallet,
      issuedAtSeconds: issuedAt,
    });
    const credentialHash = credential.credentialStatus.credentialHash;

    await ethers.provider.send("evm_increaseTime", [7200]);
    await ethers.provider.send("evm_mine", []);

    await registry.anchorCredential(
      did,
      credentialHash,
      "RobotSensorDataCredential",
      0,
      0
    );

    const result = await verifyCredentialPolicy(credential, {
      registry,
      issuerRegistry,
      maxPublishDelaySeconds: 3600,
    });
    expect(result.valid).to.equal(false);
    expect(result.checks.anchorIssuanceTimingValid).to.equal(false);
    expect(result.anchorTiming.publishedAtWithinMaxDelay).to.equal(false);
  });
});
