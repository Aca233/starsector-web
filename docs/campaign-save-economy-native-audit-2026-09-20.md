# 原版存档经济输入与恢复边界（2026-09-20）

用户使用电脑，只做本机只读文件工作，不启动游戏/窗口、不用子代理。原版与Web UI验收不在本轮，仍待许可。

## 证据 → 不能忽略的恢复顺序

- CampaignGameManager.java:2139–2224配置MStat/SBonus/MarketDemand/COMkt等别名；z与ref是全文件对象身份，不能把嵌套的第一个market/economy当作根世界实例，不能将共享需求复制成每商品独立对象。
- 根CampaignEngine.economy → Economy.econ → ReachEconomy.markets才是已注册市场名单（Economy.getMarkets/getMarketsCopy）。星球条件市场、被引用旧市场及其他对象不自动加入经济。
- CoreLifecyclePluginImpl.java:947–964 econPreSaveCleanup/econPostSaveRestore，BaseIndustry.java:795–807：保存前产业supply/demand/income/upkeep明确置null；恢复时创建空Map/MutableStat，随后重放条件和产业。存档缺少这些字段不代表真实产出/收入等于0。
- CommodityOnMarket.java:43–59的商品规格、价格calculator、CommodityMarketData是transient；readResolve只恢复规格/calculator，不能从文件声称已获得完整网络缓存或最终阈值。
- MutableStat.readResolve设置needsRecompute=true；保存的modified可能过期。保留base与有序modifier，按Java float解析短十进制，不把缓存值当唯一数值来源。临时modifier计时器必须保留，不能静默删除。
- MarketCondition.readResolve：modId=id+'_'+unique；保存的条件顺序、surveyed、suppressed集合都需要保留。产业字段别名另见CoreLifecyclePluginImpl.java:1936–1948。

## 实际检查与差异

本机一个0.98a-RC8、无启用mod、未压缩存档具有65个注册市场；真实产业除当前支持的资源/公共设施外，还包括lightindustry/refining/orbitalworks/fuelprod/lionsguard/cryosanctum/techmining/commerce等。仅用Corvus三个市场测试不能认证整个经济组。

本轮新增只读数据适配器，提取完整注册顺序、共享需求身份、商品持久化stat/库存/贸易、产业配置与缺失的重建字段，并报告缺口。不实例化存档中的Java类，不执行标签/JSON/描述中的任何内容；不写原版存档，不把结果放入源码/发布包，只允许显式输出到被Git忽略的artifacts目录。拒绝DTD/实体扩展、损坏引用、重复对象身份、非法float与不匹配版本。私有存档路径和角色/舰队等无关信息不进入公开报告。

验证包含恶意/损坏XML、前向/循环引用、共享需求、多市场注册顺序、float恢复、临时modifier与省略字段语义；实际存档只读生成本地capture，再核对源SHA-256未变化。完整原版加载、产业恢复、月结、权威世界与UI仍不可由capture冒充。
