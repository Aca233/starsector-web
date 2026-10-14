# 本地战斗冷启动兼容回退方案

2026-10-09 恢复续修实际通过并冻结：只 `CombatSession.ts` import/两处sameBackendIdentity拒绝及starting host等待真实ready；SHAc7e8a270373b45873957dbcc110db9a02b91125349e17d905d9238b448f62ba3。current installed6104/2,693,051bytes，新无头Chromium、真实Session/LocalWorkerHost/productionWorker/replay，tmp renderer stub仅免加载画面（不能称UI验收）。同遭遇TS<-Rust、Rust<-TS、Rust不同SHA都0候选Worker且原host/帧/epoch不变；sameTS/sameRust恢复tick1原witness逐位exact；全新未建host页面原请求TS仍可依据有效Rust日志恢复actualRust；已有starting无ACK Rust host真正等ready后拒绝TS候选、0创建；真实loader404 cold fallback所选TS拒绝Rust日志且sameTS恢复accepted。pageErrors0、sourceUnchangedtrue。artifact `tmp/flight-session-restore-backend/result.json`，最终combatTSC/scopedSessionlint exit0。未重跑旧冷五场、未编native/改default，CPU检查完毕。此合同缺口已修；本文末旧“只读待修”是发现记录，以当前实际结果为准。

2026-10-09 恢复边界续修：owned呈现delta已完成冻结，按本案末记录及core-plan65的既有相容backend合同，继续仅 `CombatSession.restoreCheckpoint` 错误修正。已有latest ACK时在创建candidate前核sameBackendIdentity；若旧host尚无ACK但ready正在进行，在原pause/barrier完成后再次核实际authority，避免异步冷回退选择尚未确定时绕过。backend不同或Rust SHA不同直接拒绝，保旧host/回执，既有UI/格式/命令/恢复流程不变。首次没有任何旧host ACK的页面仍可按有效日志的真实backend建立候选；candidate自身已有journal/SHA/witness严格复验。范围不扩其它启动文件/default/native/LAN，不重复旧冷回退五场。只集中实际Session有效同后端恢复、跨backend/SHA创建前拒绝、冷回退TS真实身份与首次无ACK日志恢复；未完成验证不称passed。

目标是现有浏览器/Electron 开战流程在 Wasm 下载、CSP、编译、ABI、完整内容闭包或初始发布失败时仍能正常游玩。依据已获授权的 `rust-combat-core-plan-2026-10-08.md:46–65`：整场必须在推进前选定唯一 TS/Rust 权威，失败原因进入开发诊断；Rust 推进后不能热切换。此次只补本地启动链，默认 TS、显式 `?combat=rust` 和原布局/键盘/加载/失败操作保持，最终默认/readiness 由主代理验收后决定。LAN 路径只审计并交主代理，不改 host.worker，不改生涯存档或发布。

原版依据为本机 0.98a-RC8 `CombatEngineAPI.java:24–66` 的唯一战斗引擎、模拟器与实体访问边界。原版没有 JS/Wasm 后端切换，该性能实现取舍明确属于 Web 架构，不能称原版规则。当前 `CombatView.tsx:74–75` 默认创建 TS Worker，显式 Rust 经 `CombatSession.ensureWorker`、`LocalWorkerHost`、`local-combat.worker.createKernel`；Rust 失败直接终止，缺整场冷回退。`CombatReplayCheckpoint.copyBackendIdentity` 严格要求请求 backend，与真实回退 ACK 不相容，需把已确认 config 固定为实际后端。原版实机尚无新桌面许可；此次不改变画面状态。

规则与流程：首次 init 对显式 Rust 尝试完整 create、初始展示编码及 ACK 数据准备，尚未运行任何 step/commands；失败立即 dispose 私有候选并清空候选音频，使用相同 seed/content/encounter/config 创建完整 TS 内核。TS 初始展示必须成功才 ACK；失败沿现有终止/恢复流程。首 ACK 带真实 `{kind:'typescript'}` 及有界的 Rust 冷失败原因，Host 只在 init、原请求 Rust、tick0 时接受该组合；正常 Rust ACK 保 SHA 严格检查。后续每 ACK 按已确认后端验证，日志 config 固定实际后端，恢复不得重新尝试 Rust 或回退到其它后端。restore 中 Rust 不可用、SHA 改变或 witness 不同仍拒绝候选，原已确认日志保留。任何 step/commands/publication 错误不会进入冷回退，终止不发布未完成帧。

