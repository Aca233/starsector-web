# 条件—产业供需有序接入（实现前核对）

本机 Starsector 0.98a-RC8，仅后台源码核对；UI不修改，原版/Web同状态截图验收待用户许可。

## 原版证据 → 实现约束

- Market.reapplyConditions:1101–1107 逐条件 unapply 后即时检查勘探/抑制并 apply；新增条件与旧资源/环境条件必须共用同一轮条件顺序与统计草稿，不能先单独算新增条件再重放旧条件。
- ResourceDepositsCondition.apply/unapply:94–145、181–200：先 BaseHazardCondition；供给写产业现有 supplyBonus；food 且存在农业/水产时注册永久移民回调，即使产业不运作。unapply只删hazard/永久移民注册，不删已有供给。农业优先于水产。
- BaseIndustry.updateSupplyAndDemandModifiers 清理并重建 supplyBonus，再复制 supplyBonusFromOther。Farming.apply先super再需求/短缺，不重新写资源基础产出。因此太阳阵列/多数派本次只更改fromOther；资源条件仍可能使用上一次 supplyBonus，后续条件轮次才体现。不能人为预先刷新加成或循环至“稳定”。
- FreeMarket.apply/unapply除稳定度、流通性、瞬态移民外，还修改dynamic的officer_is_merc_prob flat=0.25。整条件接入必须保留这项，不能仅拼合旧UI数字。
- RecentUnrest.unapply和DecivilizedSubpop.unapply清除其稳定度所有通道；后者同时先执行hazard/移民逻辑。Population条件apply/unapply为空。
- CommRelayCondition.getBestRelay读取实际派系对象相等、nonfunctional及makeshift；无location/合格relay时apply调用unapply；使用共享core_comm_relay来源，不是条件modId。名单由advance管理，不能在此自动清理死/已移动对象。
- 太阳阵列/多数派/海盗/左径/航运等12种条件沿用上一轮原版方法对照实现，不重写已验证公式。

## 当前差异与接入计划

旧OriginalIndustryCommodityPass只执行资源commodity部分，其他条件被列为无直接commodity影响；不支持太阳阵列/多数派改变fromOther。补显式有序条件上下文，包含hazard/access/stability/officerMercProbability、永久/瞬态移民集合、实际市场available统计及每个有状态条件的上下文。重用同一个condition runner，完整重放当前已核实72种条件的本地apply/unapply，再把修改后的产业状态/fromOther传入既有industry pass。未提供新上下文的旧入口仍维持原有严格拒绝，不能把新增条件白名单扩成无条件忽略。

再次检查 CommodityOnMarket.getMaxSupply/getAvailable：前者直接返回缓存maxSupply，后者直接读取available stat并clamp/round；这两个getter本身不做网络重算。本阶段保留缓存maxSupply，后续产业读取航运条件修改后的available。其他市场网络初始化/刷新不在本次接入中，不能据此宣称完整经济网络已恢复。市场环境/稳定性/财务旧多pass组合层尚未共享此草稿，不能直接开启这些组合入口或交易发布。

## 验证方法

核对真实资源/农业方法与Native stats差分；验证太阳阵列及多数派fromOther传到industry supplyBonus，但本次资源supply保留上轮加成，下一轮才更新。覆盖solar/hot先后、自由港dynamic、注册顺序、压制后遗留资源产量、额外/缺失上下文、输入不可变；原有commodity/pass测试应保持通过。
