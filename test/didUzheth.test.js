const { expect } = require("chai");
const { ethers } = require("ethers");
const {
  addressFromDid,
  buildDidDocument,
  didFromAddress,
  didFromRobotTokenId,
  isRobotDid,
  publicKeyToAddress,
  verificationMethodId,
} = require("../lib/didUzheth");

describe("did:uzheth helpers", function () {
  const wallet = ethers.Wallet.createRandom();
  const addressDid = didFromAddress(wallet.address);
  const robotDid = didFromRobotTokenId(1);

  it("converts between controller address and DID", function () {
    expect(addressDid).to.equal(`did:uzheth:${wallet.address}`);
    expect(addressFromDid(addressDid)).to.equal(wallet.address);
  });

  it("builds stable robot DIDs from token IDs", function () {
    expect(robotDid).to.equal("did:uzheth:robot:1");
    expect(isRobotDid(robotDid)).to.equal(true);
    expect(isRobotDid(addressDid)).to.equal(false);
  });

  it("builds a W3C-style DID Document for robot DIDs", function () {
    const document = buildDidDocument({
      did: robotDid,
      publicKey: wallet.signingKey.publicKey,
      metadataURI: "",
      robotTokenId: 1,
    });

    expect(document["@context"]).to.include("https://www.w3.org/ns/did/v1");
    expect(document.id).to.equal(robotDid);
    expect(document.verificationMethod[0].id).to.equal(verificationMethodId(robotDid));
    expect(document.verificationMethod[0].blockchainAccountId).to.equal(
      `eip155:70207:${publicKeyToAddress(wallet.signingKey.publicKey)}`
    );
    expect(document.authentication).to.deep.equal([verificationMethodId(robotDid)]);
    expect(document.robotTokenId).to.equal("1");
  });
});
