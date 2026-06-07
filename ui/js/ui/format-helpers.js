function boolCell(value) {
  return value
    ? '<span class="matrix-yes">yes</span>'
    : '<span class="matrix-no">no</span>';
}

function escapeHtml(value) {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseIssuerMetadata(metadataURI) {
  if (!metadataURI) {
    return null;
  }

  try {
    return JSON.parse(metadataURI);
  } catch (_error) {
    return metadataURI;
  }
}

function formatIssuerProfile(issuerRecord) {
  const parsed = parseIssuerMetadata(issuerRecord.metadataURI);
  const profileObject =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const fallbackName =
    typeof parsed === "string" && parsed.trim() ? parsed.trim() : "Unknown issuer";
  return {
    name: profileObject.name || fallbackName,
    type: profileObject.type || profileObject.organizationType || "unspecified",
    remark:
      profileObject.remark ||
      profileObject.note ||
      profileObject.description ||
      profileObject.website ||
      "",
    activeStatus: issuerRecord.active ? "active" : "revoked/inactive",
    active: issuerRecord.active,
    updatedAt: issuerRecord.updatedAt.toString(),
  };
}
