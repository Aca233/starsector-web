# 解码有序Set工作队列：性能与验收（2026-09-26）

## 结论：保留局部收益，不夸大整体提速
本轮生产只改CombatPresentationDecoder的一段BFS。以有序Set同时充当工作队列和去重表，去掉独立pending数组以及入队/出队的显式has；仍按首次发现顺序验证所有节点、边、元数据和预算，不改事务提交。它不是对象池，不是跨帧验证缓存，不是之前被否决的Entry复用/共享keys组合。

正式200舰固定串行配对中，Host呈现处理均值 **10.960→10.423ms（-4.90%，约节省0.537ms）**，六个分段全部改善，目标P95 **-2.38%**。完整交付均值 **67.341→67.111ms（-0.34%，约0.229ms）**，P95 **-0.41%**，端到端改善很小，而且六段仅三段交付更快。保留这项简单且目标环节一致获益的实现，**不能称为大规模模拟或整体卡顿问题已解决**。

## 选择依据
此前的decoder-stage-diagnosis报告拆清当前Host：完整可达图约2.239ms，写入1.845ms，分配仅0.321ms；平均15215.65个唯一节点有18627.5次pending访问。因此选择消除单次遍历内部的重复排队和membership操作，而非再叠加Entry池。

该诊断有插桩，与本表不是同一次运行；不跨运行相减计算加速、不把计数当实测分配/GC收益。当前候选没有再做阶段计时；我们只证明无插桩Host呈现处理的变化，不冒称已测得候选BFS单阶段节省多少。

## 不变的合同
- Set迭代会访问迭代期间追加的ID，重复add不改变已有ID位置；其首次发现顺序与原数组BFS相同。
- 每个候选节点、每条引用边、元数据引用仍验证；仍检查完整live数量、可达性和预算。
- 无法解析的引用仍在首次BFS访问处拒绝；不改任何shape/类型/危险键/epoch/revision/tick校验。
- 不写入或复用已接受Entry作为验证标记；不改keys复制、对象身份、typed-array重绑、元数据回收、提交边界。
- 不改玩法、UI、字段、精度、频率、实体、模拟代码、多核策略、网络协议；没有GPU计算变更。

## 一次正式真实Host配对
全新无头Edge153，16逻辑CPU、crossOriginIsolated和SharedArrayBuffer可用。200 Onslaught、seed917、固定1/60步长；前后都固定串行、每臂150tick预热+180tick测量，按tick交替执行。无profile、host-stages、decoder-stages、额外激活计数。一次正式运行，未重试择优。

| 指标 | 均值ms，原→候选 | 均值变化 | P95 ms，原→候选 | P95变化 |
|---|---:|---:|---:|---:|
| 模拟（未改） | 37.038 → 36.774 | -0.71% | 45.060 → 42.430 | -5.84% |
| 编码（未改） | 18.905 → 19.473 | +3.01% | 23.275 → 23.370 | +0.41% |
| Worker往返 | 56.348 → 56.658 | +0.55% | 66.730 → 65.585 | -1.72% |
| Host呈现处理（目标环节） | 10.960 → 10.423 | -4.90% | 13.890 → 13.560 | -2.38% |
| Host完整交付 | 67.341 → 67.111 | -0.34% | 77.775 → 77.455 | -0.41% |

P95用排序后floor((n-1)*0.95)，所有指标与runner原始汇总核对一致。所有测量样本workers=0、mode=serial、freshBatches=0、invalidated=0。未改的编码均值+3.01%也完整列出，不把未改模拟的观察下降当本轮算法收益。

| 连续30tick区间 | Host呈现均值变化 | 完整交付均值变化 |
|---|---:|---:|
| 151–180 | -4.94% | -0.13% |
| 181–210 | -3.40% | +0.03% |
| 211–240 | -5.52% | -0.86% |
| 241–270 | -6.41% | -1.38% |
| 271–300 | -5.28% | +0.22% |
| 301–330 | -3.74% | +0.04% |

三段完整交付轻微变慢，明确保留，不以目标局部结果冒充所有帧加速。单次固定场景不是跨机器/舰种统计显著性结论。完整交付包含Host输入、排队、ACK及Promise交付，不包含渲染、网络RTT、rAF节奏和input-to-photon，不能直接换算FPS。

330tick中660次有效帧/witness对照、662次完整显示图对照（18,103,234节点访问）、11个权威/隐藏火控/RNG检查点一致。所有Host最终ready、tick330、pendingTransactions=0，回放journal和保留节点数量符合原合同。

## 验证及测试夹具修复
一次候选typecheck（9477ms）和5个修改文件lint（142ms）通过。完整render-projection命令**被中止，contracts exit=-1，不宣称全套成功**：新增96节点双向环、4096别名的稠密图使用通用deepEqual，会沿共享环重复比较大量路径。核对确为本轮测试子进程（PID37984、父38660）后仅停止该进程，没有停止其它任务；记录oracle-repair.json。没有因为观察超时重启测速，此时正式测速还未开始。

仅修测试比较器为双向身份映射+工作队列，线性访问每对对象，同时严格检查双向别名、原型、Map/Set顺序、数组/typed值、-0/NaN和全部键。生产源码未因测试修复改变。

定向补验：
- 新worklist合同437419项：32个连续包与冻结旧Decoder完整对照、17167次保留节点迭代顺序记录、8次故障注入拒绝。涵盖密集别名/环、Map/Set顺序、同tick值变化、临时节点退出、图退休/重入、动态重排。首次BFS顺序由独立旧式数组工作队列oracle核对；拒绝不推进revision、不改显示，随后同包合法重试成功。
- 既有decoder/index/事务合同50152项，包含27+12个旧/新输出对照、5+12类拒绝场景以及可调整长度typed-array父引用重绑。
- 后续shape485项、row800项，共51437项定向既有合同；没有重跑完整场景。修复helper的定向lint通过。
- 测试构建阶段插桩分别对冻结旧/新Decoder做esbuild语法检查，可继续用于以后诊断；正式对照没有启用它。

上述数量是合同断言/访问次数，不是分配或性能测量。没有新原版实机/UI截图，也不由解码测试声称玩法全面还原。

## 源图与既有改动保护
诊断冻结图作为候选基线，315模块。正式baseline与candidate仅Decoder不同；measured图315项全部与candidate一致，核对时磁盘无漂移。前两轮Ship/Worker相位优化、Encoder HUD单次投影、HUD参考测试修正hash均保留；上一轮被否决的渲染布局缓存未恢复。

改动的测试工具、精确候选源码hash见pre-measure-verification.json和final-verification.json。没有覆盖其它任务舰装/生涯改动。未提交、推送、打包或发布；未启动子代理、操作桌面或修改原版安装内容。总优化目标继续active。

## 证据
- artifacts/decoder-set-worklist-20260926/performance-analysis.json、host-serial-pair-200/result.json
- artifacts/decoder-set-worklist-20260926/baseline-sources.json、candidate-input-sources.json、measured-sources.json
- artifacts/decoder-set-worklist-20260926/validation-status.json、oracle-repair.json、targeted-contracts/contracts.json、remaining-contracts.json
- artifacts/decoder-set-worklist-20260926/decision-policy.json、final-verification.json
- docs/decoder-stage-diagnosis-2026-09-26.md及artifacts/decoder-stage-diagnosis-20260926/（仅诊断，不是本轮速度基线）
