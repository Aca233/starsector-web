# 战斗热路径与连续显示数据（2026-09-21）

## 编码前对照

- 原版证据：本地 0.98a-RC8；`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ContrailEngine.java`、`ContrailParticle.java` 的尾迹呈现数据；`CombatEngineAPI.java:70` 暂停语义。本轮不重写尾迹/粒子生成、寿命、随机流或更新顺序，仅修改权威到显示的表示。原版实机截图未核实，继续遵守不操作桌面的限制。
- 当前 Web 读集：`CombatTypes.ts` 的 Particle/ContrailParticle/ExplosionAnimation/HitGlowAnimation/MuzzleParticle，`ContrailEngine.ts` 的 ContrailStrip/Point；WebGLFXPass、WebGLProjectilePass 中对应渲染读取。所有已声明字段保留；未知字段/类型走原兼容路径，不能静默丢弃。
- 当前问题：冻结 baseline.mjs 的百舰 120 tick 有 14891 尾迹点、9161 爆炸烟团、66474 Vector2，通用对象图为这些纯显示数据执行身份图、字段反射、tag/ref、增量比对、图校验和逐对象写回。记录级 delta 仍须扫描整图。
- 预期：这些数组改为 schema 驱动的 Float64 连续块，保留元素顺序、字段有无/undefined/null/NaN/-0 与图像。显示记录不再借用权威引用；纯显示的向量/颜色不承诺与其它记录共享对象身份，但每个显示记录及其自有子对象保持稳定。不得把这类帧用于权威恢复。
- 验证：旧冻结实现对照所有字段值、固定输入完整模拟状态；畸形包不能部分修改画面；真实 Worker 传输/回收/销毁；WebGL 同状态截图；同一冻结基线的交替批次测试，不把不同负载下的耗时直接作百分比结论。

## 模拟热路径补充（先于 AI 修改）

CPU 样本中 ThreatAssessment 的盾面候选累加占主要单项热点。源码约束是当前 Web `ThreatAssessment.ts` 的候选遍历、逐项加法顺序与首个平局胜出，不声称它是完整原版护盾 AI。原版 `combat/ai/private.java:75` 证明相关 AI 使用 advance(dt)，本次仍不改变时间步或调用顺序。将候选扇区的包含关系改为按角度滑动窗口与原序号 bitset，但保留每个候选的原始浮点累加顺序；边界使用原谓词，异常输入和小集合退回原路径。用大量边界/NaN/Infinity/负权重/重复角度例子逐位对照，再做同 seed 完整战斗状态对照与生产内核基准。

## 资格检查热路径（先于缓存修改）

`DefinitionRegistry.ts:6–12` 拒绝重名注册并递归复制/冻结定义；`HullMods.ts:resolvedHullMods` 已只为 isImmutableMetadata 的舰体缓存解析结果。nativeRangeDefinitions 是模块私有 WeakSet，仅在内置注册期间添加，外部不能把自定义定义升级成内置。因而可为同一已冻结舰体缓存 hasOnlyNativeRangeModifiers 的布尔资格，不缓存范围数值/动态战斗状态；可变舰体、未解析成功的定义始终保留实时检查。验证自定义/可变改装变更、延迟注册、重复注册和完整模拟对照。

## 武器威胁空间排除补充（先于修改）

当前 Web 的 WeaponThreatEnvelope 使用枪口旋转无关 L1 外包半径（FireControlGeometry.ts:116），以舰心的 L∞ 距离排除不可达目标，斜向区域会多做逐武器 ETA/转向计算。本轮试验仅在既有原生同步 envelope 内收紧距离下界为欧氏距离；沿用原半径/完整 horizon/相对闭合速度上界及坐标缩放误差余量，非有限距离保留旧 L∞ 判断，不改变最终 ETA、威胁顺序或角度算法。自定义回调原路径不动。原版来源与 AI 非等价边界同上；这是计算候选的保守排除，不是改变感知/射程/游戏规则。先做完整状态与边界对照、再做同一进程交替内核基准；收益不成立则撤销，不将微基准当实际帧率。


## 最终落地范围（协议 v4 / frozen-build10）

