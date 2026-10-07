# Fleet pressure按实际需求分配结果

保留候选。distance矩阵、pressure公式、fighters贡献、消费者及claim顺序未变；每步实际访问78行。270计划pressure payload累计33,139,314 vs 74,292,003字节（不含JS目录/对象开销）。270步raw/双RNG、20790 AI防御、195934tracker/per-mount RNG与baseline/rollback严格相同；128 planner边界通过；app tsc和两改动文件lint exit0。回滚VITE_COMBAT_FLEET_DEMAND_STORAGE=false。

无插桩ABBA整步 32.268 → 31.386ms，AI 11.859 → 11.433ms。逐轮整步：baseline 34.020 / candidate 33.048 / candidate 29.724 / baseline 30.516。两相邻对净差同向，但存在其它阶段/轮次漂移；不把所有差归因于本块、不把跨轮收益串加，不外推稳定60Hz。

原版0.98a-RC8 core/decompiled缺失；原版源码/实机/UI待核实。整体仍约31–33ms，**高ms没有根治**。证据：artifacts/combat-fleet-demand-storage-20261003/accepted-summary.json；artifacts/combat-fleet-demand-storage-20261003/timing-result.json。
