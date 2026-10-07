# 原生预瞄直接最近合法目标：实现及集中验收

## 结论
已保留本块算法重写。不是把前一块current顺序修正换名：原生预瞄不再query→materialize→sort→nearest，而在BVH中直接返回最近合法目标。上一块单独顺序修正无整步收益，已逐字节撤回。

- 既有seed917/standard/2玩家20AI（初始176实体734挂点；窗口尾170实体），150warm/120timed ABBA：整步 **38.202 → 35.736 ms**，观测 **6.46%**降低。
- fire-query阶段 **10.691 → 9.320 ms**；AI（本块未改AI）也有 13.240 → 12.486 ms波动，不能把全部整步差都归因于候选消除，不能外推所有场景稳定收益。
- 这是一次同进程ABBA观察，两对均同方向；没有与tsc/lint/代理重型作业并行。仍明显高于16.67ms，**整体高ms和60Hz未解决**，只处理了预瞄执行图一项根因。

## 实际工作量
120步物化候选 **721826 → 56216**（减少约92.21%），完整query **64572 → 14574**；新nearest查询49998次，叶行访问213015、精确求解209855。剩余候选用于射击scan，不能删。没有降低preAim次数、范围、资格、contact、每步响应；没有改ms口径、dt、实体/挂点或RNG。

## 严格行为验收
- 一次app tsc和改动两文件oxlint均exit0。
- 270步candidate及rollback与冻结原始baseline：全部原始快照及双RNG一致；20790组AI/defense记忆、195934组autofire tracker/per-mount RNG一致。无control差异白名单。
- current优先、无current、超scope、友军、不在范围、角色拒绝、同距source顺序、非法query、未知source、关闭span、方法覆盖、未注册world：定向通过。
- 1024组直接tree.nearest与旧tree.query+nearestKernel对照：资格/membership、跨叶平局/source排序、range/velocity/delay/role/arc、beam/guided/contact、current、大数/subnormal等全部一致。
- public generic preAim及scan保留旧顺序；fallback仍返回undefined而不是伪造null结果。

## 文件与回滚
- src/engine/ai/NumericAcquisitionTree.ts：nearest直接选择，L∞节点距离下界只保守裁远、等距不裁，source order保留平局；沿用原范围包围盒拒绝。
- src/engine/ai/NumericAcquisitionFrame.ts：仅已经准入的compiled native boundQueries调用nearest。
- VITE_COMBAT_NATIVE_NEAREST_PREAIM=false恢复完整旧原生执行图；专用rollback270步及计数严格一致。
- 证据 artifacts/combat-native-nearest-preaim-20261003/{accepted-summary,logic-result,kernel-boundaries-result,timing-result,static-checks}.json，baseline/rejected上一块见相邻目录。

## 未验证
原版0.98a-RC8源码/实机/UI待核实；没有桌面操作、UI修改或原版等价宣称，没有发布/提交/生涯修改。当前结果不证明local Worker编码/实际渲染/所有舰队规模的端到端收益。分类规则生命周期、重复modifier组合和资格门禁仍是后续结构性工作，不能用缓存稳定观察替代写入口证明。
