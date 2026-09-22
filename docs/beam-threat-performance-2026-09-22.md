# 光束威胁阶段共享粗筛：验收（2026-09-22）

## 范围

本轮不再试验已撤回的导弹缓存，而是处理混编舰队的主热点 `assessThreats`。新增 `BeamThreatIndex`，在现有同步原生 AI 阶段内构建一次光束线段包围盒层级，供本阶段各舰共享。只排除肯定不与盾心/原碰撞半径相交的光束；剩余候选仍执行原来的来源查找、阵营/死亡/持续时间检查、精确相交、盾倍率与威胁选择。

生产改动仅限：
- `src/engine/ai/BeamThreatIndex.ts`（新增）
- `src/engine/ai/ThreatAssessment.ts`（接入候选查询）
- `src/engine/ai/TacticalWorld.ts`（阶段索引的可选类型字段）
- `src/engine/simulation/CombatEngine.ts`（构建、传递、finally 关闭）

没有缓存最终命中或 source 引用；重复光束和重复来源 ID 保持原来的顺序、重数、first-match 行为。未知标量转换/相关读取器、替代数组、已关闭索引、非有限查询回退原扫描；极端光束几何保留为无界候选。

**未减少舰船/光束/特效数量，未降低 AI 或物理更新频率，未修改目标扫描周期、默认 4 Worker 数量、调度预算或 200 对象的现有 Worker 资格上限。** 阶段索引不提供给 Worker 的不可变依赖记录视图，也不跨越运动、光束推进或外部 AI 调用。

原版来源、预代码对照和当前支持边界见 `beam-threat-source-audit-2026-09-22.md`。无 UI 更改；原版实机未验证，全部 Web 检查无头执行。

## 当前瓶颈的证据

混编 100 艘初始 Odyssey/Paragon 主舰，生成单位后 ships=300，第 60 步约 502 条光束。现有 Worker 状态为 `serial / ship-limit`，不是测试人为关闭 Worker；所有 300 个舰船对象的 `hasNativeThreatPhaseHooks` 为 true。

60 步预热后 180 步 CPU 采样中，一个 `assessThreats` 调用节点累计约 17240ms，自身约 8232ms。其中每条光束执行 `ships.find(s => s.id === b.sourceShipId)` 的回调自身约 2879ms。采样还发现 `shotObstruction`、`isPhased/allSystems` 和 GC 热点；这些累计时间不能直接当作每帧耗时，也不能把父子节点相加。

## 正确性和实际生效

新增 `scripts/check-beam-threat-index.mjs`，对照 `scripts/lib/threat-assessment-reference.ts` 保存的原实现。

- 2,732 项检查（包含实际引擎接入探针）：随机查询、完整威胁输出、首个重复 ID、重复光束顺序、实时阵营/死亡、闭合/退化/极端几何、关闭/替代数组回退、自定义 getter/valueOf/盾修正读取器回退。
- 随机空间夹具的 1,200 次查询共扫描基线光束 241,200 条，候选 2,142 条；所有原精确相交结果及顺序一致。这不是完整战斗帧率。
- 实际 `CombatEngine` 混编场景 90 步的诊断探针：构建 89 次，查询 8,811 次，后续候选 **4,329,765 → 127,272**，约少 97.1%。场上单位没有删减，结束时 ships=300、beams=595。诊断仅在测试里包装索引方法计数，生产代码没有计数器/开关。
- 24 项 combat AI 基础回归、12 项 system movement intent 回归通过。
- TypeScript `tsc -p tsconfig.app.json --noEmit --pretty false`、本轮文件 scoped oxlint 通过。

## 浏览器对照方法

基线继续使用上轮恢复后、与当前试验前逐字一致的 272 模块快照。候选 273 模块，仅上列四个生产文件不同；其余模块冻结，避免并行改动混入性能比较。没有使用 Git HEAD 覆盖工作区已有改动。

固定步对照运行真实 `CombatSession.fixedUpdateControlled`、视觉更新及 WebGL，每步交替前/后实例，另做执行顺序和 iframe 位置翻转。每场 180 步，前 60 步预热、统计后 120 步，每 30 步完整比较引擎、玩家 AI 和火控跟踪状态。100/200 Onslaught 断言实际 4 Workers 及成功提交，混编保持其自然资格结果。

下表“固定步+视觉”不包含渲染，**不是 FPS**。混编数量表示初始主舰数；24/100 主舰的运行时 ships 峰值分别为 72/300。所有前后实体峰值一致。

| 轮次/版本 | 初始主舰/类型 | 固定步+视觉 ms 前→后 | fleetAI ms 前→后 | 状态检查点 | 实际 Workers 前/后 |
|---|---|---:|---:|---:|---:|
| beam-mixed-r1 | 100 odyssey/paragon | 581.76 → 554.82 | 327.59 → 288.47 | 6 | 0/0 |
| beam-safe-mixed | 24 odyssey/paragon | 23.27 → 23.45 | 10.75 → 10.83 | 6 | 0/0 |
| beam-safe-mixed | 100 odyssey/paragon | 209.57 → 184.88 | 109.24 → 85.52 | 6 | 0/0 |
| beam-safe-onslaught | 100 onslaught/onslaught | 81.76 → 81.20 | 11.32 → 11.35 | 6 | 4/4 |
| beam-safe-onslaught | 200 onslaught/onslaught | 227.89 → 224.24 | 29.69 → 29.23 | 6 | 4/4 |
| beam-safe-mixed-r2 | 100 odyssey/paragon | 260.74 → 237.03 | 133.63 → 104.29 | 6 | 0/0 |

