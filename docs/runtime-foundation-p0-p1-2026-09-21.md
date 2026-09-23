# Runtime foundation P0/P1 · 2026-09-21

状态：首批切片已落地并验证。仅推进架构方案的第一个可验证切片，不声称完成通用多核/状态存储重构。

## 编码前对照

- 原版版本：本地 0.98a-RC8；反编译 `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:392–439` 的几何/碰撞类型与 shouldFire 拒绝逻辑仅作规则边界；本次不改变选敌、碰撞或伤害规则。
- 当前权威窄相：`src/engine/simulation/systems/weapon/ProjectileCollisionHandler.ts:createRuntimeQuery` 调用 SpatialShipIndex 后继续筛选并交 RuntimeCollisionKernel。优化只能改变候选收集方式，必须逐项保持原候选序列（含相同对象出现在不同 roster 位置的重复项）。
- 差异：SpatialShipIndex 每个投射物查询后扫描全舰表恢复顺序。拟在较大名单且候选稀疏时，仅收集去重的 roster 索引并数值排序；小名单/密集查询保持线性恢复。几何包围、单元大小、名单生命周期、查询区域及 epoch 语义不变。
- P0：新增默认关闭的有界阶段采样器，接入 fixedUpdateScheduled 的输入、派发、等待、真实权威阶段与最终提交，不把 Worker 等待和 Worker kernel 时间相加冒充 CPU 时间。只按完成的 scheduled attempt 记录，取消/异常单列，数据不进入 engine/Ship 状态。
- 所有阶段标记必须不移动任何原逻辑，不替换方法/原型以免破坏原生多核资格。默认关闭时不读阶段时钟；直调 fixedUpdate 可显式传入同样的 trace，不强迫联机启用。
- 验证：冻结本轮源图；新旧有序候选属性测试、极端/重复/epoch/rebuild 边界；采样器采样/环覆盖/取消/异常契约；多舰种完整状态与火控 WeakMap 对照；真实浏览器 scheduled 路径及多核启用状态观测。收益分清单查询、整步和画面 FPS。
- 无玩法/UI改动；不操作桌面，不做原版实机补验。保留其它任务工作，不暂存/提交/发布。

证据目录：`C:/Program Files (x86)/Starsector/starsector-web/artifacts/runtime-foundation-20260921/`。

## 实现与使用

### P0：默认关闭的 scheduled-step 采样

新增 `src/engine/diagnostics/CombatStepProfiler.ts`，只存诊断计时；通过 CombatSession 的三个公开方法控制：

```ts
session.setStepProfiling({ sampleEvery: 10, capacity: 600 });
const report = session.getStepProfile();
session.resetStepProfile(); // 仅重置采样，不清空战斗/输入/Worker 任务
session.setStepProfiling(null); // 关闭；不抢先推进尚未完成的模拟
```

无头诊断也可通过已有 `window.__combatSession` 使用同一接口。未新增 UI，不操作桌面。

- 15 个连续 wall-clock 分段：input、dispatch、wait、sessionSetup、enginePrelude、fleetAI、shipsWeapons、wingsDrones、terrainStatus、shipCollision、projectilesBeams、trailsMinesFX、aftermath、sessionRestore、finalize。
- `input` 包含 beforeTick 的玩家控制/自动驾驶；`fleetAI` 包含原生舰队 AI 阶段的构建/验证/提交，不能全部解读成 worker kernel。`shipsWeapons` 包含舰船运动/系统/武器，尚不是逐挂点函数级细分。
- total 覆盖 scheduled simulation，**不含随后 visual update / render**。wait 与并行 kernel 重叠，不能相加冒充 CPU 消耗；本线程的 CPU 时长也不代表所有 Worker CPU 总和。
- 默认不创建采样器、环形缓冲或读取阶段时钟；关闭路径仍有少量空 trace 分支，不声称指令数绝对为零。
- 有界 TypedArray 环形缓冲，默认每 10 次 attempt 采一个，容量 600；在读取报告时才分配/排序分位数。固定间隔可能与周期动作重合，详细短时诊断宜 sampleEvery=1，并独立检查测量扰动。
- completed/error/discarded 分开；分位数只统计 completed。异步未完成、环回被占用的行不会当成完整样本；重复 finish/取消后迟到不会重复记录。attempt 不是权威游戏时间或网络 Hz。
- 记录实际返回批次的 worker commits/fallbacks 与当时 reason；fallbacks 是批次内部计数，不包含所有“未拿到 batch 后整体串行”的情况。结合 predictionSamples、reason 和已有 getMulticoreStatus 使用，尚未完成完整任务图/依赖失效 trace。
- 采样器属于 session，不增加 engine/Ship 的序列化字段；没有包裹或替换原生方法/原型。CombatEngine 仅接受可选 trace 参数并在既有阶段间标记，没有移动模拟语句。
- 暂未在 LAN/服务端默认接入阶段采样；本轮不是完整 P0/P1 架构验收。

