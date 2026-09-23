# 共享条件状态接入稳定度/财务（实现前）

原版版本0.98a-RC8；本轮不改UI、不启动原版/浏览器。原版画面、交互和Web同状态验证仍待许可。

## 原版证据 → 所需行为

- Market.reapplyConditions:1101–1107 与 reapplyIndustries:313–320：条件逐一unapply/apply一次，然后逐产业unapply/apply；最后PopulationAndInfrastructure.modifyUpkeepByHazardRating更新市场upkeep_hazard_mod。不能先把危险度的最终倍率写入，再给前面的产业计算维护。
- PopulationAndInfrastructure.modifyStability：使用prevStability决定incomeMult；读取缓存maxDemand/maxSupply、当前getAvailable、网络shipping/maxExport算同派系供应维护折扣。ShippingDisruption.apply先于产业移除available中的部分sh_loss，所以这次折扣与后续产业缺货都须用恢复后的available，不能继续用预条件scalar。
- BaseIndustry.apply(boolean):先updateSupplyAndDemandModifiers，再updateIncomeAndUpkeep，再AI/改善/瞬态移民注册/物品效果。TradeCenter的本体/改善收入倍率晚于自身财务读取，后续产业才能读到它；保持现有原版探针验证的逐产业读取点。
- 条件phase已经检查72种绑定和上下文，若稳定性/环境wrapper再次执行旧conditionEffects/reapplyColonyEnvironment，solar/hot先后得到的非稳态结果会被错误覆盖，移民注册顺序也可能改变。本轮必须复用第一次phase结果，不做第二次条件回放。
- 原版BaseIndustry.addTransientImmigrationModifier在各产业apply中，港口/贸易中心失效会再unapply注销；农业/采矿清supply不注销，TechMining失效仍注册。已有环境探针覆盖此行为，需将产业注册部分独立复用而非重跑环境条件。

## 当前差异 → 方案

上轮用显式保护禁止旧财务组合吞掉conditionPhase。本轮在同一套已核实本地统计/财务范围内真正接入，然后删除该临时保护：

1. 新模式下input.stability/input.hazard仍是预条件捕获，须与phase起始stat完全一致；旧conditionStateByModId只保存free-market/unrest/relay，其值须与完整phase上下文一致。缺失/冲突不猜默认。
2. 用唯一一次conditionPhase输出的stability/hazard以及后条件available运行产业稳定度/维护折扣，缓存maxSupply、maxDemand和网络值不自行刷新。输出显式记录财务所用的后条件commodity rows。
3. 港口财务短缺也读同一份后条件rows；按每个产业当时倍率计算，不使用最终市场倍率替代。
4. EnvironmentalFinancial共享分支核对hazard/移民双重捕获，跳过旧环境condition重放；直接用条件phase结果，再按产业顺序重放原版注册回调。未带conditionPhase的旧行为保持不变。

## 验证范围

同一输入比较完整共享入口与原版Java条件→稳定度→单产业财务方法块探针；供需阶段使用既有原版方法对照核并保留前后需求读取。覆盖太阳阵列/hot只执行一次、航运恢复改变稳定度与内部维护折扣/港口短缺、贸易中心前后收入倍率、危险度末尾更新、重复轮次、捕获冲突与不可变结果。

仍不是完整sector/网络/月结/产业所有dynamic战斗属性与生命周期。conditionPhase返回值保持明确的“条件结束快照”，不能被当作所有产业结束后的世界存档；最终stability/财务/环境注册分别在对应输出里。
