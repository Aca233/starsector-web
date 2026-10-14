# 本地战斗 Worker 派生属性读取 — 2026-10-01

## 原版证据 → 预期行为

本机 Starsector 0.98a-RC8（`C:/Program Files (x86)/Starsector/starsector-core/starsector.log:1`）。`decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipAPI.java:85/99–100` 分离战斗可变统计、舰体规格与装配；`MutableShipStatsAPI.java:30–31/196–197` 暴露机动和武器射程的即时运行统计。`CollisionGridAPI.java:8–16` 与 `CombatEngineAPI.java:303–310` 暴露格网查询，也明确大范围查询有时线性列表更快；不能以原版有格网为由盲目替换所有扫描。

本轮是 Web 内部 CPU 实现，不变更装备、命中、评分、AI/物理频率或界面。原版实机/界面对照未进行，保持桌面不操作。本项目 InFlightFireBudget 是 Web advisory 规则，不冒充原版精确击杀预测。

## 当前证据 → 最小边界

前两轮缓存修复后，以本轮实际工作区冻结图测 8 艘 Gloriana（184 实体）、30 tick 预热 + 60 tick 测量。采样 fixedUpdate 累计 5760.10 ms（含预热）；assessThreats 1524.25 ms / 26.46%，shipMotionStats 356.90 ms / 6.20%，get ships 243.70 ms / 4.23%，shotObstruction 269.00 ms / 4.67%。独立 GC 样本 1591.57 ms，不与仿真采样直接相加作精确占比。火力预算不再是本场景最大热点；该短航母场景不能代表 24 航母或长时间高弹幕。

LocalCombatKernel 的 Node 场景没有自动取得真实 local-combat.worker 的封闭领域许可。先把已有 Worker 的 ownForWorker + enableWorkerOwnedPhaseReads 启动路径抽到 LocalCombatReadDomain，再由基准可选地调用同一启动函数。明确区分 inline CPU 与 Worker-owned CPU；后者仍在 Node 单线程内执行，并没有实际线程/IPC。不能把原基准未开启已有许可造成的差异记作本轮生产优化收益。

已有 readNativeMotionModifiers 仅在一个同步机动查询内复用组合；要求已有纯 stat 定义集合、无自身/父级 runtimeModifiers，未知定义仍走旧 getter。这不授权 native threat AI、不缓存 tick，也不跨 AI/update 生命周期。

## 实验取舍：复杂标量版本已拒绝并移除

曾实现只组合 scalar getter 所需字段的封闭 Worker 候选，回调仍实时调用，不缓存回调结果。隔离 oracle 与整场状态对照通过，但其配对 CPU 均值为：

- 24 Hyperion，Worker-owned：22.0647 → 19.6635 ms/步；
- 8 Gloriana / 184 实体，Worker-owned：58.5166 → 58.7410 ms/步，无均值收益；
- 24 Hyperion，inline：21.0723 → 21.5628 ms/步，中位数近似不变。

因收益不普遍且新增实现复杂，完整标量按字段折叠已从生产代码移除。普通 scalar getter 保持原有 full modifiers 组合。`full-stat-candidate-source.json` 和 `motion-only-candidate-source.json` 仅保存实验图；后者包含未启用的复杂实现，不能充当最终代码验收。最终最小生产图单独保存为 `final-motion-source.json`。

## 最终保留的实现

1. `src/engine/runtime/local/LocalCombatReadDomain.ts` 合并原有两个 Worker 领域启动调用，追加已有 `enableWorkerOwnedMotionReads()`。仅本地 module Worker 的 init 和 replay restore 使用；UI/inline fallback 不隐式取得许可。
2. 同一次同步 `shipMotionStats` 查询复用一次现有完整 modifier 组合，不跨调用、tick、AI 或舰船更新保留结果。生命周期、flux、推进状态、模块修正等下一次读取仍实时计算。
3. `ShipSystem.readNativeMotionModifiers` 增加自身与 auxiliary modifier 分派检查。未知定义、runtime 修正、modifier 方法替换及 own accessor 保持旧 getter 路径；资格判断不触发被覆盖的 getter。已显式安装且不可替换的原生 modifier cache 沿用其原有许可。
4. 基准追加 `--worker-owned`，使用生产启动 helper；默认 inline 模式不变。实际 Worker 功能测试使用独立无头 module Worker，不给页面 realm 开启领域许可。

相对于本轮正确的 `owned-baseline-source.json`，最终基准导入图只变化 `LocalCombatReadDomain.ts` / `ShipSystem.ts`，当前磁盘图与最终冻结图 hash 一致。Worker 入口的 helper 抽取发生在该基线之前，单独审查了 init/restore 两处替换。

