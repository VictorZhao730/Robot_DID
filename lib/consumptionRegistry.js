const { CONSUMPTION_LIMITED, CONSUMPTION_UNLIMITED } = require("./didUzheth");

function consumptionModeLabel(mode, maxUses = 0) {
  if (Number(mode) === CONSUMPTION_LIMITED) {
    const uses = Number(maxUses);
    return uses === 1 ? "limited (single-use)" : `limited (${uses} uses)`;
  }
  return "unlimited";
}

async function fetchConsumptionStatus(registry, credentialHash, credentialHashMatchesContent) {
  if (!credentialHashMatchesContent || !credentialHash) {
    return null;
  }

  const [record, available] = await Promise.all([
    registry.getConsumptionRecord(credentialHash),
    registry.isConsumptionAvailable(credentialHash),
  ]);

  if (!record.configured) {
    return {
      configured: false,
      mode: CONSUMPTION_UNLIMITED,
      modeLabel: consumptionModeLabel(CONSUMPTION_UNLIMITED),
      maxUses: "0",
      useCount: "0",
      available: true,
      note: "No on-chain consumption policy (off-chain verify only)",
    };
  }

  return {
    configured: true,
    mode: Number(record.mode),
    modeLabel: consumptionModeLabel(record.mode, record.maxUses),
    maxUses: record.maxUses.toString(),
    useCount: record.useCount.toString(),
    available,
    note: available
      ? "Consumption slot available"
      : "Consumption limit reached for this credential hash",
  };
}

module.exports = {
  consumptionModeLabel,
  fetchConsumptionStatus,
};
