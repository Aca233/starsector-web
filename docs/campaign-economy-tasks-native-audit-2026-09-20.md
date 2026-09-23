# 经济任务编排与惰性商品网络：原版先行审计（2026-09-20）

Starsector 0.98a-RC8。本轮从局部算法推进到任务执行与缓存生命周期，不改UI；用户使用电脑，仅后台文件/隐藏Java。原版实机及市场UI验收仍待许可。

## 原版证据 → 预期顺序

- `ReachEconomy.nextStep`先按当时市场列表副本刷新每个市场管理员character/outpost效果，然后创建MainWorkTask2；Main完成后才抓UpdateMarketsAgainTask市场快照；Again完成后才抓ImmigrationTask的Reach列表。强制步默认immigration为UI-only，除非forceNonUIStep；withImmigration=false才跳过人口任务。
- `ReachEconomyStepper.createTasks`在同一时刻创建全部四项任务，因此Again和Immigration列表捕获时间与forced nextStep不同。正常步immigration总是非UI，withStockpileUpdate仅本月最后迭代为true。帧预算/日历tick/月结尚不能由“一个任务已完成”替代。
- `MainWorkTask2.initCommodityList/doNextBatch/isDone`第一次batch只创建商品名单：按实际Settings.getAllCommoditySpecs顺序过滤nonecon，再按float economyTier稳定升序。不是UI order，也不排除meta；不得用commodity对象键排序重排同tier。没有经济商品时Main甚至不重放市场，因isDone先成立。
- Main先逐个市场conditions→industries，再逐商品：从任务所捕获市场**当前**econGroup形成LinkedHashSet；先new CommodityMarketData(id,null)，再有序命名组；若withStockpileUpdate则更新任务市场的库存/价格；最后对当次listeners列表副本通知commodityUpdated。已失效listener从实时列表移除。withIncomeAndUpkeep字段在此实现没有被读取，不能借它跳过产业apply。
- `UpdateMarketsAgainTask`再次逐市场conditions→industries。`ImmigrationTask`每市场advance(30f/NUM_ITER_PER_MONTH, uiOnly)，本机设置economyIterPerMonth=10即3天；不使用调用时画面delta。`FinishEconomyUpdateTask`另取listeners副本，清理失效项并economyUpdated。
- MainWorkTask2反编译listener循环的Iterator变量类型错误已用安装jar的javap交叉核对：字节码349–401明确遍历副本中的EconomyUpdateListener，再expired/remove或commodityUpdated。记录`artifacts/campaign-economy-task-javap.log`；修复仅局部类型/比较器桥名，不改语义。
- `CommodityOnMarket.getCommodityMarketData`仅在自身引用为null时new整个当前组；constructor按实时经济组给组内各市场同商品绑定新对象。组变动不会自动失效旧引用；离开实时经济组的市场可能反复构造但不获得绑定。不能用(commodity,group)的永久缓存替代原版每市场引用。
- 商品网络constructor缓存份额/市场规模，不缓存最终出口收入：`getExportIncome`用缓存份额乘**读取时**的market incomeMult和player export技能倍率；`getMaxShipping`也是读取时accessibility。新的网络对象不能让其他commodity的旧份额隐式更新。

## 当前差异与实施/验证

当前已有计算函数，但没有任务编排，缺每市场商品网络对象身份，财务组合投影容易被误作恒定getter。本轮新增完整四任务的同步分batch执行器、forced/scheduled快照差异、可替换可信runtime接口；接已有原版商品网络/份额计算形成惰性引用层，并验证跨commodity先后写access以及财务late read。市场/技能/事件的具体执行仍必须有真实runtime依赖；缺依赖拒绝，不能发空事件后报告世界fresh。

验证抽取原版任务/nextStep/createTasks和缓存getter进行隐藏Java对照；动态市场增删、组变化、监听器增删/失效、同tier、nonecon/meta、UI/真实人口及股票价格开关均覆盖。另用已支持产业/商品网络/财务/人口模块做实际组合测试。完整sector加载、全部产业/物品/管理员技能、月账、权威发布仍未完成；这轮任务完成状态只说明执行器依赖调用完，不是可交易世界认证。

## 全目录联测发现：蓝龙虾不能从任务名单删掉

本机33个commodity spec中，19个参与经济，包含lobster（demandClass=luxury_goods、origin=volturn、tier2.8）及ships/meta。首次完整目录组合在蓝龙虾处被旧primary-only聚合正确拒绝；不能通过过滤lobster假装整步完成。

`CommodityOnMarket.updateMaxSupplyAndDemand`每次先把maxSupply/maxDemand清零；遍历产业更新supply，但非primary跳过demand getter/更新，因此lobster自身刷新得到maxDemand=0，保留旧isDemandLegal。`CommodityMarketData`在primary构造时将其maxDemand/isDemandLegal复制给同class其它commodity；随后tier2.8的lobster构造会再次清零它自身maxDemand。这不是恒定继承主商品需求，必须保留阶段差异。constructor的出口/可用量/份额循环对原版lobster没有另行origin特判，不能仅因exotic标签跳过。

本轮扩大产业聚合/网络到已知无plugin的原版非主商品，旧primary-only价格接口仍保持严格，不冒充variant stockpile/price类循环已实现；缓存runtime必须显式提供主商品需求复制写入。`loading/while.java`（CFR重命名CommoditySpec）getExportValue返回本字段，无getter级自动继承；getBasePrice也是已加载字段。本轮将该来源补入哈希记录。

补证：`loading/SpecStore.java:1026–1028`加载commodity exportValue，CSV留空则0；已加入来源锁定，共15份。后台抽取`CommodityOnMarket`原方法核对162组maxima（含蓝龙虾不读取需求、正数并列保留首个合法性），128组缓存收入getter，以及一条缓存对象生命周期。缓存构造在该Java探针中仅替换为实时组绑定桩，因此不能把它当成完整原版constructor数值对照；网络/份额数值仍用单独原版探针验证。