`beam-mixed-r1` 为加入额外标量/盾读取器资格检查之前的早期候选，只作为演进证据。最终源代码为 `beam-safe`，不能把早期候选和最终候选混成一轮数据。主机负载差异很大，不能跨轮拿 581ms 与 209ms 宣称提速；只比较同一轮前/后。

## 真实 FPS / TPS

运行生产 `FixedTimestepScheduler` + WebGL，预热 60 步后测 15 秒墙钟，用 ABBA/BAAB 顺序。此测试不包含 React/HUD/音频。没有改调度器的丢步/补步策略；FPS 和 TPS 分别记录。整机负载与事件循环延迟同时保留，但整机 CPU 百分比不是 Worker 使用率，也不是某次波动的因果证明。

| 顺序 | before FPS | after FPS | before TPS | after TPS |
|---|---:|---:|---:|---:|
| ABBA | 0.811 | 0.853 | 3.828 | 4.264 |
| BAAB | 0.782 | 0.862 | 3.877 | 4.151 |

## 验收决定及限制

**保留并已接入默认生产路径；没有额外开启实验选项。** 最终同一 beam-safe 源码在两种执行顺序下，百舰混编固定步+视觉分别下降约 **11.8% / 9.1%**，fleetAI 分别下降约 **21.7% / 22.0%**。24 主舰混编约 +0.8%，视为没有证明收益；100/200 Onslaught 没有光束粗筛收益可归因，测得小幅变化不作为本次优化结论。

最终源码的 24/100 混编、100/200 Onslaught 及反序 100 混编共 **30 个完整状态检查点**一致；所有数量峰值一致、WebGL error=0、pageerror 为空。先前早期 beam 候选另有 6 个通过点，不混入最终源码计数。混编与 Onslaught 的控制探针分别通过暂停不推进、驾驶/防御命令回执、星图开关、阻挡输入、同 tick 及释放检查；Onslaught 实际 4 Workers，释放后 0。

真实 rAF 两轮的 TPS 提升约 **11.4% / 7.1%**，FPS 提升约 **5.1% / 10.3%**。但该压力场景 FPS 仍只有约 **0.8–0.9**，事件循环 P95 延迟仍为数秒，**绝不能宣称“已经流畅”或“多舰问题已解决”**。15 秒窗内帧数很少，这些 FPS 均值也不是统计置信区间。

代码核查解释了另一个重要的架构问题：混编 300 对象被现有 ship-limit 留在串行路径，CombatTickHost 在没有 prediction 时同步 commit；FixedTimestepScheduler 在同一次 rAF 内同步补步，最多 8 步，默认 maxCatchUpWorkMs=Infinity，之后才 render。因此 TPS≈4 不意味着 FPS≈4。测试保持这些既有策略；没有偷偷降低补步预算换取更高 FPS。下一步的权威/呈现解耦必须同时验证 TPS、状态年龄、显示编码/解码及输入回执，不能仅提高重复绘制旧状态的次数。

源码核实、Web 逻辑/控制和浏览器性能检查已做；没有原版实机验证，没有声称全场景像素/Mod 行为等价。原版玩法、完整架构、StateStore 和默认整场 Worker 接入等更大目标仍未完成。

最终生产源码 SHA-256（与 beam-safe-sources.json 逐字一致）：
- BeamThreatIndex.ts: b92dad16b1b7c2329e31c854fe8ce3fa0139e22226c52a4ecd46ce141cda58a2
- ThreatAssessment.ts: 010fede5bf506d088ab875a3388315bac9605a538e50e112f5b173dbc56dcc78
- TacticalWorld.ts: 75a9db0aee53532d4e669ca9f448f5e09519be1c4e2b0b49317111fa8e2f46c1
- CombatEngine.ts: 6c82a6ebaa1763987f27c1af0eb500569ec55a0b1007a799137f34512583d48e


## 原始产物与复现

原始逐步/逐帧数据、构建、CPU profile 和控制测试在 `artifacts/combat-hotloops-20260922/`，正确性夹具在 `artifacts/beam-threat-contracts/`。未删除上轮试验数据，未暂存/提交/推送/打包发布。

```powershell
$env:BEAM_INTEGRATION='1'
node scripts/check-beam-threat-index.mjs
Remove-Item Env:BEAM_INTEGRATION
$env:NAME='beam-replay'
node artifacts/combat-hotloops-20260922/build-beam.mjs
$env:AFTER='browser-beam-replay'
$env:COUNTS='100'; $env:HULLS='odyssey,paragon'; $env:STEPS='180'
$env:EXPECT_BEFORE='0'; $env:EXPECT_AFTER='0'
$env:TAG='beam-replay'
node artifacts/combat-hotloops-20260922/paired.mjs
$env:ORDER='before,after,after,before'; $env:DURATION='15000'
node artifacts/combat-hotloops-20260922/raf-beam-mixed.mjs
```

不要覆盖 before 的源码图或构建。不得同时运行 CPU 重测试与性能测量。

## 仍未完成

本轮不是“多舰卡顿已解决”的完整架构验收。后续优先研究剩余的威胁预测，以及混编火控批次资格过于保守导致的重复遮挡扫描：当前严格 fire-control roster 会因 fighter 的 sourceCarrier 拒绝整个批次。也需处理 `isPhased → allSystems` 的高频临时数组，但不能把可变化的相位状态缓存成旧值。混编超过 200 对象后的 Worker 上限仍然存在，本轮没有靠调整上限/预算掩盖瓶颈。
