# 当前目标先精算：单独候选拒绝

- 一次app tsc、改动文件lint通过。既有270步全部原始快照/双RNG、AI/defense、autofire tracker/per-mount RNG一致；之后boundary harness invalidQuery错误期待被定向修正，无生产缺陷，未重跑整套。11项定向边界通过，详见boundaries-result.json。
- 150warm/120timed ABBA：整步 35.234 → 35.498 ms，AI 12.235 → 12.258 ms；漂移明显，未证明收益。
- 查询64572 → 58529，候选721826 → 397763，少生成324063候选。但减少44.895%候选并不等于整步加速；不得作为根治。
- 生产单文件本轮修改逐字节撤回，rollback-source-check.json可核实；拒绝源码和bundle留证。原版源码/实机/UI仍待核实。
- 下一块直接求最近合法目标，不再物化/排序预瞄全候选；这是新的算法，不是重复顺序修正测速。
