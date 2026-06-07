const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  consumptionModeLabel,
  fetchConsumptionStatus,
} = require("../lib/consumptionRegistry");
const { CONSUMPTION_LIMITED, CONSUMPTION_UNLIMITED } = require("../lib/didUzheth");
const { deployFullStack, registerRobotDid } = require("./helpers/fixtures");

describe("consumptionRegistry", function () {
  it("labels consumption modes", function () {
    expect(consumptionModeLabel(CONSUMPTION_UNLIMITED)).to.equal("unlimited");
    expect(consumptionModeLabel(CONSUMPTION_LIMITED, 1)).to.equal("limited (single-use)");
    expect(consumptionModeLabel(CONSUMPTION_LIMITED, 3)).to.equal("limited (3 uses)");
  });

  it("returns off-chain note when consumption is not configured", async function () {
    const { registry } = await deployFullStack();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("off-chain"));

    const status = await fetchConsumptionStatus(registry, hash, true);
    expect(status.configured).to.equal(false);
    expect(status.available).to.equal(true);
    expect(status.note).to.include("No on-chain consumption policy");
  });

  it("returns null when credential hash does not match content", async function () {
    const { registry } = await deployFullStack();
    const status = await fetchConsumptionStatus(registry, "0xabc", false);
    expect(status).to.equal(null);
  });

  it("reports limited consumption availability after anchor and consume", async function () {
    const { registry, owner, robotWallet, robotTokenId, did } = await deployFullStack();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("limited-status"));

    await registerRobotDid(registry, owner, robotTokenId, {
      robotKeyAddress: robotWallet.address,
      robotSigner: robotWallet,
    });
    await registry.anchorCredential(did, hash, "RobotSensorDataCredential", 1, 2);

    const beforeConsume = await fetchConsumptionStatus(registry, hash, true);
    expect(beforeConsume.configured).to.equal(true);
    expect(beforeConsume.mode).to.equal(CONSUMPTION_LIMITED);
    expect(beforeConsume.maxUses).to.equal("2");
    expect(beforeConsume.available).to.equal(true);

    await registry.consumeCredential(hash);
    await registry.consumeCredential(hash);

    const afterConsume = await fetchConsumptionStatus(registry, hash, true);
    expect(afterConsume.useCount).to.equal("2");
    expect(afterConsume.available).to.equal(false);
    expect(afterConsume.note).to.include("Consumption limit reached");
  });

  it("reports unlimited consumption as always available", async function () {
    const { registry, owner, robotWallet, robotTokenId, did } = await deployFullStack();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("unlimited-status"));

    await registerRobotDid(registry, owner, robotTokenId, {
      robotKeyAddress: robotWallet.address,
      robotSigner: robotWallet,
    });
    await registry.anchorCredential(did, hash, "RobotSensorDataCredential", 0, 0);

    const status = await fetchConsumptionStatus(registry, hash, true);
    expect(status.mode).to.equal(CONSUMPTION_UNLIMITED);
    expect(status.available).to.equal(true);

    await registry.consumeCredential(hash);
    const afterConsume = await fetchConsumptionStatus(registry, hash, true);
    expect(afterConsume.available).to.equal(true);
    expect(afterConsume.useCount).to.equal("0");
  });
});
