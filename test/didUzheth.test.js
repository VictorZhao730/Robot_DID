const { expect } = require("chai");
const { ethers } = require("ethers");
const {
  addressFromDid,
  buildDidDocument,
  didFromAddress,
  didFromRobotTokenId,
  isRobotDid,
  parseRobotDid,
  publicKeyToAddress,
  verificationMethodId,
} = require("../lib/didUzheth");

describe("did:uzheth helpers", function () {
  const wallet = ethers.Wallet.createRandom();
  const addressDid = didFromAddress(wallet.address);
  const chainId = 70207;
  const nftAddress = "0x00000000000000000000000000000000000000a1";
  const robotDid = didFromRobotTokenId(1, chainId, nftAddress);

  it("converts between controller address and DID", function () {
    expect(addressDid).to.equal(`did:uzheth:${wallet.address}`);
    expect(addressFromDid(addressDid)).to.equal(wallet.address);
  });

  it("builds globally scoped robot DIDs from chainId, NFT address, and tokenId", function () {
    expect(robotDid).to.equal(
      "did:uzheth:robot:70207:0x00000000000000000000000000000000000000a1:1"
    );
    expect(isRobotDid(robotDid)).to.equal(true);
    expect(isRobotDid(addressDid)).to.equal(false);
    expect(parseRobotDid(robotDid)).to.deep.equal({
      chainId: "70207",
      nftAddress: ethers.getAddress(nftAddress),
      tokenId: "1",
    });
  });

  it("rejects legacy token-only robot DIDs", function () {
    expect(() => parseRobotDid("did:uzheth:robot:1")).to.throw(/Invalid robot DID format/);
  });

  it("builds a W3C-style DID Document for robot DIDs", function () {
    const document = buildDidDocument({
      did: robotDid,
      publicKey: wallet.signingKey.publicKey,
      metadataURI: "",
      robotTokenId: 1,
      robotNftAddress: nftAddress,
      chainId,
    });

    expect(document["@context"]).to.include("https://www.w3.org/ns/did/v1");
    expect(document.id).to.equal(robotDid);
    expect(document.verificationMethod[0].id).to.equal(verificationMethodId(robotDid));
    expect(document.verificationMethod[0].blockchainAccountId).to.equal(
      `eip155:70207:${publicKeyToAddress(wallet.signingKey.publicKey)}`
    );
    expect(document.authentication).to.deep.equal([verificationMethodId(robotDid)]);
    expect(document.robotTokenId).to.equal("1");
    expect(document.robotNftAddress).to.equal(nftAddress.toLowerCase());
    expect(document.service[0].serviceEndpoint).to.equal(
      `eip155:70207/erc721:${nftAddress.toLowerCase()}/1`
    );
  });
});
