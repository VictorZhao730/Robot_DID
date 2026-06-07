const { expect } = require("chai");
const {
  DEFAULT_MAX_PUBLISH_DELAY_SECONDS,
  verifyAnchorIssuanceTiming,
} = require("../lib/anchorTiming");

describe("anchorTiming", function () {
  it("skips timing check when credential is not anchored", function () {
    const result = verifyAnchorIssuanceTiming(1000, { anchored: false }, 3600);
    expect(result.anchorTimingRequired).to.equal(false);
    expect(result.anchorIssuanceTimingValid).to.equal(true);
  });

  it("accepts publishedAt within the allowed window", function () {
    const result = verifyAnchorIssuanceTiming(
      1000,
      { anchored: true, publishedAt: 4600 },
      3600
    );
    expect(result.anchorIssuanceTimingValid).to.equal(true);
    expect(result.publishedAtNotBeforeIssuedAt).to.equal(true);
    expect(result.publishedAtWithinMaxDelay).to.equal(true);
  });

  it("rejects publishedAt before issuedAt", function () {
    const result = verifyAnchorIssuanceTiming(
      2000,
      { anchored: true, publishedAt: 1000 },
      DEFAULT_MAX_PUBLISH_DELAY_SECONDS
    );
    expect(result.anchorIssuanceTimingValid).to.equal(false);
    expect(result.publishedAtNotBeforeIssuedAt).to.equal(false);
  });

  it("rejects publishedAt after issuedAt + maxPublishDelay", function () {
    const result = verifyAnchorIssuanceTiming(
      1000,
      { anchored: true, publishedAt: 5000 },
      3600
    );
    expect(result.anchorIssuanceTimingValid).to.equal(false);
    expect(result.publishedAtWithinMaxDelay).to.equal(false);
  });

  it("accepts publishedAt exactly at issuedAt (lower boundary)", function () {
    const result = verifyAnchorIssuanceTiming(
      5000,
      { anchored: true, publishedAt: 5000 },
      3600
    );
    expect(result.anchorIssuanceTimingValid).to.equal(true);
    expect(result.publishedAtNotBeforeIssuedAt).to.equal(true);
  });

  it("accepts publishedAt exactly at issuedAt + maxPublishDelay (upper boundary)", function () {
    const issuedAt = 1000;
    const maxDelay = 3600;
    const result = verifyAnchorIssuanceTiming(
      issuedAt,
      { anchored: true, publishedAt: issuedAt + maxDelay },
      maxDelay
    );
    expect(result.anchorIssuanceTimingValid).to.equal(true);
    expect(result.publishedAtWithinMaxDelay).to.equal(true);
  });

  it("rejects publishedAt one second past the upper boundary", function () {
    const issuedAt = 1000;
    const maxDelay = 3600;
    const result = verifyAnchorIssuanceTiming(
      issuedAt,
      { anchored: true, publishedAt: issuedAt + maxDelay + 1 },
      maxDelay
    );
    expect(result.anchorIssuanceTimingValid).to.equal(false);
    expect(result.publishedAtWithinMaxDelay).to.equal(false);
  });

  it("rejects missing issuedAt when anchor timing is required", function () {
    const result = verifyAnchorIssuanceTiming(
      undefined,
      { anchored: true, publishedAt: 2000 },
      DEFAULT_MAX_PUBLISH_DELAY_SECONDS
    );
    expect(result.anchorTimingRequired).to.equal(true);
    expect(result.anchorIssuanceTimingValid).to.equal(false);
    expect(result.note).to.include("Missing issuedAt");
  });

  it("rejects missing publishedAt when anchor timing is required", function () {
    const result = verifyAnchorIssuanceTiming(
      1000,
      { anchored: true, publishedAt: undefined },
      DEFAULT_MAX_PUBLISH_DELAY_SECONDS
    );
    expect(result.anchorTimingRequired).to.equal(true);
    expect(result.anchorIssuanceTimingValid).to.equal(false);
    expect(result.note).to.include("Missing publishedAt");
  });

  it("falls back to default max delay for invalid maxPublishDelaySeconds", function () {
    const issuedAt = 1000;
    const result = verifyAnchorIssuanceTiming(
      issuedAt,
      { anchored: true, publishedAt: issuedAt + DEFAULT_MAX_PUBLISH_DELAY_SECONDS },
      -1
    );
    expect(result.maxPublishDelaySeconds).to.equal(DEFAULT_MAX_PUBLISH_DELAY_SECONDS);
    expect(result.anchorIssuanceTimingValid).to.equal(true);
  });
});
