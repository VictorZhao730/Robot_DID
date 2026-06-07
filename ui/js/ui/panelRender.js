const QUERY_PANEL_IDS = new Set([
  "registryPanel",
  "didDocumentPanel",
  "timelinePanel",
  "matrixPanel",
  "verificationPanel",
]);

const QUERY_PANEL_OUTPUT_IDS = {
  registryPanel: "registryOutput",
  didDocumentPanel: "didDocumentOutput",
  timelinePanel: "timelineOutput",
  matrixPanel: "matrixOutput",
  verificationPanel: "verificationOutput",
};

const queryPanelState = new Map();
const queryPanelViewMode = new Map();

function parsePanelPayload(value) {
  if (typeof value === "object" && value !== null) {
    return value;
  }

  if (typeof value !== "string") {
    return { __message: String(value) };
  }

  const text = value.trim();
  if (
    !text ||
    text.startsWith("Loading ") ||
    text.startsWith("No ") ||
    text.includes("unavailable:")
  ) {
    return { __message: value, __empty: !text.startsWith("Loading ") };
  }

  if (text.startsWith("INVALID:") || text.startsWith("DID revoked")) {
    return { __message: value, __error: true };
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return { __message: value };
  }
}

function inferQueryKind(panelId, payload) {
  if (payload.__message) {
    return "message";
  }
  if (payload.matrixType) {
    return "matrix";
  }
  if (panelId === "timelinePanel" && Array.isArray(payload.timeline)) {
    return "timeline";
  }
  if (panelId === "didDocumentPanel") {
    if (payload.didDocument) {
      return "didResolution";
    }
    if (payload["@context"]) {
      return "didDocument";
    }
  }
  if (
    panelId === "registryPanel" &&
    payload.owner &&
    payload.robotTokenId !== undefined
  ) {
    return "didRecord";
  }
  if (panelId === "verificationPanel") {
    if (payload.verificationBreakdown || payload.policyBasedVerificationResult) {
      return "verification";
    }
    if (payload.revokeTransaction) {
      return "credentialRevoke";
    }
  }
  return "kv";
}

function issuanceModelLabel(model) {
  const labels = {
    ROBOT_SELF_SIGNED: "Robot self-signed",
    CONTROLLER_DELEGATED: "Controller-delegated",
    EXTERNAL_ISSUER_SIGNED: "External issuer-signed",
  };
  return labels[model] || model || "—";
}