没有扩大注册白名单或默认开启 `VITE_AI_EXACT_AUTHORED_THREATS`、`VITE_AI_INTERLEAVED_THREATS`、`VITE_LAN_OWNED_PHASE_ROSTERS`；没有缩减实体、地形或频率，也没有改变 60 Hz、RNG、命中/处理顺序。

## 集中验收与最终配对

- 类型检查：完整候选的 tsc -b 通过；撤掉复杂版本后的 tsconfig.app.json --noEmit 通过。最终改动文件 oxlint 通过。
- 既有 check-simulation-visibility 原 GPU/HUD/地形/导航部分 287 项通过，pageErrors 为 []。追加 Worker entry 曾遇到 Vite 的 Blob 函数序列化失败，改为静态 module Worker，按具体失败定向复查，未重新跑全套。
- 最终最小版本的独立 Worker 属性契约：7 舰体、19 主/模块舰船，15,269 次断言，14,700 scalar 查询、133 机动查询。覆盖生命周期、flux、运行时修正、禁用引擎、同 tick 状态变化、未知有状态回调/auxiliary/父系统、own accessor 回退。这些是重复字段/状态断言，不是 15,269 场独立战斗；scalar getter 是未改变的兼容性 oracle。
- 最终版本实际 local module Worker：53 项检查、7 步，init、add-ship 回执、显示解码、checkpoint replay restore 与恢复后下一步对照通过；地形 78 颗；pageErrors 为 []。多核关闭，不是自然战斗 FPS/TPS 或多核负载验收。
- 最终生产图与冻结前图每 tick 交错运行；第二轮反转交错顺序排查执行顺序/GC 波动。四个结果共 540 tick（含预热）的 witness/RNG、隐藏火控、显示值严格一致；22 次完整权威帧字节一致。实体/弹丸/数字负载统计一致。

| 场景与交错顺序 | 修改前均值 ms/步 | 修改后均值 ms/步 | 修改前 P50 | 修改后 P50 | 修改前 P95 | 修改后 P95 |
|---|---:|---:|---:|---:|---:|---:|
| 24 Hyperion，第一轮 | 21.0382 | 20.5550 | 20.6512 | 19.8024 | 27.5387 | 27.6396 |
| 24 Hyperion，反转顺序 | 21.9876 | 19.6362 | 20.8890 | 18.9387 | 29.4381 | 28.0011 |
| 8 Gloriana / 184 实体，第一轮 | 57.5364 | 57.8403 | 56.6262 | 54.7374 | 69.7596 | 75.3870 |
| 8 Gloriana / 184 实体，反转顺序 | 59.2978 | 56.4190 | 57.1312 | 53.9103 | 80.3678 | 67.0262 |

Hyperion 每轮 60 tick 预热 + 120 tick 计时，平均弹丸 261.55；Gloriana 每轮 30 + 60 tick，平均弹丸 190.15。两轮同长度计时样本的描述性合并均值：Hyperion 21.5129 → 20.0956 ms（6.6%）；Gloriana 58.4171 → 57.1296 ms（2.2%）。Gloriana 两轮均值/尾部分布波动明显，不能称为已证明稳定显著提速；两轮中位数均改善。不是完整统计显著性研究，不能隐藏第一轮均值回退或只报告最好的一轮。

显示采集/解码没有在本轮优化。Node CPU 配对不含 renderer、rAF、网络、真实线程往返或多核；实际 Worker 窄功能测试不补足这些限制。两种高负载场景仍超过单线程 16.7 ms 预算，不能宣称慢动作已全部修好。

## 产物与仍未完成项

本轮目录：`artifacts/simulation-firebudget-perf-20261001/`。最终结果：

- `final-summary.json`、`final-motion-source.json`；
- `final-hyperion/result.json`、`final-hyperion-reverse/result.json`；
- `final-gloriana/result.json`、`final-gloriana-reverse/result.json`；
- `final-worker-contracts/verification.json`；
- 原 287 项验收在 `visibility/verification.json`。

较早元数据/地形优化仍保留，其结果使用各自审计基线；不跨 inline/owned 域或不同实体规模拼成累计提升数字。完整标量和 motion-only 消融产物保留供复现，不再用于表示最终生产实现。

仍未完成：按舰/按事务替代全场 native AI 门控的安全设计、火力预算/遮挡/弹丸的空间裁剪、进一步派生属性分配削减、真实高负载多核/IPC/端到端节拍验证。没有为了性能默认启用实验标志或跳过自定义回调；这些不是本轮已交付内容。

没有暂存、提交、推送、打包或发布，不触碰生涯改动，没有操作桌面或启动子代理。
