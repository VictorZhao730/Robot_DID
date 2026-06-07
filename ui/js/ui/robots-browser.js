function shortText(value, left = 6, right = 4) {
  if (!value) {
    return "none";
  }

  const text = value.toString();
  if (text.length <= left + right + 3) {
    return text;
  }

  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

function colorFromTokenId(tokenId, offset = 0) {
  const numericTokenId = Number(tokenId);
  const hue = (numericTokenId * 67 + offset) % 360;
  return `hsl(${hue}, 76%, 48%)`;
}

function avatarLabel(tokenId) {
  return `#${tokenId}`;
}

function displayRobot(robot) {
  return {
    tokenId: robot.tokenId,
    owner: robot.owner,
    activeDID: robot.activeDID,
    mintTransaction: robot.mintTransaction,
  };
}

function formatRobotsSummary(result, visibleRobots) {
  let summary = `${visibleRobots.length} visible / ${result.totalRobots} total robot NFT(s) found from block ${result.searchedBlocks.fromBlock} to ${result.searchedBlocks.toBlock}.`;
  if (selectedRobot) {
    summary += ` Selected: NFT #${selectedRobot.tokenId}.`;
  } else {
    summary += " Click a robot avatar to select it.";
  }
  return summary;
}

function normalizeTokenId(tokenId) {
  return tokenId == null ? "" : String(tokenId);
}

function getVisibleRobotByTokenId(tokenId) {
  const normalized = normalizeTokenId(tokenId);
  return lastVisibleRobots.find(
    (robot) => normalizeTokenId(robot.tokenId) === normalized
  );
}

function updateRobotsSummaryFromSelection() {
  if (!lastRobotsResult) {
    return;
  }
  const hideDeactivated = document.getElementById("hideDeactivatedRobots").checked;
  const visibleRobots = hideDeactivated
    ? lastRobotsResult.robots.filter((entry) => entry.activeDID)
    : lastRobotsResult.robots;
  document.getElementById("robotsSummary").textContent = formatRobotsSummary(
    lastRobotsResult,
    visibleRobots
  );
}

function applyRobotSelectionHighlight() {
  const selectedId = normalizeTokenId(selectedRobot?.tokenId);
  document.querySelectorAll(".robot-card").forEach((card) => {
    const isSelected =
      selectedId && normalizeTokenId(card.dataset.tokenId) === selectedId;
    card.classList.toggle("robot-card-selected", isSelected);
    card.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
}

function clearRobotSelection() {
  selectedRobot = null;
  document.getElementById("robotDetailsOutput").textContent =
    "Click a robot NFT avatar to select it. Click again to deselect.";
  applyRobotSelectionHighlight();
  updateRobotsSummaryFromSelection();
}

function selectRobot(robot) {
  selectedRobot = robot;

  document.getElementById("robotDetailsOutput").textContent = stringifyForDisplay({
    selected: true,
    ...displayRobot(robot),
  });
  applyRobotSelectionHighlight();
  updateRobotsSummaryFromSelection();
}

function toggleRobotSelection(robot) {
  if (
    selectedRobot &&
    normalizeTokenId(selectedRobot.tokenId) === normalizeTokenId(robot.tokenId)
  ) {
    clearRobotSelection();
    return;
  }
  selectRobot(robot);
}

function updateShowRobotsButtonLabel() {
  const button = document.getElementById("showRobots");
  if (button) {
    button.textContent = robotsBrowserVisible ? "Hide Robots" : "Show Robots";
  }
}

function resetRobotsBrowser() {
  robotsBrowserVisible = false;
  selectedRobot = null;
  lastRobotsResult = null;
  lastVisibleRobots = [];
  document.getElementById("robotsOutput").innerHTML = "";
  document.getElementById("robotsSummary").textContent =
    "Click Show Robots to list minted robot NFTs.";
  document.getElementById("robotDetailsOutput").textContent =
    "Click a robot NFT avatar to show details.";
  setControllerOutput("Select a robot in Robots Browser, then add or update controllers here.");
  updateShowRobotsButtonLabel();
}

async function loadRobotsBrowser() {
  document.getElementById("robotsSummary").textContent = "Loading robots from chain...";
  document.getElementById("robotsOutput").innerHTML = "";
  const result = await listRobots();
  lastRobotsResult = result;
  robotsBrowserVisible = true;
  renderRobots(lastRobotsResult);
  updateShowRobotsButtonLabel();
}

function renderRobots(result) {
  const robotsOutput = document.getElementById("robotsOutput");
  const robotsSummary = document.getElementById("robotsSummary");
  const robotDetailsOutput = document.getElementById("robotDetailsOutput");
  const hideDeactivated = document.getElementById("hideDeactivatedRobots").checked;
  const visibleRobots = hideDeactivated
    ? result.robots.filter((robot) => robot.activeDID)
    : result.robots;
  lastVisibleRobots = visibleRobots;

  robotsOutput.innerHTML = "";
  const previousTokenId = selectedRobot?.tokenId;

  robotsSummary.textContent = formatRobotsSummary(result, visibleRobots);

  if (visibleRobots.length === 0) {
    selectedRobot = null;
    robotDetailsOutput.textContent = hideDeactivated
      ? "No active robot NFTs found. Uncheck Hide deactivated bots to show revoked/inactive robots."
      : "No robot NFTs found in the searched block range.";
    setControllerOutput("Select a robot in Robots Browser, then add or update controllers here.");
    return;
  }

  const retainedSelection = visibleRobots.find(
    (robot) => String(robot.tokenId) === String(previousTokenId)
  );
  selectedRobot = retainedSelection || null;

  for (const robot of visibleRobots) {
    const card = document.createElement("div");
    card.className = "robot-card";
    card.dataset.tokenId = normalizeTokenId(robot.tokenId);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", "false");

    const statusClass = robot.activeDID ? "robot-active" : "robot-inactive";
    const statusLabel = robot.activeDID ? "active DID" : "no active DID";
    const primaryColor = colorFromTokenId(robot.tokenId);
    const secondaryColor = colorFromTokenId(robot.tokenId, 95);

    card.innerHTML = `
      <div
        class="robot-avatar"
        aria-hidden="true"
        style="background: radial-gradient(circle at 30% 30%, #f8fafc, ${primaryColor} 38%, ${secondaryColor} 72%, #1e1b4b);"
      >${avatarLabel(robot.tokenId)}</div>
      <div class="robot-title">NFT #${robot.tokenId}</div>
      <div class="robot-subtitle ${statusClass}">${statusLabel}</div>
      <div class="robot-subtitle">${shortText(robot.activeDID || robot.owner)}</div>
    `;

    robotsOutput.appendChild(card);
  }

  if (selectedRobot) {
    selectRobot(selectedRobot);
    return;
  }

  robotDetailsOutput.textContent = "Click a robot NFT avatar to select it.";
  setControllerOutput("Select a robot in Robots Browser, then add or update controllers here.");
  applyRobotSelectionHighlight();
}

