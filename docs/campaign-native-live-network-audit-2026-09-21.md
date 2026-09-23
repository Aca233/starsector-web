# 真实离线经济共享状态与懒商品网络（2026-09-21）

原版0.98a-RC8。上一轮真实产业商品投影有进展，但不足以直接接成完整财务加载。本轮先解决核查发现的实际依赖，不用假网络数字绕过。只做后台文件/短串行检查；UI未改、视觉未验证、用户存档不写、不提交发布。

## 原版证据与修正

- PopulationAndInfrastructure.modifyStability:326–345遍历当前商品；先读取旧d=maxDemand，再调用com.getCommodityMarketData，之后重新读取供给/可用量/运输/出口。该调用不是无副作用的只读getter。
- CommodityOnMarket.getCommodityMarketData:86在引用空时new CommodityMarketData；constructor:138起对整个econGroup更新各市场的最大供需、绑定缓存对象、改流通性、可用量及eMod；主商品也会改同类变体需求。完整加载可在产业回调途中发生这个构造，而不一定等调度器下一步。前两轮候选maxima隔离是合理的“商品回调投影”边界，但不能被视作完整加载会保留所有旧缓存。
- FactionManager.getRelation:57、Faction.isHostileTo:1585、RepLevel.getLevelFor:119/getRepInt:154：真实保存的Relation对象优先，缺失关系才按原版中立默认创建；敌对等级使用float×100后的整数舍入，不用简单关系值<=-0.5替代。
- Market.getLocationInHyperspace:1202、BaseCampaignEntity:961、BaseLocation.isHyperspace:1140：有实体时读取其星系在超空间的位置，非市场自身备用location；超空间身份按root.hyperspace对象判断。需保存实际坐标来源。
- CommodityMarketData.getExportIncome:426使用当前incomeMult；玩家每商品动态stat键为commodity_export_credits_mult+id，DynamicStats.getValue缺失默认1。网络未初始化时CommodityOnMarket.getExportIncome为0，不应仅为读取收入提前建网。
- available的core_local/core_base/core_shortage/core_lowaccess和eMod更新保留其它来源及临时计时；本机存档870条available均为base0无percent/mult。现有网络核只覆盖这种输入；未知乘算输入明确拒绝，不静默丢失。

## 实施

捕获真实超空间位置、关系/敌对矩阵、玩家商品出口stat。以全产业storage后的同一可变离线草稿实例接OriginalCommodityNetworkCache的capture/apply接口；每次懒get依据当时产业状态构造整组网络，而非重复使用上轮独立投影。保留引用寿命、主商品→变体传播、current收入getter、不自动按版本失效。失败草稿不得继续使用或发布。

本入口是后续财务/产业有序调度器的实际共享状态，不宣称已经执行全部加载回调。仍readyForAuthority=false；复用既有cache/存档套件，不建立新oracle项目。真实存档回放仅写忽略artifacts，核对源哈希。

## 本轮继续：人口财政回调接真实共享 getter

先核对 PopulationAndInfrastructure.java:326–398、BaseIndustry.java:182–200/325–358、Person.java:156–158、Market.java:337–348/433–435。modifyStability 先写收入倍率和基础稳定度，逐项读旧需求，再懒构造网络并读取更新后的供给/运输；零需求不得建网，零总需求不得抹掉已有内部贸易维护倍率。无玩家自管市场时不得提前读取玩家管理上限。CharacterStats.readResolve:435–437 会重建 outpostNumber，故保存的 outpostNumber 不能冒充恢复技能后的上限；玩家自管需要外部已恢复 getter，缺失就拒绝。

预期实现：复用既有稳定度公式，增加可替换的同步 getter 回调；离线共享实例在同一批市场对象上执行该原版函数，并让后续产业财政刷新读取当前倍率，不从独立静态投影重算。范围仅这两个真实回调，不宣称完整 Population.apply、整个经济调度器、玩家技能或零售库存已经恢复。UI未改，原版/网页画面待许可核实。验证复用现有存档套件，检查旧需求/新供应、跳过零需求、跨市场缓存身份和即时收入。

## 已落实及边界

- 新的共享离线草稿接入真实经济组、超空间位置、保存关系舍入后的敌对、当前收入倍率和玩家出口动态数值。缓存初次读取/显式重建作用于整组市场，跨组不重绑定；主商品改写变体需求，但不提前给变体绑定缓存。
- 已把原版 modifyStability 回调接到同一批可变市场对象。逐项读取旧需求→可能构造网络→读取新供应/可用量/运输；随后 updateIncomeAndUpkeep 读取这些对象当前倍率并写回同一财政句柄。没有把最终市场倍率反写到所有更早阶段的收入。commodity和稳定度临时计时保留。
- 修正上一轮未验证夹具：规则核返回的是只读结果，安装入可变事务时应显式复制；出口案例需要真实运输能力，不应把零流通性市场断言成能出口。未修改原版公式来迎合测试。
- 复用原有存档套件16/16通过；本轮仅为人口财政增加1个链式用例，没有新增测试项目或oracle。campaign类型检查通过、11文件定向lint无诊断。
- 私有真实输入：65市场、7经济组、19经济商品；逐组133个网络构造/重建、1235次市场商品重绑定均保持组隔离；65人口财政回调、346产业财政刷新成功。原版两份文件SHA和capture保持不变，商品临时计时不变。数字报告在忽略目录 artifacts/campaign-native-live-network-report.json，不包含市场身份。
- **这些是真实输入在post-storage边界上的回调接线，不是完整加载回放**：未先执行所有市场的完整条件/产业副作用，因此这里的零产出不是还原后的经济产出，不用于零售/权威世界。原先产业投影中“保留870条旧maxSupply”只对它的局部范围成立，不能外推为完整econPostSaveRestore的行为。
- 仍需把条件→治理技能→各产业unapply/apply及懒网络读取在精确时点合并成完整调度，再补危险度收尾、移民/监听器、恢复后的玩家管理能力、价格/库存/准入。readyForAuthority=false、Corvus门禁与版本锁不变。没有桌面操作、子代理、提交或发布。

## 下一段实施前对照：有序市场经济回调

原版Market.reapplyConditions:1101–1106逐条件unapply/apply；reapplyIndustries:313–319先治理技能、再逐产业unapply/apply，最后危险度维护倍率。Population.unapply:189–215先移除旧稳定度/流通性/maxIndustries，再在apply入口modifyStability构造网络。OrbitalStation.apply:53–66使用重写前需求算稳定度；TradeCenter(impl).apply:28–49先Base财务刷新，再添加商业倍率；Spaceport.apply:31–80在新需求后加维护缺口并恢复hasSpaceport，即使停运该标记也为true。资源/生产/驻军/特殊产业apply已逐入口核对，复用已审计商品核而不重新写公式。

实现方向：把已有条件/治理技能/逐产业商品、稳定度、收支、流通性作用合并到同一共享离线事务；按实际市场与产业顺序推进，禁止全市场商品先重算再跑财务。补抓hasSpaceport、建设队列与max_industries动态StatBonus；原版Market.readResolve:630–633和ConstructionQueue.readResolve:12–16解释省略队列为空，不虚构正在建造的条目。只完成被这些核覆盖的经济作用；驻军/空间站实体、人物技能全生命周期、移民/listener、玩家商业库存重建等仍显式pending。UI不改，视觉验收仍待许可；验证复用原有存档用例与真实只读输入。

### 有序经济作用链已接入

新增OriginalLiveIndustryEffects，复用已有商品/财政/流通性核，在同一批可变市场上依次执行：当前状态条件阶段→治理技能→各产业经济unapply/apply→危险度维护倍率收尾。NativeLiveEconomyDraft提供单市场和整份经济名单入口，加载为single-use；旧capture缺marketEffects时拒绝这条新流程（仍可用于原有较窄网络读取），失败事务不可继续发布。

重点保留：人口先移除旧流通性再懒建网；后续市场条件使用前面市场已改写的缓存，不回退到保存时值；条件对产业supplyBonusFromOther的写入必须一起安装，不能只复制state；空间站使用旧需求、港口维护费使用新需求；商业倍率不追溯改写本产业此前财务刷新；危险度在所有产业之后更新。准备遗漏商品时沿用定义插入顺序：Market.getAllCommodities:962→econ/super.o00000→SpecStore.cfr_renamed_8:2155返回LinkedHashMap，与现有CSV导入顺序一致。

真实只读输入完成：65市场、305条件访问/304次apply、346产业经济作用；途中实际懒建66个网络对象、绑定1110个市场商品引用。65市场句柄未替换，跨市场共享缓存身份、条件产业增益、商品/稳定度临时计时均保留，原版源文件SHA及capture未变。报告只写忽略目录artifacts/campaign-native-live-economic-effects-report.json。此结果比前段post-storage单独调用更完整，但仍不是完整原版econPostSaveRestore：conditionState/conditionAttachments是条件边界结果，governedState是治理技能边界结果，不可冒充产业执行后的全部动态状态或移民回调名单。

原有存档套件17/17、campaign类型检查、8文件定向lint通过；本段只新增1个多产业/跨市场组合用例，无新测试专项或oracle。还需接产业移民注册、舰队/地面防御等动态作用、玩家商业子市场的原生库存生命周期、角色技能恢复及监听器，之后才可继续网络调度/价格/库存发布。readyForAuthority=false、Corvus门禁和发布边界未变。没有桌面操作、子代理、暂存提交或发布。

## 本轮实施前：产业移民名单接当前增长率

原版Market:1345–1373保留permanent/transient两个LinkedHashSet；getAllImmigrationModifiers直接按顺序拼接，没有跨集合去重。BaseIndustry.apply/unapply:182–215注册/移除当前产业对象；非功能港口/商业会再次unapply，农业/采矿清供给不等于取消移民注册。ResourceDepositsCondition.modifyIncoming:182–197读取绑定条件ID；加载保存的旧ResourceDepositsMC与新插件即使modId相同也仍是不同对象，均可能贡献教会移民。

CoreImmigrationPluginImpl.computeIncoming:137–186使用当前稳定度、整组同位置非敌对邻居、实际产业需求/可用量、当前回调名单；先激励，再permanent→transient回调，最后按真实势力注册表过滤和正增长归一化。Misc.getMaxMarketSize:5764、Market.isImmigrationIncentivesOn:1515和incentiveCredits默认0确定额外捕获。UI刷新不累加激励费用，但达到人口上限仍关闭激励。

当前差异：现有增长公式仅接受按逻辑ID唯一的回调，不能正确消费28个旧资源对象；共享草稿只有条件边界名单。实现扩展为明确的对象身份模式，旧逻辑模式保持原状；产业注册安装进当前名单，增长率消费共享市场当前数值与全部注册势力。旧捕获缺新输入时拒绝，不凭保存的incoming或静态势力表代替。只计算并安装incoming/激励状态，不提前宣称人口advance/升级殖民地、月度付款完成。UI未改/未进行原版或Web画面验证；复用既有套件。

### 移民来源与当前增长率已接到共享执行链

现有移民核新增显式object身份入口；原有逻辑ID入口未放宽。同一集合拒绝重复对象，但permanent和transient仍按原版拼接；不同的ResourceDepositsCondition对象可共享modId并分别增加派系权重。其它同名不同有状态对象需要逐对象getter，明确拒绝。产业注册在当前名单中保留实际objectRef，条件边界的conditionAttachments不冒充最终名单。

NativeLiveEconomyDraft.computeIncoming在本市场经济重应用完成后，消费当前稳定度/危险度/流通性、产业药品需求、完整邻居与敌对，以及真正注册的所有势力。安装新的incoming和激励状态；uiUpdateOnly不增加已累计费用，到达动态人口上限仍会关闭激励。缺失新捕获字段明确拒绝。它不推进population、不增大市场、也不结算玩家账户。

实际捕获发现：不少注册势力对象首次定义在强类型字段o/f/ow中，map值是引用，resolve后节点名不是Faction类名；因此按原版已用规则核验显式cl（若存在）、注册键及实际id，不把字段名当运行时类。完整表为21势力，不能只用拥有市场的势力过滤移民。

真实65市场执行有序经济作用后，262移民回调均进入增长率计算；28个旧资源对象和28个同modId的新资源对象保留为不同引用，源capture和原版两份保存文件SHA不变。零日UI刷新激励累计额不变；当前这一离线作用边界下26市场净增长为正，不据此声称原版全部加载/经济稳定态一致。汇总在忽略目录artifacts/campaign-native-live-incoming-report.json。

复用已有存档18/18（本轮仅加1个链式场景）、已有移民15/15通过，后者也实际执行了既有198 incoming+120 environment的隐藏Java对照；本轮没有新增oracle或测试项目。campaign类型与14文件lint通过。所有后台检查已结束，无桌面输入、子代理、暂存提交或发布。人口advance/规模升级、完整角色/监听器与实体防御、价格/真实库存/正式世界仍pending，readyForAuthority=false。

## 本轮实施前：保存的人口接实际时间推进

原版0.98a-RC8，PopulationComposition.java:14–23/104–143保存有序comp和MutableStat weight；readResolve只在weight为空时新建零stat，不重算现有人口。Market.java:1316–1342仅在population为空时按所属势力/规模惰性初始化，wasIncomingSetBefore取incoming非空。CoreImmigrationPluginImpl.java:35–86先计算并设置incoming，UI直接返回；首次实际推进100轮，否则1轮；严格超过下一规模阈值才增长，增长回调后仍写入旧max。CampaignEngine.java:302/1133–1138的isInNewGameAdvance是实际引擎字段，不能固定成false。已只读核对本机保存结构：comp的e/st/fp，weight的原生stat，根isInNewGameAdvance=false。

当前差异：共享草稿把所有incoming初始化成null，未恢复population，直接接推进会错误触发首次100轮。先捕获并恢复这两个状态，保持缺失旧capture与真实保存null的区别；复用现有人口核新增object回调身份入口，再让当前共享市场推进并安装结果，incoming/激励只计算一次。没有真实引擎标志时拒绝推进。玩家跨规模还依赖条件替换、setSize监听器和完整同步重应用；本轮不把改size或事件通知冒充它，跨界仍按已有核明确拒绝，失败草稿作废。接通人口时间推进后继续完成该依赖，不把这个边界作为最终成品。UI没有改动，原版/Web视觉仍待许可。复用已有存档/人口用例，仅检查当前接线，不新增oracle。

### 人口保存状态与逐次推进已落地

捕获population/incoming的有序势力构成及原始weight修正，不使用序列化modified缓存；缺weight按原版readResolve补零stat，缺人口字段是真实null，旧capture缺整个populationCapture则仍是未知、不可推进。引擎新游戏标志取实际保存字段，缺失不擅自判false。共享草稿读入原人口/移民，advancePopulation复用原生人口核的object身份入口，当前getter组装不再预先调用computeIncoming。结果安装到同一市场，保持已存在PopulationComposition及weight引用；incoming按原版替换，激励只计一次。UI不初始化人口，但会设置incoming并因此消耗首次标记，保留原版行为。

真实保存65市场均恢复现有人口/移民，逐一推进1天均为1轮（0个误判首次），65份人口构成发生变化，规模保持不变；这些市场不是玩家市场，不能据此证明玩家升级。报告artifacts/campaign-native-live-population-report.json，原campaign/descriptor和捕获哈希保持不变。仅既有存档套件扩1条集成场景：19/19，用时约0.5秒；最后对象引用修正仅重跑该1条约0.2秒。类型和9文件lint通过，未新建测试框架或跑全项目套件。

下一步已核对真实升规模监听器：campaign/listeners/ListenerUtil.java:458–461遍历当前注册的ColonySizeChangeListener，LuddicChurchHostileActivityFactor.java:367–376可同步添加/移除luddic_majority。因此不能把监听器当固定空列表，或只重算population条件。接下来应捕获/恢复实际监听器身份，完成新条件立即apply→setSize回调→当前状态conditions/industries重应用；现有single-use加载不能冒充这条动态链。玩家跨阈值目前明确拒绝并作废草稿，没有静默吞掉增长。完整经济调度、费用结算与正式世界接入未完成，readyForAuthority=false；无UI/桌面操作、子代理、暂存、提交或发布。

## 本轮实施前：动态升规模条件与产业经济回调

核实原版CoreImmigrationPluginImpl:105–121、Market:313–319/923–929/1055–1069/1101–1106/1119–1127：移除全部人口条件（含重复旧规模ID），新条件立即apply且在setSize之前；setSize更新后同步派发监听器；再依次条件unapply/apply、治理技能、产业unapply/apply、危险度收尾。MarketCondition:31–54给新对象唯一身份，默认surveyed=true；人口和教会条件不在condition_gen_data.csv，故没有调查覆盖。ListenerManager及ObjectRepository:31–46按saved顺序恢复permanent，transient读档为空；未知监听器类型不能当作无效忽略。全本机原版源码中ColonySizeChangeListener只有LuddicChurchHostileActivityFactor实现，其367–376按当前产业/队列/管理员/教会协议添加或移除luddic_majority。

实现差异：single-use经济加载不适合增长，初始条件附件也不能代表动态注册。增加单条件回调入口复用现有公式；动态适配器只更新该插件的真实对象注册，保留其它对象/旧资源插件及顺序。从实际保存监听器集合提取已核实的规模监听器，捕获即使尚无教会条件也会读取的上下文；未知类型标pending。新增长驱动执行条件替换、监听器、当前共享状态经济重应用，不重建已有网络或再计算incoming。仍只是离线草稿的增长经济作用，完整舰队/防御/产业监听器、玩家库存与世界调度未完成，不提升authority门禁。UI未改，不操作桌面；复用已有存档检查。

### 动态升规模经济链已接通

新增applyOriginalConditionCallback直接复用条件核的单插件apply/unapply，保留添加时无survey门禁、移除时无条件unapply的原版调用。共享草稿新增可重入reapplyCurrentMarketEconomicEffects：从当前商品缓存、产业外部增益、治理状态和真实移民对象名单出发，不回滚到加载快照。适配器每次只修改被调用插件的注册，旧ResourceDepositsMC与新插件继续保留不同身份与顺序。初始single-use加载仍保留原边界，conditionAttachments仍是历史加载边界，不再用于动态重应用。

增长驱动现在同步执行全部人口条件删除（含重复旧ID）、新人口条件立即apply、size变更、实际注册规模监听器、条件重应用与产业经济链。人口及weight句柄保留，incoming保持增长前计算结果，非零时间片的激励只累计一次；到上限关闭激励。当前教会协议/产业/队列/管理员getter驱动luddic_majority增删，其稳定性和产业增益立即生效/撤销。未知监听器不忽略，缺少新捕获仍拒绝增长并作废草稿。之前“所有玩家跨阈值一律拒绝”的边界由本段替代，但完整产业生命周期仍未完成，不据此开放世界。

只读真实捕获恢复17个已核实的保存监听器，本份存档规模监听器0个；65市场捕获可供未来教会条件使用的上下文。65市场重新执行305条件访问、346产业经济回调，1110个已有商品网络绑定保持同一对象；原保存与capture哈希不变。汇总artifacts/campaign-native-live-growth-report.json。本份存档没有玩家殖民地，真实玩家增长未获证明；在已有存档套件的一条控制场景中核验4→5→6、条件新身份、教会增删、食品需求5/6、旧资源对象、缓存不重建及非零激励单次累计。原19条和新增1条均通过，类型和10文件定向lint通过；最后仅重跑相关场景约0.24秒，无新oracle或全项目测试。

本段只完成共享离线草稿的规模增长经济作用。pending仍含舰队/实体防御、产业其它监听器、玩家商业子市场库存、人物技能完整刷新、世界调度/费用结算以及正式星域接入；规模监听器目前只恢复保存的永久名单（加载时transient为空），未来运行中新注册/移除监听器仍需接世界生命周期。原版实机、Web视觉与用户操作均未验证。readyForAuthority=false、Corvus门禁、发布限制未变，无桌面、子代理、暂存、提交或发布。

## 本轮实施前：类别价格与市场存量进入共享状态

原版0.98a-RC8，MainWorkTask2.java:133–267按触发商品ID+当前游戏月份设种子，先用主商品当前图标/需求算共享MarketDemand及各变体greed/无需求倍率，再用主商品当时available/maxSupply算存量基数；直到196行才读取getCommodityMarketData().getMaxExportGlobal，可能懒建网络并改变整组可用量。价格阈值循环在此之后重新读当前图标。变体不重新生成自己的stockpile，但触发其更新时仍重新更新整个类别，种子也不同。Market.java:792–813的类别列表保持已实例化顺序，MarketDemand为类别共享对象。CommodityOnMarket.readResolve:60–82重建PriceCalculator并updateCalc；新构造152–157不调用updateCalc，故新补建商品的计算器不能冒充已经刷新。

当前差异：现有OriginalCommodityClassPricing是完整类别纯快照核，要求主网络事先存在；共享草稿尚未保留需求stat/greed/stockpile/价格计算器。需扩展同一核的同步懒网络回调位置，不通过提前建网或重算产业去改变旧getter读序；桥接保存的类别共享需求、修正、变体存量和价格对象，明确只由真实final-iteration/显式force-stockpile-update入口调用。月份要求调用方传入实际游戏日历getter，不使用电脑日期或把裸Java timestamp猜成月份。此更新不是OpenMarketPlugin货舱补货，不把经济stockpile当可购买数量。UI未改，画面验证仍待许可；只复用现有类别价格和存档检查。

真实输入收尾发现离线全量快照新增价格状态后超过通用JSON边界250000节点（65市场321231节点）。这不是价格公式失败；不得为此放宽服务端/浏览器共用Values.jsonCopy限制。修正离线snapshot为逐市场使用原有JSON验证/深冻结，并保留完整市场集合、另设4096市场及64MiB累计JSON大小硬上限。它仍明确不是传输/权威世界快照，不截断市场、不省略价格状态。

### 类别价格和经济存量已接到共享市场

OriginalCommodityClassPricing新增同步runtime入口，与原纯快照入口共用公式；只在已计算旧存量基数/旧生产量后调用主商品懒网络getter，先写共享需求/各商品greed和玩家价格倍率，再按网络更新后的getter计算各商品价格阈值。没有提前建网、重算产业或给变体额外初始化网络。共享草稿恢复保存的stockpile/greed/价格修正和类别MarketDemand对象，变体真正指向同一需求句柄；读档计算器按updateCalc恢复，新补建商品保留PriceCalculator默认值直到真实价格阶段。原价差修正、临时贸易计时与变体stockpile保留。原生单玩家倍率暂以native槽位桥接，不冒充联机各玩家的价格状态。

新增updateStockpileAndPrice(market,trigger,{month,phase})，仅接受final-iteration/显式force-stockpile-update阶段；月份是明确的运行时输入，不读取电脑当前日期。它更新整个需求类别及现有价格对象，不把经济存量发布为OpenMarketPlugin的可购买货舱。快照容量问题已按前段逐市场验证/独立全量上限修正，未改Values共享边界，完整65市场无截断。

真实65市场/19经济触发，按已导入原版tier顺序执行1235个类别更新、1365个商品价格行；1235个经济商品/需求/greed/计算器句柄保持，715个所有非主类别成员的原存量保持。汇总artifacts/campaign-native-live-prices-report.json。回放月份明确指定为7，只证明共享实现处理真实输入，不能证明存档当前月份、自然月末调度或完整经济平衡；原campaign/descriptor及capture哈希不变。

复用既有价格6条短场景、存档20条及新增1条共享价格场景均通过；该场景专门证明旧maxDemand/存量基数与新网络阈值的顺序、变体触发不同种子、类别共享需求、变体不补货、非法per-tick阶段拒绝。类型/6文件lint通过，快照修正后真实全量回放及单文件lint通过；未跑原版大型差分或全项目套件，没有新oracle。

正式世界的日历恢复/经济调度、真实子市场货舱与准入、角色/监听器完整生命周期及舰队防御仍需接齐。readyForAuthority=false，库存/交易世界未发布；原版实机/Web视觉未验证，无UI修改、桌面操作、子代理、提交或发布。


## 实际公开市场货舱：本轮编码前对照

来源为0.98a-RC8：OpenMarketPlugin.java:43–78/90–130先执行资源补货并清零sLCU，舰船武器另有msSWU计时，最后CargoData.sort会重建堆栈。BaseSubmarketPlugin.java:44–50/68–93/694–777保留保存的两种timer，遍历市场商品顺序、跳过nonecon/meta、禁品只可减量；不是经济stockpile。CargoData.java:465–470/540–567/606–712以最小同类堆栈优先、同量选先项、首空槽复用、float逐项相加；partials非null（包括空map）会改变小数累积，不可先聚合库存再套公式。CargoItemStack.java:142–147/333–353从商品规格恢复资源堆栈容量/占用，setSize先取整再钳制；SpecStore商品导入读取必填stack size。Market.isIllegal加Faction.isIllegal包含需求类别违禁继承和自由港豁免。CampaignGameManager.java:1813–1823/1873–1880/2005–2006给出序列化别名。

现状：现有补货核只接受单堆栈map；共享市场没有真实子市场货舱。计划抽取共用补货量计算，加入有序资源堆栈/partials操作，捕获实际open_market的插件、货舱、引用及两个timer，接到共享草稿当前经济getter。非资源/舰船对象保留来源引用并标明尚未恢复，不把只补资源宣称为完整交互、不得重置SW timer或执行缺失的武器舰船生成/最终sort。缺失timer不填构造默认31。月份必须明确输入，禁止从电脑日期猜。

只改逻辑与数据，不改原版UI布局；已有截图不证明本段后台补货，新增原版实机/Web视觉核验待用户允许操作桌面。复用既有补货和存档用例，最后短检查及只读真实存档回放；不新增oracle工程、不跑全量、不发布。

回放准备顺序补充：MainWorkTask2.java:88–114明确先重应用各市场，再按商品tier逐项为null及每个经济组new CommodityMarketData，最后对各市场刷新类别价格；不能把“仅load reapply + 懒价格getter”误认为已运行该阶段。首次资源接线回放只有43个非零货舱行，暴露了未重建旧网络的准备不足。修正回放前置阶段，不通过额外补货或改库存公式弥补。此处仍不代表角色/监听器/移民或完整世界调度已经接通。

### 实际资源货舱接线结果

已增加OriginalResourceCargo并复用OriginalOpenMarketStockpile的共用补货量计算。实际货舱保留有序slots、同类最小堆栈/同量首项、NULL槽复用、超过单堆栈的分配、剩余不足1时的原版丢弃、roundSize、非null partials正负余量，以及重复objectRef的共享堆栈身份。规格stackSize从本机commodities.csv按原版必填整数转换导入，不把所有堆栈都当无限100万容量。普通资源存档小maxSize经readResolve恢复规格容量，已有大堆栈保持原值。

captureNativeOpenRetail提取实际open_market插件、货舱、保存timer和引用；source字段只是原始捕获证据，不能当当前库存或写回原生存档。未解码的非资源/舰船/credits/其它子市场保留原引用；非资源空间getter未恢复时spaceUsed明确置null而不是继续展示旧值。带carryingFleet/origSource的更新仍因缺少同步运行时拒绝。原版cargo为null时的懒建舰队尚未接通，缺保存timer明确拒绝、不填31。NativeLiveEconomyDraft保持市场货舱和slots句柄，新增advanceOpenMarketTimers与refreshOpenMarketResources；两种timer同时推进，补资源仅清零sLCU、不动msSWU。当前自由港/势力违禁类别、流通/供需/稳定度getter参与补货；经济stockpile不变。资源阶段不执行最终sort，不冒充整个updateCargoPrePlayerInteraction完成。

只读真实输入65个公开市场原货舱全部空，不能伪装成已有商品。按核实的经济前置顺序先133次商品/组网络重建与1235类别价格更新、当前产业重应用，再1170个经济非meta补货行，得到686个非零资源堆栈。65个货舱/slots身份与SW timer保持，立即重复刷新无增减，经济stockpile保持，完整65市场快照可读。月份7为显式回放输入，不证明日历已恢复；本段不是完整经济scheduler、角色/监听器/移民/结算运行。artifacts/campaign-native-live-retail-report.json记录最终回放；原save及capture哈希未改。

复用现有补货/存档套件，仅执行5条已有短场景+2条本轮接线场景，7/7约0.3秒；类型、9文件lint和参考导入--check通过。没有大型原版差分、全项目测试、新oracle、桌面操作或可见窗口。源码核实及离线Web逻辑检查已做；原版实机/Web视觉未做。

仍需完整舰船武器生成/插件space getter/final cargo.sort、实际准入与事务库存桥、日历与调度、角色/监听器/实体防御，才可发布正式生涯。readyForAuthority=false、Corvus门禁不变，不暂存/提交/打包发布。


## 保存的原版时钟：本轮编码前对照

0.98a-RC8 CampaignClock.java:18–34保存timestamp/secondsPerDay，GregorianCalendar是transient；readResolve在当前Java默认时区重新建立日历，而不是存档携带时区。advance:52–56按float(amount/secondsPerDay*86400)转Java int后Calendar.add(SECOND)，逐帧截断，与现有OriginalCalendar固定民用绝对投影政策不同。不能用JS Date按公历直接读星历206年的timestamp，也不能把电脑月份或回放7月当保存月份。

已核实自带JRE17 ZoneInfo.getOffsets/getTransitionIndex字节码：转换表前用最后raw offset；表内读取按UTC排好的转换记录；表后用SimpleTimeZone尾规则，没有尾规则则沿用最后记录。Intl的历史LMT不等同Java1900前raw offset。计划在只读捕获中用原版CampaignClock及自带JRE导出默认时区转换表，尾规则交给同一个JRE的getStart/getEnd展开至现有民用日历上限9999年；Web复用已有儒略/公历转换核及纯数据二分查表，不开游戏、不反序列化或执行存档类。保留时区来源为“当前原版加载运行时”，不假称知道保存时区。

当前差异是共享草稿价格/补货仍需显式month和独立timer参数。本轮加入独立原版逐帧时钟状态，从同一真实日期读取月份、同一frame amount转换经过天数推进公开市场计时；不悄改现有固定民用日历provider/规则锁，也不把此局部入口冒充完整world.advance或整个经济scheduler。旧capture无时区证据仍明确缺失。UI不变，视觉/原版实机待许可；只在现有calendar/native-save套件补相关短场景，不新建oracle工程、不跑全量。

### 原版时钟恢复与共用时间接线结果

新增OriginalNativeClock，复用OriginalCalendar的既有儒略/1582改历/公历核，只补显式Java时区offset下的Unix时间戳转换；没有复制日历公式或替换现有固定民用provider。原版clock state保留timestamp毫秒、保存secondsPerDay、当前Java加载时区的完整转换表。逐frame做float除法/乘法及Java int截断/饱和，小于一民用秒的尾数不累积；转换days保留原版float，与民用整数秒推进分开。重存/恢复不会丢毫秒。NativeClockCapture是只读导入适配器，不是新oracle项目：只创建可信原版CampaignClock/Calendar，接收数值时间戳，不加载原版世界、不反序列化任何保存类。自带JRE导出ZoneInfo转换和SimpleTimeZone未来规则展开，避免Intl历史地方时或浏览器时区改变日期；上海、纽约、悉尼捕获及少量内置边界/逐帧读数均与实际原版类相符，未来表覆盖既有日历1..9999年支持区间。校验过的临时编译class仅留在ignored artifacts缓存。

现有capture-campaign-native-save可显式--native-clock，将clockCapture写入忽略目录；旧捕获不自动补月份、不当作新档。加载来源为bundled-jre-current-default-on-load：原生GregorianCalendar是transient，存档没有“保存时区”；本机原版重新读档也会用当前Java默认时区。当前原档实际读为c206.7.25 08:28:08（Asia/Shanghai），不再使用电脑日期或手填7月。

共享草稿的类别价格和资源刷新默认从同一clock取月份；带时钟的草稿拒绝不一致的外部month和单独固定tick推进timer，旧离线捕获仍可显式提供回放month。advanceNativeClockAndOpenRetail只推进原版时钟与公开市场两类timer，不冒充完整engine.advance。进一步核实CampaignEngine.java:996–1036和Economy.advance：stepper/市场先于clock.advance，因此economyClockFrame必须在clock推进前读取；返回的旧date是诊断记录，不能在已经推进后把当帧经济任务改用新月份。完整经济任务、其它子市场/条件/产业frame回调、暂停及结算调度尚未接入该局部入口。

真实65市场，从原生保存日期推进明确的局部frame到c206.8.1，再按经济网络/类别价格顺序走1235更新、1170补货行/686非零资源行，全程不传month；65个SW timer在补资源时保持。原save/capture哈希不变，完整快照包含当前nativeClock与来源，readyForAuthority=false。汇总artifacts/campaign-native-live-clock-report.json。注意这7天是回放的时钟+公开市场timer推进，不能声称移民、舰队、产业、月度账单也推进了7天。

既有calendar/native-save套件5条定向短场景通过（约0.35秒），类型及7文件lint通过；未跑旧1194向量大型差分或全项目套件。没有UI编辑/实机视觉验证、桌面操作、子代理、暂存提交或发布。当前正式世界调度/交易准入/舰船武器库存及角色监听器仍是下一阶段，目标保持未完成。


## 原版经济任务与实际监听器：本轮编码前对照

0.98a-RC8 MainWorkTask2.java:53–126、UpdateMarketsAgainTask、ImmigrationTask、FinishEconomyUpdateTask：创建时固定市场名单；首批建商品tier顺序，逐市场条件→产业，逐商品所有经济组建网→（月末）价格→逐监听器快照通知；再重应用市场、按30/迭代次数更新人口、结束通知。沿用现有OriginalEconomyTaskRunner，不另建任务顺序或用假的completedTask推动调度。ReachEconomy.nextStep额外刷新角色/管理效果，与scheduled入口不同，不能把缺角色运行时的入口标成完整forced更新。

真实存档有8个EconomyUpdateListener，不能当空名单：1个LocalResourcesSubmarketPlugin、1个ShipQuality、3个LuddicPathBaseIntel、3个PirateBaseIntel。字段名i的海盗对象由已解码PirateActivity.intel的声明类型/同一对象引用核实，不仅靠名字猜类。BaseIntelPlugin.isEnded是nullable Boolean非null且true才过期；本地资源按当前market.hasSubmarket判过期。该插件commodityUpdated/economyUpdated只在暂停时做零时间缺货补偿；scheduled经济入口只在未暂停时运行，因此本轮不伪造暂停或强制路径。

ShipQuality.java:43–89每次结束清data，以势力+经济组key保留质量StatBonus引用；先读ships旧产量，懒网络/运输getter后重读产量，数量优先、同数量质量>=时后者获胜。首个hidden市场影响无生产默认进口惩罚，不能归一化忽略顺序。PirateBaseIntel.java:920–988与LuddicPathBaseIntel.java:612–660按正flat修正之和补走私供应，不删除无需新供应时的旧修正；结束写舰队质量/规模/巡逻数。modifyFlatAlways的显式零与普通modifyFlat不同，保留其它修正。只恢复统计效果，不声称舰队实体已生成。质量引用要求共享production_quality_mod原对象不被产业重应用替换。

计划捕获真实监听器和相关动态StatBonus，接到共享草稿的scheduled任务入口；条件和产业两步调用真实实现，不以no-op伪装依赖。未识别监听器或缺运行时明确报错并废弃草稿。新增规则使用原配置qualityPenaltyForImports，保留完整出处。UI不改，原版实机/视觉待许可；只复用现有任务和存档短检查，不加oracle项目或跑全量。

### 共享 scheduled 经济任务链已接通

复用OriginalEconomyTaskRunner，新增共享草稿begin/step/runScheduledEconomyPass及状态读取；只有明确paused=false的scheduled入口，不偷换成缺角色刷新依赖的forced入口。条件和产业现拆为真正的两个内部步骤，仍保留原组合入口。任务访问同一市场/商品/人口对象，按原版两轮重应用、逐商品建网与通知、人口、完成通知执行；普通迭代不刷新stockpile/价格，lastIteration才调用native-final-iteration，月份来自真实clock。已完成任务再次step不再写状态，任何失败废弃草稿。

captured economyListenerCapture保留实际名单顺序/重复对象和插件状态，未知对象不跳过。原版ShipQuality数据在readResolve后为空；结束阶段重新选择生产者，保留实际production_quality_mod句柄，读取顺序包含懒ships网络后重读产量。OriginalLiveIndustryEffects现在在原质量StatBonus中安装unapply/apply结果，治理作用也与combat_fleet_size_mult共享句柄，避免监听器握着断开的旧对象。其它已保存的fleet/patrol修正保留，基地质量/规模显式零不丢弃；当地资源在未暂停scheduled回调中按原版不做缺货动作，暂停货舱补缺另需真实适配器，不伪装已实现。

真实65市场/8监听器完成216批：130条件和130产业重应用、133组网络重建、1235月末类别价格更新、152商品监听通知、65次人口advance、8次结束通知。产生14个势力/经济组舰船质量缓存，其中7组有生产者。65个productionQuality句柄及65个人口句柄保留，第二次step(done)快照完全不变；原save及capture字节哈希不变。汇总artifacts/campaign-native-live-tasks-report.json。该回放在固定时钟下执行一轮scheduled工作，不证明原版每帧时间预算、stepper自然触发或整月结算已实现；工作游标尚未支持中途持久化恢复，不能把header中的状态摘要当成恢复协议。

复用已有任务和native-save文件，仅4条定向短场景通过，类型/10文件lint/原参考导入--check通过；未启动大型Java差分/全量测试，没有新的测试工程。此轮没有UI修改/视觉实机验证、桌面操作、子代理、暂存提交/发布。

剩余：ReachEconomyStepper与真实经济tick/月末监听器/账单衔接、任务中途读档、暂停本地资源缺货回调、完整角色/行业/舰队实体生命周期和正式交易/联机世界发布。产业已有pending列表仍有效：此轮恢复的是经济与监听器统计效果，不是舰队生成。readyForAuthority=false，完整生涯目标未完成。


## 2026-09-21：分批经济更新的离线断点恢复（实现前对照）

- 原版 0.98a-RC8：MainWorkTask2.java:45–56、78–137 保存固定 markets、commodities、started、marketIndex/index 与 params；ReachEconomyStepper.java:32–38、62–113 保存任务队列/阶段并依次推进。UpdateMarketsAgainTask/ImmigrationTask 的独立市场名单不能在恢复时重新获取。
- CommodityOnMarket.java:42–57、60–94 的价格计算器/商品网络是 transient，原版 readResolve 会重新初始化；ShipQuality.java:18、30–32 的品质分组同样 transient。**原版读档导入**与**Web 执行中的同一事务断点**不是一件事：本次仅实现后者，不把重启时清缓存冒充精确续跑。
- 当前差异：status/snapshot 仅用于观察，缺少任务名单、游标、载入上下文、共享对象关系及惰性网络绑定。JSON 直接复制会拆开同类需求/质量/货舱的共享引用，重新构造草稿则会丢失当前状态。
- 预期：版本化离线 checkpoint，只在同步操作之间捕获；包含市场和加载上下文、时钟、监听器、计数、任务游标以及已有/未建立网络。恢复不触发 apply/rebuild/人口/监听器，不重播完成的工作；失败或回调正在执行时拒绝。保留 64MiB 离线容量边界，不修改通用网络 JSON 限制。外部 outpost getter 为能力依赖，恢复时需重新提供，不序列化函数。
- UI：本次无画面或操作布局变化，不需要新截图；未做原版实机/Web 视觉验收。MultiFrameTask 反编译预算循环异常不在本次范围，不照搬。
- 验证：复用现有存档用例做中途 JSON 往返与不中断结果对照，并用已有65市场捕获做一次恢复回放；不新增测试工程、不跑全套、不启动可见窗口。

### 本轮实现与结果：完整离线事务断点，而非诊断快照

- 新增 NativeLiveEconomyDraft.checkpoint()/fromCheckpoint()。断点保存全部市场、原加载上下文、loaded 集合、条件身份序号、原生时钟/来源、势力关系/玩家统计、增长监听器、经济监听器、任务名单/参数/游标与调用计数。构造恢复使用私有路径，不重跑原始导入或经济 apply。
- OriginalEconomyTaskRunner 保存并验证完整批次游标；恢复不读取新的市场名单、不执行 forced 角色刷新。已完成任务再次 step 不产生副作用。失败草稿或正在回调中的草稿不能生成断点。
- OriginalCommodityNetworkCache 持久化 serial、去重网络对象、逐市场/商品绑定；没有缓存的商品保持未初始化，旧经济组绑定不按当前组自动重建。恢复不调用 capture/apply/getDemand。
- 离线对象图保存对象身份与字段顺序，保留共享需求、生产质量、治理战斗统计、货舱/重复堆栈以及负零。监听器品质分组重新绑定同一个恢复后的 StatBonus，不计算生产者。原事务、导出的 JSON 和恢复事务互不写穿。
- 外部 outpost getter 不序列化；未结束任务如果原本依赖此能力，恢复必须重新提供。缺失能力或格式/版本/悬空引用/非法游标明确拒绝。此处不是服务端准入协议，不承诺任意手工改写断点语义有效；readyForAuthority 始终 false。
- 初次真实回放发现整个世界对象图超过最初设置的25万“独立对象”上限，因此独立离线格式改为最多100万对象，仍限制64MiB，并对每个市场及加载上下文保留原有250000节点/深度限制。没有修改 Values.mjs 或网络状态限制，也没有截断数据。
- 真实65市场于第74批、8种商品已处理（520次价格更新）时完成 JSON 往返：断点24,485,798字节，1140条已有网络绑定保持，恢复本身不改变市场/人口/任务计数。继续到216批的最终市场、监听器、时钟与计数和不中断执行完全相同；65人口句柄/65品质句柄持续保持，完成后再次step不执行。源campaign.xml、descriptor.xml及capture哈希未变。结果在忽略目录 artifacts/campaign-native-live-checkpoint-report.json。
- 验证只复用既有文件：3条定向短场景（约1.2秒）、生涯类型检查、改动文件lint通过。最初断言误把lobster当food需求类，已按原数据修正为luxury_goods，不改业务规则迁就断言。没有全项目/大型Java差分、新测试工程、桌面/游戏/浏览器操作或子代理。
- 边界：本次是Web离线经济事务精确续跑，不是原版readResolve复刻，也不是完整玩家保存/读取界面或联机世界恢复；自然stepper/tick/月末账单、完整帧生命周期、舰船武器与正式交易准入仍未接齐。


## 2026-09-21：自然月内调度接线（实现前对照）

- 0.98a-RC8 ReachEconomyStepper.java:62–113：先累计float elapsed，只有WAITING才察觉换月；换月先报告最后一个tick，再报告monthEnd，之后才可能创建任务。四个任务每帧只推进队头一个，即便前一个完成也不在同帧推进下一个；最后迭代不立即发tick，等换月才发。复用已有OriginalMarketEconomySchedule，不另造按30天取模的调度器。
- Economy.java:121–133：stepper先于market.advance；CampaignClock在此之后推进。月份/日数必须来自推进前的原生日历。
- MultiFrameTask反编译循环丢了break，已用本机JDK javap读取原版starfarer_obf.jar字节码：advance偏移54–85在elapsed>=budget或剩余预算小于已执行批次平均耗时时退出；默认预算0.001秒。按该分支实现预算，不按异常反编译无限跑，也不一次执行完整经济轮。
- CampaignEngine.java:2164–2173、ListenerUtil.java:158–167：经济tick/月末各先通知sector listeners，再通知ListenerManager的EconomyTickListener。CoreScript.java:725–889还涉及真实MonthlyReport、工资/仓储/殖民地/债务/自定义生产，不能把记录事件或空函数当成已结算。调度接线要求显式提供同步通知运行时；离线默认不假装已实现月结，缺依赖拒绝。
- 真实capture保存WAITING/elapsed/interval/iterLeft/prevMonth。复用该起点，不重置成新游戏默认。原生存档中已有任务队列目前只有数量证据，不能假装可恢复队内进度；与已实现的Web完整事务checkpoint区分。
- 本次无UI布局改动，原版实机/Web视觉不做新验证，不占用桌面。用既有用例做少量原版顺序/预算/跨月对照并运行一次65市场接线；不跑大套件或新oracle。

### 本轮结果：保存的月内调度驱动实际分批任务

- 复用并扩展OriginalMarketEconomySchedule为同步运行时入口：状态写入、开始一轮、当前任务、sector tick→managed tick、sector month→managed month严格按源码顺序执行，仍保留既有纯决策接口。不是先推测任务完成再补发回调。
- OriginalEconomyTaskRunner.advanceTask实现原版默认1ms预算及平均批次耗时的提前退出，每次只处理指定原生任务。即使某队列任务为空，也只移除该队头，不越帧处理下一任务；回调中不允许checkpoint或插入单独batch。
- NativeLiveEconomyDraft.advanceNativeScheduledFrame恢复capture.scheduler的真实WAITING起点，先运行调度/经济任务/通知，再推进同一原生时钟和公开市场timer。激活自然调度后拒绝绕过它单独推进时钟/手工scheduled批次。原生存档DOING_TASKS只有队列数量、没有完整任务字段时明确拒绝，不重置掉保存进度。
- 完整Web checkpoint升级内部版本2并保存自然调度状态/来源，与任务游标交叉核对；旧版本1可恢复其原有经济状态，但没有日程证据时不能偷偷补新游戏调度。通知运行时是外部能力，不能序列化函数；它的账单/监听器状态必须由完整外层事务一起持久化，本内部经济checkpoint不冒充全世界存档。
- 真实65市场用既有capture，从c206.7.25 08:28:08和elapsed=1.8482651710510254、iterLeft=2续跑至c206.8.1。666个0.1秒游戏帧，原生默认预算本次每帧最多2批；自动触发索引8/9两轮，仅9更新价格。中途第69批JSON往返24,240,248字节后续跑，调度/经济状态保持；最后一轮216批/65人口/1235价格，通知在时钟推进前按8tick→9tick→month排序。
- **真实回放的通知接收器仅记录顺序，不执行工资/债务/报告/自定义生产**，产物明确monthlySettlementImplemented=false、readyForAuthority=false。因此此次证明的是自然调度→实际经济任务→时钟接线，不能称完整自然世界或月末结算已完成。没有为缺失依赖提供默认空回调。
- 仅既有三个检查文件中5条定向短场景约1.4秒，类型及5改动文件lint通过；真实捕获回放一次约13.6秒，无新测试工程/全量/Java大差分。源campaign.xml、descriptor.xml与capture哈希未变。结果：artifacts/campaign-native-live-schedule-report.json（ignored）。
- 下一关键接线：CoreScript/MonthlyReport等真实经济tick与monthEnd接收者、玩家工资/仓储/殖民地账目及债务/生产，随后其它Market.advance与全世界保存。UI/桌面不变，未使用子代理、暂存、提交或发布。


## 2026-09-21：真实月度账本与CoreScript收支（实现前对照）

- 原版0.98a-RC8 MonthlyReport.java:82–91按LinkedHashMap顺序递归float汇总，每个节点先取自身income/upkeep再累计子节点；getNode:115–130惰性创建，不按ID排序。SharedData.java:33–57的current/previous可惰性创建，rollOver保留旧current对象为previous而创建新current。
- CoreScript.java:787–898每经济tick累计1/economyIterPerMonth：船员/陆战队、全部军官、仓储、玩家殖民地产业/出口、全部管理员。船员费用先int乘法再float；仓储货物/舰船分别截成int再合计；闲置管理员工资再乘idleAdminSalaryMult。Misc.java:3710–3729工资来自管理员tier或军官level/佣兵标记，不凭市场数量估算。
- CoreScript.java:725–768：先按已存在的账单节点计激励并清零，继承旧债务，再执行自定义生产，然后rollOver、写时间/旧债、汇总。净额与玩家现金分别截为Java int，再做float相加；负余额变债务、现金归零。没有生产实现时不能静默跳过；doCustomProduction:552–560只有真实集合点或storage为null时才原版提前返回。
- 本轮先接真实MonthlyReport持久化、CoreScript账目运算及共享市场/激励/现金状态。捕获沿modAndPluginData.persistentData的core_CEFSSharedDataKey定位SharedData并核对CoreScript.shared，不遍历任意反向引用或执行存档代码。已有非资源/舰船/监听器缺口保持明确，不冒充全体月末已完成。
- 本轮不修改报告UI，旧截图没有覆盖账单完整交互，视觉/实机仍待验证。沿用既有短检查文件，不新增测试工程；全部后台、无桌面/子代理/提交发布。

### 本轮结果：CoreScript账目不再只是通知记录

- 新增OriginalMonthlyReport：保存有序FDNode树、原始float收入/支出与缓存汇总；getNode保持节点身份和插入序，computeTotals逐节点float累加，不信任存档缓存。支持current/previous惰性创建和原对象rollOver。
- 实现CoreScript tick中的船员/陆战队、军官/佣兵、仓储、玩家殖民地产业/出口和管理人员薪资累计；读取动态getter输入，不拿上月账单当工资。MutableStat.getModifiedInt源码明确使用Math.round，共享产业财务接点按此取整，不与Java强转混淆；仓储/净收支/现金则按源码分步骤截为int。
- 实现CoreScript monthEnd激励入账/清零、前债继承、生产前置、报告滚动、时间戳、现金/债务更新。保留“市场账单节点custom为空时不记激励、但仍清零该市场激励”的源码分支。生产回调必须同步完成，未提供时拒绝并poison整个共享草稿，不默默跳过。
- 现有财务导入器增加工资/仓储配置与MonthlyReport节点常量，原版来源48→52个，既有来源断言同步更新。中文账单节点名称来自本机原版，未渲染或改动UI；月末消息只进入待消费outbox，未冒充界面通知已显示。
- 新的只读捕获沿实际SharedData/CoreScript引用恢复本月/上月报告、玩家MutableValue现金，验证FDNode.parent但不递归反向引用；其它元数据以标量/源对象引用保留。保存的工资/舰队动态额外人员并未被猜成零。
- NativeLiveEconomyDraft.reportCoreEconomyTick/reportCoreEconomyMonthEnd接入当前同一市场财务、缓存出口getter、激励和原生时间；账单/现金进入版本3完整Web checkpoint。旧版本1/2不补虚构账本。其它sector/managed监听器仍需按原顺序接入；默认自然帧通知能力要求不取消。
- 实际捕获：65市场，本月7节点/上月8节点、SharedData/CoreScript引用一致。对保存的本月账单执行一次独立CoreScript月末回调（**不是从月初自然运行一整月**），验证真实production.gatheringPoint为空且当前无玩家市场，因此符合原版提前返回，而非传空生产替身。旧current成为previous、保留现金对象、空新current、1条待显示月报消息；17,207,008字节checkpoint恢复不改变账目。源campaign.xml、descriptor.xml及新capture哈希未变。
- 产物：artifacts/native-save-monthly-capture.json、artifacts/campaign-native-live-monthly-report.json（均ignored）。后者明确其它经济监听器未执行、完整舰队生命周期未恢复、readyForAuthority=false。没有披露私人名称或现金数额。
- 验证只复用既有文件：2条旧导入/断点兼容场景，加来源自检与2条定向账目场景；覆盖实际共享产业Math.round收入、激励、节点顺序、债务、生产前置、教程无动作、保存恢复。短检查约0.5秒；类型/8文件lint/导入--check通过。首次捕获命令存在字符串换行语法错误，未读写存档便退出，已修正；未新增测试工程、Java大差分或全套回归。
- 仍未完成：真实舰队/军官/管理员/仓储动态getter的默认适配、全体月末监听器（如学院津贴/日志/本地资源）、完整自定义舰船武器生产、月报UI与全世界加载/联机准入。下一步接真实接收者/读取依赖，不把当前单CoreScript回放当整个月结完成。

## 本地资源的月末取用账单（2026-09-21，实施前对照）

- 原版 0.98a-RC8：LocalResourcesSubmarketPlugin.java:343–397，只有最后一个经济 tick 执行；先检查监听器是否已失效。玩家市场以 taken.createCopy → taken.removeAll(left) → left.removeAll(copy) 互抵，再按 taken 堆栈顺序记账；所有市场最后 taken.clear。monthEnd 本身只检查过期，不重复收费。
- MonthlyReport.java:132–181：RESTOCKING 属于 OUTPOSTS 下面的共用“账单”节点，不是每市场一个；其 custom2 是真实 cargo，商品子节点 custom2 是累计 float，tooltip 保存实际商品引用。非空旧报告必须恢复这些对象，不能创建空对象替换已保存数量。
- LocalResourcesSubmarketPlugin.java:252–262：取用单价 max(1, Math.round(basePrice * stockpileCostMult))；先 float 乘法。数量小于1时账单 tooltip 及计费量补至1，不能改为简单净取用总数乘价。
- CargoData.java:91–103,158–162,460–463：copy 通过逐堆栈 addItems 重建，不拷贝 partials；removeAll 按 getStacksCopy 顺序移除；clear 只清 slots，不清 partials。仅资源货舱；不将未知非资源复制/抵扣规则当作已支持。
- 当前差异：已有经济 update 监听器对象，但取用/归还货舱未解码，尚无与共享月报连接的真实 tick 回调。此次直接补捕获、回调与断点保留，不用另造费用表。自然调度完整 managed 名单仍单独待接，不把一个接收者冒充全部月结。
- 界面来源/验收：本轮不修改 UI。源码仅能证明账单层级与文案；用户已有截图不包含展开的库存月报，视觉状态待许可后核对，不启动原版/浏览器、不截图。
- 验证：仅已有定向检查中的两个短场景、类型检查；不新建 oracle、不跑全套。原版存档只读，生涯不暂存/发布。

### 本轮接线结果

- 已只读解码 LocalResources 的 taken/left 与 ListenerManager 持久注册表；真实存档得到65市场、8个update监听器、17项manager注册，本地资源实例的两份货舱均无未解决引用。两类注册表不再混用；expired月回调仅移除manager注册。ObjectRepository.java:33–46,88–122证实按saved顺序readResolve/add并去重；该来源加入捕获指纹。17项注册不代表17项均是经济监听器，完整分类/分发仍未完成。
- 已补实际最后tick接收者，按原版copy/互抵/计费/clear顺序修改同一监听器货舱与共享账本；货舱partial在clear后保留。非玩家市场不收费、不消耗归还额度；monthEnd只处理失效。
- 月报支持恢复真实cargo与Float数量元数据；多个殖民地写同一个OUTPOSTS/RESTOCKING节点，保留逐堆栈float累加、不足1单位的账单规则和商品句柄。费用随既有CoreScript月末进入现金/欠债结算，断点同时保留货舱、注册和账单。
- 新入口：NativeLiveEconomyDraft.reportLocalResourcesEconomyTick(ref,iteration) / reportLocalResourcesEconomyMonthEnd(ref)。调用方必须按真正managed名单分发；未将全部manager注册都当成本地资源回调，也没有把尚未实现的其他监听器设为空函数。自然整月/权威世界仍未完成，readyForAuthority仍false。
- 只执行2个相关短场景（库存月末及已有Core账单结算）、类型检查及9个改动JS文件lint，均通过；没有Java差分、新测试工程或全套。一次食品单价期望写错，按原版reference纠正为20后通过。没有UI/实机验收，不宣称全生涯完成。

## 自动月结通知链（2026-09-21，实施前对照）

- 原版0.98a-RC8 CampaignEngine.java:getAllListeners/reportEconomyTick/reportEconomyMonthEnd 依次复制常驻、transient、TimeoutTracker名单；ListenerUtil.java:158–168再按EconomyTickListener接口取manager快照。已核对实际4个sector对象：CoreScript有收支副作用，其余3个从BaseCampaignEventListener/BaseEventPlugin继承真正的空经济回调，不是用空实现代替未知逻辑。
- 实际manager有17项，但只有LocalResourcesSubmarketPlugin、PlaythroughLog、GalatianAcademyStipend实现EconomyTickListener。OfficerManagerEvent虽然继承同名方法，却不实现该接口；基地是EconomyUpdateListener，不是EconomyTickListener。其余类及BaseHyperspaceAbyssPlugin/DisposableFleetManager→PlayerVisibleFleetManager→BaseLimitedFleetManager继承链已核对。未知或MOD接收者必须显式未支持，不能按类名忽略。
- PlaythroughLog.java:90–106,146–160,187–246,253–279与BasePLStat.java:getValueForAllAccrued：tick记录九项实际getter；月末不是平均数，而是选择与上期差值绝对值最大的已累计样本，同差取最先；清累计后追加clock timestamp快照。Long减法/abs可能溢出，保存为十进制字符串保持64位。readResolve恢复已有累计与压缩历史，不重新initStats覆盖；BaseTiledTerrain.toHexString实际是Base64，原版按100字节块分别编码后串接，不能用一次Buffer.from在首个padding处截断。
- GalatianAcademyStipend.java:28–60：enableStipend关闭则直接返回；仅最后tick判定elapsedDays>1115或ancyra_market不存在，先退注册并unset旗标，否则将GA_stipend收入赋值15000（不是累加）。monthEnd原本为空。由原版导入器读取这些常量/开关。
- 当前差异：自然帧目前只接受外部4个回调；本轮补真实名单/历史捕获和内部默认分发，调用已有Core账本、本地货舱回调并实现津贴/记录。玩家舰队、仓储、生产动态getter继续必须由真实适配器提供，不能从上月账单倒推或默认0；不以本轮替代完整舰队生命周期。
- UI：不新增/改变布局；月报及游玩记录的展开截图尚缺，视觉验收待许可。仅源代码证明本轮内部层级/文案和行为，不启动可见窗口。验证限已有检查文件中的相关短场景和类型检查，不新建测试工程。

### 自动通知链本轮落地

- 新的经济通知捕获已按接口/继承核实并分离sector与manager角色；真实65市场存档为4个sector接收者（Core+3个源码空回调）、17个manager注册、其中3个经济tick接收者。PlaythroughLog的9项统计、4期历史和72个未结算样本完整恢复；无通知捕获unresolved。未重跑原版构造器、未清掉旧累计。
- 新增OriginalEconomyNotifications生产模块，实现名单快照分发、PlaythroughLog按原版最远样本/64位溢出语义归档、学院津贴赋值/失效退注册与旗标清除。通知共用既有MonthlyReport、CoreScript、本地资源货舱及原生clock，而不是旁路账本。修复本地账单只接受保存商品的问题：对已在共享市场真实创建的商品，复用Core账本相同的稳定运行期句柄，不补库存。
- NativeLiveEconomyDraft.advanceNativeScheduledFrame现可使用{settlement:真实依赖}自动按sector tick→manager tick→sector monthEnd→manager monthEnd执行；原有{notifications:外部适配器}仍兼容。首次推进后固定通知所有者，避免中途换模式漏结或重复结算；启用原生通知链后禁止绕过它直接手工调用Core/LocalResources回调。
- Web离线checkpoint内部版本升级到4，保留通知历史、津贴旗标与管理器退注册状态；v1–v3迁移不虚构通知历史，已推进的旧日程继续归为external-adapter。恢复不重放收入或重复清空库存，且核对Core账本、本地货舱和manager对象绑定。原版读档后引擎初始化新增的transient回调、非空TimeoutTracker生命周期仍不在当前恢复覆盖范围，遇到捕获中的非空timed名单明确未支持。
- 新只读捕获：artifacts/native-save-notification-capture.json（Git忽略）。重新读取源文件并核对前后未变；复用既有clock证据前核对campaign/descriptor哈希一致。真实通知状态checkpoint往返完全一致。**没有拿存档缓存工资充当实时舰队getter，没有在这份真实存档上用虚构依赖冒跑整月。**
- 本轮仅3条相关短场景（约0.8秒）、类型检查、10个改动JS文件lint通过，没有新测试工程、Java差分或全套。两市场自然帧验证实际工资/资源账单/Core生产前置/现金/记录按顺序落地，缺Ancyra时津贴移除；定向边界验证1115天仍发、重复tick赋值不翻倍、收入进入现金、旧累计优先及long极值，断点恢复后不重复月结。
- 剩余关键接线：为settlement提供真实当前舰队工资、部署点、货舱与仓储getter和自定义生产执行（当前明确依赖，绝不默认空）；完整舰队同步/Market.advance、内存其他生命周期、正式世界发布和原版UI仍未完成。readyForAuthority=false，未提交/打包/发布。

## 实时仓储费用来源（2026-09-21，实施前对照）

- 原版0.98a-RC8 Misc.java:3560–3563,3634–3655：storage必须存在且getOnClickAction(null)==OPEN_SUBMARKET；货物逐堆栈size×getBaseValuePerUnit后逐次float累加，舰船逐成员getBaseValue累加。不是卖出报价、不是保存的总价值缓存。CoreScript再分别对货物/舰船费用截int，不能先合计再取整。
- StoragePlugin.java:getOnClickAction只看playerPaidToUnlock（保存paid）；BaseSubmarketPlugin.getCargo在null时真实创建空货舱并创建所属子市场势力的封存舰队。此时允许惰性创建，不把缺失证据当空；已有货舱必须保留。
- CargoItemStack.java:getBaseValuePerUnit：资源/武器/LPC分别是spec基础值截int；特殊货物必须调用真实plugin.getPrice(null,null)，不能套普通商品价。WeaponSpreadsheetLoader/FighterWingSpreadsheetLoader读原版基础值倍率。
- FleetMember.java:getBaseValue不看损伤/CR/卖价倍率：非内置武器按HullVariantSpec HashMap键顺序累加，非内置联队按list顺序累加，最后加船体基础值。HullVariantSpec.setHullSpec/readResolve恢复内置装备；getNonBuiltInWings仅非空联队参与内置数量计数。皮肤覆盖先baseValue再double baseValueMult截int；原版自动_default_D基础值×0.75f。
- 先落地storage当前对象/准入/估价并接入默认settlement，舰队同步继续保留真实依赖。已核实cargo的extraCrew/Marines/Fuel/Supplies只有交易界面写入，舰队同步仍有统计/内置配装副作用，不能因为当前存档无军官就写死空名单。带联队的存放舰船若会受updateStats影响，必须取得真实生命周期适配结果，不冒用保存缓存；未知特殊货物插件同样显式依赖。
- UI不改，原版仓储付款对话框与月报展开态缺同状态截图，待许可再实机核对；不能将此内部计费接线当成仓储交易UI已完成。验证仅现有短场景与类型检查，私有捕获只读并限ignored artifacts。

- 导入重复定位：module_bastion_pd1.ship 与 module_bastion_pd1_lowtech.ship 共用 hullId；ShipHullSpecLoader.o00000(String) 在已存在ID时直接返回。两者本轮价格投影（船体CSV键、内置武器/联队）完全一致，导入器仅允许这种不依赖目录顺序的等价重复并保留来源；非等价重复仍拒绝。ShipHullSpreadsheetLoader/ShipHullSpecLoader在stock variants前创建 _Hull；SpecStore跳过已存在variant ID。

### 当前仓储接线落地（2026-09-21）

- 修复未完成的静态导入器，生成 reference-storage.json：163武器、31联队、532船体（含默认D）、710配装；两个无ship_data行的资源保持unsupported，不造默认价格。新增 _Hull 空船体配装、原版重复ID跳过的等价投影处理，保留文件来源哈希。HullVariantSpec的stock构造先内置装备再普通装备，外部wings从内置数量后的索引开始；SHIP克隆后的HashMap容量/桶顺序与savedVariant的readResolve分开处理。
- OriginalStorage生产模块读取当前stack大小、资源/武器/LPC基础价格和实际存放member.variant。遵循每步float、base值转int及最后加船体价格；SPECIAL要求真实getPrice(null,null)，有联队的成员要求真实updateStats后的当前配装，不默认零、不借出售倍率或上期金额。HashMap链顺序/resize按原版恢复，未支持树化碰撞明确拒绝。
- captureNativeOpenRetail在storage保留paid、势力、货物、封存舰队及成员/配装源引用；非资源stack额外捕获itemId。缺省wng按照HullVariantSpec.readResolve创建空list。陌生插件/成员不丢弃，保留明确unresolved。没有将这些估价投影冒充完整FleetMember/FleetData统计同步。
- NativeLiveEconomyDraft默认hasStorageAccess/readStorageValues改读本事务storage，不再要求调用者提供总价。工资/管理员/生产依赖不受影响。货物/stack、舰队/member/variant按源身份与共享草稿绑定；惰性创建只用于原版确实为null的仓储货舱，创建真实空库存和所属势力封存舰队。checkpoint保留当前对象/收费状态，恢复不重新计价、清空或重放结算；旧retained-only仓储需要重新捕获，不当成空库存。
- **纠正上一轮只遍历XML对象得出的计费范围推断**：当前相同哈希原存档有65个注册经济市场，59个标准仓储均未解锁；四个paid仓储属于未注册经济市场。CoreScript只循环Economy.getMarketsCopy，不能给这四处强加月费。用生产捕获/估价接口只读恢复了这些地点的3艘存放船及货物，2处走证实的惰性创建，但它们未加入经济收费名单。
- 新忽略捕获artifacts/native-save-storage-capture.json用于后续接线（复用clock证据前验证campaign/descriptor哈希）；artifacts/native-storage-readback.json保存非经济仓储开发读回。源存档前后逐字节不变，65市场共享checkpoint往返一致；没有使用假舰队适配器回放真实自然月，没有输出私人名称/金额。
- 验证限现有check-campaign-native-save的3条相关短检查（约0.6秒）、campaign类型检查、本轮JS定向lint；包含库存变动即影响下次计费、paid/惰性创建、特殊插件缺失拒绝、载机配装生命周期缺失拒绝与断点不重复账单。无新测试工程/原版探针/全套运行。
- UI完全未改，仓储付费/交易UI、非经济市场加入正式world、舰队真实工资/部署点/货舱统计、自定义生产、完整Market.advance与联机权威世界仍待接齐；readyForAuthority=false。未操作桌面/启动可见窗口/使用子代理/提交/打包/发布。

## 玩家人员与工资输入（2026-09-21，实施前对照）

- 原版0.98a-RC8 CoreScript.reportEconomyTick读取playerFleet.getCargo().getCrew/getMarines、FleetData.getOfficersCopy以及CharacterData.getAdmins；军官工资用当前Person.stats.level与Misc.isMercenary，不以是否上舰过滤。管理员是否上任取AdminData.market指针本身，不用玩家殖民地名单反推；显示当前姓名/当前市场名。
- CargoData.getCrew逐stack float累加crew后转int；getMarines分别把资源总量和transient extraMarinesUsed转int再相加，不能先加后截断。getSupplies将extraSuppliesUsed先转int，fuel不截断；PLStatCrew同getCrew而非getTotalCrew。extra字段为transient，读档初始0，之后必须保留实时变化。
- FleetData.readResolve明确setSyncNeeded；getCargo明确syncIfNeeded，其中包含advanceInCampaign(member,0)、buff和logistics回调。不能仅凭静态库存相同就宣布完整舰队同步已恢复。本轮接实际人员/货舱对象；工资/货舱读取前仍要求真实舰队同步服务，绝不默认no-op或擅自清needsSync。管理员/军官名单、玩家等级、教程标记本身不依赖舰队统计。
- FleetData.readResolve/getOfficers仅对真正null的军官列表创建空list；PlayerCharacterData.readResolve对null管理员列表创建空list。不是当前存档没军官就把整个规则写死为空。FullName.getFullName为(first+空格+last).trim，保留人员身份与当前名字。
- Misc.isMercenary读取getMemoryWithoutUpdate().is('$isMercenary',true)，走Memory.getBoolean的字符串trim/小写判定；管理员tier为Memory.getFloat('$ome_adminTier')转int，key不存在时为0。按工资读取路径不自行advance记忆过期；保留期限供世界生命周期接线，格式解析未覆盖时显式拒绝，不猜级别。
- TutorialMissionIntel.isTutorialInProgress仅检测Sector Memory.contains('$tutorialRespawn')，值为false也仍代表教程中。仅接实际标记，不改教程行为。UI不变，同状态工资明细截图仍待许可；只运行当前改动相关短检查，私人存档只读。

### 玩家人员本轮落地

- 新增OriginalPlayerEconomy与原生人员捕获，保存当前Person/FullName/CharacterStats、军官和管理员名单、管理员实际市场引用、教程标记及玩家货舱。JSON捕获按源objectRef恢复共享人员/统计/记忆身份，禁止互相矛盾的同ID数据；不是从上月工资逆推人员。姓名按Java trim保留语义，记忆期限保留但不擅自推进getMemoryWithoutUpdate的时间。
- NativeLiveEconomyDraft有完整人员捕获时，默认读取本事务人员/货舱，调用方不能用外部工资名单或等级覆盖。管理员任职指针绑定同一市场对象，改市场名/人员等级/雇佣标记直接影响下次月报。玩家货舱credits与MonthlyReport现金是同一个对象，月底支付不会出现两份余额。旧/不完整捕获仍允许原有显式外部适配器，不静默伪造人物。
- 读档后FleetData.needsSync始终按readResolve设true，不能信保存的nS=false。新增synchronizePlayerFleet依赖只负责缺失的真实同步生命周期，不返回工资/货物缓存总数；必须更新同一fleet状态后才能读取货舱数量。当前尚无完整默认舰队同步服务，因此**真实存档的船员工资自然月结仍未通，不宣称完整工资接线完成**。军官名单/管理员薪资/等级/教程标记已直接可读，部署点仍为外部真实统计依赖。
- CargoData规则覆盖船员整体截int、陆战队资源与extra分别截int相加、supplies额外值先截int、fuel额外值不截int；不把extraCrew当船员工资人数。同步完成后关闭对应cargo源恢复缺口；其他origSource/未知生命周期依然拒绝。读取cargo spaceUsed仍要求同步服务真实更新，不用保存的sU直接过关。
- 共享checkpoint内部升级v5，v1–v4迁移不虚构玩家人员，保留同步是否完成、人员变更、管理员引用和共享现金；恢复不重跑工资/同步。测试场景中的同步后端明确仅用于空成员样例，未提供给真实存档。
- 真实只读捕获artifacts/native-save-player-economy-capture.json保留65市场及4个玩家cargo堆栈；此存档当前军官/管理员名单均为空（规则支持非空名单，非写死）。源文件与描述文件前后逐字节不变；既有clock证据按相同哈希复用，checkpoint往返一致且同步状态仍pending。不输出私人名字/金额，捕获只在Git ignored目录。
- 只运行现有检查文件的3条相关短场景（约0.6秒）与类型/改动文件lint。非空军官与管理员使用源字段样例验证：共享同一Person、雇佣字符串、级别变化、上任/闲置薪资、tutorial值false但key存在仍跳过、断点身份和现金相同。不新增测试框架、不跑全套。
- 下一关键路径：实现实际FleetData同步（含技能、舰船插件、buff、0秒advance回调）及部署点/货舱统计，再接自定义生产与完整世界生命周期/UI；不要继续围绕缺失后端叠适配器或用no-op跳过。生涯、原版UI、独立/合作联机、势力/殖民地总目标仍未完成，readyForAuthority=false。

## FleetData同步主干（2026-09-21，实施前对照）

- FleetData.syncIfNeeded顺序：load-order guard/只更新名单分支 → commander.stats.setFleet → syncMemberLists → 每成员updateStats → 指挥官fleetwide效果 → recrew → 全部已注册hullmod.onFleetSync → FP/strength → cargo capacities/space → travel → logistics.advance(0) → buff.advance(0)与每成员每mod.advanceInCampaign(0) → crew/CR统计、buff.apply、repair.updateRates → fleet counts/size与fleet_burn_bonus →解除forceNoSync/needsSync。这里不能把0秒回调视为空。
- syncMemberLists的正常名单保留原members顺序、排除type=NULL、重新setFleetData；另建sorted名单。反编译比较器两次读取第一个成员的hullSize看似错误，已用本机jdk-17 javap核对starfarer_obf.jar的FleetData$1：确实两次aload_1，故当前原版按FP降序稳定排序，不擅自“修成”船体大小排序。
- recrewFleetMembersV2按真实当前minCrew逐成员求和，ratio最大1；逐成员Math.round(minCrew*ratio)再min(remaining)，因此顺序影响短缺分配。封存船清crew composition；AI舰队非玩家指挥成员给满员，存在玩家指挥成员时仅给这些成员分配玩家cargo.getCrew。不能把分配到船上的crew从货舱扣除。
- FleetMember.getFuel/CargoCapacity先computeEffective再int；minCrew先乘战机数再ceil；maxCrew先int后乘战机数。getFuelUse本身乘战机数，FleetData.updateCargoCapacities又乘一次，按原版保留该行为。总燃耗为0时保存1；cargo space逐stack cargoSpacePerUnit×size，最后加extraCargoUsed。
- 部署点从suppliesToRecover.base（非modified）经dynamic deployment_points_mod、Math.round再乘战机数。空舰队travelSpeed为200；其他取最小modified maxBurn，经舰队bonus与原版减益取整修正、0..20钳制，再以baseTravelSpeed/speedPerBurnLevel和指挥官travelSpeedBonus计算，burn<=0改minTravelSpeed。
- 本轮实现这些同步主干运算、基础统计数据与真实成员输入，不伪装已完成所有技能/舰船效果/CR/buff/repair/logistics后端。只有所有必需阶段确实运行成功，才允许把共享fleet标为current；缺失阶段不能以默认no-op越过。UI不改，继续只后台源文件操作和相关短检查。

### FleetData同步主干本轮落地

- 新增OriginalFleetData生产模块，按原版完成成员原顺序与独立排序、短缺船员逐成员分配、封存船船员清空、基础StatBonus/MutableStat物流getter、容量/燃耗/空间汇总、航速与部署点计算；明确保留战机燃耗的两次倍乘与DP不使用suppliesToRecover.modified的区别。
- 现有船体导入器同时生成reference-fleet-sync.json，直接从原版CSV/.ship/.skin读取基础参数及皮肤FP/恢复补给覆盖，默认D保留继承参数；没有把旧native-catalog已变换数值当权威。武器空间读取原版2/4/8常量，LPC为1，特殊物品读取spec货舱空间；仓储估价对SPECIAL的真实price插件要求不变。
- 共享player fleet捕获增加实际成员、配装、repair/mothball、captain/commander引用、stats/logistics引用与AI模式。静态货物空间可真实重算，未导入保存stat缓存来冒充当前技能效果。member.stats仍明确null，恢复后的crew初值按FleetMember.readResolve为100000，后续recrew才分配实际值。
- 同步入口现在可接nativeFleetServices，由生产模块自己执行原版完整顺序，后端只承接真实技能/舰船效果、buff、CR/repair、logistics与fleet counts等阶段。每次updateStats先标rebuilding，后端不更新就不能沿用旧current标记过关；成功后同一member的配装估价生命周期也转为current。forceNoSync期间允许原版同步回调重入读取货舱，但此阶段不允许checkpoint宣称完成；末尾成功才把fleet标current。
- NativeLiveEconomyDraft新增readFleetDeploymentPoints；拥有新原生成员捕获时，游玩记录直接读同一批已同步成员的DP，不再要求外部总表。旧捕获保留显式适配兼容。捕获与checkpoint验证缓存成员名单必须共享实际member对象，而不是另外复制船只。
- **仍未完成默认技能/舰船插件/CR/buff/repair/logistics后端。**本轮不是完整默认舰队同步已可运行；真实存档仍在native-read-resolve-pending，不能自动整月结算。测试中的有限合成后端只验证本轮主干运算/顺序，未用于真实存档，不宣称原版效果等价。
- 只读实际捕获artifacts/native-save-fleet-sync-capture.json保留65市场/3个玩家成员；使用生产代码建立成员列表与重算货物空间，库存数量未改。checkpoint中名单与member身份往返一致，源campaign/descriptor逐字节不变，仍保留所有成员stats=null。未打印私人舰名/金额。
- 本轮仅现有检查文件3条相关短场景、类型/定向lint；另一次javap仅用于核对反编译比较器，不启动游戏、不生成原版测试工程。剩余关键路径是把实际CharacterStats与HullMod/RepairTracker/BuffManager/FleetLogistics实现填入同步服务，而非继续增加总量适配器。UI、world、联机总目标未完成，readyForAuthority=false，未提交/发布。

## 成员实际基础统计、船员/CR与修复率（2026-09-21，实施前对照）

- 原版0.98a-RC8：FleetMember.java:306–369/497–515/665–709；combat/entities/ship/o0OO.java:300–355及各统计字段初始化；RepairTracker.java:88–92；CRPluginImpl.java:42–54/123–196/200–280/315–358。成员更新不能仅将base-only改成current：必须先建立真实MutableStat/StatBonus、技能和插件，再应用船员、CR、封存、动态统计清理与repair rates。
- 本次先落地可直接执行的基础统计、完整campaign CR修正、缺员恢复惩罚和修复率后端；技能分发继续按CharacterStats.java:787–799/881–893/963–970/1037–1041的原名单及效果索引接入。未知效果保持明确未移植，不能空回调冒充完成。
- 基础恢复率来自ship_data.csv的cr %/day（旧repair %/day仅在前者无列时回退），船体维修率来自baseRepairRate按船体级别选择；皮肤仅覆盖源码明确的属性。DynamicStats的stats默认base=1，与mods默认computeEffective(base)分开存放。
- CR：普通/重大故障阈值带-0.001f；机动、承伤、伤害、战机整备及自动开火精度均逐步float计算。FIGHTER只跳过故障分支，不跳过性能修正。crew fraction还受AI/玩家指挥覆盖、毁损船体和minCrew影响。updateRates用modified恢复率计算recovery，用base恢复率计算decrease。
- 当前UI不改动，已有截图无法验证这组后台状态；原版实机和界面视觉仍待许可。仅执行相关短检查，不启动可见窗口、不新增测试工程、不提交发布。

### 本轮实施结果

- 新增OriginalFleetMemberStats实际后端：原版145个独立MutableStat/StatBonus基础字段、3组原版getter别名，外加兼容现有FleetData getter的共享别名；源字段类型/常量由已有storage导入脚本读取引擎源码，16个上下文初值来自实际船体CSV/皮肤/settings。不从存档统计缓存恢复current。
- CRPluginImpl的campaign属性路径已实现：缺员最高CR惩罚、恢复倍率、普通/重大/护盾故障、机动、伤害/承伤、战机整备、自动开火精度；FIGHTER保留原版跳过故障分支。特别核实RepairTracker.java:280–284：生效CR为保存CR×当前crew fraction，除非真正有crOverride。不是直接用保存cr。
- FleetMemberStatus.java:getHullFraction逐模块float累加后平均；AI/玩家指挥覆盖及毁损船体分支已保留。原生捕获增加status模块船体、transient forceNoMoreStatsUpdates=false和CR override/rates初值。缺少这些输入的旧捕获不能冒充已恢复。
- RepairTracker.updateRates真实后端已接入FleetData默认收尾，分别用modified/base恢复率计算recovery/decrease；船员重分配清crew_fraction修饰符，解除封存按原版删除同ID全部通道。初始和recrew两个updateStats入口现在都拒绝沿用旧current的空后端。
- 复用的统计运算原先仅接受ASCII ID，不能容纳原版“crew understrength”和中文CR键；放宽为有界、不含控制字符的字符串，保留prototype保留字拒绝和重复来源保护。不改float运算顺序。
- 仅扩展并运行已有native fleet core一个场景，核对缺员CR/恢复、补员撤销、override、毁损、fighter、动态清理和别名/空重建保护；最终通过。类型检查与6个改动JS文件lint通过。首轮暴露ID过严并已修复，另一个断言写死旧船体航速已改为实际导入base，没有新测试工程/全套测试。
- 实际只读捕获写入ignored artifacts/native-save-member-stats-capture.json：65市场/3成员，新的crew/CR输入齐全，源campaign/descriptor前后逐字节不变，stats仍null、fleet仍native-read-resolve-pending。未用合成插件运行真实完整同步。
- 剩余：CharacterStats技能、当前配装mods/suppression/S-mods及HullMod效果、BuffManager、FleetLogistics和完整修复advance，才能使updateStats及整条默认同步真正完成；本次基础统计/CR/rates不是这些阶段的替代。world/UI/联机及自然月仍未完成，readyForAuthority=false；无桌面/子代理/暂存/提交/推送/发布。

## 当前配装与CharacterStats成员效果（2026-09-21，实施前对照）

- 原版0.98a-RC8 HullVariantSpec.java:120–142/897–905/1007–1017/1038–1085/1226–1241：saved hullMods本身是LinkedHashSet有序名单，readResolve仅按setHullSpec补内置插件；不是把perma/sMods重新并入。stock则先内置，再hullMods、permaMods、sMods，最后suppressed移除。S-mod和S-modded built-in要分别保留。
- CharacterStats.java:416–496/735–740/787–799/881–893/963–970/1037–1041：技能名单按原JSONObject HashMap桶序恢复，有效等级直接读名单；个人SHIP与全舰队ALL_SHIPS_IN_FLEET效果按原顺序/真实索引调用，舰队效果跳过FIGHTER。SkillSpec.java:103–141要求保留非ship效果索引，并处理HULLMOD_UNLOCK压缩。setFleet仅设置实际句柄（412–414），不能用它冒充全角色refresh。
- 本轮补捕获与实际updateStats后端，直接实现已核实技能/船体插件效果；未知效果明确拒绝，不能以物流投影或空回调放行。FleetMember.java:306–361次序仍为个人/舰队技能→全部当前插件→电容/散热→crew/CR→封存→dynamic清理→修复rates→无甲板清wings→设fleet dirty。
- UI本轮不变；这些源码只证明后台，不证明实机视觉。仍不启动可见窗口、不占用电脑、不用子代理、不新增测试工程或全套检查，不提交发布。

### 本轮实际接线结果

- 配装捕获不再只有估价字段：保留hullMods/permaMods/sMods/sModdedBuiltIns/suppressedMods、散热/电容、tags和有序模块表。saved不把permaMods误加回；stock按构造顺序添加后再抑制。船体内置mods保留List语义（含可能重复及skin逐次remove），进入variant时才按LinkedHashSet去重。模块JSONObject用已有HashMap恢复顺序，数组格式保留顺序。
- 真实玩家、军官、舰长和指挥官共享同一Person/CharacterStats，skills从原序列化s恢复，statPeople随JSON恢复重新绑定，与玩家/admin/officer身份不分裂；未声称完成全角色refresh及其舰队/监听器副作用。
- 新OriginalMemberEffects.updateOriginalMemberStats按原版执行创建→个人/舰队技能→插件→散热电容→crew/CR→封存→动态清理→repair rates→无飞行甲板清wings→fleet dirty。只有所有当前active效果成功才标成员current；失败留rebuilding，舰队仍pending。默认FleetData成员/指挥官调用已使用该后端，无需外部updateMemberStats空适配器。
- 已实现CombatEndurance和Helmsmanship在campaign属性阶段的8个效果，metadata按全部58技能的真实效果索引/门槛/作用域分发，含HULLMOD_UNLOCK压缩带来的索引变化。CombatEndurance$Level4源码apply为空，仅跳过这一确证的campaign阶段；战斗listener仍不是已移植。其他active技能保持明确未实现，不把未激活技能误报成必需效果。
- 已实现11种插件脚本：AuxiliaryThrusters、BlastDoors、ExpandedMissileRacks、HeavyArmor、IntegratedTargetingUnit、CivGrade及DegradedShields、ErraticInjector、FaultyAutomatedSystems、IncreasedMaintenance、CompromisedStructure。源码在core/data/hullmods及api/impl/hullmods。S-mod也读取sModdedBuiltIns；HeavyArmor普通版无机动惩罚（原代码那段是注释），S-mod才处罚；D-mod对suppliesToRecover逐项×0.8，maintenance仅在实际dmod_reduce_maintenance>0时同减。D-mod penalty float/Math.round顺序保留。
- 常量、hullSize表及注册script从原文件导入，未硬编码私人存档配装；允许显式替换效果实现，默认未知active脚本仍拒绝。UI不变、无实机视觉验证。
- 真实3成员现可直接执行生产updateStats和recrew，不注入synthetic services，全部成员stats=current，但整个fleet仍native-read-resolve-pending。源文件/库存不变，未完成global hullmod.onFleetSync、buff、logistics/strength等阶段，没有运行自然整月或宣称readyForAuthority。shared draft checkpoint往返及玩家身份/统计别名保留通过。
- 仅2条已有短场景（人员、fleet core）及类型/8文件lint；fleet core的精英Helmsmanship断言初次用错效果索引，按实际skill的Level4在index2纠正后通过，未改生产顺序来迁就检查。私人捕获artifacts/native-save-member-effects-capture.json及native-member-effects-readback.json为ignored。无子代理、桌面操作、暂存/提交/推送/打包/发布。

## FleetData全局插件与BuffManager（2026-09-21，实施前对照）

- 原版0.98a-RC8 BuffManager.java完整类：addBuff标成员dirty；addBuffOnlyUpdateStat仅删除首个同非null id后立即apply，不标dirty；removeBuff删除全部同id；advance先advance再检查expired，过期移除并标dirty。地形4类buff按days扣dur；TowCable.TowCableBuff按调用次数frames++，0秒也可能在第二次失效，不能跳过。
- SpecStore.java:2140–2148/2155–2160：通知不是遍历当前安装插件，而是按已注册spec的LinkedHashMap顺序筛选实现HullModFleetEffect且withOnFleetSync=true的对象。O00O.java:79–87返回实际接口实例。当前原版来源仅HighResSensors与PhaseField；导入须核对全部loaded脚本/父类，不能未知即空。成员advanceInCampaign(FleetMemberAPI,float)与全局CampaignFleetAPI重载分开。
- HighResSensors.java:136–166按非封存、CR>=0.1成员的hrs_sensor_range_mod计算递减收益；PhaseField.java:61–70及getPhaseFieldMultBaseProfileAndTotal/getTopKValuesSum按Top-K统计，应答器开启强制倍率1。Misc.findKth会原地分区，后续float求和不得随意改成降序排序。
- MutableFleetStats.java:161–228恢复被writeReplace省略的真正默认stat，不使用saved modified缓存；tempMod保留真实目标引用。BaseCampaignEntity的tOn虽transient，readResolve仍从j0恢复，不能猜false。
- FleetData.java:694–701里buff过期后getStats可触发一次真正updateStats，再继续CR/buff/rates；不把重建后的空buff表等同所有buff已支持。仅后台规则/捕获，无UI修改或实机操作。后勤advance(0)源码已定位LogisticsModule，不把它先行标为完成。

- 实施前补核：BaseCampaignEntity.j0 不是字段名映射；loading/String.java:48–161按参数位置写f0…，tOn对应f5，省略Boolean恢复false。读取f5而非猜测tOn。MutableFleetStats六个StatBonus、三个MutableStat和tempMod目标引用按CampaignGameManager.java:1981–2017恢复；DynamicStats.getValue(key,base)只读mods且不创建条目。

### 本轮实际接线结果（Buff／舰队传感器）

- OriginalMemberBuffs实现原版顺序的add、addOnlyUpdateStat（仅替换首个同id且不标dirty）、remove全部同id、advance先推进再过期、apply不自行判过期。4种地形buff和TowCableBuff有实际效果，TowCableBuff保留零天调用也计帧；未知active buff明确拒绝。成员dirty时通过真实getStats/updateStats重建，避免过期修饰符残留。
- HighResSensors与PhaseField的成员before属性及全局onFleetSync均接到默认后端。全局通知按已注册spec名单，不是按当前安装插件；HRS递减/逐步float/取整、PhaseField原地quickselect后的Top-K求和、低CR和封存筛选、应答器开启覆盖均按已查源码。PhaseField全局advance的Memory旗标仍未移植，不能宣称应答器切换的整条帧循环已完成。
- 导入已核实全loaded hullmod继承：成员advance只有TowCable非空，其它确证空实现可跳过；未识别FleetMemberAPI签名令导入器失败而非默认为空。TowCable成员拖曳选船逻辑仍明确拒绝，未用TowCableBuff已实现冒充整个插件完成。
- 新OriginalNativeFleetStats恢复3个MutableStat／6个StatBonus及dynamic双命名空间；临时修饰符保留实际stat/mStat目标、剩余时间和名单顺序，支持新增／覆盖／移除／到期。readResolve默认与真实保存修饰符区分，不使用saved modified缓存。这里的advance尚待自然帧生命周期接线。
- 原生捕获恢复buff有序名单与重复引用、fleet stats目标引用及j0.f5应答器；fleetwideMaxBurnMod与stats保持同一对象。JSON恢复补回member缓存／已知统计别名／buff对象及fleet临时目标身份；checkpoint保留原图共享身份。
- FleetData默认接入全局回调、buff、已核实成员空回调、fleetwideTotalMod，并补剩余玩家指挥官判断。【2026-09-21后续字节码纠正】此前误记onlySyncMemberLists保留forceNoSync=true；安装jar的syncIfNeeded在syncMemberLists之后明确复位false，见下文成员管理对照。
- 真实3成员在共享NativeLiveEconomyDraft中执行updateStats/recrew/全局插件/buff/成员空回调/fleetwideTotalMod通过，无synthetic services；库存不变，JSON和checkpoint后引用一致。完整fleet仍native-read-resolve-pending，后勤advance、强度、计数、完整角色refresh仍未接齐，readyForAuthority=false，未运行整月。
- 修正了开发中同名文件冲突：原有OriginalFleetStats后勤投影按历史创建内容和后续补丁恢复，并对照最近读取片段；新原生统计放在独立OriginalNativeFleetStats，未以新模型替换已有HUD/旅行provider。真实检查中一次给草稿另塞整份fleet导致人员身份断裂，改为直接操作草稿原共享句柄后通过，没有放松生产身份校验。
- 最终仅现有2条相关短场景、campaign类型、14文件lint及上述只读真实捕获接线。私人产物artifacts/native-save-fleet-effects-capture.json与native-fleet-effects-readback.json均ignored，源存档捕获前后逐字节核对不变。无桌面、键鼠、子代理、全套测试、暂存/提交/推送/打包/发布。UI本轮未改、未做实机视觉验证。

## 原生后勤与维修推进（2026-09-21，实施前对照）

- 原版0.98a-RC8 LogisticsModule.java:45–96：按陆战队→船员→维护/恢复→四种超载费用相加后乘days，先扣补给再逐成员修CR/舰体，最后扣燃料；不足但原库存>0时本步仍hasSupplies=true，不按余额比例缩短维修。days=0仍读取费用并创建隐藏燃料倍率stat，不能空返回。AI模式不扣库存但正天数推进维修。
- 同类:99–114、207–246：燃料求和读取船体fuelUseMod，不额外乘旧wing数量；基础维护按现存fighter数，部署恢复费用按wing总数。维护/恢复筛选使用baseCR与最大CR，不用乘缺员后的CR代替。CargoData.java:183–220保留extraSupplies取int、extraFuel不取整、crew/marines分别取int的差异。
- RepairTracker.java:124–197/206–227/357–400与RepairTrackerAPI.CREvent：逐步float、AI舰长过额CR夹取、缺补给事件按1天分段/7天后过期；维修完成调用真实消息接收器，不能在还没有UI接线时默认吞掉。getRepairRatePerDay读取真实舰队指挥官倍率，未恢复角色效果时依赖显式服务，不拿缓存当完成。
- FleetMemberStatus.java:271–328/866–973：所有模块repairFraction；永久脱离跳过，普通模块达到0.25/非活动模块0.75重新接合；舰体与装甲本步都修，装甲按y倒序/x正序消耗容量，恰好用完不立即清网格。状态未保存来自writeReplace仅省略完整状态，按真实构造数量惰性创建，不猜损伤。
- 预期差异：当前只捕获hullFractions，缺完整armor/脱离/CR事件/暂停维修与环境速度；本轮补捕获与规则并接同步默认advance(0)，正天数可使用当前真实共享状态。不改UI、不启动原版或浏览器；消息呈现、自然world帧与其它同步缺口仍单独记录。

- 本轮接线前补核：CampaignGameManager.java:1610/1618与save/oo…_cfr_7.java的float[]转换器把装甲每列写成竖线分隔文本（f-a），不是逐float子节点；ShipStatus.inactive是transient，读回必须置null。Person.java:148–149按aiCoreId是否为null判断AI核心；BaseCampaignEntity.java:968–972按实际containingLocation.hyperspaceMode判断超空间。补捕获这些输入，保留模块/CR事件重复对象身份；不凭缺字段合成已完成的世界帧。

### 本轮后勤／维修实际接线结果

- OriginalNativeLogistics已进入FleetData默认advance(0)分支；保留显式服务覆盖以供大改。维护、恢复、四类超载费用、库存partials扣除、正天数逐成员维修、超空间/普通空间燃料及隐藏倍率按原版顺序执行。0天仍计算费用并创建隐藏stat，AI模式不扣库存。
- OriginalNativeRepair实现保存CR恢复/下降、暂停维修、AI舰长夹取、缺补给事件分段与过期、逐模块舰体/装甲修复和接合阈值；恰好修满装甲时保留网格直到下一步，与原版一致。维修完成保留真实消息接收服务，不默默吞通知。
- 捕获补充RepairTracker所属成员核对、暂停/过往CR/losingCR和事件，完整ShipStatus及按f-a竖线格式的装甲列，实际环境速度/clock秒数、玩家舰队与AI核心身份。LogisticsModule所有者按CampaignGameManager.java:1715–1716实际别名f核对。
- crew fraction优先读取实际modules，hullFractions仅保留兼容投影；维修后统一投影，避免重复共享module因逐索引更新留下旧值。JSON恢复绑定共享status/modules/CR事件，统计动态目标仍保持身份。
- 两条既有相关短场景通过（含不足但本步仍修、断供CR、暂停维修、装甲扫描及JSON共享对象），campaign类型及8文件lint通过。未新增测试工程、未跑全套。装甲捕获格式经原版转换器核实，真实三成员本次无保存损伤状态，不把它当实机装甲验证。
- 真实3成员直接使用共享NativeLiveEconomyDraft句柄执行零天与0.125天后勤，无synthetic回调；库存原样推进，命中真实缺补给事件分支，不为验证另塞补给。零天不改货舱，JSON统计目标/成员和checkpoint人员身份保持。私人捕获/回读结果仅在ignored artifacts/native-save-logistics-capture.json、native-logistics-readback.json；源存档只读，前后SHA相同。
- 边界：完整FleetData仍native-read-resolve-pending、readyForAuthority=false；成员强度、fleet counts/size、CharacterStats.refresh尚缺。模块舰省略状态的创建及非null模块活动判定仍需真实服务；指挥官修复倍率与玩家维修完成UI仍需真实服务，不以保存缓存或空通知替代。自然世界帧、完整自然月、原版UI、独立/合作联机仍未完成。未操作桌面、使用子代理、暂存/提交/推送/打包/发布。

## 原生舰队计数／强度（2026-09-21，实施前对照）

- CampaignFleet.java:938–1060的updateCounts先按**旧largestShipSize**挑mostExpensiveShip，才按当前数量更新largest；没有候选时不清旧mostExpensiveShip。传感器逐成员Math.round，封存仅移除探测强度、不移除轮廓；Utils.java:921–950原地quickselect后float Top-K，与已有算法一致；sensorRangeBase加到两项，fleet stats分别修饰；forceNoSensorProfileUpdate仅冻结profile。
- CampaignFleet.java:1370–1408按capital4/station25/cruiser3/destroyer2/frigate1/fighter0计fleetSizeNum，despawning保持原值。读档largest/计数/mostExpensiveShip为transient默认，不从保存缓存当实时值；sS/sP与forceNoSensorProfileUpdate/fAI则恢复实际输入。
- FleetMember.java:612–631使用有效配装OP／船体OP、保存cache、封存、缺员后CR阈值与civilian折减；Misc.java:4063–4113再叠实际inflater/battle source质量或D-/S-mod、船体完好度及舰长等级，不能以FP代替strength。HullVariantSpec.java:789–853按逐武器/联队int截断、内置排除、OP专用hullmod统计、hullmod费用及散热电容求和；OP统计不能直接借用作战stats。
- 本轮只改后端规则/捕获/默认同步，UI结构及实机行为不改、不补猜测布局；核对方式为相关既有短场景与真实共享草稿读回，完整world/UI/联机仍另列未完成。

- OP专用上下文补核：当前注册affectsOPCosts=true的是hbi、rugged、vast_hangar；CivGrade返回false，PDIntegration源码存在但本机当前表未注册该实现。分别复用已查before属性，不混入船员/CR/技能。FighterWingSpec.getOpCost中all_fighter_cost_mod结果被丢弃，已用JDK17 javap读取原jar确认第23字节码为pop，保留原行为而非“修正”反编译。
- Battle.java:307–309、568–576中memberSource为transient且readResolve清空；读档时捕获空真实重建态，而非猜来源。DefaultFleetInflater.java:478–485读取p.quality/p.averageSMods（null→0）；未知inflater仍要求已实现的质量服务。

### 本轮舰队强度／计数实际结果

- OriginalNativeStrength已替换默认同步中的必需readMemberStrength外部占位：FleetMember原始强度缓存、封存、有效配装OP比例、缺员CR阈值、民用舰折减，及Misc的质量/D-mod/S-mod、舰体状态、舰长倍率均实际计算。DefaultFleetInflater读取真实参数；battle来源图支持当前句柄，读档按原版transient readResolve重建空图，不从空保存猜来源。未知inflater保留显式真实服务入口。
- 原生OP按内置武器/联队/hullmod排除、原生列表顺序和逐项float→int计算；OP专用stats仅应用affectsOPCosts插件，与战斗成员stats隔离。注册表及费用、hints、ordnancePoints、质量常量均来自原资源。新增HBI、PDIntegration、RuggedConstruction、VastHangar四种before属性实现（当前已注册且affectsOPCosts为true的只有hbi/rugged/vast_hangar）。没有冒充它们的战斗afterShipCreation监听器已完成。
- OriginalNativeFleetCounts接入默认updateCounts/updateFleetSizeCount：五类计数、unique signature、取整/封存/Top-K/舰队修饰后的传感器、轮廓冻结、旧largestShipSize的选船顺序、despawn规模保持和station权重。mostExpensiveShip为共享成员句柄；JSON与checkpoint恢复不会变成独立船只。
- 捕获新增实际sS/sP、轮廓冻结与despawn标记、inflater参数/状态与battle空重建图。largest/计数/mostExpensiveShip按transient默认创建，后续由真实计数更新。
- 仅扩展既有舰队场景；首遍发现夹具继承了旧S-mod名单，与预期的无S-mod条件不符，清楚设置该隔离条件后短场景通过，未更改生产公式迎合预期。两条相关场景、campaign类型、7文件lint通过；未新增测试工程/全套测试。真实3成员在共享草稿中计算OP、强度、两次计数及规模，首遍mostExpensive为空、第二遍共享选择与JSON/checkpoint恢复通过，无synthetic回调。私人产物仅ignored artifacts/native-save-strength-capture.json、native-strength-readback.json，原存档只读前后SHA不变。
- 完整同步仍pending/readyForAuthority=false。剩余主要阻点已定位CharacterStats.readResolve:416–496、refreshCharacterStatsEffects:632–697：43个注册CHARACTER_STATS/FLEET效果全部unapply、aptitude tier刷新、已激活apply、全局before/玩家after监听器和玩家outposts刷新，不能因玩家当前少技能就跳过。setFleet只是赋引用，不会替代refresh。下一轮直接接此真实生命周期；不拿缓存travelSpeedBonus当完成。模块舰特殊状态、完整世界帧/自然月、原版UI与独立/合作联机仍未完成。无桌面、子代理、暂存/提交/推送/打包/发布。

## 原生角色属性刷新（2026-09-21，实施前对照）

- CharacterStats.java:416–496重建临时属性/技能/aptitudes，repairRateMult与commandPoints仅缺失时初始化；缺失aptitude补入会先setSkillLevel并刷新、再加入aptitude，最后再刷新一次。refresh:632–697先全局before通知，清理所有注册43个CHARACTER_STATS/FLEET效果，更新aptitude maxTier，应用当前生效效果，然后玩家殖民地刷新及after通知。skipRefresh必须明确处理，不靠当前技能少省略清理。
- 已逐项读取43个效果apply/unapply：含创建动态Stat/Mod的清理副作用、按通道撤销、自动化船恢复许可与NeuralLink仅玩家生效；FieldRepairs/AuxiliarySupport使用舰队缓存及部署点阈值，不能直接给固定加成。BaseSkillEffectDescription:226–266/500–511/566–629核实总量、240/5阈值、舍入和缓存。
- 全源码CharacterStatsRefreshListener实现只有HyperspaceTopographyEventIntel；其before为空、after实际更新市场探测与舰队加成，不得吞掉。当前只读存档无该监听器，捕获仍保留未知/已实现分类边界。Misc:4619–4625恢复许可是sector Memory的$core_recoveryTags共享集合，而非人物临时标记。
- 原版当前注册ALL_OUTPOSTS效果为0（既有导入器也强制核实）；玩家殖民地仍需按CharacterStats:1113–1122依次治理技能、conditions、industries，不能当作整体空操作。UI不改，原版实机/视觉验证待用户许可；本轮只实施对应后端。

- 注册顺序补核：SpecStore:540–566确为技能文件名HashSet再按active名单写LinkedHashMap；fs.common C:213–266按File.listFiles发现。隐藏Java只读探针核对本机70文件发现顺序与fs.opendir一致，导入器改用未排序发现序列及Java hash桶顺序，拒绝未审计树化。ForceConcentration静态块中的COMMAND_POINT_REGEN_PERCENT补导入，非缺省猜值。
- 当前实现边界：新角色内核保留完整readResolve/refresh顺序；世界before/after、玩家殖民地和sector恢复tag必须调用真实共享服务，不允许默认为空。内部属性与JSON绑定不改UI，技能tooltip描述独立保存，不改变既有数值修饰符结构。

### 角色刷新与默认舰队同步实际接线结果（2026-09-21）

- 新OriginalNativeCharacterStats实现原版readResolve补aptitude时的嵌套刷新、全部43个CHARACTER_STATS/FLEET效果撤销、aptitude maxTier和按当前技能列表/实际effect index应用。保留getStat/base1与getMod的独立命名空间、动态对象创建副作用、按通道撤销、原float/阈值缓存/部署点舍入、玩家专用NeuralLink与恢复tag。3个源码确证空效果仅在该属性阶段为空，不声称战斗/世界效果完成。
- 导入器使用fs.opendir发现+Java HashSet桶序恢复58个实际注册技能；本机70个文件的发现和最终注册顺序均与隐藏Java只读探针一致。补导入ForceConcentration静态指挥点恢复常量。角色维修/指挥点保留原保存修饰，其他固定属性按readResolve重建；技能说明单独附着于共享target，不破坏已有数值stat结构。
- 新只读人员捕获包括aptitudes、原生动态属性/共享target、真实持久监听器分类和sector恢复tag Memory集合。只有身份属于PirateActivity的混淆i可视为已核实非角色监听器；陌生类型仍unresolved。监听器transient注册在引擎后续初始化阶段仍未恢复，不当成空名单。JSON恢复合并人物、统计和跨人物的保存stat目标，checkpoint保留图身份。
- NativeLiveEconomyDraft.refreshNativeCharacterStats直接操作playerEconomyState共享角色。全局before、玩家after与玩家殖民地有明确服务边界：HT.before源码为空；HT.after必须真实世界实现，玩家拥有殖民地时必须完整refreshCharacterPlayerOutposts，不拿现有仅经济渠道的industry reapply冒充全部Market生命周期。timed恢复tag要求真实Memory生命周期，不吞过期逻辑。当前真实捕获17个持久监听器均已分类、0个玩家殖民地，实际刷新无需任何synthetic callbacks。
- 舰队航速直接取真实指挥官travelSpeedBonus，维修率直接取同一repairRateMult，读档pending会拒绝使用。默认工资/货舱getter在输入完整时运行真实FleetData.sync，不再无条件要求外部占位适配器；显式大改服务入口保留。
- **真实3成员共享草稿首次完整执行默认FleetData同步，fleet=current。** 原生角色readResolve→默认舰队同步→成员属性/后勤/强度/计数/航速→工资与货舱getter均无虚构回调；再次置dirty后的默认getter会重新同步。JSON统计别名、玩家/指挥官身份和checkpoint往返通过。此证据只覆盖当前真实配置，不代表其它未实现active舰船技能/插件或模块舰服务自动完成。
- 私人产物仅ignored artifacts/native-save-character-capture.json、native-character-readback.json；原campaign/descriptor只读前后哈希相同，无私人内容输出。两条已有相关短场景、campaign类型和10文件定向lint通过。真实读回脚本首遍有换行转义语法错误，修正后通过；非生产逻辑错误。无新测试工程、无全套/桌面/子代理/暂存/提交/推送/打包/发布。
- 仍readyForAuthority=false：下一步接真实角色殖民地/HT监听器及自然世界帧、完整自然月、自定义生产；现有经济条件/产业回调的entity/listener缺口不能被本轮current角色或fleet掩盖。原版UI/实机视觉与独立/合作联机等完整生涯目标不变。

## 超空间测绘角色监听器（2026-09-21，实施前对照）

- 原版0.98a-RC8 HyperspaceTopographyEventIntel:368–453：角色after先刷新市场探测、再舰队；阶段取BaseEventIntel:501–526实际stages列表中的首个匹配和progress，不由总进度硬编码。阶段未开不清市场旧值，隐藏市场完全跳过；优先spaceport，只有不存在才选megaport，功能依BaseIndustry:421–430的干扰/建造/升级。
- 不适用市场撤销hypertopology1–4所有通道；适用市场写基础、规模、阵列且阵列用modifyFlatAlways保留0。此分支不改id4，也没有WAYSTATION_BONUS调用，不能按文案补规则。阵列按5光年float距离和Math.round(dist*10)边界修正，最多3个且Domain优先，势力必须id=player（不是玩家友方或同盟）。
- 舰队先撤销id1的burn flat与fuel mult，再仅在Sector.currentLocation==hyperspace时加速/减耗。滑流减耗按剩余mult修饰符desc是否精确等于SlipstreamTerrainPlugin2.FUEL_USE_MODIFIER_DESC判断，不根据来源id或猜地形。现有fleet捕获丢desc，须补捕获/临时修饰符写入清理，缺说明证据不能静默判为不在滑流。
- BaseLocation:1001–1008/1140、ObjectRepository.readResolve和Faction:955证明星系实际saved实体仓库、标签和player势力身份来源。LocationToken有独立faction字段；CCEnt.fleetForVisual及CampaignFleetAI.JumpPlan.point按拥有者实际身份识别字段类型，非任意同名对象默认放行。Market:667缺stats才重建。
- 本轮只实现该监听器的数据/副作用接线，不改UI、不声称事件进度获取、滑流地形自然advance、星系占领/移动或殖民地完整生命周期完成；只扩相关既有短场景，不新建测试工程。

### 超空间测绘监听器接线结果

- 新OriginalHyperspaceTopography执行角色after的真实顺序：实际阶段列表/阈值→市场范围→舰队效果。支持隐藏市场完全跳过、小港优先、升级时functional、非自有/无功能港口清四来源的全部通道、阵列优先与最多3座、float光年边界舍入、阵列0值强制保留。适用市场不改hypertopology4，不凭未调用的WAYSTATION常量添加奖励。
- 舰队加速/减耗每次先撤销旧来源，只以Sector.currentLocation/hyperspace身份判断；减耗精确匹配现存fuel mult说明，不猜来源ID或沿用上次事件修饰。MutableStat/StatBonus的同值修改仍更新说明、临时修饰符到期清说明，已经由统一目标写入实现。新捕获保留全部fleet修饰符说明，包括明确null；旧捕获若缺真实说明在需要匹配时明确拒绝，不能当作“不在滑流”。
- 捕获扩展实际BaseEvent stages/progress、233个注册星系的实体仓库与33个sensor_array对象、Sector当前位置引用、65市场的探测StatBonus/来源说明。首遍发现Faction对象以被引用字段名保存且省略cl，按原序列化类型规则（与既有Faction捕获一致）修正，不根据字段名猜势力。所有权读取实际Faction.id，LocationToken使用自身faction字段；字段类型不明或未知实体仍unresolved。共享阵列和市场统计目标恢复绑定。
- NativeLiveEconomyDraft.refreshNativeTopography作为默认角色after后端，不再必须外部refreshHyperspaceTopography；保留显式替换入口用于大改。数据存于本事务角色/市场共享状态与checkpoint，不生成第二个独立世界。
- 仅扩展两条已有短场景：范围边界、阵列优先/上限、隐藏态、小港损坏但有大港、升级态、强制0值/id4保留、退出超空间/地形修饰到期撤销、默认receiver及checkpoint；两场景、类型和10文件lint通过。原生真实数据只读捕获到ignored artifacts/native-save-topography-capture.json与native-topography-readback.json，原文件前后SHA未变；真实舰队同步和checkpoint仍通过。
- **当前真实存档没有注册HT事件**，没有伪造进度/事件来充当真实生效证据。事件效果用明确夹具覆盖，真实捕获只证明来源/对象/统计数据及既有舰队流程。UI/原版实机仍待许可。
- 剩余不是空任务：事件自然进度、滑流地形advance及时间/位移下自动调用、实体占领/星系移动与世界状态互通、玩家殖民地完整角色刷新仍待实现。完整自然世界帧/月结、自定义生产、原版UI与独立/合作联机仍未完成，readyForAuthority=false。无桌面、子代理、暂存/提交/推送/打包/发布。

## 殖民地管理员共享身份（2026-09-21，实施前对照）

- Market:337–370/377–402：getAdmin缺失时先new Person(steady)、设市场势力、setAdmin；玩家拥有且该人是默认头像时setAdmin(null)，再直接赋玩家，刷新治理技能。**直接赋玩家不调用addPerson，不改玩家market，不插入people或通讯录。** setAdmin即使传同一对象仍removePerson、删除通讯录中所有相同对象的PERSON条目，并将所有相同person的AdminData.market清null；只有对象改变且新管理员非null才刷新治理技能。setAdmin不把新AdminData.market自动设为此市场。
- Market:392–402 people=null时removePerson不改person.market；非null时即使不包含该人也会setMarket(null)，移除后空set恢复null。people身份不是人物字符串ID；通讯录条目按entryData对象身份，不删除其它类型或同ID不同人。
- CharacterStats:1113–1122先ALL_OUTPOSTS，再在admin.stats===当前stats时治理，再conditions，再industries；Market.reapplyIndustries:313–319又刷新实际管理员治理技能，最后按hazard调整upkeep。不能合并成一次治理或仅调用旧conditions→governed快照。当前industry经济内核未覆盖实体/监听器副作用，整段殖民地刷新仍明确未完成，不因本轮身份接线取消该边界。
- Person:57–86/152–176、CharacterStats:401–405、CommDirectory:removePerson和AdminData:setMarket提供构造/清理来源；CampaignEngine:313–317的genUID是真实有符号long计数后转hex，不另用随机/自拟身份。新人物构造期间角色skipRefresh=true，aptitude effect skills补入后才改false，不调用世界监听器。
- 本轮补真实人员/peopleRefs/通讯录/市场和薪资引用生命周期，治理从共享人物当前skills读取；不改UI、不自动“修正”原版setter并不做的跨市场任命，也不把capture投影当完整Person/市场世界。只做相关短检查。


### 殖民地管理员共享身份接线结果

- 新 OriginalMarketPersonnel 内核与 live draft 的 getNativeMarketAdministrator/setNativeMarketAdministrator 接入实际 Person 引用、Market.people、通讯录条目与 AdminData.market。通讯录删除保持列表对象本身，按 entryData 身份删除所有 PERSON 条目，不按人物字符串 id，也不删除其它类型。
- 市场记录与人员注册表共享同一个 personnel 对象；额外市场管理员和玩家/军官/受雇管理员经同一 Person、CharacterStats、FullName、Memory 句柄恢复。Person.market 只存 objectRef，避免市场/人物形成 JSON 循环。完整额外人物只捕获管理员，不把全部通讯录 NPC 展开为第二份世界。
- 捕获真实 Sector.nextId（有符号 long 字符串）和人物 spr/pid/fid/market/aiCoreId；FullName f/l/g 别名见 CampaignGameManager:1894–1910。默认管理员创建用真实共享计数器的 hex 并保留 long 回绕；CharacterStats 构造期间只补 aptitude，抑制世界刷新，不冒充完整 Person/Memory 游戏生命周期。
- 原版的细节已保留：同对象 setAdmin 仍清通讯录和所有旧 AdminData.market，但不刷新治理；新 AdminData.market 不会自动指向目标市场；不自动从其它市场迁走新人；people=null 的 remove 不清人物 market；默认管理员替换为玩家时直接赋引用，不调用 addPerson。
- 治理方法已从产业执行拆出。绑定人员世界的市场重施产业时调用实际 getAdmin，再读当前共享 stats.skills，不能继续拿 prepared.input.governedSkills.skills 的旧技能快照。旧的纯经济捕获仍只具备原来的离线经济投影；缺少人员集合明确 unresolved，原生任命入口拒绝，不以空人员名单补齐。
- 验证：仅扩现有人员短场景并执行该 **1 条**（通过，约 0.5 秒进程时长）；生涯类型和本轮 11 文件 lint 通过。覆盖同对象清理、同字符串 ID 不同对象、当前技能重算、空集合差异、默认→玩家、UID/long 边界、构造无世界回调和 checkpoint。
- 真实原存档只读捕获 **65 市场 / 65 额外管理员**，人员 unresolved=[]，保存原字节检查通过；65 个真实 getter、共享记录 checkpoint 通过。相同管理员 setter、清空后创建默认管理员和再次读回只在 Web 离线草稿中执行，未修改原版存档。私人捕获/读回仅存 ignored artifacts/native-save-personnel-capture.json 和 native-personnel-readback.json，不输出私人姓名、舰名或金额。
- **边界仍在**：任命界面的上层流程、完整产业实体/监听器副作用、角色殖民地 ALL_OUTPOSTS→治理→条件→产业（第二次治理）的完整顺序仍待接齐；仍要求实际 refreshCharacterPlayerOutposts 服务，不能把本轮治理统计接线当成完整殖民地刷新。原版 UI/实机补验、自然世界帧/月结、自定义生产、独立/合作联机未完成，readyForAuthority=false。未操作桌面、启动子代理、暂存/提交/推送/打包/发布。


## 当前管理员产业读数与直辖数量（2026-09-21，实施前对照）

- CharacterStats:1113–1150 的 ALL_OUTPOSTS 是 SkillEffectType，不是技能描述的 ScopeDescription。0.98a-RC8 当前 58 个实际技能没有 ALL_OUTPOSTS 效果；IndustrialPlanning$Level2 虽描述“所有殖民地”，在 industrial_planning.skill 中实际是 CHARACTER_STATS，自定义产能写玩家 custom_production_mod，不应伪造市场 AO 效果。
- BaseIndustry:182–200/1385–1397，每次 apply 在当前管理员 getAdmin().stats.dynamic.mods 上分别读 supply_bonus/demand_reduction；FuelProduction:14–16 另读 fuel_supply_bonus。DynamicStats:51–55 使用 mods.computeEffective(default)，缺少键返回传入默认而不创建；不能误读 stats namespace，也不能把全局玩家技能硬套给 NPC 管理员。
- 当前 live draft 已有共享管理员但产业仍沿用 prepared 的 adminSupplyBonus/adminDemandReduction/adminFuelSupplyBonus 数字；本轮接到每个实际产业 apply 前的当前统计读数。需角色 readResolve 的对象在原生生命周期后才能作为当前读数，不能拿复位值当已刷新；外部完整世界依赖仍不能悄悄省略。
- PopulationAndInfrastructure:302–312/366–376：先扫描玩家拥有且实际 getAdmin().isPlayer() 的市场，再读取玩家 outpostNumber.getModifiedInt()。管理员判断发生在惰性商品网络读取之后；不能在函数入口提前缓存布尔。替换必须外部提供的直辖上限时只接真实角色统计，保留可替换服务与旧经济投影的明确边界。
- 本轮不改 UI；原版任命屏上层流程/实机待许可。只扩现有相关短场景，核对换人、技能变化、动态 mod 与 stat 分离、负/半整数上限与回调次序；不会把这些渠道标成完整产业副作用或完整角色殖民地刷新。


### 当前管理员供需与直辖上限接线结果

- 新 originalNativeCharacterDynamicValue / originalNativeCharacterOutpostLimit 直接读共享角色统计；dynamic 只读 mods，不读取 stats namespace、不创建缺失的统计对象，默认值与 native float/整数舍入保留。尚未 readResolve 的数据不能当作当前值；live getter 首次按现有真实角色生命周期解析，涉及未实现世界服务时照常拒绝，不跳过玩家殖民地回调。
- live 行业 reapply 在每个行业自身的 unapply 后、apply 前重新获取实际管理员供给/需求加成；燃料行业另取 fuel_supply_bonus，修改的是本 live 行业与 production 共享输入。旧的纯经济捕获只保留已声明的缓存投影兼容，具备真实 personnel 记录时不退回快照。
- Population 稳定度中的管理员身份判断推迟到惰性网络/内部供需计算之后；非玩家市场不调用该 getter。管理惩罚按 Economy 市场顺序调用真实 getAdmin，然后从玩家 outpostNumber.getModifiedInt 读上限，不再必须注入外部固定值。旧的未捕获玩家角色仍明确拒绝，保留外部真实 getter 扩展接口。
- 只扩既有人员短场景，连同直接受影响的 population financial callback 共 **2 条**相关检查通过；生涯类型和 9 个改动文件 lint 通过。覆盖管理员 readResolve、工业规划技能变化、换人后行业加成变化、mods/stats 分离、缺键不分配、燃料加成、正负半整数舍入、延迟身份判断和非玩家短路。一次检查代码误用了统计句柄的 .value，已改正后复核通过，未扩大到全套。
- 复用上轮 ignored 原版只读捕获：65 个市场的供需/燃料 getter 完成当前角色解析；真实燃料产业执行、显式 Web 草稿燃料 modifier 的再次 apply 以及 checkpoint/共享状态读回通过。结果只写 ignored artifacts/native-current-admin-industry-readback.json；没有更改原存档、没有将显式草稿变更冒充原存档现有技能。
- 原版当前 58 注册技能的 ALL_OUTPOSTS 类型仍为零；只确认空效果集合，不据此跳过 CharacterStats:1113–1122 的治理/条件/产业顺序。完整产业实体/监听器/子市场生命周期与角色殖民地编排、上层任命 UI、自然时间、完整月结、自定义生产、独立/合作联机未完成，readyForAuthority=false。无桌面、子代理、提交或发布操作。


## 地面防御产业实际统计（2026-09-21，实施前对照）

- GroundDefenses.apply/unapply：Base.apply(true) 后写供应品/陆战队/重武器需求，重算稳定度，再以 getDeficitMult 计算 ground_defenses_mod 的 ind_<id> 倍率；heavybatteries 额外倍率基数为2，grounddefenses为1。无法运作时仍完成这些读取，随后清供给并执行完整该插件 unapply，撤回设施/核心/改良/复制器对应 mult；升级中的 building 不等于停运。
- BaseIndustry:720–742/1687–1712：缺口用每项当前需求 float 截断减惰性 market.getCommodityData().getAvailable；分母另取三项需求的 modifiedInt 最大值。先读最大缺口，再读分母；分母<1时归1并把缺口归0，最终ratio限0..1。不能使用最大相对缺口、全市场最大需求或把分母也截断。短缺文本分支还会再读一次 getMaxDeficit，不把三次不同调用合并成一次快照。
- GroundDefenses 核心/改良：alpha ind_<id>_1 ×1.5，改良全局来源 ground_defenses_improve ×1.25。删除仅 mult 通道，不误删相同 ID 的其它通道或管理员 GO 效果。ItemEffectsRepo:462–478 的 drone_replicator ×1.5，没有附加行星条件；BaseInstallableItemEffect 默认 requirements=[]。安装操作和图标/tooltip尚不在本轮。
- 当前 live 仅实现防御设施商品需求和稳定度，未写防御倍率；governedState.groundDefenses 也未与共享市场动态统计绑定。接入独立插件效果内核、当前惰性商品读数、共享 ground_defenses_mod 以及原版物品准入；保留其它军事产业/舰队/监听器仍待完成，不扩大“完整产业”声明。
- 无界面改动。原版 getCurrentImage 重型电池在无行星/气态巨行星时用 orbital 图，留待原版布局阶段；本轮不凭印象替换 UI。仅扩已有短场景与现有只读捕获读回，不跑全套。


### 地面防御设施与重型炮台接线结果

- 新 reference-ground-defenses / import-campaign-ground-defenses 从原版10个来源提取2类设施、4个 GroundDefenses 常量和 drone_replicator 倍率/兼容性；常量与原版 Java float 保持一致。capture-campaign-native-save 的来源一致性校验已纳入新参考，不绕过原版版本检查。
- 新 OriginalGroundDefenses 分离 Base.unapply、Base.apply 核心/改良/物品和 GroundDefenses 本体三段。只按 mult 通道处理设施/Alpha/改良/物品来源，保留管理员 GO 和同名其它通道。停运先按原版完成缺货读取，随后清供给/撤销；building 且 upgradeId非null仍可运作。
- 缺货分子按需求截断，分母按需求 modifiedInt 舍入，先缺口后分母，float比例限0..1；稳定度、倍率与短缺说明保持分别调用，短缺时3次各3个惰性商品读数，没有用预先汇总的比例冒充实际 getter。
- NativeLiveEconomyDraft 的 groundDefenses、economyBonuses.ground_defenses_mod 和 governedState.groundDefenses 保持同一个统计句柄。治理刷新原地安装渠道，不丢失设施/物品修饰。检查点升级到 schema6，schema5以原有治理/真实载入数据恢复并绑定，schema6校验共享身份；没有把缺失地面统计默认为“整套防御已恢复”。
- 原版无人机复制器准入已贯通 civic commodity、财务、移民、可达性检查；它不改变这些渠道，只允许兼容的2类防御设施。未放开未知物品或其它产业上的不兼容安装。初次短检查暴露财务准入仍拒绝新物品，已补通这些明确无副作用的路径后通过。
- 验证仅扩现有 ordered shared load **1条场景**：实际 lazy 网络构造、核心/改良/物品、停运撤销、升级态、非整数需求截断/舍入差异、0需求、6/9次读取顺序、保留其它通道/治理来源、schema5迁移和schema6共享身份。生涯类型与本轮12文件定向lint通过，无全套。
- 复用已有原版只读捕获，在 Web 草稿重施 **45市场/45防御产业**，此次45个都进入短缺分支，设施倍率与本轮计算结果一致；共享统计和checkpoint读回通过，原存档写入0。该证据是本地Web重算和源码对照，不是原版正在运行世界中的45个防御值实机对比。私人结果仅写ignored artifacts/native-ground-defense-readback.json。
- 未完成项仍明确：描述/原版tooltip、无人机安装上层操作、最终袭击防御力量/战斗、军事基地/空间站/巡逻舰队及其它产业副作用、完整角色殖民地顺序仍需实现。原版界面、自然帧/月结、自定义生产和独立/合作联机目标不变，readyForAuthority=false。未操作桌面、用子代理、暂存/提交/推送/打包/发布。


## 军事基地 apply/unapply（2026-09-21，实施前对照）

- MilitaryBase:54–169/505–557：巡逻总部按固定规模3计算维护，且财务在Base核心/改良之后；军事基地/最高指挥部财务在核心/改良之前。随后写实际规模/标签对应的轻中重巡逻数量、商品需求与产出、稳定度、仅由供应品短缺决定的地面防御加成、$patrol/$military带原因内存、officer_prob。非功能状态仍执行读取后再unapply。
- 数量按原版规模分支和 Java size/2 整除；改良patrol增加中型，其余增加重型。Alpha仅给combat_fleet_size_mult乘1.25，不加产量。稳定度短缺看supplies/fuel/ships，而防御倍率仅看supplies；不能共用先前GroundDefenses的三商品分母。
- Misc:1136–1155、Memory:176–246/270–289：setFlagWithReason不是一个布尔赋值。总旗标依赖理由键存在；撤掉本产业理由时必须保留其它理由，总旗标在最后理由消失时才级联删除。unset保留旧expire记录和Require.req中的旧成员；设置总旗标移除首个过期项，设置永久理由通过expire(-1)移除首个对应过期项。本轮捕获两个根键及双向依赖闭包，保留这些差异，不做全世界Memory.advance。
- 原版军事产业apply没有创建巡逻舰队；实际生成在advance/RouteManager中，本轮完成apply/unapply的数据与内存效果，不把巡逻数量当作已经生成舰队。未知安装物品依然拒绝；现有捕获缺真实军事内存时仅保留已声明的旧经济投影，不补造空内存。
- 当前缺口是军事设施仍只改商品/稳定度，缺巡逻、核心规模、军官、防御及内存理由。将接同一市场动态统计与共享内存闭包；本轮无UI改动、不开原版窗口，仅扩相关既有短检查与只读捕获。

### 军事基地本轮实施结果（2026-09-21）

- 新增 MilitaryBase 独立规则内核，接原生动态统计与当前管理员供需。财务调用保持 patrol 在核心/改良之后、military/command 在之前；稳定度与供应品防御分别惰性读数。Alpha、改良、轻中重编制、officer_prob、停运撤销进入同一市场对象，未使用巡逻数冒充实际舰队。
- 原生捕获新增军事 Memory 依赖闭包，保留额外理由、陈旧 Require 成员与 expire。市场共享同一 memory.objectRef 时构造/检查点恢复保持对象身份；人为拆开同身份内存时恢复明确拒绝。checkpoint schema7；schema5→6→7 / schema6→7 均不从历史载入输入伪造当前军事内存，旧档 military=null 仍为显式经济投影。
- 只扩并执行既有 ordered shared load 短场景 1 条（约0.36秒），覆盖原生XML共享Memory捕获、规模3–10编制、核心/改良财务顺序、燃料/舰船缺货不削减供应品防御、停运、其它理由保留及旧档迁移；生涯类型检查和13文件定向lint通过。未建新测试工程、未跑全套。
- 已有真实只读捕获的40个市场/40个军事设施完成生产路径重施：巡逻总部17、军事基地22、最高指挥部1；34次防御短缺分支、40次在运旗标读回与共享checkpoint通过。ignored产物 artifacts/native-military-readback.json 只记录汇总。此为真实输入上的Web验证加源码对照，不是原版实机对拍，未改原存档。
- 本轮无UI修改。军事安装物品（包括低温运算引擎）仍显式拒绝；巡逻advance/RouteManager与实际舰队生成、完整Memory自然时间、其它产业实体/监听器、完整殖民地刷新仍未完成。readyForAuthority=false；无桌面操作、子代理、暂存提交、推送或发布。


## 低温运算引擎（2026-09-21，实施前对照）

- 原版0.98a-RC8 ItemEffectsRepo:434–460、BaseInstallableItemEffect:87–104/151–155：运行期只要求市场含hot或very_hot，不要求行星/非气态巨行星，也不检查勘探等级。hot优先于very_hot，即两者都有时仍+0.25；仅very_hot为+1.0。效果写combat_fleet_size_mult的flat渠道，绝不是独立乘法；与Alpha的mult渠道组合。
- BaseIndustry:182–200/204–216：安装物品在核心/改良后应用，失去条件立即unapply；军事产业在停运分支再次撤销。仅撤销物品ID的flat，保留其它来源与同ID其它渠道。special_items.csv兼容patrolhq/militarybase/highcommand。
- 原版说明为炎热+25%/极端炎热+100%，见ItemEffectsRepo:453–459；此次不改UI布局/安装对话框，也不开原版窗口。安装/卸载玩家命令及界面尚待实现，本轮只接已经安装的真实物品效果。
- 当前military内核拒绝所有物品；将由原版导入器提取常量/兼容表/要求说明，内核读取当前市场条件，并贯通财务、商品、可达性和移民中无副作用的准入路径。只扩已有产业顺序短场景，集中检查条件切换、Alpha组合、停运/撤销和不兼容项拒绝，不新增测试工程。

### 低温运算引擎本轮结果

- reference-military-bases现在从12个原版来源导入物品兼容表、hot/very_hot倍率及要求文案。独立军事内核从当前conditions读取条件，在Base核心/改良后写flat；条件消失或设施停运撤销flat，不动Alpha与其它mult/percent。兼容性准入贯通商品、财务、移民和可达性，未放宽未知物品或非军事设施。
- 使用原有ordered shared load场景里的原生SpID安装物品字段和未勘探hot条件，验证捕获→恢复→共享市场重施→checkpoint→停运的真实生产路径；hot与Alpha组合为(1+0.25)×1.25=1.5625，very_hot及双热条件优先级、失去条件、同名其它渠道保留也已覆盖。
- 本轮仅运行1个既有短场景（约0.40秒）、生涯类型和8文件定向lint，均通过。没有新测试工程、全套或私人存档重新捕获；此为源码对照与明确夹具Web验证，不声称原版实机验证。
- 已安装物品效果已完成，不等于玩家安装/卸载命令或原版安装对话框已完成。实际巡逻advance、RouteManager、FleetFactoryV3和巡逻AI尚未接入，不能用加成数值充当已生成舰队。完整目标继续，readyForAuthority=false；无桌面操作、子代理、暂存/提交/推送/发布。


## 军事巡逻计时与实际路线数据（2026-09-21，实施前对照）

- MilitaryBase:275–327：BaseIndustry.advance先执行；经济sim模式/非功能状态不推进巡逻计时。按clock.convertToDays转换，spawn_rate动态stat默认1，新游戏预推进×3；返航值>0时加旧interval×days并减days。IntervalUtil不会循环补发，只有下一次advance才随机重置已elapsed计时器；FAST_PATROL_SPAWN会额外再advance一次，必须保留顺序。
- 巡逻缺口按RouteManager实际source（marketId_military）下的MPFD类型计数，不按可见舰队数；权重次序HEAVY/COMBAT/FAST，非正权重忽略，WeightedRandomPicker:193–211使用double随机乘total后转float及<=边界。编制读取StatBonus.computeEffective(0)后Java截断。
- 原版RouteManager:97–105/315–322/427–444创建真实路线身份、时间戳、OptionalFleetData和首段current共享引用；先按实际ShipQuality读取质量，再创建seed，getPatrolCombatFP用每次重新由seed构造的Java Random，强度另经Misc:3758–3766第二次质量/舰队规模/军官质量读取。单段35–45天，无即时舰队生成。
- RouteManager:236–280单次advance最多换一段、无超时结余转移；activeFleet非null时不自动结束。生成实体另由距离<1.6LY的spawnAndDespawn、FleetFactoryV3及PatrolAssignmentAIV4完成，绝不把路线当实体。返航补偿MilitaryBase:385–397的FP除法是两个int的Java整数除法，需保留。
- 当前没有路线/计时状态。此次实现可持久化的原版路线模型、MilitaryBase巡逻子阶段及路线时间阶段；从实际序列化CoreLifecyclePluginImpl:1454–1459/1752–1791恢复tracker、MPFD、RtSeg和current共享身份。BaseIndustry完整advance、实体spawn/despawn/AI仍未实现，入口必须明确仅已完成Base之后的子阶段，不自动塞进自然世界帧冒充完整生命周期。随机源要求显式注入，原生Math.random/系统纳秒种子本就不在存档，不用JS Math.random冒充可回放服务。
- 本轮无UI改动，原版实机/巡逻视觉与互动仍待许可；仅扩既有短场景与只读捕获，无新增测试工程。

### 军事巡逻计时与路线数据本轮结果

- 新增OriginalMilitaryPatrols：原版已完成Base之后的巡逻子阶段、Java长整型seed的首次nextFloat/FP、按真实路线数计算编制缺口、原序权重与两次质量读取、真实RouteData/OptionalFleetData/MPFD/RtSeg创建。tracker重置不带余量、返航补偿与新游戏倍率保留。另实现RouteManager.advanceRoutes时间阶段及原版返航int除法，未伪造舰队实体。
- 新增只读captureNativePatrols，从Sector的实际$core_routeManager读取整份232条路线，并捕获军事设施tracker/返航状态/动态生成速率；其它spawner/custom仅保留实际身份，不声称其运行时已实现。真实读取发现2条RouteData首次定义在强类型AI.r字段，按CoreLifecyclePluginImpl映射支持，不放开任意未知类。
- NativeLiveEconomyDraft持有同一当前巡逻状态，提供明确after-Base和route-time子阶段入口；它们未偷偷接到自然帧。质量/军官质量、全局随机和新route seed服务仍要求真实调用方提供，缺服务不注入占位。自然世界Base.advance、RouteManager.spawnAndDespawn、全量舰隊工厂和巡逻AI未完成。
- 检查点schema8包含当前路线和tracker；schema7及更旧迁移明确patrols=null，不从旧快照填充路线。原生JSON捕获按objectRef重建current/segments共享身份；当前checkpoint则严格要求身份一致，不默默修复坏档。
- 只扩并运行既有ordered shared load场景1条（约0.46秒），核验创建实际路线对象但activeFleet=null、种子FP、回调顺序、tracker下次重置、sim门禁、返航补偿、activeFleet阻止自动结束、路线过期和共享checkpoint；类型与9文件定向lint通过。捕获parser的强类型字段修正由实际数据回读验证。
- 实际只读新捕获：40军事设施、232总路线、91军事路线、6条有关联舰队，unresolved=[]；JSON载入/共享checkpoint通过，原存档未改。该6条是原存档已有舰队引用，不是Web创建结果；无自然帧/原版实机视觉验证。产物仅ignored artifacts/native-save-patrol-capture.json和native-patrol-readback.json。
- 默认完整生涯仍未完成，readyForAuthority=false；无桌面操作、子代理、暂存提交、推送或发布。


## 巡逻真实质量、doctrine与随机服务（2026-09-21，实施前对照）

- Faction:202–209/362–375/955–956/1779–1784：读档时非player势力把当前spec的doctrine复制到原有对象；player保留保存中的doctrine，缺null才用无参默认。FactionDoctrine:26–43/81–119/123–130/173–174和SpecStore:1303–1306确定完整字段、无参默认与JSON构造不同的autofit默认；舰船质量贡献为(shipQuality-1)×doctrineFleetQualityPerPoint。不能直接沿用NPC存档里的旧doctrine。
- ShipQuality:20–30/58–77/88–101：单例必须取Sector实际$key对象，不可随便选监听器列表第一项；null才创建并注册，错误类型非null应失败。读档缓存清空，首次读取按faction_econGroup分组，并由首读市场hidden状态决定进口惩罚；getter不擅自刷新经济网络。返回production质量句柄当前值+当地fleet_quality，再逐步减旧势力doctrine贡献、加请求势力贡献（包括同势力的float舍入）。现有economyUpdated实现继续复用。
- 已用安装目录jre的java.util.Random字节码核对48位LCG、26+27位nextDouble、24位nextFloat、nextInt(bound)拒绝分支，以及nextLong两次next(32)均先符号扩展的细节。路线getRandom仍每次从route.seed新建，不能改成持久推进同一个随机对象。
- 原生Math.random全局状态及Misc.genRandomSeed的nanoTime不保存在原生存档，Web不可能恢复其未来同一序列。本轮明确提供离线/未来权威分支的可保存Java随机流：从源存档SHA派生初始分支种子，全局double和新路线seed分开推进；检查点保存状态、恢复不重播。此为可回放基础设施差异，不宣称复原原生JVM未保存的随机状态；不改抽样范围/权重/回调顺序。
- 当前巡逻仍要求外部质量/军官/随机服务。将接真实势力对象、原生单例和共享市场统计，保留可替换服务；老捕获缺单例/势力依据时明确不可用，不冒充恢复完成。无UI改动或实机操作，只扩一个直接相关既有短场景。

### 巡逻真实质量、doctrine与随机服务本轮结果

- OriginalFactionDoctrine/captureNativeFactionDoctrines捕获实际Faction与doctrine身份、所有doctrine值；NPC按当前原版spec重施，player保留保存值，null用无参默认。当前统计可在同一草稿读取/修改并进入后续质量与强度运算。共享doctrine跨势力需要额外readResolve顺序证据，当前明确拒绝，不猜顺序。参考导入器新增实际配置/源码来源，44项来源纳入捕获一致性校验。
- 经济监听器新增真正ShipQuality静态getter：从捕获的Sector单例取得正确对象，空值创建并实际注册经济监听器，错误类型不偷换；保持已有生产质量共享句柄、hidden首读缓存及doctrine贡献的逐步float计算。不用任意列表首项冒充单例，不在getter擅自调用economyUpdated。
- 新OriginalJavaRandom实现原版seeded LCG的float/double/int/long方法；nextLong保留低32位的符号扩展，nextInt保留溢出拒绝分支。原巡逻FP复用该内核且每次重新由route.seed创建Random。Web分支的全局double/route-seed两条流明确与原生JVM未捕获全局状态区分；存档恢复继续流而不是重新播种。
- NativeLiveEconomyDraft.advanceMilitaryPatrolAfterBase默认不再要求外部质量/军官/随机回调；仍保留显式替换入口。simMode来自实际经济字段，FAST_PATROL_SPAWN按原版新运行默认false且可显式替换。当前doctrine、单例/缓存及随机状态进入checkpoint schema9；旧schema8及更旧缺服务时保存null，不从历史捕获推测当前状态。
- 一次既有ordered shared load短场景（约0.53秒）与类型/18文件定向lint通过：NPC过期99值重置为原版、玩家4/5保留、同/跨势力质量、Java种子0样例，以及不注入服务的默认after-Base路线创建与checkpoint继续一致。
- 实际只读新捕获运行65个市场质量getter、40个军事设施after-Base子阶段，显式输入14天，创建28条新路线；克隆检查点运行得到完全相同的状态，未创建舰队实体、未推进完整世界时钟/原版Base.advance。产物仅ignored artifacts/native-save-patrol-services-capture.json和native-patrol-services-readback.json；原存档写入0。
- 仍需BaseIndustry生命周期、RouteManager近远spawn/despawn、实际FleetFactoryV3与PatrolAssignmentAIV4以及自然帧接线。此轮不是原版实机数值/视觉对拍，整个生涯未完成，readyForAuthority=false。未操作桌面、使用子代理或提交发布。


## 军事产业 Base 生命周期（2026-09-21，实施前对照）

- 原版0.98a-RC8，BaseIndustry:391–430/495–600：先读取当前Memory停运，再更新wasDisrupted；停运不推进建造；恢复回调默认为空，不能自动重施。完成先清building/progress/time，普通建成先消息/队列再单体reapply；升级先移除旧对象、创建并apply新对象，再移交核心/改良/同一special引用，upgradeFinished后reapply，不启动队列。MilitaryBase:263–301先Base后simMode/functional门禁，forceIntervalElapsed只改elapsed；升级后的当前调用栈仍继续旧对象。
- Market:277–309/449–486：新增立即apply；移除先notify/unapply；产业advance使用副本，队列在产业阶段前由市场单独启动。Memory:134–169/232–267/378–383：expire逐步float递减，严格小于0才unset；三个军事ID共享$core_disrupted_MilitaryBase。只推进已捕获闭包，不能冒称完整Market/Memory。异常孤立Require涉及完整LinkedHashMap fail-fast语义，证据不足时拒绝而不修补。
- ConstructionQueue与BaseIndustry:558–595、Misc:4387–4408：队首先出列并实例化；数量包含剩余队列及结构升级目标，判断为num<=max。无效项按实际cost向玩家真实credits退款；合法项add/apply→startBuilding/unapply→设置原cost。不能用只有ID的旧队列猜成本。军事候选要求另一个功能正常spaceport。本轮实现军事队列候选；其他类完整构造/可用性未接时明确拒绝，不跳过、免费取消或插入假设施。
- 当前差异：草稿丢失buildProgress/wasDisrupted等持久字段，巡逻只有after-Base入口；检查点没有退役产业身份，旧路线spawner无法继续关联。将新增同一产业entry/finance/tracker共享的生命周期表，保存旧对象及通知事件，接真实单产业apply/unapply，不以全市场重施替代。旧检查点缺生命周期时保持null，不从历史加载输入猜当前状态。
- UI证据限于原版源码的COLONY_INFO完成/开始/取消消息及原文，本轮不改布局、不操作桌面；通知的原版视觉呈现与实机交互仍待验。验证只扩既有ordered shared load短场景，集中覆盖停运边界、完成/升级顺序、旧spawner身份、队列成本和检查点继续，并跑类型与定向lint。

### 军事产业生命周期本轮结果

- OriginalMilitaryLifecycle接入共享草稿：保存建造进度/时长、wasDisrupted、原建造成本和SpecialItem对象，产业entry/finance/tracker保持同一引用。升级撤销旧对象并立刻创建/apply新对象，再继承核心/改良/同一安装物品，单体reapply；退役对象留给原路线spawner/监听器，不按产业ID覆盖。升级后的当前advance继续旧对象，新的tracker不提前执行。
- 停运读取当前市场Memory，三个设施ID共用MilitaryBase键；显式闭包时间阶段严格<0到期、等于0仍停运，保留暂停与理由清理。恢复仅更新wasDisrupted，不擅自reapply。Base建造在simMode门禁之前推进，COLONY_DEBUG仅加速建造；forceIntervalElapsed不提前置intervalElapsed。
- 捕获实际队列对象与每项int成本，军事候选按原版顺序出列/实例化/计数/判定；合法项add/apply→startBuilding/unapply→设置原cost，取消使用玩家真实credits句柄退款。计数含剩余队列及结构升级；constructor的IntervalUtil随机消耗也保留。普通建成启动下一项，升级不启动队列。其他类候选、或需构造未知结构升级时拒绝，未用假设施或免费取消绕过。完成/开始/取消消息保留为持久COLONY_INFO待呈现事件，不宣称UI已显示。
- 检查点schema10保存当前/退役对象和队列；老schema9及更旧明确industryLifecycle=null，不用历史加载数据填补当前进度。后续市场经济重施已从保存下标改为当前对象身份解析，升级后不再错误对齐旧产业。军事参考导入增加ConstructionQueue、全产业标签/升级/建造时间及averagePatrolSpawnInterval，来源45项。
- 仅扩并运行既有ordered shared load场景1条（约0.87秒），覆盖停运边界/暂停/恢复无重施、simMode建造、升级前后共享身份及随机继续、军队路线旧spawner、队列真实成本、普通完成后下一项不被本帧提前推进、取消回调成本，以及schema9迁移。类型检查与13文件定向lint通过；lint提示已修正，没有跑全套或新增测试工程。
- 只读真实捕获：65市场、40军事设施，实际正在建造0/排队0；显式输入1天的所选Memory阶段与40个MilitaryBase.advance，创建2条路线（非舰队实体），checkpoint克隆推进及读回一致。此真实数据不能验证实际在建/升级完成，相关分支由上述明确夹具验证。产物仅Git ignored artifacts/native-save-industry-lifecycle-capture.json及native-industry-lifecycle-readback.json，原存档写入0。
- 未实现整个Market.advance/自然世界帧、完整Memory的空Require fail-fast遍历、非军事建造队列/构造、玩家付费建造/升级/取消交易与权限、降级入口、消息原版UI、RouteManager实体spawn/despawn、FleetFactoryV3和巡逻AI。当前低层start/cancel升级是引擎钩子，不是已授权计价玩家命令。完整生涯/原版UI与独立合作联机仍未完成，readyForAuthority=false；无桌面操作、子代理、暂存提交、推送或发布。


## 路线空间、近远生命周期（2026-09-21，实施前对照）

- 原版0.98a-RC8 RouteManager:157–233/370–393/494–515/592–710：先推进路线时间，再取路线副本处理实体；同位置且识别到编成、确实曾鼠标查看才清seen天数。生成距离严格<1.6LY；卸载至少30天未看、无战斗且不禁止自动卸载，并且>4LY，或>3LY且严格>60天。无玩家舰队直接返回。空生成结果只expire到末段，本次不直接删除路线。
- 空间位置不是市场坐标快照：BaseCampaignEntity:961–965与BaseLocation.LocationToken按当前containingLocation读取超空间位置；BaseLocation:1140按Sector hyperspace对象身份判断，而不是按类名。RouteSegment进出阶段min(daysMax×0.2,3)，星系中心可免进出段；在途插值逐步float，跨地点中段属于hyperspace。Misc:435–436/645–646/1022–1026确定距离和插值精度。
- CampaignFleet:127/237–248的wasMousedOver是transient，新原生载入false，不能用存档猜玩家看过；noAutoDespawn getter看Boolean非null，保存false非null也算true。CampaignFleet:1543–1547监听器追加不去重；1569–1585卸载还调用全局/本舰监听器、可能abort、清舰船及fader，不能仅删除一个ref冒充完整despawn。RouteManager:285–297对PLAYER_FAR_AWAY不删路线，其它事件只删除第一个匹配。
- 原有草稿只有端点引用和路线计时，没有当前实体/位置共享注册表。新增真实端点、星系中心、玩家和活动舰队的空间闭包，提供路线进度/位置、生成卸载条件和实际同步回调顺序；回调必须由真实舰队工厂/传感器/卸载服务提供，缺失时明确拒绝，不创建marker舰队或假装消失。保留这些服务可替换以支持大改，但默认规则仍来自原版。
- UI：本轮不改变地图/接近提示布局或控制，不操作桌面。鼠标查看状态是供未来真实UI事件更新的当前运行值，不由后台模拟用户输入；实际近远显示与原版视觉对拍仍待许可。验证只扩已有产业短场景，检验精确边界、当前实体移动、回调顺序、空工厂与共享检查点。

### 路线空间与近远阶段本轮结果

- 新OriginalRouteSpace和原生空间捕获闭包包含当前端点、位置对象、星系中心、玩家舰队及活动舰队旗标/监听器引用；原生JSON读回按positionRef恢复共享Vector2，Web checkpoint严格保留别名。LocationToken使用where而不是BaseCampaignEntity.cL；hyperspace判断为当前Sector对象身份。鼠标查看瞬态在原生载入为null，Web当前状态可持久保存，不由后台注入鼠标。
- 路段整体/离开/在途/进入进度、当前所在位置、超空间插值、1.6LY生成和3/4LY卸载门槛已按源码实现。星系中心的阶段豁免、严格30/60天边界、Boolean非null getter、float逐步舍入和零时长NaN比较均保留；移动当前空间对象会改变路线getter，不回读静态市场坐标。
- OriginalRouteFleets接路线副本遍历、真实识别+曾鼠标查看才清seen、先despawn后spawn且卸载后continue、空工厂结果只expire、监听器不去重追加、非远离事件只删第一条匹配、goToAtLeastNext等顺序。MilitaryBase卸载前回调本来为空；其他spawner需真实回调。CampaignFleet.despawn全监听器/清船/fader和BaseLocation成员/renderer移除交给明确的真实服务入口，缺服务即拒绝，未创建marker舰队。额外源码BaseLocation:375–386确认移出objects并不清containingLocation，不能擅自置null。
- 草稿新增路线位置读取、鼠标查看状态setter、单独实体阶段和先时间后实体的RouteManager入口；检查点schema11保存空间闭包，schema10及更旧迁移routeSpace=null，不从历史存档补当前位置。军事原版参考增加空间/舰队源码与路由常数，49项来源。此空间闭包尚不是整个已发布世界实体集合，未声称原版地图UI/轨道移动/传感器已接齐。
- 仅扩现有ordered shared load一条场景，修复旧经济夹具无身份playerFleet占位问题并保留明确unresolved，及补核零时长NaN后，最终约1.09秒通过；类型和12文件定向lint通过。场景验证动态坐标、进出位置、严格距离/时间边界、鼠标查看、战斗/noAutoDespawn门禁、工厂缺失/返回null、实际服务调用次序、监听器重复、路线副本和旧schema迁移。工厂/卸载服务顺序使用明确夹具，不冒充真实舰队已经生成。
- 一次新真实只读捕获/回读：65市场、232路线全部可读取位置，116实体、45位置、24舰队，unresolved=[]，checkpoint读回一致。当前快照潜在近距待生成0/识别重置之前满足卸载0，但15活动舰队与玩家同位置需要真实sensor getter，所以没有执行完整spawn/despawn阶段。真实生成舰队0，原存档写入0；产物仅ignored artifacts/native-save-route-space-capture.json及native-route-space-readback.json。
- 下一关键缺口是实际舰队感知/识别getter、FleetFactoryV3实体构建和PatrolAssignmentAIV4，以及全局/本舰despawn监听器与世界成员/渲染注册。RouteManager的routesByLocation缓存、完整自然帧/地图呈现也未完成。原版UI、非军事产业/玩家建造交易、完整生涯和独立/合作联机仍保持完整目标，readyForAuthority=false；未操作桌面、使用子代理、暂存提交或发布。


## 路线舰队真实传感器识别（2026-09-21，实施前对照）

- 原版0.98a-RC8 BaseCampaignEntity:1016–1072/1130–1226：sensorStrength/Profile 是保存的 nullable Float；缺profile直接完全识别，缺strength才不可见。debug关传感器（玩家且非ghost）和缺profile在位置比较前返回。当地距离逐步float并扣双方半径；先受位置探测上限裁剪，再合并双方StatBonus的percent/flat/mult，而不是依次computeEffective；随后玩家探测动态倍率、双方应答器、easy加值、最终上限。四级识别比较均为<=，非舰队override<0禁止细节。已交叉核实本机jar字节码。
- CampaignFleet:413–431/938–1029/1211–1221/1309/1485–1490：getter不sync，半径来自当前fleetSizeNum（readResolve初始0）；range bonus来自MutableFleetStats。BaseCampaignEntity:518–537通过j0恢复transponder，不能把transient tOn当false。DynamicStats:46–51的getValue缺key直接1，不新建stat。Utils:232–234距离的平方及相加先float再sqrt。
- 当前差异：路线实体阶段只有外部visibility回调。接入当前传感器闭包（玩家绑定已有真实fleet句柄，NPC保留当前保存的强度/轮廓和readResolve计数），不擅自触发NPC完整FleetData同步；所有新生成舰队必须提供真实句柄。不将读档getter阶段冒充完成整个自然世界帧。默认进程传感器开关true，保存当前Web开关但不声称恢复原JVM临时开关。
- UI证据：已重新查看用户两张近远黑洞裁图；它们证明天体呈现变化，不证明舰队四级传感器图标。本轮不更换UI布局、不猜传感器美术；舰队识别实机视觉与动态fader仍待许可。
- 实现与验证：提供可替换的来源常量和识别服务，默认路线读取实际getter；新schema保存当前共享sensor状态，旧schema明确缺失而不是从历史输入补。集中完成后仅扩既有短场景验证边界/读取顺序/共享句柄和checkpoint，另一次原存档只读回读；不跑全套、不新增测试工程。

### 传感器识别本轮结果

- 新OriginalSensors按原版getter顺序实现NONE、SENSOR_CONTACT、COMPOSITION_DETAILS、COMPOSITION_AND_FACTION_DETAILS；逐步float、边界<=、null与0差异、双方StatBonus合并、玩家动态倍率、应答器、easy、normal/hyperspace cap、extended range、ghost/debug及非舰队details override均保留。独立reference-sensors含11项原版设置/12项来源，规则可替换但不改变原版默认。
- captureNativeFleetSensors只捕获当前路线相关舰队的真实getter闭包，复用captureFleetStats，不强行触发NPC完整FleetData.sync。NPC读档fleetSizeNum初始0是原版readResolve阶段；并非声称其自然帧已完成。玩家绑定现有真实fleet句柄，后续计数/强度/轮廓更新直接影响识别；跨舰队stats/targets在原生JSON按身份恢复。动态getValue缺键不创建stat，距离超出cap不读取动态倍率。
- NativeLiveEconomyDraft默认路线识别已接真实sensor getter，可显式替换服务；新增sensorState/fleetVisibilityToPlayer/bindSensorFleet。schema12保留当前sensor状态、玩家和统计目标共享身份，图检查点严格检验别名；schema11及更旧迁移sensors=null，不从历史capture补当前状态。新舰队的完整构造/世界注册仍需真实工厂，bind不是创建占位舰队。
- 仅扩已有ordered shared load一条短场景，修正夹具变量重名及缺despawning字段后最终约1.23秒通过；生涯类型检查和11文件定向lint通过，未跑全套/未建测试工程。覆盖四级边界、读取顺序、无副作用动态读取、半径/共享计数更新、默认路线识别和旧档迁移。
- 新真实只读捕获/回读：65市场、232路线、24传感器舰队、unresolved=[]。当前getter阶段24舰队（含玩家自身）的结果为19 NONE、0 SENSOR_CONTACT、1 COMPOSITION_DETAILS、4 COMPOSITION_AND_FACTION_DETAILS；这不是完成NPC自然sync后实机画面断言。默认传感器首次使该实际快照路线实体阶段无需visibility测试回调即可执行；当前spawn/despawn候选各0、未曾鼠标查看故observed0，真实生成舰队0。schema12玩家共享句柄保持，checkpoint分支阶段结果一致。
- 原存档写入0，私有产物只新增ignored artifacts/native-save-sensor-capture.json和native-sensor-readback.json。没有原版实机/视觉验收，没有操作桌面、启动子代理、暂存提交或发布。
- 下一缺口仍为FleetFactoryV3实际舰队构建、PatrolAssignmentAIV4、despawn全事件与世界成员/渲染、完整NPC自然sync、routesByLocation缓存及自然世界帧；原版UI、非军事产业/玩家建造交易、完整生涯和独立/合作联机仍未完成，readyForAuthority=false。


## 舰队工厂实际选船依赖（2026-09-21，实施前对照）

- MilitaryBase:419–501先按route种子算实际作战/油船/货船预算，再走FleetFactoryV3；后者1130–1159依赖Market.pickShipsForRole→Faction.pickShip。现有Web没有这个真实选船服务，因此先接齐这一必经依赖，不以随机船名/marker代替舰队。军官、成员构造、inflater及巡逻AI仍是后续工厂阶段，不能只输出variant ID就宣称已经生成舰队。
- Faction:1082–1192/1283–1415：四种pick模式、蓝图/导入/优先集合、限制变体、船体频率与覆盖、战斗货船混入、timestamp后预算过滤、优先候选存在但超预算时不回退ALL、角色递归fallback、同一random消耗与float边界。缓存是按实际Role对象的三张表；有ShipFilter不读写缓存，timestamp/FP不写回基础候选。
- javap已核实反编译的奇怪fallback2行为确实存在：切换fallback对象/数量后，局部目标role字符串仍保留首个fallback目标（可能null），不能擅自“修复”。O0Oo$oo.add是追加，不去重；includeDefault保留共享条目/重复权重，插入位置遵循原版JSONObject.names的HashMap顺序，不能用JS枚举或排序替代。原版json.jar构造明确使用HashMap；导入时使用隐藏原生JSON顺序助手，不启动游戏。
- Faction:202–239/317–376：非dev读档为已存蓝图与当前spec合并，不清空；dev且非player才清空已知/优先/导入/时间戳等。新增配置蓝图会清其时间戳，已经知道的保持原时间戳；autoEnableKnownShips使新增舰体成为优先。doctrine仍复用既有共享对象。SpecStore:1307–1318/1405–1508/1704–1741核实标签/显式舰体集合、导入空集合默认known及频率乘法；ShipHullSpecLoader:167–179的皮肤标签是清空后替换，不继承基础船标签。
- UI：本轮只接选船与生成依赖，不改原版布局；用户天体截图不证明新生成舰队/巡逻图标和互动，实机视觉仍待许可。集中实现后只扩现有短场景与类型/定向lint，不新增测试工程。

### 原版实际选船依赖本轮结果

- 新OriginalShipSelection实现Faction.pickShip必需的ALL/IMPORTED/PRIORITY_ONLY/PRIORITY_THEN_ALL、三张基础候选缓存、蓝图/优先/导入/限制变体、船体频率/指定变体覆盖、战斗货船混入、时间戳与FP预算裁剪、WeightedRandomPicker逐步float及回退递归。保留已确认的fallback2局部目标不变行为、重复条目权重、过滤器绕过缓存；ShipFilter回调期间后续候选读取当前蓝图集合，不复制为过时快照。
- 新reference-ship-selection导入21势力、51原生角色对象、417条目与710真实变体FP/船体映射；313项来源。NativeJsonOrder仅以安装json.jar/JRE在后台计算JSONObject.names顺序，不运行游戏或加载存档；includeDefault插入位置与共享条目引用不靠JS顺序猜测。船体标签来自原始CSV，皮肤清空重设；自动D型只保留原版10项标签白名单。配置蓝图集合用于pickShip成员关系，不冒称全局舰体注册表原生遍历顺序已实现。
- 新captureNativeShipSelection读取真实Faction蓝图/导入/优先/变体覆盖/频率/时间戳/autoEnable字段；读档合并当前spec（缺蓝图才取消其时间戳并按autoEnable加入优先），dev且非player才清空。devMode采用当前Web原版配置，不宣称恢复原JVM未保存的临时开关。罕见跨势力共享集合显式unresolved，不默默断开别名。
- NativeLiveEconomyDraft新增共享shipSelectionState、pickFleetShipsForRole、fleetShipRoleAvailability、clearFleetShipRoleCache。与既有当前doctrine同句柄，可传实际route随机流/ShipFilter；默认随机为已有明确Web分支随机，非原JVM未保存Math.random。schema13保存当前角色对象、候选缓存、蓝图输入、共享doctrine和随机进度；旧schema12及更旧不从历史capture补新选船状态。
- 仅扩既有ordered shared load一条场景（初次约1.76秒通过；复核修正过滤回调实时集合后约1.49秒通过），类型与10文件定向lint通过，最后只重查3个修改文件；没有全套测试或新测试工程。覆盖实际变体返回、昂贵优先候选不偷偷回退ALL、时间戳边界、过滤器/缓存、blueprint变动、双船回退预算与weight、fallback2、重复候选、货船混入/覆盖，以及旧档迁移和共享检查点。
- 一次新原存档只读捕获/回读：21势力×6实际角色=126次选择，92次非空、92个真实变体结果、未知变体0、unresolved=[]。查询后包含原版惰性空角色共230个角色对象。schema13检查点继续选择的随机结果一致，21个doctrine共享身份保持；原存档写入0，真实生成舰队0。产物仅ignored artifacts/native-save-ship-selection-capture.json与native-ship-selection-readback.json，JSON顺序助手编译目录也仅在ignored artifacts。
- **这不是完整FleetFactoryV3。** 下一步还要预算拆分/舰种尺寸编排与prune、实际FleetMember与名字/军官/舰长构造、DefaultFleetInflater、forceSync/修复CR、MilitaryBase世界注册/标记/PatrolAssignmentAIV4，然后默认spawn/despawn和自然世界帧。完整生涯、原版UI、独立/合作联机与可大改结构目标不变，readyForAuthority=false。无可见窗口/桌面操作、子代理、暂存提交或发布。


## FleetFactoryV3 舰队编排与裁减（2026-09-21，实施前对照）

- 原版0.98a-RC8 FleetFactoryV3:213–353/1130–1475：市场舰队规模先作用combat，onlyApplyFleetSizeToCombatShips再决定物流倍率；严格编成仍消耗三个nextInt；非严格再消耗两个nextFloat，分配军舰/航母/相位FP并把取整余量归军舰。addShips列表与战斗货船先入队，随后作战/货运/油船/运输/客运/工具依原序执行。
- 三尺寸与四尺寸编排读取原版矩阵，先半数小舰/中舰再剩余小舰、大舰、中舰/主力舰。priority主力舰使用联合预算并再分配，失败会删去该picker中的首个同名角色；两次失败（成功不清计数）后将航母/相位余量转军舰并追加角色，不去重。minShipSize只限作战循环，物流遵各SizeFilterMode，不能擅自统一过滤。所有随机调用要与实际选船/命名共享同一流。
- 原版pruneFleet:416–648按战斗/民用FP及民用类别配额，稳定尺寸排序、大小舰抽取，再回填低FP成员。已用本机API jar字节码核实反直觉的keepCiv=maxShips-keepCiv赋值，以及调整成员副本时i+=2；保留原行为，不自创“更合理”的裁减。doctrineSize参数原版未使用。
- 实现边界：这是一段接受真实舰队成员服务的工厂阶段，不先造variant-only假舰队。创建成员、命名（会消耗同一random）、添加/移除、真实排序和成员getter到达时必须有实际服务；已完成的Faction选船与共享doctrine/市场倍率可作为默认依赖。完整成员构造、军官/舰长、inflater和世界注册仍未接齐，不会把编排通过说成巡逻已可玩。sizeOverride是原版工厂静态当前状态，需在Web工厂服务与检查点中明确保存。
- UI本轮不改，用户提供的天体截图不能证明舰队编成画面；不启动可见游戏，原版实机/视觉待许可。集中实现后只扩既有短场景和定向静态检查，不做新的测试工程或私人存档重复捕获。


### FleetFactoryV3 编排/裁减落地（2026-09-21，本轮）

- 新增 OriginalFleetComposition 与声明文件，按已核实原版阶段实现市场倍率、六类FP预算、严格/非严格doctrine拆分、额外指定舰只、战斗货船比例、三尺寸物流和四尺寸作战编排。保留Java float逐步舍入、NaN转int为0、整数溢出、nextInt(1)也推进随机、严格编成仍先消耗三个int等语义。
- 实际选船和成员创建通过同一随机流串行调用：pickShipsForRole → createMember → pickShipName → setShipName → addMember → memberFP。没有把名字延后批处理，没有生成variant-only占位舰队。缺少真实成员服务时明确拒绝，shared draft失败后不能继续导出checkpoint。
- 优先主力舰按原版角色权重使用联合预算，再归还/重分配三类剩余FP；优先模式和blockFallback按原版固定值恢复。两次失败才转移航母/相位预算，成功不重置失败计数。Picker保留累计float total和首个同名删除，军舰补入不去重。
- 超编先sizeOverride=5补船，恢复0再裁减；按实际成员对象身份、民用类别、尺寸排序/随机比例和FP换船。保留keepCiv=maxShips-keepCiv、i+=2的半反转、bestDiff初始0导致不接受过目标替换等原生怪逻辑，未额外强加“绝不超maxShips”的新规则。最后真实sort两次。HullSize ordinal来自ShipAPI（DEFAULT0/FIGHTER1/FRIGATE2/DESTROYER3/CRUISER4/CAPITAL5）。
- 新import-campaign-fleet-composition与NativeFleetCompositionConstants仅后台读取安装API/JRE的静态矩阵/常量和settings；9项源哈希，maxShipsInAIFleet=30，大小舰矩阵与反编译逐项吻合。没有启动引擎、加载原存档或打开窗口；编译输出仅新增ignored artifacts目录。
- NativeLiveEconomyDraft增加fleetCompositionState、composeFleetRoster；默认复用当前共享势力doctrine、真实市场combat_fleet_size_mult和已实现的Faction角色选船，成员生命周期由实际调用方提供。市场pickShipsForRole原版可用同ID cachedFaction，其字段为transient、读档为空；当前共享草稿使用canonical势力，未来临时市场/自定义势力句柄需传替换服务，不能把该阶段说成已完成原版临时市场构造。
- checkpoint schema14保存当前工厂sizeOverride，schema13及更旧迁移为composition=null，不能从历史capture重建当前static值。编排不返回完整舰队或authority证书；完整createFleet的空舰队/source选择、军官/舰长/旗舰、inflater、forceSync/CR及世界注册不在该阶段内。
- 验证只扩同一ordered shared load短场景：覆盖真实选船默认依赖与命名穿插、零预算/NaN拆分、小数预算、物流尺寸差异、优先主力联合预算、转移预算、补船sizeOverride和原版裁减怪分支、真实对象身份、schema14随机重放/旧档拒绝。首轮到最后一个拒绝断言时因测试文案匹配错误失败（实际已正确拒绝checkpoint），修正文案后同一场景约1.62秒通过；类型和7文件定向lint通过，之后仅复查两个修改文件。未运行全套，未新建测试工程，未重复捕获私人存档。
- **尚未生成默认真实舰队。** 夹具的成员回调验证的是工厂编排，不是FleetMember真实构造/名字算法/完整舰队/UI。下一步接真正的FleetMember构造与舰名服务，随后军官/舰长、inflater与同步、MilitaryBase注册/PatrolAssignmentAIV4、默认spawn/despawn和自然帧。完整生涯、原版UI、独立/合作联机及可大改结构目标不变，readyForAuthority=false。未暂存、提交、推送或发布。


## 真实FleetMember构造与舰名（2026-09-21，实施前对照）

- 原版0.98a-RC8 CampaignEngine:1496–1501、FleetMember:78–91/127–192/306–360：SHIP字符串入口owner=0，先分配成员UID，再新建BuffManager与steady默认舰长（独立人物UID）；stock变体克隆，多个非空武器组关闭自动编组；新舰体/模块完整、crew=0、RepairTracker.cr=0.5，立即运行真实updateStats（舰长未入舰队时不应用个人技能）。缺 hullmod/stat 实现必须拒绝，不能只填基础FP。
- Person:57–86、CharacterStats与既有原生人物构造：默认舰长neutral、空名/ANY性别、默认头像、level1和aptitude初始化；复用当前Sector UID及共享人物注册表，不自造随机ID。人物memory在当前模型是原生查询投影，未物化的原生memory必须标明，不能声称构造调用了getMemory。
- FleetMemberStatus:44–56/383–387、ShipStatus默认：按有效STATION_MODULE槽数量+1创建，初始armorGrid=null、hullFraction=1；FIGHTER_WING用实际numFighters，引用共享stock变体而非逐舰克隆。HullVariantSpec:364–393/clone/1031–1125核实民用判断、武器组JSON顺序、克隆与模块槽顺序。
- ShipNameStore载入时按原生JSONObject HashMap键顺序处理命名组，全局名字去重：重复项只归先加载组；OMEGA/DERELICT_DRONE/THREAT/DWELLER不加入ALL。FleetData:289–307/446–454按势力spec来源权重建立当前picker，前缀是FleetData当前值。ShipNameStore总是先消耗Math.random，再由传入random.nextInt覆盖索引；未知/ALL来源提前返回，留下static random引用，已知来源返回后才清空。将用本机jar字节码核对这项反直觉行为。默认重复序号关闭；传入Random时也不追加罗马数字。不能为“修复”随机顺序省略调用。
- 计划落点：实际成员状态/名字服务接共享草稿及检查点，编排默认可用真实createMember、setShipName和成员getter；FleetData创建、入队/排序的sync副作用仍需真实绑定，不用假fleet代替。UI本轮不改，用户天体截图不证明舰队/军官面板；原版实机和视觉待许可。集中实现后仅扩同一相关短场景与必要静态检查。


- 真实成员首轮检查发现此前只覆盖保存成员的插件集合不够：lasher的BallisticRangefinder前置方法原版明确为空（实际射程监听器在afterShipCreation），UnstableInjector前置则修改maxSpeed、ballistic/energy range及fighterRefitTimeMult。已检查本机两个Java文件；补入真实空钩子和实际常量，不用通用no-op跳过未知插件。成员构造源引用保留这些补充常量；未知活动插件仍拒绝，不能用未应用插件的基础船通过验证。

- 真正Faction选船继续走到SafetyOverrides；已对照本机data/hullmods/SafetyOverrides.java：尺寸速度flat、加减速2倍flat、零幅散阈值+2、幅散×2、峰值时间×0.33、禁强幅散、450射程阈值及阈值外倍率×0.25。补齐前置统计而不是改用容易通过的船型；战斗尾焰after/advance效果不在此阶段。

- 静态检查本次实际候选的整组插件后补HardenedSubsystems：原版峰值时间+50%、CR衰减倍率0.75，和安全超载同存时各自保留不同通道；未把缺失效果吞掉。


### 真实成员构造/舰名落地（2026-09-21，本轮）

- 新OriginalFleetMembers及声明文件：SHIP/FIGHTER_WING真实当前成员状态，包括Sector UID、共享steady默认舰长、variant/source/weapon group克隆、BuffManager、完整ShipStatus数组、crew0/marines0、CR0.5和原版updateStats。分配顺序为成员UID后舰长UID；默认人neutral、空名/ANY、spaceCommander/fleetCommander，已有人物注册表共用身份。人物Memory继续沿用当前查询投影并明确nativeMemoryAllocated=false，不宣称构造时物化了原版Memory。
- SHIP独立克隆武器HashMap/配置数组/武器组；多个非空组关闭mayAutoAssignWeapons。FIGHTER_WING复用当前stock变体，多翼共享同一对象。失效SHIP变体走安装errorShipVariant，但保留请求specId。模块Status按实际STATION_MODULE槽创建，初始模块slotId仍为原版null；空_Hull默认模块填充依赖全局注册顺序尚未恢复，明确拒绝该分支，不填空模块冒充。
- 补cloneOriginalStorageVariant复用已有原生HashMap顺序逻辑，默认舰长复用既有人物构造/UID，updateOriginalMemberStats显式允许未入队的null FleetData，不造假fleet。新舰保留真实 hullmod/CR/crew统计；本轮补原版BallisticRangefinder明确为空的前置钩子、UnstableInjector、SafetyOverrides和HardenedSubsystems的实际前置效果。其它未知活动插件仍拒绝，不把未应用的插件当成成功。
- 舰名引用导入710变体、266舰体元数据、27名字组/2491全局去重名及21势力来源，767项来源哈希。复用NativeJsonOrder输出本机json.jar键序；名字跨组去重的先后、四个特殊组不进ALL、来源picker float累加、空/未知来源、前缀、翼编队名和重复罗马序号均按原版。实际Source/ALL路径的staticRandom保留差异以及“有指定random仍消耗一次Math.random”已核对jar字节码。
- Web名字全局计数/Math.random沿用明确Web分支状态，不声称恢复原JVM未保存的静态计数或种子。schema15保存当前创建成员、stock变体共享身份、舰长/人物引用、名字计数及静态/全局random引用；旧schema14及更旧memberFactory=null，不从历史capture补造。每个FleetData当前前缀/来源picker是调用方持有的命名状态，未来创建真正FleetData时要挂入它自己的当前对象图，不能仅靠全局工厂状态代替。
- NativeLiveEconomyDraft新增createFleetMember、pickFleetShipName、bindFleetMemberConstruction和fleetMemberFactoryState。composeFleetRoster默认成员构造与名称setter/FP/尺寸/民用getter已接真实后端；bind可提供真实名字算法。添加/移除/排序和列表getter仍要求真实FleetData服务，不能把测试容器当默认实现。
- 集中扩两个直接相关既有场景：原有编排/迁移约2.26秒通过；真实人物/舰队场景发现缺失插件后逐项据源码补齐，最终约1.05秒通过。实际构造lasher副本、buffalo、condor、talon翼及未知变体回退，核实UID次序、默认舰长、独立克隆/共享翼、当前统计、命名随机推进/静态泄漏和schema15继续一致。原版选船→真实构造→真实命名→统计getter已在显式FleetData容器夹具内贯通；**容器的入队/排序回调仍是夹具**。类型和14文件定向lint通过，修复后只复查相关场景/文件；没有全量测试、新测试工程或私人存档重复读取。
- 下一步仍需真正FleetData/CampaignFleet创建及add/remove/sort/sync、军官/舰长技能/旗舰、inflater与CR、军事世界注册/PatrolAssignmentAIV4、默认生成/卸载和自然帧。其它原版UI、殖民地全流程、自定义生产、独立/合作联机目标不变；完整生涯未完成，readyForAuthority=false。未操作桌面、启动可见窗口、用子代理或暂存提交推送发布。


## FleetData 成员管理接入（2026-09-21，实施前对照）

- 原版0.98a-RC8 FleetData.java:457–489/512–545：普通入队按对象身份去重、填首个NULL槽，无空槽追加；未命名非翼按当前舰队命名随机/来源picker选名，绑定FleetData，调用getCaptain（缺失时惰性steady舰长，已附属舰队时设实际势力），清旗舰再dirty。带索引的add只插入并dirty，不能套普通入队副作用；移除首个相同对象并折叠槽，没找到也dirty并清member.fleetData。FleetMember.setFleetData只是引用setter；setFlagship(false)不刷新舰长统计。
- FleetData:572–604/630–643及安装starfarer_obf.jar javap：成员缓存仍按FP降序（保留原版比较器尺寸误取首项）；onlySyncMemberLists分支必须在列表同步后forceNoSync=false。getSortedMembers固定设onlySyncMemberLists=true，调用同步后固定设false，不恢复先前true。
- FleetData:969–1025：真正sort先dirty/sync，按非封存→指定尺寸→尺寸降序→FP降序稳定排序，清原列表，再走真实普通add逐个回填（含清旗舰），最后sync。sortToMatchOrder按字符串ID匹配首项、逐个移除候选、重入队，末尾不主动sync。不能用Array.sort容器回调冒充。
- 当前差异：编排已有真实选船/成员/名字，但实际FleetData管理未接；既有list-only代码与旧断言错误地保持forceNoSync=true，会令连续加船后缓存停更。本轮提取通用sync并修复；实现面向实际现存FleetData的成员管理服务，当前命名/随机绑定保存到Web checkpoint。不会把该绑定当CampaignFleet构造或世界注册，原版空舰队静态对象/随机人物/AI仍待接。
- 验证：替换既有成员构造场景的push/splice/no-op-sort容器为实际FleetData服务；同一场景检查身份去重、连续列表同步、两种排序副作用、命名picker随机恢复、共享检查点续接；原有舰队核心场景纠正旧断言。集中实现后仅这两条短场景、类型和修改文件lint，不读私人存档。UI本轮不动，天体截图不证明舰队UI；原版实机/视觉仍待许可。

### FleetData成员管理落地（2026-09-21，本轮）

- 新OriginalFleetRoster及声明：在实际现存FleetData上进行对象身份去重、首NULL槽回填、普通/索引入队分离、折叠移除、交换、清空槽、成员副本/计数、只按FP的缓存排序，以及按封存/指定尺寸/尺寸/FP的真正sort。真正sort保留清原数组→普通add逐一回填→sync；sortToMatchOrder按ID挑首项、末尾保持dirty，不额外同步。没有复制生成另一个假FleetData，也没有创建CampaignFleet marker。
- 普通入队用原版picker.pick(random)重载，恢复picker先前random；与FleetData.pickShipName固定清null的行为分开。FleetMember.getCaptain缺省时实际建steady人物，附属舰队必须给出真实势力，不能从命名来源势力猜；支持玩家旗舰临时返回玩家的原版getter（核实CampaignFleet.getFlagship列表同步/回退次序）。清旗舰不覆写底层captain，统计人物lookup保留底层舰长共享引用。原生存档采集补sN/iF，对照CampaignGameManager:1844/1846；旧capture缺字段时不能猜成员姓名/旗舰。
- 通用synchronizeOriginalFleet供非玩家FleetData调用，原玩家wrapper保留。onlySyncMemberLists经安装jar字节码纠正forceNoSync=false；新增明确member-lists-only生命周期，不将只更新列表冒称完成stats/crew/CR同步。完整生命周期依然使用既有真实服务，未知插件/缺失状态不跳过。
- NativeLiveEconomyDraft新增fleetRosterState/registerFleetRoster/bindFleetRoster；回调统一受草稿失败封锁保护。schema16保存实际FleetData、当前命名picker、shipNameRandom与成员工厂/玩家舰队共享身份；恢复时检查重复FleetData、拆分成员引用。旧schema15及更旧rosters=null，不从历史数据生成新当前绑定。补齐服务类型中既有composition/memberFactory字段。
- 验证容器已替换：现存捕获FleetData配显式list-only fixture输入，选船→实际成员/命名→真实入队→真正排序→实际成员列表贯通；不再用push/splice/no-op-sort回调。覆盖重复身份无副作用、连续加船后缓存更新、首空槽、删除不存在成员仍dirty、索引重载不命名/不清旗舰、封存和指定尺寸排序、sortToMatchOrder末尾dirty、getSortedMembers固定关onlyLists、交换/清槽、懒建舰长、共享checkpoint继续创建/命名/入队一致、旧schema15不补造。
- 集中两条既有短场景首次通过（成员约1.44秒、核心约0.022秒）；自查补临时玩家旗舰底层舰长lookup后仅复查同一成员场景（约1.23秒）。生涯类型、12个修改文件定向lint通过，最后仅复查3个改动文件。无全套、新测试工程、私人存档读取或可见窗口。源码/字节码核实和Web逻辑验证不等于原版实机/视觉等价。
- **边界：这是真实已有FleetData的变更后端，不是完整舰队构造/世界生成。** 当前已用list-only真实阶段验证编排；默认createEmptyFleet/source市场构造、静态NULL_MEMBER/defaultCommander初始化/引用、CampaignFleet随机人物/AI/运动、军官技能/旗舰设置、inflater/最终CR和完整同步、巡逻世界注册/PatrolAssignmentAIV4/自然帧仍待接。Full生涯、原版UI、殖民地、自定义生产、独立/合作联机与可大改结构目标不变，readyForAuthority=false。未暂存、提交、推送、打包或发布。


## 真正FleetData/CargoData构造前置（2026-09-21，实施前对照）

- 本机0.98a-RC8 FleetData.java:68–95/289–307：成员/三缓存/军官/snapshot为空，FP与强度0、燃耗1、最小船员0、速度100；cargo=new CargoData(false)，commander/fleet=null、needsSync=true。命名来源按实际势力picker复制。CargoData:54–71/100–102原始空舱spaceUsed=50、容量1000/500/750、credits=new MutableValue(0)，cargo.carryingFleet在FleetData构造末尾指向该FleetData。安装jar javap已证实boolean参数无论传什么都会被置true；不能按传入false初始化。
- 静态NULL_MEMBER并非type标记：FleetMember字段初始化先分配UID，再创建BuffManager、steady舰长、一个真实ShipStatus、RepairTracker；NULL没有variant，updateStats保留stats=null。随后才构造FleetData静态defaultCommander。每类运行期一次，不能每new FleetData消耗三次人物/成员UID。Misc.genUID按实际运行阶段选择Sector计数或UUID，无法从原存档恢复原JVM静态对象；本轮提供显式“新的Web当前Sector类运行期”初始化，另允许绑定实际已有类对象，不冒称恢复原生静态ID。未显式初始化时构造拒绝。
- FleetData.getCommander:267–271在commander字段null时返回共享defaultCommander；成员技能/旅行速度getter必须读此回退，但syncIfNeeded最开始的commander.stats.setFleet仍只对非空字段执行。recrew:832–885在fleet=null时不读取AI模式，真实独立FleetData用自己的cargo船员重配，不能要求一个虚构false AI。
- FleetData:392–439：insertAtIndex先扩至index+1个槽再插入，可能留下末尾额外NULL；setAtIndex替换不自动解绑被替换成员；removeAtIndex无效索引直接返回，有效索引回填同一静态NULL。会接现有真实管理服务，不拿临时NULL标记充当类单例。
- 实施范围：真实FleetData与CargoData构造、类级共享对象、默认指挥官与完整独立同步、共享保存恢复。它是CampaignFleet构造的实际内部对象，不是可移动舰队实体；本轮调查确认后续CampaignFleet还需BaseCampaignEntity、Faction.createRandomPerson（头像/名字/声音）、移动/朝向、AI和事故/后勤对象。不能越过这些依赖就宣布空世界舰队已完成。UI不改；原版实机/视觉待许可。验证集中在已有真实成员场景和舰队核心场景，不新增工程、不读私人存档。

### FleetData/CargoData构造落地（2026-09-21，本轮）

- 新OriginalFleetDataFactory：真实独立FleetData和CargoData，保留原版初始三缓存/军官/snapshot、needsSync、FP/强度/速度/燃耗、货舱容量与spaceUsed=50；两个boolean CargoData构造分支都按本机字节码置unlimitedStacks=true。资金对象为真实共享MutableValue投影，cargo和FleetData指向同一对象；内部objectRef标识FleetData自身，campaignFleetRef=null，绝不分配假的世界舰队ID。FleetData/CargoData本身不消耗Sector UID，仅Web对象句柄分配器递增。
- 新显式initializeFleetDataClass按新的Web当前Sector类运行期执行一次静态初始化：实际NULL成员UID→该成员默认舰长UID→静态defaultCommander UID。重复初始化复用同对象，不再耗UID。另有bindFleetDataClass用于实际已有类对象；未初始化/绑定就创建明确拒绝。静态对象不是原存档可恢复内容，不声称重建原JVM静态ID；原版启动前UUID分支尚无自动引导，当前模式清楚标为new-web-current-sector-runtime。
- NULL成员走共享实际成员构造：owner=-1/specId=null/variant=null、BuffManager、默认舰长、一个ShipStatus、RepairTracker/CR0.5、crew0；真实updateStats的无variant分支保留stats=null，而不是给NULL套默认船型。成员工厂及检查点验证支持此真实成员类型。原版来源清单增加CargoData、MutableValue和Misc UID逻辑，后台重新导入后770项来源哈希。
- 新OriginalFleetCommander区分原版getter与nullable字段：默认指挥官参与成员fleetwide统计和旅行速度，完整sync开头仍只对非空commander字段setFleet。独立FleetData无需虚构AI模式即可按自己的cargo完成补员/CR/容量/强度/速度和buff/hullmod生命周期；不借用synthetic lifecycle callbacks。
- 槽位扩展/替换/不折叠移除/clear接真实共享NULL_MEMBER，保留insertAtIndex扩至index+1再插入留下额外空槽、setAtIndex不解绑被替换项等原版行为。索引重载不额外调用getCaptain/命名；统计阶段仅补人物lookup投影，保持底层直接引用，避免新舰长被lookup遗漏。
- 共享草稿新增fleetDataFactoryState/initializeFleetDataClass/bindFleetDataClass/createFleetData。schema17保存当前类对象、构造序号、实际实例/成员/货舱/资金/默认舰长的共享身份；恢复校验实例与roster同对象。旧schema16及更旧dataFactory=null，不能靠旧快照补造静态对象。
- 同一既有成员场景已验证一次性三UID分配、两个FleetData复用静态对象且构造不额外耗UID、实际初始货舱值、空FleetData完整sync、真实lasher成员从零船员到原生资源add补满船员的完整sync、实际FP/强度/容量、共享默认指挥官旅行速度修改、slot操作原版副作用、JSON检查点保持资金/静态对象/实例身份，恢复后继续创建的句柄一致。两个既有短场景一次通过（成员约2.91秒、核心约0.024秒），生涯类型与18文件定向lint通过；无全套/新测试工程/私人存档读取。
- **仍不是CampaignFleet/世界舰队。** 下一步构造还要Faction.createRandomPerson、BaseCampaignEntity、运动/朝向、指挥官refresh、FleetView/事故/后勤/AI及两种createEmptyFleet重载，再接FleetFactory source/军官/inflater与巡逻注册。已定位Faction.java:828–877：默认new Random→性别nextFloat>0.5、最多5次避玩家头像、PersonNameStore命名、按MEDIUM voice并写Memory；PersonNameStore.java:加载人物csv/性别用法分组、两次名称category picker、HashMap回退顺序、nextDouble取名/最多10次同名重抽。SpecStore.java:1291/1345/1640起的人物category/voice/头像加载尚未完整移植，不能先填默认人冒充随机势力舰长。完整生涯、原版UI/殖民地/生产、独立/合作联机与可大改目标继续，readyForAuthority=false。无桌面操作、子代理、暂存提交、打包或发布。


## 势力随机人物构造（2026-09-21，实施前对照）

- 原版0.98a-RC8 Faction.java:828–877：无指定性别/ANY/null先nextFloat>0.5选女，否则男；显式MALE/FEMALE不消耗该次随机。构造steady Person后，非sectorGen最多5次从STANDARD性别头像picker选取，避开当前玩家头像但第5次仍可接受相同头像；sectorGen不避让。随后PersonNameStore生成新FullName、设置势力，按初始MEDIUM重要性选voice，非空时才物化Memory写$voice。这一步没有军官技能/等级生成。
- PersonNameStore.java:35–88/124–149：原版G.o00000解析CSV，不trim姓名本身；LoadingUtils按name/gender/usage/category组合键拒绝重复，单根保持CSV顺序。FIRST/LAST和男女集合遵循原布尔表达式（同时first+last的条目可进入另一性别姓氏表）。分类未知时按原生HashMap.keySet顺序nextDouble回退；分类选择两次，第一次分类重复检查保留；名/姓都用nextDouble索引，姓与名相同最多重抽至10次。安装jar字节码已核实第二次分类选择后仍重新检查第一次分类变量。
- SpecStore:1286–1292/1321–1360/1632–1654与o0oo_0：名字/voice权重来自实际JSONObject键顺序，头像使用数组顺序、权重1；空配置就是空picker，不编造默认头像/声音。javap确认O0oO$o只有STANDARD一个枚举值，反编译new/cfr_renamed_8是同一字段。WeightedRandomPicker.pick(random)保留原先random，空picker不耗随机。
- 实施：后台Java导入助手直接使用安装G CSV解析器和原生HashMap/JSONObject顺序，只读公开定义，不初始化引擎；运行期共享人物工厂保留当前picker/名字表、生成Person共享引用和独立Web新Random种子流。默认new Random的原JVM nanoTime/seedUniquifier不可恢复，明确使用可保存Web分支，给定random则严格沿用该随机流。isInSectorGen必须由实际调用上下文提供，不能拿inNewGameAdvance替代。
- 验证集中扩既有真实人物/舰队场景：给定随机顺序、头像最多5次、未知category、同名最多10次、空picker/nullvoice、男女/ANY、默认人物统计、共享UID/Memory和保存继续。UI不改，头像画面/人物交互未做实机验证；仍不是完整CampaignFleet或军官技能生成。

### 势力随机人物落地（2026-09-21，本轮）

- 新OriginalFactionPersons及类型：Faction随机性别、当前势力STANDARD头像picker、非sectorGen最多5次避开玩家头像、真实新Person/UID/CharacterStats、PersonNameStore姓名、当前势力与MEDIUM声音，均按原版顺序执行。新FullName替换构造时的空FullName；有声音时以原Memory.set无过期语义记录$voice并标记nativeMemoryAllocated=true，无声音保持false；内存仍是明确字段闭包，不冒称全Memory系统。
- 姓名表含男女FIRST/LAST各9个category，来自原版2313条CSV记录；保留名字原文、大小写gender/usage包含规则、first+last条目跨性别姓氏行为、同名姓最多10次尝试、未知category的原生HashMap顺序回退及字节码中的重复FIRST检查。三种voice重要性映射、空头像/nullvoice picker和临时random恢复均保留。
- 新后台NativeFactionPersonInputs.java及导入器直接调用安装的G.o00000 CSV解析器，并用原生HashMap/JSONObject生成键序；不启动引擎或读取私人存档。导入21势力、2313条记录，37项公开来源哈希；默认无voices/portraits时不虚构值。单安装core范围，不宣称mod覆盖目录合并已实现。
- 显式random严格共享调用方流；Faction/PersonNameStore的new Random使用独立、可保存的Web种子分配流，不声称恢复原JVM的nanoTime/seedUniquifier。直接pickVoice(null)原版是Math.random而不是new Random，此路径已单独接原有Web global随机，且与ShipNameStore共享同一对象。isInSectorGen由真实调用上下文显式提供，缺失拒绝，不等同inNewGameAdvance。
- 共享草稿新增factionPersonFactoryState/createFactionPerson/pickFactionPersonName/pickFactionVoice；schema18保存当前姓名表/势力pickers、实际人物引用及默认新Random进度，校验global随机与既有成员命名共享。旧schema17及更旧personFactory=null，不从历史capture补造。原存档公开来源校验加入人物引用输入。
- 只扩既有真实人物场景：21势力实际生成、默认steady/level1/MEDIUM、人物注册表同一对象、指定性别/ANY随机次数、头像5次上限和sectorGen区别、同名姓10次上限、空portrait/voice不耗随机、未知category的显式顺序、直接null声线随机、默认new Random与相同显式seed输出一致、schema18共享身份及继续生成一致、旧档拒绝补造。两条相关场景一次通过（共享载入约2.04秒、成员人物约2.94秒），生涯类型和8文件定向lint通过。没有全套、新测试工程或原存档读取/修改。
- **本轮是人物生成，不是军官技能生成或已完成CampaignFleet。** 接下来BaseCampaignEntity实际状态、Movement/Facing、指挥官refresh关联、FleetView/事故/后勤/AI及createEmptyFleet重载；随后source市场、军官技能/inflater、巡逻注册与自然帧。原版UI/完整殖民地/生产、独立/合作联机及可大改结构目标不变，readyForAuthority=false。人物画像画面与交互未做原版实机验收；无桌面操作、子代理、暂存提交、推送、打包或发布。


## Fleet移动/朝向模块（2026-09-21，实施前对照）

- 原版0.98a-RC8：SmoothMovementModule.java构造与advance，SmoothFacingModule.java完整advance；Utils.java:210–222/258–260/333–335/366–377/873–902及Misc.normalizeAngle。安装jar javap核实：Vector.lengthSquared逐步float乘加，length以double sqrt后转float，normalise先float倒数再scale；硬限速无“超限才缩放”判断，而且用软限速之前的速度。
- 预期：保留可变loc/vel引用、正常推进替换accel与零加速度原地清零的区别；两种构造的smoothCap默认不同，delegate速度先于零加速度检查读取，fleet减速下限与无fleet路径分开；移动非正dt/float平方为0不推进。Facing保留float两次取模归一化、顺逆方向、制动与带符号turnRate的吸附条件，不擅自对称化。向量朝向走1024方阵查表索引，而非直接atan2。
- 当前差异：OriginalMovement仍是双精度零targetVelocity子集，真实Travel路径已调用它；没有可复用的有状态运动/朝向模块。先实现并让既有航行调用同一float模块，不改导航存档结构或未经核实的舰队UI。CampaignFleet.advance还需counts/goSlow、战斗与fade分支、朝向字段生命周期，模块通过不等于整帧/完整舰队已接齐。
- 验证：后台原生助手仅调用实际Smooth模块/Utils和向量类，不创建引擎、游戏窗口或读私人存档；将原生位结果扩入既有两条移动短场景，覆盖硬/软限速、delegate、targetVelocity、引用副作用、dt边界、转向与查表。另选一条权威航行场景，集中类型/定向lint，不跑全套。用户截图只证明天体展示，舰队朝向与人物UI实机待许可；本轮不改UI。

### Fleet运动模块落地与集中验证（2026-09-21，本轮）

- OriginalMovement新增实际可变SmoothMovement/SmoothFacing状态及两种移动构造；loc/vel引用不换，accel正常推进替换而零加速度原地清零。运行期delegate保留实际调用方对象，速度经注入服务现取；服务回调不存入模块。不伪造CampaignFleet，不把模块当作世界舰队构造。非正/平方下溢dt、目标速度、无fleet与fleet减速下限、普通/平滑限速以及使用旧速度的硬限速全部分开。
- 当前权威Travel原有advanceOriginalMovement入口已调用同一原生float算法，替换双精度近似，输入/输出接口不变。travel provider版本升为0.7.0以识别数值规则变更，不无声沿用旧规则版本；既有规则锁迁移不在本轮隐式执行。导航schema与UI未修改，Facing模块尚未挂到完整CampaignFleet自然帧。
- Facing保留原版制动、速率限制、两次取模以及带符号吸附；amount=0仍归一化/限速，负dt不提前退出，turnAcceleration=0的中间NaN比较行为保留。Utils向量角按原1024方阵float索引即时求对应表项，不用输入向量直接atan2替代；保留象限偏移、int转换/溢出、零和次正规向量行为。
- 新NativeFleetMotionProbe.java直接调用安装Smooth模块/Utils/LWJGL。Misc静态字段用SettingsAPI只读代理读取实际公开settings.json，剥除字符串之外的#注释；没有引擎、桌面、游戏窗口或存档载入。首次探针遇到#注释与混淆字段名加载限制，分别修正解析和使用安装混淆类需要的-noverify；没有替换原生计算方法。
- 原生13组运动、9组转向、12组查表角位结果已扩入原有两条短场景；Java probe的movement传入null fleet，非null fleet下限另外以源码独立可精确计算例子验证，不冒称真实CampaignFleet实例探针。覆盖目标移动、三参null开启smooth、delegate读取顺序、硬限速提速及旧速度分母、可变向量身份、副作用、120帧朝向及600帧移动。两条场景一次通过，合计约9ms。
- 一条现有权威航行场景原先双精度位置期望失败；仅用原版独立60帧探针替换位置/速度位期望后复查该条通过（约35ms），没有放宽通用容差。类型检查与5文件定向lint通过。没有跑全套或新建测试工程，没有再次读取私人存档。
- 复现助手：javac -encoding UTF-8 -cp <core>/* -d <ignored artifacts dir> scripts/lib/NativeFleetMotionProbe.java；安装jre/java -noverify -Djava.awt.headless=true -cp <artifacts>;<core>/* NativeFleetMotionProbe <core> [travel60]。公开来源SHA256：

{
  "starfarer_obf.jar": "8ae5516bf879ec068d206714fd67b90ebfa113c990f9e473357a5923b9700d6a",
  "lwjgl_util.jar": "6f4a261384e1688a3359420efce5275c8693b822a8c6eaa1e20d5cc126a51571",
  "starfarer.api.jar": "0798e624c949657ab524188928bb13d618a70cb451dc7da9789545569a05081b",
  "settings.json": "96f3f6aa457e85ab6480bf302e35d3e8df390339321711b982d45fbe71c4dfa9",
  "NativeFleetMotionProbe.java": "b06e50be544f4e5fe612eeab04080e763094cb0df19361b872bdf285e7d74cdc"
}

- 下一步仍是实际CampaignFleet/BaseCampaignEntity、随机人物指挥官绑定和refresh、view/事故/后勤/AI初始化以及counts/goSlow/朝向自然帧；再贯通source市场、军官技能/inflater、巡逻世界注册。完整生涯、原版UI、殖民地/生产、独立/合作联机和可大改结构未完成，readyForAuthority=false。未使用子代理，未暂存/提交/推送/打包/发布。


## CampaignFleet指挥官初始化链（2026-09-21，实施前对照）

- 原版0.98a-RC8 CampaignFleet.java:330–348：Base实体/势力/箭头/FleetData/view/移动/朝向后，势力随机Person→commandPoints.modifyFlat(default_commander,10)→setCommander，之后才事故/后勤/传感器对象。当前已有真实随机人物与FleetData，缺的关键可直接接入步骤是指挥官赋值及完整刷新；本轮先接此链，不能因创建舰长就声称完整CampaignFleet已构造。
- FleetData.java:267–286：getCommander在字段null时返回静态defaultCommander；setter必须只解绑旧字段人物（不是getter回退人物）的CharacterStats.fleet，写字段，再把新人物CharacterStats.fleet绑定实际fleet，只有人物对象不同才refreshCharacterStatsEffects(false)。同对象仍解绑/重绑，不刷新；null只解绑，不给默认对象附加副作用。CharacterStats.setFleet只赋字段，不能额外写Person.fleetRef、标记needsSync或造一次成员同步。不同Person共用同一个CharacterStats时仍按Person身份决定刷新。
- 当前差异：仅有getter与sync时绑定，草稿生成的新Person无法经真实setter加入FleetData。实施新增独立setter和显式构造子阶段，并接现有refreshNativeCharacterStats，保留共享人物/commandPoints目标与完整监听、技能清除/应用顺序，不用空刷新回调。当前已注册非玩家FleetData可供实际字符舰队解析与成员同步，缺依赖照常拒绝。
- 验证集中扩已有真实人物场景：初始命令点5+10、实际随机人物与UID、同人/换人/null/共享stats、旧人解绑与不改Person.fleetRef、无虚构sync、完整技能刷新效果、保存续接身份/默认回退。只跑相关既有场景+类型/定向lint。无UI修改；舰队/人物UI截图与完整自然帧仍待核实，不操作桌面，不读私人存档。

### 指挥官初始化与真实setter落地（2026-09-21，本轮）

- OriginalFleetCommander新增setOriginalFleetCommander：按旧commander字段找真实Person，不用默认getter解绑；同人仍清除/重设CharacterStats.fleet，不刷新；不同Person即使共享CharacterStats也刷新；null只解绑。Person.fleetRef、FleetData脏标志和成员同步不被setter自行改写。新Person进入当前statPeople共享查找表，派生的commanderTravelSpeedBonus在刷新回调前已指向新getter目标。
- 显式initializeOriginalCampaignFleetCommander实现原构造的随机势力人物→commandPoints default_commander +10→实际setter子阶段。初始commandPoints 5变15，重用真实FactionPersonFactory/当前Sector UID和共享统计target；直接setter不会偷偷给所有人物加10。方法不创建BaseCampaignEntity、view/事故/后勤/传感器/AI，也不注册世界舰队，不能冒称完整CampaignFleet。
- 共享草稿新增getNativeFleetCommander/setNativeFleetCommander/initializeFleetCommander，复用完整refreshNativeCharacterStats。setter强制refreshOutposts=false、resolvePending=false：不会把原版refresh(false)悄悄替换为存档readResolve或带殖民地刷新。一般刷新入口保留默认处理pending的旧行为。当前注册的实际舰队可直接用于非玩家CharacterStats解析与成员同步；外部未知对象依旧要求真实服务，不能空回调。
- 构造FleetData恢复校验新增指挥官人物/查找表和travelSpeedBonus共享身份，不接受复制对象顶替共享目标。没有新增保存字段，schema18继续保存当前对象关系，旧档不补造默认人物。
- 只扩并执行既有真实人物/舰队场景：真实随机舰长与1个UID、命令点15、完整OfficerManagement/ForceConcentration技能应用、同人跳过/不同Person共享stats刷新、null与默认回退、保留Person.fleet、无虚构dirty/sync、保存后人物与stat target身份、损坏共享引用拒绝。另有明确标注的独立setter回调顺序观察器和挂接上下文fixture，后者证明已注册舰队参与FieldRepairs阈值及list-only同步，不证明CampaignFleet已构造或自然帧已完成。
- 首轮断言误把+2命令点归给ForceConcentration；核对原版OfficerManagement.CP_BONUS=2后纠正技能输入，并修正MutableStat断言路径。自查把getter派生目标提前到回调前可见后，仅复查同一场景通过（最终约3.70秒）；类型检查和7文件定向lint通过，后续两文件lint复查无警告。没有全套、新测试工程、私人存档读取或后台残留进程。
- 下一步真正BaseCampaignEntity和CampaignFleet初始化：UID、Fader/indicator实体状态、stats/FleetData挂接、FleetView与实际绘制资源、移动/朝向实例、事故风险和随机tracker、后勤插件绑定/传感器/AI；随后counts/goSlow/自然帧与完整舰队工厂及世界注册。原版UI、殖民地/生产、独立/合作联机和可大改结构未完成，readyForAuthority=false。未使用子代理，未操作桌面、暂存提交、推送、打包或发布。


## 世界舰队逻辑构造（2026-09-21，实施前对照）

- 原版0.98a-RC8 BaseCampaignEntity.java:93–145完整字段/UID/indicator构造；CampaignFleet.java:114–170/330–348及457–464，按Base→实例字段stats/noCombatPulse→势力/箭头→FleetData绑定→FleetView→移动/朝向→颜色→真实舰长刷新→事故→后勤→sensor indicator顺序。CampaignEngine.createEmptyFleet(FactionAPI,boolean)只额外setAIModeNoSync；String/name重载还构造ModularFleetAI，不可混同。
- Fader.java完整读取：构造IDLE，bounce设定本身不启动；advance到端点仍保持IN/OUT，下一次advance才改变方向且不消耗那次dt；不做自创跨端点余时补算。选择indicator反编译cfr_renamed_24不能直接用，安装jar javap确认实际O0OO.String.String，即settings.widgetBorderColorBright。普通indicator默认枚举ordinal2、线宽3、白色透明，主fader先fadeIn；两个indicator都绑定真实实体引用。
- 绘制资源：Sprite.setTexture初始化尺寸/UV及独立颜色角点、blend770/771、center-1等，TextureLoader/Object尺寸链已核对；实际line8x8为8x8、ship_arrow为32x32。服务器保存原始资源描述/路径/尺寸/hash和Sprite状态，不创建GL texture/list，也不声称已实现/验收舰队绘制。FleetView的CollectionView确实是空views/sorted/orphaned/notified，ContrailEngineV2构造确实空map；不能把这混同有船后的同步/渲染。
- AccidentManager:randomSeed=(long)(Math.random()*2^63)，然后IntervalTracker(.5,1.5)再readResolve；原starfarer.util.IntervalTracker不同于API版，构造nextInterval消耗Math.random double后转float，风险有且只有真实oooo_0，绑定FleetData/cargo/相同Random；context.daysWithoutSupplies=0。CRPluginImpl无实例字段，后勤绑定必须核实实际settings.plugins.combatReadinessPlugin且连接已有原版后勤算法，不编空风险列表或未知插件标记。
- 实施接口要求显式当前Faction对象身份、实际前缀override结果、spec color、secondaryUIColor override结果及spec secondarySegments；不能用默认definition覆盖未捕获的运行期势力设置。沿用明确的可保存Web Math.random分支，不声称恢复原JVM随机种子。保存当前逻辑构造到已有FleetData/roster共享图，仍不自动注册Location/世界、创建AI或启动自然帧。
- 验证集中扩已有相关场景，原版Fader用无头类直接对照，构造链检查UID顺序、真实人物/统计/货舱共享、随机消耗、逻辑子对象/资源状态及保存续接；只相关短检查和类型/lint，不全套、不读私存、不碰桌面。UI与舰队实机仍待许可，不能从天体截图推定舰队画面。


## 舰队counts/慢速/运动自然帧阶段（2026-09-21，实施前对照）

- 原版0.98a-RC8 CampaignFleet.java:793–821：updateCounts→doGoSlow→有目标或fadeAndExpire时移动→把module位置/速度复制到Base实体→非战斗且速度>3、距离>10时取速度朝向→1040/720转向；无目标时不擅自积分速度或转向。1102–1127目标override阻止普通setter，当次movement结束才清除；fadeAndExpire存在即强制当前地点，不经过setter。
- CampaignFleet.java:1615–1691：无参goSlow只设请求，有参才更改stop；非正dt不消耗请求；快进子迭代不执行离开慢速reset；使用上帧加速度，超速明显时把目标放到反速度方向10000，轻微超速时直接减速并设hardSpeedLimit；不把它改成即时固定限速。Misc.java:4757–4761用实际最小成员burn×settings.sneakBurnMult四舍五入后加动态move_slow_speed_bonus_mod再Java int截断，不是已受fleetwide修饰的burn。
- 原版CampaignFleet.setVelocity:471–472只改module；BaseCampaignEntity.getVelocity:582返回Base的独立velocity，LogisticsModule.advance:85读Base且在本帧movement之前。因此上一段把logisticsEnvironment.velocity绑到module是错误关联；须改为Base速度，保留两向量身份及帧间延迟。updateCounts的传感器setter写Base字段，当前root投影要同步到Base，不能留下永远null的传感器。
- 复用已原生float对照的SmoothMovement/SmoothFacing/Utils角度、真实FleetData完整同步与动态统计；草稿提供显式counts+运动阶段，不伪造尚未接通的AI、Base世界更新、事故、view或完整自然帧。schema20只把旧19的后勤关联改到已有Base速度，并将已有root传感器值映射到实体，不积分旧帧、不猜历史。
- UI无改动；舰队原版画面/自然帧实机对照仍待许可。仅扩已有同一舰队场景验证普通/override目标、请求消耗/快进/非正dt、慢速与停车、真实速度统计和存档续接；集中一次类型/定向lint，无全套、私人存档或桌面操作。


### 世界舰队逻辑构造落地与后续运动阶段（2026-09-21）

- 完成CampaignFleet(Faction)逻辑构造：Base实体/UID、Fader/indicator、真实公开纹理描述/Sprite初值、FleetData/Cargo/stat绑定、FleetView初始集合、SmoothMovement/Facing、真实势力随机舰长与refresh(false)、AccidentManager实际seed/IntervalTracker/risk共享对象、真实CRPluginImpl后勤绑定及sensor indicator。FactionAPI空舰队重载只setAIModeNoSync，不造ModularFleetAI、不注册Location、不forceSync。构造消耗实体与Person两个UID；事故seed和IntervalTracker按顺序消耗共享Web随机的两次double。
- 原版Fader已通过上一轮直接安装类的15组状态/float位对照，本轮没有重跑已通过的运动/Fader场景。人物/舰队场景的新增构造段之前因seedExpected重名无法解析；本轮局部重命名为accidentSeedExpected后执行通过（约6.22秒）。实际空舰队完整sync→创建Lasher→加入并完整sync、统计/货舱/人物/资源共享和保存后再造舰队通过，没有以空同步回调绕过依赖。
- 新OriginalCampaignFleetMotion实际接counts→doGoSlow→移动→Base向量复制→转向；共享草稿提供advanceNativeFleetMotion、setNativeFleetMoveDestination、requestNativeFleetGoSlow。普通/override目标遵循原版优先级；无参慢速请求保留已有stop，有参false才清除；非正dt不消耗慢速请求、快进子迭代不执行解除慢速reset；高超速转反向10000目标，轻超速才直接刹车/设置hardLimit，使用上一帧加速度。慢速burn基于真实成员minBurn，不取fleetwide后的burn，动态加成先加后Java截断。速度读取始终经实际FleetData同步/重新计算，不永久冻结为构造缓存。
- 运动继续使用上一轮已经原生float对照的SmoothMovement/SmoothFacing/查表角，目标覆盖在movement阶段后清除；无目标不擅自积分；战斗身份阻止自动desiredFacing但仍运行转向；fadeAndExpire存在强制当前坐标。updateCounts已把传感器值同步到Base实体字段。
- 修正之前构造的真实错误：后勤必须引用Base.entity.velocity，不能引用movement.velocity。setVelocity只改后者，运动阶段才原地复制到Base，保留两个向量身份和原版后勤在运动之前读取旧速度的时序。schema20恢复旧19时只改错误关联到原已保存Base向量，映射已有root传感器值，不重放旧帧；18及更早沿原迁移链，旧档不凭空构造世界舰队。
- 公开构造快照扩至29来源（含FleetData、Misc）及3个实际motionSettings，不读私存、不复制图片、不启动引擎。图像描述不是GL纹理，worldRegistered仍false，rendering仍source-state-only-not-rendered，事故风险构造不等于事故advance算法已完成。
- 集中扩同一现有场景：目标/override、无目标不动、实际minBurn与动态加成、正/零/负dt请求消耗、高/轻超速、停车、无参/false重载、快进reset、Base速度滞后、战斗/退场目标、待执行stop保存续接及schema19迁移。扩展后一遍通过（约11.25秒）；类型检查通过，18文件定向lint零错误/警告。没有全套、新测试工程、原版可见进程、桌面操作或子代理。
- **这不是完整CampaignFleet自然帧**：Base实体更新/AI/人物advance、noCombat Fader与速度过载修饰、hullmod fleet advance、事故运行、自然后勤/修理顺序、buff/view和despawn、Location注册仍需整体接通。完整舰队工厂source/军官/inflater、原版UI、殖民地/生产与独立/合作联机仍未完成。readyForAuthority=false；已核对暂存区为空，未暂存提交、推送、打包或发布。


## 舰队低CR事故运行（2026-09-21，实施前对照）

- 0.98a-RC8 AccidentManager.advance以原时钟seconds→days推进原engine IntervalTracker，先读取同步后补给并更新daysWithoutSupplies；到期按严重度累加概率、上限0.9，抽中后清概率并WeightedRandomPicker再消耗一次风险random。已有唯一OooO风险只返回NONE/MAJOR：有任何非封存船时跳过封存船；非战机CR<0.1且无补给或暂停维修才有风险。AI模式无风险；可有风险但CR尚未降到0而选不到受损船。
- O0oO:377–430选择CR<=0、非战机、FP<=9999的真实成员，随机double选船；损伤量1-当前平均船体+0.25+0.25×nextFloat，构造真实autoresolve数据(maxHits=1,shields=0)。ShipStatus.updateFromAutoresolveData:613–697从每个module使用共享Math.random，先随机再检查n!=0，0号也消耗；船体按0.75分界，实际Sprite尺寸/中心构造护甲网格，随机5×5斑块，保留偶数绝对坐标减半这一原版细节。损毁船调用removeFleetMemberAndCollapseSlot，不只写一个损毁标记。
- 事故随后以一次nextFloat选6种货舱/燃料/人员损失顺序，按原容量减首艘DESTROYED容量计算过量，再抽0.5..1损失。货物用CargoData(false)重堆叠后随机逐堆挑选；不损失omega武器、nonecon/ai_core/mission_item/no_loss_from_combat资源和SPECIAL。报告最多4项，同类同数据先合并。船员分支O0oO:247–250可疑比较已直接安装jar javap核实，原版本身可能报告请求损失大于实际船员，不擅自“修复”而改变随机与报告。
- 全部采用当前共享舰船/状态/货舱/名单、风险Random和可保存Web全局随机，不能把后者冒充原JVM历史种子。捕获补充原版未别名的hullDamageTaken/armorDamageTaken；旧已丢失字段的检查点不补造历史计数，实际需要时明确拒绝。公开舰体网格尺寸和保护tags新增源快照，不读私人存档。
- 本轮不绘制事故弹窗，不凭UI截图推断未展示的状态；返回原生报告数据供后续原版UI接入。逻辑按源码/关键字节码对照，只扩原有人物/舰队场景并集中检查类型/lint；完整自然帧AI、Base世界更新等仍未接，不将事故阶段冒称整帧完成。


### 低CR事故运行与真实损失落地（2026-09-21）

- 新OriginalFleetAccidents实现默认唯一OooO风险：实际AI模式、补给/暂停维修、有效CR（含船员比例/override）、全封存与混合舰队差异；原engine IntervalTracker及两条随机流严格分开，累积概率、0.9上限、抽取后清零、单风险WeightedRandomPicker仍消耗一次nextFloat。共享草稿fleetAccidentSeverity/advanceFleetAccidents接实际名单和原生时钟，后者公开参数是seconds，规则函数内部参数是days，不自行猜day长度。
- 新OriginalNativeDamage移植实际autoresolve状态→船体/护甲算法，不是简单扣固定HP。当前模块保持共享身份与实际网格，统计hullDamageTaken，保留module0也消耗随机、0.75船体分界、按绝对网格坐标减半斑块、损毁后第二次原生status更新。新增公开快照包含532舰体（含继承/default_D）、163武器保护标签、451来源；从原安装公开配置/源码生成，不启动引擎或读取私人存档。
- 事故损毁调用真实名单移除并解绑FleetData/标脏；人员损失使实际carryingFleet待同步。cargo/fuel/personnel按六种原生顺序、原容量减毁船容量计算；临时CargoData(false)语义重堆叠并逐堆随机，保护omega/任务物品/核心等。源报告最多四项、同类型/数据先合并；原版损失可能超出显示项，扣除仍执行。安装jar字节码核实原版船员分支可能报告多于实际可扣船员，保留而非“修正”。
- 新生成报告返回真正共享member和原版文案/损失数据及showPlayerReport条件，未渲染/弹出任何UI。没有假showAccidentReport回调，也不声称原版暂停/弹窗/玩家确认已实现。报告作为阶段返回值交给后续呈现；尚不能直接让完整权威世界静默消费报告。
- 捕获器补充原版未别名的hullDamageTaken/armorDamageTaken；不存在字段按原版构造默认0处理，未运行捕获器或重新读取私人存档。旧检查点如果此前丢弃了计数，实际损伤需要时明确拒绝，不能用0代替未知历史。当前已构造舰船原本就有真实计数，schema20不变、保存续接已验证。
- 只扩既有同一人物/舰队场景并集中跑一轮，约6.21秒通过：补给/暂停/AI/全封存与混合风险、真实船体float/网格/随机消耗、无损伤仍消耗module0随机、缺失历史计数拒绝、CR .05有风险但无损船候选、0CR损毁与实际名单解绑、货舱/燃料/人员真实损失、omega和核心保护、概率待发保存续接/最终共享图及报告4项/合并。类型检查通过，13文件定向lint零错误/警告，无全套、新测试工程或可见窗口。
- **完成的是事故运行阶段，不是完整CampaignFleet.advance**。事故UI、完整AI/Base实体/人物自然帧、速度过载与fleet hullmod advance、自然后勤/修理/buff/view/despawn串联、Location世界注册和完整舰队工厂仍需接；原版UI、殖民地/生产与独立/合作联机仍未完成。readyForAuthority=false；未使用子代理，暂存区为空，未暂存提交、推送、打包或发布。


### 舰队后Base维护与移动串接：实施前对照（2026-09-21）

- 证据：0.98a-RC8 CampaignFleet.java:730–821（禁战Fader→超载→舰队hullmod→临时stats→非AI事故→后勤→损毁移除/补给船员提示→counts/运动），894–921（超载）；LogisticsModule.java:45–96（后勤实际getter同步与上帧Base速度）；PhaseField.java:42–69（懒创建Memory、应答器切换、0.1日去重）；Memory.java:134–161、176–315（过期<0、set清过期、unset保留过期）；RepairTracker.java:357–400（修理完成消息需当前UI列表合并）。
- 本次发现并修正上一轮错误：CargoData.java:100–102构造器无论参数均设unlimitedStacks=true；O0oO事故临时CargoData(false)未覆盖该值，应按1,000,000/堆合并，而非商品/武器普通堆上限。上一轮“已按临时CargoData语义”描述过强；此前小数量场景未覆盖此差异。
- 预期：复用实际共享舰队/名单/随机/后勤/运动，事故毁船和人员损失后的getter必须同步，AI不推进事故；保留缺补给0..1不重置、nullable标记和缺船员恢复。相位场不能当空回调；统计描述经共享target写入。新建内存不是旧存档捕获，未知历史不能默认false。
- 本轮不改UI布局，也不操作桌面查看原版。缺补给/缺船员与修理完成按源码产生有序消息意图，事故保留完整报告和呈现条件；UI列表合并、图标渲染、点击REFIT_TAB、声音、事故弹窗/暂停均仍待呈现接入与原版实机/截图验收，不能把返回数据称为UI完成。
- 边界：这是原版Base.advance之后至movement结束的连续阶段，调用者仍需完成之前AI/人物/Base和之后成员回调/view/despawn与世界注册；不得冒充完整自然帧。只扩现有人物/舰队场景，完成后集中一次定向运行、类型与lint，不新增测试工程/全套。


### 舰队后Base维护→运动连续阶段落地（2026-09-21）

- 新OriginalCampaignFleetAdvance及共享草稿advanceNativeFleetAfterBase，按CampaignFleet.java:730–821串接禁战Fader/pulse、玩家超载、PhaseField、临时stats、非AI事故、后勤、损毁成员移除、补给/船员提示及counts/goSlow/运动。setNativeFleetNoEngaging保留端点下一次advance才IDLE；玩家判定校验实际context对象身份，非玩家不清既有超载modifier。超载描述通过共享target保存，保留未使用getBurnLevel的同步副作用。
- 事故后真实getter重新同步舰队：毁船/减员不继续使用旧名单做后勤；AI零日后勤前不提前同步，AI完全不推进事故tracker/context/random。燃料读取此前Base速度，运动结束才复制新速度。损毁列表先复制再原生移除，所有幸存成员都检查needsRepairs；缺补给仅null触发且>1才重置，缺船员恢复后重置。
- PhaseField不再缺失于舰队自然阶段：实际getMemoryWithoutUpdate懒构造，检查应答器切换与0.1日去重，并复用onFleetSync算法/共享统计描述。新增OriginalCampaignMemory的有序键值/依赖/过期接口，Java trim布尔语义、unset保留过期、严格<0过期、暂停前引用恢复；旧实体未捕获memory不能当空内存，引用恢复必须真实世界lookup。Memory.advance属于此前Base阶段，此入口不会偷偷额外推进。未声称移植了Memory所有数值getter或原生XML codec；Web图检查点保留内存值的真实成员对象共享。
- 事故临时货舱上限已按CargoData(false)实际unlimitedStacks修为1,000,000。同商品两个大源堆合并为一个随机候选，原货舱仍从最小堆扣减；新增输入覆盖此前普通堆上限错误以及对应随机消耗。
- 有序effects包含真实事故报告/显示条件、原版短消息、维修完成意图（成员身份、repairs_finished合并标记、原版文案、intel图标键、REFIT_TAB动作）。这里没有执行UI列表合并/声音/弹窗/暂停；enemy颜色role待原版呈现层按textEnemyColor/色盲(0,100,255)解析。返回意图不是呈现验收，也不得由完整世界调用方静默丢弃。
- 一次集中检查：仅现有native personnel rosters drive场景约7.03秒通过，覆盖连续后勤/上帧燃料、Fader、临时统计到期、事故毁船后同步、缺物资提示去重/恢复、修理完成数据、超载、PhaseField、内存边界、AI不推进事故、存续接和大堆合并随机。campaign类型检查通过；12文件lint出现一处Java trim有意控制字符regex提示，改为UTF-16边界扫描后只复查该文件lint，零错误/警告。没有全套或新测试工程；没有读私人存档、可见窗口、子代理或提交发布。
- **仍是Base之后至movement结束的连续段，不是完整CampaignFleet.advance或已可玩的权威世界。** 前面的AI/人物/Base/交互目标清理，后面的成员hullmod(seconds)/buff(days)、view/despawn，TowCable持久共享buff、Location注册与完整FleetFactory仍要接；原版UI、殖民地/生产与独立/合作联机继续。schema20保持不变，readyForAuthority=false。


### 成员自然帧与拖缆：实施前对照（2026-09-21）

- 原版0.98a-RC8证据：CampaignFleet.java:822–833依成员原顺序执行hullmod.advance(seconds)再BuffManager.advance(days)；FleetData.sync零时间则相反（buff→hullmod），不能合并成一个顺序。BuffManager.java仅增删时标脏，applyBuffs在后续原生统计同步处生效，不可强制提前应用。
- TowCable.java:34–165、末尾TowCableBuff：只作用实际玩家FleetData，战斗可部署门槛来自FleetMember.canBeDeployedForCombat及settings.json（noDeployCRPercent=0、noDeployCrewPercent=5），有翼种还要求CR>0。按全部成员顺序编号可用拖缆；每个拖缆按自身当前最大burn选最慢非战机，单目标最多一根、burn必须严格低于拖船，平速保留先遇到者。去除拖缆的burn计算减去每个tow_cable前缀flat来源的数量（每个1），不是其value总和。
- 持久buff必须放在Sector.persistentData的TowCable_PersistentBuffs项，按实际member对象身份取同一buff；不能放到单舰/单舰队Memory。即使cleanup(create=false)也会懒建空map；卸下/封存清除目标buff但保留持久记录。命中相同buff只frames=0，不重复append；Buff.advance即使days=0也frames++，>=2过期。
- 当前差异：拖缆成员回调会拒绝，成员自然帧未串接；只有TowCableBuff apply/expire本体。新接口要提供真实世界级持久项并保留共享身份，未知历史状态仍为null，旧检查点不能从目标buff或船只名字反推。新建世界可显式创建已知不存在的持久项，既有世界需绑定真实项，当前未捕获的历史不得伪装成新世界。
- 本轮不改UI/资源布局，不启动原版或Web窗口；拖缆状态说明来自源码，原版悬停说明、舰队速度提示和视觉仍待许可后核实，不用后台通过替代视觉验收。只扩同一个现有舰队场景，一次集中检查相关逻辑、类型和定向lint。

- 补充当前可达性证据：0.98a原版Ox的builtInMods是drive_field_stabilizer/high_maintenance/civgrade，并非TowCable。DriveFieldStabilizer.java给fleet_burn_bonus flat+1与sensorProfile flat+200；starsector-core/data/hullmods/HighMaintenance.java补给维护mult2。同步补齐这两项现用拖船属性，不能用旧TowCable分配规则冒称当前Ox玩法；TowCable.java:176–177的before-creation确实为空，只有该已核实方法按空实现。


### 成员自然帧、Sector拖缆共享项与当前Ox效果落地（2026-09-21）

- advanceNativeFleetAfterBase现连续执行到CampaignFleet:834：维护/运动之后取真实成员列表，每艘按hullmod(seconds)→buff(days)执行；原FleetData.sync仍保留buff(0)→hullmod(0)。返回scope改为native-fleet-after-base-through-member-effects，未提前applyBuffs或强制清除末尾脏状态。成员hullmod与buff各保留可替换插件/生命周期服务。
- OriginalTowCable按原版实际源编号和拖船各自速度分配：最慢非战机、严格速度门槛、平速成员顺序、每目标最多一根。getMaxBurnWithoutCables按flat来源数量减1；同一buff只复位frames，新目标加原共享对象并移除其它目标上的同id。封存/不能部署时清目标，持久源记录仍在；来源离舰后增益按>=2次advance（包括0天）失效。战斗部署阈值从公开settings导入，未擅自设CR>0.1。
- 新世界级TowCable_PersistentBuffs状态接口，不存入舰队或实体Memory。共享草稿bindFleetTowCableState显式绑定实际Sector项；尚未捕获的历史为null，新建已知空Sector才用构造器。零时间同步、事故/运动/人物/薪资入口都携带同一世界依赖，长寿命roster服务用当前读取接口，避免绑定后仍读旧null。未实现历史原生persistentData捕获，不从目标buff或成员名字反推。
- checkpoint schema21保存持久源member与目标buff的共享对象，恢复校验拆分身份；20及更旧版本只迁移未知null，不虚构历史buff或重放帧。已存在但不再在舰队中的源/失效buff仍保留实际持久记录。
- 当前原版Ox不是TowCable：新增DriveFieldStabilizer实际fleet_burn_bonus+1、sensorProfile+200，以及HighMaintenance维护mult2，使用公开源码常量快照。这些效果经现有完整FleetData.sync、fleetwideTotalMod和后勤统计生效，未以旧拖缆行为替代Ox。TowCable只有源码明确为空的before-creation方法采用空实现，自然帧分配不是空实现。
- 一次集中检查发现共享服务自动注入会抢占已有显式synchronizePlayerFleet并改变缺失输入拒绝路径，已修正为尊重外部后端/未捕获依赖；仅复查同一既有舰队场景通过，约11.43秒。场景覆盖真实Ox属性、两拖缆两慢船平速分配、战机排除、同对象刷新、原生两种回调顺序/单位、部署阈值、按来源数扣burn、保存续接/拆分身份拒绝、封存清理/重新分配、源离舰后的零天过期和未知旧历史拒绝。类型检查通过、13文件定向lint零错误/警告；修正服务文件单独lint也通过。无全套、新测试工程、私人存档读取、可见窗口或子代理。
- 玩家拖缆分配是明确上下文夹具中的真实构造成员，不冒称已将完整世界玩家注册到当前Web运行时。当前连续段仍缺前置AI/人物/Base/交互目标处理与后置view/despawn/Location世界注册；原版UI/殖民地/生产和独立/合作联机继续，readyForAuthority=false。暂存区为空；未提交推送、打包或发布。


### 舰队世界登记与退场：实施前对照（2026-09-21）

- 原版0.98a-RC8：BaseLocation.java:343–386实际ObjectRepository.add/remove→ContainingLocation→LayeredRenderer→技能renderer→首次reportFleetSpawned。重复加入仍执行后续登记但列表去重；removeObject不清containingLocation，也不设置expired。把舰队加入别处不会自动从旧location移除，不擅自修正为不同的移动语义。
- ObjectRepository/FastIterationClassifier源码：按对象身份去重，各class/interface列表均同对象；每类成员顺序是加入顺序。当前移植该路径的CampaignFleet类型闭包，不宣称其它实体构造或完整BaseLocation.advance已完成。LayeredRenderer.add按active layers去重，remove遍历全部CampaignEngineLayers，null renderer从现存对象重建；登记不是GPU绘制。
- CampaignFleet.java:322–327的反直觉nullable：reportedSpawned==null才是已报告，setReportedSpawned(true)写null。退场1569–1585先fade标记，再legacy listeners→舰队本地监听器快照→managed FleetEventListener，允许监听器abort；否则clear(true)解绑成员并将sensorFader.out时长设为1后fadeOut。不能直接移除或用事件日志代替同步游戏监听器。
- CampaignFleet.java:843–849在view之后检查fader退完→expired，然后getMembers同步、空舰队且未fade才NO_MEMBERS。BaseLocation:588–594在下一实体遍历遇到expired时才移除，保留containingLocation。这轮提供明确after-view与过期移除入口，不跳过尚未实现的view阶段冒称整帧。
- 实际新建注册图保存location、舰队、技能renderer和监听器的共享身份；现有路线/传感器闭包不是完整ObjectRepository，旧检查点世界登记未知保持null，不把已捕获的少量舰队当全部成员。真实新世界可显式创建空登记图，既有世界需绑定真实图；全世界星系生成和现存原生图捕获另待接。
- 不改UI、不启动窗口；原版源码只能证明登记/事件流程，不能证明星图已渲染。先接共享草稿及已有路线的真实登记舰队移除/监听入口，保留mod替换服务；只扩同一既有舰队场景，集中检查，无新测试工程/全套。

- 补核实：campaign/ListenerManager.java:getListeners 先复制持久列表，再追加瞬态列表；整个返回值为快照。退场实现保留这两组身份/顺序，不合成单一未知来源列表。检查发现现有离线graph v1明确拒绝循环；新增可选v2只用于真实世界循环图，保留v1兼容和64MiB/对象上限，网络JSON边界不变。世界绑定后的snapshot改为冻结的离线共享图检查视图，JSON交换使用checkpoint，不用循环引用的投影假装权威对象。

### 世界登记、真实路线退场与循环图续接落地（2026-09-21）

- OriginalFleetWorld及类型已接共享草稿：bindFleetWorld、add/removeNativeFleetTo/FromLocation、addNativeFleetEventListener、updateNativeFleetAbilityLayers、despawnNativeFleet、finishNativeFleetAfterView、removeExpiredNativeWorldFleets。世界初始值为未知null；必须显式提供真实当前注册图/监听器，新建空图仅适用于已知空的新运行时，不用路线捕获闭包推断完整旧世界。
- 保留同一舰队在每class/interface列表与各渲染层的身份/顺序、重复add仍设置location、nullable reportedSpawned、跨location不自动移旧、remove保留containingLocation与hyperspace语义。技能renderer按原版懒建/enum顺序更新；null renderer从真实列表重建。源码允许对不在repository内的对象单独recompile，未增加“renderer必须等于repository”的错误强约束。仍没有GPU绘制。
- 退场串通实际legacy→本地快照→managed持久/瞬态快照；有未知监听器必须提供同步实现，不填空回调。abort不清成员/不淡出；正常clear(true)解绑成员并设1秒fadeOut。view后检查过期、getMembers同步及NO_MEMBERS分支与下一次location过期删除分开，不跳过缺失的view阶段。RouteManager监听直接执行真实路由处理，PLAYER_FAR_AWAY保留路线、其它原因移除首个匹配。
- bindNativeFleetRouteSpace只绑定实际新构造舰队，空间读取每次从同一fleet的position、containingLocation、battle、nullable flags与真实监听器推导，不保存一次性位置投影。路线默认despawn/remove走实际世界实现；spawn仍要求真正的工厂服务，未造舰队。重复路线挂接复用同一manager监听对象，允许列表重复条目但不拆分身份。捕获旧fleet仍要求实际外部生命周期，不假装已迁入当前世界。
- checkpoint schema22保存fleetWorld和路线/舰队/地点/renderer/RouteManager的共享引用。schema21及以前只迁移fleetWorld=null。私有离线identity-graph新增显式allowCycles的v2；v1原有拒绝循环保持不变，v2迭代验证可达性与最短引用距离，保留64MiB/100万对象上限、每条记录JSON约束。网络JSON协议不变。绑定世界后的snapshot是冻结的离线共享图，可含循环；对外JSON交换使用checkpoint。恢复拒绝被拆分的class-list、renderer、factory和监听身份。
- 公开资源导入器补入ListenerManager，现45个源码/配置来源，两张texture不变。既有native personnel rosters drive场景新增上述完整链路与循环图/旧版迁移；一次集中场景和类型检查通过，最初lint误用未安装eslint后改用项目oxlint，14文件零警告/错误。随后代码审阅发现重复路线监听adapter身份问题并修正，只复查同一场景约11.84秒和3个改动文件lint，通过。无全套、新测试工程、私人存档读取、可见窗口或子代理。
- 仍缺完整AI/人物/Base自然帧、FleetView实际更新/绘制、完整StarSystem/世界生成与旧原生世界捕获、现有Web权威入口接入。传感器能力插件、未知监听器仍需真实实现，不把登记表或录制回调当成完整游戏。原版UI、殖民地/生产、独立/合作联机目标保持，readyForAuthority=false。暂存区为空，未暂存提交、推送、打包或发布。

### 舰队自然帧串联：实施前对照（2026-09-21）

- 已核对0.98a-RC8 CampaignFleet.java:681–729、730–834、835–849。顺序为玩家正dt修stack.cargo→postLoadReset同步/设最大CR→sensorRangeIndicator→当前地点技能层→玩家partials→AI（未退场且非doNotAdvanceAI）→commander/每个officer.advance→Base→交互目标异地/不alive清理→已有维护/运动/成员→view advance或clear→退场收尾。不能把这些独立入口任意排序或在前段失败后继续后段。
- BaseCampaignEntity.java:595–658：阵营颜色→contact indicator→selection→两个sensor fader→已有Memory→planetCondition-only market→floating text（先done删除，否则advance，空表变null）→scripts快照，paused门禁以及advance前后done删除。advanceEvenIfPaused只在paused时跑脚本，浮字另限玩家。不把暂停当整舰队advance(0)。
- Person.java:advance仅推进已有Memory并设advanced=true，不去重同一Person在commander/officers中的多次调用，不懒建内存。新构造Person加入真实可空Memory状态；旧捕获/检查点只有局部查询投影，不能据此补全未捕获require/expiry。薪资通过同一真实内存读取，旧捕获路径保留。
- E.java:50–63非玩家且在当前地点才推进range fader与phase=(phase+seconds*50)%150；oOO0.java选择fader非玩家每次fadeIn。CargoData.java:570只在partials为null时建HashMap。RepairTracker.java:299 setCR只赋值；CollectionView.clear清四表，CampaignFleetView.clear再清contrails并置null。
- 本轮不改绘制/布局，不启动窗口。SensorContactIndicatorManager含未接完整的检测监听/discovery/ping，CampaignFleetView含成员视图/尾迹；总帧必须要求真实服务执行这些阶段，不以空函数或“不可见”假值跳过来宣称完整原版。当前Web运行链仍用旧reference ruleset，不把离线frame接口包装成已可玩的权威入口。

- 补核实Misc.java:3710–3714、4564–4565：真实薪资查询经getMemoryWithoutUpdate懒建Memory；与Person.advance不懒建不同。新建人物的查询走同一真实Memory并保留此副作用，保存校验只检查结构不触发查询。Memory.is(String,boolean)使用getBoolean，保留原有字符串布尔解析。

### 总帧调用链、人物Memory与Base/暂停阶段落地（2026-09-21）

- OriginalCampaignFleetFrame已接共享草稿advanceNativeFleetFrame，顺序覆盖玩家正dt修货舱stack.cargo、任何非null postLoadReset（包括false）同步/恢复每成员maxCR、range indicator、技能层、partials、AI、commander/officers、Base、交互目标清理、既有after-Base维护/运动/成员、可见性短路/view advance或真实clear、after-view退场。已存在的after-Base和after-view入口保留供分阶段宿主使用。world/currentLocation/暂停等上下文读取保留live getters，mod服务仍可替换，但必须同步且到达的缺失服务明确拒绝。
- Base中实际推进阵营颜色/secondary、非玩家selection fadeIn与fader、两个sensor fader、已有Memory、planetCondition-only market回调、浮字和脚本快照。浮字先done删除、advance后不立即删、空表变null；脚本前后检查done并按runWhilePaused门禁，新加脚本下次才执行。advanceNativeFleetEvenIfPaused只在暂停时跑脚本和玩家浮字，不用完整advance(0)代替暂停，不推进运动/维修/感测fader。
- Range indicator只处理当前地点非玩家，fader依据真实visibility enum、phase按float32 (phase+dt*50)%150。交互目标alive依据实际containingLocation.repository身份，不错误使用expired：expired但仍在仓库内仍alive；remove后即便保留location也会清目标。默认目标查找仅支持真实构造舰队，其它实体需实际外部getter。
- 新Person构造加入memory.nativeState（真正可空Memory）和advanced；random-faction voice写入同一内存。Person.advance不懒建、暂停时Memory不扣期，但advanced仍置true，同一Person担任commander与officer时按原版调用两次，不去重。薪资/管理层级查询实时读同一内存并按getMemoryWithoutUpdate懒建。旧捕获仍保留旧查询路径，缺完整Memory不能自动自然推进，也不以局部expiry列表重建完整历史依赖。
- 新schema23区分本轮语义，schema22迁移不补造旧人物内存；世界循环图仍使用私有identity-graph v2。真实FleetView.clear清四个集合及尾迹并置null，构造状态校验/类型放宽为原版有效的nullable尾迹。新增玩家stack→cargo循环通过已有world graph保存/恢复，正dt才修owner，dt=0仍初始化partials。
- 已核对服务端现状：CampaignWorker/SimulationLoop仍运行旧reference.cooperative ruleset，尚未接本轮原版共享图；没有悄悄启用不完整权威世界。SensorContactIndicatorManager中的完整检测监听、发现、ping/sound与可见CampaignFleetView成员/尾迹仍缺；总帧要求真实advanceContactIndicator/advanceFleetView/AI等服务，不能把测试里的显式插件观察器说成原版实现。没有修改绘制布局、未进行原版或Web视觉验收。
- 公开源码导入器现49来源，仍两张texture。一次集中检查：只扩既有native personnel rosters drive场景，约14.07秒通过；类型检查通过；15改动文件oxlint零警告/错误。场景包含原版阶段顺序、false非null postLoadReset、人物重复advance与严格expiry、脚本快照/暂停、浮字时序、isVisible短路、真实视图clear、alive与expired区别、未知联系人服务拒绝、保存续接和玩家货舱owner。测试里的contact/view是明确的插件夹具，不验证原版显示或完整世界。无全套、无新测试工程、无私人存档读取、无窗口/键鼠/子代理。
- 下一步补真实contact indicator/discovery/监听事件与FleetView成员显示/尾迹，随后接现有Web权威宿主与世界生成。完整生涯、殖民地/生产、自创势力、独立/合作联机及原版UI仍在目标内，readyForAuthority=false；不提交、推送、打包或发布。

### 传感器接触管理器：实施前对照（2026-09-21）

- 对照本机0.98a-RC8 SensorContactIndicatorManager.java:44–190、218–254、BaseCampaignEntity.isVisibleToPlayerFleet、ListenerUtil.reportDetectedEntity、ListenerManager.getListeners。visibility等级与“同地点可见且未hidden”是不同门槛；前者对无sensorProfile会提前返回全细节，后者必须先检查玩家非null和同地点，不能直接用level!=NONE替代。
- 原版先推进两个计时器和既有问号fader/移除完成项，再处理玩家forceIn；NPC依次处理发现插件、检测监听（真实持久+瞬态快照）、细节等级fader/颜色、反向能见度提示、未知接触问号与首次ping、sensor fadeIn（退场舰队不拉回）；不可见分支可能声音/检测NONE再fadeOut并清prevLevel。提示阈值严格>1000，保留反直觉的初始0及“未见时置1000”。
- 已用javap -c -p核对反编译坏掉的问号上限局部变量：截断profile/10+radius/20，int加法后clamp[2,10]，再加$extraSensorIndicators并min1，最后若存在$ sensorIndicatorsOverride（实际键无空格）则完全替换、不再clamp；每帧最多新增一个。构造消耗三次共享Math.random，float32角度/半径缩放，首个问号fader时长减半。
- com/fs/graphics/util/B.java在插值参数1时返回第二色；renderers/O.o00000为透明黑，因此仅编队细节时是[125,125,125,255]主色、透明黑secondary、8段，不猜阵营颜色。问号自然状态与真实渲染区分；render中原版固定35px、brightness/0.75上限1、playerFaction颜色，后续绘制接入另验。
- 已读取用户原版截图：两个局部图实际是黑洞远近状态，不证明舰队接触；QQ20260919-165600.png证明整体布局/已有编队圆环，但未覆盖未知问号及其动态切换。本轮不修改布局、不启动/截图桌面，源码与字节码只证明逻辑，UI还需对应状态验收。
- 计划替换总帧中缺失的contact默认阶段，接入真实detected-listener名册；旧世界未捕获该名册保持unknown，不当空列表。ping/sound先进入有序呈现结果，不冒称已经发声/绘制；发现插件与未知监听器仍要求真实同步实现。只扩已有相关场景，一次集中检查。

### 接触状态机、检测名册和感测绑定落地（2026-09-22）

- 新OriginalFleetContact替换总帧原来缺失的默认contact阶段。真实管理器/问号保留fleet↔manager↔marker身份，两个计时器、prevLevel、淡出状态及三次共享Math.random消耗均进入当前图保存。每帧最多补一个问号，降低数量不会直接删既有标记；标记先advance再检查done，首个时长减半，位置按原版float32角度/半径计算。
- 识别状态顺序对应源码：当前玩家forceIn；其他舰队先可见性+nullable hidden，再发现插件、DetectedEntityListener、编队/势力颜色与contact fader、反向感测提示、未知信号问号/首次ping，最后非退场时sensor fadeIn。hidden=false仍表示hidden（原版判非null），fadeAndExpire=false则不是正在退场。严格>1000、发现与首个全细节的两次独立通知、丢失目标时NONE及声音意图均保留。发现插件pick/执行以及非空未知检测监听仍要求实际同步实现，不添加空回调。
- 检测监听采用独立world.detectedEntityListeners持久/瞬态名册，每次report快照；不混用FleetEventListener列表。新世界已知空才构造空名册；schema24的23→24迁移仅设旧名册null，bindDetectedEntityListeners须显式绑定真实来源。缺名册时检测事件拒绝，不能从旧舰队监听历史推断。
- ping和声音以原版id/颜色/目标/发生时位置返回；总帧effects先接contact intents再接维修/事故提示，仍未绘制ping或播放声音。questionMark GPU sprite保持null，本轮只完成其源状态，固定35px等render实现和原版截图对照仍待后续。原版用户截图已读取但未覆盖未知舰队问号，不将黑洞两图当作舰队证据。
- registerNativeFleetSensors允许将实际构造舰队接入已知的感测环境，不创建/猜测旧世界difficulty、sensorsOn。原来长期持有的sensor getter会捕获位置投影，已改为每次解析同一实际舰队位置；当前构造舰队的ghost和extendedDetectedAtRange也读实体当前字段。持有getter再移动/改标记能够立即看到变化，恢复拒绝sensor句柄被复制成另一艘同ref舰队。
- Memory.getInt按源码直接读data、不触发entity-id恢复；十进制整型/float32回退/饱和截断/NaN、Java trim及额外解析服务已用于两个sensor memory键。特殊Java float/对象字符串仍要求实际服务，不以JS parseInt宽松吃掉后缀。字节码核实了反编译变量丢失的clamp/override顺序。
- 源快照54来源、两张texture不变。一次集中相关场景+类型+16文件oxlint通过；随后代码审阅补上sensor/world恢复身份检查和neutral返回校验，只复查同一场景（约17.56秒）及3文件lint，通过。场景覆盖真实管理器状态、随机连续性、严格提示边界、监听快照/发现重复通知、灰色/透明secondary、退场不拉亮、玩家强制可见、旧未知名册拒绝/显式绑定、循环图恢复和总帧默认实现。可见性/阵营/发现插件采用明确夹具，仅验证分支逻辑，不证明原版整机显示。
- 当前仍是离线共享草稿，Web CampaignWorker未接原版图；FleetView可见成员/尾迹、contact sprite/ping/sound真正呈现、实际发现插件/游戏检测监听器、完整世界生成等仍缺。原版UI、殖民地/生产、自创势力与独立/合作联机目标保持，readyForAuthority=false。只后台源码/字节码/既有截图读取，未读私人存档、未截桌面/启动可见窗口/使用子代理；未暂存提交、推送、打包或发布。


### 可见舰队集合与尾迹：实施前对照（2026-09-22）

- 原版0.98a-RC8 CampaignFleetView.java:115–195、CollectionView.java:29–87：getSortedMembers两次真实getter，只同步名单；超过20时前8+末12。LinkedHashMap按创建顺序推进/绘制（不是逆序，前次阅读结论纠正），TreeSet仅renderOrder去重；离队通知只发一次，过期在advance前清理，重新入选不自动撤销淡出。成员对象/view身份必须共享；实际MemberView构造/advance尚未落地时要求真实服务，不制造空显示对象。
- ContrailEngineV2.java:39–245、251–370、390–450：首两点零亮度、短段拒绝、长跳插入两断点、速度引用共享，移除后停止漂移并加速老化；三个相邻点都到期才丢首点，自动回收与手工删除分别保留。render有真实状态副作用：自交/折返触发fadeOut、邻近衰减不会恢复，最后fadeOut点跨尾迹继续使用，所以HashMap枚举顺序不能改为普通插入顺序。
- javap -c -p核对render字节码162–207：先递增index，再判断是否存在下一点；反编译把++藏在三元式内，会越界，不能照抄。Utils.java:218–237零向量归一化阈值Float.MIN_VALUE、垂向量(y,-x)，fs.common util/oOOO.java:60–102共线相交端点判断保持原样。
- 用户QQ20260919-165600.png已重新读取，仅证明缩小舰船编队/圆环及整体布局，不能证明尾迹动态；不操作桌面/游戏。此次实现真实尾迹状态与四边形带输出、集合帧接线，不称GPU已绘制或完整成员视图已可用；后续继续实际MemberView/引擎焰/原版资产与Web画面接入，不把此层当生涯完成。
- 现有差异：view仅空数组、整个可见阶段外部回调，contrails只有空列表。计划落地源算法并接默认集合调度；旧空壳可迁移，未知非空历史不补造。只扩已有人员/舰队综合场景，一次集中类型、定向lint与该场景，不新增测试工程或跑全套。


### 可见名单生命周期与生涯尾迹落地（2026-09-22）

- 新OriginalCampaignFleetView接替总帧中整个可见阶段必须外部实现的缺口：默认两次getSortedMembers保留onlySyncMemberLists切换，前8+末12，按实际member/view身份保留LinkedHashMap创建顺序；等renderOrder的TreeSet折叠/比较删除、一次孤儿通知、重新入选不拉回、finishSync先删除过期而不是advance后删除均对应原版。notify只操作相互独立的fader，没有把任意插件通知按自创HashSet顺序执行。
- 仍未实现完整CampaignFleetMemberView构造/advance：选中成员首次出现必须由createFleetMemberView返回实际共享fleet/member对象，逐成员推进必须由advanceFleetMemberView提供真实实现；缺服务立即拒绝，不构造空舰图或用fader-only生产回调冒充。测试里的最小成员适配器显式标记为夹具。后续继续舰船sprite/module icons、阵型、shifters、引擎焰及实际成员推进，不能把当前集合层当整个可见画面。
- 新OriginalCampaignContrails移植ContrailEngineV2：首两点零亮度、短段拒绝、超过maxSegLength插断点、lastPoint与漂移点分离、velocity共享引用、WIDEN/NARROW/CONSTANT、remove冻结漂移并加速老化、三点到期剔首/autoCleanup。String-key HashMap维护实际桶顺序、扩容和clear保留容量；对象键/树化桶明确要求真实适配，不假定JS Map等价。
- render现在生成带原版texture path、SRC_ALPHA混合、每点RGBA/UV的QUAD_STRIP顶点，并执行原版render侧自交/折返fadeOut、跨尾迹lastFaded及不可恢复的proximity衰减。已核实SMOKE不是NORMAL，Color alpha按Java float→int→byte而非clamp；Utils光照角度常量57.295784f。此结果是几何，不是已提交GPU，不冒称Web已显示尾迹。renderNativeFleetView和renderNativeFleetContrails在共享草稿事务里执行，避免对冻结snapshot写render副作用。成员origin/light只在render阶段更新，不提前写入advance。
- schema25保存实际视图/成员/尾迹点身份，包含view↔fleet循环；无world但已有member views或lightSource也使用离线identity-graph v2。恢复拒绝同ref却脱离成员工厂的view.item副本。24→25只将原先已知空尾迹壳升级，未知非空旧历史拒绝；null仍保留懒建。Web检查点不执行原版XStream writeReplace的两位小数原地舍入，保留当前运行图。网络JSON限制不变。
- 来源快照增至61个来源，构造资源仍为原来的2张texture；contrail64b.png及相关源码额外登记hash，未擅自更改旧构造resource registry，也未复制/修改原版资源。
- 只扩既有人员/舰队综合场景：真实成员工厂+显式视图适配器覆盖24选20、创建顺序、TreeSet同序折叠、重新入选与延迟过期、光照/原点render时序；尾迹覆盖断点、几何alpha、漂移冻结、回收、HashMap扩容、共享速度与循环恢复，以及总帧默认集合分支。集中类型/定向lint及该一条场景通过；审阅补事务render入口与工厂身份校验后只复查同场景（17.13秒）、增量类型和4文件lint，通过。没有全套测试、新测试工程、私人存档读取或可见窗口。
- 整个生涯仍未完成，readyForAuthority=false。Web权威/世界时钟接图、完整MemberView和GPU呈现、原版UI、世界生成、殖民地/自定义生产/势力以及独立合作联机仍需完成。保留全部已有工作，未使用子代理、操作桌面、暂存提交、推送、打包或发布。


### 实际成员视图推进：实施前对照（2026-09-22）

- 0.98a-RC8 CampaignFleetMemberView:120–310/349–637：按hullSize原比例构造sprite/阴影，最大船唯一时偏移为0但仍耗两次随机；SmoothMovement/面对originFacing、战机固定10项阵型、12项颜色/数值shifter、engineGlow先推进再在本帧末切accelerate/decelerate。Sprite覆盖有无size的分支不能统一成默认缩放。
- CampaignShipEngineGlow:149–195构造并不调用自身readResolve，不能提前覆盖构造中的hullStyle颜色；getAverage最后weight=1、width=max、angle=180且所有有效engine合成一个cluster，不按直觉分成多个簇。跳过contrailSize=128或256标记。引擎颜色用本机公开配置及真实EngineSlot构造提取，避免根据战斗配置猜生涯颜色。
- ValueShifter/ColorShifter是按插入顺序的多来源fader混合；重复shift不替换已有fader，Color null仅删除该来源且curr下一次advance才更新，setBase不立即更新curr。FighterWingFormation所有V/CLAW/BOX/DIAMOND分支保留原版计算；规模映射capital=5而不是舰队counts里的4。
- 对照此前已读取用户原版整体图中的小编队/圆环；截图不证明运动/引擎动态，不开实机/桌面补图。本轮打通真实普通成员构造与自然推进和尾迹生成；未落地的模块舰资源服务、jitter渲染及GPU绘制仍显式要求真实实现，不用空服务假完成。最终生涯目标不缩减。
- 缺口是目前create/advanceFleetMemberView必须外部回调。导入公开图标/引擎数据后接默认真实实现；集中修改结束后只扩原有同一舰队场景，统一相关验证。


### 默认实际成员视图与编队推进落地（2026-09-22）

- 新OriginalCampaignFleetMemberView替换默认CollectionView创建/推进的外接缺口。普通舰船与战机现在真正构造sprite/阴影/风纹资源状态、scale/中心、SmoothMovement/SmoothFacing、真实引擎slots/cluster、12个shifter及固定10项fighter阵型。对实际构造舰队调用advanceNativeFleetFrame不提供create/advanceFleetMemberView也能进入真实成员推进并生成实际尾迹；不是测试里的fader-only视图适配器。
- 缩放、速度、转向、唯一最大船仍消耗两次随机、prevAngle连续性与offsetOverride停止随机更新、原版只更新第1项起的战机跟随、先engine fader后末尾accelerate决策均保留。全部smooth movement复用已核实原版模块。侧向风按实际day转换和资源width推进，>1仅减1；尾迹在面对本帧更新之前加入，使用真实当前所属FleetData的location/visibility，而不是捕获位置投影。
- 新OriginalFleetViewShifters按原版有序多来源fader计算颜色/数值；重复shift保留同一fader，setBase与Color null删除不立即重算curr。新OriginalFighterFormation保留DIAMOND/BOX/V/CLAW及原版返回origin本体分支。引擎簇使用宽度加权、最终angle180/weight1/maxwidth，过滤contrailSize128/256，而不是想当然丢掉小引擎。
- 新import-campaign-fleet-view读取公开ship/skin/config/PNG和本机原版jar，不访问存档、不启动游戏或GL；532个含default_D船体规格、31联队、262贴图描述、557来源hash。皮肤只按原版支持的sprite与engine style/width/length/angle修改，不沿用战斗catalog中更宽松的任意字段merge。PNG只读元数据/hash，不复制/修改原资产。
- 引擎枚举经javap核实真实枚举名；NativeCampaignViewInputs仅运行原版EngineSlot构造/getColor/getContrailColor，hidden/headless单次进程（混淆字段需-Xverify:none，按原版混淆加载要求）。结果确认原版普通LOW_TECH返回[255,125,25,255]/[50,50,50,50]，不能照抄engine_styles里engineCampaignColor作为所有引擎颜色；皮肤style修改会强制CUSTOM，差异真实保留。styleId优先于inline styleSpec。构造不调用engineGlow.readResolve；不能提前把hullStyle构造覆盖重置。
- tagged native member view保存于现有schema25共享图，不将旧泛型/外接视图伪迁移为native；恢复验证真实引擎member身份、faders/shifters、贴图来源及fighter数组，现有view/fleet/member循环身份校验保持。构造的source sprite/engine描述不是GPU句柄。
- 集中检查：既有人员/舰队场景、类型、11文件lint；场景两处夹具问题分别为负零应保留及创建战机漏传FIGHTER_WING，仅修夹具后复查同一场景，最终19.50秒通过。默认自然帧覆盖无需成员视图回调的真实舰船及尾迹；另验证缩放/引擎色/唯一最大船随机消耗、加速fader一帧时序、覆盖sprite尺寸、战机阵型、shifter和checkpoint。未新增测试工程或运行全套。
- 当前仍没有实际Web成员绘制：renderOriginalFleetView仍要求真实renderFleetMemberView，阴影alpha-mask/wind/jitter、模块舰实时module variants/icons与GPU提交待实现；达到缺失module/jitter服务时明确报错，未用空回调穿过。JitterRenderer seed/绘制及模块舰完整资源生命周期仍保留实际服务接口。下一步直接补renderSingle/renderWindEffect/renderModules和引擎焰绘制并挂Web呈现，不能把此状态层称为UI已还原。完整世界/Web权威链、殖民地/生产/势力、独立合作联机仍未完成，readyForAuthority=false。
- 未操作桌面、启动可见窗口、截桌面、使用子代理或读取私人存档；未暂存提交、推送、打包或发布。所有后台子进程已结束。


### 舰队实际绘制实施前最小对照（2026-09-22）

- 原版0.98a-RC8：CampaignFleetMemberView.java:670–802、805–942；CampaignShipEngineGlow.java:238–300；CampaignFleet.java:574–599；CampaignFleetView.java:147–173；fs.common Sprite.java:162–203/474–507；renderers/O.java:145–155。用户QQ20260919-165600.png已重看：中央是小尺寸实际舰船编队而非大型箭头；不由静态图推断动态风纹/阴影。不开可见程序补验。
- 原版顺序：子战机(跳过船体<=0)→领机；船图→shifted glow+模块→风纹→alpha局部清除/船体遮罩→装饰武器+模块→阴影两次blend→引擎两四边形与hitGlow→jitter。风纹完整源码实际是四个quad，保留原版UV、逐顶点alpha和矩阵顺序，不采用此前未读完时的“两quad”猜测。Sprite中心为-1时用默认半尺寸；UV是POT占比而非全部0..1。颜色alpha为Java float→int→byte，不能统一clamp。
- 阴影不是乘色贴图：O清除用SRC_ALPHA,ZERO，只写目标alpha；船体ONE,ZERO；阴影ZERO,SRC_ALPHA再DST_ALPHA,ONE_MINUS_DST_ALPHA。成员尾部不自行重置colorMask。该scratch alpha不能直接当DOM透明画布的覆盖率；GPU适配器必须接同一完整场景RGBA目标，呈现时忽略scratch alpha，不将它叠到现有天体透明canvas冒充等价。
- 当前差异：默认成员render仍依赖外接回调，没有GPU消费者；现有Web仍为reference世界，不能拿旧舰队投影生成假native view。本轮补默认普通舰船/战机绘制帧、风纹、引擎和真实WebGL执行器/同场景入口；模块舰/装饰武器/jitter遇到缺少真实输入时继续明确拒绝，不空回调。后续接真实模块资源与完整权威宿主，不缩小生涯目标。
- 验证：集中扩原有舰队场景，并用其实际绘制帧在真正headless WebGL上提交，检查RGB/alpha及混合状态；一次集中类型与定向lint。无全套、无新测试工程、无私人存档、无桌面或子代理。逻辑几何和GPU像素分别报告，不声称完成整个UI。


### 默认成员绘制与真实 WebGL 场景目标落地（2026-09-22）

- OriginalCampaignFleetMemberRender实现普通舰船/战机renderSingle：保留真实fader/extraAlpha、领机与存活跟随机顺序、船图中心/角度、shifted glow、四段风纹、局部alpha清除/船体遮罩/阴影两遍blend、原版两个quad引擎和逐slot hitGlow。render写回实际sprite/blend/阴影字段，checkpoint继续保存同一个共享运行图。模块/装饰武器/jitter分支不编造数据：分别要求真实服务；无装饰槽才按原版force=false直接跳过全部普通武器。
- OriginalFleetDraw提供实际GPU顶点帧，Sprite的默认中心-1/显式中心、POT UV占比、Java alpha低八位语义均保留。尾迹QUAD_STRIP按原版条带四边形顺序展开。renderNativeFleetView现在返回实际绘制帧；新renderNativeFleetGraphics在同一事务内按尾迹→成员的顺序调用，尾迹render侧状态只推进一次，世界坐标尾迹与fleet-local船体转换到同一origin。外接成员绘制服务也收到frame，不把冻结snapshot作为可变绘制对象。
- NativeFleetRenderer是真实WebGL2消费者，不是额外intent列表。按原版POT底部/右侧填充、逐顶点RGBA、repeat、mipmap和SRC_ALPHA/ONE/ZERO/DST_ALPHA组合提交。beginScene绑定可供背景/天体/舰队共用的RGBA目标，draw执行原版mask顺序；present只取最终RGB并输出alpha=1，避免shadow scratch alpha变成DOM透明洞。纹理失败/尺寸变化/未加载贴图/非法几何显式拒绝，不悄悄丢船或用占位图。GPU句柄不进入权威图，适配器释放资源且不主动loseContext。
- 公开导入补contrail64b资源及Sprite/TextureLoader/局部清alpha的来源hash，现263贴图描述、561来源；只读公开资源。成员新绘制帧是脱离对象身份图的结果，schema仍25，不伪升级旧泛型view。
- 集中类型检查通过；12文件定向lint首次发现可选artifact写入所在原测试回调需async，修正后仅复查该文件。既有唯一人员/舰队场景中风纹夹具持续时间设为0被原版fader回收，改成真实持续中的shift后复查同场景通过(28.57秒)。未跑全套或建新测试工程。保存恢复覆盖render后sprite状态和成员共享身份。
- 真正headless Chromium/SwiftShader提交了普通船、有方向光船、ambient_ls船、风纹船、战机编队、原共享草稿完整帧，以及实际ContrailEngine生成的条带。各项WebGL error=0；present所有像素alpha=255；方向阴影改变6914个RGB像素并降低亮度，临时目标107584个像素alpha非255但不会泄漏到DOM；风纹改变8894像素；尾迹实际1 draw/36 vertices。核看headless截图，原版Lasher船图/中心/后向引擎、方向暗面及Talon阵型确实已绘出。证据：artifacts/native-fleet-gpu-F5OOnS/frames.json、gpu-result-with-trails.json、native-fleet-gpu.png。此图是放大诊断画面，不是原版同分辨率完整UI对照；未声明像素完全等价。
- **仍未接现有CampaignApp/旧reference世界的日常主画面**。新shared-scene入口需要真实native宿主供帧与同一背景/天体，不能把旧投影冒充原版舰队。默认模块舰/装饰武器/JitterRenderer服务仍待补，问号/指示器/提示音和完整权威世界也未完成。当前readyForAuthority=false；完整生涯、原版UI、殖民地/势力/独立合作联机目标保持active。
- 所有验证进程均已结束；Chromium headless并显式windowsHide，未打开可见窗口、操作键鼠、截桌面、读取私人存档、启动子代理或暂存提交/推送/打包发布。


### 模块舰与装饰武器实施前最小对照（2026-09-22）

- 0.98a-RC8原版：CampaignFleetMemberView.java:160–199、262–310、784–870；HullVariantSpec.java:292–345、380–394、856–889、1629–1646；nullsuper.java:248–283；OoOO.java:44–49、86–122；FleetMemberStatus.java:44–56、97–142；ShipHullSpecLoader.java:363–384/552–597和WeaponSpecLoader.java:126–290。BaseWeaponSpec$o的javap确认NEVER_RENDER_IN_CAMPAIGN、RENDER_ADDITIVE、两个LOADED_MISSILES名字，不能按混淆枚举字面猜。
- 原版模块视图：初构只求带模块边界，readResolve才创建icons；getModuleSlots过滤STATION_MODULE并保留stationModules当前顺序。模块优先取实际moduleVariants覆写，否则SpecStore返回共享stock variant；旧捕获未记录moduleVariants的状态不能当作已知null。边界使用anchor偏移后的90度slot位置；原版明确把临时anchor归零，非零slot角度取半长边正方形，不能换成更“精确”的旋转AABB。绘制索引从1开始，跳过越界或isDetached；null detached按原版是false，不等于缺失字段。spriteOverride只跳过模块绘制，不省略getSizeWithModules。
- 原版装饰武器：在当前variant的原生HashMap遍历顺序中画。默认force=false只画DECORATIVE槽；NEVER_RENDER优先跳过。先基座再炮管，再必要的装填导弹，生涯不执行战斗动画/下面图层排序；硬点centerY=height/4，其它=height/2，图层颜色保持white而非船体lightColor。隐藏导弹数量按hardpoint offsets，位置/角度却取hidden(来自turret半偏移)，保留这个原版差异。
- 用户原版地图截图已查看，证明小舰队在场景内的比例；未提供模块脱离/装饰灯细节对照，不开原版实机补图。当前实际WebGL可绘普通舰体但模块/装饰仍需外接服务；本轮补公开资源、真实模块变体服务与默认draw，并在既有场景和同一无头GPU诊断核实，不称完整UI验收。
- 保存真实模块variant对象引用和可空覆写表；未知旧状态继续显式服务，不猜测历史。保持可替换绘制/资源服务、readyForAuthority=false，不占桌面、不用子代理、不提交发布。

- 集成发现真实onslaught_mk1_Ancient创建还缺Automated及七个前置船体效果。未替换成简单舰船/空plugin来过测试：已读取Automated.java:15–56、BaseHullMod.java:243–258和ArmoredWeapons、DedicatedTargetingCore、FluxBreakers、InsulatedEngines、FluxDistributor、AutomatedRepairUnit、ExpandedMagazines的实际applyEffectsBeforeShipCreation。一起补所需前置效果；Automated按实际舰队指挥官(含override)是否为玩家判断，不按isPlayerFleet布尔猜。HullSpec的no_auto_penalty来自基础ship_data.csv或皮肤自己的tags；皮肤clear标签，default_D保留该tag。AutomatedRepairUnit的战役维修/CR恢复代码已注释，不照抄为生效效果。


### 舰队抖动绘制实施前最小对照（2026-09-22）

- 原版证据：0.98a-RC8 renderers/JitterRenderer.java 全文、CampaignFleetMemberView.java:387–450/770–779、api/util/Misc.java:499–503/2852–2861。render默认每次将同一个Random重置到seed；advance只在seconds>0时更新seed。方向偏移取随机数平方，圆形半径为线性采样；方形minRange<=0取正负半宽，有最小半径分支另外消耗两次符号随机数。Java float逐步舍入与圆形double三角函数边界保留。
- 原版setJitter复用已有fader/renderer，不重设渐入渐出时长；首次创建bounceDown=true。方向对象保留引用，重复渲染同帧不闪跳，战机同一个renderer每次重置。Misc.genRandomSeed依赖nanoTime，Web不伪造历史JVM时钟：宿主提供种子，默认草稿沿用已持久化且标为Web分支的newRandomSeeds，不消耗舰队运动Math.random流。
- 已重看用户QQ20260919-165600.png：中央真实小舰队与原版HUD结构可核实，但截图未显示抖动动态，仍不能据此宣称动态或完整UI等价。当前默认jr绘制/更新需要外接回调；本轮补默认可保存renderer及成员控制入口，并保留可替换服务。
- 模块readResolve原版先完整getSizeWithModules，再完整创建icons，必须第二次读取module variants，不能合并遍历。模块字段null detached是正常false。
- 一块完成后仅统一类型/定向lint、一个既有场景及一次相关headless GPU提交，复用已有验证器，不新增测试工程、不操作桌面、不读取私人存档、不暂存发布。

- 本轮GPU发现实际接线问题：checkpoint/canonicalJSON会重排texture键，直接来源的描述保持资源顺序；同一贴图六个值完全一致，却被NativeFleetRenderer的JSON.stringify对象比较误判冲突。修为按六个资源字段构造稳定key（仍拒绝真正的尺寸/UV/hash变化），不通过改夹具绕过。

### 模块、装饰与抖动绘制落地结果（2026-09-22）

- 模块与装饰默认实现已接原成员view/render及共享草稿，不再需要模块/装饰绘制回调。模块getSizeWithModules与icons独立遍历；当前真实onslaught_mk1_Ancient的两块模块按stock variant共享身份保存，detach/null/hullFraction0和spriteOverride按原版分别处理。Buffalo四个装饰灯按原版white/additive提交；force入口的Lasher装填导弹有实际独立绘制层。公开来源最新532 hulls、31 wings、163 weapons、582 textures、1075来源，舰队成员导入710 variants/266 hulls/780来源。
- 新OriginalJitterRenderer实现原版Java Random的seed/reset/nextFloat顺序、方向偏移、圆形/方形与最小半径两分支、setSeedOnRender关闭后继续流。MemberView提供set/end、direction/length/circular/brightness控制，正时间推进更新seed，零时间不消耗种子；再次setJitter复用现有fader和renderer。默认render提交真正additive sprite副本，不再要求readMemberViewJitterOffsets。草稿事务setNativeFleetMemberJitter/endNativeFleetMemberJitter已接，种子来自现有标明Web分支的newRandomSeeds，绝非声称复现nanoTime历史；仍可用服务替换。
- 模块舰真实创建所需8个船体前置效果已跟随上一轮补全并成功走正常创建/入队/自然帧。Automated使用实际commander及no_auto_penalty；没有启用AutomatedRepairUnit已注释的战役维修恢复。正常分支已有直接验证；Automated所有玩家惩罚及所有S-mod分支尚未逐一实测，不作全覆盖宣称。
- 集中类型与9文件定向lint通过；唯一既有人员/舰队场景通过（25.11秒，整个进程25.60秒）。覆盖模块lookup两个完整阶段、共享stock/module identity、可空detach、未知override拒绝、重复setJitter不消费新seed、不改原渐变时长、0时间与正时间种子、同帧相同offsets、native checkpoint恢复后绘制完全相同。未加新测试工程、未跑全套。
- 复用headless GPU脚本时发现同一纹理键顺序误判，修正生产NativeFleetRenderer稳定字段key后仅复查GPU与该TS文件的类型/lint，全部通过；没有重跑整条场景。实际GPU：模块完整14draw/198vertices、脱离13draw/192vertices，6152像素变化；Buffalo灯增加4draw，225像素变化；抖动增加8draw，110558像素变化，同帧重复绘制0像素差异。各帧WebGL error=0、最终全图alpha=255。已经核看诊断图，舰体、模块/装饰及蓝色多副本实际绘出。
- 证据：artifacts/native-fleet-complete-draw-jr2zCP/frames.json、gpu-result.json、native-modules-and-jitter.png。诊断为放大独立场景，不是原版全UI对照；原版截图未包含对应动态，不宣称视觉完全一致。
- 当前shared图仍离线，readyForAuthority=false；CampaignApp/旧reference权威主链尚未接此真实世界。下一块优先推进真实共享运行图和主画面/宿主接线（包括接触标记与世界实体），不要继续把离线draw齐全视为可玩生涯。世界生成、原版UI与交互、势力、自创势力、殖民地、独立/合作联机仍为完整目标。
- 所有进程已结束；未操作桌面、切窗、注入键鼠或开启可见浏览器，未用子代理、读取私人存档、暂存提交、推送、打包或发布。


### 共享运行图进入既有宿主前最小对照（2026-09-22）

- 本机0.98a-RC8：CampaignFleet.java:1102–1112/1615–1621确认普通移动输入不能覆盖moveOverride，慢速的无参/boolean重载不同；CampaignFleet.java:574–617确认完整场景绘制还需viewport/hidden/sensor两重fader及航向箭头，不能将低层成员GPU帧当完整场景或对所有联网玩家广播。原版截图已核看，界面布局本轮不动。
- 当前差异：共享图的运行主体及4个纯状态依赖在scripts/lib内，生产CampaignWorker只锁旧reference ruleset；Repository/Kernel假定扁平world与250k JSON节点限制。不能把循环共享图塞进旧extensions、复制成两个权威世界，或绕开保存/幂等/fencing在client本地推进。
- 本轮接线：将现有运行主体与恢复/codec依赖移至server/campaign/native，旧脚本路径保留re-export。复用现有Worker/Repository、同一worlds/receipts/outbox事务和epoch；增加显式enableNativeDevelopment宿主开关，默认不允许加载未完成native世界。原图仍以私有身份checkpoint保存，不发HTTP，不把readyForAuthority改true。使用独立world envelope，旧reference read/command/scheduler明确拒绝，不并行运行两套规则。
- 首批宿主能力是已实现的真实舰队航行输入与system-only低层GPU帧事务；控制者从宿主保存的绑定读取，不能由command自行选system或越权选舰队。命令失败丢弃临时图且SQLite回滚，重试同requestId返回已存回执，旧epoch被fence。native全世界时钟/AI/发现/场景可见性与主界面还不满足，暂不公开该图的网络/session接口，更不复用旧cooperative假感测投影。
- 验证集中扩已有唯一舰队场景，验证Worker真实读写、重试、越权拒绝、失败不污染图、关闭重开以及共享身份不丢失；统一类型与定向lint。不新增测试工程、不读私人存档、不占桌面、不发布。

### 既有Worker/SQLite接入结果（2026-09-22）

- 真实运行实现迁至server/campaign/native/NativeCampaignRuntime.mjs（保留NativeLiveEconomyDraft别名），CheckpointCodec/ConditionRestore/IndustryStorage/IndustryRestore同迁入运行层。原scripts/lib五组入口只re-export同一个实现；没有复制出第二套逻辑或更改checkpoint scope/schema25，旧工具/存档仍走同一共享身份恢复。运行JS不再依赖scripts/lib；少量声明类型仍引用捕获数据类型。
- CampaignService→CampaignWorker→CampaignRepository已贯通显式native开发世界创建、状态、受控玩家导航投影、命令与事件读取。启用条件是宿主构造enableNativeDevelopment=true，默认关闭；保存scope=native-campaign-development-world，readyForAuthority=false、status=development-incomplete。现有worlds/receipts/outbox和SQLite schema2复用，无新增旁路数据库或自动迁移用户存档。
- 已支持native.fleet.set-destination（不能绕过原版moveOverride）、native.fleet.go-slow（保留无参/stop区别）、system-only native.fleet.capture-graphics。GPU捕获事务保存render侧状态并将真实原版模块/抖动等帧放入幂等回执，重复请求不二次改变尾迹/随机状态。该帧明确是graphics-layer-only，不含完整场景的视口/隐藏/感测门控、航向/接触箭头；不能直接充作对外scene DTO。
- 航行命令先按宿主持久化control绑定校验权限，再查fleet，避免利用存在性错误探测其它舰队；输入时核对当前地点仓库contains真实对象与expired。原版BaseCampaignEntity.java:984–985证明仅containingLocation非null不代表仍存活（退场可保留该指针）。玩家投影不含checkpoint/cargo/第三方位置或全局舰队总数，只公布本人可控制数量与导航输入能力。控制绑定不是玩家可提交的command。
- 旧reference read/execute/simulation-start对native envelope明确WORLD_RUNTIME_MISMATCH，不能推进两套时钟或悄悄降级。尚未实现native完整自然世界调度，没有暴露advance-motion半帧来伪装完整生涯推进；HTTP/session/CampaignApp仍待安全scene projection和实际自然帧接线。控制绑定不等于已完成多人观察者感测、加入/退出队伍与独立合作体验。
- 持久化每条命令先恢复独立图，失败整图丢弃并SQL回滚；authority epoch、expectedRevision、actor+requestId/digest、回执与outbox同事务。真实验证在receipt INSERT故意失败后，之前的graph UPDATE也回滚；关闭Worker再打开，旧请求仍返回旧回执，新请求旧epoch被拒绝；第二个Repository接管后旧实例被AUTHORITY_REPLACED阻止。
- 统一类型/10文件定向lint通过；只运行一条现有人员/舰队场景，32.35秒（进程33.00秒），真实Worker返回GPU帧与原共享图直接绘制完全一致，SQLite恢复后模块/stock variant、view/member/engine、舰队position/entity以及抖动seed身份与状态保留。仅Node内置SQLite实验提示，无测试失败。复审补存活/权限投影后只对相应函数和文件做小片段/lint复查；未重跑全套、未新增验证工程、未重新截无变化GPU图。
- 运行中临时native-host目录和SQLite/WAL/SHM均已关闭清除，所有后台进程结束；未读私人存档/用户数据库，未操作桌面/切窗口/注入输入/启用子代理，未暂存、提交、推送、打包或发布。完整生涯目标继续active。


### 原生观察者感测与认证传输实施前最小对照（2026-09-22）

- 0.98a-RC8 BaseCampaignEntity.java:1080–1098/1130–1215：isVisibleToPlayer先过滤不同地点；无sensorProfile以及关闭sensors有原版提前返回；玩家专属detected_by_player_range_mult与easySensorBonus取决于观察者的玩家身份。已有originalRouteFleetVisibility虽能传observerRef，却仍用全局space.playerFleetRef判玩家，第二个联机观察者会套错范围。新增显式玩家观察上下文，不修改共享space.playerFleetRef或fleet.isPlayerFleet，原单人查询保持原逻辑。
- CampaignFleet.java:574–617及SensorContactIndicatorManager.java:57–180表明完整动画场景还依赖各观察者自己的fader、问号/成员view与隐藏状态。用户原版截图已核看，不能把当前瞬时感测查询冒充完整原版场景。当前安全的接线块是受认证的当前观察结果：NONE/隐藏/不同地点/不在仓库的舰队不出现在响应；SENSOR_CONTACT/COMPOSITION_DETAILS不附名字、势力或私有货舱/变体数据；完整等级才给身份字段。场景动画接线继续待做，本轮不替换原版UI。
- 引擎自然帧源码CampaignEngine.java:973–1116、BaseLocation.java:502–787已核实：经济在clock前；非当前地点按60帧轮转；地点还有排队增删、光源/脚本、实体后置速度积分、轨道与遭遇判断。现有fleet-only登记不能代表完整地点，不能用遍历fleet.advance伪造完整世界时钟。本轮不开放这种半帧推进。
- 接口走上一轮现有Worker/Repository，再接现有HTTP网关明确native-development模式，必须development与宿主开关同时开启；token授权玩家由服务器决定，观察舰队必须归该玩家控制，拒绝冒用其它玩家的视野。单独native-session/native-observations/native-command路径，旧session语义不混用，system-only低层GPU捕获与私有checkpoint仍不暴露。客户端补类型与请求函数，为后续主画面消费准备真实数据链。
- 只扩一个既有场景完成双观察者/信息过滤/真实HTTP通路检查，统一类型与定向lint；无新测试工程、桌面操作、私人存档或发布。


### 认证观察传输结果与观察者呈现实施前对照（2026-09-22）

- 已核对当前代码：native-session/native-observations/native-command接入既有Worker/SQLite/HTTP；身份取token绑定，逐玩家观察不改变全局playerFleetRef，未知/部分接触不发名字/势力。上轮唯一既有场景最终通过约26.47秒，类型/定向lint已通过，本轮不重跑这部分。主画面/自然世界帧仍未接。
- 原版0.98a-RC8 SensorContactIndicatorManager.java:193–250：标记尺寸固定35，alpha=viewportAlpha×sensorFader×min(markerBrightness/0.75,1)，颜色首次加载取固定player势力getColor；每标记相对舰队中心偏移，不随舰队航向旋转。settings.json:1232–1233特别核实：misc.question_mark实际指向graphics/icons/fleet_triangle.png，而不是question_mark_actual的问号贴图。
- CampaignFleet.java:574–617、619–673：船体与尾迹乘两个感测fader，viewport边界450；10单位航向箭头在selectionSize+5处、半alpha；仅玩家按实际course widget的phase/zoom/inner brightness画15个航线箭头，stationMode或非null fadeAndExpire抑制箭头。BaseLocation.java:431–438：所有舰队层之后另画接触层，viewport边界radius+20。不能逐舰队将接触层夹在后续舰体下面。
- 已重看用户QQ20260919-165600.png：小尺寸编队/圆环/航向标，未展示未知接触；两个远近特写实际是跳跃点，不能拿来证明舰队感测动画。接触贴图已直接查看；动态实机对照仍待用户许可，不操作桌面。
- 当前差异：Contact已有原版状态但无真实GPU标记绘制；共享entity fader/单FleetView不适合两个独立观察者。实现方向为可显式传入的独立呈现状态，保留同一实际fleet/member身份、不临时交换全局玩家/共享视图；复用现有绘图GPU消费者，不开放私有世界图。原单人自然帧入口保持默认。
- 验证只扩既有相关场景：同一目标在两观察者下独立fader/标记/成员视图；核对实际纹理、quad/透明度、船体及箭头门控。统一类型/定向lint/该场景，不新建测试工程。完整主画面、圆环/选择、自然世界帧不因这些图层完成而宣称完成。


### 独立观察者呈现与原版接触图层结果（2026-09-22）

- 原生宿主新增观察者呈现对象及分开的Base接触/成员后视图阶段。同一实际fleet/member共享身份保留，sensor/contact fader、manager、成员CollectionView、尾迹和视觉随机流分别持有；没有临时替换全局player或fleet.campaign.view。各观察者的世界AI/运动不能在这些入口再次推进。视觉seed为显式新分支，非原版Math.random历史复现。
- 既有OriginalFleetContact与FleetView默认调用兼容；传入独立状态时复用同一原版逻辑，不复制另一套规则。FleetMemberRender读取所选视图光源，不偷读单例view。旧原生全局状态未被迁移/覆盖。反向“对方是否发现玩家”也使用当前玩家身份上下文；第二名玩家的NPC观察者不会错误继承第一名玩家的easy/sensorsOff特权。
- 真正接入四边形和NativeFleetRenderer：原版35单位三角接触贴图、marker/两层感测渐变、450/radius+20视口门控、hidden的nullable语义、10单位半alpha航向箭头和15个course箭头。接触图标缓存用WeakMap，保持原版transient语义，不把GPU缓存塞进checkpoint。所有fleet层与contact层分别提交，避免远处标记被后续舰队层盖错。
- 在同一既有场景中实际生成两观察者的场景层：A未知无舰体quad，B可辨编队有舰体/航向；A靠近有舰体与接触交叠渐变且不改变B；self不画接触且course15个；隐藏/空间站/视口与视图清理门控；shared view/fader及世界随机状态不串线。一次集中类型、15文件定向lint、唯一场景均通过，场景25.02秒，无修错重跑、全套或新测试工程。
- 复用现有WebGL消费者做一次无头呈现，证据artifacts/native-observer-layers-NiDY0S：A接触4 draw/舰体0；B接触0/舰体24；靠近各层并存；观察者间14348个RGB像素不同；所有GL error=0、最终alpha全不透明。已查看放大诊断图，三角贴图与舰体/渐变可见。这不是原版同分辨率主画面验收；用户截图未提供未知舰队接触状态，动态实机仍待许可。
- 边界：这些是宿主内部的观察者图层，尚未成为HTTP完整scene或CampaignApp主画面；没有圆环/选择等完整UI，独立呈现状态还需世界帧宿主持有与恢复/重建，现有mod对共享member view的效果也需逐观察者分发。私有成员view/graph和低层GPU帧仍不对玩家广播，安全DTO与呈现不可混称。完整Sector/BaseLocation时钟、世界生成/AI、势力/自创势力、殖民地与独立合作联机仍未完成，readyForAuthority=false。
- 后台Node/Chromium/本地临时HTTP/Worker均已退出，native-host临时目录为空，本轮Java公开资源导入class临时目录已清除。没有私人存档读取、桌面/输入操作、子代理、暂存提交、推送或打包发布。


### 世界帧调度实施前最小对照（2026-09-22）

- 原版0.98a-RC8 CampaignEngine.java:973–1115已逐段核对：非暂停才增加long frame；系统移除/监听重挂及UI/intel/event/人物管理先行；经济在clock之前；暂停时sector/character/faction传0，player速度仍更新。正常模式current.advanceEvenIfPaused在clock之前，后台地点固定60槽且传60倍dt，当前地点正常advance在后台之后；fast-advance则hyperspace及每个系统全量推进，无正常ping分支。引擎持久/临时脚本各自快照，前后done检查，暂停门禁。
- BaseLocation.java:502–786也已核对，包含排队增删、光照、地点脚本、实体advance后orbit/velocity积分、LocationToken、遭遇及spawnPoints。现有fleet-only仓库没有这些完整状态，因此本轮不能把调度器的location callback默认接成仅遍历舰队。真实地点自然帧服务缺失时必须拒绝，不启用HTTP世界模拟。
- 现有advanceNativeScheduledFrame把经济调度和clock/open-retail计时绑在一起，不能直接用作Engine的经济阶段（否则world memory等阶段会读到过早更新的时间，或双重计时）。本轮拆出同一经济实现的before-clock阶段，原兼容入口继续保持既有行为；新引擎帧clock只推进真实Clock，零售时钟仍属于后续完整Market/Base地点推进，不重复加。
- 世界帧游标/地点顺序/脚本/pings/暂停背景active状态放入现有共享图检查点；旧图只标明engine状态未知(null)，不从fleet仓库猜已有世界历史。调度器所有到达的外部manager/location阶段要求真实同步实现，无空回调默认。
- 本轮不改界面布局；此前已核看用户原版全屏图。UI管理仍是原生阶段依赖，不把服务器省略UI当作原版等价。本轮验收仅原版顺序/真实经济时钟/检查点恢复，完整原版实机帧仍待许可。只扩一条既有经济自然帧场景，集中类型/定向lint与该场景。


### 世界帧调度与真实经济时钟拆分结果（2026-09-22）

- 新OriginalCampaignEngine实现advance调度次序：非暂停signed-long帧号、系统移除/监听与ID缓存、UI/intel/event/人物阶段、listenersWithTimeout、真实经济、Memory/faction、normal/fast两条地点调度、pings及两组脚本快照。正常current even-if-paused在clock前，后台60槽/60倍dt在clock后，current普通advance最后；暂停不增帧/不推进clock，选中的后台槽仍运行even-if-paused；fast推进全部地点而不重复正常pings。当前地点/暂停/fast状态保持实时读取，不先拍扁上下文。
- NativeCampaignRuntime新增bind/advanceNativeEngineFrame；默认经济走既有真实任务、通知和结算实现的新before-clock私有阶段，Clock仍是原有OriginalNativeClock。旧advanceNativeScheduledFrame兼容行为保持，但绑定Engine后拒绝再用旧经济/clock入口，避免双重推进。新Engine clock不附带open-market两个计时器；这些必须由完整Market/地点阶段推进，不能在时钟层再加一次。
- 现有共享检查点升schema26，engineFrame保存实际world/hyperspace/有序系统/current/active状态、脚本/pings/Memory/游标引用；旧schema25及以前只恢复engineFrame=null，不从空仓库猜原世界。恢复拒绝分裂currentLocation/world身份。补核实CampaignEngine.java:301的frame本来是transient：Web检查点保留游标属于服务端中断续接语义，不冒称原版原生存档也保存它；未实现原版手动读档时的完整transient重建策略。
- 集中类型、5文件定向lint通过。唯一既有natural economic frames场景第一次揭示了检查点严格字段校验仍在旧版本迁移之前，已将新字段校验移到完整迁移之后；只复查同一场景，最终0.82秒通过，随后仅runtime文件lint复查通过。覆盖实际月末经济读取旧月份/Clock只推进一次、暂停0dt内存/派别阶段与后台30秒调用、fast全地点、超过60系统轮转、signed-long溢出、脚本新增延后、保存恢复及旧入口拒绝；没有全套或新增测试工程。
- 证据边界：经济任务/Clock/检查点为真实实现；测试中的其它engine manager与BaseLocation为明确记录顺序的适配器，不是完整世界仿真。正式默认没有空实现：缺失location或manager时抛错，失败草稿不可保存。当前HTTP依然NATIVE_WORLD_FRAME_UNAVAILABLE，未用fleet.advance代替完整地点。原版单currentLocation调度已保留；多玩家分处不同地点的活跃地点策略仍需在联机宿主层明确，不静默改成原版行为。
- 下一步仍是完整BaseLocation状态/光照/脚本/轨道与后置积分/遭遇，再将舰队自然帧和逐观察者呈现挂入它，随后接scene及主画面。本轮不宣称地点物理/AI、世界生成、势力/自创势力、殖民地或独立合作联机完成，readyForAuthority=false。无私人存档、可见窗口、输入操作、子代理或暂存提交/推送/发布；所有本轮检查进程已退出。


### 地点自然帧实施前最小对照（2026-09-22）

- 重核0.98a-RC8 BaseLocation.java:339–399并运行原版jar的javap：addObject/removeObject直接Real实现，executeAdds/executeRemoves字节码只有return。纠正前两轮“需要实现排队增删”的笼统判断：该版本并无延迟队列，不能人为引入队列。实体/脚本遍历的快照时机才决定本帧能否看到新增对象。
- BaseLocation.java:502–562/572–650/762–785：even阶段先所有实体indicator，再设置光源/包含地点并advanceEvenIfPaused，最后地点脚本快照；普通阶段先Memory/lightHeight(天)/current背景/命中粒子，然后实体快照：先移除expired，否则advance→orbit→velocity积分→indicator；LocationToken随后另一次快照；dt<=0直接return（不会更新lastPlayerVisitTimestamp），正dt执行遭遇/旧spawnPoints，再记录当前地点访问时间。暂停普通入口只做末尾访问时间分支。
- 光照覆盖必须同时有Memory的$lightSourceOverride和$lightColorOverride；否则StarSystem从center、直接恒星轨道焦点、二级恒星焦点及恒星光色覆盖选择，非StarSystem以null光源和地点色。campaign/util/super.java:103–114核实pending indicator type在fadeOut后切换，再推进两个fader；DynamicParticleGroup.advance先逐个advance/收集expired，最后removeAll。BackgroundAndStars.advance只更新warper和两组ColorShifter，不拿绘图当推进。
- CircularOrbit/PointDown/WithSpin的advance已核实：原生对象引用与仓库顺序，不沿用旧reference的focus-first排序或10秒dt上限；轨道更新舰队时调用setLocation同步movement，而BaseLocation后置速度积分只写entity位置。这两个动作不能合并或用setter替代积分。非正半径只在普通circular有特殊分支。
- 遭遇分支反编译带损坏标签，已核对javap的800–1229等偏移：空间站可先自动支援，交互目标条件后再考虑加入已有战斗，成功join直接下一对，否则进入距离/势力/玩家或NPC战斗分支。真实Battle/AI/监听插件未实现时仍必须要求实际服务，不用旧reference战斗规则替代。
- 本轮不改变原版UI布局，已核看的全屏图不能证明这些动态时序，实机仍待许可。只扩一个既有人员/舰队场景核对真实后置移动、光源、轨道身份与保存和各阶段顺序；统一类型/定向lint/单场景，不开桌面、不读私人存档。

- 接线补核：CampaignEngine.isInFastAdvance 与 isFastForwardIteration 是两个独立字段，默认地点适配必须显式读取后者，不把前者代用。地点新状态仅显式绑定，不给旧检查点补造中心/背景/脚本历史。此轮接线与保存恢复仍不代表真实Battle、其它实体仓库或主画面已完成。


### 地点自然阶段接入结果（2026-09-22）

- OriginalLocationFrame已从独立草稿接进NativeCampaignRuntime：显式bindNativeLocationFrame，默认even/normal服务直接调用现有真实舰队帧，并由Engine默认地点回调调用；mod仍可显式替换服务。两层保留实时暂停/当前地点getter，isFastForwardIteration须单独输入，不偷用fastAdvance。相同地点重入明确拒绝，未知地点不自动创建空状态。
- 原版实体推进次序实际执行：全体indicator第一遍、光源与even第二遍、地点脚本快照；普通帧推进地点Memory、lightHeight（天）、当前背景shifter/warper、粒子集合，之后expired移除或舰队自然帧→轨道→直接速度积分→indicator，最后独立LocationToken快照。dt<=0在遭遇和访问时间前return；暂停直接调用只更新当前地点访问时间。原版executeAdds/executeRemoves为空，未增加自创队列。
- CircularOrbit/PointDown/WithSpin保留float运算和实际焦点/实体引用，无旧reference的10秒上限和focus-first排序。正半径轨道的舰队setLocation同步movement，地点后置积分仅写entity位置；circular半径<=0分支不调用setter。光源双覆盖条件、直接/二级恒星选择、默认地点色和舰队view光源已接实际状态。
- 共享检查点schema27增加locationFrames（未知旧状态为null，不重建历史），保存地点Memory/脚本/背景状态/粒子/访问时间与轨道循环图，验证world、location、fleet、orbit.entity和已知focus/center共享身份。保存与恢复拒绝分裂引用。注意这仍不是原版完整BaseLocation构造器：中心和背景由调用者提供，hyperspace warper不能假造为空。
- 一次集中类型检查、8文件定向lint通过；仅扩既有native personnel rosters drive场景。首次在新测试的Memory键名缺少$处失败，修正夹具后只复查同一场景，27.68秒通过（总进程28.06秒）；未重跑类型或全套。覆盖真实舰队默认调用、后置移动与movement差异、轨道/光源/保存身份、expired去注册、暂停/零dt、Engine默认even接线以及缺失遭遇导致草稿不可保存。单独的generic entity/token适配器只证明两级恒星光源与快照时序，不证明非舰队仓库已移植。
- **仍缺**：原生Battle/AI/遭遇默认实现、非舰队天体/LocationToken的正式注册及自然帧、真实完整背景/粒子插件、其它Engine manager和完整世界生成。正dt地点仍要求advanceLocationEncounters；有未知背景/粒子/脚本时要求真实服务，没有默认空回调。HTTP仍NATIVE_WORLD_FRAME_UNAVAILABLE；逐观察者视觉尚未由完整世界驱动，CampaignApp/权限安全完整scene仍未接入。本轮没有新增UI，不把测试记录器或独立位移证明当主画面/原版实机验收。
- 重新查看用户原版全屏参考但未操作桌面、启动可见游戏/浏览器或读私人存档；无子代理、新测试工程、暂存提交、推送或发布。检查子进程均已结束，暂存区仍为空。完整生涯目标保持active，readyForAuthority=false。


### 地点遭遇判定实施前对照（2026-09-22）

- 原版0.98a-RC8 BaseLocation.java:650–775与jar javap 670–1910：舰队配对和空间站遍历是live列表；普通实体尾段才是快照。双方只要一方以另一方为interactionTarget才考虑普通近距离交互（空间站自动支援已有Battle例外）。pair范围严格小于selectionSize之和，fastAdvance只在此加1000，不能扩大末尾玩家通用交互范围。
- CampaignFleet.java:543–547 canBeEngaged只看可见性限制Memory、noCombat与fadeAndExpire，不自创hidden/empty/expired过滤；isStationMode为字段非null，而非Boolean值。双方AI.isHostileTo都要调用，不能OR短路第二方。派别比较用实际对象身份，NPC才读取isAtBest(HOSTILE)，玩家交互并不以敌对为必要条件。
- javap核实两次join分支调用后直接下一对，即使join返回false也不进入普通分支。先无目标要求的空间站支援，再有目标要求的站点/AI加入；AI wantsToJoin传false。CampaignOrbitalStation的独立交互分支不设置前面playerEncounterStarted标志，不能自作去重。
- Misc.java:3850/getStationMarket与isStationInSupportRange：Memory的$stationMarket必须实际Market；默认主实体距离10000，读市场主实体和站点距离；两者任一<=battleJoinRange即可。settings.json:736默认500。原生Fleet半径复用既有originalFleetSensorRadius（当前fleetSizeNum，不额外sync）。
- 当前battle字段只有strength/memberSource投影，不是Battle；Battle.java:83–99构造会设置双方、通知abilities并挂地点脚本，advance包含移动/可见性/自动结算。此轮不把投影或旧reference EncounterLifecycle当实际Battle，也不新增假空Battle：判定到达Battle方法、AI插件或玩家监听器时仍须实际服务。先使原版判定成为地点默认路径，不再把整个遭遇阶段外包给一个空白callback。
- 已查看用户原版跳跃点近景和情报页截图；它们不证明完整遭遇对话布局。本轮不改布局或捏造交互窗，只接原版监听调用。原版实机/遭遇对话仍待许可。实现完成后只扩一个既有场景，统一类型/定向lint/该场景。

- 接线验证补充：真实current-player舰队进入world/location引用环后，恢复失败于validateOriginalPlayerEconomy对整个state调用immutableJSON。原版CampaignEngine.setPlayerFleet保存的正是CampaignFleet引用，不应退回无世界投影来规避。修复方案是在已由CheckpointCodec检查plain objects/有限数/键与大小/深度/引用的恢复入口调用纯共享身份校验，普通JSON捕获仍调用原严格JSON入口；不放宽网络JSON边界、不跳过person/cargo/fleet身份校验。


### 默认地点遭遇判定与实际玩家图恢复结果（2026-09-22）

- 新OriginalLocationEncounters与独立reference-location-encounters数据已接入OriginalLocationFrame和NativeCampaignRuntime默认路径。当前真实仓库舰队先走live配对，再live旧轨道站，最后玩家通用实体快照；无目标/无战斗时可完成该阶段，不再需要整段advanceLocationEncounters替代回调。默认实体解析用现有实际fleet factory，市场判断用当前市场对象身份，感测沿用现有native可见性；未知天体/监听器/AI/Battle效果到达时才要求真实服务。
- 已保留原版可接战Memory/noCombat/fadeAndExpire门槛，严格小于范围、fastAdvance的pair-only +1000、两处站点/AI加入以及忽略join返回值后的continue、双向AI仇恨非短路、派别对象身份、玩家交互不要求敌对、NPC构造前重读Battle、站点分支不设置前面已开始标志。默认500单位站点支援读取实际$stationMarket与主实体，不忽略站点主实体支持圈。isFastForwardIteration和fastAdvance仍是不同状态。
- 函数返回的是判定调用统计（joinAttempts/battleCreationCalls/playerEncounterCalls），不是已创建/完成战斗的收据，更不是完整scene。现有Battle字段仍只有strength/memberSource投影，默认**没有**用它假造Battle：选边/加入、创建及后续推进仍需真实Battle/AI插件；玩家startEncounterInvolvingPlayerFleet仍需真正监听器/交互界面。
- 接线暴露真实问题：原玩家经济校验immutableJSON(state)拒绝含地点反向引用的实际玩家舰队。现已拆出validateOriginalPlayerEconomyReferences，由已经经过CheckpointCodec完整plain-object/有限数/安全键/大小/深度/引用检查的恢复入口调用；普通捕获继续严格JSON校验。没有放松cargo/person/舰队/月结余额的身份要求，检查点保持schema27。测试以明确当前玩家fixture绑定保留原月结余额，证明世界中的真实玩家引用可续接；这不是完整setPlayerFleet/旗舰舰长/指挥官切换工作流的实现。
- 类型、7文件定向lint通过。只扩既有native personnel rosters drive场景；失败仅复查同一场景，修正夹具误选未注册派别和遗漏共享余额，并修复上述真实恢复问题后，最终25.79秒通过。之后仅增量类型和4个修复相关文件lint复查通过，没有全套、新测试工程或GPU复测。覆盖实际默认运行时实体解析、原生Fleet半径/Memory/支援范围、玩家/NPC分支、join(false)继续语义、live新增舰队与通用实体快照、普通地点正dt到达默认遭遇、共享玩家世界恢复和缺失监听器导致草稿不可保存。Battle/AI/UI效果录制适配器只证明分发，不证明真实战斗或界面完成。
- 当前仍缺完整Battle/选边/自动结算、真实AI与玩家交互监听器、天体/token正式仓库、其它manager、权限安全scene传输、每观察者世界驱动和CampaignApp接线。HTTP仍NATIVE_WORLD_FRAME_UNAVAILABLE，readyForAuthority=false。原版UI、势力/自创势力、殖民地、独立/合作联机的完整目标保持，不以本轮通过的判定场景代替可玩验收。后台检查已结束；无子代理、桌面操作、私人存档读取、暂存提交、推送或发布。


### 实际 Battle 对象与默认参战接线：实施前最小对照（2026-09-22）

- 原版 0.98a-RC8：campaign/fleet/Battle.java:63–117、149–310、601–712、714–809、905–1129、1210–1248、1339–1348；CampaignFleet.java:933–936、1343–1345、1410–1458、1479–1481；BaseCampaignEntity.java:253–260/344–348；Memory.java:250–267；api/util/Misc.java:1844–1849/4019–4021；Faction.java:955–957。settings.json 的 autoresolveBaseInterval=1（天）。已重新查看用户全屏原版截图；它不证明战斗交互窗口，本轮不改 UI、不凭空设计窗口。
- 原版构造先创建两个 IntervalTracker，再生成 Random.nextLong 种子；第二参数为玩家则交换，依次赋两边 battle、通知能力、设 primary/playerInvolvedAtStart，最后挂第一舰队实际地点脚本。加入已在同侧的对象直接 true，不重通知或清目标；普通 join 不等于 canJoin，显式侧别重载不重复门禁。
- pickSide 必须保留实际对象身份、快照、识别玩家、巡逻队、noRepImpact/everyoneJoinsBattleAgainst、关应答器允许加入的递归与优先顺序。javap 核实偏移845–891的三个提前返回发生在905–908应答器还原之前；保留原版副作用，不用 finally 改写。Memory.is(boolean) 是 contains 后 getBoolean，不是 JS 严格值比较；无用 isWarFleet 读取仍执行。
- 当前差异：Battle 只有 memberSource 强度投影，遭遇依赖录制适配器。本轮新增真实双方/快照/primary/interval/seed/能力通知/选边与加入，默认遭遇接它，检查点保存 fleet ↔ battle ↔ location-script 共享图；旧投影不能自动升级。Web种子来源明确不是原版历史 nanoTime，不消费 Sector UID。
- 实际 fleet hostility/friendly 按原版调用顺序接 Memory/AI/派别关系；缺失真实 AI/派别关系/非空能力插件仍明确报错，不能用经济 hostility 表补猜。Battle.advance、combined/撤出/自动结算尚待后续实现，地点脚本只识别已知 done/runWhilePaused，未有真实 advance 服务必须拒绝推进，不以空函数挂住假战斗。
- 验证方法：完成此块后统一类型/定向lint，并只扩现有人员舰队场景：构造回调顺序、默认遭遇创建/加入、快照/主舰队、特殊选边与应答器提前返回、保存恢复和损坏引用拒绝。不跑全套或另建测试工程。


### 实际 Battle 创建/选边/加入已接默认遭遇（2026-09-22）

- 新增 OriginalCampaignBattle.mjs/.d.mts 和 reference-campaign-battle.json。它是实际参战双方、快照、primary/combined 槽位、IntervalTracker、long seed、memberSource 与地点脚本的共享对象，不是强度投影或调用收据。构造按原版先交换第二参数玩家、双向绑定、依序能力通知、设置 primary，再加入第一方实际地点脚本；空能力表不假造插件，非空能力通知要求实际适配器。
- 完整移植 pickSide 的当前/快照身份、识别玩家/应答器、巡逻队、友好/敌对、同实际Faction对象、noRepImpact/everyoneJoinsBattleAgainst、关应答器允许加入及递归优先级。Memory.is(boolean) 保留 contains→getBoolean；javap证实的提前返回不还原应答器也保留。CampaignFleet hostility/friendly 与双向AI调用次序接到真实关系服务；不是用经济 hostility 投影兜底。
- canJoin 保留非null跃迁/空间站门禁；join显式侧别不重复canJoin，已在同侧的对象直接true且不清target/不重通知。新增原版快照、主舰队和最近参战舰队方法；快照不额外sync，主舰队读取FleetPoints仍经过真实sync。
- NativeLiveEconomyDraft 默认遭遇现在创建/选择/加入该Battle；开放 createNativeBattle、pickNativeBattleSide、canJoinNativeBattle、joinNativeBattle、takeNativeBattleSnapshots，并保留服务替换能力。Battle没有原版Sector UID，Web图身份与明确的新分支随机种子分开；两个interval消耗共享globalRandom，new Random().nextLong使用现有Web持久种子流，不冒充原版历史nanoTime。
- 检查点仍schema27：没有给旧存档捏造新根历史字段。验证双向 fleet/battle、独立side/snapshot列表、工厂舰队和成员、Battle/world/location-script 共享身份；只保留旧memberSource强度投影，不自动升级。地点脚本可直接识别真实done/runWhilePaused；正常advance缺少实际服务仍报错并使草稿不可保存，绝非空转完成。
- **集中检查一次通过**：类型检查、7文件定向lint、唯一既有人员/舰队场景（60.67秒，整个测试进程61.55秒）。场景覆盖默认创建和空间站支援加入、通知顺序、两条随机流及不耗Sector UID、快照不sync、重复join无副作用、非null门禁、应答器提前返回、双向AI调用、Memory boolean、保存恢复/损坏引用拒绝、暂停跳过与未实现advance拒绝、第二参数玩家交换。非空能力、AI和关系服务的探针仍是明确的验证适配器；这不证明完整插件/所有选边分支已实机验证。不跑全套、无新测试工程，未再补跑。
- **剩余**：Battle.advance的自然推进、实际combined/撤离/胜负与自动结算、完整AI/能力插件、玩家交互窗和主画面接入。当前只有创建和加入真正落实；生涯仍未完成，HTTP NATIVE_WORLD_FRAME_UNAVAILABLE/readyForAuthority=false 不变。完整原版UI、势力/自创势力、殖民地、独立与合作联机仍在目标内。
- 验证子进程均已结束，暂存区为空；无桌面/键鼠/可见窗口、私人存档、子代理、提交推送或发布操作。


### Battle 自然帧实施前最小对照（2026-09-22）

- 原版0.98a-RC8：Battle.java:320–407（advance）、409–451（addFlash）、491–514（removeEmptyFleets）、551–555（visibility）、1267–1336（movement）；CampaignFleet.java:1142–1144/1273–1275；FleetData.java:345–347/904–911；BaseCampaignEntity.java:984–985；Misc.java:409–410/890–902/947–952；StarfarerSettings.java:1675–1680→prototype/Utils 快角度表。用户提供的原版主画面已查看，但没有可证明战斗闪光/结算UI的截图；本轮不改UI，实机验证仍待许可。
- 原版advance开头与正常末尾均清snapshot/primary/combined；done也先清，再返回。空舰队清理只在该侧进入时size>1执行，不移除玩家；isAlive取实际地点仓库contains，不用expired替代。战斗运动按同侧/异侧四次幂排斥、不同吸引倍率、原版float顺序与1024表快角度，不能普通atan2代替。javap647–652确认忽略Misc.normalise的返回值，零向量不能换成它返回的新(1,0)。
- 有轨道仍计算movement但不下发destination/facing；有空间站目的地偏移×4；fastAdvance超过100边缘距离则setLocation到第一舰队，不能用isFastForwardIteration代替。每舰添加0.1天battle_mod_flat/mult。结算tracker用days×clamp(FP比例,1,5)，空间站再×.25；flash用seconds，原版计算侧数后又强制倍率1。
- 当前差异：地点可识别Battle但advance整体缺失。本轮补真实自然帧、运动、显形、无效参战者清理以及默认地点脚本接线；自动结算/finish、当前地点动画管理器仍须实际实现，缺失分支继续报错，不以记录器/空效果宣称完成。保留规则服务替换点与明确未就绪状态。
- 验证：集中类型/相关文件lint及同一既有人员舰队场景，覆盖移动/轨道/fastAdvance边界、清理通知顺序、两个时钟、共享显形修正及保存续接；不跑全套、不新增测试工程。


### Battle 默认自然帧已接入（2026-09-22）

- 新增 OriginalCampaignBattleFrame.mjs/.d.mts：直接在实际Battle/舰队上推进，默认地点脚本将实时context传入advanceNativeBattleFrame。保留暂停跳过、防重入、首尾清snapshot/primary/combined、done先清再返，正常运动与显形不再需要整段advance替代回调。
- getMovementData使用现有原版1024角度表、逐步float32、同侧双倍吸引/双方四次幂排斥、敌方半径加权朝向与log长度；零向量忽略normalise新对象，原版轨道分支不写destination/facing，moveOverride仍由真实舰队setter决定。fastAdvance严格边缘距离>100才调用真实setLocation，不把fast iteration混用。
- removeEmptyFleets使用真实FleetData同步、原版进入循环时的size>1门禁与实际地点contains存活判断。先从侧列表移除，再通知fleetLeftBattle(engaged=true)，最后清fleet.battle；不将expired或stationMode=false误判为不存活/非空间站。
- 显形用现有MutableFleetStats.addTemporaryMod真实目标身份写入0.1天的flat1000/mult1及“在战斗中”。中性mult1在原版StatBonus不创建新修正条目，但临时修正记录仍存在；测试遵循此差异，不改成伪条目。结算tracker按days×[1,5]强度比、空间站再×.25；flash按seconds并保留intervalElapsed不消费语义。
- addFlash的前置/调度顺序已落实：取真实primary、只处理当前地点、执行但忽略viewport查询返回值、共享globalRandom决定数量和delay²，之后交实际动画调度服务。**这不代表已有动画管理器/粒子成品**；当前本地地点走到缺失动画调度、实际finish或resolveBattleRound都会明确报错，草稿拒绝保存。没有空结算或假成功。
- 集中检查一次通过：类型检查、9文件定向lint、唯一既有人员/舰队场景（32.46秒，测试进程32.87秒）。复用上一轮真实草稿，不新建测试工程：覆盖零/重叠移动、默认地点调用、轨道、空间站倍率、fastAdvance严格边界和独立flag、临时stat共享身份、暂停、空/失效舰队通知顺序、结算/闪光两个时钟与未消费interval、忽略viewport返回值的调度顺序、检查点恢复续接及缺失结算拒绝。记录器仅用于外部能力通知/结算触发/动画调度验证，不是这些功能的实现或原版实机证据。
- 检查点仍schema27，本轮没有新增历史根状态；验证进程已结束，未继续补跑。完整生涯仍未就绪：组合舰队/解除组合/撤出/战斗结束/实际自动结算、动画管理器与玩家交互窗口仍待完成，HTTP自然模拟关闭、readyForAuthority=false。全部原版UI、势力/自创势力、殖民地与独立合作联机范围保持不变。无可见窗口、桌面/键鼠操作、私人存档、子代理、提交推送或发布。


### Battle 组合/解除/结束：实施前最小对照（2026-09-22）

- 0.98a-RC8原版：Battle.java:453–482、520–548、823–894、1172–1208；FleetMember.java:278–304/382–392/590–602；FleetData.java:457–488/523–526；BaseCampaignEntity.java:794–795/910–914；ModularFleetAI.java:88–105。javap证实setFleetCommanderForStats第二个FleetData参数完全未使用，且相同Person会把statUpdateNeeded设false，不能“修正”为合并dirty标志。原版截图只证明主画面，本轮无UI改动，不冒充战斗窗口验收。
- 原版combined是新CampaignFleet，真实成员对象仍同时存在于源名单；成员getFleetData由最近列表同步决定。先玩家移到侧列表首位、选primary、lists-only、构造实际ModularFleetAI、共享memory，再设置姓名/指挥官/地点；逐舰继承指挥官统计覆盖、加入成员、首旗舰、ally与memberSource，空间站成员前置，最后refresh(false)。getTags在null时返回临时空表，addAll不应凭空初始化持久tags。
- uncombine不清combined或sourceMap，仅标记各来源dirty并恢复成员归属/指挥官覆盖；leave先删侧列表再恢复成员、dirty、通知能力、清battle，最后重新genCombined。finish先uncombine、胜方逐个leave→停速→保护/显形/AI站定，再计算玩家侧、败方同样处理，最后清侧列表设done；不能一开始批量清列表来省掉这些副作用。
- 当前缺口：只有自然帧，组合/退出/结束都是未实现服务。本轮落实这些原版对象操作与默认运行时接线；ModularFleetAI四类模块、实际伤亡解析器仍要求真实服务，不能用空AI/假胜负作为默认实现。会补自动结算编排，但不称伤亡解析器完成。
- 校验要区分实体舰队与曾经创建的combined：原版自然帧会把Battle.combined字段置null，不能因此将仍被实际成员/工厂引用的旧combined判成损坏。Web增加明确的组合对象身份注记（非原版历史状态），校验共享Battle、列表同步模式和非世界注册，不自动给旧对象补标记。
- 验证仍只扩同一既有人员/舰队场景，整块完成后统一类型、定向lint与该场景；不全量重跑，不占桌面、不用子代理、不提交发布。


### Battle 组合、解除、退出和结束已接默认运行时（2026-09-22）

- 新增OriginalCampaignBattleLifecycle.mjs/.d.mts，直接使用已有真实CampaignFleet构造、FleetData容器、Person/CharacterStats刷新和成员对象。genCombined保留玩家优先、primary选择、lists-only、共享Memory、原版getTags(null)临时表、姓名/指挥官/地点顺序、首旗舰/ally/成员来源、空间站成员前置与最终refresh(false)。combined不注册世界实体；不是DTO或重复造船。
- 为后续成员统计读取绑定实际继承指挥官到combined.statPeople查询表，不复制Person或偷换来源。javap确认setFleetCommanderForStats只写Person且相同Person会清dirty；保持第二参数未使用。FleetMember.getCaptain的玩家旗舰回退不要求当前FleetData本身是玩家舰队，原Roster封装已据此修正并提供getCaptain入口。
- uncombine按来源标dirty、清成员指挥官覆盖并恢复FleetData，不清combined/sourceMap；leave保留删除侧列表→恢复成员→dirty→可选devMode检查→能力通知→清battle→重新组合。finish保留逐舰退出的全部重组副作用、停速、3秒保护、显形、胜方STANDING_DOWN随机任务与败方7天玩家击败记忆，再清双方设done。仍不把组合指挥官的原版共享stats.fleetRef副作用擅自回滚。
- 默认自然帧现在调用实际finish与resolveOriginalBattleRound编排。后者清source→拍快照→组合→选解析器→resolve→双边AI选择→胜者/发生通知→清空舰队→结束/完成通知，保留重复getContext/getWinner调用和已知null解析器返回。**实际ModularFleetAI四模块及伤亡解析器仍未完成**；它们是明确必需服务，未添加空AI、假伤亡或成功收据。
- Web新增每个实际组合舰队的battleCombination身份注记；不是原版新增规则，也不回填旧历史。校验共享Battle/side、lists-only与不注册世界；支持原版自然帧清掉combined槽位后工厂仍持有的旧对象，以及战斗结束/脚本移除后保留对象。检查点schema27不变，成员/Memory/AI owner引用恢复和错误side标记拒绝均覆盖。
- 集中类型检查通过。10文件lint中的1个测试未用变量已移除、仅复查该文件。唯一既有人员/舰队场景先发现两处旧/新增夹具预期错误：退出现在先走非空能力通知，故首个缺失服务是readBattleAbilityKeys；空间站移除+索引插入会令member.fleetDataRef=null，CharacterStats.java:632起的无技能refresh并不保证立即sync，下一次实际membersCopy才重绑。按源码修正断言，未修改功能行为来迎合测试。只复查同一场景，最终44.57秒通过（测试进程45.27秒）；没有全套或新测试工程。
- 验证覆盖真实双向组合、原船/组合共享成员、首旗舰与玩家舰长、指挥官覆盖/同值setter、共享Memory与临时tags、空间站排除/前置、解除/退出、保存恢复/破坏引用拒绝、清transient后重新创建组合、逐舰结束保护与记忆、done脚本移除，以及解析器通知次序。AI构造、站点成员判定探针和解析器/通知适配器均明确为测试替身，不能作为完整AI/伤亡/实机证据。
- 检查进程已结束，暂存区为空；无桌面/可见窗口/键鼠、私人存档、子代理或提交推送发布。完整生涯仍未完成，HTTP自然模拟/readyForAuthority=false；原版UI、势力/自创势力、殖民地和独立合作联机目标全部保留。下一步需要真实AI/伤亡插件，不能靠编排通过就开启权威世界。


### 默认自动结算器：实施前最小对照（2026-09-22）

- 原版 0.98a-RC8：BattleAutoresolverPluginImpl.java:42–251/254–544/566–739；FleetMemberStatus.java:42–57/188–194/255–259/518–530/700–785；Misc.java:3866–3868；WeightedRandomPicker.java:107–114/193–211；combat/entities/ship/new.java:269–279；settings.json autoresolveDamageMult=0.25。界面只沿用已核查原版主画面证据，本轮改后台结算，不构造新战斗窗口、不宣称 UI 验收。
- 预期：非战斗民船/不能部署者不计作战强度；实际 hull/armor/flux/shield 统计决定护盾比例；相等强度第二方胜；逃跑与玩家追击的选舰/盟友/8倍倍率按原分支；加权伤害、先败后胜洗牌、胜方仅 combatReady 受损、真实模块装甲/船体/脱离，再形成实际共享成员战果。不能用 FP 比大小直接删船。
- 伤害不是简单 hull-=fraction：正常舰先一次整段伤害，再浮点 hits 次追加分段伤害；vastbulk 每次重设满船体；空间站主动/非主动模块连带脱离；底层先消耗全局坐标随机再可被 status.random 覆盖；装甲算法保留绝对网格奇偶分支与未累加 armorDamageTaken 的原版行为。
- 当前缺口：已有事故用 updateFromAutoresolveData 是另一个原版入口，不能拿它替代 applyHullFractionDamage。本轮新增实际默认算法和专用模块伤害，复用真实统计/成员/模块变体，不覆盖事故行为。Collections.shuffle 的独立随机流须明确注入，不伪装为 Battle.seed 或 Math.random；未知历史随机不默认 null。
- FleetEncounterContext 的 processEngagementResults、战后恢复/战利品/船员/后效与默认四模块 AI 仍有未移植部分，保留明确必需服务；本轮不以录制回调冒充这些子系统，也不自动跳过插件选择或开启 HTTP 自然模拟。服务替换保留扩展空间。
- 验证：扩展同一个既有人员/舰队场景，覆盖真实伤害和抽签/追击/战果，外部 context/AI 探针与真实算法清楚分开；整块完成后一次集中类型、定向 lint 和该场景，失败只复查对应范围。


### 默认自动结算核心与真实模块伤害已落地（2026-09-22）

- 新增 OriginalBattleAutoresolver.mjs/.d.mts：默认插件实例、民船/部署资格/实际统计的强度与护盾比例、监听器调整入口、双方撤离、相等强度第二方胜、先败后胜洗牌、加权伤亡、部署/后备/撤退/瘫痪名单和玩家追击。追击保留选择列表本身、选择船8倍强度/盟友参战、胜方零伤害、败方owner=1，且不偷偷执行普通战后处理。所有结果直接持有原成员/组合舰队，不用船只DTO替代。
- 新增 OriginalBattleMemberDamage.mjs/.d.mts，移植 ShipStatus.applyHullFractionDamage/applyDamage 及模块规则。保留浮点hits循环、整段加分段伤害、vastbulk、主动模块和相邻装饰脱离、状态别名首次索引。javap核实全局随机坐标先消费再可被status随机覆盖，装甲绝对坐标奇偶、除以armor而不额外乘15及未写armorDamageTaken确为原字节码，不是反编译错误。原事故用updateFromAutoresolveData入口未改变。
- 原版公开资源导入器提取532项舰体的船体/装甲/护盾数据，保留来源hash与皮肤shieldEfficiency覆写。新造成员/惰性状态明确random=null；旧捕获缺字段仍需实际服务，不回填猜测。Math.random与Collections.shuffle是分离流，后者必须由实际持久化持有方提供，未复用Battle.seed或全局流凑数。
- NativeCampaignRuntime提供实际默认解析器创建/执行及玩家追击入口，并接已有BattleRound的默认resolve/readContext/readWinner服务。**没有跳过原版插件优先级选择**；pickBattleAutoresolver仍必须由真实插件路由提供。FleetEncounterContext完整伤亡应用/CR/船员/战后恢复/战利品/后效、默认ModularFleetAI四模块仍待完成；所需context服务明确失败而非空回调成功。
- 集中类型检查一次通过，11文件lint零警告。唯一既有人员/舰队场景首次在新增夹具前向引用moduleShip处失败（约19.65秒），将模块检查移到它原有的真实构造之后，未改变功能代码迎合断言；只复查该文件lint和同一场景，最终34.55秒通过（进程34.96秒）。没有全套、新测试工程、额外实机/截图。
- 验证实际普通/模块舰伤害、浮点重复命中和双随机消费、无伤重置、未知历史拒绝、真实强度与不可部署、空间站权重、追击选舰/盟友/8倍、共享战果、伤后保存恢复、相等强度选边、双撤离/零强度早退。context/AI/监听器顺序适配器明确为测试探针；不以此声称完整战后回收、掉落、舰队AI或原版实机已通过。
- 暂存区空、后台验证结束。无桌面/可见窗口/输入/私人存档/子代理/提交推送发布。完整生涯目标active，schema27和readyForAuthority=false不变，主画面、完整世界、势力/自创势力、殖民地、独立与合作联机仍未完成。


### 遭遇战果落地：实施前最小对照（2026-09-22）

- 原版证据：FleetEncounterContext.java:66–154/176–374/667–741/2109–2478；FleetEncounterContextPlugin.java:54–229；FleetMember.java:373–375/658–676/839–844；RepairTracker.java:243–277；CrewComposition.java:25–51/93–96；CampaignFleet.java:1180–1186；FleetData.java:320–325/508–526/741起；CargoData.java:191–228/606–650/670–711。原版截图未覆盖战后窗口，本轮只后台状态，不另造界面。
- 原版顺序：过滤无来源成员→实际战斗报告/部署图→先双方失舰，再双方CR，再双方船员；记录战果/阵营侧状态后uncombine/genCombined。原来源表仍保留阵亡舰，不能先删除映射；移除原舰队和组合名单分别调用，不能用删DTO代替。
- 船员损失每舰读取后重置损伤计数；后备舰先重置；disabled/destroyed清空船上crew，玩家有可回收部分。CrewComposition.transfer只转crew且先Math.round，不按陆战队比例分摊；玩家展示损失保留原浮点，实际货舱扣int。getCargo会真实sync/重新分配船员，不能缓存无同步货舱绕过。货物crew标脏在partials处理之后。
- CR事件二参数入口追加而不合并，按原值写事件再把base CR限[0,1]；部署成本含战机数量；胜方preCR保留存活名单快照；postVictoryRecovery按DP/损失计算及百分之一舍入，full_cr_recovery标签走maxCR差值。原版局部prevCR赋值未用于限幅，不擅自补限制。
- 当前差异：只有伤害/战果对象，context全为外部接口。本轮实现真实上下文/侧数据、战果处理、CR/船员、胜后CR恢复和船员回收，接默认运行时；原版战术战斗详情(non-null deployed/CombatDamageData)、玩家事件监听、可见毁舰动画和完整战利品/战后声望经验仍要求真实服务，不以空回调冒充。上下文状态与可重绑方法分开，避免把函数写进检查点。
- 验证沿用唯一既有人员/舰队场景，集中类型/定向lint/该场景，不全量/不建测试工程。目标仍完整生涯，不能因这个后台切片完成就开放未完整世界或提交发布。


### 遭遇战果真实落地与集中验证（2026-09-22）

- OriginalEncounterState / OriginalFleetEncounterContext 将真实上下文状态与方法绑定分离，侧数据复用同一 facade 身份；脱离战斗的临时侧不注册。默认 Runtime 上下文已不再依赖战果录制器。战利品 Cargo 由现有工厂创建且 carryingFleetRef=null，只使用 Web 图身份分配，不消费原版 Sector UID。
- OriginalEncounterLosses 按原版顺序把阵亡/瘫痪舰从来源和组合舰队名单移除，保留 memberSource；再写真实部署/停机 CR 事件、船员伤亡、胜后现场维修及船员回收。舰船详情仍共享原对象，不把结果变成脱离世界的 DTO。新造 CrewComposition 明确 marines=0；脱离舰船的 AI 船员豁免须满足原版 fleetData 非空条件。
- Cargo 的 crew 标脏挂点位于 partials 累计及早退之后；每舰取 cargo 都走真实 sync，保留重新分配船员的原副作用。CR 二参数事件原值追加（不按文案合并），只限幅 base CR；回收人员不擅自清除原版未清的记录。full_cr_recovery 标签来自公开舰体/皮肤资源，皮肤标签按原版清空重设而不是继承。
- 本轮静态复核后集中执行一次：tsc -b 成功；19 个相关文件 oxlint 零警告/零错误；唯一既有人员/舰队场景成功，场景约34.82秒、进程约35.23秒。三项均首次通过，没有再跑、没有全套、新测试工程、实机窗口或桌面输入。
- 已直接核验该场景覆盖：报告前过滤无 source 舰、来源表和双方 casualty 身份、原舰队/组合名单真实移除、CR/crew 实际变化、损伤计数归零、胜后恢复舍入和不添加虚构 preCR 上限、回收 Cargo 副作用、上下文独立图重绑身份，以及 Runtime 保存恢复后的阵亡/CR/舰队成员身份。第二段默认自动结算确实使用本轮真实上下文，恢复产生“现场维修”事件；AI、报告和 after-effects 是明确探针，不能借此声称它们完成。
- **边界不变**：上下文自身尚未注册为 Runtime 持久检查点根，独立图编码成功不等于玩家交互窗口可随存档恢复；只有真实成员/货舱/名单副作用随当前 Runtime 保存。完整战利品/autoLoot、声望经验等后效、非空战术部署详情/伤害聚合、实际玩家监听、可见毁舰动画仍需真实实现。fighter repair 有实现入口但不插到原版未调用的阶段，也未以本场景宣称全部战机分支已验收。
- 完整默认 ModularFleetAI、权威世界/主画面接线、原版UI、势力/自创势力、殖民地及独立/合作联机仍未完成。readyForAuthority=false 保持，不以局部场景冒充完整生涯。后台验证进程已正常退出；暂存区仍空，无子代理、私人存档读取、暂存提交、推送或发布。


### 战利品货物损失与自动分配：实施前最小对照（2026-09-22）

- 原版证据：FleetEncounterContext.java:1485–1505（贡献度）、1607–1615（清空/生成/排序）、1765–1884（货物损失）、2051–2106（分配）；CargoData.java:296–415/448–463/540–650、CargoItemStack.java:114–164/206–235/299–356、WeightedRandomPicker.java:107–125/193–211。新货物规格来自本地0.98a-RC8公开CSV/配置，不读私人存档。用户截图不覆盖战后拾取窗口，本块只后台真实状态，不改UI，窗口待核实。
- 预期：按损失舰船原来源货舱累计容量比例；被回收舰优先用origSourceForRecoveredShips映射。实际逐堆扣货，保留Math.round/float与独立Misc.random顺序；船员和陆战队不重复扣，玩家SPECIAL及no_loss_from_combat商品受保护。损失数量与捞回数量不同，不使用等价转移假设。
- 自动分配以胜方实际FP加权，普通货与燃料分别重建picker；装不下只移除该舰队并跳过当前堆，不重抽；不会从loot中删除已分配物品。javap已确认燃料分支竟使用getMaxCapacity-getFuel并除cargoSpacePerUnit，按真实字节码保留，不擅自改为maxFuel。默认picker与分配比例用Math.random的double流，货物损失用salvageRandom或独立Misc.random的float流，不能混同。
- Cargo排序重建实际堆叠、保留partials和origSource，不只是显示行排序；资源、武器、战机、特殊物品按原版枚举/比较器。特殊物品创建插件需要真实初始化服务，不用无行为物品绕过；武器和战机直接使用公开规格。玩家完整装备/随机掉落生成仍需后续移植，不把本轮货物路径称完整战利品。
- 同时发现上一块performPostEngagementRecoveryBoth漏除2；原源码和javap一致要求两侧恢复量的平均值，本轮修正并纳入同一现有场景。整块完成后仍只一轮类型、定向lint、一个既有场景。


### 实际货物战损、回收和自动分配完成（2026-09-22）

- 新增 OriginalNativeCargo.mjs/.d.mts：实际Cargo物品合并、直接堆叠扣减、清空与原版排序；支持资源、武器、战机的真实新堆，特殊物品新建仍要求真实插件初始化，不复制空DTO冒充。直接CargoStack.add保留零堆、不走removeItems/partials；排序重新建立堆并指向原Cargo，保留资源partials、credits与origSource语义，有mothballedShips时必须调用真实排序服务。
- 新增 OriginalEncounterLoot.mjs/.d.mts：按损失舰船原来源/回收前来源货舱统计容量比例、逐堆实际扣减和回收；玩家特殊物品与no_loss_from_combat商品保护、船员/陆战队排除、同侧参战贡献度及货物概率已移植。来源舰队/货舱/成员保持对象身份，货舱获取仍实际同步，不以静态库存副本代替。
- autoLoot保留FP加权、两遍picker、选择到满舱后移除且不重抽当前堆、double随机系数及long→float舍入。原版不会清空被分配的loot；燃料使用maxCapacity-getFuel（含extraFuelUsed）和cargoSpacePerUnit，javap核实后照实保留，不擅自套用maxFuel。货物抢掠使用salvageRandom或明确独立的Misc.random接口，不与Math.random合流或伪造历史随机。
- 默认context已接generateLoot/autoLoot，保留原外部规则覆写服务；非玩家胜利的默认generateLoot实际执行货物抢掠和排序。玩家胜利仍需generateEncounterPlayerLoot真实装备/随机掉落服务，未以仅货物分支冒充完整玩家战利品。增加getLoot、salvageRandom、贡献度及cargo处理接口，便于下一块继续接玩家流程。
- 修正performPostEngagementRecoveryBoth此前漏除2的问题；原版源码与字节码均为双方恢复量的平均值。公开资源导入补上CargoItemStack来源hash、salvageCargoFraction及武器/战机/特殊物品货舱规格；导入跳过翼装CSV中无id空行，不猜不存在的variant。现有reference覆盖532舰体、452来源。
- 集中验证仅一轮：tsc成功；10文件定向lint零警告/零错误；唯一既有人员/舰队场景约34.82秒通过（进程约35.22秒），无重跑、全套或新工程。场景覆盖原来源覆盖映射、资源/武器/战机损失与回收的真实数量及随机进度、保护人员/核心、排序共享所有者、按FP给实际胜方加货、loot保留、原版燃料非油箱上限行为、物品所有者与货物的Runtime保存恢复、有限堆合并/partials以及特殊插件缺失明确失败。原版实机/战后窗口未验，不声称UI等价。
- 仍未完成：完整玩家装备与额外随机掉落生成、经验声望等后效、默认ModularFleetAI、战术详情与窗口、权威世界主画面、势力/自创势力、殖民地、独立/合作联机。遭遇上下文与其salvageRandom尚非Runtime持久根；只验证实际舰队/货舱副作用的保存，不将外接随机服务说成已接完整世界。readyForAuthority=false；后台验证已正常退出，无桌面操作/子代理/私人存档/暂存提交推送发布。


### 玩家装备掉落与基础打捞：实施前最小对照（2026-09-22）

- 证据：FleetEncounterContext.java:799–818/1626–1758/1891–2048；HullVariantSpec.java:380–393/454–460/966–967/1439–1442/1629–1641；DynamicStats.java:44–55；Misc.java:488–489/1885–1886/2473–2483/4581–4582；HullModItemManager.java:129–139/210–230；ModSpecItemPlugin.java:42–45/90–108/158–175；RepairGantry.java:23–35/103–137；BaseSalvageSpecial.java:76–86/97–107/126–128，SalvageEntity.java:673起。原版战后拾取窗口截图/交互仍待核实，本轮不另造UI。
- 按真实variant的HashMap顺序选择非内置武器；战机索引只对非空ID递增。保留alreadyStripped与consistent_weapon_drops的随机短路、同武器多槽行为、no_drop和模块递归（使用父member进行舰长/舰型判定，不制造子舰）。舰长来自真实getCaptain生命周期，AI核心恢复/可能回收及不可移除记忆按原键读取。
- 插件先判requiredItem两次随机，再判芯片两次随机；已知插件、hidden、hiddenEverywhere、no_drop只在原位置过滤。原生默认getRequiredItem来自HullModEffect接口返回null；有覆写时需真实服务，不把未知mod当null。ModSpecItemPlugin的初始化/价格/名称/学习状态和动作逻辑可落地，渲染与完整提示仍待原版UI对照。
- 玩家打捞先按舰体/武器组签名派生每舰随机（Java hash和long溢出），再分出11/17/31层随机；ownCasualties沿用上一轮舰船随机直到循环结束，不能提早恢复origSalvageRandom。基础收益受实际难度/舰队统计/RepairGantry/贡献度影响，信用点只记录creditsLooted，不在生成阶段发进玩家账户。额外掉落/记忆货物和敌方库存处理必须保持清除、通知及随机顺序。
- 本轮实现实际装备掉落和基础玩家生成，接默认上下文；非空通用SalvageEntity掉落组、HullModItemManager真实实例/注册、玩家知识/难度和事件仍需权威服务，不能用空回调或空列表绕过。整块结束集中类型、改动文件lint和唯一既有场景；全生涯目标不变。


### 玩家装备掉落与基础打捞接通（2026-09-22）

- 新增 OriginalEncounterEquipment.mjs/.d.mts：非内置武器、舰载机、插件芯片、核心恢复/掉落及模块递归；保持真实variant顺序、duplicate-slot/consistent-weapon行为、alreadyStripped与no_drop短路和概率读取。HullModItemManager返还算法操作绑定的真实安装记录，移除已返还项并清理空列表，但管理器的权威实例/注册仍须由世界服务提供，不默认捏造空管理器。
- 新增 OriginalEncounterPlayerLoot.mjs/.d.mts：玩家胜利的装备循环、Java字符串签名/long溢出每舰随机、11/17/31层后续随机、贡献度、难度、信用点和20/10/10/1加权基础物资、燃料增益、额外记忆货物合并/清除/报告、最后库存抢掠。creditsLooted只记录待发信用点，不在生成时发钱。RepairGantry舰型效果已补入真实成员统计，战后收益用实际当前CR/停用状态与递减公式。
- 新增 OriginalModSpecItem.mjs/.d.mts，默认Cargo可创建真实modspec初始化状态并绑定价格/名称/设计来源、已知判断、声音→学习→提示动作顺序；排序重新创建插件并保持stack回指。未移植的其它特殊物品仍要求真实插件；芯片render/tooltip明确需要UI服务，知识和声效测试注入不能被描述成玩家界面/权威知识系统已接完。
- Runtime默认提供实际getCaptain（附属走现有roster，脱离舰保留Person身份且不凭原来源重绑）与模块stockVariant读取。context已默认调用玩家基础打捞，保留完整生成覆写和小规则服务。公开配置导入现在含掉落概率/标签、129项插件的耗材继承判定和打捞起重机常量，532舰体/595来源；6项自定义耗材效果仍要真实插件调用，TowCable的接口默认null已按源码确认。
- 源码复核特别修正：模块slot先取快照，但每个moduleVariant到递归时才解析，避免提前加载后续模块；双方dropRandom/dropValue先全部复制再清除，即使脚本让两字段共享一个List也不漏掉第二份。BaseCampaignEntity原版null掉落getter返回临时空列表，不能把null偷偷替换为持久[]；实现和场景均保留这一点。
- 验证：集中tsc通过、14文件lint零警告/错误、唯一既有人员/舰队场景首轮约35.87秒通过。随后源码时序复核发现上述两点，修正后仅复查3文件lint和同一场景，最终约35.61秒通过（进程约36.05秒）；没有全套、新测试工程或UI实机窗口。测试实际覆盖重复武器/禁掉落装备/空战机位、已剥离随机不消费、插件四次概率和真实chip生成/排序回指、核心禁止/保证掉落、Java派生随机/签名溢出、默认玩家基础生成/credits未发放、extra记忆清除后通知、额外Cargo不转移、原版null列表、上下文独立图身份、起重机实际统计及Runtime健康检查点。非空掉落组测试只用显式generator探针验证双列表转交时序，不声称组解析算法已实现。
- 未完成边界：完整SalvageEntity非空掉落组、6种耗材/其它特殊物品插件、HullModItemManager权威实例、玩家知识/难度/监听器的世界绑定、经验声望后效、默认ModularFleetAI与战术详情。上下文/其loot和随机仍未挂Runtime存档根，独立编码不是玩家拾取窗口恢复；实际敌货舱与被清除的extra记忆等世界副作用沿用Runtime存储。原版主界面、完整权威世界、势力/自创势力、殖民地与独立合作联机目标保持；readyForAuthority=false，不因基础打捞通过而开放半成品。
- 无桌面操作、子代理、私人存档读取、暂存提交、推送或打包发布；后台验证均正常退出。


## 战后经验与后效：实施前最小对照（2026-09-22）

- 原版证据：0.98a-RC8 FleetEncounterContext.gainXP/gainOfficerXP (1384–1542)、applyAfterBattleEffectsIfThereWasABattle (603–664)、addPotentialOfficer (1544–1605)；CharacterStats.addXP/levelUpIfNeeded、故事点阈值及spendStoryPoints；OfficerData.addXP；Misc.getBonusXPForScuttling与forgetAboutTransponder；LevelupPluginImpl及OfficerLevelupPluginImpl；CampaignGameManager 1912–1918经验字段别名。反编译双重玩家条件用javap核对，不擅自修成原版没有的保护。
- 预期：损舰S-mod返还先于普通经验；按敌方伤亡FP、舰长等级、难度和实际贡献发经验；军官按部署时长分摊且仍在玩家名册才获得，雇佣兵不获经验，军官待玩家选技能、不自动升级。人物经验、额外/递延经验、技能/故事点直接写真实CharacterStats共享对象，long以十进制字符串精确保留。满级经验回绕和故事点阈值保持原版。后效按经验→潜在军官→弹药/停速→盟友记忆→事件→退场→AI重评顺序。声望是独立adjustPlayerReputation入口，不塞进after-effects。
- 当前差异：CharacterStats只有等级和技能效果，未捕获经验标量；遭遇后效仍整体要求外接。旧未捕获经验不默认为零；新构造按原版初始化。真实S-mod日志、升级消息/音效、军官技能选择与晋升Intel、世界事件仍需真实服务，不以空回调或DTO冒充。
- UI证据：本轮重读用户提供的acc5b25f原版截图，为综合管理/殖民地页，不含经验和战后拾取窗口。只移植后台规则与状态，不改UI；战后文字颜色/布局、升级点击/关闭和联机回执待原版画面对照。
- 验证：整块后统一类型检查、改动文件lint及唯一既有人员/舰队场景；检查实际共享统计、随机与副作用时序及保存恢复，不新建测试工程、不跑全套、不占用桌面。


## 战后经验与默认后效接通（2026-09-22）

- 新增 OriginalCharacterExperience：真实CharacterStats经验/额外经验/递延经验、故事点阈值、技能点、满级回绕；signed long十进制保存并按Java long溢出，涉及float的换算保留float舍入。原版满级三倍消耗额外经验；达到满级加入递延经验但不清deferredBonusXp标量，保留原源码行为。新建人物初始化完整字段，旧薪资捕获缺字段仍未知，不补零。公开配置/等级表加入已有导入脚本（600个来源hash）。
- 原存档捕获增加xp/bx/db/x2/pt/sp别名，以及Person.fleet和可用的OfficerData技能选择字段；完整标量通过原CharacterStats验证，捕获时不丢超出JS安全整数的经验值。仅使用合成存档夹具，未读取私人存档。
- OfficerData真实经验：雇佣兵跳过、部署比例和参与人数分摊、名册身份检查、上限裁剪、消耗额外经验、提示时序、准备选技能而非自动升级。上限Memory覆盖及舰队指挥官修正；源码复查纠正getMod必须分配真实共享目标，不能用不分配的getValue代替。技能pick函数仍要求实际选择服务，场景中仅用显式技能探针检查时序，不声称技能抽取已经移植。
- 遭遇gainXP先读取实际S-mod安装记录按member身份计算损舰额外经验，再依FP/舰长等级/难度/贡献发放普通经验；可改规则服务保持独立。默认after-effects已替代原整体必需回调：潜在军官概率、未交战弹药和站点站定、存活船弹药清空与停速、盟友应答器记忆及require链清理、玩家参与度、战斗报告、空舰队真实退场、AI重评调用。javap 314–344等偏移确认交战分支isPlayer || !isPlayer不会写noEngaging；没有擅自“修复”原版。声望依旧是独立adjustPlayerReputation入口，本块不把它混入后效。
- Runtime默认绑定真实玩家统计、军官名册、Person.fleet指挥官查询及despawnNativeFleet。经验/故事点/名册和退场副作用随真实Runtime检查点保存恢复；遭遇context/loot本身仍不是Runtime根。

### 本块验证与明确边界

只使用原有native personnel rosters drive场景。类型检查一次通过，16文件定向lint一次通过；场景先发现旧“后效未实现”断言，以及复用夹具仍保留默认非玩家指挥官、货物测试补舰两项前置条件，修正这些夹具后同场景通过。源码复查发现getMod分配语义后只复查2文件和同一场景，最终36.13秒通过。未跑全套/新建测试工程/操作桌面/使用子代理，后台进程均已结束，暂存区空。

已验证：精确long捕获/溢出；默认等级表；升级与故事点音效事件顺序；满级回绕/额外经验倍率；真实损舰额外经验与军官部署分摊；雇佣兵/离职名册保护；军官上限与技能队列边界；教程仍消耗一次晋升随机；真实盟友Memory清理、弹药、停速、退场及Runtime经验保存。

未完成：实际升级消息/音效消费者和原版布局、完整S-mod日志权威根/绑定、完整军官技能选择插件、成功晋升PromoteOfficerIntel与IntelManager、战斗事件监听器默认业务、默认ModularFleetAI判型/战术重评、独立声望入口、战术部署细节/军官时间默认统计、玩家战后窗口；这里的UI/日志/技能/教程/AI服务探针不能当这些世界业务已实现。潜在军官成功分支仅按源码接入实际构造/注册服务，未拿教程分支的通过宣称成功晋升已验。

仍readyForAuthority=false（schema27），默认完整权威世界和CampaignApp未闭合；完整势力/自创势力/殖民地与玩家独立/合作联机继续保持目标。不暂存、提交、推送、打包或发布这部分。


## 战斗声望与真实双向势力关系：实施前最小对照（2026-09-22）

- 原版0.98a-RC8证据：FleetEncounterContext 443–584及778–792；CoreReputationPlugin 30–139、354–394；Faction 1450–1545/1709–1776；FactionManager.getRelation与Relation.setValue；RepLevel.getLevelFor/getRepInt；CampaignEngine 2201–2229；Misc.setFlagWithReason/makeLowRepImpact；Battle.knowsWhoPlayerIs。
- 预期：仅玩家参与且交战后、一次性声望入口；先停止移动，按识别、追击/严重损伤选择敌方影响，低影响向敌方快照写永久reason；按战前双方FP/贡献/总伤害分级援助，非当前盟友不奖励，但已退出盟友仍可因误伤受罚；每势力去重，伤害map仍按真实Faction身份读取。声望由原版Relation修改，不只是通知回调。
- 关系底层：FactionManager原键为idOne+'_'+idTwo，双向键指向同一Relation；仅在完整真实manager里懒创建同势力1/异势力0，旧未捕获关系绝不据此假装世界中立。Faction的ensureAtBest/ensureAtWorst与独立Relationship不同，需分别实现。等级由百分比取整决定，不按裸浮点阈值。未知插件/其它动作保持显式边界，允许大改覆写。
- 当前差异：现有势力文件只是定义/构造与只读关系投影；无真实可保存FactionManager关系根，遭遇无adjustPlayerReputation。将接实际共享manager根及Runtime事务/保存，再挂默认战斗声望链，不先构造虚假的完整初始外交。
- UI：已阅用户原版截图主要是目标信息与综合管理/殖民地页，不含战后声望文字。此次只迁移后台关系与消息/事件顺序，不改原版布局；原版战后颜色、文字排版与实际交互仍待核实。
- 验证：整块完成后一次类型检查、定向lint及唯一既有人员/舰队场景。核实真实关系对象、身份/双向共享、保存恢复、交战幂等、低影响reason及误伤阈值；回调探针不等于消息UI或全部声望监听业务。


## 战斗声望与真实双向势力关系：实现及收尾（2026-09-22）

- 新增 OriginalRelationships、OriginalCoreReputation、OriginalEncounterReputation。真实可保存 FactionManager 关系根保留双向共享 Relation、原版字符串键（含下划线碰撞）、百分比取整和 Faction/独立 Relationship 不同的 ensure 语义；没有绑定完整关系根时，不把缺失外交当全世界中立。
- 遭遇独立 adjustPlayerReputation 入口已默认接入 Runtime：玩家参与且交战才锁一次性标志；真实停止移动；识别/追击与低声望影响选择；战前 FP、贡献和总伤害划分援助；当前侧退出者不获援助但仍接受误伤惩罚；误伤表按 Faction 对象身份，不按相同 ID 合并。noRepImpact 仅压敌方，低影响通过实际 Memory require/reason 传播。
- 默认 Core 插件处理战斗与 CUSTOM；消息先于声望监听通知，监听名册按 saved/transient/timed 快照顺序分发。javap 偏移 1417–1451 已交叉确认原版直接比较 RelationshipTarget wrapper 与玩家 Faction/Person 的引用，没有擅自解包改变行为。其余声望动作仍要求实际规则服务。
- Runtime 默认敌对/友好查询共用当前关系根；绑定后，新商品网络 capture 和移民读取也改用真实外交及登记势力名单，不擅自清缓存。后两者本次只核查接线，未新增经济行为断言，不声称已专项验收。
- 检查点升级 schema28，关系根进入循环图编码，舰队与登记 Faction、双向 Relation 保留共享身份。schema27 迁移为未知 null；恢复拒绝同 objectRef 被拆成两份 Relation。尚无原存档 FactionManager 自动捕获和完整新世界初始外交生成；现阶段需显式绑定真实 manager，测试中自定义三势力是明确合成夹具，不是正式世界初始化。

### 本块实际验证（已结束，不重复全套）

类型检查一次通过；13 个本块文件定向 lint 通过。只运行既有 native personnel rosters drive 场景：先修正旧版本合成存档降级时未删除 schema28 新字段的问题，再补齐三势力夹具的 entity.factionRef；这些是测试前置条件修复，没有放宽生产校验。只定向复查同场景，最终 39.29 秒通过，修正文件 lint 通过。其他旧版本夹具作同一字段清理，但未为此跑其它场景。

本次场景直接验证：关系数值/限幅/等级、双向身份/键碰撞、默认插件选择和不变声望行为、追击 -.55、援助与小贡献降级、低影响 reason、noRepImpact、已退出盟友误伤/严格边界/严重误伤、对象身份、未交战与开战时参与、幂等、消息与监听时序、Runtime 存档恢复和旧根迁移。尚未专项验证多舰队同势力去重、总伤害分级所有边界及真实 UI；记录回调仅证明顺序，不证明消息呈现或监听业务完成。

没有操作桌面、启动可见窗口、使用子代理、读取私人存档、新建测试工程或跑全套；本轮验证进程已结束。完整生涯仍未完成，readyForAuthority=false。下一步须推进真实世界/玩家交互接线而不是把离线场景通过当作交付；完整原版 UI、独立/合作联机、势力/自创势力与殖民地仍在目标范围。生涯内容不暂存、提交、推送、打包或发布。


## 遭遇上下文进入权威持久根：实施前最小对照（2026-09-22）

- 原版0.98a-RC8：FleetEncounterContext 65–105保存战斗、双方DataForEncounterSide、伤亡/军官部署、恢复船、loot、creditsLooted、随机与alreadyAdjustedRep；FleetEncounterContextPlugin 54–76为侧数据真实引用。FleetInteractionDialogPluginImpl 71持有context，176–211绑定/生成Battle，1144–1180结算后离开，1363–1404清理，1645–1684先声望、生成掉落、lootedCredits门闩后支付信用点。
- 预期：玩家交互使用同一个上下文直到流程结束，重绑方法不重新分配loot、不重抽随机、不清理声望门闩；双方舰队/成员/军官仍指向世界图中的原对象，已经结束并从location移除的Battle也可由交互持有。原版对话自身另有lootedCredits等门闩，不能把仅保存context称为完整对话恢复。
- 当前差异：上下文仅外部临时facade；每条服务器命令恢复世界后遗失外部引用。新增显式服务器持有登记根并随现有Worker/SQLite事务保存，释放登记不自动执行结算、支付或退出Battle。此根是Web重连/多请求所需持久化，不宣称原版支持保存正在显示的交互窗口，不更改玩家操作或全局暂停规则。
- UI：已有原版截图没有证明战后拾取/断线恢复状态；本次不编造新面板或改布局。textPanelForXPGain是原版临时UI引用，必须按原版结算结束清空才能存档；实际对话阶段、lootedCredits与消息重建后续还要接。
- 验证：扩同一既有人员/舰队场景，检查上下文/loot/随机/身份随Runtime及现有服务事务保存、结束Battle仍可恢复、释放不结算、拆分共享身份被拒绝。整块结束集中一次类型/改动lint/相关场景，不另起测试工程。


## 遭遇持久根实现与实际服务器验证（2026-09-22）

- Runtime增加显式Web持有登记根（schema29）：每个拥有舰队保留一个context，重复保留同一对象复用ID，不分配第二份loot；可按ID重新绑定方法。默认AI/临时上下文不自动登记，避免把每次AI自动战斗无限保留。登记/释放只负责持久引用，不隐式开战、结算、支付、离开或暂停世界；登记的owner也不是已完成的多玩家规则隔离。
- 真正的context进入同一检查点图：战斗与两侧舰队、伤亡成员、部署数据、恢复船来源、货物/插件/stack循环、待发信用点、salvageRandom、alreadyAdjustedRep均保留。不重构结果DTO、不重抽随机，也不在恢复时触发generateLoot。方法与UI对象不序列化；textPanelForXPGain未清空时明确拒绝保存。
- 已结束且从location脚本表移除的Battle仍可被登记上下文持有、验证及重绑。对新鲜未登记Battle继续要求真实location注册，不能拿任意克隆战斗代替当前世界。释放后旧的重新绑定方法不能再执行；不会在release内偷偷支付信用点。
- 新增状态校验及共享身份检查：成员必须来自同一memberFactory、侧舰队/恢复来源必须是同一真实舰队，登记FactionManager存在时检查其实际Faction引用。首次相关场景指出不能把旧世界里的重复势力构造捕获一概当作完整FactionManager；已修正这项过度校验。完整关系manager的身份约束没有放宽，未知外交也没有补造。
- schema28及更早的Web版本尚无这个登记功能，迁移只加入空Web登记根，不声称恢复了原版对话或补出遗失的战利品。旧版本合成夹具相应删除schema29字段。

### 实际验收

一次类型检查与5个改动文件lint通过；只扩同一个既有native personnel rosters drive场景。复用已有的真实玩家装备/基础/额外掉落结果，不另造展示cargo：Runtime往返保持slots、stack.cargo、modspec.plugin.stack、随机和待发信用点；拆开成员身份被拒绝；临时XP panel不落盘；旧版迁移不制造context；已结束Battle移出脚本表后仍恢复；声望门闩在重绑后仍阻止重复结算。

同一场景通过现有CampaignService→Worker→Repository→SQLite：装载上述含掉落的世界，实际提交下一条导航指令、提交检查点，关闭/重启服务，再从受信备份入口恢复，确认context、掉落、随机、待发信用点和新目的地同时保留。上下文没有通过HTTP导出。修正上述构造捕获校验问题后，仅复查Runtime lint和同场景，最终45.32秒通过；未重跑类型/全套/另建测试工程。所有本轮进程已结束，未占用桌面或启用子代理。

### 未完成（不能用本轮替代）

本次仅完成context/loot进入权威持久根，不是整个FleetInteractionDialogPlugin：实际选项状态、lootedCredits门闩、recoveredShips/cleanedUp等对话字段、付款/货物领取命令及授权、消息重建和原版战后窗口尚待接入。战术运行对象/非空runningDamageTotal和所有部署记录形态没有因本次普通掉落场景通过而视为已验；主CampaignApp也仍未挂完整原版权威世界。完整势力/自创势力、殖民地、独立/合作联机继续保持目标，readyForAuthority=false，不暂存提交、推送、打包或发布。


## 战后领取/退出控制流：实施前最小对照（2026-09-22）

- 原版0.98a-RC8 FleetInteractionDialogPluginImpl：1645–1703为胜利路径在战利船恢复检查之后的声望/掉落/信用点/选项阶段，1238–1272为CONTINUE_LOOT与关闭回调，1144–1185为LEAVE/CONTINUE_LEAVE，1342–1407为记忆/战斗清理；FIDConfig默认值2821–2853。已读前置winningPath 1518–1644：击败触发器、船员救援、恢复船选择不可被本段默默跳过。
- 预期：lootedCredits在生成与delegate后、显示/付款前置true；信用点在打开拾取窗口之前支付，不是点击拿取后支付。config.salvageRandom先抽nextLong分离11层流，generateLoot后回写分离流。无有效玩家舰队时仍锁生成门闩但不付款。零size非NULL货堆仍使CargoData.isEmpty为false（CargoData172–180/CargoItemStack.isNull）。有效玩家舰队必须至少一艘非自动、非战机、舰长可移除的船（CampaignFleet1277–1282/Misc4581–4609）。
- 关闭拾取窗口：经验/后效→清XP文本引用→恢复字体→cleanUpBattle→关闭/恢复原面板→delegate通知；手动离开先声望，可先呈现CONTINUE_LEAVE，并由后续点击继续，不能自动连点越过。清理门闩必须持久化，保留ongoingBattle、pulledIn、harryEndedBattle等真实分支。
- 当前差异：已持久化context不包含原对话lootedCredits/cleanedUp等控制字段。本轮补可持久的原版战后阶段及Runtime重绑/动作入口；进入胜利后半段必须由真实上游恢复阶段驱动，不能对任意战果自动宣称已经完成触发器和船只恢复。实际文本/visual仍使用可绑定原版接口，未实现消费者不得称UI已完成。
- UI证据：本轮重新查看用户a6f03cc9原版截图，实际是舰队管理页，不含战后拾取/离开回调；故本块只改后台原版控制流，不用该图编造战后布局。
- 验证：整块结束集中类型/改动lint及同一既有场景，验证实际一次性付款、config随机、打开顺序/关闭门闩、战斗清理与共享图恢复；界面探针不等于真实原版窗口验收。


## 战后付款、拾取关闭与离开控制流已接（2026-09-22）

- 新增OriginalFleetInteractionAftermath，迁移的是FID winningPath在击败触发器/船员救援/恢复船选择之后的尾段，以及CONTINUE_LOOT关闭回调、LEAVE/CONTINUE_LEAVE和cleanUpBattle。初始遭遇/规则触发/恢复船上游没有因此被假装实现；进入胜利尾段必须提供实际完成的上游进度，未知/未完成会拒绝继续。
- 默认有效玩家舰队判定移植CampaignFleet.isValidPlayerFleet：同步实际成员后，排除自动船体/自动variant、战机及不可移除舰长。原版CargoData.isEmpty按NULL类型而非size判断，保留零数量真实货堆导致仍显示拾取选项的边界。
- 实际掉落生成后执行delegate，锁lootedCredits，再生成信用点文字并给真正全局玩家Cargo.credits执行float加法；并非打开/关闭拾取才付钱。config.salvageRandom预先nextLong分离11层流，生成后回写，避免把config流与context内部推进混为一个。重复进入跳过生成/付款，但仍重新计算原版选项。
- CONTINUE_LOOT依序设置visual fade、隐藏面板、报告loot、打开打捞发现、清选项和prompt；关闭依序处理XP文本/后效、恢复字体、实际Battle清理，再dismiss或恢复面板，最后delegate。LEAVE声望有输出时先停在CONTINUE_LEAVE，不越过玩家继续步骤。清理保持半日记忆、ongoingBattle/空间站/脱离/拉入舰队分支与源代码调用顺序，复用真实leave/finish/同步/可见性算法，不替换为通知。
- Runtime新增创建/读取战后阶段、完成胜利打捞、打开/关闭拾取、离开动作入口；原context持有登记增加aftermath（schema30），保存lootedCredits、cleanedUp、phase、config随机、原舰队与恢复名单共享引用。UI对象/关闭函数保持临时绑定；恢复后重新绑定dismiss动作。存在未完成战后阶段时不能直接release绕过清理。schema29迁移为aftermath=null，不根据已存在loot猜信用点是否支付过。
- 原版来源清单加入FleetInteractionDialogPluginImpl/MutableValue，公开资源导入为611来源；没有新增猜测配置或文案布局。

### 本轮一次性验收

类型检查、6文件定向lint、唯一既有native personnel rosters drive场景集中一次全部通过（场景43.72秒），没有复跑。场景使用既有真实玩家掉落：支付实际Cargo信用点、重复进入不增钱/重抽、config随机复位、打开阶段顺序、恢复phase/门闩/共享context、真实Battle结束与清理、重复关闭无二次后效、手动离开先CONTINUE_LEAVE、dismissOnLeave=false清快捷键、上游未完成拒绝、自动船/不可移除舰长无有效舰队、零数量非NULL货堆、自定义空战利品离开键、29旧版迁移。

原有Worker/SQLite后续指令和重启场景改用已付款且loot-open的真实世界，核对这两个门闩、阶段、待发记录、已到账余额及货物/随机在服务器提交后保留。原有后效算法仍由原来场景验证；新增关闭路径的after-effects、UI、字符串格式/颜色、delegate和部分AI使用明确记录服务，只证明接线/调用顺序，不称实际UI/完整插件业务验收。ongoingBattle全部分支、无有效舰队时生成但不付钱、反复加载点击的真实HTTP回执及非空战术对象仍未专项覆盖。

### 尚未闭合

主CampaignApp尚未连接这套完整权威世界；实际消息面板、拾取布局、货物拿取/放回、恢复船选择/确认、击败触发规则、完整默认后效依赖和玩家动作HTTP授权/回执仍要接。本模块没有暴露“客户端自报胜利/自报恢复完成”的接口，持久阶段不等于完整对话恢复或多玩家隔离。原版UI、势力/自创势力、殖民地和独立/合作联机全部继续保留目标，readyForAuthority=false。所有本轮后台进程已结束；无桌面操作、可见窗口、子代理、私人存档读取、暂存提交、推送、打包或发布。


## 2026-09-22 原生拾取事务接线：编码前最小对照

- 原版 0.98a-RC8：trade/F.java:479–578、595–685、268–303、1001–1047。拿起/放下即时改槽位，bought/sold 是抵消反向转移的净台账；确认只清台账，撤销才反向 removeItems/addItems。不能把确认当首次搬货。CargoItemStack.java:49–55 是浅克隆（插件引用保留），340–356 是 float/roundSize/clamp。CargoData.java:670–712 的 removeItems 小于 1 清槽不同于直接槽位搬运。
- G.java:339–376：全部分类直连实际 Cargo，其它分类建立有 origSource 的副本。此次服务器接全部分类的原生槽位及手持事务；分类副本/Shift数量条/Ctrl容量算法仍待后续接线，不伪装成完整 F。四种实物类型共用槽位操作，不退化成商品字典。特殊物品的重新创建仍走实际插件服务。
- FID.showLoot → ui/newui/o0oo_2.java:851–871：默认 false/false/true，最后 true 是 generatePods，不是允许遗留船员；战利品容器默认不接收船员/陆战队。F:389–400 任务物品不得放进另一侧。
- 已查看用户 91465db3 原版截图：全部/资源/舰载武器/其它分类、货物格与下栏/排序、左侧旗帜和底部 HUD；这是普通货舱而非战后拾取截图，只可证明共用货舱结构。既有实机记录支持手持 Esc/右键放回和 T/G 台账操作。本轮不自创或验收拾取布局。
- 当前差异：已持久化 loot-open，但没有玩家货物指令。计划将拿起、放下（合并/交换）、手持放回、确认、撤销、排序接 Runtime → DevelopmentWorld → SQLite/回执 → HTTP → typed client；持久化手持与净台账以应对掉线。身份/阶段/版本由服务器检查，客户端不提交货舱或已胜利标志。投影只含自己货舱与获准的战利品实物字段，不泄漏完整世界图。
- 验证：扩展已有 retained encounter 的同一个 Worker/SQLite 场景，整块结束一次 tsc、改动文件 lint 和该场景；验证真实库存变化/权限/幂等/回滚/重启，不另建工程。

### 本轮落地与验证

已落地上面的真实服务链，持久化字段为 retained encounter.lootTransaction（schema31），HTTP动作 native.loot.actions，native-session按拥有者返回lootWindows。confirm只清净台账；cancel反向搬回；手持物品单独保存并支持重连return。完整实现位于 OriginalLootCargoTransaction 与 NativeCampaignRuntime，通用removeItems/slot操作位于 OriginalNativeCargo。

一次集中验证结果：类型检查通过、12文件lint通过、既有 native personnel rosters 场景48.85秒通过。实测使用真实生成的战果Cargo，经HTTP→Worker→SQLite改库存、撤销/确认/反向放回、失败回滚、鉴权/幂等/版本检查与重启后手持恢复。四类物品的直接槽位与special浅克隆、小数手持和schema30迁移在同场景中覆盖。**尚无React拾取界面接入或新的画面验收**；仅已有typed客户端入口。没有追加重复测试。


## 2026-09-22 原生拾取页面：编码前对照

- 原版0.98a-RC8 campaign/ui/class.java:343–377,489–508：拾取不是普通抛弃页；左侧263×164残骸插图，下方“打捞作业”，右上战利品、右下玩家货舱，两区等高、间距10，格宽100。J.java:78–115：左栏上排撤销/全部收取，下排通栏“确认并继续”，不能拿普通货舱的T/G双按钮冒充。ui/newui/o0oo_2.java:851–884禁用核心页签并作为窗口显示。
- coreui/q.java:130–140,172–208：手持Esc先由F放回；拾取无手持Esc走确认关闭而非撤销；全部收取第一次燃料按CargoData.getFreeFuelSpace整数剩余容量，连续第二次放宽至1e9，确认/撤销清tookAll。继续必须先确认再执行真正关闭回调，不能只隐藏React。
- 已查看用户91465db3普通货舱截图作为共用格线/字形/快捷键参考；用户30979333是星图，不是拾取。没有战后拾取实机截图，布局依据上述源码；本轮不启动原版/不操作桌面，不宣称画面原版等价。
- CargoStackView.java:85–97：资源用商品icon，武器用炮座/炮管，战机为fighter_lpc+战机渲染，special为icon+插件render；ModSpecItemPlugin.java:49–86是芯片上的船插图及扫描线。此次提供真实资源及分层基础图片；完整原生透视/扫描线/动态插件悬停仍明确未验。
- 实现：让现有CampaignApp的同一访问码入口识别native-development服务器，直接消费已获权的lootWindows；动作使用服务器快照版本，不因冲突自动更换槽位/重放新动作，未知回执持久化并只重试同一请求。引入真实全部收取与持久tookAll；分类副本、Shift/Ctrl尚无服务端语义时不假装可用。
- 原生关闭后果仍缺部分真实服务（如完整S-mod日志/默认AI/非空插件与监听器），当前HTTP只提供货物动作。因此确认并继续必须明确禁用并解释，Esc不能假隐藏窗口/结算；后续继续接完整关闭。这是未完成项，不是改写原版默认规则。
- 验收：同一个既有原生场景增加可选headless浏览器分支，使用真实HTTP→Worker→SQLite世界，不搭新测试工程。完成后一次类型/lint/该场景并检查页面截图与点击/键盘/重试。

### 页面接线结果（本轮）

原版来源导入现为618份；原生显示投影只增加公开名称/图层/默认禁放标志，仍不透出插件/源节点/整个世界图。NativeCampaignApp、NativeLootPanel已被现有CampaignApp实际使用，不是脱离入口的演示页。交易手持与收取门闩schema32已持久化。

类型与11文件lint通过；唯一既有场景开启headless页面检查后最终66.93秒通过。中途失败是开发验收代理Origin配置，已定向修复并复查同场景，没有修改生产Origin校验。真实页面经过HTTP/Worker/SQLite执行搬货、撤销、全部收取、丢回执再载入恢复与旧槽位拒绝；1920/1024截图已查看。截图和已知视觉差异见实施进度文档。

关闭仍明确不可用而非假成功：真实结算服务不全时确认并继续禁用，无手持Esc/G也不隐藏窗口。分类/数量/Ctrl、原生HUD与真实世界背景等未完成边界仍保留。此次没有原版实机/完整玩法验收，完整目标不能据此完成。


## 拾取临时货舱与确认入口：实施前最小对照（2026-09-22）

- 原版 0.98a-RC8：campaign/ui/class.java:181–220 创建临时 storage 并 addAllCargo；BaseSubmarketPlugin.java:102–106 逐栈 addItems，因此临时货舱与传入 encounter loot **不是同一容器/栈**。class.java:662–735 确认顺序为保存 bought/sold 副本、玩家同步标记/清台账、剩余货物回写原 loot、非空且 generatePods 时报告未取货物、非市场交易监听、价格更新；q.java:204–208 才接 dismiss。CargoData.java:73–89 的 createCopyWithSameStacks 名字不代表浅复制，而是 addItems 重建栈与特殊物品插件。
- CoreScript.java:544–550 + Misc.java:2696–2706：未取货物事件在玩家真实位置创建 neutral cargo_pods 并 addAll，随后报告 PlayerLeftCargoPods；与主动抛弃不同，不启动 CargoPodsResponse。原 loot 不在此处清空。直接删除剩货或只隐藏窗口均不等价。
- 当前差异：Runtime 的 tx.loot 与 context.loot 直接别名，且 dismiss 可以绕过 core UI 的确认和剩货事件。此次先修正实际临时货舱、确认/关闭调用顺序和失败草稿丢弃。默认吊舱实体、临时市场/事件监听、完整 XP/晋升/AI 服务仍须后续真实接齐，不用空回调解禁 Web 按钮。
- 存档：新窗口使用独立临时 cargo；旧 schema32 活跃窗口原先的 source 历史已丢失，不能重造旧快照。迁移显式保留 legacySharedSource 标记与已有共享图，保存全部库存、手持及台账；确认时不对别名容器执行先 clear 再从自身 addAll。新窗口不走该兼容分支。
- UI：沿用已核对的拾取布局/继续按钮，不做样式修改；用户提供的截图不含战后拾取实机状态，此次不启动原版或截桌面，不称视觉等价。
- 验证：整块完成后一次类型检查、改动文件 lint、原有人员/舰队/HTTP/SQLite 场景。区分真实默认 Cargo/Battle/持久化与显式事件/after-effects 夹具，不把后者当完整结算验收。


## 拾取临时货舱与确认入口：实现及验证（2026-09-22）

- 新窗口现在真实创建独立临时 Cargo，按 q/class/BaseSubmarketPlugin 的 sort/addItems 语义复制；sourceLoot 保留 encounter 的原容器，拖放/交换/撤销/手持恢复只更改屏幕货舱和玩家货舱。公开投影与 HTTP 操作读取临时货舱，不再把原 encounter loot 当实时展示库存。特殊物品复制走真实插件构造，不是 JSON 深拷贝或浅复用插件。
- OriginalNativeCargo 增加 addAll/copy helper：只处理物品，不复制资金/封存舰；copyWithSameStacks 按源码重建栈。新事务验证 source、临时货舱、bought/sold/玩家容器及栈的独立身份。
- Runtime 的 dismissNativeFleetLoot 现在先保存买卖记录副本、清台账、标记玩家舰队同步、回写剩货、调用未取货物事件和非市场交易/价格更新，再执行原有 after-effects/Battle cleanup/关闭。必须放下手持。完成后重入不重复结算；任何一步异常都令整个 Runtime 草稿不可保存。panelConfirmed 的跨阶段检查仅在 checkpoint 强制，允许一个原子操作内部处于“确认完成、后效未完”的瞬间。
- 移除了可经 HTTP 清空台账却不触发真实确认的 confirm 动作；类型和规则动作同步收口。关闭仅保留受信任 Runtime 入口，**没有新增假成功的 HTTP 关闭命令，也没有解禁客户端按钮**。
- 当前 XP/军官/情报服务仍绑定全局玩家，因此关闭前明确拒绝不属于该玩家的遭遇；导航 controller 权限不是独立玩家结算上下文。这里没有把独立玩家联机标为完成。
- schema33 保存 sourceLoot/legacySharedSource/panelConfirmed。旧 schema32 活跃事务保留原共享 Cargo、台账与手持对象，显式标记 legacySharedSource；不会伪造未捕获的操作前 source，且确认时避免 clear 后从同一 Cargo 自复制。旧 31/30/29 迁移继续经过既有保守路径。
- 集中检查：类型检查一次通过；9 个改动代码文件 lint 通过。唯一既有 native personnel rosters drive 场景初次发现事务内部过早校验 finished，修正为 checkpoint 门槛；定向复查又发现测试误用了失败草稿错误文案，按真实契约修正（HTTP 仍只公开 code，不添加 message）。只复查涉及文件和同一场景，最终 50.93 秒通过，未重跑类型/全套、未创建测试工程。
- 已验证：真实原生货物容器/栈隔离；迁移的手持半单位货物和共享身份；确认交易快照不随台账清空消失；剩货回写在后效之前；全部取走不发未取货物事件；后效抛错后不可 checkpoint、从先前 checkpoint 可重新结算；重复关闭不再付钱；原有真实 HTTP/Worker/SQLite 权限、版本冲突、异常原子性、回执重放及重启后的货舱恢复。
- **证据边界**：关闭场景中的临时市场、未取货物事件接收器和 after-effects 是明确的 recording 夹具，用来检查调用顺序/货物及 Runtime 失败边界，不证明默认 CargoPods 实体生成、XP/晋升/AI/监听器已经闭合，更不证明关闭的 HTTP/SQLite 原子提交已经接好。默认缺服务依旧拒绝，未注入空实现。
- 本轮未改 UI 样式、未运行浏览器/原版或截桌面；没有原版战后拾取实机视觉验收。下一步应接默认临时市场/事件接收器、真实 cargo_pods 世界实体及剩余 after-effects，然后才能接确认按钮和 HTTP 完整关闭。完整生涯、势力/自创势力/殖民地与独立/合作联机继续未完成。
- 无子代理、可见窗口、键鼠注入、私人存档读取、暂存提交、推送、打包、发布；本轮测试父进程已正常退出。


## 真实货物吊舱与混合实体世界：实施前最小对照（2026-09-22）

- 0.98a-RC8：BaseLocation.java:343–386/1070–1087 将 CustomCampaignEntity 登记到实际 ObjectRepository 与层渲染器，但不登记为舰队、没有能力渲染器或 FleetSpawn 事件。CustomCampaignEntity.java:62–122 构造独立 Cargo、neutral 的实际空 mothballed FleetData、来源配置/图像/标签/layers，朝向90；BaseCampaignEntity:142–145 用实际 Misc UID。
- CargoPodsEntityPlugin.java:16–45 初始 elapsed=0/maxDays=1/extraDays=0/neverExpire=null，manager 初始 numPieces=0，详情探测倍率0.5；75–100 更新时才按实际货物量算5–40碎片、半径及5–40日寿命和冷冻舱名称，不能创建时直接当固定TTL。可见保护/深渊倍率/淡出不是简单到时删除，本块不以假可见值替代。
- Misc.addCargoPods:2696–2706 在真实位置创建 neutral cargo_pods 后按持久 Math.random 流两次采样设漂移速度，再清 discoverable/discoveryXP、设sensorProfile=1；CoreScript:544–550 逐栈 addAll 未取货物，不清源，不启动主动抛弃使用的 CargoPodsResponse，再分发 CargoScreenListener。
- 资源：已读取 custom_entities.json:1259–1278 并实际查看 cargo_pod_drift.jpg（480×300）；世界图标、交互插画及插件层来自公开资源。用户截图不含这一吊舱状态，本次不修改UI、不操作桌面，实机图形/近远交互仍待核实。
- 当前差异：世界登记器只接受舰队，无法放入真实吊舱；确认阶段的剩货仍要求外部实现。本轮将创建真实吊舱/Cargo/空封存舰队并登记世界，接 stock CoreScript 剩货处理和实际 CargoScreen 监听器所有权；对旧未捕获监听列表保留未知，不补空数组假装没监听器。统一注册结构为后续其它实体保留扩展点，未知插件不换成空实现。
- 验证仍只扩展既有人员/舰队/HTTP场景，完整实现后集中一次类型、改动lint、同场景；断言真实世界共享对象及保存，不把未完成的自然帧/图形或XP服务也算完成。


## 真实货物吊舱：实现与集中检查（2026-09-22）

- 新增 OriginalCargoPods，复用实际 BaseCampaignEntity、Misc UID、独立 Cargo 与 neutral 的真实空 mothballed FleetData；配置、标签、TERRAIN_7A 层、480×300 交互插画描述和图像哈希来自原版公开资源。先注册再定位与漂移，使用持久 Math.random 流两次 nextDouble，不引入假世界 DTO。初始 maxDays=1/numPieces=0；显式尺寸更新使用真实 cargo space/fuel/personnel 与原版 5–40 范围，不把初始状态改成固定过期时间。
- 同一 ObjectRepository/class lists/renderer 支持舰队和 cargo_pods；吊舱不进入 CampaignFleet 列表、不创建 ability renderer、不通知 FleetSpawn，renderer=null 重建保留真实自定义实体。移除不擅改 containingLocation/expired，舰队专用清理跳过吊舱。
- 默认剩货事件按实际 legacy listener 顺序分发；只有已明确注册的 CoreScript 执行 stock 创建与逐栈复制，然后通知实际 CargoScreenListener。未取货物不清源、不添加主动抛弃的 CargoPodsResponse。NonMarketTransaction 也走 CargoScreenListener，不以空回调代替未知监听器。
- Runtime schema34 保存混合实体和 CargoScreenListener 所有权；schema33 迁移将未捕获名单保留为 null，使用前必须明确绑定。恢复时先载入并验证 FactionManager，再验证自定义实体所属势力，避免有效吊舱存档因恢复顺序被拒绝；保持实际势力/舰队/货舱/插件/manager/监听器共享引用校验。
- 复用既有人员/舰队场景，在同一个真实 CampaignService Worker/SQLite 中保存带吊舱世界、执行下一条导航命令、关闭重启、重放回执，再从数据库恢复。核实货物数量、世界登记/渲染层、势力、封存舰队、插件、manager 和监听器 lastPods 均指向实际共享对象；并检查重复关闭不再生成吊舱、监听器失败后的草稿不能 checkpoint、旧未知监听器不冒充空名单。没有新测试工程或额外 UI 测试。
- 本块集中检查一次全部通过：tsc -b；13 个改动代码文件 lint（0 warning/error）；唯一既有 native personnel rosters drive 场景 66.02 秒通过（进程总计 66.62 秒）。无需失败复查，没有重跑全套。检查进程及其 Worker 已退出；暂存区为空。
- **尚未闭合的生产边界**：完整初始世界/CoreScript 注册、star-system 的实际 getLightSource、CargoPods/BaseCampaignEntity/GenericField 的完整自然推进与传感/地图图形、可见保护/深渊寿命/淡出；临时市场、XP/晋升/AI 等完整默认后效及关闭 HTTP 仍需继续。场景的市场与后效仍是明确记录夹具，不能把真实吊舱路径通过扩大成完整关闭或完整生涯验收。未解禁客户端确认按钮，readyForAuthority 仍为 false。
- 本块未更改 UI，无原版实机视觉验收；没有子代理、可见窗口、桌面截图/键鼠操作、私人存档读取、暂存、提交、推送、打包或发布。完整原版玩法/UI、可大改结构、势力/自创势力、殖民地和独立/合作联机目标继续保持。


## 吊舱自然帧：实施前最小对照（2026-09-22）

- 0.98a-RC8 CustomCampaignEntity:260–264 先 BaseCampaignEntity.advance 再插件；BaseCampaignEntity:595–659 按 contact、selection、两种 sensor fader、memory、market、floating text、scripts 顺序。BaseLocation 积分负责世界漂移，不能在插件里再积分一次。
- CargoPodsEntityPlugin:49–100 先累积真实天数（深渊 depth>=1 时五倍），到期且不详细可见时调用 Misc.fadeAndExpire；随后仅当前空间更新大小和 gen 探测加值，再推进 manager。更新探测范围的半径是 10+10*sqrt(numPieces)，不是实体半径的 sqrt(numPieces-4)。
- Misc:2581–2616 添加 non_clickable/fading_out_and_expiring 标签及真实实体脚本；暂停不走，elapsed>1秒才 expired，亮度以 min(current,clamp(1-elapsed/seconds)) 钳制，并强制使用 sensor fader；世界遍历下一轮才移除。重复请求不添加第二份脚本。
- GenericFieldItemManager:37–91 离开当前空间时清 transient 小吊舱，正时间当前空间中以天推进/补足；GenericFieldItemSprite:33–79/116–128 使用真实图集、原版随机消耗、初始0.1天推进、短生命周期/fader。FaderUtil:54–125 与现有 OriginalFader 的这部分行为一致，可复用。
- SensorContactIndicatorManager:57–190 同一实体算法，但非舰队不运行逆向发现玩家ping，也不使用舰队hidden/despawn条件。BaseCampaignEntity:1085–1098 的跨空间可见门槛必须先于 sensorsOff 快捷分支。原版图集 cargo_pod_sheet1.png 已实际查看；用户现有截图没有吊舱过期/淡出状态，本轮不改 UI、不做实机视觉等价声明。
- 当前差异：吊舱已有世界对象，但自然帧仍无默认非舰队推进。将复用基类尾部/脚本与接触规则，接真实 sensor getters、生命周期及 field state，并由现有 location 积分/清理；未知深渊地形和自定义插件仍必须提供实际服务，不补假值。完整实现后仅集中类型、改动lint及一个既有场景。


## 吊舱自然帧：实现与验证（2026-09-22）

- 新增 OriginalCampaignEntityFrame 复用 BaseCampaignEntity 后半段：selection/faders/memory/条件市场/floating text/scripts。舰队改调用同一实现，保留 contact/颜色在前的顺序。Misc.fadeAndExpire 是真实挂在 entity.scripts 的共享实体脚本，严格 elapsed>seconds、暂停不走、重复标签不重复注册，强制亮度钳制；不是独立后台 TTL。
- OriginalCargoPodsFrame 实现 stock 插件寿命、详细可见保护、extraDays/neverExpire、深渊五倍天数、当前空间大小/探测加值，以及 GenericFieldItemManager/Sprite 的实际随机、位置/速度/角速度/短寿命/fader 状态。世界位置只由 BaseLocation 积分一次；离开当前空间后的正时间推进清小吊舱列表。field 的0.1天初始化与构造中被覆盖的随机速度采样均保留。
- 扩展既有 SensorContactIndicatorManager 算法支持实际吊舱 owner，未制造 FleetData 替身；非舰队不执行逆向发现玩家 ping，也不套用舰队 hidden/despawn。Runtime 默认读取真实玩家传感/位置与自定义实体自身 profile/radius/modifiers，检测通知走实际世界监听器。旧 manager 字段名 fleet 只作为既有共享 owner 指针，实际指向吊舱对象。
- 默认 Location entity dispatch 已接上述自然帧/暂停回调；自然遍历负责漂移、下一轮移除 expired 实体。公开资源导入增加图集、阴影纹理尺寸/哈希及原版 Sprite/FaderUtil 来源，不改原 fleet texture registry。schema34 无需伪造迁移状态：已存在 nullable manager/scripts 支持新增状态，Web 权威 checkpoint 保留帧连续性/共享引用；这不是声称原版 XML 会序列化其 transient 小吊舱缓存。
- 复用唯一既有场景：真实 sensor getter 判定近处详细可见/远处NONE、超寿命可见保留、淡出重新进入视野仍受亮度钳制；实际默认 BaseLocation 的暂停、不重复积分、严格一秒边界、下一遍移除；字段初始20个小吊舱消耗260次 nextDouble；真实 Worker/SQLite 存淡出0.5秒与活跃 field/contact 状态、重启回执重放后仍保持脚本/粒子/manager/监听器引用。深渊倍速使用明确地形输入夹具；未知地形默认拒绝，不称完整地形已接。
- 集中检查：类型一次通过；15文件 lint 通过。唯一场景发现 Runtime 检测通知漏导入，修复后只复查 Runtime lint 和同一场景，64.03秒通过（进程64.55秒），未重跑类型/全套，也未新增测试工程。进程已退出，暂存区为空。
- **边界**：尚缺 field/接触/图标的完整地图渲染与拾取交互、默认深渊地形读取、原版实机视觉对照、默认初始世界与实际 star-system getLightSource、完整战后临时市场/后效/关闭HTTP。新检测音效/ping仍为有序呈现意图，不宣称已播放；currentLocation/玩家仍是原版单例上下文，不能算独立/合作联机完成。readyForAuthority=false，客户端确认按钮未解禁。
- 无子代理、可见窗口、桌面截图/键鼠操作、私人存档读取、暂存提交、推送、打包或发布；完整原版生涯/UI、可大改结构、势力/自创势力、殖民地和独立/合作联机目标保持进行中。


## 吊舱地图绘制与观察隔离：实施前对照（2026-09-22）

- 0.98a-RC8 CustomCampaignEntity:309–392 先 showInCampaign/传感双fader门槛，再按 plugin radius+100 做视口裁剪；cargo_pods 只在 TERRAIN_7A 插件层画小吊舱，无自定义母sprite。GenericFieldItemManager:58–70 render首次也会初始化field，alpha=viewport*sensor*contact。
- GenericFieldItemSprite:81–113 以实际32px图集格、facing-90、局部位置绘制；lightColor为空或无光源时白色，ambient_ls仅跳过阴影。阴影按 clear alpha → sprite alpha写入 → 0/SRC_ALPHA遮罩 → RGB恢复 → DST_ALPHA/ONE_MINUS_DST_ALPHA合成，shadow alpha不乘单件fader。Misc.renderQuadAlpha:2564–2574 的清除blend为SRC_ALPHA/ZERO，角度由883–886的strict atan2确定。
- 已查看原版图集，用户截图不含吊舱近远/淡出；本次只能核对源码、原资源与Web真实GPU输出，不宣称原版实机视觉等价。原生页面当前没有完整星区画布，不能用参考世界假背景冒充已完成地图。
- 当前实际缺陷：native observations 遍历同一个世界仓库却直接解引用 fleet.campaign；加入真实吊舱后会崩溃。将修成同一授权观察入口的实体分派，并使用观察者本人上下文，接触阶段不泄露名字/类型/货物。渲染使用独立观察者field/contact/random，不能让多窗口额外推进权威库存、寿命或随机。现有GPU四边形需补显式atlas UV支持，保留整图默认。
- 完整做完本块后集中类型、改动lint与唯一既有场景；在该场景中按需进行真正无头GPU截图，测试背景明确只用于渲染检查。


## 吊舱观察隔离与原版 GPU 绘制：实现（2026-09-22）

- 原生世界观察投影改为同一 repository 内的真实舰队/吊舱分派，消除直接 fleet.campaign 解引用导致的混合世界崩溃。吊舱按认证 controller 所选的实际观察舰队读取传感/位置，easy/sensorsOff 玩家上下文不会误用全局玩家，也不修改原版单例身份。公开接触保持既有 scope/字段兼容；未识别吊舱与舰队同形，不暴露类型、名称、cargo、封存舰队或内部 objectRef。
- Runtime 已接吊舱 observer creation/advance/layers 接口。每个观察者拥有独立 contact、field 和显式 visual seed；看画面不额外推进世界位置、寿命、货物或权威随机。读取额外接触点时不 lazy 创建权威 Memory。Detected/discovery 回调产出局部观察意图，而非重复执行世界监听器/发现业务。默认势力 UI 颜色缺失时仍要求实际服务，不以别的颜色字段冒充。
- GenericFieldItemManager 首次 render 初始化、32px atlas UV、facing-90、光源着色、ambient_ls 跳过阴影、alpha-only scratch 和原版 blend 顺序均接到现有 NativeFleetRenderer；不添加虚构母舰或把 pod 注册成 Fleet。每观察者的详细/接触 fader 分开，权威淡出亮度仍可钳制最终本体亮度。
- 源码与资源核对：原版 cargo_pod_sheet1.png 已查看；本轮真正 GPU 首次执行发现 graphics/fx/ship_shadow_mask.png 虽有来源声明却未被复制到 public/game-assets。补入哈希 733a102fae4e83afa0b15f4f7a9523a7774e6c1f5ba17e2452ff9d2f1cb7bbb4 的原始809字节PNG，追加现有资源清单，不运行会覆盖其它资源的全量导入；既有 import-game-assets.ps1 已能从 reference JSON 发现此路径，无需新增导入工程。加载错误现在返回具体纹理路径。
- 集中检查：类型一次通过，14个改动文件 lint 通过；资源失败后仅复查渲染器单文件 lint。唯一既有 native personnel rosters drive 场景在修复纹理后 138.41 秒通过（进程139.20秒），包含同场景可选无头 GPU、真实授权 HTTP→Worker→SQLite、不同观察者的 SENSOR_CONTACT/完整识别、匿名信息隔离、观察不写权威 checkpoint、暂停/首次render/视口裁剪、atlas UV、阴影mask/blend、ambient_ls和权威淡出钳制。没有运行全套或新增测试工程。第一次工具观察120秒超时且进程已消失，未计为通过；改用持久日志与明确PID后首次完整结果定位到缺失阴影资源（122.11秒），随后只复查同一场景，未重跑类型检查。
- 已查看实际无头 WebGL2 输出：C:/Program Files (x86)/Starsector/starsector-web/artifacts/native-cargo-pods-gpu-2026-09-22-1790038910320.png。三个面板分别为原版图集吊舱、方向阴影、远处匿名接触，纯色底只用来检查GPU，不表示主星区背景。三个状态均有实际像素输出，阴影scratch未泄漏到DOM透明度，浏览器无pageerror；图集、阴影、接触纹理公开文件均与来源SHA256一致。
- 测试进程已正常退出，浏览器与Vite在finally关闭；没有子代理、桌面截图/键鼠操作、可见窗口、私人存档读取、暂存、提交、推送、打包或发布。
- **边界**：当前原生页面仍没有完整星区画布；GPU截图仅为明确标注的绘制夹具，不是已接完的地图，也不是原版实机像素验收。点击/选中圈/名字/拾取窗口、默认星体光源/深渊、完整初始世界、完整战后关闭HTTP及多人独立结算仍未完成。readyForAuthority=false，确认按钮未解禁。完整原版玩法/UI、可大改结构、势力/自创势力、殖民地和独立/合作联机目标保持进行中。


## 玩家地图目标选择与跟随：实施前对照（2026-09-22）

- 原版0.98a-RC8 CampaignEngine.findClosest:1474–1493 使用当前 CampaignEntity 类列表顺序，排除自己、terrain/non_clickable、不可见/hidden、纯SENSOR_CONTACT、NONE、不显示的Custom；在严格 distance<max(padding,radius) 内以 distance+radius 最小者命中，平局保留先者，不是“选最近中心”。原版玩家截图 QQ20260919-165600.png 已查看；用户两张远近小图是跳跃点，不据它们推断吊舱窗口或鼠标操作。
- CampaignState.controlPlayerFleet:1350–1393 的目标分支在未暂停时每帧读取当前位置：舰队目标使用朝目标方向的750单位航点，非舰队使用目标当前坐标，并保存 moveDestinationSetWhileInLocation。setMovementDestination:1617–1622 在普通setMoveDestination后无条件清 interactionTarget，因此即使moveOverride拒绝坐标覆盖也仍取消跟随。CampaignFleet:723–727在基类后清跨位置/已移除目标。BaseLocation:764–774再以严格距离<舰队selectionSize+目标radius启动互动。
- 反编译调用 Utils.class 有保留字重命名歧义，已用原版jar javap核实：它用Math.atan2后d2f乘57.295784f，不是Utils快速角度查表；单位向量用float PI/180再cos/sin，所有关键向量乘加保持float。
- 当前差异：公开导航只有一次坐标与goSlow，坐标命令不会清目标；Runtime目标解析与encounter默认服务只认舰队，吊舱目标会报错。将添加源码目标命中/追踪控制、默认混合实体解析，接授权的地图坐标选择命令；公开结果只给认证观察者的不透明contactId，不允许提交内部objectRef。世界控制相位按实际controller舰队逐一推进，绝不借此在GET观察时推进世界。
- 边界：完整CampaignState输入、长按跟鼠标/自动停泊、目标指示器呈现、全局课程状态和完整世界scheduler尚未接。原版followEntity:1597–1615还有战后保护/提示/本地指示器动作；缺战后时间来源且处于noCombat的选择不能静默跳过该行为。未接完整主画布前不新增自创选择表单，不把新的控制子相位称完整世界推进。完成本块后只集中类型、改动lint及一个既有场景；本轮不改UI样式、不占用桌面补验。


### 玩家地图目标选择与跟随：接线结果与剩余入口（2026-09-22）

- 新增 OriginalCampaignNavigation：实际 repository 中命中原版可选对象；玩家坐标指令取消旧交互目标；舰队目标每个控制相位更新750单位方向点，非舰队目标读实时坐标，跨位置/移除目标清引用。Runtime 遭遇实体解析和默认半径已兼容真实吊舱，不再解引用不存在的 fleet.campaign。世界位置、库存、寿命和权威随机不由导航子相位推进。
- 原生授权 HTTP native.fleet.navigate 已加入 allowlist 和客户端命令类型。坐标命中在服务端使用认证玩家本人传感上下文，不能用 targetRef 注入内部目标；仅回传该玩家/观察者的不透明 contactId。匿名接触点击只发坐标指令，不透露货物或实体类型。原有 set-destination 也取消旧跟随。每个 controller 的持续跟随使用独立舰队，不改原版 singleton player 身份。
- 原版 followEntity 的战后保护仍需要真实 lastPlayerBattleTimestamp。已核实 CampaignEngine.java:294 初始化 Long.MIN_VALUE、CampaignState.java:582 战斗返回时写当前时钟、1843 新游戏重置；当前未接独立玩家战斗历史根，HTTP 在 noCombat 非空时明确拒绝，不用0或虚构历史绕过。
- 本轮只收尾已有导航检查。首次复查因断言打印带循环共享引用的完整世界，进程异常增长到约44GiB工作集；核实 PID/命令行后主动终止本任务父子测试进程，未停止其它进程。新增的对象断言改成布尔身份比较，后续同一 Node 场景设置 --max-old-space-size=4096，不允许失败诊断无限展开世界图。
- 有界结果发现两个测试预期错误而非改写原版规则：重叠舰队放在 x=1410 时对 B 仅为 SENSOR_CONTACT，不应可选；改为 x=1390 并显式确认 COMPOSITION_DETAILS，再验证 distance+radius 优先级和严格边界。垂直追踪经原版 float atan2→degrees→radians 得到 x=999.9998779296875 而非数学理想1000，改为精确结果断言，不放宽浮点实现。
- 实际主入口 NativeCampaignApp 仍只有战利品 UI 与占位背景；native-observations 明确是瞬时传感数据，不是可用于原版动画的 scene frame。Repository 每次请求恢复新图，现有每观察者动画状态尚无正式持有/重绑、主机调度和公开图层传输，不能把传感点、纯色GPU夹具或私人存档变成“完整地图”。本轮未添加自创地图或调试选择表单。下一关键路径仍是实时世界/每玩家呈现所有权，再接原版画布输入。
- 完整世界调度、按住鼠标持续跟随、自动停泊/课程、消息和指示器绘制、默认新世界构造、完整战后关闭/拾取界面、势力/自创势力、殖民地与独立/合作联机未完成。readyForAuthority=false，不解禁确认按钮；生涯内容不暂存、提交、推送、打包或发布。

- 定向复查额外定位到真实回归：BaseCampaignEntity.java:984–985 的 isAlive 只看 containingLocation 和 repository.contains，CampaignFleet.java:723–727据此清交互；expired 标志不是该判定。混合实体解析不得提前把 expired 当已移除，目标导航同样保留到真实移除/跨位置时再清。验证复用既有 expired-but-registered 场景，而不是删除旧断言。

- 最终验证：原集中 tsc 与9文件 lint 已通过；本次对具体失败只复查修改文件 lint（最后3文件0警告0错误）及同一个既有场景，没有全套、GPU或新增测试工程。最终场景112.97秒通过，进程113.54秒，exit=0；日志 artifacts/native-navigation-check-lifecycle-1790041101183.log。范围含原版命中/取消/动态追踪、暂停不推进、匿名目标不可选、HTTP认证/回执重放、Worker重启后跟随真实目标，以及旧的 expired-but-registered 生命周期断言。异常进程已停止，最终进程正常退出；不把这些证据称完整航行UI验收。


## 主地图真实可见图层：实施前最小对照（2026-09-22）

- 原版证据：CampaignFleet.java:574–600、836与BaseCampaignEntity.isVisible(float)在实际视口/半径内绘制舰队；CombatViewport.java:71–90是带margin的矩形裁剪，153–160把屏幕坐标映射到世界坐标。CampaignState.java:1399–1455使用未被UI消费的左键输入；截图QQ20260919-165600.png已查看，保留全屏航行区域、下方核心导航、覆盖式货舱，不改成卡片地图。轮缩放、平移、完整选中标识本块不凭印象添加。
- 原版舰队/吊舱绘制与图层顺序复用已经核实的ObserverPresentation和NativeFleetRenderer。Faction.java:901–910确认getColor/getBaseUIColor分别读当前spec，不等于secondaryUIColor；现有构造势力缺specBaseUIColor时保留缺失，不从别的颜色或静态默认猜测当前值。为完整的新构造数据增加可选真实字段，旧检查点仍可读。
- 当前差异：只有传感快照HTTP；原生入口没有canvas；观察动画未被主机持有。将添加认证的可见绘制命令接口、按世界版本/玩家/观察舰队/页面会话隔离的短期展示缓存，只推进本地fader/field/ship view，不推进世界时钟、AI、库存、物理或权威随机。场景读取不能调用Detected/Discovery世界业务；观察事件仅为本地呈现意图。客户端不获世界图、成员/货物或内部引用。
- 页面用服务器给出的实际摄像机绘制并从该帧换算左键世界坐标，发送现有native.fleet.navigate；网络不确定时保留同requestId重试，不能伪造本地移动。资源失败/视图权限错误清空旧画面、锁输入。正式背景/星体尚未接齐时显示明确未完成提示，不套用测试背景或参考世界。
- 临时边界：当前Repository仍按提交恢复世界，版本变化会重建展示缓存而不是假装保留全连续动画；主机未接完整world tick，页面只展示真实当前实体与独立视觉动画，导航不等于已经推进世界。固定1:1初始视口，未声称原版完整相机/名字/选中圈/课程/音效/HUD。可大改仍通过规则服务和独立呈现模块，不改变公开授权规则。
- 验证只扩同一既有场景，集中一次类型/改动lint/相关场景；界面只用headless，不占桌面、不调用子代理、不提交发布。

- 单场景首次发现真实观察副作用：默认FleetView.getSortedMembers调用会把needsSync/onlySyncMemberLists与缓存写回舰队。原版FleetData.java:572–604、630–643已核实；观察分支需保持同样的加载门槛/稳定FP降序，但只生成观察列表，不执行业务sync、不重绑成员，也不修改共享缓存。原权威getSortedMembers继续原样保留。验证保留整个checkpoint不变断言。

- 页面加载定向诊断（不运行世界场景）：两次15秒加载超时未发现HMR full-reload；第三次同入口7.85秒加载成功，CPU采样中4.947秒位于Node FSWatcher创建，证据支持整个共享目录的文件监听有显著启动成本，不能归咎于玩法渲染无限循环。既有UI场景仅隔离自己的Vite缓存、限定campaign入口预优化并禁用测试服务watch，保留项目插件、安全头和真实HTTP代理；不改生产Vite配置、不增加超时。主画布仅在尺寸实际改变时设置canvas.width/height，避免每帧重建同尺寸drawing buffer。UI复查结果待记录。

- 后续CPU采样推翻“只需隔离watch即可修复”的假设：首帧HTTP已返回后，测试主线程有104.550秒落在@tailwindcss/vite.generate，非世界/Worker或GPU运算。按首帧heading纹理闭包核查，reference-fleet-view.json的584个实际纹理仅缺graphics/warroom/ship_arrow.png与graphics/fx/particleline32ln.png；原版CampaignFleet.java:333/427、CampaignShipEngineGlow.java:58/152明确使用它们。两张原图已查看。Vite缺资源的SPA回退会预转换index.html/main.tsx/index.css并启动Tailwind，导致原本应为缺图错误的问题连带HTTP超时。修复采用原图字节与已有来源SHA256，不改视觉、规则或生产Vite配置；既有场景预先检查其两帧真实几何的纹理存在且哈希一致。

- 最终结果：补齐两张原图后，保持20秒UI等待和真实HTTP/Worker链路，唯一既有场景85.44秒通过（进程85.99秒，exit=0），日志artifacts/native-scene-check-1790044239746.log。验证覆盖实际主入口加载、真实hull/吊舱图层、点击目标提交、服务器位置未假移动、回执丢失后reload恢复同requestId重试且revision不重复增加；页面无pageerror。前面的失败没有记为通过，也没有通过关闭安全头或注入假数据绕过。
- 已查看1920×1080正式campaign.html无头截图artifacts/native-scene-page-1790044239746.png：原始舰体/引擎光/航向箭头/吊舱有真实像素，底部核心按钮顺序保留，导航确认信息可见。画面仍是明确标注的黑底开发世界，未接星体、背景和完整HUD；测试世界不是原版新开局，截图不是原版实机/像素等价验收。
- 本次对明确失败只定向检查2个改动代码文件（oxlint零警告零错误），未重复类型/全套。所有诊断与场景进程均已正常退出，浏览器和测试Vite已关闭；无子代理、可见窗口、键鼠操作、私人存档访问、暂存/提交/推送/打包/发布。实时tick前的跨revision视觉状态重绑仍是下一项关键缺口。


## 观察画面跨世界版本连续性：实施前最小对照（2026-09-22）

- 原版0.98a-RC8 CampaignFleet.java:330–338在构造时建立FleetView，836–841在同一视图上advance，仅离开视口才clear。CampaignFleetView.java:44–46、115–143持续持有CollectionView与ContrailEngine；CollectionView.java:46–82按成员对象身份维护原顺序、新成员渐入、孤立成员通知/渐出后移除，不随导航指令重建全部视图。CampaignFleetMemberView.java:120–200只在readResolve恢复资源、215起构造渐入/位移；不能把每个网络版本当作新的舰船。原版已提供的全屏地图截图可确认布局，但不证明跨帧连续性；本块不更改布局。
- 当前差异：Repository每次revision变化丢弃NativeScenePresentation，导致contact/member fader、formation随机、尾迹和吊舱碎片重新起步。预期：同一世界、同一观察舰队、同一位置内，按内部稳定objectRef把本地视觉引用重绑到最新Runtime图，保留fader/运动/尾迹/随机、CollectionView各列表和field items；不推进权威、不写旧/新世界。已移除成员保留原版孤立视图直至渐出，不把重绑当作一次sync；离场/过期实体移除，观察者切换位置/被回收/失权则清理对应页面视图。
- 世界revision仍单调检查，Controller权限每次从最新状态重新判断，不能因缓存保留旧权。只替换原生定义中实际引用世界对象的字段，不遍历/复制整份世界。模块图标保持原版已有缓存，若同一variant身份仍存在则重绑该身份；不因网络反序列化额外触发readResolve、换装或随机初始化。
- 验证：只扩展既有场景，检查重绑前后随机/fader/列表/尾迹/碎片对象不变、嵌套owner引用指向新Runtime、两个checkpoint不受影响，检查移除/失权/跨位置及实际Worker提交后的sceneId和舰体亮度连续；统一类型、改动lint、同一场景无头截图/回执检查，不增加测试工程。

- 重绑检查发现另一条观察写入风险：CampaignFleetMemberView.java:562生成尾迹时调用getTravelSpeed；FleetData.java:718–734会syncIfNeeded并写travelSpeed。现有Web默认尾迹也会同步权威舰队。观察分支改为显式读取最新已发布的实际travelSpeed（必须是有限值），不在看画面时完成业务同步；缺失数据拒绝而非填默认。权威绘制/推进分支保留原版同步 getter。未同步的新货物/舰队统计仍由真正world tick负责，不能由观察者数量决定。

- 集中类型/10文件lint已通过；首轮唯一场景在56.74秒定位到新断言过早要求删除孤立视图。原版CampaignFleetMemberView.java:958–959要求isIdle且brightness=0；fs.common Fader.java:103–119到零后下一次advance才进入IDLE，CollectionView又在成员advance之前检查isExpired，因此需要再下一轮sync移除。只修正新断言，保留原版实现，并显式验证这三阶段。

### 跨版本连续性实施与验证结果

- NativeScenePresentation.replaceState已接Repository提交后的新Runtime：同世界/同观察舰队/同位置按真实内部身份重绑，sceneId、contact/member fader、CollectionView顺序/通知集合、视觉随机、尾迹及吊舱items保持连续；当前成员、引擎owner、模块variant、contact manager、吊舱field/item owner与光源指向新图。索引只覆盖实际成员/variant注册表，不复制整份世界。API仍只返回可见几何。
- 每次更新重新核实controller权限和真实仓库成员资格；失权、观察舰队离场/过期/换位置清对应视图，目标移除不再出现在缓存几何中。拒绝不同世界/倒退revision或同revision不同图。仅保留孤立成员的视觉直到原版渐出，不把它重新登记为世界成员。
- 尾迹的观察分支读取已发布的真实travelSpeed，不触发syncIfNeeded、不写速度缓存；默认权威分支行为不变。新断言覆盖needsSync=true时的观察只读性。此处不是替代权威统计同步：真正world tick仍须在发布前完成业务同步，缺实际航速仍报错。
- 最终唯一既有场景85.72秒通过（进程86.26秒，exit=0）；日志artifacts/native-scene-check-1790045591463.log。范围包括旧/新权威checkpoint不变、成员和碎片嵌套身份、随机/亮度/尾迹对象保留、孤立成员三阶段淡出、最新位置、真实移除、撤权/重新授权、真实跨位置登记、Worker提交和正式页面导航前后sceneId持续，以及刷新后同requestId回执重试。没有全套或新增测试工程；类型与10文件lint集中一次通过，唯一预期失败后只复查脚本lint与同一场景。
- 已查看正式页面1920×1080截图artifacts/native-scene-page-1790045591463.png，导航确认后舰体、引擎/尾迹和吊舱实际可见；布局没有改动。截图仍是黑底开发世界，不是原版新开局/完整星区，不支持原版实机像素等价结论。跨提交连续性由状态和真实HTTP/UI断言证明，单张截图本身不证明动画时序。
- 本轮场景和无头浏览器/Vite均已结束；无子代理、桌面/键鼠操作、私人存档读取、提交推送打包发布。仍缺默认新世界构造、完整世界调度、原版星体背景/HUD/完整鼠标控制、完整战后关闭和独立玩家结算、势力/自创势力/殖民地及独立/合作联机。readyForAuthority=false，完整目标继续进行。


## 势力自然帧和自定义生产队列：实施前最小对照（2026-09-22）

- 已重新查看用户的原版0.98a-RC8主地图截图，维持全屏空间与底部导航，不增加临时面板。截图不证明生产界面/时间语义；本块无UI变更，原版实机补验仍待许可。
- CampaignEngine.java:1003–1013在经济之后、时钟之前，暂停把传给Character/Faction的秒数置零，按FactionManager.getAllFactions(:48–50)列表快照顺序逐一advance。Faction.java:959–983仅推进已分配的Memory与非null production，不因advance懒建Memory；getMemoryWithoutUpdate才新建且不执行plugin.updateFactionFacts。Faction.readResolve:317–321为新生产对象设默认costMult=1，但不能把未知历史状态自动重置为空。
- loading/specs/FactionProduction.java:122–139：dt<=0直接返回；当前项目buildDelay按原版clock天数扣减并钳到0；interrupted累计天数，严格>30才删除，==30保留。没有逐帧完成生产/凭空发船。:199–265同type/spec项目合并、默认数量上限100、超限返回false；恢复中断项目保留对象与buildDelay、数量从0开始、清中断时间；删除只有getBaseBuildDelay()>0才进interrupted，原版当前Item(:402–407)的基础延迟为0，因此普通项目取消不凭空保留进度。:49–106 copy复制项目但共享faction/gatheringPoint，sameAsCopy在双方current为空时直接true，项目equals仅比较type/spec/quantity，不比较计时；resetFromCopy仅重置两张项目列表。
- 当前差异：运行层有实际FactionManager/共享势力身份，但引擎readAllFactions/advanceFaction仍全靠外部回调，既有经济调度测试使用recording替身。新增明确的势力帧状态与实际生产队列规则，绑定到同一注册势力，再接默认引擎推进和checkpoint验证；保留可替换服务。未绑定历史帧状态拒绝推进，不能用空记忆/空队列猜存档。
- 本块范围是势力记忆、生产队列管理与自然帧时间，不是生产成本/产能/月底交货/生产UI或完整自动世界调度。验证复用“natural economic frames…”既有场景，移除其中势力阶段替身、检查真实引擎默认路径、暂停/0/负时间/严格30天边界、队列身份和保存恢复，以及未知/拆散身份拒绝；完成后一次类型、改动lint、这一场景。

### 势力自然帧与生产队列：实施结果

- 新增OriginalFactionFrame/OriginalFactionProduction规则及类型，绑定到运行层同一个注册Faction，不制造独立的“生产势力”。默认CampaignEngine现在读取真实势力列表快照、在原有经济→记忆/势力→时钟顺序调用Runtime的势力帧；保留显式替换服务，且生产计时使用当前权威Clock的转换。原有仍未完成的管理器/Location依赖不以空回调冒充。
- Faction.advance不新建Memory，暂停时Engine传0、Memory仍先恢复实体引用；只扣真实过期记录。生产队列支持同项目合并、原版上限/超限返回值、取消、清空、中断恢复保留对象与剩余延迟、严格>30天清理，以及原版copy/reset/sameAsCopy语义。stock基础延迟=0，普通取消不会假造中断进度；正基础延迟由明确的可替换项目服务提供。计时不制造舰船/武器，不触发月底交付，也不自行推进时钟。
- 新帧状态显式绑定，旧checkpoint里不存在的nativeFrame保持未知，默认推进会明确拒绝而不是猜空队列。保存和恢复验证Faction↔frame↔production共享身份及实际经济市场集合中的gatheringPoint身份；失败操作污染的draft不可保存。未新增HTTP生产命令或绕过玩家授权的接口。
- 集中验证一次全部通过：类型10.84秒；8文件oxlint零错误零警告；既有“natural economic frames…”场景1.13秒（进程1.61秒，exit0）。该场景的势力阶段已移除recording替身，验证默认Runtime接线、暂停/记忆边界/真实天数转换、队列行为、checkpoint恢复与错误身份拒绝。其它管理器/位置仍是明确recording适配器，因此不称完整世界或可玩航行通过。日志artifacts/faction-frame-check-1790046565691.log。没有重复运行、全套、新测试工程、浏览器或桌面操作；检查进程均已退出，暂存区为空。
- 本块没有UI变化，无新视觉等价结论。仍需完整世界调度、默认新世界、生产成本/产能/月底制造和交付及原版生产UI；完整HUD/星体背景、战后关闭、势力/自创势力/殖民地和独立/合作联机仍未完成。完整目标保持进行中，readyForAuthority=false；生涯内容未提交/推送/打包/发布。


## 角色、重要人物与限时监听器自然帧：实施前最小对照（2026-09-22）

- 当前主地图沿用已查看的用户原版0.98a-RC8截图，全屏空间/底部导航不变；本块无UI改动。静态截图不证明暂停或时间语义，不操作桌面补验。
- CampaignEngine.java:987–1013先ImportantPeople/UIData，再未暂停时TimeoutTracker.advance(days)，经济之后PlayerCharacterData.getMemoryWithoutUpdate().advance(paused?0:seconds)，再势力、时钟。PlayerCharacterData.java:122–126会懒建自己独立的Memory，不能混用Person的Memory，也不能误用Sector的教程标志。Memory.java:134–147在暂停早退之前恢复引用。历史角色捕获仅有选定查询投影，不能当完整Memory。
- ImportantPeople.java:64–74暂停立即返回；未暂停先seconds→days，未advanced的人调用Person.advance(days)，随后每个person.advanced=false。Person.java:201–205再把参数交Memory.advance，它又转换为days。本机starfarer_obf.jar的javap已确认ImportantPeople字节码18/62处传递的是convertToDays结果，保留这条原版二次换算，不擅自“修正”。:82–126按人ID维护缓存、列表与PersonData身份；PersonData:271–297保存person/location/checkedOutFor，location设置market/entity时清另一指针。
- CampaignEngine.java:1175–1190限时监听器重复add不会延长期限，remove同时移出saved/transient/timed；getListenersCopy:2039–2043顺序为saved→transient→timed。API util/TimeoutTracker.java保留有序ItemData列表，advance以float减days，remaining<=0删除（不同于Memory的<0）。getRemaining会创建零时间条目；add(time,limit)只对正增量应用上限并最后钳零；普通add不钳零。
- 当前差异：角色Memory、ImportantPeople和限时监听器都依赖引擎外部回调；world.campaignListeners.timed只有监听器列表，没有完整剩余时间。实现真实持久态/显式绑定和默认推进，保持旧未知状态不可静默补空。限时Tracker与现有world监听器名单共用对象并同步顺序，过期后应影响真实事件派发。人物与市场/实体引用须指向现有Runtime对象，不另外克隆。保留明确服务替换供大改。
- 复用既有natural economic frames场景扩展默认接线检查：实际角色记忆、人物advanced与二次换算、暂停、监听器严格零边界/不续期/派发名单、同一checkpoint恢复与失去身份拒绝。完成一块后一次类型/改动lint/该场景，不新增测试工程或可见窗口；其它尚未实现管理器仍明确缺失，不称完整世界已启动。

### 角色、重要人物与限时监听器：实施结果

- Runtime默认引擎现已接PlayerCharacterData独立Memory、ImportantPeople与实际world legacy限时监听器。角色Memory通过已知characterRef显式绑定，getMemoryWithoutUpdate才懒建；未知历史不补空。Person Memory、CharacterData Memory、Sector教程标志保持分离。暂停角色记忆仍先恢复引用而不扣期。
- 新Engine构造持有真正空ImportantPeople；历史Engine缺字段仍未知。名单按PersonData及ID缓存维护，add/remove不复制人物；恢复核实当前人员、市场/实体及cache的共享身份。推进保留原版advanced检查/清除和已用javap确认的二次时间转换，暂停不触碰advanced。该实现不声称已接任务专用getPerson挑选器。
- 新增可复用TimeoutTracker的float计时规则以及与现有campaignListeners.timed共用身份的绑定。原版重复注册不续期、<=0删除、saved/transient/timed顺序和remove跨三类名单行为均保留。默认世界事件派发现在实际读取过期后的名单，不是只修改独立测试计时器。旧的只有timed列表、没有剩余时间的历史继续显式拒绝自然推进。没有新增HTTP权限入口。
- 15改动文件oxlint通过。唯一既有natural economic frames场景首轮只因新增XML夹具误用非数字XStream z身份失败；改为数字ID后仅复查脚本lint与同一场景，1.59秒通过（进程2.07秒，exit0）。覆盖三段默认Runtime/Engine接线、暂停、真实事件派发名单、记忆分离、人物advanced与二次转换、checkpoint共享身份及未知/拆散状态拒绝。夹具是明确测试当前角色，不是正式新世界。
- 全项目类型检查仅报告本轮未改动的vite.config.ts:1已有并行改动错误：combat-replay-build相对导入缺显式扩展名（TS2835）；没有替其它任务改该文件，也没有宣称类型全通过。日志artifacts/engine-managers-check-1790047363009.log记录原失败与定向复查。无全套、新测试工程或可见窗口；所有本轮检查进程已结束，暂存区为空。
- 世界仍缺Intel/Event/UI等完整默认管理器、实际脚本/AI与世界调度接线；未启用自动持续航行。原版新游戏、星体背景/HUD、完整战后处理、势力/自创势力、殖民地和独立/合作联机仍未完成。readyForAuthority=false，完整目标继续进行；未用测试管理器/记录回调冒充可玩世界，无子代理、桌面操作、私人存档访问或提交推送打包发布。


## 情报队列、通信范围和基础结束脚本：实施前对照（2026-09-22）

- UI证据仍为已查看的0.98a-RC8主地图截图：左侧有任务/发现消息，底部情报入口。当前没有原版情报面板完整状态截图，不发明新面板；本块只接真实队列、消息意图与自然帧，不能把意图队列称为已显示/播放。
- IntelManager.java:67–103暂停或无玩家舰队时整个推进早退（连清理也不做）；每轮一次真实通信范围查询，遍历queue快照，先canMakeVisible再forceAdd、排除已经在intel里的对象。<=4条全部通知；>=5条仅前三条单独通知，其余静默加入，再发NewMessagesIntel(n-3)。逐条add后清force并移出queue，最后清shouldRemoveIntel。:179–212重排队移到尾、delay参数实际上未使用，addIntel本身不unqueue；先timestamp和仓库加入，再madeVisible回调，再消息。:238–242从任一仓库移除才调用一次reportRemovedIntel。
- BaseIntelPlugin.java:48–59默认nullable标记；isEnded/isEnding看布尔真，forceAdd/hidden则看非null。:259–264未公开但正在ending的情报可移除；:437–491教程查Sector Memory.contains($tutorialRespawn)，不是角色记忆；无posting仅靠中继，系统内同位置可本地接收，超空间无中继时距离严格<commRange、有中继时<=postingRange。:62–123基础结束脚本按天倒计时、<=0结束，runWhilePaused=false；加入情报并不自动注册EveryFrameScript，保留分离。
- IntelManager.java:273–314系统内任何正常中继都可接收（只用距离挑最近，不设置局部硬距离上限）；超空间先本地中继，再1ly内星系的正常中继，星系候选用new Random.nextInt挑选，且选择消耗必须保留。settings.json实际unitsPerLightYear=2000、maxRelayRangeInHyperspace=1、commRelayRangeAroundSystem=1。以当前权威世界实体/标签/Memory和星系超空间位置读取，不以屏幕可见性或传感距离代替通信范围。
- 默认Runtime需绑定同一IntelManager与已实现BaseIntelPlugin状态，并给Engine接基础情报脚本isDone/runWhilePaused/advance；未知插件仍要求实际方法服务，绝不吞掉/空回调。通信空间、随机、插件服务保持可替换。Web消息意图持有同一情报对象、序号持久化，尚不公开给未经筛选的多人页面。
- 验证只扩展既有natural economic frames场景；验证排队顺序/批量阈值/时间戳/回调顺序、结束与清理、暂停/无舰队、严格距离边界、默认Runtime队列/基础脚本接线和checkpoint共享身份。明确区分规则用空间夹具与完整世界实机。事件管理器已核对但仍待后续完整接线，不将其称已完成。


### 情报队列、通信范围和基础结束脚本：实施结果（2026-09-22）

- 新增OriginalIntelManager，保留原版IntelInfoPlugin有序视图：重排队移尾、忽略stock delay、addIntel不自动unqueue/注册脚本、先写时间戳与加入再madeVisible再消息、从任一名单移除只一次removed回调；清理与打开通知使用两个独立快照。此处不是通用Java ObjectRepository移植，尚未提供任意Java class索引/排序/情报面板。
- 默认Runtime/Engine已持有同一管理器并自然推进。暂停或真实playerEconomy.fleet为空时不接收也不清理；一轮只查一次中继范围。<=4条全部通知，>=5条只前三条独立通知，剩余静默再NewMessagesIntel(n-3)，原版addToTimestamp实际恒零不虚构间隔。nullable forceAdd/hidden的非null语义、教程Sector Memory.contains而非CharacterData/Person标志均保留。
- BaseIntel/NewMessagesIntel默认结束脚本已接真实Engine isDone/runWhilePaused/advance：注册与addIntel分离，按真实Clock秒转天，暂停不扣期，结束后脚本先移除、下一次IntelManager阶段再清情报。未知任务子类仍需要真正插件服务，不假装默认BaseIntel。业务插件与空间/通信服务可替换；非null textPanel要求真实实现，不伪造提示框。
- 当前世界通信适配读取实际已登记舰队/吊舱的entity.tags、Memory、containingLocation及position，星系超空间坐标读取routeSpace，正常relay才参与；系统内没有局部硬距离上限，超空间按原版1ly范围/严格最近和new Random.nextInt挑选。原版settings范围及四个源码/资源哈希记录在reference-intel-manager.json。世界当前尚无完整静态星体/中继实体建图：其它实体类必须接对应真实空间服务，本块不代表正式完整星区已存在。随机默认接既有newRandomSeeds源，边界场景检查了选择调用次数；没有原版实机随机轨迹复核。
- Web消息仅为服务器内部持久messageIntents（有序序号、原情报对象、INTEL_TAB点击目标），没有新增HTTP暴露、实际绘制、声音或已送达声明。clear只清管理器仓库，不清已有消息意图，符合原版clear不清CampaignUI消息的职责分离；后续真正呈现层还需消费/确认和每玩家隔离，不应无限保留。当前不开放未筛选的多人情报。
- 新Engine构造真正空manager；历史checkpoint缺字段保持未知，默认推进拒绝猜空。存档继续schema34，通过已有图编码保存同一个intel/queue/script/message及点击目标身份，并拒绝同objectRef拆成多个对象；posting指向已知世界对象时检查身份。没有读取私人存档。
- 集中检查：全项目类型通过（此前其它任务的Vite导入问题现在已修正，本轮未改Vite）；11改动文件oxlint通过。唯一既有natural economic frames场景初次在新增的更长推进中发现旧测试只登记了player/neutral、导致移民阶段缺independent；仅在隔离情报夹具补齐该夹具原有factionIds及空新势力帧，未改正式经济规则。单脚本lint与同一场景定向复查通过，场景1.97秒、进程2.50秒。日志artifacts/intel-manager-check-1790048647001.log保留首轮和定向复查。无全套/新测试工程/可见窗口，检查均已终态。
- 验证区分：默认管理器/基础脚本/Clock和checkpoint是实际实现；通信边界使用明确空间夹具，其它未接引擎阶段仍为显式记录适配器，并非完整游戏实机。已重新查看用户0.98a-RC8原图，未改变UI；完整情报面板状态仍待原图/实机对照。
- 事件/UI管理器、任务子类、完整背景/星体/HUD、新游戏、持续世界航行、完整战后关闭、勢力/自创势力、殖民地、独立/合作多人仍需接齐。readyForAuthority=false，未宣称生涯模式完成。无子代理、桌面/键鼠操作、暂存/提交/推送/打包/发布。


## 原版事件调度与概率生命周期：实施前对照（2026-09-22）

- 原版0.98a-RC8 CampaignEventManager.java:89–115：暂停整体早退；秒转天推进util.IntervalTracker(1,1)，到期先翻转checkWarning（初始true，所以第一轮是event check），每次只检查一个，不按超额时间补循环；检查后按eventCheckInterval/max(1,size*2)的0.5..1.5重置。最后按ongoing快照advance，收集done后统一cleanup/remove。:117–125 endEvent分正在进行/概率表两条路径，cleanup之后才移除。
- :128–153概率检查在maxOngoing和isOngoing之前执行并消耗随机；成功先加入ongoing、设触发前概率、startEvent，随后移出概率表，即使刚启动也参与本轮ongoing快照。失败概率<=0才cleanup移除。:230–246预警独立索引/键快照，>=1 likely，>0.25 possible，primed不排除预警。:155–198 prime与start互不等价，start不检查maxOngoing，allowMultiple只用于target重载。
- EventProbability.java：初始0、primed=false；倍率来自当前spec，不缓存。随机成功归零，失败减半后有效概率<0.01归零；setProbabilityAfterMult在mult<=0不改值。CampaignEventTarget.java采用实体/位置身份及custom/extra equals，Pair.java使用31多项式hash，HashMap keySet不是插入顺序；不以数组顺序冒充JVM顺序。新状态可按Java链桶规则维护已知键，未知对象hash/equals和树桶必须显式提供完整适配或拒绝，不猜原存档身份散列。
- util.IntervalTracker.java与api.util.IntervalUtil不同点是后者可持有独立Random；本块使用前者。每次nextInterval都调用(float)Math.random，哪怕min=max；advance在上轮elapsed后才重置，丢弃超额时间，不提前更改intervalElapsed语义。Collections.shuffle用独立持久Random，和Math.random不混用。
- 实际settings.json eventCheckInterval=30；events.json只启用rep_tracker、nearby_events。旧悬赏/教程/委托/动乱等已注释并迁往Intel/condition，不在本块重新开启。BaseEventPlugin默认advance为空且isDone=false，但不能据此将RepTrackerEvent/NearbyEventsEvent未知行为当空实现。
- UI继续以已查看的用户原版主地图左侧消息/底部情报入口为准；没有事件详情完整状态图，不重绘或发明面板。本块处理运行态/真实回调，任何预警报告适配不是已显示消息。
- Runtime显式绑定真实新manager与现有Web随机分支（不是原JVM未捕获的随机轨迹）；旧存档缺状态保持未知。保留插件、目标空间、Java自定义键服务供大改。唯一既有natural economic frames场景扩展检查默认接线、暂停、索引/随机、概率/上限/预警/cleanup次序与checkpoint身份；其它缺失管理器仍标明测试适配器。完成整块后集中类型/改动lint/同一场景，不新增测试工程。

- 补充关键核实：当前安装jre/release为Zulu Java17.0.10；CampaignEngine.java:1836–1845的reportEventStage最终重载是空方法，用本机javap确认字节码只有return。因此默认旧事件预警报告应保持无UI效果，而不是新造左侧通知；扩展服务可以另行实现，但不能称原版。普通任务提示继续走上一块Intel。HashMap链桶按Java17尾插/resize拆桶顺序实现，树桶暂显式拒绝，未声称通用Java HashMap完整移植。


### 原版事件调度与概率生命周期：实施结果（2026-09-22）

- 新增OriginalCampaignInterval、OriginalCampaignEventKeys、OriginalCampaignEvents与OriginalBaseCampaignEvent及类型声明。默认Runtime/Engine现已调用实际事件管理器；显式新建/绑定后保留计时器、两个键快照/索引、checkWarning、概率表、ongoing名单和随机状态。构造固定1天计时器也消耗一次Math随机；期满后只处理一个检查再重置，不虚构补跑所有事件。
- EventProbability已实现实时spec倍率、设置/增減/afterMult、成功归零、失败减半及严格0.01阈值。周期检查保留先roll再检查ongoing/max的顺序，达到上限也会消耗概率并cleanup；自动启动以检查前概率调用插件。prime不启动也不roll，仍可经过预警阶段；显式start不执行maxOngoing门槛。新启动事件参与当轮ongoing快照，done统一收集后cleanup，再逐个remove。
- key使用原版CampaignEventTarget.equals/Pair.hashCode，Java17普通HashMap链桶维护capacity及插入顺序，按桶序构造keySet再Collections.shuffle。目标自定义值为字符串/布尔可默认计算，其它Java对象hash/equals必须有真实服务；未捕获的对象identityHashCode不以objectRef假造。发生树化所需复杂碰撞时明确拒绝，未宣称通用Java HashMap完整移植。可变目标导致hash改变时旧条目不可用新hash找到，保留原版语义。
- createNativeCampaignEventManager默认绑定既有personFactory的Web Math/newRandomSeeds对象，Collections.shuffle独立随机惰性初始化（空/单键刷新也初始化），checkpoint保存共享身份；显式绑定另一个已知随机分支用于扩展/夹具也保留标记。runtime-shared恢复校验同源对象，旧缺失事件/随机历史不补造。存档schema仍34，新增Engine字段为可选但自然推进要求真实完整绑定。
- BaseEventPlugin只实现它自己真实的UID、init/statModId、目标绑定、saved监听器注册、start和cleanup移除。Base默认advance确实为空/isDone=false；RepTrackerEvent与NearbyEventsEvent绝不按Base静默跳过。两个实际启用插件、其交易声望/XP、附近遗骸/求救仍待移植。null target所需LocationToken目前也要求真实创建服务，不猜原版随机坐标/身份。
- 原版当前reportEventStage最终重载字节码只有return，因此默认预警报告无UI效果，没有制造额外通知或改变用户的原版布局。自定义预警服务可以扩展，但不是原版画面验收。普通任务消息仍应走Intel；没有恢复已停用的旧悬赏、教程、委托等事件。
- 集中检查一次即全部通过：全项目类型、13改动文件oxlint、唯一既有natural economic frames场景；场景2.93秒，进程3.49秒。覆盖默认事件推进和暂停、概率/倍率/primed/并发上限、显式启动与统一清理次序、真实Base监听器注册移除、存档事件/目标/监听器身份与随机状态、未知stock插件拒绝，以及计时/键查找边界。插件done/advance使用明确探针，非完整任务实机；其它未完成引擎阶段仍为显式测试适配。日志artifacts/campaign-events-check-1790049579325.log。未运行全套或新增测试工程，所有检查进程已结束。
- 生涯仍未完成：真实启用插件、完整新游戏/静态星区/星体/原版HUD、持续航行、完整战后关闭、势力/自创势力与殖民地、各自行动/合作联机等仍需接齐。readyForAuthority=false，未开放不完整确认入口；没有子代理、桌面/键鼠操作、私人存档访问、暂存/提交/推送/打包/发布。


## 贸易声望与盈利经验：实施前对照（2026-09-22）

- 重新查看用户0.98a-RC8主地图截图；只证明主地图消息区和底部入口，不证明交易结算面板。此块不新建UI，消息接真实服务，不能把内部通知当成已显示。
- RepTrackerEvent.java:47–227：init先建130–170天repDecayTracker再建3–7天tracker；前者未在advance推进。未started早退；后者到期按实际allFactions顺序跳过player/neutral，逐势力结算后发放盈利XP。合法与走私共用每势力递增门槛；净点数<1仍保留门槛变化，但不扣累计金额。非零时按value-used*value/total的Java float次序分摊。
- 同文件causeNegativeRepChangeWithEnemies：市场按(int)(b.total-a.total)稳定排序；每市场复制全势力再Collections.shuffle，与事件管理器共享惰性随机源。actionable=trade*2+smuggling*.5；先读取势力custom.optBoolean再跳过player，最近敌对市场等距保留先遇者；默认范围0LY，同系统点数翻倍，最多发三次（不是最多三个实际声望变化）。
- CoreReputationPlugin.java:189–203,829–836：贸易增益上限WELCOMING、至少INHOSPITABLE；走私降至INHOSPITABLE，资敌降至HOSTILE。原版信封withMessage=true、addMessageOnNoChange=false，保留原中文reason。
- PlayerTradeProfitabilityData.java：LinkedHashMap平均成本、先扣买入量后算利润，正利润按float乘0.25再cast long，accruedXP按signed long累加。月度IntervalUtil到期才乘0.9、数量<1删除。推进由PlayerActivityTracker承担，不能在RepTracker中再推进一次。发XP先清累计、再原文消息、再CharacterStats.addXP。
- api.util.IntervalUtil与util.IntervalTracker不同：可绑定Random.nextFloat，默认Math.random；保留上一轮latch触发重抽、无追赶循环。settings.json:273,303,351–355对应0.9、30天、门槛100000/1000000/100000、XP系数0.25、范围0LY。
- 当前尚无完整PlayerActivityTracker/PlayerTradeDataForSubmarket和子市场原始顺序、plugin经济/黑市状态、Faction custom历史；继续要求真实输入服务，不把三个零计数或零经验补造成历史。接默认RepTracker插件和持久内部状态，未知输入仍拒绝；盈利账本实现完整独立类供真实Activity引用，不伪造Activity对象。
- 验证仅扩展既有natural economic frames场景，一块完成后一次类型、改动lint、该场景；包含浮点分摊、净零副作用、资敌上限、XP顺序、自然帧与checkpoint身份。完整交易UI/实际收据链和Activity管理器另有缺口，不以本块通过宣称完成。


## 主地图正常空间背景与三层星空：实施前对照（2026-09-22）

- 用户主地图截图QQ20260919-165600.png已查看：背景覆盖主视口，星体/舰隊与HUD叠在其上，不是CSS卡片或背景上另一个透明地图。当前正式NativeSceneCanvas尚为黑底，本块将真实已绑定BaseLocation背景接入同一RGBA目标。星体尚缺原生实体注册，不拿旧reference世界的星球DTO混入。
- 原版BackgroundAndStars.java:41–75、94–112、121–161、180–206；BaseLocation.java:175–181,271–277,401–418,581–583；CampaignState.java:1652–1662：背景->updateStarfield->三层星空->实体。背景非视差图片，按贴图尺寸/UI缩放、先宽后高扩大至覆盖视口；随机offset裁切，换图重算；UV四边内缩0.001。原版正常背景graphics/backgrounds/background4.jpg。
- combat/OOOo.java星点三层构造前两层屏幕尺寸、第三层1×1；密度area/10000*.25带一次概率舍入。尺寸两个(float)Math.random相乘*4.5+6.5，位置用double后cast int；即使只有白色仍消耗选色随机，另一次亮度随机被钳到1再*.75。颜色191,191,191,200；4种texture随机均分。视差更新坐标为LL、LL/2、LL/4；后两层绘制平移LL/2、LL*.75。20单位缓冲/19单位补条阈值、补左/右/上/下再清理，不重随机整屏。
- fs.common SmoothParticle.java真实居中方形、UV0..1（含POT padding）、SRC_ALPHA/ONE加法；原版BackgroundAndStars从不advance三层星点组，不为星点加寿命倒计时。ColorShifter复用已移植OriginalFleetViewShifters并由真实Location自然帧推进；观察请求只读curr不推进世界。
- 正常空间背景绑定明确的原版texture、两种shifter；观察者持有transient星空与裁切随机，跨revision保留，换位置/撤权清除，不消耗权威RNG。旧只有advance字段/缺背景绑定保持未知，不能自动填成默认图。超空间WarpingSpriteRenderer尚未移植，保持明确未支持，不用正常空间图冒充。
- 验证只扩展已有native personnel…场景的实际ScenePresentation->HTTP->NativeSceneCanvas路径，加随机/裁切/视差/身份与颜色断言，集中一次类型、改动lint、该场景（含无头截图）；不新增测试工程，不启动可见窗口，不提交发布。

### 正常空间背景与三层星空：实施结果（2026-09-22）

- 新增reference-campaign-background.json锁定原版来源/贴图尺寸与SHA256，OriginalCampaignBackground接真实默认background4及已核对的Corvus background2、四种星点贴图。所有贴图已存在且场景按真实返回资源逐一核验，没有改图、生成替代图片或全量覆写资源清单。
- NativeCampaignRuntime.bindNativeLocationBackground/setNativeLocationBackgroundTexture作用于既有真实LocationFrame；颜色shifter复用原状态，由既有Location.advance推进。本轮不建立另一份世界，不把正常空间背景绑定到hyper，不给缺失历史自动补默认。checkpoint恢复验证来源与所属空间，保持原管理器/位置身份。
- NativeScenePresentation发布授权观察者background层；正常背景与三层OOOo星点按原版几何进入同一NativeFleetRenderer目标，先背景，再吊舱/舰队/接触。不混入旧reference-world星体。按strip规则维持视差/边界并保留视图随机，navigation提交及Runtime重绑不重置裁切。跨位置/撤权丢弃旧视图，观察只读authority；星点生成是原版过程纹理呈现，不是虚构世界实体。
- 两种颜色shifter、透明星点早退、SRC_ALPHA/ONE、贴图UV padding和背景UV内缩已接。原版readResolve的屏幕相关视觉随机改为各观察者独立transient分支；Web尺寸变化重算背景覆盖尺寸/裁切，不影响玩法RNG。本轮仅正式入口现有1:1视口，尚未加入缩放/过渡混合或超空间WarpingSpriteRenderer。
- 收尾源码审阅发现setBackgroundOffset不应持久成世界override：已改为只设置observer的bgOffset，换图spriteUpdated重新随机裁切；移除错误的Runtime偏移写入接口。对该修正仅做直接定向断言和5文件lint，通过；未再跑全套。
- 一次类型、9文件lint通过。唯一既有native personnel场景首次在背景绑定时明确拒绝旧超空间夹具，没有放宽生产校验。将此场景中的实体通过真实remove/add注册移到显式新增的正常BaseLocation，并补对应routeSpace位置，未修改原位置hyper标志或原观察场景。仅复查脚本lint及同一场景，93.97秒通过；真实Worker/SQLite/HTTP/页面导航、回执重试和revision裁切连续性均覆盖，pageerror为空。
- 已查看1920×1080无头正式页面截图artifacts/native-scene-background-1790055545458.png：原版正常空间背景和星点、实际舰体/尾迹/吊舱在同一画布中可见。它是明确正常空间开发场景，不是Corvus/新开局；不声称与用户原版截图像素一致。完整记录artifacts/campaign-background-check-1790055545458.log。所有本轮进程已结束，暂存区为空。
- 完整新游戏、真实星体实体/光照、完整HUD/核心导航、持续世界推进、完整战后退出、势力/自创势力/殖民地与独立合作联机仍未完成。readyForAuthority=false；没有用背景改善冒充可玩的生涯，无桌面/键鼠操作、子代理、私人存档读取或提交推送打包发布。上一节交易声望/经验仍只有实施前对照，未写完，不计入完成。


## CampaignPlanet 真实世界接入：实施前对照（2026-09-22）

- 已重新查看用户 QQ20260919-165600.png（0.98a-RC8）：星体是世界中的球体，位于舰队/HUD后方；截图不证明构造/轨道/存档语义。本阶段不改布局、不借旧 BodyRenderer 把星球贴到正式世界。
- 原版 CampaignPlanet.java:53–70、135–170、217–225、275–324；combat/entities/terrain/Planet.java:127–150、864–870；BaseCampaignEntity.java:595–624：星体使用真实 BaseCampaignEntity，构造旋转随机只写 graphics，保存角仍0；advance 先基础接触/脚本/市场，再球面自转，再保存角度并复制位置；正时间清除第二光源，零时间保留。世界位移/轨道在 BaseLocation 其后推进，不能在星体内再积分一次。
- PlanetSpec.java:135–181 和 loading/String.java:180–188、254起：以构造器默认而非字段初值为准，reverse glow默认false；RGBA缺省白，lightPosition缺省零，shield两层为Java字段默认null/0。getSpec懒克隆、applySpecChanges保留待编辑与已应用两份，不能未apply就影响渲染旋转。配置来自本机 planets.json，不把旧6种精简visual DTO冒充完整规格。
- BaseLocation.java:343–383、588起、941–943：对象仓库共用、类索引按真实继承；PLANETS/ABOVE分层，非舰队无FleetData/ability-renderer及spawn/despawn回调。星体/恒星/卫星焦点用于真实光源选择。ScenePresentation未移植球面前保留 bodies-unavailable，不伪造已完成画面。
- 当前差异：world、自然帧、导航、情报空间读取仍有fleet/pod二分；本块接真实星体构造/规格、注册、自然帧、传感器、引用恢复和显式Runtime入口。绘制的固定管线材质/球面/大气/光晕将依原版另接同一个RGBA目标，不用近似旧renderer替代。
- 验证：只扩展既有 native personnel rosters drive 场景，用复制的实际Runtime加入明确测试星体，检查注册/光源/轨道/零帧/正帧/可见性/共享checkpoint；集中一次类型、改动lint、该场景。测试实体不等于完整Corvus新开局；不跑浏览器、不启动可见窗口、不提交发布。

### 星体接入补充证据与当前实现

- BaseCampaignEntity.java:142–145：显式id不消耗Misc.genUID，只有null才生成。Runtime采用独立world.planetSerial作为Web对象标识，显式id不改变原版UID序列；旧无planetSerial且无星体的世界只在创建新星体时初始化Web计数，不能为已有星体伪造历史。Faction.java:110的NO_FACTION是独立new Faction("neutral")，公开factionId可为neutral，但不把该静态对象冒充世界中可变neutral势力。
- ObjectRepository/FastIterationClassifier核对：具体类、全部父类与接口进入索引，class分类集合本身是HashSet；各类内部对象仍遵循添加顺序。本次加入CampaignPlanet/PlanetAPI而非fleet/custom索引；renderer重建不创建舰队abilityRenderer。
- 已提取45种本机原版PlanetSpec配置（保留来源SHA256），loader补原版构造默认值；自定义定义可经readPlanetSpec提供真实规格。此处不是全部PlanetSpecAPI：未移植changeType、原生Java存档的spec diff/readResolve导入、sourceMod元数据；Web checkpoint保存运行中的graphics/待编辑spec/已应用spec及角度，不在每次HTTP重建时误执行原版load语义。
- 实体帧接复用ContactIndicator/BaseEntity尾部；星体自然帧不使用舰队色初始化；BaseLocation统一处理轨道和位移。真实planet/二级轨道焦点默认选择恒星光源及lightColorOverrideIfStar；渲染层登记PLANETS/ABOVE。导航/遭遇半径/情报空间读取/授权观察均认识星体，不借FleetData代理。
- 本轮星体验证放在复制的明确测试星系中，一次性绑定真实构造的全局玩家以匹配原版上下文；另一个控制玩家仍用观察者上下文，不修改单例。没有创建正式新开局。ScenePresentation保留bodies-unavailable，球面、大气、光晕仍待后续同RGBA目标接入；不能把当前星体数据通过当成画面已完成。

### CampaignPlanet 本轮验证结果（2026-09-22）

- 一次类型检查通过；16个改动代码/声明文件lint通过（0错误、0警告）；唯一既有native personnel rosters drive current wages场景通过，场景71.89秒/总进程72.51秒。无重试、无全套、无新测试工程、无浏览器或桌面操作。日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-planet-check-1790058766310.log
- 新增断言验证了真实星体仓库/类索引/PLANETS与ABOVE层；重复添加及renderer重建不重复注册；不构造FleetData、不消耗显式id对应的Sector UID；构造随机旋转与保存角分离；getSpec/applySpecChanges两份规格；零帧保留第二光源、正帧清理；二级轨道选择伴星；graphics位置在世界积分之前复制；暂停不推进；checkpoint保留轨道/光源/ContactManager/中心星身份和旋转阶段；拆分光源引用被拒绝；控制玩家导航和观察隔离；过期移除保留原版containingLocation语义。
- 原版界面仅核对用户截图，未操作原版实机；此轮未改球面显示，不新增效果截图。ScenePresentation仍标注bodies-unavailable。正式星区生成、新开局、完整UI/持续航行/势力与殖民地/独立合作/完整战后关闭仍未完成，目标保持进行中。
- 生涯改动未暂存、提交、推送、打包或发布；集中验证已终态，没有本轮活跃验证子进程。

## 2026-09-22 原生星体主地图绘制接入结果

- 已完成：CampaignPlanet 的 PLANETS 球面（三次 surface）、昼夜主光/双星第二光、云层、reverse glow、双 shield 与64段大气；恒星光晕严格在 ABOVE。客户端用32段 GLU形网格、逐顶点照明与同一 RGBA scratch FBO；没有用旧演示世界叠图。
- ScenePresentation 在真实鉴权 observer 所在位置读取已注册且可识别星体，按原生 renderer 层内顺序输出；SENSOR_CONTACT/未见星体不暴露图纹或类型，匿名星体 contact 仍明确未接。图形相位、光源及已应用纹理来自实际对象/检查点，不以请求时间推进世界。
- 新增45项已核对的图像 descriptor，没有覆写资源清单。已应用纹理/glowColor缓存与 pending spec 分离；旧无缓存 checkpoint 的只读退化边界见 source-notes。
- 集中验证：tsc通过；11改动代码文件 lint 0警告/0错误；唯一既有 native-save 人员/世界场景扩展了本轮绘制、缓存、双灯、权限与恢复。首次UI导航在20秒冷启动等待处超时（尚无API请求）；只对同一场景调整首次加载为DOMContentLoaded/60秒并补启动诊断，交互仍20秒。复查通过：场景88.366秒，进程88.946秒；点击导航、丢回执同requestId重试、重新连接、无GPU错误/页面异常均通过。未跑全套。
- 实际截图：artifacts/native-scene-planets-1790060070887.png（1920×1080，已人工查看）；能看到球面、向主星的亮侧、大气、恒星球面/光晕、舰队与吊舱共同绘制，无空白球或反面剔除问题。此为显式正常空间开发夹具，包含spec编辑验证，不是Corvus默认开局或原版同状态像素对照。
- 日志：artifacts/campaign-planet-draw-check-1790060070887.log。包含首次启动脚本环境引用错误（检查未启动），随后实际tsc/lint/首次UI超时及单场景复查结果，未抹除失败记录。
- 仍未完成：正式新开局与静态星区、自动世界tick/持续航行、完整原版HUD与页面、战后确认最终结算、完整AI/任务、势力/自创势力/殖民地、独立与合作联机。readyForAuthority仍false，不将此模块验收视作完整生涯交付。
- 本轮没有子代理、桌面输入、暂存/提交/推送/打包/发布；无头浏览器/Vite/检查进程已结束。

## 2026-09-22 实时推进前的常驻权威对象图（实施前对照）

- 原版证据：0.98a-RC8 CampaignEngine.advance:973–1060 持续推进同一个 Engine/Location/Fleet，经济在clock之前；CampaignFleet.advance:681–834 在Base/维修/补给后推进 movementModule，而非单独坐标插值。已查看用户原版截图，本轮不新增/更改UI布局，也不以截图推断暂停联机规则。
- 当前关键差异：Repository对状态/观察/指令分别从SQLite重建NativeCampaignRuntime，scene还单独缓存另一份Runtime。直接启用定时器将持续解码大对象图，且观察与写入不是同一运行实例。完整自然帧仍有真实manager/AI/能力/遭遇依赖，不允许以空回调假装完整推进。
- 本轮实施：在唯一数据库Worker中保留有界、按revision与epoch校验的常驻Runtime，状态/已授权指令/scene共享同一已提交对象图。成功指令只checkpoint+原子SQL提交；失败必须先SQL回滚，再丢弃污染实例并从已提交记录恢复；不能仅回滚revision数值。查询/读取错误若污染Runtime也丢弃，普通权限拒绝不开放内部引用。
- 场景连续性：同对象图的提交也校验控制权/所在位置/实体存活；回滚重建允许专用的同已提交revision恢复，不放宽正常replaceState的版本约束，保留观察者已有fader/RNG轨迹。所有公开结果仍detached不可变，无新HTTP调试对象接口。
- 验证：只扩展既有native-save人员/世界场景，覆盖构造计数、读/写/scene共享、规则错误、SQL失败、同requestId重试、同revision回滚、缓存驱逐及epoch fencing；一次类型检查、改动lint、该单一场景。不为此重新跑UI截图。
- 范围边界：本轮解决实时世界推进的持有者/失败恢复前提，不直接启用缺少完整服务的自动tick，不改变多人暂停或单人经济语义，不称为已经能持续航行。

### 常驻权威状态本轮验收结果

- 已通过：一次tsc；4改动代码文件lint（0警告/0错误）；唯一既有 native personnel rosters 场景定向复查通过，场景65.297秒、进程65.875秒。本轮没有启动浏览器/截图或全套测试。
- 两次具体失败已保留日志并定向修复：私有大checkpoint已由专用codec逐记录验证/冻结，不能再套公开JSON的250000节点上限（移除重复包装）；原版星空首次绘制还会补边缘粒子，不能把首/次帧整个背景相等作为缓存连续性的断言（改核对背景裁剪、sceneId、Runtime构造次数及真实恢复后的星体数据）。未修改原版星空行为来迁就测试。
- 实际覆盖：初次创建1次fromCheckpoint，随后查询/观察/scene/成功导航/同requestId重试没有额外重建；旧epoch已提交回执允许重放，新命令仍fence；失败规则已真正改坏旧对象后恢复新图；world UPDATE之后receipt SQL失败仍完整回滚；观察中原生operation失败不会毒化后续写入，另一页面sceneId保留；同对象原地变更位置也丢弃旧位置观察视图；普通同revision不同图仍拒绝；LRU逐出/再次载入和数据库authority替换均覆盖。
- 日志：artifacts/campaign-resident-runtime-check-1790061394011.log。检查进程已结束。暂存/提交/推送/打包/发布均未执行。
- 自动持续航行仍未实现。本轮没有新增伪world.advance、没有改时钟/经济/多人的暂停语义，也没有把移动子阶段当成完整引擎帧。

### 下一接入点（避免重复无边界调查）

- 已有真自然帧入口：NativeCampaignRuntime.advanceNativeEngineFrame（约1202）→ advanceNativeLocationFrame（约1080）→ advanceNativeFleetFrame（约1603），原版顺序已在OriginalCampaignEngine/OriginalCampaignFleetFrame/OriginalCampaignFleetAdvance中实现，运动核心是OriginalCampaignFleetMotion，不应另写坐标插值。
- 目前Engine还要求真实services：readdChangeListeners、ID索引、tooltip/UIData、paused market、animations/ping及遭遇/AI等；当前engine测试中部分仅为记录适配器，不是正式宿主。Fleet自然帧中的readFleetAbilities、可见性/过渡视野、接触颜色和非空能力/AI插件仍需要连接实际状态，不能空回调绕过。经济在Clock前推进；单例原生玩家与多人控制者不能互相冒充。
- Repository现在保留运行中的对象身份并能回滚；尚不能直接拿旧reference CampaignSimulationLoop跑native world（仍明确拒绝WORLD_RUNTIME_MISMATCH）。高频持久化/输入revision并发和多人暂停取舍需在真实tick接入时解决，不能以关闭校验掩盖。

## 2026-09-22 舰队航行能力（实施前对照）

- 原版证据：0.98a-RC8 BaseCampaignEntity.java:290–348 的保序能力集合、同实例脚本注册/移除；BaseAbilityPlugin:76–110、190–220、304–325 的互斥、两帧禁用和冷却；BaseToggleAbility:77–112、191–254 的float启停渐变/暂停/清理；GoDarkAbility:34–64 和 SustainedBurnAbility:34–142 的真实统计、movement velocity、memory及member-view shifter。abilities.csv两行与loading/specs/oooo_1.java:64–68默认0值核对。
- 预期：同一能力对象同时属于实体保序集合和scripts；在Base自然帧、物流/运动之前推进；暂停不推进；持续加速与匿踪按tags互斥；真实mod与view shifter按源id修改/清理；checkpoint恢复不得拆分owner或脚本身份。
- 当前差异：无实际能力插件，默认readFleetAbilities依赖外部；仅记录空集合不能代表已接。此次接两种航行能力及共享toggle生命周期；未知插件继续明确拒绝，不能把应答器声望后果等当空操作。
- UI证据：已查看用户原版全HUD截图，仍未证实这两种能力的展开/悬停状态。本轮不改UI/不加自创按钮，浮字/音效/玩家启停通知输出为显式effect，尚不称为已呈现；不启动原版或可见浏览器。
- 验证：扩展既有native-save世界/人员场景，覆盖保序/同实例、启停float、互斥、暂停、真实自然帧的修正与移动、owner/script共享恢复、移除清理和未知插件拒绝；集中一次tsc、改动lint、这个既有场景。完整自动世界tick与正式开局仍不是本块交付。

### 航行能力本轮验收结果

- 新增 OriginalCampaignAbilities 与来自原版abilities.csv的两项定义；按既有 {id,plugin} 保序条目表达Java LinkedHashMap，null getter不写回。注册表与EveryFrameScript保留同一实例；默认Runtime读取真实非空集合与实际null渲染层，而非返回伪空数组。
- 实际接入：Base实体自然帧先于物流/移动推进两种toggle；匿踪修改真实detectedRangeMod并请求goSlowOneFrame，持续加速修改真实最大航速/探测/加速度并遵守前一帧entity.velocity与movement.velocity的差别。真实member-view shifter负责引擎/尾迹变化，不另写坐标插值。
- 原版边缘：两帧forceDisable；暂停不推进；native float启停；tags互斥；燃料耗尽；Memory.is(boolean)含contains恢复再getBoolean；remove的cleanup不是deactivate，applyEffect(0,0)仍保留原版的一帧slow/记忆副作用；clearAbilities(null)不擅自修正。
- 玩家通知：Runtime遍历实际campaignListeners的saved/transient/timed；非空监听器必须提供同步实现，否则明确拒绝，不以空回调跳过声望/其他逻辑。未知插件数据允许保留既有扩展结构，默认执行仍明确拒绝；没有把未知应答器等当成已实现。
- 验证：一次tsc通过；10个改动代码文件lint中发现括号错误，定向修复后通过；既有native人员/世界场景第一次发现旧战斗夹具已有{id,plugin}扩展条目，改为兼容已有表示且只对native插件强校验脚本同一性，未删旧夹具。定向复查最终通过，场景73.483秒/进程74.075秒。未跑全套、未启动浏览器。
- 场景覆盖真实完整舰队帧（能力/物流/运动/member view），接触可见性仍是明确夹具适配器；验证了实际mod/shifter、移动、暂停、互斥、同图checkpoint恢复、拆分脚本身份拒绝、未知插件拒绝。不是正式开局或自动全世界tick验收。
- 日志：artifacts/campaign-travel-abilities-check-1790062515649.log。所有本轮检查进程已终态；无子代理、桌面输入、暂存/提交/推送/打包/发布。
- 尚未接：HUD能力栏/按键、effect浮字/音效消费、观察者独立view的能力效果同步、能力进入/离开battle默认分派与AI插件；应答器/其他能力未实现。当前Web构造能力把使用中的spec快照置于图内，未实现原版transient spec按mod配置重绑定/热更，不能冒充任意历史能力导入。
- 全局目标仍未完成：自动完整世界tick、默认新开局/静态星区、完整HUD/页面、战后确认结算、任务/势力/殖民地与独立/合作联机。继续接自然帧真实依赖，不启动缺manager的假定时器。

## 2026-09-22 能力栏与鉴权输入（实施前对照）

- 原版来源：ui/newui/X.java:53–90、217–263（十槽56×56、间距3、下方12高翻页/锁定、原版holder与五页绕回）；H.java:87–168、205–242、267–313、403–415（48图标内缩4、数字标签、isUsable门禁、原版活动边线/进度/冷却、pressButton）；CampaignUIPersistentData:312–397（五页×十槽、默认空、未锁定）；AddAbility.java首个空槽分配。
- 已重新查看QQ20260919-165600.png：能力栏位于底部左侧物流区右边、核心页签上方，不是弹窗/卡片。截图仅能证明显示状态，右键重排/悬停展开未实机验证。原版按钮/holder/blank图直接复用现有game-assets，尺寸核对。
- 本轮实施：原版十槽框架、当前实际拥有的两种能力、数字快捷键、翻页/锁定与活动/进度/禁用态；保存每个controller/舰队独立的槽位配置。新Web世界才创建新UI状态并将实际能力按加入顺序放首个空槽；旧世界缺历史UI保持显式unknown，不从截图或舰队名重建原版开局。
- 服务端：只收press意图，不收客户端level/mod/时间；controller鉴权、revision/epoch/同requestId回执沿用Repository事务，返回仅己方最小能力DTO，不暴露plugin/entity图。玩家语义必须对应真实native playerFleet，尚未有玩家上下文的辅助控制舰队明确禁用，不更换全局单例冒充。
- 不改多人暂停语义。启停不推进时间，UI音效从成功的确认结果消费；完整自动world tick、右键能力选择器/重排及其他能力插件本轮不冒充已完成。
- 验证：一次类型检查、改动lint、同一个既有native-save人员/世界场景，复用其中headless UI分支，检查点击/快捷键、同id丢回执重试、权限/过期版本、恢复及1920×1080截图。无桌面窗口/输入、无子代理、无提交发布。

- UI声音使用sounds.json中四个原始sfx_abilities样本（与本机原版字节已比对）；静态网关仅补充该公开资源子目录及audio/ogg MIME，保留realpath子树/扩展名/任意JSON拒绝边界。完整音频回路、世界声音/浮字仍未接。

### 能力栏与鉴权输入：已落地范围

- 新增OriginalCampaignAbilityBar：原版5×10槽、页循环、槽重排锁与实际能力投影；原生世界外层schemaVersion=2按controller/dataRef保存布局。schema1保持abilityBars=null，不伪造历史；恢复检验完整所属关系、槽身份/字段及实际颜色。插件仍走原生checkpoint同图恢复。
- HTTP只开放native.ability.press（dataRef/slotIndex/abilityId）与native.ability-bar.change（page/lock）。槽位在当前服务端页重新解析；拒绝他人舰队、旧revision、传入level等额外字段、非真实native玩家上下文、未接监听器和未完遭遇；同步press不读取/捏造paused，也不推进时间。
- NativeCampaignApp已挂载NativeAbilityBar：原版holder/48图标/56槽/3间距、底部布局、1…0数字键、活动边线/进度/冷却；loot窗口隐藏能力栏。待确认指令先保存到sessionStorage，未知应答锁住新操作，恢复仍重发同id；回执更新最小己方状态，UI声音仅确认后消费一次。轮询/本地rAF不推进玩法。锁定仅阻止未来槽重排，不能禁用能力本身。
- 静态服务器补充公开sfx_abilities目录与ogg MIME；声音使用原版sounds.json四项bank音量/音高，声音设备失败不回滚已确认指令。世界声音/循环声音/浮字未接，不能宣称完整能力视听等价。
- 视觉已知差异：外框用实际baseUI色，活动边线尚未接原版brightUI显式覆盖/默认混色；tooltip普通正文排版、鼠标glow与五组翻页快捷键尚未完整移植。右键明确提示选择器/重排未接；未支持的已保存能力保留slot且显式说明，不替换成虚构技能。窄窗左移但没有完整小窗适配。
- 独立控制舰队可保存各自布局；只有固定真实native playerFleet可以用这两项玩家能力。未替换全局player单例来假装多人语义，独立玩家能力上下文仍属未完成。自动全世界tick、正式新开局、完整HUD/任务/势力/殖民地与合作联机均仍未交付，readyForAuthority=false不变。

### 能力栏最终验收

- 集中tsc通过；改动lint初次有3条新React警告，定向修复后3文件复查为0警告/0错误。只使用一个既有native人员/世界场景；首轮异步checkbox/路由清理失败后定向复查通过，再因截图中的开发说明遮挡能力栏修正CSS，最终同场景通过。没有运行全套/新建测试工程。
- 最后结果：89123.3083ms；子进程已结束，headless浏览器/Vite/临时HTTP服务均由finally关闭。日志：artifacts/campaign-ability-bar-check-1790064245629.log。
- 最终截图：artifacts/campaign-ability-bar-final-1790064565042.png，1920×1080。已目视复查：十槽、原版图标/holder、数字标签、翻页/锁定区域无开发提示遮挡。与用户原版截图核对的是布局/尺寸，舰队、能力集合及场景状态不同，不是同状态逐像素等价或正式新开局验收。
- 未执行暂存、提交、推送、打包或发布；未操作桌面/窗口/输入。全生涯目标仍active，尚未完成。

## 2026-09-22 世界推进依赖：原生实体索引与引擎监听（实施前）

- 原版0.98a-RC8：CampaignEngine.java:749–766（add/remove收到真实对象，惰性重建、按ID写入/删除）、783–787（每帧重绑所有活动位置的ObjectRepository listener）、973–1015（重绑→非暂停重建→管理器/经济→暂停玩家速度）、1376–1379（移除星系仅清listener并从starSystems移除，不销毁位置/实体）、1970–1999（全局缓存命中仍检查所属位置实体列表，回退按超空间→星系顺序）。BaseLocation.java:957–979（区分大小写缓存、回退不区分大小写线性扫描，重复ID不能改成唯一约束）、578（自然帧清本地ID缓存）。CampaignFleet.java:894–921（暂停时也更新真实超载航速修饰器）。
- 当前差异：引擎重绑/索引仍要求测试适配器，真实增删方法无法处理引擎自身listener；本地idMapDirty没有运行时缓存消费者，暂停速度默认服务也未连接。本轮直接补入Runtime默认服务和真实fleet/planet/cargo-pods生命周期，不增加HTTP任意对象查询入口，不把索引更新当世界tick。
- 实施约束：ID缓存像原版一样为transient，checkpoint不能保留旧图指针；引擎listener与engine必须同图同实例。已移除星系仍保留对象与原版缓存命中行为，不擅自删除舰队/更换当前地点。插件事件监听器依然要求真实实现，不能空回调。原版未覆盖的通用LocationToken/其他实体类型明确保持未接边界。
- 本轮无新UI；沿用此前已核对原版截图，纯后台身份与通知行为不声称画面新增还原。验证集中一次tsc、改动lint和一个既有原生人员/世界场景，使用实际构造舰队/星体/吊舱验证增删/重名/迁移/恢复与暂停速度，禁止另建探针工程或启动可见窗口。

### 实体索引/引擎监听已落地

- OriginalCampaignEntityIndex保存Runtime私有Map/WeakMap，不放进checkpoint。全局按hyper→starSystems建立精确ID缓存，BaseLocation有独立缓存；命中验证实体当前所属位置真实SectorEntityToken列表，不额外用expired作门槛。缓存未命中按原版位置顺序、大小写不敏感线性查找，不把ID强改成唯一约束。
- 默认引擎readd/rebuild/removeStarSystem已从记录适配器改为真实实现，repository.listener直接引用同一个engineFrame实例。新引擎带实际Sector objectRef；旧engine没有该元数据时仅从已知world.sectorRef补回身份，不重造frame/history。恢复验证拒绝split listener/engine同名不同对象。
- Fleet、Planet、CargoPods增删及自然过期清理已使用默认原生仓库回调；显式服务仍可替换供大改，未知非引擎listener依然拒绝，不提供静默空回调。内部nativeEntityById/nativeLocationEntityById没有开放成HTTP玩家查询，以免绕过传感器或权限披露。
- 保留原版非直觉边界：objectRemoved按当前ID删除键，不要求缓存值正好是该对象；setId仅改字段（BaseCampaignEntity:469–475），旧键如果仍命中活对象可继续返回；removeStarSystem只清listener/移除星系列表，保留位置、实体、currentLocation与仍有效的缓存条目，读档后transient缓存才重新按当前星系列表构建。activeThisFrame元数据留在原位置而不是删掉；移除队列允许已移除的真实星系重复排队。
- 暂停引擎默认调用已有原版updateOriginalFleetOvercapacitySpeed，读真实native player的货物/舰船/容量和mod，不更新时间或位移。其同步依赖沿用真实舰队服务；没有替换全局player来处理另一个controller。
- 类型检查通过，8个改动文件lint为0警告/0错误；同一个既有native人员/世界场景正在集中验证。测试其他未接manager仍为明确记录适配器，这些断言只证明本轮后台默认服务，不证明完整Engine自然帧已无缺口。
- 本轮不改UI、不启浏览器、不提交或发布。Tooltip/UIData、动画/世界音效、暂停市场条件与完整市场advance、其他Engine脚本/AI/遭遇、持续tick持久化和多人时间规则仍需真实接齐；没有新增假定时器或把query缓存更新算作游戏推进。

### 本轮具体失败补证：空舰队超载速度

- 集中场景触发真实暂停速度更新后暴露旧问题：空舰队getMinBurnLevel使用原版Float.MAX_VALUE，却被通用经济MutableStat的±2^24输入限制拒绝。不是缺船夹具应当绕过：CampaignFleet.updateSpeedBonus:906–908即使不使用返回值也必须调用getBurnLevel。
- 交叉来源：FleetData:773–792、1067–1074；api/combat/StatBonus:273–301。原版float运算中间值可到Infinity/NaN，Math.round(float)会饱和到int极值或NaN→0，随后burn夹到[0,20]。定向修复只改真实burn getter的内部float计算/round，不放宽经济输入验证，不添加虚构舰船掩盖空舰队。

- 第二次定向场景暴露断言错误而非实现差异：提前查询不存在ID已建立了空的hyper本地缓存，后续线性fallback不回写缓存，所以改名后旧键不应命中该新增对象。保留原版不回写行为，修正断言并用原本已缓存的真实玩家舰队验证“改名仍命中旧键”，未修改缓存算法迁就测试。

- 第三次定向检查定位为夹具跨对象图使用势力：从checkpoint恢复后的Runtime新增舰队仍引用恢复前的Faction，checkpoint正确拒绝共享身份丢失。夹具改为从当前Runtime真实FactionManager取同objectRef对象，未放宽恢复验证、未改生产逻辑。

- 第四次定向检查到达分裂监听器拒绝断言，实际更早由FleetWorld同身份验证正确拒绝；断言接受两个明确身份错误入口，不放宽合法状态或生产验证。

## 2026-09-22 世界推进依赖：UIData真实帧（实施前）

- 原版0.98a-RC8：CampaignUIPersistentData.java:57–59、163–173，先以真实秒数推进MusicSuppressor，暂停直接返回，非暂停才以convertToDays推进0.5–1.5天的util.IntervalTracker，latch为真时调用IntelTabData.performCleanup。MusicSuppressor.java:14–40每帧汇集最大抑制请求、以0.5/秒追赶，每帧末清maxLevel；下降可能跨过目标值但仅夹0，不能自行夹回目标。IntelTabData.java:109–110原版performCleanup函数体确为空，故默认空行为有直接源码证据，不是绕过未接依赖。
- 本轮只实现UIData参与advance的真实字段，明确scope，不声称整个PersistentUIData或音乐播放已完成。新状态需显式创建/绑定；旧checkpoint没有状态继续明确缺失，不能把历史音乐/计时器补零。计时器使用已有可保存Math.random分支；状态随engine对象图保存/回滚。默认引擎调用真实实现，显式服务可替换供大改。
- 无UI布局变化，沿用已核对原版截图；本轮不操作桌面或拍UI截图，不声称音乐实机/浏览器听感验收。验证并入同一个既有原生世界场景，集中类型检查、改动lint和一次该场景，连同实体索引的拒绝入口断言一起收尾。

### UIData默认帧接线已落地

- 新增OriginalCampaignUIData模块，显式保存MusicSuppressor.currLevel/maxLevel与util.IntervalTracker的真实浮点/latch状态；以f32顺序实现最大请求、0.5/秒追赶、下降越过目标只夹0、每帧清请求。暂停不推进cleanup、不消费随机数；非暂停以真实clock.convertToDays推进，沿用原版下一帧才重抽interval的语义。
- NativeCampaignRuntime支持显式绑定、抑制请求、独立UI子阶段和Engine默认advanceUIData；randomDouble默认读取当前对象图已有personFactory.random.mathRandom，时间换算仍由真实clock独占。扩展可覆盖cleanup/random或引擎服务，不要求修改UI/保存/网络层。
- engine.uiDataFrame是完整UI数据中的advance子状态，不新建完整IntelTabData、不影响外层每controller能力栏，不把原版单例UI变成伪多人上下文。旧checkpoint无字段返回null，默认调用仍明确报缺失；新建和恢复均检查真实有限f32状态。
- 唯一既有人员/世界场景现使用默认UI服务（不再记录代替），覆盖暂停音乐推进/计时器冻结、最大请求/逐帧清理、下降越过目标、非暂停latch与共享随机消耗、checkpoint继续同序列、旧历史不补造和非法状态拒绝。其他未接manager仍有明确记录适配器，因此不声称完整world tick通过。

### 实体索引 + UIData 最终集中验收

- UIData块一次tsc通过；7个改动文件lint为0警告/0错误；同一个既有native personnel rosters场景通过：69819.52ms，进程70381.5254ms。最终场景同时覆盖此前实体索引/引擎监听/暂停速度与本轮UIData，不另开测试工程或全套测试。
- 最终日志：artifacts/campaign-engine-ui-frame-1790066864123.log。前面的失败是已记录的空舰队burn限制、缓存预热断言、跨图夹具Faction和更早拒绝入口；均针对具体失败修正，没有改原版缓存/随机/身份验证来迎合断言。
- 当前检查进程已终态，没有启动浏览器、可见窗口或桌面输入。无暂存/提交/推送/打包/发布。没有改readyForAuthority=false与simulation unavailable。
- 尚缺：真实Tooltip/动画及ping消费、暂停市场条件与完整Market.advance、其余实体插件/AI/遭遇服务，自动world tick/持久化和多人暂停规则。UIData模块不等于完整UI、音乐音频输出或全世界运行已完成。

## 2026-09-22 市场自然帧（实施前）

- 上轮分类progress：实体索引/暂停速度/UIData真实代码及既有场景已通过，检查进程终态。
- 原版0.98a-RC8证据：Market.java:449–487按天增加daysInExistence→stability临时mod→稳定值变化先写prevStability再条件/产业重算和updatePrices→条件快照→submarket原列表→Memory秒参数→people原集合→闲置建造队列启动→每commodity四类临时mod与reapplyEventMod→产业快照。CommodityOnMarket:159–167的updateCalc只改价格计算器的基础价格/波动/需求，绝不能接成库存/月底刷新。MutableStatWithTempMods:83–96按f32减时间，<=0移除全部同source的flat/percent/mult，即使本次amount=0也会清已经到期条目。
- Economy.java:136–144暂停只访问runWhilePaused=true的条件，skipMarketAdvance直接短路。FreeMarket.java:37–53确实暂停也推进daysActive；无hasSpaceport先removeSpecificCondition、setFreePort(false)，零秒也执行港口检查。BaseMarketConditionPlugin:41–42、209–210为空advance/false暂停；已对照72种现有条件的具体类与继承链，动态RecentUnrest/CommRelay/ShippingDisruption/PirateActivity的非暂停推进不可用空回调替代；LuddicPathCells.advance确为空。
- 本轮目标：完整Market.advance顺序入口接真实临时数值、价格计算器、Person/Memory、开放市场计时器和已有军用产业入口；真实默认条件支持已核实的基础类和FreeMarket；其余插件强制显式真实服务，不冒充完整世界。仅暂停条件阶段接Engine默认服务，skipMarketAdvance要求宿主给出真实布尔值；非暂停经济循环仍需补locationMap和全插件后才整体启用。
- 新market.frame显式绑定daysInExistence/Memory/按真实顺序排列的submarket对象，不从旧capture猜新历史；保存验证共享对象引用。当前仍不声明自动world tick可用。无UI布局变化，沿用之前原版截图；不操作桌面、无子代理；集中一次tsc、改动lint和一个既有人员/世界场景。

### 市场帧已落地（集中验收中）

- 新增OriginalMarketFrame：完整调用顺序、条件/产业各自到达阶段时才取快照，submarket/people保留原列表迭代并拒绝结构改变；实际推进stability和每commodity的四组temporary，<=0移除全部同source修饰器，重算eMod。价格计算器原对象仅更新basePrice/variability/demand，保留threshold、stockpile和lastPriceUpdate。
- NativeCampaignRuntime新增显式nativeMarketFrameState/bindNativeMarketFrame/advanceNativeMarketFrame；frame保存市场寿命、真实Memory和按序共享submarket引用，checkpoint恢复验证完整同图roster及临时状态。缺失旧字段返回null；不会从旧经济截图重造Memory/寿命/列表顺序。
- 默认接线：原版基础条件/FreeMarket、当前条件/产业经济重算、OpenMarketPlugin两个计时器、完整Person.advance、完整Memory、现有军用产业/建造入口；未移植的条件/产业/submarket拒绝。活跃军用产业的完整Memory与旧selected-flag view仍需真实同步服务，不能当两份独立时间线推进。
- Engine暂停经济分支默认调用真实条件阶段，需要context.skipMarketAdvance明确布尔值；跳过时不读取条件列表。新增市场帧入口没有擅自接成完整Economy.advance，非暂停经济的locationMap/全插件等仍需补齐。
- 补证：Misc.java:4434–4439的建造队列检查忽略population标签与升级中的产业，已接真实industry spec标签判定，不能只检测building。BaseSubmarketPlugin:90–94仅推进两个计时器，不能顺手刷新货物。Market people的默认服务返回真实peopleRefs容器，逐项解析当前Person，避免提前复制成另一份人员快照。
- 验证并入既有native personnel rosters：暂停自由港/skip/零秒取消、完整顺序及条件/产业快照、真实临时状态/价格/计时器/人物与Memory、保存共享引用和缺失旧历史、未知产业明确失败。顺序夹具和未移植重工业回调仍明确是记录适配器，不是完整world tick证明。本轮无新UI或听感验收。

- 集中场景首次失败：该舰队开发夹具从未做市场readResolve经济效果初始化，因而FreeMarket实际unapply遇到未建立的immigrationModifiers。修正夹具先执行真实reapplyEconomicEffects；Runtime自然条件/市场入口同时明确检查初次加载前置条件，不用空对象补造注册，不以记录unapply绕过。类型检查和改动lint此前已通过，仅复查这两文件lint和同一场景。

- 第二次定向检查正确拒绝整表重复加载：既有人员场景已经初始化b，只有a未初始化（原场景1229行）。夹具改为只加载a；保留single-use初始化约束，不重置#loaded或重复应用已加载市场。

- 第三次检查暴露旧构造缺口：Runtime刻意省略nonecon商品的PriceCalculator，但原版CommodityOnMarket字段43–44对所有实例均构造，readResolve:80–82对所有实例重建并updateCalc；Market.updatePrices也不跳过nonecon。已补齐已知无自定义plugin商品的计算器构造，构造器不再错误复用经济结算的nonecon过滤。经济库存/交易接口的原有过滤没有放宽，历史checkpoint中的显式null仍不补造。当前夹具从原始capture创建，因而自然带上真实构造的计算器。

### 市场帧本轮最终验收

- 一次tsc通过；初始6文件lint、具体修复后的定向lint均0警告/0错误。唯一既有native personnel rosters场景最终通过：73945.2448ms，进程74597.2439ms。未运行全套或新建测试工程；没有浏览器/桌面操作。
- 实际覆盖默认Engine暂停FreeMarket、skip短路、零秒失港取消；真实市场temp状态过期/eMod/计算器/库存不变/OpenMarket两个计时器/Memory与Person；checkpoint原对象图引用恢复、旧缺字段不补造；不支持的重工业advance明确拒绝。派发顺序夹具和产业记录回调不证明完整市场插件世界已运行。
- 最终日志：artifacts/campaign-market-frame-1790068214905.log。检查进程已正常退出，code=0。未暂存/提交/推送/打包/发布。readyForAuthority=false、simulation unavailable不变。
- 下一步直接补真实产业BaseIndustry及其子类advance与完整Memory/selected military flag views的同状态绑定，再把Market.advance接入完整Economy.advance；不能重用仅库存/月结或孤立计时器冒充这一层。旧economic checkpoint中nonecon计算器null和市场frame缺失仍保持显式未接边界；本轮没有悄悄按默认值升级历史。

### 军用标志与市场完整 Memory 同状态绑定（实施前，2026-09-22）

- 原版证据（沿用本机0.98a反编译/API）：Market.java:449–487只在条件/子市场之后、人物/队列/产业之前调用自己的Memory.advance；Memory.java:134–161先恢复实体引用，暂停不扣时间，float timeLeft严格<0才unset；233–247的unset保留过期记录与仍存活Require的成员。BaseIndustry.java:391–407先读故障再决定本帧建造，1578–1632在同一market.getMemoryWithoutUpdate上读写故障与时限。MilitaryBase.java:263–280在super.advance之后继续当前旧实例的巡逻逻辑。
- 当前差异：军用只读写选定flag closure，市场帧已有完整Memory，两者未绑定会双计时/状态分裂；null市场Memory还能绕过原先仅在Memory回调里的军用防护。
- 预期实现：绑定必须由调用方给出真实完整Memory，先逐项验证已知值、依赖及过期序列一致，再把原共享closure对象转为无值副本的受限视图；读写只访问完整Memory，禁止再单独advance selected flags。自然市场帧先推进唯一Memory再同步军用故障；保存恢复校验同图引用。旧未绑定closure继续原路径，缺失历史不从closure拼出完整Memory。未知对象/不精确数值不能在绑定时猜测。
- 验证：扩展现有ordered shared load场景，验证绑定冲突无部分转换、完整图含其它依赖、严格零/负过期、暂停不推进、自然帧恢复建造、共享引用及旧存档兼容、null/split/double advance明确拒绝；非军用插件仍使用有标签的阶段记录适配器，不当作整个市场已可自动运行。集中一次tsc、改动lint、这一场景。
- UI：本轮仅内部时钟所有权，无布局/交互变化，不制作新UI，也不宣称原版实机或画面验收；不操作桌面。readyForAuthority=false及simulation unavailable保持。

- 本轮集中检查：tsc通过，5改动文件lint 0警告/0错误。单场景首次正确拒绝旧军用夹具缺失submarkets清单；仅在新增夹具的原始XML里显式提供两个空容器，再走真实capture，不清空unresolved或放宽Runtime校验。定向复查只跑此文件lint和同一场景。

- 审阅补充：绑定转换前拒绝未知closure字段，避免直到转换后才由view严格字段校验报错而留下半转换状态；仅定向复查该模块lint和原场景，类型声明未再改变。

### 军用/市场唯一 Memory 本轮结果

- OriginalMemoryFlags现在同时支持旧选定closure和新native-memory-flag-view。绑定逐项核对已知值、expiry顺序、正反依赖，保留共享wrapper但移除全部值/计时副本；旧closure未绑定时保持原有行为。绑定视图的set/unset/reason/boolean/expiry均读写完整Memory；禁止独立advance，即使paused或0秒也不能走第二个时钟入口。
- bindNativeMarketFrame对明确提供的完整Memory执行验证绑定；共享市场必须同图，不能换成内容相等的新对象。自然市场帧在任何修改前校验已知军用内存依赖，null不能绕过。默认Memory阶段只推进完整状态，再同步共享军用设施故障，后续真实BaseIndustry据此继续建造。checkpoint验证owner/共享引用，孤儿与split对象拒绝；旧未绑定存档不自动拼造历史。
- 已验收：原始XML显式完整夹具→真实capture/runtime；未绑定旧军用场景照常通过；绑定冲突不修改closure、无副本、额外依赖保留、暂停不扣时、恰好零仍故障、下一帧过期后同帧恢复建造、完整Memory其它计时器只扣一次、useMax、保存恢复共享对象及独立分支、null和double advance拒绝。
- 类型检查一次通过；5文件初始lint与两次定向文件lint均0警告/0错误；仅同一个既有ordered shared load场景，最终2377.2089ms（进程2972.2886ms），code=0且child=null。日志：artifacts/campaign-market-memory-binding-1790069503565.log。未创建测试工程，未跑全套，未启动浏览器/桌面/子代理。
- 边界：新增自然帧夹具的非军用产业和people仍是明确的记录/阶段适配器，军用建造使用真实runtime、巡逻用原版simMode短路；因此不能称全部市场或世界自动运行。完整Memory里的原生enRef_/mRef_字符串仍须真实解析服务，新增视图不会猜实体；本轮未贯通所有早于Memory阶段的经济/军用回调解析上下文。没有新UI或原版实机验收。readyForAuthority=false、simulation unavailable不变，未暂存/提交/推送/打包/发布。
- 下一块：补其余产业实际advance/故障钩子及完整Memory解析上下文，再接完整Economy.advance/locationMap到连续世界循环；不是重复本轮测试。

### 生产产业自然生命周期（实施前，0.98a-RC8）

- 原版证据：BaseIndustry.java:391–407先故障恢复钩子、wasDisrupted、建造进度/完成；505–520升级移除旧对象→添加并apply新对象→拷贝AI/改良→upgradeFinished→reapply，正常完成先消息/队列再reapply；598–600只转移SpecialItemData，不转移HeavyIndustry污染历史。Market.java:277–310证明add时立即apply，升级移除不退核心/物品。
- HeavyIndustry.java:115–143在super.advance返回后仍推进旧实例daysWithNanoforge，故障/建造都不阻止该段；宜居星球立即产生污染，超过90天而非达到90天才永久。Refining/LightIndustry/FuelProduction没有advance/完成/故障钩子覆盖，继承Base。PopulationAndInfrastructure:680的advance属于嵌套LampRemover，不能当作产业自身推进。
- 实施范围：抽出共用BaseIndustry.advance给军用/生产产业；接现有五种生产产业的真实建造、升级、故障、特殊物品和重工业污染状态，显式完整Memory绑定及保存旧/新实例；市场默认派发生产产业不再一律拒绝。其它民用/空间站/完整建造准入和非军用队列仍列缺口。
- 发现真实经济顺序差异：生产产业的原版super.apply(true)在新demand/supply之前更新财务；短缺getMaxDeficit随后按原次序访问实时商品getter（Refining重复访问heavy_machinery）。现有LiveEffects先整块算量后财务，不能用于原版升级。因此一并接共享状态的实时生产apply，复用已有离线内核数学但保留实际读取时机。
- 捕获从原XML读取HeavyIndustry的daysWithNanoforge/permaPollution/addedPollution；原版字段缺省按已核实JVM字段默认，旧Web checkpoint缺历史不回填。无UI变化/桌面操作，未作原版实机验收。完成后一次tsc、改动lint、一个既有场景。

### 生产产业自然生命周期本轮结果

- 已落地：OriginalBaseIndustryFrame提供真实共享Base推进，MilitaryLifecycle改为调用它；OriginalProductionLifecycle恢复并保存lightindustry/refining/heavyindustry/orbitalworks/fuelprod的真实实例、建造进度/时间、wasDisrupted、核心/改良和共享SpecialItemData。绑定完整市场Memory先校验原始故障快照再移除副本；旧Web checkpoint缺productionLifecycle返回null，不根据旧loadInputs补造当前状态。
- 市场默认advanceIndustry现在实际调用生产产业，不再要求重工业记录回调。已实现故障设置/useMax、升级/取消、完成后同实例reapply或移除旧实例并构造升级对象；旧实例在super返回后继续污染推进。消息仍存现有风格的待消费COLONY_INFO记录，未宣称UI消息已显示。
- HeavyIndustry污染状态从原XML新增捕获：不因故障/建造停止纳米锻炉计时；90天整仍非永久，超过90才永久。新增/移除污染调用真实condition实例与apply/unapply，保留hazard及immigration注册身份。原版条件默认surveyed=true，procgen/condition_gen_data.csv的pollution reqSurvey为空，与默认构造一致。升级只转移special引用，不复制pollution历史，新对象setter先处理现有污染，旧对象随后仍跑原栈尾部。
- 真实生产apply财务时序已修正为先基础修饰器→财务→物品→新需求/供给→逐次lazy deficit→失能处理；Refining的heavy_machinery重复读取没有缓存成一份快照。当前previousStability直接来自市场而非旧生产capture。CommodityOnMarket.java:262–264的getAvailable下限0同步用于相应Runtime getter，未放宽网络DTO。
- 完整Memory的实体/市场引用默认解析接到实际引擎ID索引/当前市场Map，用于市场Memory阶段及生产生命周期；无实际engine时实体解析仍拒绝，不猜引用。军用早于Memory阶段的全部回调上下文仍另列待补。
- 一次集中验收全通过：tsc；14个改动文件lint 0警告/0错误；唯一既有shared scheduled economy tasks场景632.3784ms（进程1182.0544ms），code=0、child=null。日志：artifacts/campaign-production-frame-1790070719019.log。没有失败重跑、全套、新测试工程、浏览器/桌面/子代理。
- 场景实际覆盖默认市场重工业推进、真实开放市场计时/商品阶段、完整故障Memory、污染条件/hazard/immigration、暂停、90天边界、故障恢复同帧续建、heavyindustry→orbitalworks、核心/改良/物品继承、旧对象尾段/新对象不被提前推进、保存同图与分裂/缺历史拒绝。people阶段显式null适配器、Refining读取时序用记录回调；不由此宣称人物/整个星区tick全部完成。本轮没有重跑军用独立场景或原版实机UI。
- 仍缺：非生产民用产业/空间站实际帧；完整各类建造准入与非军用队列，生产正常完工仅空队列或已有军用队列可以继续，未知队列仍拒绝；全部Economy.advance/locationMap、连续航行、正式新开局、完整HUD/任务/勢力/殖民地和独立合作联机。readyForAuthority=false、simulation unavailable保持。未暂存/提交/推送/打包/发布。

## 2026-09-22：共用建造队列实施前对照

- 原版 0.98a-RC8 证据：BaseIndustry.java:496–501、553–600、821–825；MilitaryBase.java:247–254；ConstructionQueue.java:9–99；Misc.java:4387–4407；原生 Market.java:277–290、449–487、1433–1461。
- 预期：先移除队首，再真实构造候选，再计数（含剩余重复队列以及 spec.upgrade 的真实候选构造），再读取上限与插件准入。玩家失败退原始 int cost，NPC不退；成功 addIndustry 复用已有对象，否则第二次真实构造并 apply，然后 startBuilding/unapply，再写费用。普通完工续队列，升级完工不续。闲置启动早于本帧产业快照，完工中新对象不提前推进。
- 当前差异：完整队列寄存在军用生命周期中，生产完工回落到只支持军用的入口；市场 tags 未捕获，不能默认可建。计划抽成共享原版队列算法，复用真实军用/生产插件构造与服务，保留旧入口兼容；其它插件继续明确拒绝。
- 状态：本轮仅后台逻辑，无新增 UI；队列原版截图/键鼠交互仍待核实，不自创界面。UI扣费/确认/权限与消息消费不属于已接通的引擎队列。
- 验证：完成后一次类型检查、改动 lint、一个既有原生存档场景；覆盖混合队列、双构造、剩余计数、重复ID、原价退款、NPC差异、快照与保存身份。保留 readyForAuthority=false / simulation.status=unavailable。

## 2026-09-22：共用建造队列已接通（开发态）

- 新增 OriginalConstructionQueue：原版先出队→构造候选→包含剩余重复项/升级候选的计数→上限/准入→退款或 add/start 的共同流程；首次匹配 ID 的上移/下移/置顶/置底/移除保留条目引用。移除是引擎操作，不冒充玩家退款命令。
- 军用/生产复用真实构造器、首次 apply、startBuilding/unapply；支持已有 3 军用和 5 生产插件。市场闲置启动、生产普通完工、军用普通完工均已连接；升级路径仍不自动续队列。未知插件明确拒绝并丢弃失败草稿。
- 完整 constructionQueueState 是市场共享对象，legacy industryLifecycle.queue 同引用而非副本；ID数组只保留投影。旧 checkpoint 可从当前 legacy queue 接回，不从历史 loadInputs 恢复；缺少当前 tags 则不能猜测生产准入。新原XML捕获 tags 的 null/集合。
- 新市场即使没有生产设施，也从实际初始管理员修饰器/当前动态统计初始化生产上下文；因此首次新建生产设施可运行，生产质量仍共用同一个统计对象。旧 checkpoint 不从原历史补缺失上下文。
- 集中验收：一次 tsc 通过、11 改动文件 lint 0错误/0警告；一个既有 ordered shared load 场景。首轮旧负面 Memory 夹具先被生产同图校验拦下；只修夹具隔离条件（不放宽运行校验），定向复查该场景通过 2973.5638ms，进程3498.7017ms。日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-construction-queue-1790071681517.log。
- 验收覆盖：混合完成回调、军用候选/新增双随机构造、重复ID复用、spec.upgrade 构造、剩余队列重复计数、原cost退款记录/NPC不消息、原XML标签、军用覆盖准入、闲置启动纳入快照、完工回调不提前推进新实例、保存同图/分裂拒绝。首轮之前已有生产自然帧场景本轮未额外重跑。
- 边界：混合场景对 population/spaceport/其它设施及 people 使用明确适配器；退款为真实生产构造+记录退款服务，未验证多人支付归属。没有完整 world tick 证据，没有 UI/原版实机/HTTP玩家建造扣费确认验收；消息仍为待消费 COLONY_INFO 记录。readyForAuthority=false、simulation.status=unavailable 不变。未提交/推送/打包/发布，未操作桌面，无运行中的检查子进程。
- 下一块：补当前市场其它民用设施/空间站的真实帧与依赖，减少适配器，再按原版证据接建造界面和回执，不以队列核心完成冒充殖民地或生涯整体完成。

## 2026-09-22：市政基础帧与港口/防御真实回调实施前对照

- 原版 0.98a-RC8：BaseIndustry.java:182–217、391–414、496–600、1679；Spaceport.java:33–81、160–171、200–205；GroundDefenses.java:26–53；PopulationAndInfrastructure.java:62–154、189–215（该类仅内嵌灯光脚本有 advance，没有覆盖产业 advance）。
- 预期：港口/地防/人口继承 BaseIndustry 的故障恢复和建造进度；港口/地防空恢复钩子不能擅自 reapply。升级保留原实例供快照使用、转交 SpecialItemData，港口移民注册使用实际新对象。港口 apply 顺序为基础修饰器→财务→AI/改良→移民/物品→新供需→真实 lazy 缺货扫描→港口/军官概率→失能 unapply 后将 hasSpaceport 再置 true；startBuilding 单独 unapply 时则为 false。
- 当前差异：默认市场帧拒绝全部市政设施；港口和地防仅有离线经济重应用，财务/需求先后不完整，港口军官概率和建造/升级移民身份缺口。先接 4 港口/地防设施的实际回调、建造与队列，以及人口设施真实继承帧；人口非常规完工所需的完整动态统计/灯光处理仍明确未实现，不以现有经济投影冒充。
- 验证：单个既有场景集中验证港口/地防建造、故障、升级、财务/缺货顺序、物品引用、旧移民注销/新对象注册、人口正常帧、存档同图。界面没有改动；原版建造界面截图和实机操作仍待核实，不使用自创布局。

## 2026-09-22：人口继承帧、港口与地防生命周期已接通

- 新增 OriginalCivicLifecycle / OriginalCivicIndustryEffects：人口设施运行真实 BaseIndustry.advance；太空港/巨型港口、地面防御/重型炮台有实际 apply/unapply、建造/升级/故障和普通完工续队列。新增/退役实例与 SpecialItemData 保持引用；军官概率、移民注册、物品流通性、地防修饰器按原版单实例顺序处理。
- 修复港口的基础财务读取时点：先读财务、随后新供需、再按 fuel/supplies/ships 顺序读 lazy 网络和更新缺货维护费；失能 apply 最后 hasSpaceport=true，而 startBuilding 的单独 unapply 为 false，保留该原版差异。
- 市场当前 civicLifecycle 绑定完整 Memory，不另存故障副本；自然帧、队列、升级后重应用和 checkpoint 校验已接入。旧 checkpoint 缺当前市政历史不从 loadInputs 伪补。当前管理员修饰器/星球物品条件从原生实际读回值建立新状态，绑定 personnel 后使用实时管理员 getter。
- 一次 tsc、9文件 lint 通过；既有 shared scheduled economy 场景包含市政默认产业帧，只有缺失人员集合使用显式 null 适配器。最初测试错误假定完全缺货仍有非中性基础防御修饰器；改为核实实际 alpha 防御修饰器、旧实例撤销及物品同图，定向复查场景通过 916.1503ms（进程1421.0529ms）。日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-civic-frame-1790073053234.log。
- 人口正常继承帧不等于人口全部 apply 已还原：其完整动态统计/灯光特殊状态、非常规完工仍是显式缺口，未接成虚假成功。空间站/其它设施、world tick、UI建造命令/扣费/确认和联机支付权限仍待完成；未声称完整市场/生涯交付。
- 用户最新授权两个子代理加速，已分开独占文件补资源产业实时回调和人口动态统计。主代理继续集成和集中验收；不操作桌面，不暂存提交推送打包发布。

## 2026-09-22：两个子代理交付与主代理集成结果

- 两个子代理均已完成并关闭，无代理仍占用并发。资源产业代理修改 OriginalResourceIndustries.mjs/.d.mts 和独立原版说明；人口代理新增 OriginalPopulationIndustryEffects.mjs/.d.mts 和独立原版说明。主代理已逐一读代码复核。
- 农业/水产/普通采矿的 live 经济回调已由主代理接入 OriginalLiveIndustryEffects 和 NativeCampaignRuntime：真实 lazy 机器读取、先财务后新需求、旧物品 unapply、原实例移民注销/注册。主代理补上 registerImmigration 必需同步回调，位置为财务之后/物品之前。矿床条件仍由条件阶段提供基础供给，没有编造普通矿床枯竭。
- 资源特殊物品（纳米土壤/地幔钻机/等离子设备）目前通过的是独立 live helper 经济阶段；Runtime 的财务物品白名单尚未开放这些资源物品，所以不能声称其安装/加载/自然帧端到端已完成。资源类生命周期/队列及等离子网视觉仍待下一步。
- 人口 helper 已覆盖舰队质量、地防、产业上限、舰队规模、招募概率及精确撤销，保留共享数组、Always中性记录和Java float；已验证 ships 单次句柄/available→maxDemand 与 previousStability 只读一次。尚未插入完整人口 apply 调用链，不把 isolated helper 通过冒充运行时效果。
- 并行成果集成后集中：一次 tsc、13文件 lint（0警告/0错误）、同一个既有 shared scheduled economy 场景通过，763.4951ms（进程1206.7513ms），无失败重跑。此场景同时覆盖本轮市政默认产业帧、实际资源无物品经济接线，以及两份 helper 的记录型顺序断言。日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-parallel-industry-integration-1790074811838.log。
- 原版UI/实机、完整world tick、多人支付授权未验证；开发状态继续 readyForAuthority=false/simulation.status=unavailable。未暂存、提交、推送、打包、发布，未操作桌面。下一步优先将人口动态 helper 按原版顺序接入、完成资源自然帧与物品上游通路，而不是继续追加未接线模块。


## 2026-09-22：人口—资源—混合建造队列—采矿网运行链路（开发态）

- 主代理实际修改 NativeCampaignRuntime 与 LiveIndustryEffects：资源产业同图恢复、Memory绑定/推进、默认自然帧、普通完工续共用建造队列、当前实例移民注册、物品setter和checkpoint校验全部接线。农业/水产/采矿准入按原版资源条件和water行星类型处理，旧checkpoint缺当前状态不从loadInputs补造。
- 人口普通无特殊物品apply/unapply已接真实市政调用：modifyStability→管理员/bonus→基础财务→改善/移民→新供需及短缺→流通性→质量/防御/产业上限/舰队规模/招募→超上限→移民。新增三项招募统计只从原XML捕获；ships读取单一当前市场句柄，原版产业计数复用真实升级候选构造，不靠静态spec略过随机副作用。人口灯具/heat条件仍明确拒绝。
- 三种资源物品合法配对已通过加载准备/财务/accessibility门禁；实际Runtime土壤纳米体、地幔钻机设置/重应用/卸下与不满足环境时保留安装但取消效果已验收。setter仍是引擎能力，不是玩家货舱转移、扣费确认或HTTP权限命令。
- 等离子采矿网接真实当前共享planet的spec→graphics/renderCache模型路径，并登记现有原版dynamo.png纹理描述；默认/关闭不绘制第二层。缺world/未恢复planet明确拒绝，真实null planet提前返回且保留shown历史。通过CPU模型启停/克隆/身份断言，非完整Runtime非null安装或浏览器视觉验收；未操作桌面。
- 修正前轮文档中的“短缺读取lazy网络”说法：原版Market.getCommodityData返回市场商品，CommodityOnMarket.getAvailable仅读available缓存，不能误触发全局网络重建。本轮资源/市政/军用/生产五处Runtime读取已改正；真正modifyStability的getCommodityMarketData仍保留原时点。场景额外断言资源完工→新建refining不触发网络、不刷新maxDemand。
- 一次集中验收全通过，无失败重跑：tsc一次；24文件lint零警告零错误；仅既有shared scheduled economy场景1326.9059ms（进程1827.5305ms）。日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-runtime-chain-1790080442411.log。新增测试包括实际人口动态值、共享Memory和资源身份、农业故障恢复、水产准入拒绝后续采矿、资源→生产混合队列、快照不提前推进新对象、恢复同图/拒绝缺历史、物品效果与视觉模型。
- 三个子代理分别完成规则/场景/视觉素材独立文件，主代理接入并审阅。未暂存、提交、推送、打包、发布；检查子进程已退出。readyForAuthority=false / simulation.status=unavailable保持。
- 仍未完成：完整world tick与正式开局、空间站/其余设施、原版殖民地UI及多人操作授权/费用归属、人口灯具、原版实机及Web画面一致性。此批不是完整生涯交付。


## 2026-09-22：原生殖民地管理页面 → 权威建设交易联通（开发态）

- 三个代理的原版规则/只读披露/UI代码已收齐，主代理完成Runtime、权限、HTTP、页面、回执和持久化接线；代理已结束，不保留空转任务。
- 服务端显式保存市场→舰长→付款舰队绑定（envelope v3）；旧v1/v2归属保持未知null。只披露本人市场，不从同势力/组队推断共享资产。当前修改仍要求实际native player treasury；其他舰长独立资金上下文未接，明确拒绝，不切换全局playerFleet。
- D/管理按钮、Escape/关闭已可用；页面→inspect真实候选→原版价格确认→建造入队扣款→待建取消退款接通。队列交换接原版payload交换规则；正在建造产业取消、升级/拆除/物品返还不在本次开放范围。
- 建造与首项队列编辑运行实际三次forced经济任务：管理员/角色/治理、条件/产业、商品网络/价格/监听器、UI-only人口。当前角色出口乘数绑定真实dynamicStats，保留原版缺键默认1。未推进世界时钟或冒充完整world tick。
- 联机仍复用SQLite revision事务、epoch和requestId；页面保留未知结果待重试，旧报价失效。实际场景断言本人披露/越权拒绝、伪造价格回滚、真实扣款退款、同id幂等及版本冲突。
- 验收：tsc -b通过；18个改动代码文件lint零警告零错误；具体修复后5文件定向lint同样通过。仅运行既有native personnel场景并针对具体失败定向重查；最终1通过0失败，场景115900.9824ms、进程116853.52ms。修正旧能力列表/历史Memory夹具、真实出口统计接线、夹具势力闭包，以及Web候选按钮无障碍名称和关闭按钮被连接栏遮挡的问题。
- 无头Web使用真实HTTP/Worker/SQLite，不伪造session/receipt：D打开、选择市场/候选、点击建造、取消退款、Escape和关闭按钮通过；无pageerror。1920×1080实际截图已查看：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-management-34952.png。此为合成开发世界，不是原版实机或正式开局验收。
- 汇总日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-management-1790087792131.log；最终场景日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-management-scenario.log。
- 未完成：完整world tick/正式开局、独立多人资金、管理员分配、分组建设/空间站等插件、动态类型工期维护费与全局管理汇总、原版全息建造弹层及同状态实机画面对照。现有建设表只按已核实原版列/流程嵌入详情，不宣称像素一致。
- readyForAuthority=false、simulation.status=unavailable保留；未暂存、提交、推送、打包或发布；未操作桌面输入；本轮验收进程已退出。整体生涯目标仍active，本次只是可操作建设链路进展。


## 2026-09-23：主代理完成原生世界帧的权威事务入口（仍非完整自动世界）

- 本轮未新开子代理，主代理实现 DevelopmentWorld/Repository 的可信同线程帧入口：控制导航 → 现有原版engine → checkpoint/receipt/outbox同一SQLite事务。epoch、revision、signed-long frame共同校验，暂停帧仍保存状态但不走世界时间，同ID重试和重启后的已提交重试均不重放。
- 依赖工厂每次绑定当前runtime；规则推进中异常、SQL写回失败均丢弃被改动图并从已提交状态恢复，不在旧图上修补。不切换全局playerFleet，不补造缺失engine历史，不开放玩家tick命令。
- 边界：这是内部宿主接线，不是自动世界循环。Worker/HTTP仍未启用原生时钟；完整默认地点/AI/外部经理、多人资金与独立上下文、正式开局继续待完成。readyForAuthority=false / simulation.status=unavailable不变。
- 验收：集中tsc -b通过，5个改动代码/声明文件lint通过；同一既有native personnel场景针对具体夹具失败定向复查（未重跑全套、无本轮浏览器/UI测试）。修正重复全表载入、误把舰队追踪当作直达目标、复用真实已构造玩家夹具三处问题，未放宽Runtime校验。最终1通过0失败、退出码0，场景79120.8979ms，进程79669.76ms。
- 实测真实SQLite提交/回滚/重启、真实时钟及导航；原版舰队追踪为朝目标方向750单位。测试中的画面/地点与通知仍是明确录制适配器，不声称全部地点/舰队/AI/月结自然推进已验收。
- 日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-native-authority-frame-check.log（首轮失败）；C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-native-authority-frame-scenario.log（最终通过）。来源与边界：docs/campaign-native-authority-frame-source-notes-2026-09-22.md。
- 未暂存、提交、推送、打包、发布；未操作桌面，检查进程已退出。整体目标仍active。


## 2026-09-23：权威帧使用真实地点/舰队默认推进

- 成功帧不再以 advanceLocation 录制函数替代，采用真实 BaseLocation 双舰队自然帧；摄像机是显式宿主依赖，不由玩家伪造时钟。视口和固定 player 势力颜色来源见 docs/campaign-native-location-live-frame-source-notes-2026-09-23.md。
- 原有事务/版本/epoch/帧游标/幂等与整图失败恢复不变；没有新增 HTTP/Worker tick，没有轮换全局playerFleet，也没有将权威舰队图直接暴露给观察者。
- 已确认但待修：舰队 effects 尚未逐层向宿主汇总及按观察者安全派发。直接舰队帧的探测 ping 颜色正确，不等于自然世界提示或多人通知已完整接通；禁止以此启用自动世界或 readyForAuthority。

- 最终验收：同一 native personnel 既有场景1通过0失败、退出码0（场景70484.5118ms，进程70989.7773ms）。本批首次颜色补测仅缺测试观察者本地 reportDetectedEntity，补齐本地记录后定向复查通过，未放宽生产服务校验。固定 player 的 ping RGBA 与问号顶点RGB均由 Runtime 默认 getter 验证；自然位置/补给/暂停/离屏/SQL回滚仍通过。类型检查与前批5文件lint已通过，本次颜色修正受影响文件lint通过；没有重跑全套。最终日志：artifacts/campaign-native-location-frame-color-scenario.log；静态日志：artifacts/campaign-native-location-frame-types.log、artifacts/campaign-native-location-frame-lint.log、artifacts/campaign-native-location-frame-color-lint.log。验收进程已退出，整体生涯目标仍active。


## 2026-09-23：自然帧副作用进入权威事务与私有读取链路

- 主代理完成实体→地点→引擎→宿主效果传递，明确快照化后与SQLite回执/outbox原子提交；规则或SQL失败不发布，同请求重试不重放。成员仅保存点击引用，不外发循环世界图。
- 私有只读事件经真实Worker/Service/认证HTTP接通，新增客户端读取方法；按真实原版playerFleet控制者披露，拒绝正文伪造玩家/旧epoch/未来游标/超限分页，空批次推进游标且事件ID跨重启稳定。原版感知提示不跨玩家重复广播，仍由各自观察者场景产生。
- 验收：真实自然帧缺员提示、回滚、暂停、无重复、另一舰长隔离、Worker重启/HTTP通过；同一既有场景1通过0失败，退出0（71167.2882ms / 总71694.6935ms）。类型与改动lint经具体错误定向修复后通过，未重跑全套。详见 docs/campaign-native-frame-effects-source-notes-2026-09-23.md 与 artifacts/campaign-native-frame-effects-scenario.log。
- 尚未接入画面消息条/自动消费/音频/REFIT点击，不宣称UI完成；顶层部分经理、第二舰长独立上下文、自动完整世界/正式开局仍未完成。readyForAuthority=false / simulation.status=unavailable保留。无子代理、无桌面操作、无提交或发布；目标仍active。


## 2026-09-23：原版消息条接入真实私有帧事件（主代理收尾）

- 不再增加子代理；主代理把消息模型、私有流与NativeCampaignApp接通。普通缺员消息在原版左下区域显示，修理消息计数合并/原位更新/成员引用/高亮已实现；淡入、超15秒淡出和hover不重置年龄按源码。REFIT未接，因此修理按钮明确禁用，不能假跳转。
- 消息页完整校验后才更新列表和游标；丢包重试不重复，空页推进，新连接从当前session revision开始。修理RGBA读取固定player势力真实基色，不能猜舰队色。字体加载错误不会被同步成功清除。
- 真实SQLite → HTTP → 无头页面验收通过：页面先连revision0，再推进真实缺员舰队；第一次含消息HTTP响应被丢弃，重试后恰好一条提示，最终游标3。1920×1080原版位置x10/bottom287、400宽、27高、透明无卡片、原版位图字体就绪；无pageerror。截图artifacts/campaign-native-message-list-1920.png已查看，这是合成无背景地点，不能当完整星区或同状态原版实机验收。
- 一次集中tsc通过、改动lint通过（首次2条React ref-render警告，修复后组件lint与app类型定向复查均0退出）；仅同一既有native personnel场景1通过0失败，83101.6996ms/总83833.7081ms，包含原有重启/回滚/权限断言。无全套重复验收；后台进程均已退出。日志artifacts/campaign-native-message-list-{types,lint,scenario}.log及types-final/lint-final.log，来源见docs/campaign-native-message-list-source-notes-2026-09-23.md。
- 待完成：消息音频、REFIT点击、事故报告/能力视听生命周期、完整长文本折行对照；完整自动世界/正式开局/独立第二舰长上下文仍未开放。readyForAuthority=false与simulation.status=unavailable保持。无桌面操作、无暂存/提交/推送/打包/发布，整体目标active。


## 2026-09-23：世界帧默认动画管理器与PingScript（非记录适配器）

- 主代理新增并接通BaseAnimation四队列管理器、ActionIndicator/PingScript与15种原版ping参数。新引擎使用实际manager；旧缺失历史拒绝自动补造。脚本声音intent进入现有权威effects/SQLite事务，保持observer-scene边界；没有轮换playerFleet或广播给所有人。
- 真实原生帧场景已去掉advanceAnimations记录回调；实际计时、暂停、脚本完成、共享引用checkpoint恢复、规则/SQL回滚、重试和原有Worker重启/私有事件检查通过。一次tsc、9文件lint零警告、一个既有native personnel场景1通过0失败（73418.7919ms/总74104.93ms），无全套/失败重跑。日志artifacts/campaign-native-engine-transients-{types,lint,scenario}.log。
- 完整动画子类任务/具体爆闪、ping绘制与实际音频、tooltip/help/NPC等默认依赖尚未完整，自动世界和正式开局仍关闭；不能把这个引擎基础补齐当作界面完成。详见docs/campaign-native-engine-transients-source-notes-2026-09-23.md。
- 无子代理、无桌面操作；后台检查结束；未暂存/提交/推送/打包/发布；整体目标active、readyForAuthority=false / simulation.status=unavailable。


## 2026-09-23：观察者探测ping已真正绘制到航行画面

- 主代理接通真实contact事件→各自PingScript/ActionIndicator→原版GPU圆环→NativeSceneCanvas，复用字节一致的line8x8纹理与原版三环渐变公式，不用CSS替代。跨checkpoint恢复重绑目标但保留计时；隐藏/移除/撤权清理，不串给另一舰长、不改权威RNG。修正固定player颜色来源。
- 同线程真实SQLite+HTTP页面的重发现与点击导航通过，已查看1920×1080截图artifacts/campaign-native-observer-ping-1920.png（无背景合成地点，不是完整星区）。GPU无错、pageerror为空；原有Worker/回滚/权限断言同场景仍通过。
- 集中类型与6文件lint通过；一个既有native personnel场景1通过0失败，151212.4698ms/总152497.6504ms，无全套或失败重跑；源码复查后仅颜色null/undefined分支与3文件lint定向检查通过。来源/日志见docs/campaign-native-observer-pings-source-notes-2026-09-23.md与artifacts/campaign-native-observer-pings-*.log。
- 实际声音、正式暂停/快进时钟耦合、canonical世界ping披露以及其余经理/NPC/完整自动世界仍未接齐，不能宣称整体生涯或原版实机等价。readyForAuthority=false / simulation.status=unavailable保持；无子代理、无桌面操作、无提交/打包/发布；目标active。


## 2026-09-23：主代理接通真实个人探测音效

- 真实contact→私有scene事件→NativeSceneCanvas→WebAudio已接通，3音效集/13原版Ogg全部字节核对；按原版样本增益、2500范围、监听者高度200、线性距离及短队列同样本去重。不使用战斗简化音频曲线、不改全局playerFleet。
- 场景序号去重；断线/换地点/舰长/卸载作废旧播放；尊重现有音量/静音/后台静音，浏览器未解锁不积压旧声。实际导航回执和断开音源清理通过。
- 类型及lint通过；同一既有native personnel场景最终1通过0失败（85663.6933ms/总86255.8067ms）。此前三次UI音效等待失败已定位并修复夹具：真实engine frame重算了传感器，不能继续用前一draft手改profile选择重发现距离。最终使用实际提交状态选650距离并核对SENSOR_CONTACT，真实音源96000采样/单声道/volume.75/linear200→2500，pageerror为空。没有伪造声音/scene，没有全套。失败与最终日志都保留在artifacts/campaign-native-observer-audio-*.log，详见对应source-notes。
- 完整世界音效、消息音、音乐/循环/EFX、OpenAL实机听感与完整自动世界仍未完成；readyForAuthority=false、simulation.status=unavailable不变。无子代理、无桌面操作、未暂存/提交/推送/打包/发布；整体目标active。


## 2026-09-23：原生航行页真正接入舰队后勤HUD

- 主代理新增只读原版后勤投影与左下NativeLogisticsHud，私有HTTP只读对应舰队账号/资源与已同步统计，不切global playerFleet。星币/补给及日耗/船员最低需求/陆战队/三容量/有效CR及上限/船体装甲加权修复率/修理天数/传感器值已接；缺失或未sync明确未知，不用旧缓存或假0。新增原版orbitron20aabold字体，仍保留原布局与普通货舱/舰队页未实现边界。
- 真实SQLite→HTTP→完整页面验证自己的58,580星币、不显示别人的1,234,567、可信帧实际扣1补给后revision3更新；HUD查询不改变checkpoint，数值对照含封存排除/装甲加权/有效CR。已查看artifacts/campaign-native-logistics-hud-1920.png（无背景synthetic地点，不是正式星区）。
- 一次类型、改动lint通过，一个既有native personnel场景1通过0失败（84578.6311ms/总85138.0088ms）。源码复查后的原版小装甲缓存/未sync占用边界仅定向检查与2文件lint通过，没再重跑主场景或全套；source-notes与artifacts/campaign-native-logistics-hud-*.log保留详细证据。
- 航速仪表、完整悬停和动画、展开态本轮补拍、其它核心页及自动完整世界/正式开局仍未完成。readyForAuthority=false / simulation.status=unavailable不变；无子代理、无桌面操作、未暂存/提交/推送/打包/发布；目标仍active。

## 2026-09-23 主代理：原生航速及燃料日耗HUD
- 按原版coreui/C、斜格类、Misc、LogisticsModule及原版截图先写source notes，再接真实私有HUD：当前航速、20格显示、最大速度/加成/惩罚、无油/日耗，原版insignia21LTaa位图字体。
- HTTP读取只使用本舰长状态，不写权威图、不惰性创建动态stat；未sync逐项未知；客户端10样本平滑仅呈现，未自动推进世界。
- 类型/lint通过。同一既有场景首跑在新增循环图序列化断言失败，改成checkpoint编码后复验1通过0失败（84.65秒），未全套。真实SQLite/HTTP页面20格与12→0帧后更新通过，已查看两张1920截图。测试是可信host帧夹具，不冒称正式自动航行或原版像素等价。
- 详细证据/边界见docs/campaign-native-navigation-hud-source-notes-2026-09-23.md，截图artifacts/campaign-native-navigation-hud-{1920,stopped-1920}.png。原生HUD不再以—占位航速，但完整tooltip/GL/Fader、普通货舱/舰队页、自动世界/正式开局/多人上下文仍未齐。
- 本轮主代理独立完成，无子代理、桌面操作、暂存提交、推送、打包、发布；整体目标仍active。

## 2026-09-23 主代理：去掉无头世界帧的记录回调依赖
- 按CampaignEngine/OOoO/CoreScript/FactionProduction原版源码补默认接线：null输入真正早退、实际viewport数据、native经济通知接收者；不再为已有默认引擎处理器强制空services对象。
- 移植生产汇集点getter：旧点失效/null时选最老玩家殖民地、稳定平龄；月结必须调用getter后才能判定无汇集点。制造服务/历史未知仍失败，不伪造订单交付。
- 同一真实SQLite/personnel场景：无需tooltip/intel/paused-market/经济通知记录回调，原生月结、船员工资净额、自然运动和补给消耗、暂停恢复、checkpoint恢复通过。此次夹具无殖民地且显式新建core通知注册，不代表正式自动世界或完整殖民地结算完成。
- 类型通过，测试新增正则和写文件函数名错误分别修复后定向lint/同场景复验通过：1通过0失败（107.17秒）；未全套、无UI重测。详见docs/campaign-native-headless-frame-source-notes-2026-09-23.md及artifacts/campaign-native-headless-frame-{types,lint-final,scenario-final}.log。
- 仍保持readyForAuthority=false、simulation.status=unavailable；未开放自动循环/玩家tick入口，无子代理、桌面操作、暂存提交或发布；整体目标active。

## 2026-09-23 主代理：殖民地账簿默认接线与原版制造造价/产能
- 主代理直接实现，无新增子代理：30 项原版行业名称进入默认月结；当前生命周期行业对象进入账单；制造无仓库早退与真实 storage cargo getter 已接线，未用空回调。
- 原生 runtime 可读取制造单价/整单价/当前月产能，保留 Java float/int 顺序、武器价格委托、真实玩家动态修正 target、当前短缺和 checkpoint 身份，不以读价冒充交付。
- 真实 SQLite 原生帧验收：两个显式玩家殖民地（无仓库分支）的行业/出口收入维护、危险津贴、资金净额、月报通知及存续订单；带仓库制造缺服务时完整回滚。225,000 产能随短缺变为 112,500 并可恢复。
- 首场景发现并修复金额误用商品 65,536 范围限制；下一次仅修正新增夹具对已存在空 modifier 的错误假设。类型/lint及同一既有场景最终 1通过0失败（87.31秒）；未全套，无 UI 变化、无桌面操作。
- 详细证据：docs/campaign-native-colony-production-accounting-source-notes-2026-09-23.md；日志 artifacts/campaign-native-colony-production-{types-final,lint-final,test-lint,scenario-verified}.log。
- 完整自动装配、制造入库、生产报告仍未实现；正常有仓库殖民地到达该分支仍明确拒绝并回滚。readyForAuthority=false / simulation.status=unavailable不变；生涯未暂存/提交/发布，整体目标 active。

## 2026-09-23：制造报告与实际交付原语续接

- 在上一轮完整 CoreScript 制造程序基础上，生产报告已从外部回调契约接入真实 IntelManager：实际生产子类、实际汇集点/有序批次 Cargo、首次可见时间、消息点击目标与循环 checkpoint 身份校验。
- 原版期限核实并落地：duration=10 不等于第 10 天删除；ProductionReportIntel 先要求至少 30 天且非重要，再调用 FleetLog 的 ended/duration 判断。
- 接入真实默认配装收费（排除内置机翼/武器）、CargoData NULL-type 判空、解除封存的 CR 恢复 + updateStats + FleetData needsSync，随后交付 CR=0.5。
- 一次集中验收通过：类型检查 0、改动 lint 0；已有短月结场景 1/1 通过（422.196ms，含报告/货舱循环存档/点击目标/期限/维修边界）。日志：artifacts/campaign-native-production-report-{types,lint,scenario}.log；原版来源与范围：docs/campaign-native-custom-production-source-notes-2026-09-23.md。
- 边界不变：自动装配器、临时生产舰队/变体列表、行业产物、旧仓库完整图及历史 prodRandom 导入仍待接；制造测试中的这些世界依赖仍是契约适配器。本轮不证明完整自然制造交付，也未做生产报告 UI。生涯目标仍未完成，readyForAuthority=false、simulation.status=unavailable；未提交/推送/打包/发布。

## 2026-09-23：装配主程序收尾与真实仓库图接线

- DefaultFleetInflater 主程序已接入 runtime：主/D-mod Random、实际参数/逐舰再播种、装备候选池共享、nullable inflated、listener 与移除次序；CoreAutofit 仅构造与共享分类状态完成，doFit/装备知识历史等仍明确缺失。补回100个分类别名标签和完整已核实会话初值，不以简化配装替代原版。
- 新仓库不再构造估值空投影：真实 CargoData 初值、credits、封存 FleetData、roster/factory 共享对象与成员同步已接线；生产货舱按实际玩家势力命名前缀创建封存舰队。反复读取和恢复不会重建库存；旧投影原样保留，缺完整图时仍拒绝交付。
- 类型检查/改动 lint 通过；两个相关既有短场景最终 2/2 通过（装配/月结 476.191ms，仓库 456.8625ms，总1558.3303ms）。只针对发现的夹具/类型问题复查，未跑大型人员场景、全套或操作UI。真实库存创建/加舰/命名/同步/存档身份通过；制造中的 fit/spec/行业等仍属外部契约，不能冒称完整制造闭环。
- 原版对照与边界：docs/campaign-native-fleet-inflater-source-notes-2026-09-23.md、docs/campaign-native-storage-graph-source-notes-2026-09-23.md；最终证据 artifacts/campaign-native-storage-graph-{types,lint,lint-final,scenario-final}.log。
- 下一实际缺口：CoreAutofit.doFit、装备蓝图/规格、生产 String/name/boolean 工厂及行业产物、旧仓库完整图捕获；普通货舱/舰队/生产报告 UI、正式开局和多人完整世界仍未完成。readyForAuthority=false / simulation.status=unavailable，整体目标 active；无子代理、无桌面操作、未暂存/提交/推送/打包/发布。

## 2026-09-23：实际 CoreAutofit 执行算法接入

- 主代理独立移植 doFit 主流程及装备匹配/升级、模块递归、通量预算、插件/S-mod、随机插件；runtime 默认不再要求调用方整段提供 fitInflaterVariant。底层真实 spec/OP cost-stats 等仍是显式服务，缺失继续拒绝，不以固定标准变体填装放行。
- 保留原版随机次序、对称槽独立种子、共享候选数量、静态 RANDOMIZE_CHANCE/category/tagLevel 历史；实际变体 HashMap 和机翼变更复用原生规则。DefaultFleetInflater 的清槽返还第一项已用安装 jar 的 javap 复核，而非直觉修正。
- 类型与改动 lint 通过；一个既有短月结/制造场景最终1/1通过（481.0591ms，总1018.7613ms），新增真实 doFit/S-mod/模块/武器与机翼安装覆盖。规格和 OP 使用明确 primitive fixture，不声称完整装备注册器、普通玩家改装或自然制造已可用。无大型/UI/全套重测。
- 原版证据与边界见 docs/campaign-native-core-autofit-source-notes-2026-09-23.md；日志 artifacts/campaign-native-core-autofit-{types-final,lint,lint-final,scenario-final}.log。下一块是实际装备/槽位规格、OP cost-stats 和势力装备知识默认服务，再续生产工厂/行业产物。
- 完整生涯、原版核心页/正式开局、独立/合作联机完整世界仍未完成；readyForAuthority=false / simulation.status=unavailable，整体目标 active。无子代理、桌面操作、暂存/提交/推送/打包/发布。

## 2026-09-23：真实配装规格默认连接

- 主代理独立补入可复现原版规格注册器：163 武器、31 联队、532 舰体/皮肤；武器/机翼分类、优先顺序、AI hints/ammo 由安装 jar 提取，舰体皮肤/D 型标签与实际槽位来自公开原版资源。Runtime 默认已接 weapon/fighter/hull/slot 与 weaponFits，不再要求调用方提供这些静态规格；可单独替换注册器/服务支持大改。
- 与原版类的 5184 个武器安装兼容组合一致，实际 Hermes/lightmg 经既有 doFit 运行；保留重复槽 ID、mountTypeOverride、受限混合槽与通量上限后的剩余 OP。类型/改动 lint 通过，既有短月结场景最终 1/1（533.2168ms，总1051.7222ms）；未跑大型/全套/UI测试。
- 这不是完整生产闭环：测试 OP/机库仍是该无技能/无 OP 插件情形的 base-only 探针，默认真实 OP 属性/插件效果、装备知识和蓝图时间戳、变体/DModManager、生产工厂及行业产物仍待接。源码边界/日志见 docs/campaign-native-autofit-specs-source-notes-2026-09-23.md 与 artifacts/campaign-native-autofit-specs-*。
- readyForAuthority=false、simulation.status=unavailable；整体目标仍 active。未新增 UI；未启动可见窗口、使用子代理、暂存、提交、推送、打包或发布。

## 2026-09-23：真实 OP 预算、插件缓存和机库服务接入

- 主代理独立接入 BaseWeaponSpec/FighterWingSpec 原版成本、角色加成/监听器顺序、HullVariantSpec OP缓存/失效/浅克隆与 variant-only MutableShipStats。Runtime自动配装及舰队强度共享同一实际成本服务；computeNumFighterBays按顺序运行真实beforeCreation，不再固定取舰体基础机库。
- 补 ConvertedHangar、ReinforcedBulkheads、FluxCoilAdjunct 无成员属性分支；复用已有BlastDoors/ITU等处理器，Automated保留真实null成员分支。未移植插件/监听器仍明确拒绝，可单独替换规则服务。
- 类型/lint退出0；同一既有短月结场景1/1通过（513.9634ms/总1022.1376ms）。实际Hermes预算含原版自动换装：lightmg×2、vents10/caps7、fluxdistributor，共27/27 OP，取代上轮base-only探针。缓存身份/克隆/循环存档、真实ConvertedHangar与listener顺序同时通过。没有全套、大型或UI重测。
- 源码/边界：docs/campaign-native-autofit-costs-source-notes-2026-09-23.md；日志：artifacts/campaign-native-autofit-costs-{types-final,lint-final,scenario-final}.log。装备知识/蓝图历史、物品经理、变体/模块/DModManager和生产工厂仍待连接；不冒称完整制造、核心页、开局或多人完整世界。
- readyForAuthority=false、simulation.status=unavailable；整体目标active。无子代理、桌面操作、暂存/提交/推送/打包/发布。

## 2026-09-23：势力装备知识/优先与蓝图时序连接

- 主代理独立补真实Faction装备规则与Runtime绑定/读取/学习/遗忘/优先变更；保留LinkedHashSet插入次序、long时间精度、autoEnable、重复学习短路及固定player-id分支。默认世界时钟记录学习时间，checkpoint恢复共享势力身份与实际历史；旧缺失数据明确拒绝，不用静态势力配置伪造。
- 默认DefaultFleetInflater已接武器/战机/NPC插件知识、蓝图时间过滤和priority，既有inflater探针的七个知识回调已由真实服务取代。玩家插件必须来自原版CampaignUI/CharacterData联合集合的最终HashSet次序，不读NPC私有插件替代；Codex解锁缺真实服务仍拒绝。
- 类型退出0，改动lint定向消除一条负向类型用例精度警告后0警告；同一既有短月结场景1/1通过（761.1107ms/总1344.8742ms）。测试包含真实时钟、学习/遗忘顺序、未来蓝图、Java long边界、缺历史/副作用拒绝和循环checkpoint；无大型/全套/UI测试。
- 对照与边界：docs/campaign-native-faction-equipment-source-notes-2026-09-23.md；日志artifacts/campaign-native-faction-equipment-{types,lint,lint-final,scenario}.log。尚缺正式开局/保存捕获的装备初始化、玩家插件联合集合默认读取、Codex/物品经理、变体/模块/DModManager与生产工厂；当前仍不是完整制造或完整多人世界。
- readyForAuthority=false、simulation.status=unavailable；整体目标active。无子代理、桌面操作、私人存档读取、暂存/提交/推送/打包/发布。

## 2026-09-23：玩家插件知识与真实必需品经理接入

- 主代理独立补玩家技能/默认/已学插件联合集合，原版XML提取已学HashSet并保留容量/桶序；Faction固定player getter和Runtime默认配装不再依赖外供插件列表。已安装类提取129插件、58技能/27解锁效果，16组Java集合顺序oracle通过；旧Web缺历史仍拒绝。
- 实现HullModItemManager的SectorMemory单例、RefitScreenListener保存引用、待确认差异/预占、舰队→仓库扣取、确认安装/退还和在用品货舱；默认自动配装检查、Runtime改装保存监听器与遭遇战经理读取共享同一实例。独立世界身份计数避免误触尚未初始化的FleetData类。
- 一次类型/lint通过；只针对同一短月结场景发现的测试路径和经理身份分配问题修复复查，最终1/1通过（963.8982ms/总1495.5312ms），受影响lint0警告。真实XML、货舱物品量/顺序、共享对象/循环checkpoint均覆盖，没有全套/大型/UI测试。
- 源码、边界、日志详见docs/campaign-native-player-hullmods-source-notes-2026-09-23.md和artifacts/campaign-native-player-hullmods-{types,lint,lint-final,scenario-final}.log。
- 尚缺六个fragment/shrouded自定义必需物品插件、旧世界经理/监听器完整捕获、玩家改装UI接线、Codex、空变体/模块/DModManager及生产工厂；不宣称制造/完整生涯已完成。readyForAuthority=false、simulation.status=unavailable，目标active；无子代理、桌面操作、私人存档读取、提交/推送/打包/发布。

### 2026-09-23：特殊必需品与生产空变体/模块工厂接线
- 六个原版插件的五种必需品已接真实初始化、默认货舱/改装扣取和返还；生产过滤、实际玩家知识/内存及Runtime循环恢复已连通，不再要求外部伪造item。分析对话仍需真实UI/规则服务，当前不直接解锁。
- 用户本轮新授权一个子代理：交付空变体/模块工厂；主代理完成审查和默认Inflater/CoreAutofit接线、集中验收，已回收代理。fresh的source=null、库存模块共享/override深克隆/OP缓存浅引用得到保留；不绕过默认模块注册表顺序未知的拒绝。
- 类型/lint退出0；只运行既有短月结场景，1通过0失败（1175.3467ms/总1881.0061ms）。唯一初次失败为测试夹具角色Memory未显式绑定，已定向修正。原版证据和明细见 campaign-native-required-items-source-notes-2026-09-23.md、campaign-native-empty-variants-source-notes-2026-09-23.md。
- 下一缺口：真实有序模块注册表初始化、DModManager、生产舰队String工厂与行业交付；玩家原版UI/网络回执、正式开局及独立/合作上下文仍待完成。目标active、readyForAuthority=false、simulation.status=unavailable；未做桌面操作或生涯暂存/提交/推送/打包/发布。

### 2026-09-23：原版默认模块注册表、DModManager 与通用插件经理接通
- 按用户最新要求仅复用一个子代理：代理完成真实默认模块注册表与 GenericPluginManager/Engine；主代理同步完成D-mod原版提取、规则实现、Runtime/Inflater接线与公共验收。未派生更多代理。
- 默认模块从本机真实加载顺序、CSV、51个硬编码variant与SpecStore pass提取：761项注册表，266个HULL，13个填默认模块，22个共享模块改名。remnant_station1_Hull原版确实无模块，不补造；旧checkpoint不补初始化历史，不替换当前缓存对象。
- DModManager固定数量/战后回收/移除/D型转换已连实际Runtime；持久化类状态、Java随机、结构损伤候选重抽、内置/永久/压制集合和OP缓存身份均按原版。532舰体/129插件/22个原版jar执行oracle进入同一既有短月结场景。
- 新Engine真实初始化 GenericPluginManager；Runtime按saved→transient挑选实际插件，同分先到/负值拒绝。未知优先级/handler明确失败，历史缺字段不假定空。类型/lint退出0，短场景1通过0失败（1667.3903ms/总2258.8107ms）；未跑全套/UI测试。
- 证据：campaign-native-dmods-source-notes-2026-09-23.md、campaign-native-default-hull-registry-source-notes-2026-09-23.md、campaign-native-generic-plugins-source-notes-2026-09-23.md。日志 artifacts/campaign-native-dmods-{types,lint,scenario}-final.log。
- 下一缺口已收窄到生产舰队String工厂及行业交付、原版UI/网络回执、正式开局与独立/合作上下文；不能把本轮窄场景说成完整生涯。目标active，readyForAuthority=false，simulation.status=unavailable；无桌面/私人存档/生涯暂存提交推送打包发布。
