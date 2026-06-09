// Read anchor metadata from RobotDIDRegistry for verification timing checks.
const ANCHOR_NOT_REQUIRED_NOTE =
  "No on-chain anchor found; verification does not require anchoring";
const ANCHOR_AUDIT_NOTE =
  "Anchor provides publishedAt for issuance timing verification when anchored";

async function fetchOnChainAnchor(registry, credentialHash, credentialHashMatchesContent) {
  if (!credentialHashMatchesContent) {
    return null;
  }

  const anchored = await registry.isCredentialAnchored(credentialHash);
  if (!anchored) {
    return {
      anchored: false,
      note: ANCHOR_NOT_REQUIRED_NOTE,
    };
  }

  const anchor = await registry.getCredentialAnchor(credentialHash);
  return {
    anchored: true,
    subjectDid: anchor.subjectDid,
    publisher: anchor.publisher,
    credentialType: anchor.credentialType,
    publishedAt: Number(anchor.publishedAt),
    note: ANCHOR_AUDIT_NOTE,
  };
}

module.exports = {
  ANCHOR_AUDIT_NOTE,
  ANCHOR_NOT_REQUIRED_NOTE,
  fetchOnChainAnchor,
};
