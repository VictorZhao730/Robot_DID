const MINT_REGISTER_STEPS = [
  { phase: 1, id: "connectOwner", label: "Connect MetaMask as NFT owner" },
  { phase: 1, id: "mintNft", label: "Mint Robot NFT" },
  { phase: 2, id: "challengeBuild", label: "Build register challenge payload" },
  { phase: 2, id: "challengeSign", label: "Sign challenge with robot private key" },
  { phase: 3, id: "challengeVerify", label: "Verify challenge signature locally" },
  { phase: 3, id: "registerDid", label: "Submit registerDID transaction" },
];

const MINT_REGISTER_INITIAL_OUTPUT =
  "Generate a robot wallet first, then run mint + register.";

let mintRegisterStepState = {};

function resetMintRegisterStepState() {
  mintRegisterStepState = Object.fromEntries(
    MINT_REGISTER_STEPS.map((step) => [step.id, { status: "pending" }])
  );
}

function resetMintRegisterSteps() {
  resetMintRegisterStepState();
  renderMintRegisterSteps();
}

function clearMintRegisterProgress() {
  resetMintRegisterStepState();
  const container = document.getElementById("mintRegisterProgress");
  const outputEl = document.getElementById("robotRegistrationOutput");
  if (container) {
    container.hidden = true;
  }
  if (outputEl) {
    outputEl.textContent = MINT_REGISTER_INITIAL_OUTPUT;
  }
}

function updateMintRegisterStep(id, { status }) {
  if (!mintRegisterStepState[id]) {
    return;
  }

  mintRegisterStepState[id] = { status };
  renderMintRegisterSteps();
}

function markMintRegisterStepError() {
  const activeStep = MINT_REGISTER_STEPS.find(
    (step) => mintRegisterStepState[step.id]?.status === "active"
  );
  if (activeStep) {
    updateMintRegisterStep(activeStep.id, { status: "error" });
  }
}

function renderMintRegisterStepItem(step) {
  const state = mintRegisterStepState[step.id] || { status: "pending" };
  const marker =
    state.status === "done"
      ? "✓"
      : state.status === "error"
        ? "!"
        : state.status === "active"
          ? "…"
          : "○";

  const item = document.createElement("li");
  item.className = `mint-register-step is-${state.status}`;
  item.innerHTML = `
    <div class="mint-register-step-marker">${marker}</div>
    <div class="mint-register-step-body">
      <div class="mint-register-step-label">${step.label}</div>
    </div>
  `;
  return item;
}

function renderMintRegisterSteps() {
  const container = document.getElementById("mintRegisterProgress");
  const phase1 = document.getElementById("mintRegisterPhase1Steps");
  const phase2 = document.getElementById("mintRegisterPhase2Steps");
  const phase3 = document.getElementById("mintRegisterPhase3Steps");
  if (!container || !phase1 || !phase2 || !phase3) {
    return;
  }

  container.hidden = false;
  phase1.replaceChildren(
    ...MINT_REGISTER_STEPS.filter((step) => step.phase === 1).map(renderMintRegisterStepItem)
  );
  phase2.replaceChildren(
    ...MINT_REGISTER_STEPS.filter((step) => step.phase === 2).map(renderMintRegisterStepItem)
  );
  phase3.replaceChildren(
    ...MINT_REGISTER_STEPS.filter((step) => step.phase === 3).map(renderMintRegisterStepItem)
  );
}
