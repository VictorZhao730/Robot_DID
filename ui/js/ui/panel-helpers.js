function showPanel(panelId) {
  document.getElementById(panelId).style.display = "block";
}

function hidePanel(panelId) {
  document.getElementById(panelId).style.display = "none";
}

function setPanelOutput(panelId, outputId, value) {
  if (QUERY_PANEL_IDS.has(panelId)) {
    setQueryPanelOutput(panelId, value);
    return;
  }

  document.getElementById(outputId).textContent =
    typeof value === "string" ? value : stringifyForDisplay(value);
  showPanel(panelId);
}

function setControllerOutput(value) {
  const output = document.getElementById("controllerOutput");
  if (output) {
    output.textContent = value;
  }
}

function getTextFieldValue(field) {
  return field.tagName === "PRE" ? field.textContent : field.value;
}

function setTextFieldValue(field, value) {
  if (field.tagName === "PRE") {
    field.textContent = value;
  } else {
    field.value = value;
  }
}

function addTextFieldControls() {
  document
    .querySelectorAll(
      "input:not([type='checkbox']):not([type='file']):not([type='radio']), textarea, pre"
    )
    .forEach((field) => {
      if (field.dataset.controlsAdded === "true") {
        return;
      }

      const initialValue = getTextFieldValue(field);
      const wrapper = document.createElement("div");
      const copyButton = document.createElement("button");
      const resetButton = document.createElement("button");

      field.dataset.controlsAdded = "true";
      wrapper.className = "text-control-box";
      copyButton.type = "button";
      copyButton.className = "copy-output";
      copyButton.textContent = "Copy";
      copyButton.addEventListener("click", async () => {
        await navigator.clipboard.writeText(getTextFieldValue(field));
        copyButton.textContent = "Copied";
        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1200);
      });

      resetButton.type = "button";
      resetButton.className = "reset-output";
      resetButton.textContent = "Clear";
      resetButton.addEventListener("click", () => {
        setTextFieldValue(field, initialValue);
      });

      field.parentNode.insertBefore(wrapper, field);
      wrapper.appendChild(field);
      wrapper.appendChild(copyButton);
      wrapper.appendChild(resetButton);
    });
}

function renderRobotSummary(extra = {}) {
  document.getElementById("registrationOutput").textContent = stringifyForDisplay({
    robotAddress: document.getElementById("generatedRobotAddress").value || "",
    robotPrivateKey: document.getElementById("generatedRobotPrivateKey").value || "",
    did: document.getElementById("generatedRobotDid").value || "",
    tokenId: extra.tokenId || "",
    owner: extra.owner || "",
  });
}
