const DEFAULT_MAX_PUBLISH_DELAY_SECONDS = 86400;

const ANCHOR_TIMING_SKIPPED_NOTE =
  "No on-chain anchor; issuance timing not enforced (backdating not prevented)";
const ANCHOR_TIMING_OK_NOTE =
  "issuedAt <= publishedAt <= issuedAt + maxPublishDelay";
const ANCHOR_TIMING_FAIL_NOTE =
  "Anchor publishedAt must satisfy issuedAt <= publishedAt <= issuedAt + maxPublishDelay";

function verifyAnchorIssuanceTiming(
  issuedAtSeconds,
  onChainAnchor,
  maxPublishDelaySeconds = DEFAULT_MAX_PUBLISH_DELAY_SECONDS
) {
  const maxDelay = Number(maxPublishDelaySeconds);
  const safeMaxDelay = Number.isFinite(maxDelay) && maxDelay >= 0 ? maxDelay : DEFAULT_MAX_PUBLISH_DELAY_SECONDS;

  if (!onChainAnchor || !onChainAnchor.anchored) {
    return {
      anchorTimingRequired: false,
      anchorIssuanceTimingValid: true,
      maxPublishDelaySeconds: safeMaxDelay,
      note: ANCHOR_TIMING_SKIPPED_NOTE,
    };
  }

  const publishedAt = Number(onChainAnchor.publishedAt);
  const issuedAt = Number(issuedAtSeconds);

  if (!Number.isFinite(issuedAt)) {
    return {
      anchorTimingRequired: true,
      anchorIssuanceTimingValid: false,
      publishedAt,
      maxPublishDelaySeconds: safeMaxDelay,
      publishedAtNotBeforeIssuedAt: false,
      publishedAtWithinMaxDelay: false,
      note: "Missing issuedAt in credential",
    };
  }

  if (!Number.isFinite(publishedAt)) {
    return {
      anchorTimingRequired: true,
      anchorIssuanceTimingValid: false,
      issuedAt,
      maxPublishDelaySeconds: safeMaxDelay,
      publishedAtNotBeforeIssuedAt: false,
      publishedAtWithinMaxDelay: false,
      note: "Missing publishedAt on anchor record",
    };
  }

  const publishedAtNotBeforeIssuedAt = publishedAt >= issuedAt;
  const publishedAtWithinMaxDelay = publishedAt <= issuedAt + safeMaxDelay;
  const anchorIssuanceTimingValid =
    publishedAtNotBeforeIssuedAt && publishedAtWithinMaxDelay;

  return {
    anchorTimingRequired: true,
    anchorIssuanceTimingValid,
    issuedAt,
    publishedAt,
    maxPublishDelaySeconds: safeMaxDelay,
    publishedAtNotBeforeIssuedAt,
    publishedAtWithinMaxDelay,
    note: anchorIssuanceTimingValid ? ANCHOR_TIMING_OK_NOTE : ANCHOR_TIMING_FAIL_NOTE,
  };
}

module.exports = {
  ANCHOR_TIMING_FAIL_NOTE,
  ANCHOR_TIMING_OK_NOTE,
  ANCHOR_TIMING_SKIPPED_NOTE,
  DEFAULT_MAX_PUBLISH_DELAY_SECONDS,
  verifyAnchorIssuanceTiming,
};
