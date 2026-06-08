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

function isVerifiableCredential(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const types = Array.isArray(value.type) ? value.type : [value.type];
  return types.includes("VerifiableCredential") && Boolean(value.credentialSubject);
}

function parseCredentialJsonInput(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Select a credential JSON file or paste credential JSON");
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const commentIdx = trimmed.search(/\n\s*\/\//);
    const candidate = commentIdx >= 0 ? trimmed.slice(0, commentIdx).trim() : trimmed;
    try {
      parsed = JSON.parse(candidate);
    } catch (_retryError) {
      throw new Error(
        `Invalid credential JSON: ${error.message}. Paste only the VerifiableCredential object (not anchor output).`
      );
    }
  }

  if (parsed?.credential && isVerifiableCredential(parsed.credential)) {
    return parsed.credential;
  }

  if (isVerifiableCredential(parsed)) {
    return parsed;
  }

  throw new Error("JSON does not look like a VerifiableCredential");
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
