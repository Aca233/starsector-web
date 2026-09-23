# 真实存档产业产出链（2026-09-21，编码前对照）

原版0.98a-RC8。仅后台数据/计算连接，不改UI；既有市场UI审计中的截图边界不变，未进行原版/Web视觉对照。不操作桌面、不用子代理、不提交发布。

## 原版证据 → 预期行为 → 现有缺口

- CoreLifecyclePluginImpl.econPostSaveRestore:956–965：全世界产业storage先完成，然后每个市场条件→产业；Market.reapplyIndustries:313先刷新管理员GOVERNED_OUTPOST技能，再按原产业列表逐个unapply/apply。不能先调用上一轮条件结果，再让组合pass重复执行条件。
- HeavyIndustry.apply:53–57读取getPrevStability而非刚计算的新稳定性，写production_quality_mod；FuelProduction:16读取管理员fuel_supply_bonus；TechMining:255/296写tech_mining_mult。DynamicStats.getStat:26缺失时base1，getMod:35缺失时空StatBonus。须捕获真实旧值/渠道后由原版默认补建，不能全设base0。
- FactionManager.getFaction从已保存注册表取对象，Faction.readResolve:308仅当illegal为null才回到spec默认。已保存illegal（即使空集合）必须保留，不可用静态势力表覆盖运行中政策。
- Faction.isIllegal:675包含commodity.demandClass；Market.isIllegal:1142先判自由港。发现现有组合pass只检查物品自身ID，会漏掉龙虾继承奢侈品违禁属性；本轮修正，并保留原产业自身合法性覆写。
- CommodityOnMarket构造:49–56：缺失零行缓存max0、合法性true；getAvailable:261读取当前MutableStat并Math.round后clamp0。updateMaxSupplyAndDemand:404独立更新最大供需缓存，不在Market.reapplyIndustries里执行。产出计算结果不能在离线恢复阶段提前覆盖保存的maxSupply/maxDemand，更不能据此凭空构造零售库存。

## 实施与必要验证

扩展现有capture，读取每市场prevStability、production_quality_mod、tech_mining_mult及实际所属Faction的illegal集合/对象身份。缺字段保持明确pending；当前真实存档所有势力均有保存illegal，未覆盖的spec回退不伪造。

离线产业入口复用prepareNativeConditionPhase原始输入与已有条件→技能→产业组合核，逐市场只运行一次；条件结束的旧移民对象/计时附件继续保留。结果区分产业状态、条件/技能结束状态及“下一经济阶段可采用的候选最大供需”，不认证网络/价格/库存就绪。技能/产业其它副作用（金融/舰队/监听器/污染/子市场等）没有随商品核自动完成，必须明确保留待接清单。

只扩充既有存档/产业组合检查中的少量集成断言，类型与定向lint；真实存档只读回放，输出仅写忽略artifacts并核对源哈希。原版引擎实机加载对照仍待许可，不能以本地数据链替代。

## 已实现与实际结果

- 新industry-inputs捕获接入现有extract/capture入口；真实Faction registry对象、保存illegal（不是静态定义重填）、prevStability、质量StatBonus和技术开采MutableStat均提供给原计算核。补充Faction/FactionManager/DynamicStats来源指纹。重复共享势力对象在不同市场出现矛盾政策会拒绝。
- 新prepareNativeIndustryCommodityPass/restoreNativeIndustryCommodityDrafts复用全世界storage和上一轮原始condition输入，不先运行条件结果再重复应用。原组合核按市场执行条件→真实治理技能→原有顺序的产业商品回调；可供后续经济运行器直接采用。所需available键由领域模块公开一个共同函数，适配层不复制产业依赖表。
- 修复OriginalIndustryCommodityPass的商品类别违禁继承：龙虾继承luxury_goods；自由港豁免及产业自身合法性覆写仍保留。未接进权威市场发布的低层核修正，不迁移已保存规则锁。
- 回调/计时附件提为共享函数，条件结束与产业结束分开。旧永久插件对象没有因同modId而与新对象合并。财务/移民注册/监听器/污染/巡逻队等未随commodity pass自动完成，不以商品阶段结果冒充整个industry lifecycle。
- 实际私有存档65市场、346产业全部走通；条件遍历305/应用304，28旧回调身份保留。870条原保存的maxSupply缓存未被候选结果覆盖；1235条经济商品最大供需作为nextCommodityMaxima独立返回。非经济物品明确列为deferred，不把它们当零售库存。源campaign/descriptor哈希一致，readyForAuthority=false。
- 复用已有native-save与condition-phase套件（共24项），新增仅2条链式场景：真实政策/技能/装置/旧稳定性/动态渠道/商品继承/自由港/旧缓存隔离，及缺失与共享对象冲突。原有条件差分照常复用，没有新测试项目或oracle。campaign严格类型与12文件lint通过。真实回放最初临时命令的内联换行编码失败，去掉该输出换行后exit0完成；日志留存。
- 输出artifacts/native-save-industry-restore-draft.json及report均经git check-ignore确认不入库。无用户存档写入、桌面/可见浏览器/游戏操作、子代理、暂存、提交、推送或发布。其它任务的网络/桌面文件改动原样保留。

## 下一段接口与边界

应在此真实输入上接同一市场的稳定性/财务和全世界网络调度，而非再建立测试专用产业模型。prepareNativeIndustryCommodityPass返回的原始输入可供组合财务核直接消费，确保只有一次条件阶段；不得拿已执行的effects再当初始状态重跑。候选maxima只能在相应经济任务发生时写入缓存。现有Corvus经济/地形门禁不变，尚不能宣称真实市场已可交易或完整生涯可玩。
