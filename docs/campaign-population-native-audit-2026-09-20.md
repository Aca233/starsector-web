# 人口推进与规模增长：原版先行审计（2026-09-20）

基线Starsector 0.98a-RC8。上一轮只有computeIncoming/激励来源，没有执行现有人口演化。本轮继续后台源码/隐藏Java方法验证，不操作桌面、不改UI；相关原版界面和消息点击状态仍待实机许可，不能冒称已验收。

## 来源 → 行为 → 当前缺口 → 验证

- `CoreImmigrationPluginImpl.advance:34–86`先记录incoming是否曾设置，computeIncoming一次（扣费也只一次），再setIncoming；UI-only此时返回，不初始化population，却会消耗“首次incoming”状态。非UI首次执行100次，迭代f为(100-i)*0.1，不按days放大100遍；以后只用days/30。原来完全未执行。用原版完整advance方法+真实PopulationComposition进行差分。
- `Market.getPopulation/wasIncomingSetBefore/getIncoming/setIncoming`：population null时按当前所属势力及规模weight惰性初始化；incoming null getter返回临时空对象，不等于已设置。持久状态必须区分null和空composition。
- 每轮先加incoming派系amount*f，然后按当前size计算min/max，newWeight=旧weight+incoming净weight*f；newGameAdvance或小于min强制min；只有严格大于max才扩张。负增长不会自动降级。normalize保留原MutableStat修正，setWeight只是core_set具名flat，不覆盖外部base/percent/mult。
- `advance`增长完成后，才按**新的稳定度**计算向市场势力的转化和海盗/穷人增加，再删除不存在势力并normalize。读取市场后的变化必须反映，不能只发“请增长”的事件而按旧状态算完。incoming在整个100次循环不重算；到size上限关闭激励不倒扣已计费用。
- `increaseMarketSize`实例方法：非玩家拥有/已达动态上限时，先把population设为当前规模权重并normalize，然后advance仍把newWeight写为上一轮的max。这条原版顺序不能“修正”为自创封顶算法。
- 静态increase方法：remove population_0..10，再remove当前population_size（原版重复调用）；add新population_size+1；setSize触发ListenerUtil.reportColonySizeChanged；reapplyConditions；reapplyIndustries（管理员技能刷新→有序各产业unapply/apply→全循环后hazard维护倍率）；再按可能已变的动态maxMarketSize关闭激励。UI通知在此后。完整世界监听器/技能尚未接齐，必须显式效果驱动，不能默默忽略。
- `Market.removeCondition/addCondition`、`MarketCondition.readResolve`、`Population.apply/unapply`：人口条件插件是空方法；add使用独立genUID组成modId，默认surveyed=true，不能复用被删除实例的身份。提供显式新condition身份给本地重算助手；其余条件/产业/金融状态不能重建为初始值。

## 实施边界

新增完整原版人口推进算法，规模增长通过同步、可替换的效果驱动执行；缺增长驱动却真的跨过阈值必须拒绝，不返回假完成结果。提供已支持条件/产业的本地增长重算助手，将真实来源的环境、供需/稳定度/产业财务、流通性串联，并把重算后的稳定度和动态上限返回人口循环。完整sector网络、管理员技能刷新和事件由驱动明确供给，助手范围保持local-only；不写Corvus库存或经济freshness。

验证分原版方法差分、增长效果顺序与停工/动态上限边界、本地模块组合、严格不可变/类型契约和全campaign回归。方法stub不等于原版实机或整个经济任务已运行。UI/殖民地面板/消息呈现本轮不改。
