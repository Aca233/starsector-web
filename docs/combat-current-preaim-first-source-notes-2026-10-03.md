# 原生预瞄：当前目标先精算，再按需生成候选

## 证据和边界
- 原版目标 0.98a-RC8；本轮再次检查 C:/starsector-core、C:/decompiled，均缺失。原版源码/实机/UI待核实。本块仅优化既有 Web 数值路径，不宣称原版等价；不改 UI，无桌面操作。
- Web 证据：NumericAcquisitionFrame.bindQueries.preAim 约218–223行在调用 nearestNumericPreAim 前通过参数求值生成整棵树候选；WeaponAcquisitionKernel.nearestNumericPreAim 约141行却先精确测试 current，命中后直接返回。
- 既有 seed917、standard、2玩家20AI、734挂点的150warm120普查：6043次current精确命中，已生成的324063候选丢弃，占总候选44.895%。计数为工作量，不等于可省毫秒。

## 最小对照
- 预期：current仍须通过范围、角色、射界、拦截与接触精算，命中仍优先于其它舰；失败仍使用原候选顺序、距离平局规则及资格门禁。
- 当前差异：已经可直接返回的原生current仍预先生成候选。
- 实现：仅 compiled native boundQueries 顺序改为先 acquireNumericShip；失败再 query，并把nearest的current参数置undefined，避免重复先测。候选本身仍保留current原位置，不改变fallback精算顺序。公开generic preAim不重排；未知world/回调/API仍保留原门禁。
- 回滚：VITE_COMBAT_CURRENT_PREAIM_FIRST=false，旧求值顺序完全保留。
- 不改dt、调度、1.5range、实体挂点规模、随机数、ms口径；不缓存跨stage可变输入。

## 验证方法
一次app tsc与改动文件lint；复用既有270步完整原始快照、双RNG、AI/defense memory与autofire tracker/per-mount RNG对照；本块定向验证current失效/不合格/超scope/平局、generic、关闭span和方法替换。独占后台150warm120timed ABBA，含准备成本与整步，计时不与代理重型作业并行。若整步收益不足或回归，仅撤回本块自身修改。
