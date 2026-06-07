# Robot DID 项目总结

基于 UZHETH PoS 链的去中心化机器人身份（DID）与可验证凭证（VC）原型。核心思路：**NFT 保证机器人实例唯一性**，**稳定 DID 绑定 tokenId**，**device key 与 management owner 分离**，**链上 registry + 链下 VC 验证**。

---

## 一、已实现功能

### 1. 链上身份与资产

| 模块 | 功能 |
|------|------|
| **RobotIdentityNFT** | ERC721 机器人身份 NFT；`MINTER_ROLE` 控制 mint；NFT 转移时 DID 管理权随之转移（Scheme A） |
| **RobotDIDRegistry** | 注册/更新/暂停/注销 DID；controller 委托；credential anchor / consume / revoke |
| **CredentialIssuerRegistry** | 外部 issuer 注册；按 credential type 分配角色；`DEFAULT_ADMIN_ROLE` 管理 issuer 登记与角色授予 |

### 2. DID 与密钥模型

- **Robot DID**：`did:uzheth:robot:<tokenId>` — 与 NFT 绑定、不随 key 轮换改变
- **Controller / Issuer DID**：`did:uzheth:0x<address>` — 人与机构身份
- **robotKey**：当前 device 验证密钥（`publicKey` + `robotKeyAddress`）
- **usedRobotKeys**：全局已用 key 集合，防止同一地址被多个 robot 注册或复用
- **keyHistory**：每次 key 的 `validFrom` / `validUntil` 时间窗，支持按 `issuedAt` 做历史授权校验
- **Register challenge 签名（链上强制）**：`registerDID` 要求 robot key 对 `(did, publicKey, address)` challenge 签名；owner 可代发 tx，但无法绕过签名绑定他人 key

### 3. DID 生命周期（分级撤回）

| 操作 | 效果 |
|------|------|
| **suspendDID** | 暂停新发 VC；`issuedAt < suspendedAt` 的历史 VC 仍可验证 |
| **unsuspendDID** | 恢复新发 |
| **revokeDID** | 彻底注销；所有 VC 验证失败；关闭 key history |

### 4. 可验证凭证（VC）

**三种签发模型：**

1. **Robot self-signed** — 机器人自签（sensor、heartbeat、operational log）
2. **Controller delegated** — 授权 operator 代签（maintenance log、operational log）
3. **External issuer signed** — 第三方机构签（maintenance、safety、manufacturing、operation license）

**验证策略（`verifyCredentialCore` + UI）：**

- 签名恢复、schema、过期、`credentialNotRevoked`、consumption 可用性
- Robot self-signed：`isRobotKeyAuthorizedAt(did, signer, issuedAt)`
- Controller：assertion 权限检查
- External issuer：issuer 活跃 + 角色匹配
- **Anchor issuance timing（防 backdating，仅已 anchor 时生效）**：`issuedAt <= publishedAt <= issuedAt + maxPublishDelay`（`lib/anchorTiming.js`，默认 86400s）；未 anchor 则跳过此项检查
- 畸形 robot DID 预校验（`did:uzheth:robot:<digits>` canonical form）
- Visual view 展示：Policy Checks、On-chain Anchor、**Anchor Issuance Timing**、Consumption Registry、Consume 结果

### 5. Credential 链上能力

- **Anchor**：可选上链存证（hash + type + **`publishedAt`**）；支持 **consumption policy**（仅 anchor 时生效）
  - `publishedAt` 为链上 anchor 时刻，供 verify 校验 VC 内 `issuedAt` 是否与发布时间一致，缓解 **issuedAt 回拨**
  - `UNLIMITED (0)`：可反复 consume（仅记事件，不增 useCount）
  - `LIMITED (1)` + `maxUses`：`1` = 单次，`N` = 最多 N 次
- **Consume**：LIMITED 模式下递增 `useCount`；超限后 `consumptionAvailable` 为 false，verify 失败
- **Verify + Consume（UI）**：先 verify，若链上已配置 consumption 则 consume；未配置则提示无法 consume
- **Revoke credential**：按 hash 撤销单张 VC

### 6. UI（`ui/index.html`）

演示全流程可视化：

1. **Setup** — RPC、合约地址；NFT `MINTER_ROLE`；Issuer Registry `DEFAULT_ADMIN_ROLE` 检查/授予
2. **Create Robot** — 生成 device wallet；Mint + Register 分步 checklist（Step1 Mint → Step2 Build & Sign → Step3 Verify & Register）；Clear 重置进度
3. **Manage DID** — lookup、timeline、key rotation、NFT 转移、controller、suspend / unsuspend / revoke
4. **Trusted Issuers** — Register Issuer / Grant Role（需 registry admin，非 robot owner）
5. **Issue VC** — 三种模型；可选私钥本地签或 MetaMask
   - **Anchor gas payer = Actor**：actor 私钥（可选）或 MetaMask 签名 + 付 gas
   - **Anchor gas payer = Owner**：actor MetaMask/私钥签名；owner 私钥（选 Owner 时在卡片内弹出）付 anchor gas
   - **Off-chain only**：不上链；隐藏 consumption policy 配置
   - **Limited use**：选中后弹出 Max uses
6. **Verify** — 纯 verify（只读）；**Verify + Consume**（verify 通过后 consume）；revoke on-chain；可配置 **maxPublishDelaySeconds**；结果面板展示 anchor timing 明细

