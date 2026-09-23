# 产业财务与商品市场份额：原版先行审计（2026-09-20）

基线为本机Starsector 0.98a-RC8，沿用既有来源哈希；用户使用电脑期间只做后台文件和隐藏CLI。不操作原版窗口，不修改尚缺视觉证据的UI。

## 编码前证据 → 行为 → 差异 → 验证

1. `decompiled/starfarer_obf/com/fs/starfarer/loading/specs/H.java:53–68`：industries.csv收入/维护费先float×creditsPerCostUnit，再float×各自industry倍率。不能把CSV的10当10星币，或漏乘维护倍率0.5。
2. `decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java:182–194,325–358,787–792,1339–1354`：收入/维护的规模倍率max(1,getSizeMult(size)-2)，spec×倍率先转int；具名ind_base/ind_stability/ind_hazard，Alpha/Beta维护×0.75、Gamma不减。非功能只移除基础收入，不免维护，也不清空外部收入修正。直接updateIncomeAndUpkeep默认市场规模，与apply override不同。
3. `MilitaryBase.java:54–62`巡逻总部apply使用固定规模3；`OrbitalStation.java:53–69`空间站/战斗站/星堡apply分别用3/5/7，与殖民地规模无关。其他已支持产业按市场规模。
4. `Spaceport.java:34–51,78–92`用**重新写需求后**燃料/补给/舰船最大缺口，每单位提高维护乘数0.1；unapply不清除此deficit修正，停工也保留。本轮不能只实现BaseIndustry却称港口财务完成。
5. `Market.java:313–320`逐产业unapply/apply后才更新hazard因子；Population.modifyStability先改变incomeMult/势力内部维护折扣，再进入super.apply。前于人口的产业、人口之后的产业、最终market三者读到的倍率可能不同。需要在既有稳定度组合层记录真实阶段读取，而非把最终倍率回填全部产业。
6. `CommodityMarketData.java:161–228,299–356,415–445`：生产权重=更新core前min(供给,可用量,全球运输)的sizeMult×core后max(0,accessibility)；需求金额用core后运输与maxDemand的min×原版exportValue×exportIncomeMult，转int。hidden不从权重或金额删除。
7. 市场份额LinkedHashMap按市场名单插入；按float百分比余数稳定排序，对正份额逐个分发剩余1%，不是直接四舍五入/按份额排序。export/consumer各自独立分配。排序的反编译Comparator方法名与局部Iterator误类型需最小修复，并以Java差分核验。
8. `CommodityMarketData.getMarketValue()`排除**factionId="player"**需求，不是排除所有playerOwned市场；需求份额的分母仍含全部市场。非法来源不获出口收入但不会从生产份额分母消失。出口收入=调整后share×市场价值×(当前收入倍率×实际玩家商品出口倍率)，最终转int。
9. `SpecStore.java:1025–1028`读取export value直接float，空值0；`loading/while.java:123–129`直接getter/setter。`CommodityOnMarket.java:113–118`无已缓存网络对象时出口收入getter为0，不触发初始化。
10. `Market.java:1259–1308`按产业/商品实际名单float顺序求和，净额另减实际短缺补偿/移民激励费用。汇总投影不等于每月向玩家账户结算。

## 范围与缺口

新增可替换产业财务内核、本地稳定度+财务组合、组网络+市场份额+出口收入组合及市场收支汇总。现有authority、rule-lock、存档及未完成蓝图状态不变。尚无完整hazard/技能刷新、短缺与移民费用来源、全世界经济任务执行；不能默认0补齐这些状态或签发市场新鲜证书。原版硬编码单玩家派系/技能不作为联机多玩家规则决定。

验证：数据导入复现，原版方法/排序代码块+真实MutableStat/StatBonus隐藏Java差分，阶段与缺货/非法/排序/float/零值专项，完整campaign回归和类型/lint。UI仍待原版实机证据，不以代码测试宣称UI等价。
