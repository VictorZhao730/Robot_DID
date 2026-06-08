# Robot DID Project Summary

A decentralized robot identity (DID) and **VC-inspired** verifiable credential prototype on the UZHETH PoS chain. Core design: **NFT guarantees robot instance uniqueness**, **stable DID bound to tokenId** (one active DID per NFT), **device key separated from management owner**, **on-chain registry + off-chain credential verification**.

**Technical scope (not a full W3C stack):** project-specific `did:uzheth` and canonical JSON; **no** JSON-LD, JWS, or VC-JWT. Signatures use **EIP-191** (`signMessage` / `verifyMessage`) over Keccak256(canonical JSON). `registerDID` uses a separate digest: `keccak256(abi.encode("RegisterRobotKey", ...))`. Content hash excludes `proof` / `id` / `credentialStatus`; the signature message excludes only `proof`.

---

## 1. Implemented Features

### 1.1 On-Chain Identity and Assets

| Module | Role |
|--------|------|
| **RobotIdentityNFT** | ERC-721 robot identity NFT; `MINTER_ROLE` controls minting; DID management rights follow NFT transfer (Scheme A) |
| **RobotDIDRegistry** | Register / update / suspend / revoke DID; controller delegation; credential anchor / consume / revoke |
| **CredentialIssuerRegistry** | External issuer registration; per-credential-type roles; `DEFAULT_ADMIN_ROLE` for issuer onboarding and role grants |

### 1.2 DID and Key Model

- **Robot DID:** `did:uzheth:robot:<chainId>:<nftContract>:<tokenId>` — globally scoped asset identity; stable across key rotation
- **Controller / Issuer DID:** `did:uzheth:0x<address>` — human or organization identity
- **robotKey:** current device verification key (`publicKey` + `robotKeyAddress`)
- **usedRobotKeys:** global set of used keys; prevents the same address from being registered by multiple robots or reused
- **keyHistory:** `validFrom` / `validUntil` per key; supports historical authorization checks at `issuedAt`
- **Register challenge (enforced on-chain):** `registerDID` requires a robot-key signature over `(did, publicKey, address)`; the NFT owner may submit the transaction but cannot bind a key without a valid signature

### 1.3 DID Lifecycle (Graduated Revocation)

| Operation | Effect |
|-----------|--------|
| **suspendDID** | Records a suspension interval; verification rejects credentials whose `issuedAt` falls inside **any historical suspend window**; credentials issued before suspend remain valid |
| **unsuspendDID** | Ends the current suspend window and restores issuance; credentials issued **during** a suspend window remain permanently invalid after unsuspend |
| **revokeDID** | Permanent deactivation; all credential verification fails; key history closed |
| **updatePublicKey** | Key rotation **blocked** while suspended (contract requires unsuspended DID) |

### 1.4 Verifiable Credentials

**Three issuance models:**

1. **Robot self-signed** — sensor, heartbeat, operational log
2. **Controller delegated** — maintenance log, operational log (authorized operator)
3. **External issuer signed** — maintenance, safety, manufacturing, operation license

**Verification policy (CLI: `lib/verifyCredentialCore.js`; UI: equivalent logic mirrored in `ui/js/`):**

- Signature recovery (EIP-191), credential policy, expiry, `credentialNotRevoked`, consumption availability
- Robot self-signed: `isRobotKeyAuthorizedAt(did, signer, issuedAt)`
- Controller: `CONTROLLER_ASSERTION` permission bit + assertion checks
- External issuer: active issuer + role match
- **Policy drift risk:** CLI and UI each maintain policy logic; keep them in sync
- **Issued but not fully enforced at verification:** `proofPurpose`, `maxValidityDays` (verification primarily checks `expirationDate` and signer)
- **Anchor issuance timing (anti-backdating, anchored credentials only):** `issuedAt <= publishedAt <= issuedAt + maxPublishDelay` (`lib/anchorTiming.js`, default 86400s); skipped when not anchored
- Malformed robot DID pre-check (`did:uzheth:robot:<chainId>:0x<nft>:<tokenId>` canonical form)
- Visual UI panels: Policy Checks, On-chain Anchor, **Anchor Issuance Timing**, Consumption Registry, Consume results

