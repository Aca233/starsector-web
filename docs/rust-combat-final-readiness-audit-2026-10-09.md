# Rust/Wasm 最终启用与可玩收尾审计

日期：2026-10-09。初次交付为只读代码审计和最小实施方案。后续 ROOT 授权资源路径窄修，已按下节实现并完成其集中验收；仍不改默认后端、ready 标记或性能门槛，不执行正式 CPU 场/全 UI/LAN/整场、不接可见窗口，不提交、打包或发布。本文不是最终全部可玩报告。

## 已授权实施细化：资源路径窄修

ROOT 于本审计完成后授权只修路径，f080 formal 性能门仍未通过，ready/default 继续保持。生产写集限制为 `RustCombatModule.ts`、`LocalWorkerHost.ts` 创建 Worker 路径、`LanBattle.tsx` host 创建 Worker 路径，以及 `RuntimePaths.ts` 一个共享位置 helper；不改 solver、规则配置、回放 envelope、backend/ABI/digest/能力与冷回退。

已实际读取 Vite 6 `node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:41360–41463`：workerImportMetaUrl 插件只识别直接 `new Worker(new URL(literal, import.meta.url)...`，并从 URL 表达式后解析静态 options。不能先把 URL 放变量、用 helper 包住或在该位置调用带逗号的 replace。具体方案保静态表达式，以 `.href + runtimeWorkerAssetQuery` 附加 query；共享 query 常量在主页面用 `new URL(runtimeAssetUrl(''), document.baseURI)` 解析并 encode 基址，Vite DEV Worker 已有 `worker_file&type=module` 用 `&`，生产 hashed Worker/ABBA 根 Worker 用 `?`。两个既有 literal 本身没有 query。document 不存在时该常量为空，不给 Node 新增 URL 输入。

加载器通过共享 helper 解析 Worker query，只接受同源 HTTP(S)、无凭据/query/hash且目录形式的资源基址；默认主页面直接 loader 使用其真实 runtime 资源位置。没有 query 的旧 Worker/Node checker 保原 `/game-assets/runtime/` 根路径，Node 本地 fetch shim 不改。manifest/bytes/SHA/compile 校验和失败 cold fallback 全保。恢复通过 LocalWorkerHost 同一构造路径自然获得新 Worker 基址，不写进 checkpoint，不热换运行中的实例。

实现完整后集中一次 scoped TypeScript，以及一份 artifact 内小实际 Vite 生产 bundle 的无头根/子目录运行：实际 installed SHA、manifest/Wasm 请求路径、LocalWorkerHost 冷初始化/真实一 tick/fresh restore/继续一 tick；同模式的生产 host Worker 冷 ready 和真实一 tick核验。范围不包括全 UI/LAN、ABBA/60Hz、七包整场或完整游戏 build；不构建/发布生涯。附加必要同源拒绝/Node根路径断言，明确只是路径契约，不称最终可玩资格。

实施/验收已完成。实际生产改动为上述四文件（RuntimePaths 仅追加共享 helper 与 query 常量，保用户原 mountedAssets 改动），静态表达式、DEV/production query、同源位置处理与 Node 根保留均按方案。证据 `artifacts/rust-combat-core-20261008/verification-runtime-paths/result.json`：passed:true；安装 SHA `f080f34beb482c78d442fa881cd10243ffe34f0a8f2e76fa5a7dbbcb871b34be`。实际小 Vite 生产 hashed Worker 在 `/` 与 `/starsector/` 各完成 cold Rust、tick1、fresh replay restore tick1、继续 tick2 witness严格同/audio不重复，以及真实 host Worker cold Rust/tick1。两部署各六次 manifest/Wasm 请求、三个新 Worker query全部正确前缀，fallback:false、pageErrors[]。LanBattle React UI 未挂载，生产同构静态创建表达式已检查且 scoped types覆盖，不能声称全 UI 已验。

Node loader 通过原两条 `/game-assets/runtime/...` 本地请求取得同 SHA，query 为空，fetch shim生产零改；跨源、凭据、基址query/hash及无目录尾斜线五类值拒绝。集中特ypes初次只失败于 artifact entry 的 readonly packs赋值，展开数组后定向复查 exit0；没有改 production类型合同。运行 source owned/bound changed均[]。本轮不证明 f080 当前全部 solver源或最终 native性能已合格，也未宣称60Hz/整场/Steam实机。

