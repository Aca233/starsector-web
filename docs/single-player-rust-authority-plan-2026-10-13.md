# 单机战斗默认改用 Rust 权威：策划案（2026-10-13）

用户要求："单机也改成 rust"。本文是着手改代码前的可审阅方案，含现状证据、两种口径、影响面、实施顺序与验收标准，以及需要用户决定的取舍。

## 一、目标与玩家体验

- 目标：普通单机入口（无 URL 参数的 `index.html` 战斗、设计试航、模拟战）默认由 Rust/Wasm 内核充当唯一权威状态源，与当前联机房主、无头服务端保持一致，而不是只有带 `?combat=rust` 时才用 Rust。
- 玩家体验目标：同一场战斗在单机、联机、服务端得到同一套数值结果；单机不再因为"默认 TS"而与联机播放表现不一致。
- 非目标：不改变现有 Web 的数值、规则、界面布局与操作流程（迁移只换执行位置）；不新增设置页；不改联机/服务端已有的 Rust 权威结构。

## 二、关键现状与证据（决定方案口径）

### 1. 单机默认确实还是 TypeScript

| 实际来源 | 当前行为 |
| --- | --- |
| [src/CombatView.tsx:74-75](../src/CombatView.tsx#L74-L75) | URL 无参数或非 `rust` → `typescript`；`?combat=rust` → `rust-wasm`；`?combat=inline` 与 visual lab 不启 Worker |
| [src/engine/runtime/CombatSession.ts:68](../src/engine/runtime/CombatSession.ts#L68)、[:95](../src/engine/runtime/CombatSession.ts#L95) | `workerBackend` 初值与 `enableWorker()` 默认参数均为 `'typescript'` |
| [src/engine/runtime/local/local-combat.worker.ts:12-16](../src/engine/runtime/local/local-combat.worker.ts#L12-L16) | Worker 已支持 `rust-wasm`；[:43-57](../src/engine/runtime/local/local-combat.worker.ts#L43-L57) 已有"未推进即冷回退整场 TS + bounded reason" |
| [src/network/LanBattle.tsx:661](../src/network/LanBattle.tsx#L661)、[server/authority-worker.mjs:21](../server/authority-worker.mjs#L21) | 联机与服务端**已经**硬编码 Rust 权威 |

结论：单机改动本身是入口/默认策略改动，Worker、冷回退、恢复链路都已就绪，不需要重写求解器。

### 2. 但现有 `core_*` Rust 后端留存的正式性能门是**失败**的

[artifacts/rust-combat-core-20261008/performance-abba-f080f34b/result.json](../artifacts/rust-combat-core-20261008/performance-abba-f080f34b/result.json)：`passed = true`，**`performanceGate = false`**，`sha256 = f080f34b…`（即当前正在被加载的 [public/game-assets/runtime/combat-core.wasm](../public/game-assets/runtime/combat-core.wasm)）。同场同场景实测均值：

| 指标（ms） | TypeScript | rust-wasm | 差异 |
| --- | --- | --- | --- |
| simulation 均值 | 60.46 | 88.54 | Rust 慢 46% |
| encode 均值 | 18.78 | 53.45 | Rust 慢 185% |
| decode 均值 | 10.06 | 16.11 | Rust 慢 60% |
| roundtrip 均值 | 90.02 | 159.57 | Rust 慢 77% |
| roundtrip p95 / p99 | 118.5 / 156.6 | 215.0 / 284.9 | 明显回退 |

门槛要求是"simulation 均值至少改善 30%、roundtrip 至少 20%、两个配对皆改善、P95/P99 不回退"，实测全部不满足。[docs/rust-combat-final-readiness-audit-2026-10-09.md:76-77](../docs/rust-combat-final-readiness-audit-2026-10-09.md#L76-L77) 对此的既定处置是"失败继续实际根因优化，保留失败，不降低门槛"，[:47](../docs/rust-combat-final-readiness-audit-2026-10-09.md#L47) 明确"若失败保留失败证据并保持 TS 默认，不能靠改标记通过"。

补充：该失败值对应的是**安装态** f080f34b（10-09 11:00）。[public/runtime/combat-core.wasm](../public/runtime/combat-core.wasm) 另有一份 10-10 16:16 的新构建 `b94a8fd8…`，**无人加载、也从未跑过性能门**。

### 3. 新的 Rust ECS 内核目前还没有接管战斗权威

[docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md:15](../docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md#L15) 把"每帧全场景深拷贝 + 快照反序列化成数万 JS 对象"点名为 Rust 核心 ~160ms 往返的根因；P1 的解法是扁平 ECS/SoA + 零对象直传。该内核（`ecs_*`，ABI 200）实测[极快：50 舰 + 10,000 弹幕物理 0.276~0.302 ms](../docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md#L235)，但目前只被无头 CLI 消费（[scripts/validate-ship-pack.mjs:147](../scripts/validate-ship-pack.mjs#L147)、[scripts/benchmark-ship-balance.mjs:100](../scripts/benchmark-ship-balance.mjs#L100)），渲染侧只共用内存布局常量（[DirectEcsBatchRenderer.ts](../src/engine/render/webgl/DirectEcsBatchRenderer.ts)）。

真实的单机权威仍是 TS 的 Dedicated Worker（[2.0 文档:248](../docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md#L248)），并且 10-10、10-11 两轮专项优化刚把它做到 60Hz 目标：[1v20 开局 9.31ms / 混战 13.96ms](../docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md#L288)，[6 艘荣光女王 3v3 60Hz 专项](../docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md#L296)。

**这构成本次请求的核心冲突**：把单机默认切到现有 `core_*` Rust 绑定，会把玩家从刚优化好的 60Hz TS 链路切到实测更慢（且带 GC 停顿）的链路。

### 4. 同 SHA 性能门复跑（2026-10-13，本轮实测）

命令：`node scripts/benchmark-rust-combat.mjs --wasm public/game-assets/runtime/combat-core.wasm --out artifacts/rust-combat-core-20261008/performance-abba-f080f34b-rerun-20261013`

**结果：等价性与性能双失败，脚本在第 9 tick 中止，未写出 result.json。**

1. **等价性失败（比性能更严重）**：TS 臂与 Rust 臂从 **tick 9 的 witness[8]（玩家 x）** 开始分歧，实测 67.68934 vs 67.68353（差 5.8e-3，容差 ~1e-9）；到 tick 18 `witness[2]`（战斗 RNG 游标）已分成 3196082344602 / 3207071739480。全量对比共 **3411 处越界**，最大绝对差 8.2e12。证据：[failure.json](../artifacts/rust-combat-core-20261008/performance-abba-f080f34b-rerun-20261013/failure.json)。
2. **测量本身是确定性的，所以分歧是真实的**：离线比对各臂原始数据，TS(arm0) 与 TS(arm3) **逐位一致**、Rust(arm1) 与 Rust(arm2) **逐位一致**，只有跨后端不一致。这不是抖动或采样噪声。
3. **性能同时恶化**（同一批四臂样本，离线复算与脚本同一算法）：

| 指标（ms） | TypeScript | rust-wasm | 结论 |
| --- | --- | --- | --- |
| simulation 均值 / p95 / p99 | 21.45 / 30.66 / 38.55 | 51.61 / 62.59 / 79.55 | Rust 慢 2.41 倍 |
| roundtrip 均值 / p95 / p99 | 29.01 / 42.22 / 53.06 | 88.03 / 113.55 / 147.76 | Rust 慢 3.03 倍 |
| encode 均值 | 4.43 | 29.64 | Rust 慢 6.7 倍 |
| decode 均值 | 2.71 | 5.76 | Rust 慢 2.1 倍 |

   两个配对（arm0→arm1、arm3→arm2）均回退，`performanceGate` 复算为 `false`、`passed` 也不成立。
4. **根因判断（高置信）**：安装态产物是 10-09 的 f080f34b，当初是对着 10-09 的 TS 权威验证通过的；此后 TS 侧已有 **78 个模块变更**（用 10-09 那次运行留下的 [frozen-sources.json](../artifacts/rust-combat-core-20261008/performance-abba-f080f34b/frozen-sources.json) 逐文件哈希比对得出），其中包含 `ShipMotion.ts`、`Ship.ts`、`CombatEngine.ts`、`ShipStepBatch.ts`、`ShipWeaponControlSystem.ts`、`ComponentHealth.ts`、`EngineController.ts` 等直接影响轨迹与 RNG 消耗顺序的文件。也就是说：**不是"Rust 走样"，而是 Wasm 与已演进的 TS 权威之间产生了版本错配**；TS 侧变快（sim 60.46→21.45 ms）也主要来自同一批优化。

**对本方案的决定性影响**：按用户选定的"先补跑同 SHA 性能门再做决定"，结论是**不能把单机默认切到这份产物**——它既不与当前 TS 逐一等价（会造成同场战斗结果不同），又慢 2~3 倍。任何 Rust 权威（含 ECS 路线）都必须对**当前**权威语义重新建立等价与性能证据，不能沿用 10-09 的资格。

### 5. ECS 内核（口径 B 的目标）能力盘点（本轮实测/只读）

`ecs_*` 通道**只有 1 个文件** [ecs_core.rs](../native/combat-core/src/ecs_core.rs)（1247 行、21 个导出）。同目录其余 60+ 模块（`armor.rs`/`shield.rs`/`flux.rs`/`fire_control.rs`/`tactical_ai.rs`/`phase_runtime.rs`/`gravity_*`/`terrain_*` 等）全部属于 `core_*` 通道，**不是 ECS 的实现**；两套在同一 crate/wasm 里各自独立、源码零共享。

决定性事实：

1. **当前被加载的 wasm 里根本没有 `ecs_*`**。安装态 [game-assets/runtime/combat-core.wasm](../public/game-assets/runtime/combat-core.wasm)（f080f34b）导出 39 个 `core_*`、**0 个 `ecs_*`**；10-10 那份未安装的 [public/runtime/combat-core.wasm](../public/runtime/combat-core.wasm)（b94a8fd8）才有 21 个 `ecs_*`。而 [install-rust-combat-core.ps1](../scripts/install-rust-combat-core.ps1) 只写 game-assets —— 即**安装产物落后于构建，ECS 从未进入被加载的内核**。
2. **ECS 侧唯一的真实调用者是 2 个无头 CLI**（[validate-ship-pack.mjs](../scripts/validate-ship-pack.mjs)、[benchmark-ship-balance.mjs](../scripts/benchmark-ship-balance.mjs)）；`new RustEcsBridge` 全仓 0 命中；P1/P2 交付的 [DirectEcsBatchRenderer.ts](../src/engine/render/webgl/DirectEcsBatchRenderer.ts)、[GpuParticleRenderer.ts](../src/engine/render/webgl/GpuParticleRenderer.ts)、[DynamicAudioDucker.ts](../src/engine/audio/DynamicAudioDucker.ts) 与 [SelfRegisteringCapability.ts:73-128](../src/engine/modding/SelfRegisteringCapability.ts#L73-L128) 均**无任何调用者**。
3. 按单机权威契约逐项核对，ECS 侧缺失（按严重度）：无状态读回通道（只有聚合 HUD）→ 无 tick 契约（`ecs_step` 返回 sprite 数、`dt` 静默 clamp）→ **无快照/回滚/事务、0 个确定性 RNG**（检查点/回放/重连/联机一致性没有载体）→ 无内容准入（武器被压成单个标量 `weaponDamage`）→ 武器只有 1 个抽象武器 + 固定 0.25s 冷却（无射控/蓄力/连发/弹药）→ 光束缓冲恒空 → 幅能模型不闭环（开火不耗幅能、装甲命中不加幅能）→ 护盾运行期不可开合/转向 → 8 扇区替代装甲格、无伤害类型/EMP → 导弹制导不存在 → 防空/PD 不存在、战机 hp 永不减少 → 无部件损伤传播 → 无 CR/PPT/部署、无地形/小行星、引力仅一次性径向冲量 → 事件仅 5 类且无序号/ack。
4. 但 ECS 侧确有可复用基础：扁平 SoA（全 `f32`）、256px 空间哈希、基础弹丸/命中判定、最简 AI（选靶/转向/距离保持/友军火线走廊）、战机 Boids、16-float 直传渲染缓冲与零拷贝视图。

**结论**：口径 B 不是"接线"，而是"在 ECS 内重建大部分权威语义"。其纯物理微基准（0.276 ms / 0.022 ms）只测 `ecs_step` 与缓冲读取，不含内容、AI、伤害、呈现、编码与 IPC，**不能作为可玩或 60Hz 证据**。

## 三、两种口径

### 决定记录（2026-10-13，用户已选）

| 决策项 | 选定 | 含义 |
| --- | --- | --- |
| 口径 | **B：把 ECS 内核做成单机权威** | 目标不是把默认切到现有 `core_*` 绑定，而是让 `ecs_*`（ABI 200）成为单机战斗权威 |
| 时机 | **先补跑同 SHA 性能门再做决定** | 对安装态 f080f34b 重跑 ABBA，用实测数据决定中间步骤；本轮不改默认 |
| 退路 | **不留退路，默认就是 Rust** | 最终普通入口只走 Rust，不保留 `?combat=typescript` 退路 |
| 就绪标记 | **本轮不动** | 不改 `core_full_battle_ready`，不因此重跑整套同 SHA 资格 |
| 项目定位 | **本项目是独立项目，原版不再是依据** | 不再以 Starsector 0.98a-RC8 反编译/数据作为数值约束；相关取证已停止 |
| 数值来源 | **沿用现有 Web 已调好的数值** | ECS **只换执行位置、不换规则**；迁移期间不得顺手改玩法数值 |
| 基准链路 | **TS 单机链路** | "同场同结果"以玩家当前单机体验为准；等价门（TS↔ECS）重新成为有效判据，复用既有 ABBA 工具 |
| 领域实现路线 | **ECS 复用 `core_*` 的领域实现** | 不在 `ecs_core.rs` 里重写 17.2k 行领域逻辑；ECS 负责 SoA/调度/确定性/呈现，领域算法（装甲/护盾/幅能/火控/AI/相位/引力/地形/舰载机…）复用同 crate 的 `core_*` 模块，并沿用其既有领域对照证据 |
| 原版资产 | **保留并标记历史/仅供参考** | `docs/rust-combat-*`、`scripts/check-rust-*` 原样保留、不再新增，不再构成验收约束 |
| 冷回退 | **保留整场冷回退安全机制** | 普通入口不留 TS 选项，但内容含不支持能力时仍整场回退 TS 并带原因 |
| 过渡期 | **单机继续跑 TS，等 ECS 达标再切** | 不把不等价且慢 2~3 倍的产物上线 |

因此：**口径 A 不再作为目标**，仅作为"性能门通过时可选的中间加速步骤"；本方案的落地路径按下面的口径 B 重排。阶段 1 的交付物为 [ECS 权威数值基准与验收口径](ecs-authority-baseline-2026-10-13.md)。

### 口径 A（未选为目标）：只切默认后端（入口 + 默认策略）

把"单机默认用哪个后端"从 TS 改为 Rust，算法与内核不动。

- 改动面小、不改 native、**Wasm SHA 不变**（与 [readiness 审计:79](../docs/rust-combat-final-readiness-audit-2026-10-09.md#L79) 一致）。
- 代价：承担上表实测的性能回退；且 [RustCombatCore.ts:111](../src/engine/runtime/rust/RustCombatCore.ts#L111) 明确要求 `core_full_battle_ready() === 0`、[:405](../src/engine/runtime/rust/RustCombatCore.ts#L405)/[RustCoreProtocol.ts:484](../src/engine/runtime/rust/RustCoreProtocol.ts#L484) 固定 `fullBattleReady:false`，即这条绑定自述是"开发期绑定"，不是最终就绪内核。
- 具体改动点：
  1. [src/CombatView.tsx:74-75](../src/CombatView.tsx#L74-L75)：默认 → `rust-wasm`；新增 `?combat=typescript` 显式退路；`inline`、visual lab 行为不变。
  2. [src/engine/runtime/CombatSession.ts:68](../src/engine/runtime/CombatSession.ts#L68)、[:95](../src/engine/runtime/CombatSession.ts#L95)：默认策略同步为 Rust。
  3. [src/engine/runtime/local/CombatReplayCheckpoint.ts:33](../src/engine/runtime/local/CombatReplayCheckpoint.ts#L33)：`config.backend ?? 'typescript'` **保持不动**（旧 checkpoint 的 TS 含义不能被新默认改写）。
  4. [scripts/check-rust-combat-ui.mjs:17](../scripts/check-rust-combat-ui.mjs#L17) 固定 `?combat=rust`，因此必须新增"真实无参 URL"默认启动验收，不能只靠它证明默认已改。

### 口径 B：把 ECS 内核做成单机权威（P1 权威迁移）

按 2.0 策划案 P1 把扁平 ECS 内核接成单机权威（内容准入、AI、呈现、回放/检查点、与联机一致）。收益是数量级提升与彻底去除 GC 停顿，但这是多阶段工程，不是默认开关；且需要先把 `ecs_*` 从 CLI 工具面提升为生产权威面。

## 四、明确不做

- 不降低/不绕过任何性能门，不改 `core_full_battle_ready` 数值冒充就绪。
- 不做运行中热切换后端；普通入口最终不保留 TypeScript 选项（用户 2026-10-13 决定）。整场"冷回退"是否保留属安全性问题，见第八节第 4 条，不在本方案中擅自删除。
- 不改联机/服务端现有 Rust 接线，不触碰生涯存档格式。
- 不顺手处理本次发现但无关的产物问题（`public/runtime/combat-core.*` 孤儿副本、[native/combat-core/README.md:3](../native/combat-core/README.md#L3) 过期描述），另立条目。

## 五、联机权威、并发及存档影响

- 联机/服务端：无改动。单机仍走各自独立 Worker，无共享状态。
- 回放/检查点：`authority` 指纹含 `kind + sha256`，跨后端或跨 SHA 恢复一律如实拒绝（[local-combat.worker.ts:76](../src/engine/runtime/local/local-combat.worker.ts#L76)）。恢复使用 checkpoint 自带的 `config.backend`，因此**旧 TS 检查点仍能按 TS 恢复**，不会因为默认改变而失效。
- 冷回退：内容含 Rust 不支持的"未知/被替换可信能力"时，按 [RustContentCompiler.ts:190-232](../src/engine/runtime/rust/RustContentCompiler.ts#L190-L232) 整场冷回退 TS 并带 `startupFallback`。切默认为 Rust 后，这类内容场会变为"请求 Rust、实际 TS"，[CombatSession.ts:250-252](../src/engine/runtime/CombatSession.ts#L250-L252) 已可诊断区分。
- 回放构建指纹覆盖全部 `src` 与 `package-lock`：默认入口改动会改变 replay build，旧战斗恢复资格随之变化（既有审计已记录该性质，不是生涯 schema 变更）。

## 六、实施顺序（口径 B：ECS 内核成为单机权威）

**阶段 0（本轮已完成）：同 SHA 性能门复跑与取证** —— 结论见二.4：现有产物不可启用。

**阶段 1：建立权威验收基准**（2026-10-13 决定更新：本项目已独立、原版不再是依据；数值**沿用现有 Web 已调好的数值**，ECS 只换执行位置不换规则）
- 交付物：[ECS 权威数值基准与验收口径](ecs-authority-baseline-2026-10-13.md)（已建立，含参考层级、宿主硬契约 C1–C10、确定性要求 D1–D6、逐域对齐清单与阶段验收门 G1–G5）。
- 验收方式回到"同场同结果"：对**已选定的基准链路（TS 单机）**做逐 tick witness 与逐条命令回执比对。原阻塞项（两条链路彼此不一致、需选一个）已解决；联机/服务端与单机的既有分歧另立条目，不阻塞本迁移。
- 确定性硬前置（本轮修正）：恢复是**从 tick 0 重放**（[local-combat.worker.ts:84-101](../src/engine/runtime/local/local-combat.worker.ts#L84-L101)），所以第一要求是**可确定性重放**，不是快照 API；ECS 现状 0 条随机流、无 tick 读取、`dt` 静默 clamp，必须补齐。
- 原版相关取证已停止；既有对照资产保留并标记历史。

**阶段 2：ECS 内核补齐权威契约**（按本轮契约盘点的"最小面"）
> 注：本节的契约目标仍然有效；但其中"在 ECS 内重建领域语义"的框架已被下面的**复用路线**取代——领域算法与状态改为复用 `core_*`，ECS 只保留契约层。
- 4 种请求（`init`/`restore`/`step`/`commands`）与 3 种应答（`ack`/`failed`/`replay-progress`）处理；`tick`/`stepScheduled`/`command`/`dispatchDeployment`/`replayWitness`(22 元且 `[0]===tick`)/`outcome`/`aiStatus`/`telemetry`/`dispose`。
- 一条能产出 `DetachedCombatPresentation`（或直接产出 `CombatPresentationPacket`）的呈现通道，且不得出现 TS 模拟对象。
- 确定性重放：逐 tick 不丢弃、逐条命令回执 `accepted`+`reason` 全等。
- 自备内容编译与 `localCombatContentSignature()` 指纹（host 与 `CombatSession` 会持续校验）。
- 已知缺口：见二.5 的逐项清单。起点是**先把带 `ecs_*` 的构建真正安装并加载**（当前安装态 0 个 `ecs_*` 导出），再补状态读回/tick 契约/确定性 RNG/内容准入/武器与光束/幅能闭环/护盾运行期开合/装甲格与伤害类型/导弹制导/防空与战机战斗/部件损伤/CR 与地形/事件信道这一整条链路。（注：恢复是**重放式**，不需要快照/回滚 API，见基准文档第三节修正。）

**阶段 2/3 重排：ECS 外壳 + `core_*` 领域复用（2026-10-13 用户选定）**

原方案（在 `ecs_core.rs` 里重写全部领域）已按用户决定作废。新口径：**ECS 负责外壳，`core_*` 负责领域与状态**。

已由本轮自查确认的事实（这些决定了路线的可行性）：

1. **技术上可直达**：`lib.rs` 里除 `pub mod ecs_core` 外，其余 60+ 领域模块都是**私有 `mod`**；Rust 私有项对同 crate 的后代模块可见，因此 `ecs_core.rs` 可以直接 `use crate::armor::Armor` / `crate::shield::Shield` / `crate::fire_control::…`，**不需要改可见性、不需要拆 crate**。`state::Body`、`state::Handle` 及其字段均为 `pub`。
2. **领域状态的载体已经存在**：`Body.ship: Option<ShipState>`（[ship_state.rs:76](../native/combat-core/src/ship_state.rs#L76)）已经组合了 `Armor`、`Shield`、`flux::Flux`、`engine::Controller`、`weapon`、`motion`、`lifecycle::Spec/System`、`Component`——即装甲格、护盾、幅能、引擎、武器、系统、部件损伤全在里面。复用 = 让 ECS 的权威状态就是 `Vec<Body>`，而不是并行 Vec。
3. **精度反而变好**：[state.rs](../native/combat-core/src/state.rs) 1,122 行里 **99 处 f64、0 处 f32**；`Body.motion` 是 `[f64; motion::WIDTH]`。TS 权威的数值是 JS number（f64）。因此在复用路线下，基准文档里"允许 f32/f64 表示差异"这一条**大概率可以取消**，等价门有望从"容差比对"收紧到"逐位比对"。
4. **RNG 无需再造**：`ecs_core.rs` 的 `EcsRandom` 与 [random.rs](../native/combat-core/src/random.rs) 的 `Random` **算法本体逐字符相同**（仅字段名 `state`/`cursor` 不同）。第 2 轮已证 `EcsRandom` 与真实 TS `SimulationRandom` 逐位一致（含跨 2³² 游标），**该证据传递性地证明 `core_*` 的 RNG 也与 TS 单机一致**。复用路线下应直接使用 `crate::random::Random`，删除重复实现。
5. **诊断收获**：既然两条链路的 RNG 生成器完全相同，10-13 ABBA 里 TS↔`core_*` 从 tick 9 起的 3411 处分歧就**不是生成器差异，而是随机数消耗顺序/领域语义差异**。这把第八节第 2 项（既有分歧）的排查范围收窄了一大截。
6. **领域证据可复用**：42 个 `check-rust-*` 专项脚本已覆盖这些领域（当前按用户决定标记为历史/仅供参考）。它们不再作为"原版等价"依据，但作为**防回归护栏**依然有效，可继续跑。

目标架构（一句话）：**ECS 保留扁平存储与契约层，通过各领域模块自带的视图类型复用 `core_*` 的领域算法**；ECS 层保留（a）固定步长与 tick 契约、（b）确定性随机与 witness、（c）命令/回执/输入、（d）每 tick 把权威状态投影成直传 sprite 缓冲、HUD、读回与事件。

**关键修正（第 6 轮盘点）**：复用接缝**不在 `Body`/`Handle`，而在领域模块自带的借用视图类型**——5 个模块已定义与 `state::Body` 无关的 `World<'a>` 视图（[tactical_ai.rs:27](../native/combat-core/src/tactical_ai.rs#L27)、[defense_ai.rs:48](../native/combat-core/src/defense_ai.rs#L48)、[navigation_ai.rs:77](../native/combat-core/src/navigation_ai.rs#L77)、[fire_control.rs:40](../native/combat-core/src/fire_control.rs#L40)、[missile_guidance.rs:57](../native/combat-core/src/missile_guidance.rs#L57)），`missile_guidance` 另有 `TargetWorld` trait，`defense_ai` 另有 4 方法的 `DefenseHost`。因此 **ECS 不必改成 `Vec<Body>`**：它可以保留扁平存储，用"每 tick 构建视图 + 自持每舰领域结构（Armor/Shield/Flux/…）"来复用算法。但**数值域必须按 f64 承载**，否则会破坏 `armor.rs` 的逐格累加与 `state.rs` 的整数精确性约束（见风险 2）。core 内部已有 3 份"AoS→视图"适配器可当模板：[ai_resident.rs:170-207](../native/combat-core/src/ai_resident.rs#L170-L207)（`Cache`）、[fire_query.rs:62-99](../native/combat-core/src/fire_query.rs#L62-L99)、[missile_owner.rs:15-33](../native/combat-core/src/missile_owner.rs#L15-L33)。

待盘点补全（进行中）：每个领域模块归入"可直接复用 / 需适配层 / 与编排强耦合"三档的逐模块证据，以及 AoS↔SoA 投影、`String`/`BTreeMap` 查找、handle↔下标转换的具体代价。

### 复用路线的代价实测（第 6 轮盘点结论，含对上一轮判断的推翻）

**分档**（15 个领域模块 ≈3,737 行）：**(a) 可直接复用 ≈2,481 行**——`flux`/`component`/`armor`/`shield`/`missile_guidance`/`readiness`/`tactical_ai`/`defense_ai`/`navigation_ai`/`fire_control`，入口只吃标量/`&[f64]`/自有视图，`use` 里没有 `world_owner`；**(b) 需适配层 ≈854 行**——`weapon_fire`/`projectile`/`terrain_world`（几何部分属 a），另有三个本身就是适配器的 `fire_query`/`missile_owner`/`readiness_owner`；**(c) 与编排强耦合 ≈402 行**——`phase_runtime`/`gravity_runtime`（签名同时要 `&mut world_owner::Owned` + `&mut [Body]` + `&BTreeMap<Spec>`）。

**推翻上一轮的乐观判断**：接缝确实在视图 trait（ECS 不必改用 `Body`），但"ECS 保留扁平 SoA、每 tick 现搭视图"这条路**在代价上不成立**：

- core 单舰常驻状态是 `Body{id, handle(slot,generation), order, motion[22 f64], ship:Option<ShipState>}`，`BODY_WIDTH` = **67 f64 词**且带堆对象（`Armor.data[29]`+`cells(~900)`+`scars`、`Shield.data[44]`+`hit_levels`、`flux::Flux` 19 字段）；ECS 逐舰是 **37 列 / 44 f32 词**。
- 更致命的是三个 AI/火控领域**各自定义互不相同的 AoS 借约**：`fire_control::Body` 41 字段 + `Weapon` 39 + `Projectile` 24，`tactical_ai::Body` 42 + `Weapon` 19，`navigation_ai::Body` 23 + `Weapon` 4——**没有统一 Body**，ECS 要么向三套 shape 各填一份，要么先统一。
- 按上限（256 舰 / 16,384 弹 / 1024 战机）估算，**双向搬运 ≈1.37M 词/tick ≈ 82M 词/秒 @60Hz**（仅搬运，不含算法）；其中弹丸通道就占 786k 词，`projectile::Projectile`（含 4×`Vec`/6×`Option`/1×`Rc`，~57 字段）**根本不可平铺拷贝**。舰船永不从 Vec 移除、弹丸用 `swap_remove` 打乱行序，AoS 视图必须每 tick 重排。
- 另有 **17 个 f32 状态列**要经 f64 往返，其中 `x,y,vx,vy,rot` **正是 witness 的几何容差字段**（`WITNESS_GEOMETRIC = [8,9,10,11,12,16,17]`）→ 往返舍入会直接改变对照值。语义级冲突还包括：`shield_arc_cos` 存的是**半弧余弦**（`acos` 不可逆，>180° 弧与护盾类型永久丢失）、ECS 的 `flux` 是"总量+hard"而 core 是 soft/hard 独立累加、core 过载时长依赖 `hull` 尺寸类（ECS 无此列，硬编码 4.5s）、core 用 `Identity{handle,generation}` 而 ECS 只有 `u32` 且行号不稳定。

**结论（架构定案）**：复用路线只有在**权威状态直接采用 `core_*` 的模型**时才成立——即 `Slot`/`Body`/`ShipState`/`Ordnance` 就是权威存储，视图按引用零拷贝组装；ECS 的贡献收敛为**契约层 + 单向投影层**（每 tick 把权威状态读出来写进 16-float sprite / 12-float HUD / 16-float 读回 / 22-float witness）。投影是单向的，代价与 ECS 今天写这些缓冲相当，不产生双向搬运。**"扁平 SoA 作为物理数据模型"这条路正式放弃**，SoA 只作为呈现格式保留。

**随之必须正视的继承代价**：`core_*` 的模拟本体在 10-13 ABBA 实测为 **88.54 ms（22 舰）**，其成因已被盘点定位——每个命令前把 roster 深拷贝成 `Vec<Body>`（[state.rs:116-240](../native/combat-core/src/state.rs#L116-L240) 共 20+ 处 `.clone().collect()`）、`ShipState` 深拷贝（[ship_state.rs:89-107](../native/combat-core/src/ship_state.rs#L89-L107)）、`Cache` 每 tick 重建（[ai_resident.rs:127](../native/combat-core/src/ai_resident.rs#L127)）。走复用路线就等于**继承这套深拷贝/整世界事务语义**（core 每 tick 克隆 world/scene/ordnance 后 `validate_*` 再提交，失败整帧丢弃）。要守住 60Hz，必须把"克隆-校验-提交"改造成不深拷贝的等价事务（撤销日志或写时复制），这是独立的一块工程，且**目前没有任何同口径性能数据**。

**必须一并搬运、不能后补的两项**：`fire_control` 的 `budget_rows` 语义（[fire_control.rs:38-40](../native/combat-core/src/fire_control.rs#L38-L40)）与**双流 RNG 的消耗顺序**（几乎所有领域函数都吃 `&mut Random`；顺序错一步则全部数值漂移，且是最难自动验证的一类错误）。另需遵守 core 的接线顺序契约，违反**不会报错、只会静默读到旧值**：`set_scope` → `synchronize_live` → `Cache::build` → 伤害回调前 `Host::refresh` → scope 在 motion 前捕获、observe 后再打补丁。

**60Hz 性能验证闸门（2026-10-13 立项，当日已执行 Stage 0/1/2b）**：复用路线继承的深拷贝/整世界事务模型能否守住 60Hz，此前只有互相矛盾的间接证据。验证方案与实测结果见 [core-authority-60hz-gate-plan-2026-10-13.md](core-authority-60hz-gate-plan-2026-10-13.md)：Stage 0 同场次基线通过（sim 49.83 / encode 29.09，与 ABBA 互差 <5%）；**Stage 1 在 22 舰闸门场景 D1 FAIL**（事务开销仅占 step 21.4%，floor ≈31-35ms——“深拷贝主因”被量化否定，瓶颈是 core_* 领域实现本身）；**Stage 2b 单向投影原型完成**（6 舰 0.020ms / 22 舰 0.143ms，较现 encode 链降 200-440×，E2 冒烟全过且实测抓修过一名册计数差异）。用户批示按选项 (b) 继续：迁移按正常规模权威推进（迁移后预估 6 舰 ~3.1ms、22 舰 ~31.3ms 缺口文档化），G2 重定义为“正常规模 ≤10ms 且 sim+encode ≤12ms + 压力缺口立项”；Stage 2a（撤销日志，E1 逐位等价门随迁）与 Stage 3（ABBA 验收门）移入迁移实施阶段。22 舰领域优化单独立项，热点清单见闸门文档第十节。**实施阶段已开题**：[core-authority-migration-plan-2026-10-13.md](core-authority-migration-plan-2026-10-13.md)（P1 投影接线 / P2 等价门禁 / P3 撤销日志 / P4 语义缺口 / P5 领域优化，含分期验收标准）；**P2 等价门禁已建成并通过**（38 条混合 journal 重放位精确 0 差异，注入一次额外 RNG 抽取的负向对照检出 51 处差异），**P1 第一切片已交付**：`native/combat-core/src/projection.rs` 并入真实 crate（`core_project` 等导出，当前惰性无消费者），E1 证明位精确惰性（改造前后 journal 指纹逐位一致，并与安装态 f080f34b 同源）；生产构建（LTO）投影成本 6 舰 0.0104ms / 22 舰 0.0889ms，较现 encode 链降 820× / 327×，E2 两规模全过。剩三项语义取舍已按“权威语义为准、ECS 既有不一致另修”定案（D-A 走渲染侧补尺寸、D-B armor_avg 与 HUD[12] 取权威、D-C 取 core shield_active），P1 余下工作为 TS 侧 publish 接线。

### ECS 侧盘点发现的既有不一致（待修，非本轮引入）

- `armor_avg` **同名不同义**：逐舰读回里是 `Σsectors/8`（[ecs_core.rs:1377-1378](../native/combat-core/src/ecs_core.rs#L1377-L1378)），HUD 里是 `Σsectors/(8×base_armor)`（[:950](../native/combat-core/src/ecs_core.rs#L950)）。
- HUD 第 12 词的**文档与实现不符**：常量注释写 `system_state`（[:15](../native/combat-core/src/ecs_core.rs#L15)），实现写的是 `time_scale`（[:988](../native/combat-core/src/ecs_core.rs#L988)）。
- `shield_active` **名义可变、实际只在 spawn 写一次**，其余全是只读 → 等价常量。
- `ribbon_buffer` 分配/清空/导出三处齐全但**全程零写入**（`ribbon_count` 恒 0），witness `[21]` 因此显式为 0（已注释承认）。
- `step` 内 **`combat_random`/`visual_random` 零抽取**（只有 witness 与诊断导出触碰）→ 当前战斗无任何随机化（无散布）。接入 core 领域后随机消耗顺序会立刻改变 witness。
- 战机 `hp` 只在 spawn 写 150.0，**全程无扣减** → 战机不可被击毁。
- 命令 `CMD_APPLY_FORCE`/`CMD_RADIAL_FORCE` 直接改 `vx/vy`，**绕过一切运动规则**（flags/刹车/漂移）。

**阶段 2 已完成的契约层（第 2–5 轮，复用路线下全部保留）**

- ✅ **确定性 RNG**（第 2 轮）：`EcsRandom` 逐位复刻 TS `SimulationRandom`（mulberry32 + binary64 未截断游标）；战斗流 `seed`、视觉流 `(seed ^ 0x9e3779b9) >>> 0`、identity 分配器共用战斗流；含 witness 指针与游标恢复。**复用路线下将改为直接使用 `crate::random::Random`（算法本体逐字符相同），上述"与 TS 逐位一致"的证据自动适用于它。**
- ✅ **tick 契约**（第 2 轮）：`ecs_tick` 可读提交 tick；`ecs_step_checked(expected_tick, dt)` 拒绝错序与非法 dt（0/1/2/3），拒绝时不动状态；旧 `ecs_step` 语义不变。
- ✅ **状态读回**（第 2 轮）：逐舰 16 f32 权威读回（位姿、速度、血量、软硬幅能、护盾位、过载计时、装甲均值）。
- ✅ **22 元宿主 witness**（第 3 轮）：字段与 `LocalCombatKernel.replayWitness()` 逐位对齐（几何集 `{8,9,10,11,12,16,17}`），新增 `SHIP_ROLE_*` 角色标记与 `ecs_mark_ship_role`；`[19]` 增援、`[21]` 光束因系统尚不存在而固定为 0（代码内标注为占位）。
- ✅ **命令回执通道**（第 3 轮）：`ecs_apply_commands` 在**不推进 tick**的前提下抽取队列并记录位置化 `[accepted, reason_code]`（0=OK/1=未知 opcode/2=未知目标）；旧 `ecs_step` 路径同样记录；空批次不清空已读回执。
- ✅ **内核适配层**（第 4 轮）：[EcsCombatAuthority.ts](../src/engine/runtime/rust/EcsCombatAuthority.ts) 封装 `ecs_*` 导出，归一化 u32 有符号陷阱，按宿主范式提供 `tick`/`stepScheduled`/`stepChecked`/`pushCommand`/`applyCommands`/`replayWitness`/`readShips`/`dispose`。**尚未接入 Worker**（接早了只会多一条未完成的权威路径）。
- ✅ **重放确定性 D1 已证**（第 4 轮）：同一份 48 步 journal（含两批命令）跑两次，逐步 witness 逐位一致、命令回执完全一致，且断言非平凡（玩家确实移动、tick 走到 48）。这就是检查点恢复所依赖的性质。
- ✅ **外部控制输入通道**（第 5 轮）：`ecs_set_control`（`aim`/`thrust`/`strafe`/`firing`），每 tick 一份、step 后即清；手动分支复用 AI 的同一套物理限制（转向速率、加速度、限速、0.25s 冷却、友军火线走廊），手动输入不可能超过 AI 上限。这是与 TS 权威做同场对照的前置——没有同一输入通道就无法逐域比数值。
- ✅ **AI 路径跨构建零行为变化**（第 5 轮取证）：安装态 10-10 构建（早于第 2–5 轮全部改动）与当前构建在同一 AI-only 场景各跑 48 步，HUD 的 x/y/rot/hp/flux **逐位一致**。
- 累计导出：`ecs_*` 由 21 增至 **43**（三轮共 22 个新增）。
- 证据：构建产物 `artifacts/rust-combat-core-20261008/build/…/foundry_combat_core.wasm`（2,807,319 B，sha256 `7bd9ff07…`）；[check-ecs-authority-foundation.mjs](../scripts/check-ecs-authority-foundation.mjs) **19/19 通过**，结果在 `artifacts/ecs-authority-foundation-20261013/result.json`；`validate-ship-pack` PASS、微基准 0.274 / 0.021 / 0.295 ms；改动文件 oxlint 0 警告。
- ⚠️ **桥接注意（已在适配层处理）**：wasm `u32` 返回到 JS 是有符号 i32，`u32::MAX`（如 spawn 失败）到 JS 是 `-1`；适配层统一 `>>> 0` 归一化，并有 257 艘上限用例专门验证该失败分支真的会触发。
- ⚠️ **验收脚本自身缺陷（第 5 轮修掉）**：曾把 `await Promise.all(pending)` 放在最后四个用例之前，使这些用例的失败晚于 `passed` 判定而被吞掉。已把 await 移到判定前并加"用例计数对账"（记录数 ≠ 启动数即硬失败）。
- ⏭ 下一步（2026-10-13 更新）：**先过 [60Hz 性能验证闸门](core-authority-60hz-gate-plan-2026-10-13.md)（Stage 0–3，含止损门 D1；通过才进入迁移实施），再按“ECS 外壳 + `core_*` 领域算法”重排阶段 2/3**。2026-10-13 用户选定该路线后，本方案的剩余量从"在 ecs_core 重写 17.2k 行"变为"建立复用接缝 + 呈现 + 内容准入"；复用接缝的取证（哪些模块可直接复用、哪些需适配层、哪些与编排强耦合，以及 AoS↔SoA / handle↔下标 / f64↔f32 的搬运代价）正在进行。生产 `game-assets` 产物仍**未替换**，普通入口仍跑 TS（过渡期约定）。

**阶段 3：接入权威并集中验收**（见第七节）。**阶段 4：切换普通入口默认**，并按"不留退路"移除 TS 入口（`inline` 与 visual lab 的既有行为另议）。

## 七、验收标准（口径 B）

- 基准一致性：以 **TS 单机链路**为基准做同场同结果比对——逐 tick witness 与逐条命令回执一致；允许差异逐条列出并有理由（仅表现层容差与 f32/f64 表示差异），未列出的差异即失败。
- 性能：同一 ABBA 场景下不劣于当轮 TS 权威。当前 TS 基线是 simulation 21.45 ms / roundtrip 29.01 ms（均值），门槛沿用"sim 与 roundtrip 双改善、P95/P99 不回退"。
- 可玩：真实无参 URL 启动 → 部署、驾驶、开火、撤离、结算各一次；检查点同 SHA 恢复成功、跨 SHA 如实拒绝；崩溃恢复不热切后端。
- 覆盖：单机、联机、无头服务端三条路径跑通；LAN 与服务端既有检查不回归。
- 报告：区分已核实源码、实测通过、未运行/未通过，不把 CLI 微基准当成可玩或 60Hz 证据。

## 八、决定记录、当前阻断与待确认项

已决定（2026-10-13）：口径 B；先补跑同 SHA 性能门（已完成）；普通入口最终不留 TS 退路；本轮不改 `core_full_battle_ready`。

当前阻断：
1. **现有 Rust 产物不可启用**：与当前 TS 权威从 tick 9 起分歧、慢 2~3 倍（二.4）。
2. **ECS 内核距权威契约缺口大**：阶段 2 清单；P1 渲染直传通道是死代码。
3. ~~基准取舍未定~~ **已定（2026-10-13）：本项目独立、原版不再是依据；数值沿用现有 Web，基准链路为 TS 单机；等价门（TS↔ECS）有效。** 阶段 1 已交付并解阻塞，阶段 2 可开工。
4. **冷回退是否保留**：「不留退路」指的是玩家侧无 TS 选项；而 [local-combat.worker.ts:49-57](../src/engine/runtime/local/local-combat.worker.ts#L49-L57) 的整场冷回退是**安全机制**——去掉后，含 Rust 不支持能力的船包/内容场会直接失败而无法游玩。建议保留冷回退、只移除显式 `?combat=typescript` 入口，需用户确认。
5. 与在飞工作流的关系：当前 10-10~10-12 的优化都在 TS 单机链路上（[1v20](../docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md#L288)、[3v3 60Hz](../docs/foundry-combat-engine-2.0-unified-plan-2026-10-09.md#L356)、[残骸碰撞/引力热点](../docs/hulk-collision-plan-2026-10-12.md)）。切 ECS 权威后这些 TS 仿真改动将不再是单机主线，需要明确是并行保留还是冻结。
6. **既有类型检查失败（第 4 轮发现，非本工作引入）**：`npm run typecheck:combat` 当前因 [GravityTerrain.ts:332](../src/engine/simulation/systems/GravityTerrain.ts#L332) 的 `ship.hullSize`（`Ship` 上是 `spec.hullSize` / `flux.hullSize`）报 1 个错误。该文件属 2026-10-12 残骸碰撞那批未提交改动（文件时间 10-12 15:53，早于本工作）。它不阻塞 ECS 侧验收（新增文件本身类型干净），但会让整个战斗域的 typecheck 信号失效。是否由本工作顺手修掉需用户决定——按边界约定，不擅自动其它工作流的文件。

