# 单舰瞄准阶段武器属性读取诊断（实施前，2026-09-27）

## 目的与排除
上一轮group-threat-bounds完整模拟两组慢4.67%/1.71%，已撤回。本轮读取当前源码及历史后确认：逐getter标量组合、每aim准备复用、单舰候选索引/资格租约都已有失败证据，不原样重跑。
当前两类武器属性getter（rangePercent/projectileSpeedPercent）每次构造完整系统/辅助/父舰修饰对象。这里考察不同粒度：ShipWeaponControlSystem中修复/故障已完成、发射尚未开始的整段瞄准循环，是否能为所有挂点共享六个数字（三武器类型×射程/弹速）。这是跨挂点而非此前每aim的prepare复用，尚未实现生产候选。

## 来源与边界
本机0.98a-RC8 combat/ai/private.java:249–265逐次读取range和projectile speed再拦截/射界；API MutableShipStatsAPI的武器分类独立stat只证明接口含义。Web GlorianaEdict.ts:29–52 moduleModifiers读取父舰生命周期、锁定侧、模块HP/退场/排散/过载/武器禁用、BALLISTIC ammo/isDisabled；瞄准循环不消耗弹药或幅能，但会改变triggerHeld、aimIdleSeconds、currentAngleRad、autofire tracker/fireControl及故障挂点burst/firing状态，不能未经审计推导所有纯读modifier都稳定。
EclipseProtocol的修饰读取当前flux；HyperionJump被动读取冷却/在线状态；AdunSolarForge按effectLevel产生ENERGY弹速加成。命中未知定义/访问器/runtime/自定义瞄准或火控反馈回调时仍必须回到原读取，不能仅因为两次采样相同就授予权限。本轮不改UI，无原版实机验证。

## 本轮唯一诊断，不是性能验收
先冻结当前非campaign源码。只在测试bundle内部插入观测：真实aim try/finally边界begin/end、原有root ShipSystem.modifiers返回值和两个getter入口。不额外调用modifiers、不改变调用次序/参数/返回值。记录每段三类型射程/弹速六个最终数值（保留NaN/Infinity/-0的Object.is比较）、原合成次数、是否变化及变化时的原getter上下文。
同源无插桩参考与插桩副本：自然270步（150热身+120诊断窗口）+既有60步技能/靠近开火/排散/低HP隔舱场景；完整authority+隐藏fire-control/RNG逐步或终点一致。176实体734挂点、2玩家+20AI三舰、seed917/3200DP、四已有实验两边同开。没有ABBA、profile、浏览器、速度/Hz/P95结论。生产代码不写；冻结之外并发修改记录保留。
诊断只能显示观察到的稳定性和重复读取，不能替代全定义读写域证明，也不是实际提速。若数据支持，再单独预登记完整新候选及验收，避免未证实边界就添加跨挂点缓存。

诊断已完成且状态对照通过，无生产改动。warm两getter1258370次/20808段，未观察到段内六值变化；仅说明观测范围稳定和潜在工作量，不能当性能或任意读者许可。下一实现边界见同前缀result。API实际来源为decompiled/starfarer_api_source/com/fs/starfarer/api/combat/{MutableStat,MutableShipStatsAPI}.java。
