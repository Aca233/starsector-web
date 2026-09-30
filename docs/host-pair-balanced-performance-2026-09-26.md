# Host三臂顺序修订：结构修复通过，仍有A/A残差（2026-09-26）

## 结论

**保留基准工具的顺序修复，不新增生产性能收益声明。** 默认三臂执行改为六排列轮转，消除旧before永远位于中间的确定性不平衡。两臂行为不变；--order-policy legacy可复现旧三臂调度，--reverse-order继续支持。结果显式输出方法版本2、策略/周期、实际位置计数、初始化次序和版本共享结构。

一次新策略同图A/A显示编码差异−0.958%，但模拟差异−4.167%、交付差异−2.428%；两边生产代码及构建完全相同，因此**这些数字不是优化收益**。旧方法A/A编码+3.968%与本次−0.958%来自不同运行；不能把差距相减作为顺序修订的性能效果，也不能证明顺序是全部原因。

## 代码与校验

只修改scripts/benchmark-real-workers.mjs，新增scripts/lib/benchmark-arm-order.mjs。保留完整Worker/Host生产路径、所有witness/packet/显示/权威/隐藏火控/RNG/Host地图与部署审计。每份样本在计时外记录executionPosition，运行结束核对实际位置计数；不足整周期照实保留，不删样本。

调度合同：392种窗口，1980个legacy/两臂逐tick顺序核对，六种排列及六种有向相邻关系均匀；reverse两方向、冻结输入、非法参数均覆盖。集中TypeScript exit0（9493ms）、两文件lint exit0（116ms）、node语法检查通过。没有新建测试工程。

## 唯一新策略控制检查

仍用同一冻结320模块，200舰、seed917、dt1/60、150预热+180测量，无头Edge153，16逻辑CPU，COI。无profiler或额外阶段计数。两臂21个bundle的SHA完全一致，且与旧策略A/A的21个bundle相同，故没有把生产或审计变更混进方法对照。

实际测量位置：

| 臂 | 首位 | 中位 | 末位 |
|---|---:|---:|---:|
| serial | 60 | 60 | 60 |
| before | 60 | 60 | 60 |
| after | 60 | 60 | 60 |

| 指标 | before均值 ms | after均值 ms | 同图均值差异 | 同图P95差异 |
|---|---:|---:|---:|---:|
| simulationMs | 33.147 | 31.766 | -4.167% | -3.533% |
| encodeMs | 16.754 | 16.594 | -0.958% | -1.511% |
| roundTripMs | 50.280 | 48.736 | -3.070% | -3.707% |
| hostPresentationMs | 9.275 | 9.375 | +1.075% | +7.461% |
| deliveredMs | 59.585 | 58.138 | -2.428% | -1.777% |

六个30tick段：模拟5/6段after更快、交付5/6更快、交付P95也下降。因此相同代码在本次控制实验中**甚至会通过旧fleet候选的均值/多数分段/P95门槛**。该事实说明，仅靠单组独立Worker实例的上述门槛，不足以建立小幅代码优化的因果收益。不能将六个连续时间段当作六个独立Worker重复实验。

660次witness/packet、662份完整显示图（18,103,234节点）、11个权威/隐藏火控/RNG检查点均一致；三臂均serial、workers/freshBatches/invalidated为0，Host队列清空。工具与生产源均无漂移；之前接受的导航等改动SHA保持不变。

## 未解决事项与后续边界

初始化顺序、serial/before共享构建URL、独立Worker实例的运行时状态等仍未完全平衡；没有证据选择JIT/GC/硬件调度中的某一原因。按位置分组的探索统计在各臂使用的状态tick不同，只可描述，不可作为调整历史结果的系数。本次不反复跑到残差变小。

下一次声称小幅收益前，应预先固定有限数量的独立Worker实例/角色互换对照，并在同等预算中纳入同图控制；若用户不希望增加测试，宁可不声称小幅收益，优先寻找显著的重复计算/数据搬运削减。此为下一步方法建议，本轮未运行这些额外测试，也未重新接受任何已否决候选。旧测量保留，不静默重写历史结论。

全局优化目标仍继续；本轮完成的是候选回退、诊断及基准顺序修订，不是整个项目性能任务完成。

工件：artifacts/host-pair-balanced-20260926下method-gate.json、contracts.json、validation.json、preflight.json、analysis.json、acceptance.json、run/result.json、before/final代码快照。旧方法控制见host-pair-aa-performance-2026-09-26.md；舰队候选结论见fleet-cover-scalars-performance-2026-09-26.md。