### 1.5 On-Chain Credential Capabilities

- **Anchor:** optional on-chain attestation (hash + type + **`publishedAt`**) with **consumption policy** (only when anchored)
  - `publishedAt` is the on-chain anchor timestamp; verification compares it to `issuedAt` in the VC to mitigate **issuedAt backdating**
  - `UNLIMITED (0)`: repeatable consume (events only; `useCount` not incremented)
  - `LIMITED (1)` + `maxUses`: `1` = single-use, `N` = at most N uses
- **Consume:** in LIMITED mode, increments `useCount`; after limit, `consumptionAvailable` is false and verification fails
- **Verify + Consume (UI / CLI `--consume`):** verify first; consume on-chain if consumption policy is configured; otherwise report that consume is unavailable
- **Revoke credential:** revoke a single VC by content hash

### 1.6 Web UI (`ui/index.html`)

End-to-end demo in six sections on one page:

1. **Setup** — RPC, registry address; NFT `MINTER_ROLE`; Issuer Registry `DEFAULT_ADMIN_ROLE` check/grant
2. **Create Robot** — generate device wallet; Mint + Register checklist (Step 1 Mint → Step 2 Build & Sign → Step 3 Verify & Register); Clear resets progress
3. **Manage DID** — lookup, timeline, key rotation, NFT transfer, controllers, suspend / unsuspend / revoke
4. **Trusted Issuers** — Register Issuer / Grant Role (requires registry admin, not robot owner)
5. **Issue VC** — three issuance models; optional local private key or MetaMask signing
   - **Anchor gas payer = Actor:** actor private key (optional) or MetaMask signs and pays gas
   - **Anchor gas payer = Owner:** actor signs via MetaMask/private key; owner private key pays anchor gas
   - **Off-chain only:** no on-chain anchor; consumption policy hidden
   - **Limited use:** prompts for Max uses when selected
6. **Verify** — read-only verify; **Verify + Consume**; on-chain revoke; configurable **maxPublishDelaySeconds**; result panels show anchor timing details

### 1.7 Toolchain

- Hardhat compile and test (**53 tests**): `RobotDIDRegistry`, `RobotDIDRegistry.lifecycle`, `CredentialIssuerRegistry`, `verifyCredentialCore`, `verifyCredentialCore.extended`, `anchorTiming`, `consumptionRegistry`, `credentialPolicies`, `didUzheth`, `onChainAnchor`, `registryClients`, CLI smoke
- **CLI:** `deploy`, `register`, `check`, `suspend` / `unsuspend`, `rotate`, `transfer:nft`, `controller`, `revoke`; `issuer:*`, `minter:*`; `issue:*` (optional anchor); `anchor` / `consume` / `revoke:credential`; `verifier/verifyCredential.js` (supports `--consume`)
- Solidity optimizer enabled (contract size control)

---

## 2. Threats Addressed

| Risk | Mitigation |
|------|------------|
| **All old VCs invalid after key rotation** | `keyHistory` + historical authorization at `issuedAt` |
| **Same key reused across robots** | Global `usedRobotKeyAddresses` |
| **Rotate back to a historical key** | Used keys cannot be bound again |
| **Cross-DID impersonation** | `isRobotKeyAuthorizedAt` scoped per DID |
| **issuedAt before key validity** | On-chain reject when `timestamp < validFrom` |
| **validUntil boundary ambiguity** | Invalid only when `timestamp > validUntil` |
| **Old NFT owner still manages DID after transfer** | `_managementOwner()` reads current NFT owner |
| **Register key poisoning** | On-chain register challenge signature (bypassing UI is ineffective) |
| **Revoke vs suspend confusion** | Graduated model: suspend records historical windows (VCs issued inside a window stay invalid); revoke is permanent |
| **LIMITED VC reused** | LIMITED anchor + verify checks `consumptionAvailable`; production flows should **Verify + Consume** |
| **Robot vs issuer DID confusion** | Verification distinguishes `isRobotDid` vs `isAddressDid` |
| **Issuer registration requires platform admin** | `CredentialIssuerRegistry.registerIssuer` needs `DEFAULT_ADMIN_ROLE` (independent of robot NFT owner) |
| **issuedAt backdating** | When anchored: `publishedAt` on-chain + timing check at verify; **unanchored** credentials still cannot be protected |

