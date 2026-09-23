# 同需求类月末库存/价格：原版先行审计（2026-09-20）

本机 Starsector 0.98a-RC8，仅后台源码/隐藏Java。无界面修改；原版市场窗口/交易后库存实机与Web画面对照待用户许可，未用截图推断经济时序。

## 原版证据 → 应有行为

- MainWorkTask2.java:129–276 updateStockpileAndPrice/V2：使用调用规格ID与市场ID、月份初始化java.util.Random；拿该规格demandClass的**当前有序实例列表**，不是只处理调用商品。主商品及lobster都在经济任务名单，因此同类会按任务顺序反复写入，最后不是主商品种子。
- 第一轮仅找到首个primary，读取当前CommodityIconCounts/maxDemand/maxSupply，更新共享MarketDemand.demand、该商品greed和无需求玩家倍率，消耗第一次random。第二轮所有非primary继承该greed核心量及no-demand倍率，但不各写一份需求。
- 第三轮仅primary按当时available、maxSupply及其缓存网络maxExportGlobal重建stockpile，消耗第二次random；变体的stockpile原样保留。
- 第四轮所有类成员updateCalc，然后按自己的icons、econUnit、stockpile、tradeMod设置高/低阈值。无primary或空类列表也有定义：共享需求不变、无随机消耗、变体greed核心写0/移除no-demand multiplier（不是猜测补主商品）。
- CommodityOnMarket.updateCalc使用MarketDemand.getBaseCommodity，因此lobster的calculator基价/variability取luxury_goods（V3），不取lobster自己的V4。
- Market.getCommoditiesWithClass:792返回类列表（没有则新空列表）；MarketDemand.java保持一个共享需求MutableStat；CommodityOnMarket.getModValueForQuantity从当前available.getModifiedValue减去eMod的flat值（原版float减法），不是移除修改器后重算stat。价格阶段不重跑产业maxima或擅自把变体需求清零。
- MutableStat.modifyFlat与StatBonus.modifyMult：不存在的中性修改不插入；已存在core写0仍保留条目/顺序。

这些来源已在reference-market-economy.json/reference-market.json锁定；本轮新增模块复用来源数据与通用float/stat工具，不新增无来源常量。

## 当前差异与方案

旧OriginalMarketEconomyPass只覆盖主资源单行，并同时重算网络和产业输入，不能用于需求类成员的当前缓存阶段。新增有序类级纯规则：共享需求一份，逐成员保留库存、greed、玩家modifier；输入必须声明完整类成员、真实最终available/不含eMod值、网络出口与shipping。保留旧单行接口的严格边界，不通过解除一个校验来假装支持变体。

## 验证

提取原版完整updateStockpileAndPriceV2/getStockpileQuantity、实际CommodityIconCounts、MutableStat/StatBonus及updateCalc，隐藏Java做多成员、多调用连续历史的差分；引擎周边只提供捕获快照getter，不以复制JS计算当oracle。测试主/非主缺失、空列表、类成员顺序、继承需求未清零/已清零、贸易余量、无需求开关、缓存出口和不同触发种子。接现有四任务测试运行完整月末回调；仍不能声称正式sector运行时、月账、可交易库存发布或完整生涯已完成。

本轮原版差分执行120条四步连续历史，加19个经济商品触发调用，共499份状态；对比共享需求及modifier顺序、库存、greed、玩家modifier和完整calculator字段。原版周边网络/getAvailable/运输容量以捕获getter桩提供，因此不验证实际getter的上游产业/网络生成或副作用。
