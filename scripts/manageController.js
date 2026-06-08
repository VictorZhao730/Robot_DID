require("dotenv").config();

const { ethers } = require("hardhat");
const {
  getHardhatRegistry,
  optionalEnv,
  parseControllerPermissions,
  requireEnv,
} = require("../lib/cliEnv");

async function main() {
  const registry = await getHardhatRegistry(requireEnv("REGISTRY_ADDRESS"));
  const did = requireEnv("ROBOT_DID");
  const controller = ethers.getAddress(requireEnv("CONTROLLER_ADDRESS"));
  const action = optionalEnv("CONTROLLER_ACTION", "add").toLowerCase();

  let tx;
  if (action === "add") {
    const permissions = parseControllerPermissions(process.env.CONTROLLER_PERMISSIONS);
    tx = await registry["addController(string,address,uint256)"](did, controller, permissions);
  } else if (action === "update") {
    const permissions = parseControllerPermissions(process.env.CONTROLLER_PERMISSIONS);
    tx = await registry.updateControllerPermissions(did, controller, permissions);
  } else if (action === "remove") {
    tx = await registry.removeController(did, controller);
  } else {
    throw new Error("CONTROLLER_ACTION must be add, update, or remove");
  }

  const receipt = await tx.wait();
  console.log(`Controller ${action} completed`);
  console.log("DID:", did);
  console.log("Controller:", controller);
  console.log("Transaction hash:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