界面继续既有加载→就绪→飞行/暂停/关闭流程。开发诊断通过真实 frame/host/session status 读取所选 authority 与一次 startupFallback；不新增玩家设置或提示弹窗。并发仍一个 in-flight transaction、有界队列、epoch/sequence/ack/tick 验证；取消/更换会 dispose 原 Worker，候选不会成为旧场景权威。存档 checkpoint 原格式保存真实后端和兼容 build/content，而不是记录曾请求的 Rust；无跨后端恢复承诺。

依赖与顺序：先审计/本案 → local worker 完整 init 候选与冷回退 → Host/journal真实 identity/config 校验 → session 状态只读暴露 → 当前正式模块与无头 Chromium 集中验证。验收覆盖默认 TS、明确 Rust、实际 loader404/ABI失败、未知内容闭包回退、真实音频不重复、ACK tick/sequence与同源TS冷/热 witness一致、TS回退 checkpoint新 Worker重放、真实 Rust恢复禁止回退，以及成功推进后的错误终止。严格规则/RNG/资源/时间与已批准几何界限保持，不改求解器。待核实的是最终当前 Wasm SHA、主代理正式 UI/性能/LAN gate；无新增产品待决定取舍。

实际实施已完成：worker 的唯一 initialize 分支包含 Rust create/初始编码/ACK 数据准备，冷失败 dispose 并清空候选声音后创建 TS；restore 与 live 分支共用发布函数但不进入回退。data-only ACK 可带一次有界 startupFallback；Host 仅 init 接受并记录该证书，journal config 显式固定实际后端，后续和恢复继续严格验证身份与 SHA。Session authority status 额外只读暴露 requestedBackend/authority/startupFallback，活动 host 或候选存在时 enableWorker 拒绝变更。未修改 CombatView 的默认、readiness、原生 solver、LAN host 或生涯。

实际集中验收 `tmp/flight-local-startup-check.mjs`，真实 Vite local Worker/LocalWorkerHost、新建无头 Chromium 页面、当前 plain production Wasm SHA `d30cc960dbb60992426c0e5b6ea1bf6f461e1a3c70a81cad62e00a8abe668957` /4,483,640bytes，五场全部通过：默认TS（零Wasm请求）、显式Rust（实际SHA ACK）、真实loader404、合法空Wasm的exports/ABI合同拒绝、真实未知 trusted advance effect 闭包拒绝。未知effect仅tmp Vite插件在真实Registry登记，compiler/native/断言没有替换；真实装配WS001被Rust拒绝而TS每帧仍执行，recoil .00016666666666666666证明回调没有省略。每场cold+8热帧同sourceTS严格135/几何63，共675严格/315几何最大0；cold音频均1，无候选重复音频。每场实际checkpoint backend等于所选authority，新Worker重放8tick并下一步22word witness逐位一致；4种非法首ACK identity/fallback证书均拒绝。

同artifact明确Rust恢复后续loader404仍拒绝，不接受TS；活动Rust第9tick注入真实非法sample得到failed，最后ACK tick9/backendRust保留，没有回退或发布失败帧。real CombatSession在实际loader404路径 prepare成功、86textures、0resourceRecreations，fixedUpdateControlled真实输入完成tick1；实际status报告requestedRust/selectedTS/reason，活动enableWorker拒绝。五场pageErrors为空，owned 5文件SHA全过程未变。artifact `tmp/flight-local-startup/result.json`。这是冷启动收尾验收，不代替主代理七包整场、最终生产指纹、正式UI、ABBA或LAN预算验收。

LAN只读审计：`src/network/host.worker.ts:668–676` 的 RustLanKernel.create 当前catch直接fail，没有冷回退；TS正常入口 `678` 以下构造 createLanWorld；真实ready身份 `:412`，网络后续ACK/恢复由主代理与defense负责。未改该host，已交主代理补同授权的整场冷决策并保持网络ready实际backend。

状态：本地冷回退与真实backend/replay边界已完成；current `tsconfig.combat` 类型检查与五changedfile scopedlint集中均exit0。当前仍不称全可玩。

后续只读审计发现 Session 候选恢复缺一个原有合同校验：若已有 ACK 的活动 host，当前 restoreCheckpoint 仅检查 content/seed/encounter，没有核候选 checkpoint.authority 与当前 latest.authority，可能允许同遭遇跨backend日志被adopt。依core-plan65相容backend合同，应在创建候选前严格 sameBackendIdentity（含Rust SHA）；首次尚无host ACK的页面可按日志真实后端重建。此修错不改变恢复UI或格式。主代理正在正式ABBA冻结测量，因此目前仅记录方案，不修改冻结源码/启动验证；时机由主代理统一。