### P1：有序稀疏候选恢复

`SpatialShipIndex.querySegment` 在名单至少 64 项且查询网格区域较小时，收集实际触及的 roster ordinal；利用已有 visitMarks 去重后数值排序，再映射回 Ship。相同 Ship 出现在不同 roster 位置时仍保留重复项。

查询覆盖较多单元、单个桶已密集或累计候选超过名单 1/4 时，继续使用原来的线性恢复；小名单保持原路径。阈值只选择收集算法，不减少候选，不改变规则。索引构建、几何、相对运动、精确窄相、查询区域及 epoch 均未修改，没有新增可序列化索引状态。

尝试过 WeakMap scratch 数组复用，但额外间接访问在 64/100 名单的微基准中抵消了分配节省，未保留。对应结果和源图存为 scratch-rejected 证据，不拿该变体的结果冒充最终代码。

## 逻辑与生命周期验收

- 13 项定向契约通过：采样节奏、未采样不读时钟、阶段总和、环覆盖、未完成行隔离、reset/迟到、错误/取消统计、参数界限、真实 scheduled 串行更新、异步重复调用、切换 engine、关闭诊断不影响 pending tick。
- 4,040 次新旧空间查询逐项对象身份/顺序相等。覆盖名单 0/1/10/63/64/100/257/1024、稀疏/密集、跨桶去重、重复对象、NaN 查询、负 padding、epoch 回绕、rebuild 缩小/扩大。
- 冻结 baseline/candidate 经真正 `fixedUpdateScheduled` 推进：100 Onslaught、100 Harbinger/Paragon、24 Doom/Harbinger、24 Odyssey/Paragon，各 180 步；每 30 步比较完整引擎、玩家 AI、逐挂点 WeakMap tracker，**24 个检查点一致**。保留引用、Map/Set、特殊数字，只归一化函数与 kernelMs。
- 候选开启 sampleEvery=1，180/180 次完成均记录。索引真实查询分别 147,672、0、0、7,408 次。两个查询为零的场景只作为行为/采样验证，不算空间优化激活证据。
- 正常浏览器 useCombatLoop + rAF + scheduler 验证通过；不是仅手动调用裸 fixedUpdate。100 Onslaught 实际记录 6,633 次 worker commit；混编如预期保留 unsupported-scene。页面错误为零。
- TypeScript、Oxlint 与两份冻结源图的生产构建通过。Oxlint 仍有无关的 `scripts/check-campaign-calendar-integration.mjs:29` unused parameter 警告；未修改它。构建有既有大 chunk 提示。
- 本轮四个源文件与最终冻结 candidate 及 build-after 的源图逐字节一致；diff --check 通过。

## 查询微基准：不是整局收益

Node 中使用相同 query workload，预热后 9 轮交替次序，取中位数。稀疏组每轮 10,000 次查询，密集组每轮 500 次。这里只测候选恢复及网格查询，不含 AI、Worker、绘制；数字很小，不能把百分比转换成 FPS。

| 名单长度 | 稀疏：before → after，ms / 10,000 次 | 密集：before → after，ms / 500 次 |
| --- | ---: | ---: |
| 20 | 0.725 → 0.723 | 0.487 → 0.464 |
| 64 | 1.467 → 1.235 | 1.989 → 1.983 |
| 100 | 1.624 → 1.328 | 2.808 → 2.718 |
| 300 | 3.526 → 1.513 | 8.227 → 8.062 |
| 1000 | 8.942 → 1.223 | 28.842 → 28.429 |

初版只在收集后识别密集查询，出现约 6%～12% 的密集微基准退化；加入查询区域/桶大小的提前选择后不再为这些查询支付收集成本。小规模/密集组的小幅变化视作噪声，不宣称加速。

## 真实 rAF 阶段归因

无头 Chromium / ANGLE D3D11，2560×1440、DPR1；原 useCombatLoop，手动闲置旗舰，无输入注入。每场约 8 秒、sampleEvery=1；这是**短时诊断，包含 Worker 冷启动，不是稳定态或前后 FPS 对比**。最终 pause 可能增加一个强制完成样本；UI 相机跟随与配对全场视图也不同，不能混比绝对耗时。

