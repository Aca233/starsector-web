# Exact threat facts候选（拒绝）

270步baseline/candidate/rollback raw、双RNG、20790 AI防御与195934 tracker/per-mount RNG严格一致；58边界通过，包括NaN/Infinity、127/128/180 facing、注册identity及plan/effects未知callback在世界变化后得到原输入snapshot。20520次观察只构建58136 imminent对象，860149 far行保留紧凑数值snapshot；未知full按原序号显式物化，不重读world。app tsc/lint通过。

无插桩ABBA整步38.591→38.416ms，AI14.275→14.377ms。逐轮40.136/39.687/37.144/37.046；AI两个相邻对均回归。没有稳定有效收益、没有砍半。全部本块6生产文件已逐字节恢复；候选及证据保留在artifacts/combat-halving-20261004。

这否定“只减少far对象输出即可明显解决高ms”，不否定底层重复数学/准备/兼容层。需要改变输入生产和执行生命周期，不能保留无效优化来堆复杂度。原版0.98a-RC8来源缺失、原版/实机待核实；无桌面/生涯/发布。
