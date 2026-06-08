require("dotenv").config();

const { loadCredentialFile, optionalEnv, requireEnv } = require("../lib/cliEnv");
const { anchorCredentialFromObject } = require("../lib/anchorCredentialTx");

async function main() {
  const filePath = process.argv[2] || requireEnv("CREDENTIAL_FILE");
  const credential = loadCredentialFile(filePath);
  const actorPrivateKey =
    optionalEnv("ANCHOR_ACTOR_PRIVATE_KEY") ||
    optionalEnv("ROBOT_PRIVATE_KEY") ||
    optionalEnv("CONTROLLER_PRIVATE_KEY") ||
    optionalEnv("ISSUER_PRIVATE_KEY") ||
    null;
  const result = await anchorCredentialFromObject(credential, { actorPrivateKey });
  console.log("Credential anchored on-chain");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
