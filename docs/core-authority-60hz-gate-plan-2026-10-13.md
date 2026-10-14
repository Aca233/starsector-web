# core_* 权威 + ECS 单向投影：60Hz 性能验证策划案（2026-10-13）

用户提议（2026-10-13）：“用最小场景（几艘船 + 真武器）把‘core_ 状态作权威 + ECS 单向投影’打通一帧，并在同口径 ABBA 里测 sim/encode”——这是投入整条迁移前回答“这条路到底能不能跑 60Hz”的唯一办法。本文是该验证的可审阅方案：现状证据、测量设计、分阶段实施、止损门与验收标准。

上位依据：[single-player-rust-authority-plan-2026-10-13.md](single-player-rust-authority-plan-2026-10-13.md)（架构定案：权威状态直接采用 core_* 的 Slot/Body/ShipState/Ordnance 模型，ECS 贡献收敛为契约层 + 单向投影层；“扁平 SoA 作为物理数据模型”已放弃）。

## 一、目标与要回答的问题

- 唯一决策问题：**在写任何迁移代码之前，用同口径实测判定“core_* 权威 + 单向投影”能否（a）不劣于当轮 TS 权威（parity），以及（b）留下 60Hz 余量。**
- 玩家体验意义：避免把玩家从已优化到 60Hz 的 TS 单机链路，切到一条没有性能证据的链路；也避免用数月迁移换一个仍然超帧预算的权威。
- 非目标：完整迁移、生产接线、语义缺口补全、ECS 既有不一致修复（见第五节）。

## 二、现状证据与口径（决定测量设计）

### 1. 参考数字（均为 22 舰 ABBA 口径场景：seed 917、web_zhuyuan/web_gloriana/web_sc2_hyperion、1+20 舰、autopilot）

| 数字（ms/tick 均值） | 来源 | 备注 |
| --- | --- | --- |
| rust sim 88.54 / encode 53.45 | 10-08~09 性能门（f080f34b） | performanceGate=false |
| rust sim 51.61 / encode 29.64 | 10-13 同 SHA 复跑（臂样本离线复算） | 同场次 TS：sim 21.45 / encode 4.43 / roundtrip 29.01 |

**同一个 wasm（f080f34b）两次跑 sim 相差 1.7×**（88.54 vs 51.61）。因此本验证的一切比较必须**同场次**（同一次 harness 调用、臂交替、环境记录），禁止跨天/跨机器比数字；Stage 0 的第一件事就是同场次重测取准。另注意：TS 自身在该压力场景 sim 21.45ms 也已超 16.67ms——parity（G1）是档载验收门，60Hz 余量（G2）是加强门，两者分开判。

### 2. 生产路径的测量点（已核实到代码）

