# 市场稳定度/殖民地本地经济原版先行审计（2026-09-20）

基线：本机已安装原版，与 reference-industry-commodities.json 同一版本。用户在用电脑：只后台源码/文件/隐藏Java CLI，无桌面操作、子代理、发布。

## 编码前最小对照

- `decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/Market.java:313–320,589–600,1101–1107`：先管理员刷新（本轮仅接受已刷新的外部stat），逐产业unapply/apply，最后hazard upkeep；稳定度getter先clamp0..10再Math.round。conditions按名单逐个unapply再按survey/suppression决定apply。
- `decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/PopulationAndInfrastructure.java:64–100,132,152,189–215,286–395,499–538`：基础5，生活/奢侈品满足各+1（奢侈品要求size>3），食物/非宜居有机物最大缺口扣分，改善+1；收入使用**prevStability**而非刚算稳定度；自己管理殖民地数与人物上限决定正负管理增益；在建/排队工业计入超限。贸易维护费折扣用**此前缓存的maxDemand/maxSupply及当前可用量/运输/同势力出口**，不是本轮最终产业聚合。
- `BaseIndustry.java:720–742,1481–1510`：需求用截断int，不是市场聚合Math.round；最大缺口取严格大于，保持先出现的并列项；具名modifier顺序保留。
- **关键阶段差异**：`OrbitalStation.java:53–69`在重新写需求之前调用稳定度奖励，故首次站点/升级/核心改变可能读**旧需求**；`GroundDefenses.java:26–44`和`MilitaryBase.java:54–153`在需求之后读取。不得用最终commodity快照统一替代。
- `MilitaryBase.java:194–224`巡逻+1/军事与高级指挥部+2，受补给/燃料/舰船缺口削减；`GroundDefenses.java:91–98`+1，补给/陆战队/武器；`OrbitalStation.java:461–477`按标签+1/+2/+3，补给/船员。非功能状态去掉奖励。
- `FreeMarket.java:65–83,115–126`按真实daysActive算1..3稳定度惩罚，无港口的tooltip提示不能当成apply的条件。
- `CommRelayCondition.java:49–80`：当前relay列表按同势力、非objectiveNonFunctional选最优，正规优于临时；condition存在但无可用relay并不触发人口无relay惩罚（人口只检查condition存在）。advance的存活/位置清理另属生命周期。
- `RecentUnrest.java:50–57`使用捕获的penalty，移除全部同id通道。`DecivilizedSubpop.java:16–29`-2，副作用移民/hazard另算。
- `Misc.java:3706–3708,4387–4410`工业计数包含structure升级到industry、建设队列；玩家管理数必须来自完整实际经济名单，不共享不同玩家的治理额度。

## 现状差异与实施

已有commodity/local accessibility/network计算内核，但缺少稳定度与收入/维护费因子。新增可替换纯本地组合层：复用已验证commodity pass，保留产业前后阶段供稳定度读取；计算已核实条件、人口、军事设施、治理与财务因子。保留外部管理员/事件modifier，拒绝未知插件/特殊物品，不推算未捕获状态。

仅计算相应本地效果，不宣称管理员技能刷新、完整reapply、收入结算、经济任务执行或市场可以交易。原版单玩家治理函数不决定联机归属规则。原版UI截图及实际操作尚缺本轮相关状态；本轮不改任何界面。

## 验证方案

来源哈希/数据导入检查；专项边界及阶段回归；抽取原版Java方法/代码块、真实MutableStat/StatBonus的隐藏CLI差分，连续重复reapply对比具名modifier和float输出；再跑全campaign回归、严格类型和专项lint。方法级探针不冒充完整游戏实机验证。

### 编码后核验补充

- 空间站改善额外写共享 `orbital_station_improve` +1，补给不足不扣除此改善奖励，但不运行会由unapply删除；源码 `OrbitalStation.java:515–520`。人口/站点改善由BaseIndustry.unapply先清除，再按本轮状态重加。
- `CommodityOnMarket.java:384–393` 的maxSupply/maxDemand只是缓存getter，证明维护费折扣不可替换成新产业聚合值。
- 原版稳定度modifier使用 `_ind_population_3_ms` 等下划线开头的key。旧economy stat校验误用实体ID限制，已只对native stat modifier允许此格式；世界实体ID规则和原型污染保留字限制不变。
- 本轮将已检查的CommRelayCondition、RecentUnrest、DecivilizedSubpop登记为“无直接commodity写入”；不是说它们没有稳定度/生命周期/移民/hazard效果。旧commodity catalogue从32变35条条件、17变20个来源哈希，本轮稳定度reference额外固定27个来源。
- Java探针执行原版人口静态方法、需求缺口/军事奖励、人口与军用设施apply相关代码块、通讯中继方法、condition稳定度写入、Misc工业计数/治理，以及完整MutableStat/StatBonus。需求实际写入值来自另有原版差分覆盖的commodity pass，探针只选择原版真实读取阶段，不把此探针称为独立完整产业仿真。其余副作用为桩。

### 编排额外注意：惰性商品网络

`CommodityOnMarket.java:getCommodityMarketData` 在缓存为空时构造CommodityMarketData，而构造器会执行组core可达性等工作。本层marketCommodities中的运输/出口数值必须来自**各原版实际读取点**，不能只在“整轮开始”凭旧accessibility批量计算或以缺缓存默认0。完整执行器还须保留这类惰性初始化的副作用；本层只消费已解析读取值，不模拟它。