1. 新增 PackedVisualState：粒子、尾迹、枪口粒子、命中辉光、尾迹带及点、爆炸烟团/闪光/光晕、本地粒子从通用身份图改为显式 schema 的连续 Float64 数组。保留元素顺序、字段值及 absent/undefined/null 区别，不减少实体/特效、不降低更新频率、不改变 RNG 或权威写入顺序。
2. 未知记录字段、类型或 getter 使整个对应集合回退兼容图，不静默截断。解码先校验两部分与占位关联，再提交；显示对象不与权威共享存储。不承诺跨记录的向量/颜色别名身份，也不能用此呈现包恢复权威。
3. Host/Worker 双缓冲转移与回收；维持单个在途事务、代际/序号/ACK、有限队列、超时与销毁规则。协议版本升至 4。数值区统计包含图和 dense 两块，但不包含字符串、shape、metadata 等非数值数据。
4. 密集盾面计算按角度寻找覆盖集合，用原序号 bitset 按原始顺序累加，保持浮点加法及平局顺序。仅 imminent >= 128 时启用；普通集合仍用原内联循环。典型百舰 fixture 很少达到此阈值，不能据该函数微基准声称普通战斗更快。
5. dense 集合仍是每次 ACK 的完整连续发布，不是已实现的 changed-row 增量。其余舰船/组件仍有兼容图开销；普通 CombatSession 默认后端未改为 LocalWorkerHost。

## 被撤回的试验

- 上述资格检查缓存通过了正确性测试，但整内核交替测试未显示收益，已撤回；trial-with-qualification-cache.mjs 留作负面证据，不在最终源码中。
- 圆形武器距离下界通过 2,800 个边界/极值/舰型对照及完整状态检查，但整内核均值为 24 舰 11.31 → 11.68ms、100 舰 73.28 → 74.28ms，未证明净收益，已撤回。trial-circle.mjs / trial-circle-kernel.json 仅在 artifacts 中。没有把“更紧的数学界限”直接当成性能改进。

## 同进程配对性能结果

基线是本轮开始时冻结的 baseline.mjs（协议 3），不是上一轮不同时间的截图或 build5 耗时。candidate.mjs 对应最终 build10 源码。每步交换旧/新运行先后，共 120 步、每 15 步逐项比较呈现值；未并行运行其它重型测试。以下是该次 Node 固定工作量均值，**不是 FPS，也不是正常 rAF 的实时保证**。

| 初始场景 | 旧编码 | 新编码 | 旧解码 | 新解码 | 旧/新平均数值区 | 最后通用图节点旧/新 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 24 艘 Odyssey/Paragon 主舰，72 实体 | 29.47ms | 21.40ms | 18.08ms | 10.89ms | 1.481 / 1.194 MB | 19,471 / 7,988 |
| 100 艘 Onslaught | 158.19ms | 84.10ms | 116.52ms | 49.52ms | 7.035 / 5.927 MB | 129,383 / 28,076 |

百舰编码+解码为 274.71 → 133.62ms，降低约 51%；24 主舰为 47.55 → 32.29ms，降低约 32%。这是传输 CPU 收益，不是“帧率翻倍”。记录/特效数量和全部投影字段保持一致。两个 fixture 分别有 8 个字段对照检查点。

**整内核没有测得净提速。** 单独 180 步（前 30 步预热）、同输入交替顺序、最终完整状态对照的均值：2 舰 1.120 → 1.161ms，24 Onslaught 11.292 → 11.814ms，100 Onslaught 73.256 → 75.077ms。该次候选略慢，不能宣称模拟优化完成；微基准不能抵消这条结果。全桥测量中的 kernel 也不能独立当成模拟收益。

## 真实无头 Chromium / Worker 结果

最终冻结构建 **frozen-build10**（不是已撤回试验或 build9）走真实 Worker、transferable、四个嵌套 AI Workers，并运行 WebGL；未操作桌面或注入系统键鼠。

| 初始场景 | inline kernel | Worker kernel | 编码 | 主线程解码 | step 往返 | 平均数值区 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 Onslaught 主舰 | 80.93ms | 72.44ms | 59.38ms | 36.02ms | 168.44ms | 5.910 MB |
| 24 Odyssey/Paragon 主舰 / 72 实体 | 22.96ms | 23.56ms | 15.73ms | 8.16ms | 47.98ms | 1.182 MB |

