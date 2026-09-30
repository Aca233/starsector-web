# 同阶段已合格火控名单：实测与保留决定（2026-09-26）

## 结论
保留本轮三处生产改动。一次固定配对中，模拟平均耗时下降 **1.50%（0.628ms）**，P95下降 **2.26%**；6个连续30tick块中5块模拟变快。完整Host交付仅下降 **0.36%（0.269ms）**，P95仅下降 **0.13%**，6块中4块变快。**这是小幅模拟优化，不是显著延迟改善，也不足以承诺肉眼可感知的流畅度提升。** 没有因微小数字反复重跑择优，也不把查询减少比例当成提速比例。

生产保留：
- src/engine/ai/QualifiedFireTargets.ts：封闭Worker只读事务内的名单身份/资格租约。
- src/engine/ai/FireControlQueryBatch.ts：对已经逐舰检查过的名单及保序范围子集登记租约，close时失效并释放引用。
- src/engine/ai/AutofireController.ts：仅扫描本事务已合格名单里的SHIP候选时，省去重复的forShip/canTarget Map查询。

## 来源与安全边界
实现前对照见 qualified-fire-targets-source-notes-2026-09-26.md：本机0.98a-RC8反编译private.java:233–282、WeaponGroup.java:301–314。反编译有类型异常，不照搬异常表达式。此次是保行为性能修改；未新做原版实机/UI验证，也不声称整体原版等价。

名单首次建立的完整资格读取不变，每begin的原生live guard不变；角色、弹药、距离、射界、友伤、发射许可、RNG与候选顺序不变。不跨阶段保留目标状态，不降低任何频率/实体数/精度/字段或校验。显式目标、tracker当前目标、MISSILE、generic/复制/外来名单仍走旧资格路径。close、roster身份不符、roster长度变化均不允许沿用证明。close清除shooter/roster强引用；WeakMap不持有名单键。

仅适用于结构化克隆命令输入、无外部可执行扩展的封闭Worker原生只读域。内部调用者必须遵守readonly名单成员不变的所有权约定；这不是同realm恶意脚本的安全沙箱。新增同realm插件前必须重新审计。

## 正式速度配对（不插桩）
命令：
```text
node scripts/benchmark-real-workers.mjs --host-pipeline --serial-pair --count 200 --warm 150 --steps 180 --baseline artifacts/qualified-fire-targets-20260926/baseline-sources.json --candidate artifacts/qualified-fire-targets-20260926/candidate-input-sources.json --freeze artifacts/qualified-fire-targets-20260926/measured-sources.json --out artifacts/qualified-fire-targets-20260926/host-serial-pair-200
```

200艘onslaught、固定seed/dt，150tick预热＋180tick测量，fresh无头Edge。三臂顺序逐tick交替，其中serial和before是冻结旧图、after是冻结候选；三臂均固定串行。比较以下before/after，不跨轮借用旧raw-Worker数字。未开host-stages/profile/资格计数，未强行启用Owner。P95采用runner定义：排序后下标floor((n−1)×0.95)。

| 阶段（ms） | 旧均值 | 新均值 | 均值变化 | 旧P95 | 新P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 41.717 | 41.089 | -1.50% | 49.330 | 48.215 | -2.26% |
| 完整显示编码 | 20.749 | 21.010 | +1.26% | 29.715 | 27.840 | -6.31% |
| Host发起→原始ACK | 62.891 | 62.531 | -0.57% | 75.720 | 74.010 | -2.26% |
| Host呈现处理 | 11.152 | 11.243 | +0.81% | 15.885 | 15.350 | -3.37% |
| Host完整交付 | 74.076 | 73.807 | -0.36% | 86.290 | 86.180 | -0.13% |

hostPresentationMs是生产Host decodeMs，包含decoder.apply、地图/部署/字符串处理，不是旧raw模式的纯decoder.apply。deliveredMs从Host.step发起至promise完成，包括输入复制/排队/ACK处理/日志；不包括真实渲染、网络、rAF节拍或输入到画面的延迟。各阶段P95不能相加。编码均值反向增加1.26%、Host呈现处理增加0.81%，所以不能把模拟降幅直接当成交付收益。