function renderCheckTable(checks) {
  const rows = Object.entries(checks || {})
    .filter(([, value]) => typeof value === "boolean")
    .map(
      ([label, value]) => `
        <tr>
          <td>${escapeHtml(label)}</td>
          <td>${boolCell(value)}</td>
        </tr>
      `
    )
    .join("");

  if (!rows) {
    return "";
  }

  return `
    <table class="matrix-table">
      <thead>
        <tr>
          <th>check</th>
          <th>result</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderOnChainAnchorSection(onChainAnchor) {
  if (!onChainAnchor) {
    return `
      <section class="query-section">
        <h4 class="query-section-title">On-chain Anchor</h4>
        <p class="query-message">Anchor check skipped (credential hash mismatch or missing).</p>
      </section>
    `;
  }

  if (!onChainAnchor.anchored) {
    return `
      <section class="query-section">
        <h4 class="query-section-title">On-chain Anchor</h4>
        ${renderKvGrid([
          ["Anchored", boolCell(false)],
          ["Note", escapeHtml(onChainAnchor.note || "—")],
        ])}
      </section>
    `;
  }

  return `
    <section class="query-section">
      <h4 class="query-section-title">On-chain Anchor</h4>
      ${renderKvGrid([
        ["Anchored", boolCell(true)],
        ["Subject DID", renderMono(onChainAnchor.subjectDid || "—")],
        ["Publisher", renderMono(onChainAnchor.publisher || "—")],
        ["Credential type", escapeHtml(onChainAnchor.credentialType || "—")],
        ["Published at", formatUnixTimestamp(onChainAnchor.publishedAt)],
        ["Note", escapeHtml(onChainAnchor.note || "—")],
      ])}
    </section>
  `;
}

function renderConsumptionStatusSection(consumptionStatus) {
  if (!consumptionStatus) {
    return "";
  }

  return `
    <section class="query-section">
      <h4 class="query-section-title">Consumption Registry</h4>
      ${renderKvGrid([
        ["Configured", boolCell(consumptionStatus.configured)],
        ["Mode", escapeHtml(consumptionStatus.modeLabel || "—")],
        ["Max uses", renderMono(consumptionStatus.maxUses ?? "—")],
        ["Use count", renderMono(consumptionStatus.useCount ?? "—")],
        ["Available", boolCell(consumptionStatus.available)],
      ])}
    </section>
  `;
}

function renderAnchorTimingSection(anchorTiming) {
  if (!anchorTiming) {
    return "";
  }

  return `
    <section class="query-section">
      <h4 class="query-section-title">Anchor Issuance Timing</h4>
      ${renderKvGrid([
        [
          "Required",
          anchorTiming.anchorTimingRequired ? boolCell(true) : boolCell(false),
        ],
        ["Valid", boolCell(anchorTiming.anchorIssuanceTimingValid)],
        [
          "issuedAt",
          anchorTiming.issuedAt != null
            ? formatUnixTimestamp(anchorTiming.issuedAt)
            : "—",
        ],
        [
          "publishedAt",
          anchorTiming.publishedAt != null
            ? formatUnixTimestamp(anchorTiming.publishedAt)
            : "—",
        ],
        ["Max delay (s)", renderMono(String(anchorTiming.maxPublishDelaySeconds ?? "—"))],
        [
          "publishedAt >= issuedAt",
          anchorTiming.publishedAtNotBeforeIssuedAt == null
            ? "—"
            : boolCell(anchorTiming.publishedAtNotBeforeIssuedAt),
        ],
        [
          "publishedAt within delay",
          anchorTiming.publishedAtWithinMaxDelay == null
            ? "—"
            : boolCell(anchorTiming.publishedAtWithinMaxDelay),
        ],
        ["Note", escapeHtml(anchorTiming.note || "—")],
      ])}
    </section>
  `;
}

function renderConsumeResultSection(payload) {
  if (!payload.consumeResult && payload.consumeSkipped !== true) {
    return "";
  }

  return `
    <section class="query-section">
      <h4 class="query-section-title">On-chain Consume</h4>
      ${renderKvGrid([
        [
          "Status",
          payload.consumeSkipped
            ? `<span class="query-badge query-badge-inactive">Skipped</span>`
            : `<span class="query-badge query-badge-active">Consumed</span>`,
        ],
        ["Message", escapeHtml(payload.consumeResult || "—")],
        [
          "Transaction",
          payload.consumeTransactionHash
            ? renderMono(payload.consumeTransactionHash)
            : "—",
        ],
      ])}
    </section>
  `;
}

function renderVisualVerification(payload) {
  const valid = String(payload.result || "").startsWith("VALID:");
  const details = payload.credentialDetails || {};
  const checks = payload.verificationBreakdown || payload.policyBasedVerificationResult || {};
  const inputs = payload.decentralizedInputsChecked || {};
  const issuerProfile = inputs.issuerProfile;
  const checkTableHtml = renderCheckTable(checks);

  const inputEntries = Object.entries(inputs).filter(
    ([key, value]) => key !== "issuerProfile" && value !== null && value !== undefined
  );

  return `
    <div class="query-visual">
      <div class="query-visual-header">
        ${
          valid
            ? `<span class="query-badge query-badge-active">VALID</span>`
            : `<span class="query-badge query-badge-inactive">INVALID</span>`
        }
        ${
          payload.issuanceModel
            ? `<span class="query-badge query-badge-event">${escapeHtml(issuanceModelLabel(payload.issuanceModel))}</span>`
            : ""
        }
      </div>
      <p class="query-verification-meaning">${escapeHtml(payload.meaning || "—")}</p>
      ${renderKvGrid([
        ["Result", escapeHtml(payload.result || "—")],
        ["Credential type", escapeHtml(details.primaryCredentialType || "—")],
        ["Expiration", escapeHtml(details.expirationDate || "—")],
        ["Issuer DID", renderMono(inputs.issuerDID || "—")],
        ["Subject robot DID", renderMono(inputs.subjectRobotDID || "—")],
        ["Robot NFT #", renderMono(inputs.robotTokenId || "—")],
        ["Recovered signer", renderMono(inputs.recoveredSigner || "—")],
      ])}
      ${
        checkTableHtml
          ? `
        <section class="query-section">
          <h4 class="query-section-title">Policy Checks</h4>
          ${checkTableHtml}
        </section>
      `
          : ""
      }
      ${renderOnChainAnchorSection(payload.onChainAnchor)}
      ${renderAnchorTimingSection(payload.anchorTiming)}
      ${renderConsumptionStatusSection(payload.consumptionStatus)}
      ${renderConsumeResultSection(payload)}
      ${
        issuerProfile
          ? `
        <section class="query-section">
          <h4 class="query-section-title">Issuer Profile</h4>
          ${renderKvGrid([
            ["Name", escapeHtml(issuerProfile.name || "—")],
            ["Type", escapeHtml(issuerProfile.type || "—")],
            ["Status", escapeHtml(issuerProfile.activeStatus || "—")],
            ["Remark", escapeHtml(issuerProfile.remark || "—")],
          ])}
        </section>
      `
          : ""
      }
      ${
        inputEntries.length
          ? `
        <section class="query-section">
          <h4 class="query-section-title">On-chain Inputs</h4>
          ${renderKvGrid(
            inputEntries.map(([label, value]) => [
              label,
              typeof value === "object" ? renderMono(stringifyForDisplay(value)) : renderMono(String(value)),
            ])
          )}
        </section>
      `
          : ""
      }
    </div>
  `;
}

function renderVisualCredentialRevoke(payload) {
  return `
    <div class="query-visual">
      <div class="query-visual-header">
        <span class="query-badge query-badge-active">Revoked</span>
      </div>
      ${renderKvGrid([
        ["Result", escapeHtml(payload.result || "—")],
        ["Issuer", renderMono(payload.issuer || "—")],
        ["Subject", renderMono(payload.subject || "—")],
        ["Credential hash", `<span class="query-wrap">${renderMono(payload.credentialHash || "—")}</span>`],
        ["Transaction", renderMono(payload.revokeTransaction || "—")],
      ])}
    </div>
  `;
}

function formatUnixTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return value ? String(value) : "—";
  }

  return new Date(seconds * 1000).toLocaleString();
}

function statusBadge(active, activeLabel, inactiveLabel) {
  return active
    ? `<span class="query-badge query-badge-active">${escapeHtml(activeLabel)}</span>`
    : `<span class="query-badge query-badge-inactive">${escapeHtml(inactiveLabel)}</span>`;
}

function renderKvGrid(entries) {
  return `
    <dl class="query-kv-grid">
      ${entries
        .map(
          ([label, value]) => `
        <dt>${escapeHtml(label)}</dt>
        <dd>${value}</dd>
      `
        )
        .join("")}
    </dl>
  `;
}

function renderMono(value) {
  return `<code class="query-mono">${escapeHtml(value ?? "—")}</code>`;
}

function renderVisualDidRecord(record) {
  const controllers = record.controllerDetails || [];
  const controllerRows = controllers
    .map((entry) => {
      const permissions = Number(entry.permissions);
      const isOwner =
        entry.controller.toLowerCase() === String(record.owner).toLowerCase();
      return `
        <tr>
          <td>${renderMono(entry.controller)}</td>
          <td>${boolCell(hasControllerPermission(permissions, controllerPermissions.keyRotation))}</td>
          <td>${boolCell(hasControllerPermission(permissions, controllerPermissions.credentialRevocation))}</td>
          <td>${boolCell(hasControllerPermission(permissions, controllerPermissions.assertion))}</td>
          <td>${boolCell(isOwner)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="query-visual">
      <div class="query-visual-header">
        ${statusBadge(record.active, "Active DID", "Inactive DID")}
        <span class="query-visual-title">${renderMono(record.did || document.getElementById("did")?.value || "—")}</span>
      </div>
      ${renderKvGrid([
        ["Owner", renderMono(record.owner)],
        ["Robot NFT #", renderMono(String(record.robotTokenId))],
        ["Public key", `<span class="query-wrap">${renderMono(record.publicKey)}</span>`],
        ["Metadata URI", record.metadataURI ? renderMono(record.metadataURI) : "—"],
        ["Created", formatUnixTimestamp(record.createdAt)],
        ["Updated", formatUnixTimestamp(record.updatedAt)],
      ])}
      ${
        controllers.length
          ? `
        <section class="query-section">
          <h4 class="query-section-title">Controllers</h4>
          <table class="matrix-table">
            <thead>
              <tr>
                <th>address</th>
                <th>key rotation</th>
                <th>credential revocation</th>
                <th>assertion</th>
                <th>owner</th>
              </tr>
            </thead>
            <tbody>${controllerRows}</tbody>
          </table>
        </section>
      `
          : ""
      }
    </div>
  `;
}

function renderVisualDidResolution(resolution) {
  const doc = resolution.didDocument || {};
  const meta = resolution.didDocumentMetadata || {};
  const verificationMethod = Array.isArray(doc.verificationMethod)
    ? doc.verificationMethod[0]
    : null;
  const services = Array.isArray(doc.service) ? doc.service : [];

  return `
    <div class="query-visual">
      <div class="query-visual-header">
        ${statusBadge(meta.active ?? doc.active, "Active", "Inactive")}
        <span class="query-visual-title">${renderMono(resolution.did || doc.id)}</span>
      </div>
      ${renderKvGrid([
        ["Resolver", escapeHtml(resolution.resolver || "did:uzheth resolver")],
        ["Retrieved from", escapeHtml(resolution.resolutionMetadata?.retrievedFrom || "—")],
        ["Registry", renderMono(resolution.resolutionMetadata?.registryAddress || "—")],
        ["Robot NFT #", renderMono(meta.robotTokenId || doc.robotTokenId || "—")],
        ["Created", formatUnixTimestamp(meta.createdAt)],
        ["Updated", formatUnixTimestamp(meta.updatedAt)],
      ])}
      ${
        verificationMethod
          ? `
        <section class="query-section">
          <h4 class="query-section-title">Verification Method</h4>
          ${renderKvGrid([
            ["Method ID", renderMono(verificationMethod.id)],
            ["Type", escapeHtml(verificationMethod.type || "—")],
            ["Account", renderMono(verificationMethod.blockchainAccountId || "—")],
            [
              "Public key",
              `<span class="query-wrap">${renderMono(verificationMethod.publicKeyHex || "—")}</span>`,
            ],
          ])}
        </section>
      `
          : ""
      }
      ${
        services.length
          ? `
        <section class="query-section">
          <h4 class="query-section-title">Services</h4>
          <ul class="query-list">
            ${services
              .map(
                (service) => `
              <li>
                <strong>${escapeHtml(service.type || "Service")}</strong>
                <span>${renderMono(service.serviceEndpoint || service.id || "—")}</span>
              </li>
            `
              )
              .join("")}
          </ul>
        </section>
      `
          : ""
      }
    </div>
  `;
}

function renderVisualTimeline(data) {
  const events = data.timeline || [];
  if (!events.length) {
    return `<p class="query-message">No on-chain events found in the searched block range.</p>`;
  }

  return `
    <div class="query-visual">
      <div class="query-visual-header">
        <span class="query-visual-title">NFT #${escapeHtml(String(data.robotTokenId || "—"))}</span>
        ${data.activeDID ? renderMono(data.activeDID) : ""}
      </div>
      ${renderKvGrid([
        ["Events", String(data.eventCount ?? events.length)],
        [
          "Block range",
          `${data.searchedBlocks?.fromBlock ?? "—"} → ${data.searchedBlocks?.toBlock ?? "—"}`,
        ],
      ])}
      <ol class="query-timeline">
        ${events
          .map((event) => {
            const details = Object.entries(event)
              .filter(
                ([key]) =>
                  !["type", "blockNumber", "transactionHash", "logIndex", "timestamp"].includes(
                    key
                  )
              )
              .map(
                ([key, value]) =>
                  `<span class="query-timeline-detail"><strong>${escapeHtml(key)}:</strong> ${renderMono(value)}</span>`
              )
              .join("");
            return `
              <li class="query-timeline-item">
                <div class="query-timeline-marker"></div>
                <div class="query-timeline-content">
                  <div class="query-timeline-top">
                    <span class="query-badge query-badge-event">${escapeHtml(event.type)}</span>
                    <span class="query-timeline-time">${escapeHtml(event.timestamp || "—")}</span>
                  </div>
                  <div class="query-timeline-meta">
                    <span>block ${escapeHtml(String(event.blockNumber))}</span>
                    <span>${renderMono(event.transactionHash)}</span>
                  </div>
                  ${details ? `<div class="query-timeline-details">${details}</div>` : ""}
                </div>
              </li>
            `;
          })
          .join("")}
      </ol>
    </div>
  `;
}

function renderVisualMatrix(data) {
  const headerCells = (data.headers || [])
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("");
  const bodyRows = (data.rows || [])
    .map((row) => {
      const cells = row
        .map((cell) => {
          if (typeof cell === "boolean") {
            return `<td>${boolCell(cell)}</td>`;
          }
          if (typeof cell === "object" && cell !== null && cell.__html) {
            return `<td>${cell.__html}</td>`;
          }
          return `<td>${escapeHtml(String(cell ?? "—"))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="query-visual">
      <p class="query-matrix-title">${escapeHtml(data.title || "Matrix")}</p>
      ${data.subtitle ? `<p class="query-matrix-subtitle">${data.subtitle}</p>` : ""}
      <table class="matrix-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function renderVisualKv(payload) {
  const entries = Object.entries(payload).filter(
    ([key]) => !key.startsWith("__") && typeof payload[key] !== "object"
  );
  const nestedEntries = Object.entries(payload).filter(
    ([key, value]) => !key.startsWith("__") && value && typeof value === "object"
  );

  return `
    <div class="query-visual">
      ${
        entries.length
          ? renderKvGrid(entries.map(([label, value]) => [label, renderMono(String(value))]))
          : ""
      }
      ${nestedEntries
        .map(
          ([label, value]) => `
        <section class="query-section">
          <h4 class="query-section-title">${escapeHtml(label)}</h4>
          <pre class="query-raw-block">${escapeHtml(stringifyForDisplay(value))}</pre>
        </section>
      `
        )
        .join("")}
    </div>
  `;
}

function renderQueryVisual(kind, payload) {
  switch (kind) {
    case "didRecord":
      return renderVisualDidRecord(payload);
    case "didResolution":
    case "didDocument":
      return renderVisualDidResolution(
        payload.didDocument ? payload : { didDocument: payload, did: payload.id }
      );
    case "timeline":
      return renderVisualTimeline(payload);
    case "matrix":
      return renderVisualMatrix(payload);
    case "verification":
      return renderVisualVerification(payload);
    case "credentialRevoke":
      return renderVisualCredentialRevoke(payload);
    case "kv":
      return renderVisualKv(payload);
    default:
      return `<p class="query-message">${escapeHtml(payload.__message || "No data")}</p>`;
  }
}

function updatePanelToggleButton(panelId) {
  const button = document.querySelector(`[data-panel-view-toggle="${panelId}"]`);
  if (!button) {
    return;
  }

  const state = queryPanelState.get(panelId);
  const canToggle =
    state && !state.payload.__message && state.kind !== "message" && !state.payload.__empty;
  button.hidden = !canToggle;
  if (!canToggle) {
    return;
  }

  const mode = queryPanelViewMode.get(panelId) || "visual";
  button.textContent = mode === "visual" ? "Show Raw JSON" : "Show Visual View";
}

function renderQueryPanel(panelId) {
  const outputId = QUERY_PANEL_OUTPUT_IDS[panelId];
  const output = document.getElementById(outputId);
  const state = queryPanelState.get(panelId);
  if (!output || !state) {
    return;
  }

  const mode = queryPanelViewMode.get(panelId) || "visual";
  const { payload, kind } = state;

  if (payload.__message) {
    const className = payload.__error ? "query-message query-error" : "query-message";
    output.innerHTML = `<p class="${className}">${escapeHtml(payload.__message)}</p>`;
    updatePanelToggleButton(panelId);
    return;
  }

  if (mode === "raw") {
    output.innerHTML = `<pre class="query-raw-block">${escapeHtml(stringifyForDisplay(payload))}</pre>`;
  } else {
    output.innerHTML = renderQueryVisual(kind, payload);
  }

  updatePanelToggleButton(panelId);
}

function toggleQueryPanelView(panelId) {
  const current = queryPanelViewMode.get(panelId) || "visual";
  queryPanelViewMode.set(panelId, current === "visual" ? "raw" : "visual");
  renderQueryPanel(panelId);
}

function setQueryPanelOutput(panelId, value, options = {}) {
  const payload = parsePanelPayload(value);
  const kind = options.kind || inferQueryKind(panelId, payload);
  queryPanelState.set(panelId, { payload, kind });
  if (!queryPanelViewMode.has(panelId)) {
    queryPanelViewMode.set(panelId, "visual");
  }
  renderQueryPanel(panelId);
  showPanel(panelId);
}

function initQueryPanelToggles() {
  document.querySelectorAll("[data-panel-view-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleQueryPanelView(button.dataset.panelViewToggle);
    });
  });
}