- 73 个真实 Worker 混编呈现检查点 + 25 个压力检查点通过。百舰压力为 4 AI Workers、99 commits、0 fallbacks；暂停增援命令后实体达到 105，不能把该命令的最后一包当成普通 tick 包大小。
- 普通渲染：inline/detached 121 / 3,686,400 RGBA 通道不同，最大差 12；inline A/A 77 通道，最大差 12。压力渲染：119 通道，最大差 9；A/A 89 通道，最大差 9。误差很小，但**不是严格像素全等，也不是原版实机验收**。
- 销毁：4 个子 Workers / 59 commits；未完成请求被拒绝，CDP 确认剩余 Workers 为 0。
- 本次 Worker 往返仍慢于 inline。**不默认启用整个权威 Worker，不把搬到线程外等同于百舰不卡。**

## 正确性与覆盖边界

- 六组混编各 180 步、技能/输入/阻塞切换：72 个完整引擎+玩家 AI+autofire trackers 对照，以及 72 个投影不改变权威检查，共 144 个；仅忽略函数身份及墙钟 kernelMs。不覆盖所有技能私有 WeakMap，因此不是完整 checkpoint/恢复协议。
- 盾面选择 1,600 个 exact 比较，涵盖重复方向、±π/-0、异常权重与边界。128/512/2048 威胁微基准约 0.119→0.062 / 2.64→0.34 / 43.46→2.98ms，不是整场战斗 FPS。
- 额外注入 1,024 枚同时来袭弹丸：5 个完整状态对照通过，真实大集合分支调用 4 次，最大 1,036 个威胁；仅为分支覆盖，不是可靠性能结论。
- 13 个 dense 编码/错误包原子性契约；14 个 Host 队列/时序/销毁契约。
- 最终 frozen-build10 的 9 个自有/AI 文件及 268 个模块图源码均与当前文件逐字一致。孤立 fixture 不等于覆盖完整 UI：普通入口另外以 UI smoke / typecheck 检查。

## 仍未完成 / 下一道门槛

本轮实际解决的是新呈现桥中大量纯视觉对象的通用序列化开销；**没有完成普通多舰卡顿修复，也没有完成整套新架构**。百舰内核本身仍远超 16.67ms，剩余兼容图与主线程解码也很重。

后续必须先以普通入口的阶段计时和固定多舰回放证明整内核净收益，并把当前舰船/组件兼容图缩成真正受限的只读 RenderFrame/HudState；再完成部署、战术地图、HUD/输入、结算与生涯回写的会话命令迁移、StateStore 和可验证完整恢复协议。缺这些验收前不切默认后端，不以降低模拟频率/特效数量或数值精度替代优化。

### 可复查的本地证据（均为忽略的测试产物）

- artifacts/combat-hotpath-20260921/：baseline.mjs、candidate.mjs、paired-24.json、paired-100.json、kernel-paired.json、full-state.json、sector-tests.json、dense-projectiles.json、packed-contracts.json、host-lifecycle.json、final-source-check.json。
- artifacts/local-worker-runtime-20260921/：frozen-build10、dense-browser-worker.json、dense-stress.json、dense-render-comparison.json、dense-stress-render.json、worker-teardown.json、ui-smoke.json。
- 重跑浏览器 harness 必须设置 BUILD=frozen-build10；build-browser.mjs 需显式新 OUT，不使用旧默认输出，也不递归删除历史 artifact 文件夹。

### 最终回归结论

- npm run typecheck：通过。
- oxlint（本轮 local runtime / ThreatAssessment / ShieldThreatSector 范围）：通过。
- check-lan-projectile-visuals + check-server-authority-lifecycle：30/30 通过。
- 普通战斗入口无头 smoke：通过；仍为 inline，tick 31 暂停前后不前进，驾驶/护盾命令被接受，战术图开闭正常，暂停输入不推进模拟，无 pageerror。
- 最后再次核对 frozen-build10 的源码图：9 个自有/AI 文件和 268 个图内文件均无差异。无提交、推送、发布打包或桌面实机操作。
