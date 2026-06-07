const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFullStack } = require("./helpers/fixtures");

const anyValue = require("@nomicfoundation/hardhat-chai-matchers/withArgs").anyValue;

describe("CredentialIssuerRegistry", function () {
  it("registers issuers and authorizes them by credential type role", async function () {
    const { issuerRegistry, owner, issuer } = await deployFullStack();
    const maintainerRole = await issuerRegistry.MAINTAINER_ROLE();

    await expect(issuerRegistry.connect(owner).registerIssuer(issuer.address, "ipfs://issuer"))
      .to.emit(issuerRegistry, "IssuerRegistered")
      .withArgs(issuer.address, "ipfs://issuer", anyValue);

    await issuerRegistry.connect(owner).grantRole(maintainerRole, issuer.address);

    expect(await issuerRegistry.isIssuerActive(issuer.address)).to.equal(true);
    expect(
      await issuerRegistry.isAuthorizedIssuer("RobotMaintenanceCredential", issuer.address)
    ).to.equal(true);
    expect(
      await issuerRegistry.isAuthorizedIssuer("RobotManufacturingCredential", issuer.address)
    ).to.equal(false);
  });

  it("revokes issuers and rejects unsupported credential types", async function () {
    const { issuerRegistry, owner, issuer } = await deployFullStack();
    const maintainerRole = await issuerRegistry.MAINTAINER_ROLE();

    await issuerRegistry.connect(owner).registerIssuer(issuer.address, "");
    await issuerRegistry.connect(owner).grantRole(maintainerRole, issuer.address);

    await expect(issuerRegistry.connect(owner).revokeIssuer(issuer.address))
      .to.emit(issuerRegistry, "IssuerRevoked")
      .withArgs(issuer.address, anyValue);

    expect(await issuerRegistry.isIssuerActive(issuer.address)).to.equal(false);
    expect(
      await issuerRegistry.isAuthorizedIssuer("RobotMaintenanceCredential", issuer.address)
    ).to.equal(false);

    await expect(issuerRegistry.roleForCredentialType("UnknownCredentialType")).to.be.revertedWith(
      "Unsupported credential type"
    );
  });

  it("restricts registerIssuer to DEFAULT_ADMIN_ROLE", async function () {
    const { issuerRegistry, otherAccount } = await deployFullStack();

    await expect(
      issuerRegistry.connect(otherAccount).registerIssuer(otherAccount.address, "")
    ).to.be.reverted;
  });
});