四 production 文件验收时 SHA：RuntimePaths `f1d3d3b8a33d8cf6d3cac6b4f9fe592ba32d7cb1267f073a7ac7aa2f5f82e975`；RustCombatModule `7200f24c00606416a507f3005d22cf0d260e7d349cfeab8ded5bfde97e4d09f1`；LocalWorkerHost `d87cf02a7dd5c4c77aca868162d61f4a6fcd4183e15f44a523fd366cc8e5de60`；LanBattle `901415f96c6ce258ff84e44f20fc27b69ef7a5dcb0a5bc60749762a8a0d1d3d0`。最终资格仍须 ROOT 的新构建同 SHA 收尾；路径模块已冻结，不重复本轮通过的小场。

目标是执行用户“全部做完，能正常游玩再停”的战斗迁移要求，使普通浏览器与桌面共享已验证的 Rust/Wasm，保留当前部署、驾驶、撤离、结果、回放恢复和内容扩展流程。范围与已确认取舍沿用 [主策划](rust-combat-core-plan-2026-10-08.md)，原版 0.98a-RC8/API/反编译证据沿用 [来源对照](rust-combat-core-source-notes-2026-10-08.md)。本次是内部启动接线和证据一致性，不增加玩法、UI、原生桌面第二求解器或生涯改动；没有新原版实机验证。

## 已核实的入口和状态

| 实际来源 | 当前行为 | 最终需要保持或修改 |
| --- | --- | --- |
| `native/combat-core/src/lib.rs:138` | `core_full_battle_ready()` 返回 0 | 全部既定门槛通过后才进入 1 的最终构建资格审查；改值本身改变 Wasm SHA |
| `src/engine/runtime/rust/RustCombatCore.ts:88,111,405` | 属性和快照硬编码 false；create 遇到导出非 0 直接拒绝 | 必须同批改为校验并读取真实 0/1，属性与快照一致；只翻 Rust 导出会使全部加载失败并回退 TS |
| `src/engine/runtime/rust/RustCoreProtocol.ts:484` | `fullBattleReady` 类型为字面量 false | 改为与真实导出一致的 boolean；不得谎报为固定 true |
| `src/CombatView.tsx:74–75` | 普通 URL 选择 TS；`?combat=rust` 选择 Rust；`inline` 与 visual lab 不启 Worker | 所有最终门槛通过后普通入口选择 Rust，保留明确 TS 调试退路、inline 与 visual lab 原行为；不新增设置页 |
| `src/engine/runtime/CombatSession.ts:68,95` | 内部初值及 `enableWorker()` 默认参数为 TS | 最终默认策略同步；检查其它调用者，显式 TS 调用及旧 checkpoint 的 TS 含义不改 |
| `src/network/LanBattle.tsx:660` | 浏览器房主 init 已明确请求 Rust | 无需再造 LAN 求解器开关；ready ACK 必须确认实际 backend/SHA，不能仅看请求 |
| `server/authority-worker.mjs:21` | Node 服务端权威 init 已请求 Rust | 保实际本地 loader、独立每场 Worker、相同 Wasm 与 source-bound bundle |
| `desktop/main.mjs`、`desktop/backend.mjs`、`server/electron-service.mjs` | 桌面加载现有本地 HTTP 网页 bundle | 与浏览器使用同一资产；普通网页入口修改决定桌面默认；不是原生 Rust solver |
| `server/lan-server.mjs:82` 与 Steam 现有 gateway/relay | Dedicated authority 不与 Steam extension 共用；Steam 房主走浏览器 host Worker | 保当前宿主/权限/传输结构；不要把 Node 接线当作独立 Steam 游戏求解器完成 |

当前 public manifest 会被 ROOT 的新正式构建更新。审计前半读取过 cf8c3f8a 构建，后半读取到 f080f34b 构建；这只证明工作进行中，不为任何新 SHA 判定通过。最终报告应从冻结后 installed manifest、实际 authority ACK、各 checker 输出读取完整 SHA，不把本文的历史值当最终标识。

## 具体遗漏及最小一致改动

### 1. ready 导出、绑定与报告

绑定的静态 create 应严格拒绝非 0/1 值，并把真实导出值传给实例；`fullBattleReady` 属性及 snapshot 使用该值。ABI/layout/domain 校验继续保持。独立领域测试可接受明确提供的 ready0 实验 artifact，不能使生产默认路径绕过最终资格。最终 installed 路径应有明确 ready1 要求或同等可核实的最终资格接线；过时 ready0 资产必须整场冷回退，不能静默冒充已启用最终 Rust。

