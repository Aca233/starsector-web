# 武器属性共享失败后的成本归因（2026-09-27）

## 结论与下一动作
上一goal turn属于progress：正确性及唯一ABBA完成，失败候选已撤回。本轮又取得了改变下一步选择的实际采样证据，而非重述优化意图。
失败候选的**读域资格审核联合桶约9.1372%**；其中requalifyGroup inclusive约8.6151%，hasOwnedWeaponStatReads inclusive约8.7747%。这些集合互相包含，不可相加。基底combineSystemModifiers self约4.0639%，全部原modifiers inclusive约6.4256%。候选确实减轻了原组合工作，但新检查本身是明显的主要额外成本。

因此不再次尝试同一种“每阶段/每家族重审再缓存stat值”的方案。不重开已否决开关，不复测择优，不用profile耗时推翻既有ABBA。下一实施前审计应改为：**私有Worker内仅对不可变结构做一次性准入，执行时仍实时求值的属性组合程序**，而不是跨时刻缓存六个数值。需要证明拓扑重建、父舰变化、runtime效果和未知回调回退边界；证明不成立就不能编码为默认路径。

## 运行与状态
- 开始前核对本轮回退的7旧文件SHA和新文件不存在；739模块当前源图与本轮before完全相同。
- 从上一轮唯一ABBA的bench-0/bench-1读取**原未插桩bundle**，不重新构建生产代码，不改开关或冻结基底。
- A/B各一次独立隐藏Node：150完整步热身，inspector对随后120完整步请求500微秒采样。没有阶段手工计时、没有新的速度验收、没有浏览器/桌面操作。
- A为5039样本，timeDeltas均值1054.14微秒；B为5478样本，均值1057.56微秒。请求的500微秒并非实际采样周期。
- 两臂270步完整authority+隐藏tracker/RNG均为`bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6`，初始176实体734挂点。两进程退出0。
- 结束后再次核对当前739模块，无漂移、无生产改动。失败候选仍只存在工件，未重装回src。

## 互斥成本桶
使用profile的sample/timeDeltas与实际调用树。优先划分资格审核，其后原组合、其它modifiers、其它prepare、其它aim/preAim、GC、其它；每个样本仅进入一桶。因此本表每列能相加为100%，但仍是各自采样运行的分布，**不是速度提升率或CPU占用率**。

|桶|A基底占比|B失败候选占比|
|---|---:|---:|
|读域资格审核|0%|9.1372%|
|原combineSystemModifiers|4.0639%|1.9660%|
|其它原modifiers|2.3617%|1.6249%|
|其它aim query准备|3.7196%|3.7771%|
|其它aim/preAim|17.1330%|15.5380%|
|GC|1.7508%|1.6460%|
|其它（含引擎其它工作及inspector自身）|70.9710%|66.3108%|

原modifiers inclusive A6.4256%、B3.5909%包含combine，不可再与combine占比相加。candidate hasOwnedWeaponStatReads调用栈深度为1的样本权重6.9250%、深度2为1.8497%，说明递归父链也进入了实际热点；这不是函数调用次数。原型总审核nativeFireControlPrototypes inclusive只有约0.0372%，不能笼统归咎于“所有反射”。
有限采样、内联/JIT及调度会影响归因；不把两份profile总耗时拿来计算收益，也不声称某一函数是唯一原因。GC仅约1.6–1.8%，本场景没有证据表明对象池是这段失败优化的第一优先级。

## 源码范围与后续准入要求
原版证据沿用并已在上一实现前核实：本机0.98a-RC8 combat/ai/private.java:249–265，MutableShipStatsAPI.java:196–198、MutableStat.java:345。没有改玩法或UI，也没有原版实机补验。
当前源码现场审计：
- ShipSystem.modifiers仍每次按own→auxiliary右递归→runtime→parent左序合成，getWeaponRangePercent/getProjectileSpeedPercent均走原实现。
- Ship构造时建立system/systems/defenseSystem和auxiliary链；Network显示层也有同名字段赋值，不能将显示DTO字段误认为authority拓扑的写点。后续实现仍必须检查restore/reinit及新实体边界，不能凭搜索结果就宣布永不变化。
- Registry的许可本来就是WeakSet；不能再增加同功能的注册资格缓存。前次scalar方案热getter4,018,150次全准入仍慢，也不能只提高命中率。
- 单人OwnedCombatSession已有一次性安装原生修饰读取设施，但它的allowlist与LAN私有host不是同一路径；不得擅自扩展为所有自定义system或声称LAN已经使用。
- 任何新编译路径只能保存不可变定义/结构信息，不缓存flux、effectLevel、ammo等权威数值；必须保持右递归/父舰合成顺序、undefined、NaN/Infinity/-0。未知定义、动态拓扑或可观察回调必须走原调用序列。
- 准入不能破坏既有FireControlQueryBatch的原生方法身份检查；若安装own getter会使原有batch失效，需要在编码前审计，而不能等性能失败才解释。
- 只有上述所有权/变更边界成立，才设计新的默认关闭候选、冻结新的当前基底并预登记端到端门槛；本轮没有把后续可行性当成已实现优化。

## 工件
`artifacts/lan-weapon-stat-cost-20260927/`：preflight.json、profile.mjs、arm-0/arm-1的原cpuprofile与result.json、cost-attribution.json、summarize.mjs、exits.json和日志。
A bundle SHA：`8f1db00539b9fd6517817022cd15f1f632e7d75d8d4be70297e650081d1c2816`。
B bundle SHA：`aace4862eb89df879d2a43845fdb82faf988280dc15e30f43ee8caed1a49e595`。
A profile SHA：`bfee6d931ae4be12ce78b071e345d9fddc5a677652147a4d314daa932cf4a2f8`。
B profile SHA：`ab50733b34f36c2ff59ecc2159fa08d0ff33dcecb607e6e6f33e1a736323e352`。
整体大规模模拟/联机延迟目标继续active；本轮没有新增生产提速、没有稳态Hz或输入P95改善证据。