### 7. 工具链

- Hardhat 合约编译与测试（**49 tests**：合约 lifecycle、issuer registry、verifyCredentialCore、anchorTiming 边界、consumptionRegistry、CLI smoke）
- CLI：`deploy`、`register`、`check`、`revoke`；`robot/`、`controller/`、`issuer/` 签发；`verifier/verifyCredential.js`
- Optimizer 已开启（合约体积控制）

---

## 二、避免的问题

| 风险 | 设计对策 |
|------|----------|
| **Key 轮换后旧 VC 全部失效** | `keyHistory` + `issuedAt` 历史授权 |
| **同一 key 被多个 robot 复用** | 全局 `usedRobotKeyAddresses` |
| **Rotate 回历史 key** | 已用 key 无法再次 bind |
| **跨 DID 冒签** | `isRobotKeyAuthorizedAt` 按 DID 查 history |
| **issuedAt 早于 key 生效** | 链上 `timestamp < validFrom` → 拒绝 |
| **validUntil 边界歧义** | `timestamp > validUntil` 才失效 |
| **NFT 转移后旧 owner 仍可管 DID** | `_managementOwner()` 读当前 NFT owner |
| **Register key poisoning** | **链上** register challenge 签名（已解决，绕 UI 无效） |
| **Revoke / suspend 语义混淆** | 分级：suspend 只禁新发；revoke 彻底作废 |
| **LIMITED VC 被重复使用** | anchor 设 LIMITED + verify 查 `consumptionAvailable`；业务放行应 **Verify + Consume** |
| **Robot / issuer DID 混用** | 验证路径区分 `isRobotDid` vs `isAddressDid` |
| **Issuer 登记需 platform admin** | `CredentialIssuerRegistry.registerIssuer` 需 `DEFAULT_ADMIN_ROLE`（与 robot NFT owner 无关） |
| **issuedAt 回拨（backdating）** | 已 anchor 时：`publishedAt` 上链 + verify 校验 timing；**未 anchor** 仍无法防回拨 |

**已知未完全覆盖（链上仍可加强）：**

- **Rotate 时 key poisoning**：UI 要求新私钥；合约层 rotate **尚未**要求新 key 签名
- **未 anchor VC 的 issuedAt 回拨**：仅 off-chain verify 时无 `publishedAt` 约束；若业务要求强绑定，需强制 anchor 或拒绝未 anchor 凭证

**已不再是问题：**

- ~~直接调合约绕过 UI 注册 bind 他人 robot key~~ — register challenge **链上强制**，raw call 同样需有效签名

---

## 三、可改进方向

### 安全与密码学

1. **Rotate challenge 签名** — 与 register 一致
2. **publicKey ↔ robotKeyAddress 一致性** — 链上校验
3. ~~**issuedAt 强绑定**~~ — 已实现 anchor timing；可选：未 anchor 时强制拒绝或更短 delay

### 架构与合约

4. **合约拆分** — Registry + ConsumptionRegistry
5. **Upgrade 路径** — proxy（需审计）
6. **Robot 自注册** — device wallet 自行 register（gas 模型）

### 验证与互操作

7. **DID 文档 / resolver 扩展**
8. **W3C VC 互操作测试向量**
9. **Verify 与 consumption 策略可配置** — 例如「仅 audit、不 enforce consume」

### 产品与运维

10. **README / 部署文档**
11. **E2E 测试** — UI 关键路径
12. **Subgraph / indexer** — timeline、robots browser
13. **多链配置** — chainId 70207 目前部分硬编码

### 用户体验

14. **Robots Browser 显示 suspend 状态**
15. **Rotate 后自动同步 device wallet 字段**
16. **Credential 模板一键填充**

---

## 四、技术栈一览

```
contracts/          RobotDIDRegistry, RobotIdentityNFT, CredentialIssuerRegistry
lib/                didUzheth, verifyCredentialCore, credentialPolicies, consumptionRegistry, onChainAnchor, anchorTiming
ui/                 静态 HTML + ethers.js（`ui/js/` 按 core / registry / credentials / ui 分模块；panelRender 可视化 verify）
test/               Hardhat 单元测试 + CLI integration smoke
scripts/            deploy, register, check, revoke
robot|controller|issuer/   CLI 签发
verifier/           链下 VC 验证
```

**Gas 分工（demo 约定）：**

| 操作 | Gas |
|------|-----|
| Mint / register DID | NFT owner（MetaMask）；robot 仅链下签 challenge |
| 签 VC | 链下 `signMessage`，不需 gas |
| Anchor | Owner 私钥或 Actor MetaMask/私钥 |
| Consume / revoke | MetaMask（当前 UI） |

**链上只读 vs 写链：**

- 签发前 pre-check（key 授权、controller 权限、issuer 角色）：`view` 调用，**不花 gas**
- Verify：链下签名验证 + RPC 只读；**Verify + Consume** 才发 tx

---

## 五、当前状态

- 合约变更后需 **重新 deploy** 并更新 UI 合约地址
- 测试：`npx hardhat test` — **49 passing**（含 anchor timing 边界与 verifyCredentialCore 扩展用例）
- UI 修改后 **硬刷新** 浏览器缓存（脚本路径已分模块，CSS 仍带 `?v=`）