**Known gaps (contract / policy could be hardened further):**

- **Key poisoning on rotate:** UI requires a new private key; contract does **not** yet require a signature from the new key; **rotation blocked while suspended**
- **Backdating for unanchored VCs:** no `publishedAt` constraint on off-chain-only verify; mandate anchor or reject unanchored credentials if strict binding is required
- **`lib/` vs `ui/js/` policy duplication:** equivalent logic in separate files; drift risk remains
- **`RobotOwnershipCredential` / `OWNER_ISSUER_ROLE`:** defined in contracts but not in the current eight-type policy set
- **`proofPurpose` / `maxValidityDays`:** set at issuance; not fully enforced at verification

**No longer an issue:**

- ~~Direct contract call to bind someone else's robot key without UI~~ — register challenge is **enforced on-chain**; raw calls still need a valid signature

---

## 3. Future Improvements

### Security and Cryptography

1. **Rotate challenge signature** — same model as register
2. **publicKey ↔ robotKeyAddress consistency** — on-chain validation
3. ~~**Strong issuedAt binding**~~ — anchor timing implemented; optional: reject unanchored credentials or use shorter delay

### Architecture and Contracts

4. **Contract split** — Registry + ConsumptionRegistry
5. **Upgrade path** — proxy (requires audit)
6. **Robot self-registration** — device wallet registers itself (gas model)

### Verification and Interoperability

7. **DID document / resolver extensions**
8. **Unified policy engine** — e.g. Wasm to eliminate `lib/` vs `ui/js/` drift
9. **W3C VC interoperability test vectors** (if JSON-LD / JWS compatibility is required)
10. **Configurable verify vs consumption enforcement** — e.g. audit-only without enforcing consume

### Product and Operations

11. **README / deployment docs** — largely in place; keep aligned with CLI
12. **E2E tests** — UI critical paths
13. **Subgraph / indexer** — timeline, robots browser
14. **Multi-chain config** — chain ID 70207 partially hardcoded today

### User Experience

15. **Robots Browser shows suspend status**
16. **Auto-sync device wallet fields after rotate**
17. **One-click credential template fill**

---

## 4. Stack Overview

```
contracts/          RobotDIDRegistry, RobotIdentityNFT, CredentialIssuerRegistry
lib/                didUzheth, verifyCredentialCore, credentialPolicies, consumptionRegistry,
                    onChainAnchor, anchorTiming, cliEnv, registryAbis, issueAnchor
ui/                 Static HTML + ethers.js (`ui/js/` split into core / registry / credentials / ui; panelRender for verify UI)
test/               Hardhat unit tests + CLI integration smoke
scripts/            deploy, register, check, lifecycle, issuer/minter admin, anchor/consume/revoke credential
robot|controller|issuer/   CLI credential issuance
verifier/           Off-chain credential verification (+ optional --consume)
```

**Gas model (demo convention):**

| Operation | Gas payer |
|-----------|-----------|
| Mint / register DID | NFT owner (MetaMask / `PRIVATE_KEY`); robot only signs challenge off-chain |
| Sign VC | Off-chain `signMessage`; no gas |
| Anchor | Owner private key or actor MetaMask / private key |
| Consume / revoke credential | MetaMask or `PRIVATE_KEY` (UI and CLI) |

**Read-only vs write on-chain:**

- Pre-issue checks (key authorization, controller permissions, issuer roles): `view` calls, **no gas**
- Verify: off-chain signature verification + RPC reads; **Verify + Consume** submits a transaction

---

## 5. Current Status

- After contract changes, **redeploy** and update registry address in UI / `.env`
- Tests: `npx hardhat test` — **53 passing** (includes lifecycle, suspend windows, anchor timing edge cases, `verifyCredentialCore.extended`)
- After UI changes, **hard-refresh** the browser cache (scripts are modular; CSS still uses `?v=` cache busting)
