# Robot DID Project

## Project Overview

This project is a Hardhat-based prototype for decentralized digital identity and verifiable credentials (VCs) for robots on the UZHETH PoS test network.

Each physical robot is represented by a `RobotIdentityNFT` (ERC-721). It receives a stable `did:uzheth:robot:<tokenId>` identifier, registers device keys in an on-chain registry, and can issue W3C-style credentials that third parties verify independently. **Management ownership** (NFT holder) is separated from **operational signing** (robot device key). Verification policy is shared across the web UI, CLI tools, and automated tests.

## Architecture

| Component | Role |
|-----------|------|
| `RobotIdentityNFT.sol` | One NFT per robot instance; minter role controls minting |
| `RobotDIDRegistry.sol` | DID lifecycle, key history, controllers, suspend/revoke, credential anchor/consume/revoke |
| `CredentialIssuerRegistry.sol` | Trusted external issuers and per-type roles |
| `lib/` | `did:uzheth` encoding, credential policies, `verifyCredentialCore`, anchor timing |
| `ui/` | Browser demo (ethers.js v6, MetaMask) |
| `scripts/` | Deploy and registry operations |
| `robot/`, `controller/`, `issuer/` | CLI credential issuance |
| `verifier/` | CLI credential verification |
| `test/` | Contract and verification tests (52 passing) |

Only `RobotDIDRegistry` needs to be configured in the UI or CLI verifier; linked NFT and issuer registry addresses are resolved on-chain.

## DID Format

Robot DIDs are stable and bound to the NFT token ID:

```text
did:uzheth:robot:<tokenId>
```

Controllers and external issuers use address-based DIDs:

```text
did:uzheth:0x<address>
```

The NFT owner is the **management owner** (registration, suspension, revocation). The **robot key** signs operational credentials. Registering a DID requires a challenge signature from the robot key itself, so an owner cannot bind a key they do not control.

## Verifiable Credential Flow

1. Mint a `RobotIdentityNFT` for the robot.
2. Register the robot DID with its public key (register challenge signature required).
3. Issue a credential under one of three models:
   - **Robot self-signed** — sensor data, heartbeat, operational logs
   - **Controller delegated** — maintenance/operational logs by an authorized operator
   - **External issuer signed** — maintenance, safety, manufacturing, or license certificates from a registered issuer
4. Optionally **anchor** the credential on-chain (hash, `publishedAt`, optional consumption limit).
5. A verifier checks signature, schema, key history at `issuedAt`, suspension intervals, expiry, issuer trust, anchor timing, and consumption state.
6. Suspend, revoke DID, or revoke individual credentials as needed.

