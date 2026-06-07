const { expect } = require("chai");
const { execSync } = require("child_process");
const path = require("path");

const HARDHAT = path.join(__dirname, "..", "node_modules", "hardhat", "internal", "cli", "bootstrap.js");
const ROOT = path.join(__dirname, "..");

describe("CLI smoke", function () {
  this.timeout(120000);

  function runHardhatScript(relativeScript) {
    return execSync(
      `node "${HARDHAT}" run "${relativeScript}" --network hardhat`,
      { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
  }

  it("runs the integration harness covering register, check, verify, and revoke flows", function () {
    const output = runHardhatScript("test/helpers/cliIntegrationHarness.js");
    expect(output).to.include("STEP deployRobotNFT OK");
    expect(output).to.include("STEP registerRobot OK");
    expect(output).to.include("STEP checkRobot OK");
    expect(output).to.include("STEP verifyCredential OK");
    expect(output).to.include("STEP revokeRobot OK");
    expect(output).to.include("SMOKE_OK");
  });
});
