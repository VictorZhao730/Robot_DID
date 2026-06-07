# UI JavaScript layout

Vanilla browser scripts (no bundler). Load order is defined in `index.html`.

## `core/`
Shared constants and DID helpers.
- `abi.js` — contract ABIs
- `config.js` — credential policies, issuance models, global UI state
- `did.js` — `did:uzheth` parsing, documents, canonicalization

## `registry/`
On-chain registry interactions (RobotDIDRegistry, CredentialIssuerRegistry, NFT).
- `connections.js` — RPC contracts, MetaMask / private-key wallets; resolves linked NFT + issuer registry from `RobotDIDRegistry`
- `nft-admin.js` — MINTER_ROLE on RobotIdentityNFT
- `issuer-admin.js` — issuer registry admin and issuer registration
- `controllers.js` — DID controllers, key rotation
- `did-queries.js` — lookup DID, list robots, timeline
- `robot-lifecycle.js` — suspend / unsuspend / transfer / anchor / consume
- `mint-register.js` — mint NFT + register DID flow

## `credentials/`
Verifiable credential build, issue, verify.
- `on-chain-anchor.js` — read anchor metadata from registry
- `anchor-timing.js` — `issuedAt` vs `publishedAt` policy
- `build.js` — hash, sign, schema validation helpers
- `issue.js` — issue flows + anchor-after-issue UI
- `verify.js` — verify, revoke, verify-and-consume

## `ui/`
DOM rendering and panels (no chain calls except via registry/credentials).
- `display.js` — JSON pretty-print
- `mint-register-ui.js` — mint/register step checklist
- `panelRender.js` — visual panels for DID / VC verification
- `panel-helpers.js` — show/hide panels, copy/clear field controls
- `format-helpers.js` — issuer profile formatting, HTML escape
- `matrices.js` — permission / role matrix views
- `robots-browser.js` — robot NFT grid and selection

## Root
- `app.js` — event wiring only
