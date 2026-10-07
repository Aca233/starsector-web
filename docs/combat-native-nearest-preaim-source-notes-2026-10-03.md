# 原生预瞄直接最近合法目标查询

## 最小对照
- 原版目标0.98a-RC8；本机core/decompiled缺失，源码/实机/UI待核实。仅重写Web已有纯数值执行图，不改玩法/UI。
- 证据：上一块current-before-query丢弃44.895%候选但整步没有收益，已撤回。现有 tree.query 为预瞄输出所有保守候选、按source排序、复制Uint32Array，再 nearestNumericPreAim逐行求最近合法目标；预瞄并不需要整个列表。
- 预期：current仍先完整精算；失败后最近合法目标按coordinateLength选取，同距取source中先出现者；完整角色、拦截、range、arc、精确contact保留；1.5range、频率/RNG/规模/毫秒口径均不变。
- 差异/实现：已准入compiled native bound预瞄改成tree.nearest，在同一保守BVH遍历内直接精算并保留best；不得创建候选数组、sort或Uint32Array。用节点包围盒的保守距离下界裁掉不可能比best更近的子树，等距不能裁；用source order显式保留平局。current先精算失败后不从候选中删掉current。generic公开路径与scan仍旧query。
- 范围保守拒绝与旧query一致；距离裁剪采用L∞下界并给2e-6相对pad，防边界舍入；原始distance=Infinity时不裁。未知source/未准入/method override/关闭span保留既有fallback。回滚 VITE_COMBAT_NATIVE_NEAREST_PREAIM=false 恢复完整旧执行图。

## 验证
完成后一次app tsc/两文件lint，既有270步原始快照/双RNG/AI防御/tracker严格对照；复用边界且补子树边界/源顺序平局/大数/scope。集中逻辑后独占ABBA计时；没有净整步收益就只撤回本块，不修改其他任务文件。