Credentials are typically transmitted off-chain; the verifier does not trust the delivery channel, only cryptographic and on-chain checks.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with funded keys and `REGISTRY_ADDRESS` after deployment. See [Environment variables](#environment-variables) and [Commands](#commands).

## Environment variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `PRIVATE_KEY` | Deploy, register, revoke | Registry owner / tx signer |
| `ROBOT_PRIVATE_KEY` | Register, self-signed issue | Robot device key |
| `CONTROLLER_PRIVATE_KEY` | Controller issue | Operator with assertion permission |
| `ISSUER_PRIVATE_KEY` | External issuer issue | Registered issuer wallet |
| `UZHETH_POS_RPC_URL` | On-chain scripts, verifier | Default: `http://130.60.144.77:8554/` |
| `REGISTRY_ADDRESS` | Register, check, issue, verify | `RobotDIDRegistry` address |
| `ROBOT_DID` | Check, revoke, self-signed issue | e.g. `did:uzheth:robot:1` |
| `SUBJECT_ROBOT_DID` | Controller issue | Target robot DID |
| `CREDENTIAL_SUBJECT_DID` | External issuer issue | Target robot DID |
| `CREDENTIAL_TYPE` | Issue scripts | See [Credential types](#credential-types) |
| `CREDENTIAL_VALID_DAYS` | Issue scripts | Override policy default validity |

## UZHETH PoS Network Info

| Field | Value |
|-------|-------|
| Network name | `UZH_ETH_PoS` |
| RPC URL | `http://130.60.144.77:8554/` |
| Chain ID | `70207` |
| Currency symbol | `UZHETHs` |
| Hardhat network name | `uzhethpos` |

Add the network in MetaMask before using the web UI on the live testnet.

## Commands

Reference for all CLI operations. Set variables in `.env` before running network scripts (see [Environment variables](#environment-variables)).

### Install, compile, and test

Build the project and run the 52 automated tests locally before deploying.

```bash
npm install
npm run compile          # or: npx hardhat compile
npm test                 # or: npx hardhat test  (52 tests)
npx hardhat clean
npx hardhat test test/RobotDIDRegistry.test.js
npx hardhat test test/verifyCredentialCore.test.js
npx hardhat test test/cli.smoke.test.js
```

On Windows, if `npx hardhat` fails:

```powershell
node node_modules/hardhat/internal/cli/bootstrap.js compile
node node_modules/hardhat/internal/cli/bootstrap.js test
```

### npm script shortcuts

Shorthand wrappers around the Hardhat and Node scripts below.

```bash
npm run deploy           # deploy to uzhethpos
npm run register         # mint NFT + registerDID
npm run check            # print DID state
npm run revoke           # revokeDID
npm run issue:self         # robot self-signed VC
npm run issue:controller   # controller-delegated VC
npm run issue:issuer       # external issuer VC
npm run verify           # verify sample credential
npm run ui               # reminder to open web UI
```

### Deploy and registry (Hardhat)

On-chain identity setup on UZHETH PoS. Requires `PRIVATE_KEY` (tx signer) and, for register, `ROBOT_PRIVATE_KEY` (challenge signer).

Deploy order: `RobotIdentityNFT` → `CredentialIssuerRegistry` → `RobotDIDRegistry`.

```bash
npx hardhat run scripts/deploy.js --network uzhethpos
npx hardhat run scripts/registerRobot.js --network uzhethpos
npx hardhat run scripts/checkRobot.js --network uzhethpos
npx hardhat run scripts/revokeRobot.js --network uzhethpos
```

After deploy, set `REGISTRY_ADDRESS`. After register, set `ROBOT_DID` from script output.

### Issue credentials (Node)

Creates signed JSON under `credentials/<CREDENTIAL_TYPE>.json`. Set `CREDENTIAL_TYPE` and the subject DID as required by each model.

```bash
node robot/issueSelfSignedCredential.js
node controller/issueDelegatedCredential.js
node issuer/issueCredentialForRobot.js
node robot/issueCredential.js          # deprecated wrapper → issuer script
```

### Verify credentials (Node)

Runs the same verification policy as the web UI against a credential file.

```bash
node verifier/verifyCredential.js <path-to-credential.json>
node verifier/verifyCredential.js credentials/RobotSensorDataCredential.json
node verifier/verifyCredential.js credentials/robot-maintenance-vc.json
```

Requires `UZHETH_POS_RPC_URL` and `REGISTRY_ADDRESS`. Exit code `0` = valid, `1` = invalid.

### Web UI

Serve over HTTP (recommended for MetaMask):

```bash
npx --yes serve ui -p 8080
# or
cd ui && python -m http.server 8080
```

Open `http://localhost:8080`, connect MetaMask to UZHETH PoS, and enter the registry address on **Setup**.

Tabs: Setup → Create Robot → Manage DID → Register Issuer → Issue VC → Verify.

## Web UI Manual

The visualizer (`ui/index.html`) walks through the full robot identity lifecycle in six sections on one page. Use MetaMask on UZHETH PoS (chain ID `70207`). Only the **RobotDIDRegistry** address is required in Setup; NFT and issuer registry addresses are resolved automatically.

### Prerequisites

1. Deploy contracts (`npm run deploy`) and copy `REGISTRY_ADDRESS` into Setup.
2. Add UZHETH PoS to MetaMask (see [UZHETH PoS Network Info](#uzheth-pos-network-info)).
3. Serve the UI over HTTP — do not open `index.html` directly as a file, or MetaMask may not work correctly.

### 1. Setup and platform admin

**Network & Contracts**

- Confirm RPC URL (`http://130.60.144.77:8554/`).
- Paste the deployed `RobotDIDRegistry` address.

**NFT mint permission** (platform admin)

- Enter an address and click **Check MINTER_ROLE** / **Grant MINTER_ROLE** / **Revoke MINTER_ROLE** on `RobotIdentityNFT`.
- Required before minting new robots unless your MetaMask account already has the role.

**Issuer registry admin** (platform admin)

- Enter an address and click **Check DEFAULT_ADMIN_ROLE** / **Grant DEFAULT_ADMIN_ROLE** on `CredentialIssuerRegistry`.
- Required to register external issuers (deployer usually has this role initially).

### 2. Create robot

**Robot device wallet**

- Click **Generate Robot Wallet** — creates a private key used for register-challenge signing and robot self-signed VCs.
- This key is separate from the NFT management owner (MetaMask account).

**Mint NFT + register DID**

1. Optionally set **NFT owner address** (defaults to connected MetaMask account).
2. Optionally enter a **minter private key** if the minter is not the MetaMask account.
3. Click **Connect MetaMask + Mint & Register DID**.
4. Complete the three-phase checklist:
   - **Step 1 — Mint NFT** — mint transaction on `RobotIdentityNFT`.
   - **Step 2 — Build & sign challenge** — robot key signs the register challenge.
   - **Step 3 — Verify & register** — submit `registerDID` on-chain.
5. Use **Clear** to reset progress if needed.

**Robots browser**

- Click **Show Robots** to list minted NFTs.
- Click a robot avatar to **select** it (used by Manage DID and Issue VC sections).
- Toggle **Hide deactivated bots** to filter revoked DIDs.

### 3. Manage DID

Actions apply to the **selected robot** from Robots Browser (or enter a DID manually).

**Inspect**

- **Lookup DID Manually** — query any robot DID.
- **Show Selected Robot DID Details** — registry state and DID document for the selected robot.
- **Show On-chain Event Timeline** — mint, register, key rotation, suspend/unsuspend, NFT transfer, controller changes, credential revoke (recent blocks).
- **Show Permission Matrix** — controller permissions for the selected robot.

**Update key** (owner or controller with rotation permission)

- Enter a new private key or click **Generate New Rotation Key**, then **Rotate Selected Robot Key**.

**Transfer robot NFT**

- Enter new owner address → **Transfer Selected Robot NFT**. DID management rights follow the NFT.

**Controllers**

- Enter controller address; check permissions (rotate key, revoke credential, assert/sign).
- **Add DID Controller** / **Update Controller Permissions** / **Remove DID Controller**.

**Lifecycle**

- **Suspend** — blocks new valid credential issuance during the suspension window; historical VCs before suspend remain valid.
- **Unsuspend** — restores issuance; credentials issued *during* a past suspend window stay invalid.
- **Revoke** — permanently deactivates the DID; all verification fails.

### 4. Register trusted issuers

Requires MetaMask with `DEFAULT_ADMIN_ROLE` on `CredentialIssuerRegistry`.

1. Enter **issuer address** and optional profile (name, type, remark).
2. Select one or more **credential types**: Maintenance, Manufacturing, Safety Inspection, Operation License.
3. Click **Register Active Issuer DID** (whitelist the issuer).
4. Click **Grant Issuer Role** (assign selected credential-type roles).
5. Use **Check Issuer Role** or **Show Role Matrix** to confirm before issuing external VCs.
6. **Revoke Issuer DID** deactivates an issuer; their credentials fail verification even if signatures are valid.

### 5. Issue credentials

Select a robot in Robots Browser first. Three cards match the three issuance models:

| Card | Models | Credential types |
|------|--------|------------------|
| Robot self-signed | Robot signs about itself | Sensor Data, Heartbeat, Operational Log |
| Controller delegated | Authorized operator | Operational Log, Maintenance Log |
| External issuer | Registered third party | Maintenance, Safety, Manufacturing, Operation License |

**Common options (each card)**

- **Valid days** — credential expiry (`0` = expire immediately, useful for testing).
- **Private key (optional)** — sign locally; leave empty to sign via MetaMask.
- **Anchor gas payer**:
  - **Off-chain only** — JSON credential only; no anchor or consumption policy.
  - **Owner** — actor signs VC; enter **NFT owner private key** to pay anchor gas.
  - **Actor** — robot / controller / issuer signs and pays anchor gas via MetaMask.
- **Consumption policy** (when anchoring): **Unlimited use** or **Limited use** with **Max uses** (`1` = single-use).

Click the card's sign button; the generated JSON appears in the output panel below.

### 6. Verify and revoke

**Verify & Revoke VC** panel:

- Upload a `.json` file or paste credential JSON.
- **Max publish delay (seconds)** — default `86400` (24 h). For anchored VCs, requires `issuedAt <= publishedAt <= issuedAt + delay`.
- **Verify Credential** — read-only policy check; opens **Credential Verification Details** panel (schema, signature, key history, suspension, anchor timing, consumption).
- **Verify + Consume Credential On-chain** — verify, then increment use count if a limited-use anchor exists.
- **Revoke Credential On-chain** — revoke one credential by hash (requires permission).

**Result panels** (bottom of page): DID Registry State, DID Resolver Output, Event Timeline, Permission/Role Matrix, Verification Details — toggle **Show Raw JSON** where available.

### Suggested demo path

1. Setup → grant minter role if needed.
2. Create robot → mint + register → select robot in browser.
3. Issue self-signed VC (off-chain) → Verify → should pass.
4. Issue anchored VC with limited use → Verify + Consume twice → second attempt fails.
5. Suspend robot → issue VC locally → Verify fails → Unsuspend → same VC still fails (suspend window).
6. Register issuer + grant role → issue external VC → Verify.

Module layout: `ui/js/README.md`.

### End-to-end CLI example

```bash
npm install && cp .env.example .env
# Set PRIVATE_KEY, ROBOT_PRIVATE_KEY, UZHETH_POS_RPC_URL

npm run deploy
# Set REGISTRY_ADDRESS

npm run register
# Set ROBOT_DID

npm run issue:self
node verifier/verifyCredential.js credentials/RobotSensorDataCredential.json
npm run check
```

## Credential types

| `CREDENTIAL_TYPE` | Issuance model | CLI |
|-------------------|----------------|-----|
| `RobotSensorDataCredential` | Robot self-signed | `issue:self` |
| `RobotHeartbeatCredential` | Robot self-signed | `issue:self` |
| `RobotOperationalLogCredential` | Robot or controller | `issue:self` / `issue:controller` |
| `RobotMaintenanceLogCredential` | Controller delegated | `issue:controller` |
| `RobotMaintenanceCredential` | External issuer | `issue:issuer` |
| `RobotSafetyInspectionCredential` | External issuer | `issue:issuer` |
| `RobotManufacturingCredential` | External issuer | `issue:issuer` |
| `RobotOperationLicenseCredential` | External issuer | `issue:issuer` |

## Security Notes

Never commit private keys or `.env`. Robot keys should use secure storage in production (TPM, TEE, Secure Element). The registry enforces register-challenge signatures, global key uniqueness, key history at verification time, suspension intervals, and issuer whitelisting. Verification is **fail-closed**: any failed policy check rejects the credential.

## Limitations and Future Work

- Key rotation does not yet require an on-chain signature from the new key.
- Unanchored credentials are not protected against `issuedAt` backdating; high-risk types should require anchoring.
- Custom `did:uzheth` method; no full JSON-LD resolver service.
- Event timeline queries a bounded recent block range.

See `summary.md` for a detailed feature list, threat mitigations, and design notes.

## Why Decentralized DID

A centralized robot identity database creates a single trust authority and a single point of failure. A shared on-chain registry lets verifiers check identity, key authorization, suspension history, and credential status without relying on one vendor's database.