- 每 tick 序列（[RustCombatKernel.ts:62-70](../src/engine/runtime/rust/RustCombatKernel.ts#L62-L70)）：`applyPacked(控制命令)` → `core.step(1/60)` → `refresh()`。
- worker 侧窗口（[local-combat.worker.ts:28-41](../src/engine/runtime/local/local-combat.worker.ts#L28-L41)）：`simulationMs` = applyPacked + step + snapshot + scenePublication；`encodeMs` = capturePresentation（live+facts+presenter）+ captureDetached。
- 分段实例见 [profiling-installed-local-f080f34b/result.json](../artifacts/rust-combat-core-20261008/profiling-installed-local-f080f34b/result.json)（176 舰压力场景，tick 150：applyPacked 1.37 / step 34.93 / snapshot 2.60 / scenePublication 3.69；presenter 18.76 / encodeMs 11.86）。

### 3. 与盘点根因判断的矛盾（Stage 1 负责裁决）

盘点把 88ms 归因为“每命令前 roster 深拷贝 + ShipState 深拷贝 + Cache 每 tick 重建 + 克隆-校验-提交”。但档载同场景探针（10-09、22 舰、非 LTO 构建，**比率为准**）显示：

- `step` 内**克隆合计仅 ~4%**：scene draft clones 1.34ms、step roster bodies clone 2.67ms、step world clone 2.21ms（含 flight 1.16）/ step 121ms；validate 0.52~2.0ms（[profiling-frame-clones](../artifacts/rust-combat-core-20261008/profiling-frame-clones/result.json)）。
- 主体是 **AI**：`scene_runtime::ai` 62ms、`ai_resident::phase_with_fleet` 65ms（2 次调用）/ `step` 106ms（[profiling-local-22](../artifacts/rust-combat-core-20261008/profiling-local-22/result.json)）。
- ABBA 场景每 tick 只走 **1 条控制命令**（applyPacked 一次）；整名单克隆的热路径（gravity/aux/phase/ai/scene/motion_owner 等 tag 族）在该场景基本是冷的。

两条互相矛盾的证据链（探针说 AI 主导、盘点说命令路径克隆主导；88.54 vs 51.61）意味着**根因尚未被同口径数据确定**。Stage 1 的第一个产出就是裁决它——这直接决定事务重构是不是关键路径，也决定 D1 止损门的走向。

## 三、测量设计

- 场景 S1（主）：ABBA 口径场景，与 [rust-combat-performance.ts](../scripts/lib/rust-combat-performance.ts) 的 `measure()` 逐参数一致（22 舰、seed 917、autopilot、90 暖机 + 180 步）。S0（接线冒烟）：2-4 艘 + 真武器的最小场景。
- 臂序（Stage 3）：`[ts, current, probe, probe, current, ts]`，同场次交替，各自独立 page。
- 指标：simulationMs / encodeMs / roundtrip 的 mean/p95/p99；分段 parts（applyPacked / step / snapshot / scenePublication / live / facts / presenter / encode）。
- 等价对：probe↔current **逐位一致**（witness 22 项 + 全状态哈希）；ts↔probe 只记录分歧统计、不作为本闸门判据（TS↔Rust 既有分歧是另案，见主策划案二.4）。
- 环境：CPU 型号、node/chromium 版本、同时段负载随结果归档；机时窗口见第九节。

## 四、分阶段实施

### Stage 0 同场次基线与分段确认（规模：小；只读测量，零代码改动）

- 用分段包裹（对 kernel 的 applyPacked / step / snapshot / scenePublication / capturePresentation / captureDetached 分别 `performance.now()`，技术同 profiling-installed-local-f080f34b 的 pipeline）测当前安装态 f080f34b，S1 场景，headless。
- 产出：sim/encode 的同场次分段均值；与 10-13 复跑数字互校（偏差 >30% 记录环境差异并复测）。
- 通过条件：分段合计与 simulationMs / encodeMs 对账一致（±5%）。

### Stage 1 事务开销上限分析（规模：中；探针构建，不动生产代码）

- 复用 [profile-rust-hot-step.mjs](../scripts/profile-rust-hot-step.mjs) 的注入式探针（拷贝 src → 插 `perf::Timer` → rustc 直编 wasm → 页内驱动真实 kernel），新增计时点：`apply`、`apply_scene_commands`、apply 入口的无条件克隆（world/scene/ordnance/startup_states，[state.rs:100-104](../native/combat-core/src/state.rs#L100-L104)）、`commit_scene_draft`、`validate_scene_draft_with_specs`、`ai_resident::build`（Cache）、`phase_with_fleet`、`scene_runtime::ai/advance`、wasm 侧 publish；编译加 `-C codegen-units=1` 贴近生产（仍缺 LTO，**绝对值为辅、比率为准**）。
- 产出（S1 场景，每 tick 均值）：
  1. 事务开销合计 = 克隆 + validate + commit + Cache::build；
  2. **floor = step − 事务开销**（任何等价事务改造后的地下速度）；
  3. AI 算法成本 vs AI 脚手架成本（Cache/视图组装）的拆分——若 AI 成本主要是脚手架，重构范围应延伸到 ai_resident，D1 按拆分结果修订。
- **裁决门 D1（不建原型即可止损）**：
  - floor ≤ 10ms → 进入 Stage 2（60Hz 余量可达，值得建原型）；
  - floor > 10ms → **止损**：事务重构无法独自把 22 舰场景压进 60Hz 余量。带数据上报用户，选项：(a) 把 AI 优化列入迁移范围；(b) 接受“parity 但不超 60Hz”（投影仍能换来 encode 数量级改善与联机一致性）；(c) 放弃 core_* 权威路线。**不建原型、不开 Stage 2。**

### Stage 2 最小原型（规模：大；scratch 副本，不合并、不安装）

- 先打通一帧（正确性），再跑 N tick（性能），最后进 Stage 3 全量 180 步。
- 2a 撤销日志事务原型：只覆盖热路径（控制命令应用 + step 草案/校验/提交）；`set_scope → synchronize_live → Cache::build → Host::refresh` 调用顺序与双流 RNG 消耗顺序**逐字不变**，只改存储策略；`budget_rows` 语义随原型一并落地（不允许后补）。
- 2b 单向投影原型：权威状态 → 16f sprite / 12f HUD / 16f 读回 / 22f witness 四缓冲（常量见 [ecs_core.rs:10-53](../native/combat-core/src/ecs_core.rs#L10-L53)）；**witness 保持 f64 直出，不进 f32 投影**——它是回放等价通道，不是呈现。原型经 `probe_*` 导出（投影 + 缓冲指针 + 全状态哈希），与生产 ABI 并存，验证后废弃或转正。
- 等价门 E1（硬）：同一混合命令 journal（覆盖全部 tag 族：gravity/aux/phase/ai/scene/motion_owner/system/damage……而非只有 ABBA 控制流）+ ABBA 自流，probe 与 current 的 witness 22 项与全状态哈希**逐位一致**。任何不一致 = 原型 bug（两侧都是 f64、同顺序），不得用容差掩盖。
- 投影冒烟门 E2：四缓冲全部写入、值有限、逐舰字段与当前 publish 同 tick 抽查一致（f32 呈现字段允许文档化舍入）；`armor_avg` 两义、HUD 第 12 词两义作为**已知差异列出**，不悄悄对齐（属 ECS 7 处既有不一致，另案修）。
- 用 Stage 1 探针复测原型：撤销日志 push/pop 机制开销 + 投影成本。

### Stage 3 同口径 ABBA 闸门（规模：中；浏览器内、同场次）

- 构建原型 wasm（**不装** `public/game-assets`，不改 Worker 默认，不动 `core_full_battle_ready`）；新增同族脚本（复制 [benchmark-rust-combat.mjs](../scripts/benchmark-rust-combat.mjs) 的冻结/服务器/playwright 框架；臂序 `[ts, current, probe, probe, current, ts]`；等价对改为 E1 口径），走真实生产 Worker 路径。
- 门槛：
  - **E1** 等价（见上）——不过即终止，不存在“性能好但不等价”的通过。
  - **G1 parity**：probe simulationMs ≤ TS simulationMs 且 probe encodeMs ≤ TS encodeMs（同场次），p95/p99 不回退。
  - **G2 60Hz 余量**：probe simulationMs ≤ 10ms 且 sim+encode ≤ 12ms（16.67ms 帧的 ~72%，给 decode/渲染/IPC/抖动留 ~4.6ms），p95 ≤ 1.5× 均值。
  - **G3 扩展**（规模允许时）：64 舰变体记录曲线；超线性爆炸即带曲线上报，不单独判死。
- 结论分支（预先约定，避免事后解释）：
  - **GO**：E1 + G1 + G2 → 整条迁移值得开工（另立迁移实施策划案）。
  - **CONDITIONAL**：E1 + G1 但 G2 不过 → 路由可达 parity 且 encode 数量级改善，但 60Hz 余量未证；上报用户做产品取舍（联机一致性与确定性的价值 vs 帧余量）。
  - **NO-GO**：E1 不过或 G1 不过 → 带数据止损，选项同 D1。

## 五、明确不做

- 不安装任何新 wasm 到 `public/game-assets`；不改单机/Worker 默认；不改 `core_full_battle_ready`；不切 `?combat=` 行为。
- 不做完整事务重构（原型只证明机制与开销）；不补语义缺口（hull 尺寸类、护盾 kind/弧角、武器行/组/弹药、伤害类型、identity/generation、N×T 可见性矩阵）；不修 ECS 7 处既有不一致（另立条目）。
- 不改联机/服务端接线，不碰生涯存档与回放指纹；不重跑全套测试（按验证节奏约定，只跑本验证必要检查）。
- 不用跨天数字下结论；不把 CLI 微基准或探针比率当作可玩/60Hz 证据；探针构建永不进入被加载产物。

## 六、联机权威、并发及存档影响

无。探针 wasm 只在验证 harness 内加载；不安装即不改变任何已加载 SHA，Worker/检查点/回放资格不受影响；并发与存档语义零触碰。

## 七、依赖与实施顺序

- 依赖：wasm 工具链（[build-rust-combat-core.ps1](../scripts/build-rust-combat-core.ps1) 的 rustc/sysroot）、注入式探针技术（profile-rust-hot-step.mjs）、ABBA 框架（benchmark-rust-combat.mjs）、场景定义（rust-combat-performance.ts）、缓冲常量（ecs_core.rs）、生产内核路径（RustCombatKernel/LocalWorkerHost）。
- 顺序：Stage 0 → Stage 1（D1 止损门）→ Stage 2（E1/E2）→ Stage 3（E1/G1/G2/G3）。Stage 1 不通过则终止，后续阶段不启动。2a 与 2b 可并行分工（子代理可参与，均须遵守原版先行与当前工作边界——本验证不涉及原版取证）。

## 八、验收标准（汇总）

- E1：probe↔current 逐位一致（witness + 全状态哈希），混合 journal 覆盖全部 tag 族。
- E2：四缓冲写入完备、有限、抽查一致、已知差异列明。
- G1/G2/G3：同场次、带环境记录、mean/p95/p99 齐全。
- 报告：区分“同场次实测 / 探针比率 / 未运行”三项；结论明确到 GO / CONDITIONAL / NO-GO；不把未运行项写成通过。

## 九、待核实事项与待用户决定

1. **门槛取值**：G2 的 10ms / 12ms 是否采纳（替代方案：“不劣于 TS 且留 30% 余量”）。
2. **机时窗口**：headless 基准需要相对安静的机器（用户在用电电脑）；现在跑还是指定窗口，直接影响 Stage 0 的可信度。
3. **AI 主导时的产品取舍**：若 Stage 1 显示 floor 由 AI 算法成本构成（与盘点根因判断相反），是否把 AI 优化列入迁移范围，还是接受 CONDITIONAL——需用户决定，不擅自扩大范围。
4. **88.54 的归属**：用户消息记其为“10-13 ABBA 实测”；档载 88.54 属 10-08~09 性能门（f080f34b），10-13 同 SHA 复跑为 51.61。以 Stage 0 同场次重测为准，此处两值并列备查。
5. **“\\60hz\”引用**：本机不存在该路径（已按“@60Hz 口径”理解）；如指其他位置（共享目录/外接盘）请告知。

---

## 十、Stage 0/1 执行结果与 D1 裁决（2026-10-13 实测）

执行方式：内核直驱 + 分段包裹（脚本 `scripts/profile-core-authority-baseline.mjs`）与注入式探针（`scripts/profile-core-authority-overhead.mjs`，计时点 41 个，编译参数 opt-level=3 + codegen-units=1 + panic=abort，无 fat LTO 故比率为准），headless Chromium 151（i5-13490F / 16 逻辑核）。当前 native 源码与 7bd9ff07 构建清单 83/83 一致（0 变更）。

### Stage 0 同场次基线（22 舰，生产 wasm f080f34b）——通过

| 窗口 / 分段（ms/tick 均值） | 数值 | p95 | 占所属窗口 |
| --- | --- | --- | --- |
| **simulation 窗口** | **49.83** | 55.6 | 分段覆盖 99.94% |
| ├ applyPacked | 1.51 | 1.9 | 3.0% |
| ├ **step** | **39.53** | 43.5 | **79.3%** |
| ├ snapshot | 3.65 | 5.9 | 7.3% |
| └ scenePublication | 5.11 | 7.5 | 10.3% |
| **encode 窗口** | **29.09** | 37.9 | 分段覆盖 99.96% |
| ├ captureAssembly | 2.56 | 3.8 | 8.8% |
| ├ **presenter** | **16.26** | 21.4 | **55.9%** |
| ├ **captureDetached** | **10.25** | 16.6 | **35.2%** |
| └ witness | 0.01 | 0.1 | ~0% |

- 与 10-13 ABBA 复跑互校：sim 49.83 vs 51.61（−3.4%）、encode 29.09 vs 29.64（−1.9%），在 ±5% 内，Stage 0 通过。
- 非平凡性：22 舰、弹丸均值 134 / 峰值 209（武器在开火）、光束 ~15、witness 逐 tick 变化、finalTick 270。
- 产物：`artifacts/rust-combat-core-20261008/core-authority-baseline-f080f34b-20261013-r2/result.json`（r1 为冒烟运行，captureDetached 未包裹导致 encode 覆盖 66.9%，已被 r2 取代，两份均留档）。

### Stage 1 事务开销上限分析（22 舰闸门场景）——**D1 FAIL**

探针分解（no-LTO 构建，绝对值含仪表开销约 5-10ms，比率为准；事务类函数调用次数极低、几乎不受仪表影响）：

| 探针计时（ms/tick） | 数值 | 调用/tick |
| --- | --- | --- |
| step_scene（合计） | 68.93 | 1 |
| ├ scene_runtime::advance | 63.65 | 1 |
| │ ├ phase_with_fleet（AI 舰队规划） | 13.19 | **2** |
| │ ├ fire_query::plan_queued（火力规划） | 10.18 | 1 |
| │ ├ scene_runtime::ai | 10.01 | 1 |
| │ ├ flight_runtime::collect_wings | 8.34 | 1 |
| │ ├ scene_runtime::prepare | 7.19 | 176 |
| │ ├ terrain_stage / asteroid pair / collisions | 5.27 / 2.20 / 2.16 | 1 / 3003 / 1 |
| │ ├ advance_projectiles / advance_beams | 5.17 / 2.29 | 1 / 1 |
| │ └ phased_world | 3.55 | 6185 |
| ├ **事务合计** | **14.74（21.4%）** | |
| │ ├ step_scene 草案+名单克隆 | 2.36 | 1 |
| │ ├ apply_scene_commands 草案+名单克隆 | 2.11 | 1 |
| │ ├ validate（两种） | 3.17 + 3.16 | 各 2 |
| │ ├ commit_scene_draft | 1.31 | 1 |
| │ └ ai_resident::build（Cache） | 2.63 | 2 |

- **floor = 39.53 ×（1 − 0.214）≈ 31.1ms**；保守口径（validate 作为语义保留、只去克隆/commit/Cache）≈ 34.7ms。**D1 FAIL（阈值 10ms，超 3 倍以上）**。
- **盘点根因判断被量化否定**：克隆+校验+提交+Cache 仅占 step 的 21%，79% 是领域模拟本身。即使事务开销降为零，rust 领域模拟（~31ms）仍高于 TS 权威的**整个** simulation（21.45ms）——瓶颈从“事务模型”转移为“core_* 领域实现”。
- 附带结构性问题（领域优化线索，按探针呼叫数）：AI 舰队规划 2 次/tick、validate 2 次/tick（apply 与 step 各一轮）、Cache 2 次/tick、prepare 176 次/tick、phased_world 6185 次/tick、asteroid pair 3003 次/tick。
- 按策划约定：**D1 FAIL → 不建 Stage 2 原型、不开 Stage 3，带数据止损上报**，选项见下。

### 补充测量：正常规模舰队（6 舰；非闸门项，为选项提供依据）

| 指标（ms/tick） | 6 舰（生产 wasm） | 22 舰（生产 wasm） |
| --- | --- | --- |
| simulation | 6.90（p95 9.0） | 49.83 |
| encode | 8.58（p95 14.8） | 29.09 |
| **合计** | **15.48** | **78.92** |
| 事务占 step | 36.7% | 21.4% |
| **floor（重构后 sim）** | **2.70** | 31.07 |

- 6 舰当前总开销 15.5ms 已在 16.67ms 帧预算内；迁移后预估 floor 2.7 + 单向投影 ~1.5（替换 encode 8.58）+ 或可省去的 refresh 链 2.28 ≈ **5ms 量级**，60Hz 宽裕且优于现状 TS。
- 规模缩放超线性：6→22 舰（3.7×）sim 6.9→49.8（7.2×）——该场景全舰近距离交战，强度增长快于舰数；rust 与 TS 的差距也随规模扩大（22 舰总开销 78.9 vs TS 25.9）。
- 结论：**该路线在正常规模舰队 60Hz 可行（投影后优于现状），在 22 舰压力场景不可行**；TS 自身在该场景也超帧（25.9ms），但 rust 差 3 倍。

### 十一、止损后的选项（待用户决定）

- **(a) 领域优化列入迁移范围**：把 core_* 领域实现优化到压力场景可达 TS parity 作为迁移前置/并行项。已知结构性线索：AI 舰队规划 2 次/tick、prepare/phased_world/pair 的高频内循环、terrain/弹丸/光束各段。工作量以“探针热点 × 目标降幅”另行立项评估，不在本验证内估。
- **(b) 分场景接受**：迁移按正常规模权威推进（M1-M4 台阶不变，投影使正常规模 ~5ms、优于现状 TS），22 舰压力场景的差距作为已知缺口单独立项跟踪；G2 门槛随之重定义为“正常规模 ≤10ms 且投影后总开销 ≤12ms + 压力场景缺口文档化”。
- **(c) 放弃 core_* 权威路线**：单机继续 TS 权威（正常场景已 60Hz），Rust 仅保留联机/服务端既有接线；core_* 的性能问题移交领域优化线，与本次迁移解耦。
- **建议**：(b)。理由：路由在正常规模的收益（encode 8.6→~1.5、确定性、单机/联机同内核）已被本次数据成立；压力场景缺口是 core_* 的既存问题（联机权威同样承受），不应阻塞迁移主体，但必须显式立项而不是隐性遗留。若用户要求压力场景 parity 作为迁移前置，则实质是选项 (a)，需先估领域优化的工作量再定迁移排期。

---

## 十二、决策记录与 Stage 2b 执行结果（2026-10-13 深夜）

**决策**：用户批示“继续完成”，按建议选项 (b) 执行——迁移按正常规模权威推进，22 舰压力场景差距显式立项跟踪，G2 随之重定义。

### Stage 2b 单向投影原型——完成，E2 全过

原型（scratch 副本 `scripts/profile-core-authority-projection.mjs`，未合并、未安装）：新增 `projection.rs` 模块 + `probe_*` 导出，权威状态 → 16f sprite / 12f HUD / 16f 读回 / 22 f64 witness 四缓冲；sprite 含船体（176 个船体，含战机体）+ 弹丸两趟；witness 保持 f64 直出（复刻 `replayWitness` 语义：tick、双 RNG 三元组、combatTime、玩家/敌舰几何与 hp 与软硬幅能、capital 名册差、弹丸/光束计数）。生产内核直驱，headless Chromium（COOP/COEP，5µs 计时分辨率）。

| 指标 | 6 舰（28 船体） | 22 舰（176 船体） |
| --- | --- | --- |
| **投影成本（ms/tick 均值）** | **0.020**（p95 0.03 / p99 0.07） | **0.143**（p95 0.19 / p99 0.23） |
| 写出词数/tick | 1,270 | 8,150 |
| 对比：现 encode 链 | 8.58 | 29.09 |
| **降幅** | **~440×** | **~200×** |

E2 冒烟（每 tick 执行，全部通过）：四缓冲写入完备且有限；sprite 数 = 船体数 + 弹丸数；逐舰按 id 与 snapshot 比对——几何（x/y，f32 容差）、hp（armor.data[14]）、软/硬幅能（flux.soft/hard）全部一致；witness[0]===tick、玩家几何/hp 与 snapshot 逐位一致、名册差与弹丸/光束计数一致。
**E2 实效证据**：加严 witness 校验后第一轮运行即失败——投影初版把战机船体计入 capital 名册（28/176 vs 应为 6/22），已按 `scene.capital()` 语义（roots 过滤：非 pending、非撤退、敌方根仅在已部署）修复后复测通过。该字段正是等价性关键通道，冒烟校验证明了自身价值。

已知语义差异（原型文档化列出，迁移期对齐，不悄悄抹平）：sprite 的 w/h/texSlot 为占位（待内容绑定）；armor_avg 用 core 装甲格均值/格值（ECS 为 8 扇区模型）；HUD 第 12 词（system_state）写 1.0；team 取 `ship.combat.team`；无死亡/撤退过滤（ECS active 语义）；弹丸 sprite 为 6px 白色占位。

### 方案重划（基于实测，范围收窄）

原 Stage 2/3 的前提是“事务重构是关键路径”。实测后该前提不成立，重划如下：

1. **G2 重定义（选项 b）**：正常规模（≤10 舰口径场景）probe simulationMs ≤ 10ms 且 sim+encode ≤ 12ms；22 舰压力场景缺口文档化并单独立项（领域优化），不再作为迁移准入门。
2. **Stage 2a（撤销日志事务原型）移入迁移实施阶段**：理由——正常规模不做事务重构也有 ~4.6ms（step 4.26 + applyPacked 0.30 + 瘦读回 ~0.05 + 投影 0.02），G2 有 3 倍以上余量；重构只再省 ~1.6ms，不再具有闸门性质。但其 **E1 等价门（混合命令 journal 全覆盖 tag 族 + witness/全状态逐位一致）作为硬要求随迁移执行**，在重构落地时用同一探针手法验证。
3. **Stage 3（同口径 ABBA 闸门）移入迁移实施阶段**：端到端 ABBA 需要投影接入生产 publish 路径（即迁移接线本身），探针形态无法回答；E1/G1/G2（重定义后）成为迁移实施阶段的验收门，在正常规模场景 + 文档化压力缺口下执行。
4. **迁移后预估更新**（本次实测组件）：

| 场景 | 当前总开销 | 迁移后预估 | 依据 |
| --- | --- | --- | --- |
| 6 舰正常规模 | 15.48ms | **~3.1ms**（含事务重构）/ ~4.6ms（不含） | floor 2.70 + applyPacked 0.30 + 瘦读回 ~0.05 + 投影 0.02 |
| 22 舰压力场景 | 78.92ms | **~31.3ms**（缺口 ~14.6ms） | floor 31.07 + 投影 0.14 + refresh 链 8.77→~0.1；缺口 = 领域模拟，见第十节热点清单 |

5. **下一阶段（迁移实施）准入条件**：投影契约（四缓冲字段映射 + 语义差异清单）作为实施输入；E1 等价 harness 与重构同批交付；领域优化就 22 舰缺口单独立项（热点：AI 舰队规划 2 次/tick、plan_queued、collect_wings、prepare 176 次/tick、phased_world 6185 次/tick、asteroid pair 3003 次/tick）。