旧测试中的 `fullBattleReady:false` 有两种含义，必须区分：历史领域报告仍真实代表当时的实验资格；对最终 artifact 的报告应读取实际标记。`scripts/lib/rust-core-foundation-check.ts:27` 的“基础域不能冒称全战斗”断言不能直接删掉并伪造历史报告。`scripts/check-rust-kernel-startup.mjs:32`、其 lib 返回结果、`scripts/benchmark-rust-combat.mjs` 最终 metadata 等仍硬编码 false，最终使用时须注明实际 native readiness 与本检查自身覆盖；修改报告不放宽任何行为/性能断言。

ready0 到 ready1 会改变 native 源 fingerprint 和 Wasm SHA，即使算法不变。ready0 的严格差分、ABBA、LAN 成功不能直接改标签成为 ready1 成功。ready1 的 fresh Cargo/LTO artifact 是另一份最终候选，须完成下述同 SHA 检查；若失败保留失败证据并保持 TS 默认，不能靠改标记通过。

### 2. 子目录与真实 Worker 资产基址

`RustCombatModule.ts:7–8` 固定 fetch `/game-assets/runtime/combat-core.*`，绕过 `RuntimePaths.ts` 与 `vite.config.ts:20–22` 宣告的相对子目录部署。ROOT 最终默认启用前需处理这一明确加载缺口。

不能机械替换成 `runtimeAssetUrl('runtime/combat-core.wasm')`：当前 `BASE_URL='./'` 时返回相对地址，生产 Worker 通常位于 `/assets/`，Worker 内 fetch 可能落到 `/assets/game-assets/`。开发服务器和 checker 的根目录 Worker 成功不证明生产子目录成功。

最小候选方案是在浏览器宿主创建 Worker 时传入主页面已解析的资源基址，而不把该部署位置放入规则配置或回放见证：

- `LocalWorkerHost.ts` 与 `LanBattle.tsx` 保现有静态 `new URL(worker, import.meta.url)` 供 Vite 识别，在该 URL 的 query 写入 `new URL(runtimeAssetUrl(''), document.baseURI).href`；Worker loader 从自身 URL 读取受限同源基址，再解析 `runtime/combat-core.json/wasm`。
- Node Worker 无浏览器 location/query，继续使用 build 的 `BASE_URL='/'` 和本地 `/game-assets/` 路径。`server/authority-worker.mjs:9–14` 的 fetch shim 拒绝 URL scheme，并经 realpath 限定到资产根；不可为了浏览器路径放开 Node 网络读取或路径逃逸。
- 支持主线程 loader 调用时用主页面资源策略解析；没有显式 browser asset base 的 checker 保原根路径。基址只用于加载位置，不改变 SHA、规则、内容能力或 backend 身份。
- 保留清单 sha256 64 字符、bytes、crypto digest 和 compile 检查；资源下载/版本/ABI 失败继续进入原冷回退。是否同时校验 manifest.version=1 属窄一致修正，不是改变规则的必要条件。

初次审计时这是候选；后续已按本文“已授权实施细化”窄落并验证根/子目录真实生产 Worker、同基址恢复和 Node 根。桌面根 HTTP 由相同根场加载验证覆盖，未运行可见 Electron。最终部署若更改 URL 结构仍需对应针对性证据，不能凭 `runtimeAssetUrl` 名字认定所有外部部署已验。

### 3. 冷回退和恢复边界已经接好，默认迁移不能破坏

`local/local-combat.worker.ts:43–57` 只在未推进的初次 init 失败时销毁私有 Rust 候选并选择完整 TS，保留请求/实际 backend 和 bounded reason；恢复不走这条回退。`LocalWorkerHost.ts` 接受首次冷回退 ACK 后把 journal 的实际 backend 更新为 TS。`CombatSession.ts` 诊断公开 requested/actual/fallback，最终可据此区分“能玩”和“实际 Rust 能玩”。

`RustContentCompiler.ts:189–232` 核验系统、舰装、效果 callback 身份以及生成武器/舰船/机翼闭包。`RustCombatKernel.create()` 与 `RustLanKernel.create()` 都先编译启动能力，再安装 native 状态。未知或被替换的可信 TS 能力整场冷回退，保其真实回调；不能删掉扩展、减少舰船或在 Rust 推进后切换求解器。`host.worker.ts:682–699` 有 lifecycle generation 检查及冷回退，旧异步 Rust 初始化不能替换新场权威，live failure 不热切 TS。

