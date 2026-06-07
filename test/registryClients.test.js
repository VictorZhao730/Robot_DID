const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getIssuerRegistryLinkedTo } = require("../lib/registryClients");
const { deployFullStack } = require("./helpers/fixtures");

describe("registryClients", function () {
  it("resolves CredentialIssuerRegistry from RobotDIDRegistry", async function () {
    const { registry, issuerRegistry } = await deployFullStack();
    const registryAddress = await registry.getAddress();
    const expectedIssuerAddress = await issuerRegistry.getAddress();

    const linked = await getIssuerRegistryLinkedTo(
      registryAddress,
      ethers.provider
    );

    expect(await linked.getAddress()).to.equal(expectedIssuerAddress);
    expect(await registry.credentialIssuerRegistry()).to.equal(expectedIssuerAddress);
  });
});
