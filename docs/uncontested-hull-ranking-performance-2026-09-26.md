# 无竞争舰船排名省略：否决（2026-09-26）

## 结论

**不保留本轮候选。** 省略一个没有排序竞争对手的舰船候选的排名计算，语义对照通过，也确实少做了几何读取，但真实200舰Host模拟均值+2.17%、P95+3.83%，完整交付均值+1.57%。六个连续区间仅一段模拟改善、仅一段交付改善，未证明净收益。不得把少做计算当作实际提速，也不以交付P95微降0.33%掩盖其余结果。

已按before原字节恢复AutofireController、check-combat-ai入口和qualified-fire-target-contracts辅助测试；新增合同移入candidate工件。本轮未留下生产变化。上一接受ObjectPatch四模块hash仍完全一致。不是回退Git HEAD；其他任务的目录/装配更新原样保留。

## 实现范围与理由

原版与当前Web证据/读域边界见uncontested-hull-ranking-source-notes-2026-09-26.md。本轮只在已有active的封闭Worker原生FireTargetQualification内，AI候选仅一个SHIP、且预算不存在或原机制已确认可省native扣分时，把该SHIP的内部排序tuple下级字段设为0。它的priority仍1、threat仍Infinity、solution仍同一对象；导弹/诱饵priority只能0/2/3，因此下级字段本无跨候选决策作用。

所有候选扫描、每舰全名单guard、角色/射程/拦截/射界、友舰/障碍、实际decide、排序器、tracker/RNG/扫描间隔保持原样。多个舰船、手控、普通/复制名单、关闭/长度失效、外部预算仍旧路径。本方案无新增Map/对象池、无跨阶段几何缓存，也没有降低频率/精度/字段/实体或校验。

## 正确性与测试修复

一次typecheck10696ms、三处改动lint101ms通过。既有combat-ai的1–51场景通过；第52项失败是旧测试默认要求“旧引用尚未实施合格名单查询消除”，而本轮引用已含该优化，前后查询本应相等。显式引入UNCONTESTED_RANK_BASELINE及expectFewerEligibilityLookups选项（原默认保留），没有弱化其他合同，只将这个已存在优化的比较约束改为严格相等。仅复跑52–53及改动测试lint，未重跑全套或typecheck。

- 第52项182checks、130完整挂点/阶段对照、beforeQueries=afterQueries=67。
- 新增第53项27场景、170checks、79完整结果/决策/跟踪器/RNG对照；10场景少做排名护盾读取，共少60次（测试纯计数，不是时间收益）。
- 覆盖0/1/多个SHIP、PD/PD_ALSO/STRIKE、导弹/诱饵、手控、死/隐藏/相位/换队、NaN、友舰和小行星遮挡、复制/关闭/长度失效、外部预算回调及预算中止/异常。普通回调顺序和读次数一致。

55tick新旧真实Worker诊断通过全部对照，但现有runner配对模式仅导出reference的init/restore计数，未冒充候选激活。为补这个观察缺口，另做3tick候选直接启动/恢复：两者均134次排名，其中110次走省略分支，witness/authority+hidden/display一致。以上插桩诊断不计入正式速度结果。

## 唯一正式性能配对

production LocalWorkerHost，200 Onslaught，150预热+180测量tick，三个串行臂逐tick交替；固定种子与步长。无profile/阶段/计数插桩，完整包/显示/权威检查在计时外。317模块全冻结，before/after唯一生产差异为AutofireController；measured与candidate图完全一致，工具无漂移。无重跑择优、无删峰值。

| 指标 | before均值ms | after均值ms | 均值变化 | before P95ms | after P95ms | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| simulationMs | 34.986 | 35.747 | +2.17% | 46.635 | 48.420 | +3.83% |
| encodeMs | 17.661 | 17.884 | +1.26% | 21.715 | 23.115 | +6.45% |
| roundTripMs | 53.010 | 53.997 | +1.86% | 69.205 | 68.700 | -0.73% |
| hostPresentationMs | 9.903 | 9.905 | +0.02% | 12.705 | 13.150 | +3.50% |
| deliveredMs | 62.942 | 63.931 | +1.57% | 80.280 | 80.015 | -0.33% |

| 30tick段 | 模拟均值变化 | 完整Host交付均值变化 |
|---|---:|---:|
| 1（151–180） | +1.54% | +1.13% |
| 2（181–210） | +0.46% | -0.63% |
| 3（211–240） | +9.64% | +6.31% |
| 4（241–270） | +2.87% | +0.52% |
| 5（271–300） | -0.57% | +1.43% |
| 6（301–330） | +0.16% | +0.82% |

第3段模拟增加较明显，但未删除该段或据此归因某个JIT/GC原因。编码/显示源码未修改，其波动不应归功或归罪于该算法。结果只支持本候选没有证明净收益，不意味着数学推理错误或所有省评分方案必然变慢。短探针的省略比例也不能推广为完整180tick中的比例。

- 660次witness/原始有效包/回执对照；662次完整显示图、18,103,234节点、11个完整权威检查点通过。
- freshBatches/invalidated=0；三臂Host最终ready、pendingTransactions=0、tick=330；正式命令exit0。
- Host交付不含实际渲染、网络RTT、帧节拍/input-to-photon，不能换算FPS或联机延迟；不跨轮次比较绝对毫秒。

## 并发修改与收尾

正式命令前无漂移断言首先发现另一任务更新SimulationCatalog；Node断言失败后PowerShell仍执行了显式冻结图的性能命令。保留这次唯一已启动运行，不以观察失败为由重启。两臂全部模块已通过--baseline/--candidate固定，同期目录变动没有混入任一臂。测量结束又观察到DeploymentControl和DesignModel更新，均未覆盖。本轮性能不声称覆盖新增装配目录/传送命令的完整最新工作区。

最终相对冻结before仅保留其他任务的以下差异：
- src/engine/runtime/DeploymentControl.ts（8ae49c1feb6bface0887632ebe9009a337069d1680bf60334fed8331bd0433c1）
- src/engine/content/SimulationCatalog.ts（9c970e54e65e77d819bc87354b1a521fa6c7c679b5da18cc46d153c9994941d2）
- src/studio/DesignModel.ts（3d6dff26d88e9aca7e2cfe70a453f3aaf5ad250f9c130e5c4990ca14b07aa2a4）

工件artifacts/uncontested-hull-ranking-20260926保存before/candidate、317模块冻结图、原始性能、全部失败/定向修复记录、并发修改只读快照、analysis/restoration/final-verification。没有桌面操作、子代理、暂存/提交/推送/打包/发布。总优化目标仍活动，不原样重试这份省排名候选。
