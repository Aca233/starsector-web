# 原版产业读档存储重建：实现前核对（2026-09-20）

版本：本机0.98a-RC8。后台文件工作；不启动窗口/游戏，不使用子代理，不发布生涯内容。

## 证据与原版步骤

- BaseIndustry.java::doPreSaveCleanup 只将 supply/demand/income/upkeep 置null。
- BaseIndustry::readResolve 读取产业spec、buildTime<1时设1、生成 ind_ID 和10个索引modId；demandReduction/supplyBonus为空时创建 MutableStat(0)；存在的 supply 逐条移除 ind_sb flat，demand逐条移除 ind_dr flat。其它channels/修正不动。
- BaseIndustry::doPostSaveRestore 无条件新建两个LinkedHashMap及两个MutableStat(0)。不是保留/累加保存前收支；也不清空 supplyBonus/demandReduction，不重新执行物品/管理员效果。
- 已核对15个当前产业Java类：没有doPostSaveRestore覆盖；只有OrbitalStation覆盖readResolve，内容仅super.readResolve然后return this。TradeCenter源类的保存别名为TradeCenter2，不与旧市场条件混淆。
- CoreLifecyclePluginImpl.java:956–965::econPostSaveRestore：先在首次marketsCopy中初始化所有产业，再重新获取marketsCopy逐市场 reapplyConditions→reapplyIndustries。不能一初始化某个市场就立即计算它，跨市场getter会读到其它市场null产业状态。
- Market.java::reapplyIndustries 先 refreshGovernedOutpostEffects，再按原顺序逐产业unapply/apply，末尾更新hazard upkeep。管理员、监听器、网络状态未恢复时不能把初始化空容器当成已可用供需/价格。
- BaseIndustry::isImproved 明确null/false返回false；wasDisrupted不是当前isDisrupted，当前值来自market memory中 $core_disrupted_ClassName 的Boolean。不能用wasDisrupted代替当前getter。

## 当前差异与本次实施

真实65市场/346产业保存态的4类storage全被清理。已有新产业构造器会把supplyBonus/demandReduction也归零，不能直接拿它们代替原版读档恢复，因为首次资源条件可读取旧supplyBonus。

新增独立原版storage恢复函数：消费明确的序列化字段，保留持久化bonus，执行readResolve及postSave的已核实存储行为，给出可供现有规则核函数使用的industry state/finance storage。输出只证明存储已初始化，不运行条件、产业、管理员、网络或库存。

新增只读capture适配器：对实际完整市场/产业顺序一次性准备所有storage，并保持objectRef与来源哈希。没有decoded serialized storage时只接收明确省略的4个字段；未知class/插件、缺失roster、畸形stats要拒绝，不能悄悄跳过。返回readyForAuthority=false及尚待执行的市场重应用阶段，不修改源capture和原版存档。

## 验证与非目标

抽取真实BaseIndustry readResolve/doPostSaveRestore和完整MutableStat/StatBonus到小型Java探针；对比null/已有容器、旧flat/percent/mult及bonus、buildTime边界。检查旧供需在readResolve阶段的精确清除，再检查postSave真正置空及收入/维护零storage。用实际私有capture准备346产业（只报告汇总，不把存档放入源码/夹具）。

本次不是完整econPostSaveRestore，不声称产业真实供需/收支为零，不发布市场、库存/价格、authority freshness。原版UI/实机以及Web交互仍未验收。