`local/CombatReplayCheckpoint.ts:33–47` 的 `config.backend ?? 'typescript'` 是旧配置含义，不能随新默认全局替换为 Rust。恢复核对 format/build/protocol/content/backend/SHA、原确认日志/命令回执和 Object.is witness；SHA 不同应如实拒绝。`scripts/combat-replay-build.ts` 指纹覆盖所有 src 与 package-lock：ready 绑定/默认入口/loader 修改会改变 replay build，旧战斗恢复资格随之变化，但不是生涯 schema 修改。不得宣称跨构建无条件恢复，不把渲染副本作为权威。

loader Promise 缓存于每个模块图；已失败同一 Worker 不自动重试，新遭遇/新 Worker 可重新尝试。本次不新增活动场热换资产或后台热重试。安装只替换待新场使用的共享 public 资源，不改变已经运行的 authority epoch。

## 顺序与启用条件

1. ROOT 冻结全部已授权 solver/发布优化，完成当前 ready0 fresh Cargo/LTO 与正式 ABBA。正确性和性能两门均过才继续最终启用；失败继续实际根因优化，保留失败，不降低门槛。
2. 完成当前候选必要可玩/内容覆盖收尾后，按本审计同步 ready 导出、绑定/类型/快照、真实 report readiness、loader 部署位置。保持 TS 默认，建立新的 ready1 Cargo/LTO/install SHA。
3. 在此 ready1 SHA 与冻结模块图完成最少必要最终行为、性能和可玩验收，见下方。每一项记录实际 SHA、source/bundle fingerprints、changed 列表及覆盖边界；任何领域失败均不能宣布全部可玩。
4. 门槛齐全后只修改普通入口/`enableWorker` 默认选择。该步不再改 native，故 Wasm SHA 可以保持。对照最终 ABBA 和 LAN manifests 的实测输入图：默认入口文件若不在其输入图内，可保留该图的同 SHA 结果并明确记录默认入口补验；若任何已资格检查输入发生变化，重建对应 bundle 并只复查受影响资格，不能以旧 source-qualified:true 冒称新图通过。
5. 默认入口变更会改变 replay build，集中验证普通无参数 URL 实际 Rust、显式 TS/inline/lab 原入口、新 build 下 same-SHA checkpoint 恢复/changed-SHA 拒绝和结算一次回写。UI checker 固定 `?combat=rust`，因此必须补真实无 `combat` 参数的默认启动；不能只靠它证明已改默认。
6. 更新主策划 P2/P3/P4/P5 和交付文档的当前状态，报告真实收益、尾部、覆盖和外部限制。默认实际 TS fallback 的未知内容场可正常玩，但不计入七内置包 Rust 成功；不发布、不触碰用户桌面或生涯保存。

无新的玩家产品取舍需要再次确认。原来限定几何/严格规则合同、后端失败处理和共享 Wasm 选择已经获授权；本方案只把最终接线与验收落到具体文件。

## 同 SHA 的最少必要最终命令

由 ROOT 执行，本只读审计没有执行。输出目录需使用未存在的最终候选名称，保留旧失败/成功历史。final 是标识示例，不是已有结果。

```powershell
pwsh -File scripts/build-rust-combat-core.ps1
pwsh -File scripts/install-rust-combat-core.ps1
node scripts/benchmark-rust-combat.mjs --wasm public/game-assets/runtime/combat-core.wasm --out artifacts/rust-combat-core-20261008/final-ready1-abba
```

必须检查 `passed===true` 且 `performanceGate===true`。场景与 90 warm/180 sampled/TS-Rust-Rust-TS 不变；完整 simulation 均值减少至少 30%、roundtrip 至少 20%、两个配对皆改善、两项 P95/P99 均不回退。保存全样本，不挑选重跑。测量 scope 是真实 Worker/IPC/解码链，不是渲染 FPS 或远端网络。该 gate 不单独证明实时 60Hz。

