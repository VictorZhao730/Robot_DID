const { expect } = require("chai");
const { fetchOnChainAnchor } = require("../lib/onChainAnchor");

describe("onChainAnchor", function () {
  it("returns null when credential hash does not match content", async function () {
    const registry = {
      isCredentialAnchored: async () => {
        throw new Error("should not query chain");
      },
    };

    expect(await fetchOnChainAnchor(registry, "0xabc", false)).to.equal(null);
  });

  it("returns anchored false when hash matches but no anchor exists", async function () {
    const registry = {
      isCredentialAnchored: async () => false,
    };

    const result = await fetchOnChainAnchor(registry, "0xabc", true);
    expect(result.anchored).to.equal(false);
    expect(result.note).to.match(/does not require anchoring/);
  });

  it("returns anchor audit metadata when hash is anchored", async function () {
    const registry = {
      isCredentialAnchored: async () => true,
      getCredentialAnchor: async () => ({
        subjectDid: "did:uzheth:robot:1",
        publisher: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        credentialType: "RobotSensorDataCredential",
        publishedAt: 1710000000n,
      }),
    };

    const result = await fetchOnChainAnchor(registry, "0xabc", true);
    expect(result).to.deep.equal({
      anchored: true,
      subjectDid: "did:uzheth:robot:1",
      publisher: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      credentialType: "RobotSensorDataCredential",
      publishedAt: 1710000000,
      note: "Anchor provides publishedAt for issuance timing verification when anchored",
    });
  });
});