| 场景 | 实际名单 | 模拟 total 均值 | 主要分段均值 | 路径 |
| --- | ---: | ---: | --- | --- |
| 100 Onslaught | 100 | 92.80ms | shipsWeapons 28.14；wait 25.68；fleetAI 17.42；dispatch 8.87 | 含 19 个 starting 样本，67 个 native-onslaught，6,633 个 commit |
| 100 Harbinger/Paragon | 100 | 39.08ms | fleetAI 24.06（61.6%）；shipsWeapons 12.46（31.9%） | 全部 unsupported-scene |
| 24 Odyssey/Paragon | 72（含舰载机） | 24.16ms | fleetAI 12.00（49.7%）；shipsWeapons 7.17（29.7%）；projectilesBeams 2.92 | 全部 unsupported-scene |

观测到的 TPS / rAF FPS 分别约 10.67 / 12.65、23.68 / 4.17、38.27 / 6.44。这是这台机器/短时无头负载的结果，不代表用户当前桌面性能，更不是性能提升。混编同步模拟在一帧追赶多个 tick 会挤占主线程；不能将低 FPS 全部归咎于 GPU。

100 Onslaught 的既有 droppedSimulationSeconds 约 4.97；另两场该计数为 0。**0 不代表没有墙钟时间裁剪**：现有 scheduler 的 maxFrameTime=0.1 对 wallFrameTime 的裁剪不进入该计数；本轮没有更改调度语义，也未新增该项统计。下一阶段应补齐它，再核算前台实时率与状态年龄。

因此后续优先级仍是混编 AI/舰船更新的批量只读输入、共享查询和受控派生缓存，以及权威与 UI 隔离。当前这项空间查询优化不足以解决百舰主瓶颈，不应继续围着它反复微调。

## 生产构建 scheduled 配对结果

相同冻结源图、同源双 iframe、2560×1440、DPR1、逐步交替 before/after；实际调用 fixedUpdateScheduled（含真实 AI Worker），随后绘制并 gl.finish。采样器关闭。它仍是固定工作量比较，不是 rAF FPS；主线程 threadCPU 不含 AI Worker 的 CPU。通常 180 步/60 预热，小场景复测和 A/A 为 360/60。

| 样本 | scheduled+visual 前 → 后 ms | 完整 workload 前 → 后 ms | 完整耗时变化 |
| --- | ---: | ---: | ---: |
| scheduled-native / 20 | 13.212 → 13.924 | 20.318 → 21.263 | +4.65% |
| scheduled-native / 100 | 87.771 → 88.530 | 115.483 → 115.951 | +0.41% |
| scheduled-native-reverse / 100 | 96.110 → 97.419 | 126.594 → 128.114 | +1.20% |
| scheduled-mixed / 24 | 24.136 → 23.700 | 31.818 → 31.362 | -1.43% |
| scheduled-small-reverse / 20 | 13.507 → 13.505 | 23.651 → 23.754 | +0.44% |
| scheduled-aa-small / 20 | 12.412 → 12.502 | 21.991 → 22.077 | +0.39% |

所有配对状态哈希一致、页面/WebGL 错误为零；百舰两轮 before/after 都实际进入 4-workers。20 舰第一次短样本有退化，反转顺序的更长复测中 scheduled+visual 基本相等；完整 workload 差异约 +0.44%，同方法 A/A 约 +0.39%。不能只报告首次结果或挑选更快结果。

**没有证明整步稳定加速。** 原生百舰两轮完整工作量略慢，混编略快，尚不足以宣布总性能收益；本轮的交付重点是可观测性基础和有序稀疏查询算法，不将局部微基准冒充帧率提升。P0 默认关闭但仍有空 trace 分支，后续性能门禁继续包含其成本。

## 复现入口与后续边界

证据目录中的 `build-runtimes.mjs`、`contracts.mjs`、`verify-battles.mjs`、`benchmark-query.mjs`、`profile-production.mjs`、`paired-scheduled.mjs` 对应上述结果。冻结生产版本为 build-before/build-after；scratch-candidate 是未采用的实验，不是交付版本。已有带资源 junction 的构建目录不得递归删除或就地覆盖重建。

尚未迁移 StateStore、RenderFrame、CombatHost 或泛化混编 Worker；未恢复此前移除的测试体系，未改发布/包脚本。未修改画质、实体数量、AI/物理频率、既定更新顺序或网络协议；没有暂存、提交、推送或发布。