按预先固定顺序的6个30tick块（不删坏块、不挑最好块）：

| 测量tick | 模拟均值变化 | 完整交付均值变化 |
|---|---:|---:|
| 151–180 | -1.29% | -0.70% |
| 181–210 | -1.10% | -0.91% |
| 211–240 | -2.27% | +0.39% |
| 241–270 | -3.02% | -0.88% |
| 271–300 | +1.47% | +1.34% |
| 301–330 | -2.81% | -1.45% |

这是单个场景、单次配对；没有建立跨设备或长期统计置信度。多核、实际联机和渲染未从此速度测试获得提速结论。

## 正确性与真实Host
集中验证一次完成，均exitCode=0：
- tsc -b tsconfig.json tsconfig.ai.json：10723ms。
- 7个改动代码/测试文件oxlint：74ms。
- 既有check-combat-ai全部52项：3207ms。设置AUTOFIRE_BASELINE读取冻结旧Controller，仍使用同一Ship/Vector2模块图。

新增合同182检查、130旧/新对照，合成场景canTarget查询6330→67（**仅工作量计数**）。覆盖完整首次扫描、非owned/复制/错误shooter/错误roster、关闭和长度失效、关闭释放引用、generic getter/回调精确读取顺序、tracker原路校验、10阶段×13挂点aim/preAim/decide/tracker/RNG。

旧有资格转变、回调/重入/异常、owned多挂点、preAim范围、live guard、Hostile查询及Publisher场景也通过。

真实Host基准：660次逐步witness比较，662次完整呈现图比较（含初始化），18,103,234个比较节点；11个检查点比较完整权威＋隐藏火控/RNG状态。三臂freshBatches=0、invalidated=0；结尾Host均ready、pendingTransactions=0、tick=330、journalEntries=1、epoch=1、sequence=331。日志中没有将Owner提交误作此串行改动收益。

## 独立默认自动模式激活/恢复审计（不能当速度证据）
命令：
```text
node scripts/benchmark-real-workers.mjs --count 200 --warm 0 --steps 55 --decode --fire-query-audit --candidate artifacts/qualified-fire-targets-20260926/candidate-input-sources.json --out artifacts/qualified-fire-targets-20260926/activation-restore
```

使用raw Worker驱动；与Host入口分开，没有第二次性能择优。55次serial/自动模式witness比较、56次呈现图比较；独立新Worker恢复后的witness、完整权威＋隐藏状态及呈现一致。
- 初始化/恢复均：registrations=1、rosters=55、maxRoster=200、batches=11000、rejectedBatches=0、targetLists=10932、targetReads=2186637、targetHits=121136。
- 新资格路径初始化/恢复均：**skipped=1,997,599，fallback=121,373**。读回并断言两边计数一致、skipped非零；不是只存在代码但从未启用。
- 默认自动模式tick25启动探测、tick27报告4个Owner；19个fresh batch，invalidated=0。tick49因no-measured-benefit回串行，结束仍串行。没有强改生产多核策略。

## 冻结与最终文件核对
- 基线312模块，候选313模块；生产差异仅上列3个文件。
- measured-sources逐模块与candidate-input-sources完全相同。
- 完成审计后，当前313模块文本与候选图一致，7个验证文件字节hash仍等于集中验证时；生产漂移和验证文件漂移均为空。
- SHA256、Host状态与最终断言见 artifacts/qualified-fire-targets-20260926/final-verification.json；结果表/全部块见 performance-analysis.json；原字节备份和候选文件都保留在同目录。
- 未暂存、提交、推送、打包或发布，未操作桌面/可见浏览器，未改安装游戏。

总体优化目标仍进行中。本轮结论不改变上轮定位：默认场景UI复制/日志不是主要瓶颈；后续应继续针对真实模拟与完整显示编码/解码的结构性成本，而不是为了占用率强推多核或堆微小缓存。