```powershell
node scripts/check-rust-kernel-startup.mjs all 7200 --wasm public/game-assets/runtime/combat-core.wasm --out artifacts/rust-combat-core-20261008/final-ready1-kernel
node scripts/check-rust-player-flow.mjs --out artifacts/rust-combat-core-20261008/final-ready1-flow
node scripts/check-rust-player-flow.mjs --mode game-session --out artifacts/rust-combat-core-20261008/final-ready1-game-session
node scripts/check-rust-combat-ui.mjs --out artifacts/rust-combat-core-20261008/final-ready1-ui
```

七包命令中的 7200 是示例完整战斗上限（GameSession 既有场景也用 7200）；ROOT 应沿用已经冻结的七包整场上限，不能改控制/装备/准入来促成结束。kernel checker 默认只有 12 tick，`passed` 只表示跑过的部分；须逐包 `resultReady===true`、真实伤害与完整结算，不能因到 limit 无差就判整场通过。Node 回放应使用浏览器 canonical 记录与同 Wasm。player-flow 默认 all 不包含显式 game-session，后者独立检验实际 GameSession 私有 save-once，不写用户已有生涯。flow/UI 不加 `--wasm` 才检验 installed loader；override 路由只能证明注入 artifact。

子目录资源/default入口补验用既有无头 UI 流程的一次针对性运行即可：实际生产 Worker URL、请求基址、ready ACK 的 backend/SHA，部署与推进，取消/关闭；保留渲染/声音/操作回执。无需新建测试工程或重复所有领域探针。

```powershell
node scripts/check-rust-lan-authority.mjs --wasm public/game-assets/runtime/combat-core.wasm
node scripts/build-battle-server.mjs artifacts/rust-combat-core-20261008/verification-lan-authority/server-runtime --worker-only
node scripts/check-rust-lan-server.mjs
node scripts/check-rust-lan-room.mjs
node scripts/check-rust-lan-finish.mjs
node scripts/check-rust-lan-startup.mjs
```

这些现有 LAN 脚本使用固定 `verification-lan-authority`：最终执行前保留该目录原报告/production.wasm 与各独立输出的历史副本，不能覆盖后只剩最后一次成功。`--wasm` 显式使用 Cargo artifact 且 source manifest 相符，不能用诊断编译、reuse 或 `--host-only` 冒充全部资格。authority checker 包含 Node、fresh dedicated Worker 与真实 host；大场至少 600 tick、completedHz≥55 且 recoveries=0，保当前门槛与全部呈现输出。

Node server/room/finish 检查消费 authority checker 写出的 `production.wasm`，须确认与 installed/final SHA 相同。worker-only build 是开发验证 bundle，不是打包发布游戏。`scripts/lib/rust-lan-server-proof.mjs` 返回的 `currentPlainAuthorityQualified` 必须为 true，`changedSinceQualification` 和运行时 changed 必须空；单个 Node checker 自己 `passed` 不自动包含此前 host 资格。finish 保 terminal frame FIFO/真实结束，不能复用先前因源变化不合格的末帧证据。

startup 检验已知 Rust、加载失败、未知可信 TS 能力整场回退、旧 generation 异步完成隔离及 live fault 不热切后端；未知能力真实效果不能因 fallback 被删除。恢复/断线/输入 ACK 与房间权限使用这些既有场景验证，不新增产品规则。

## 外部限制与收尾报告要求

- `scripts/check-rust-steam-authority.mjs` 验证 production relay/准备 Workers 与注入 SDK IO，明确 `gameplaySolverExecuted:false`、`actualRemoteSteamSession:false`、`steamSdkInitialized:false`。未改 transport 时沿用其真实覆盖；不能把这个结果写成“最终 Rust 远端 Steam 实机通过”。本地 host 的 Rust gameplay 与 relay 接线分别报告。
- 未获授权启动可见 Electron/原版窗口或使用键鼠；原版实机/UI 对照和真实桌面可见运行仍未核实。无头网页与同资源 desktop 架构证据可报告为已验覆盖，不冒充可见桌面测试。
- 真实 Steam 账户/SDK/远端机器需要实际外部环境；本轮不能凭内部 checker补足。保留该明确限制，而不是擅改宿主/权限来绕过。
- 最终收益从通过的 formal ABBA 和实际 LAN 回执报告；旧 cf8c3f8a 性能失败、诊断 clone/fuse 微计时、不同 SHA 的域成功继续保留，不能合成虚构最终速度。

本审计交付可审阅方案、具体阻断与后续已授权路径窄修/验收；最终 CPU/可玩验收由 ROOT 集中整合。目前不声称最终 ready1、默认 Rust 或全部可玩已通过。
