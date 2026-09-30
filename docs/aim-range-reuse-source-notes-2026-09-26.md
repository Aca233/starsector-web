# 正式火控复用既有范围索引：修改前对照（2026-09-26）

## 来源和定位
本机原版0.98a-RC8，本轮重新读decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:230–282：原版通过getAiGridShips的范围迭代器先取候选，再做阵营/可见性/角色/距离/预测/射界与指定目标判定；WeaponGroup.java:301–314区分advance目标与shouldFire发射。反编译类型异常不照搬。此次保留Web现有玩法，不新增原版实机/UI等价声明，不操作可见窗口。
现有Worker采样显示outsideAcquisition仍有成本；当前源码证据为AutofireController正式aim遍历targets全名单，而preAim已经使用保守PreAimRangeIndex。显示编码局部缓存/目录/标量实验已经否决，不复活它们。

## 预期行为与差异
只复用本次原生Worker只读事务内已经由preAim建立的索引；正式aim本身不新建、不触发预瞄查询阈值，不跨帧/跨舰缓存。仅当既有tracker或missile扫描已经求出prepared拦截参数，且整份名单有当前shooter/roster匹配的有效资格证明时启用。没有prepared时继续原全名单，绝不提前执行prepareAimQuery改变普通getter/回调的时序。
候选用实际aim射程/速度/延迟（不是预瞄1.5倍率）查询同一个保守索引，并恢复原序。原索引全名单半径上界、速度极值和padding能保留每个outsideAcquisition可能接受的目标；非有限、负值、溢出、密集窗口仍回全名单。首轮全部资格读取、当前tracker验证、missile先行、角色/精确拦截/碰撞/排序/RNG/decide均不变。关闭/名单长度改变后不得使用旧索引。
这是现有封闭Worker所有权约定内的算法复用，不是恶意同realm脚本沙箱。未知回调、普通可变引擎及复制/外来名单维持旧路径。不降低频率、精度、实体/字段或校验。

## 验证计划
保留现有preAim数学包含性、资格生命周期和全部AI场景；增加正式aim的热tracker/导弹已准备参数、冷扫描无额外求值、保序/指定目标/发射与tracker/RNG、无索引/关闭/名单变化/异常输入等对照。集中一次typecheck、改动lint和既有combat-ai。现有合同沿用上一轮冻结旧Controller（同类模块图）；性能基线是本轮开始、包含已保留资格名单优化的完整313模块，二者用途分开。
一次无插桩真实LocalWorkerHost固定串行200舰150预热+180测量，全部有效帧/显示/权威/隐藏状态比较。独立默认自动模式短激活/恢复审计只看真实路径计数和一致性，不当速度收益。有净收益才保留，不择优重跑；回退按本轮原始字节及hash，不覆盖其他工作。
