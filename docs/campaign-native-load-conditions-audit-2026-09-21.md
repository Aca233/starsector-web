# 真实市场离线加载：条件阶段（2026-09-21）

原版 0.98a-RC8；只读本机存档，不操作桌面、不写用户存档、不提交发布。本轮不改UI。UI证据沿用market-client审计：已有截图只证明货舱布局，市场实机视觉仍待许可；后台恢复不宣称视觉等价。

## 原版证据 → 行为 → 差异

- CoreLifecyclePluginImpl.econPostSaveRestore：先全世界产业doPostSaveRestore，再按市场执行条件→产业。现有storage桥仍未接真实条件输入；新入口必须先完成全产业storage，不能边初始化边执行条件。
- Market.readResolve:630–680/getStability:585：稳定性实际是power；haz_base始终写1；缺失商品由getAllCommodities补建，不把保存时删去的零行当完整运行列表。此处的零是构造初始缓存，不是零库存/可交易库存。
- MarketCondition.readResolve:45–55/writeReplace:58–69、BaseMarketConditionPlugin.isTransient:144：被省略的插件按规范新建。离线加载的CommRelayCondition.relays因此是空集合，不能拿保存前的中继站加成当已恢复，也不能把这个初始化用于运行中的普通保存回调。
- BaseIndustry transient supplyBonusFromOther/demandReductionFromOther及其getter:118–129：离线加载首次访问为base0，保存的sB/dR仍保留；读取已捕获管理员动态数值，不在此处擅自刷新CharacterStats。
- FreeMarket.daysActive、RecentUnrest.penalty、PirateActivity.intel.tier、LuddicPathCellsIntel.isSleeper:522、ShippingDisruption.apply:68–85：捕获真实插件字段、情报市场、玩家/全局协议memory、运损MutableStat及临时计时；不统一填null或0。LuddicMajority还需真实管理员、habitable、教会协议和建设队列。
- Market永久immigrationModifiers保留对象身份；真实存档28个ResourceDepositsMC仍由该集合保存，但对应MarketCondition.p省略后会新建另一插件。不能以相同modId把旧对象与新插件合并。旧注册及顺序独立保留，当前插件回调走已有条件核；本轮不会把这些对象冒充完整移民运行时。

## 实施与验证边界

新增严格的数据型条件捕获和离线条件阶段桥，接现有行业storage/管理员读取/ordered condition核；没有原版Java类反序列化或脚本文本执行。保留临时计时与旧注册身份。未知插件/上下文返回明确未支持，不发布半恢复市场。只有离线加载可以使用新建transient字段，不能用于实时保存或经济时钟刷新。

复用现有native-save/storage/condition检查，新增少量链式断言，再对只读真实capture运行同一入口；输出只写忽略的artifacts。全世界产业重应用、监听器、商品网络、价格、准入、零售库存仍需接齐，readyForAuthority保持false。

## 实施结果

- scripts/lib/campaign-native-load-conditions.mjs已接入现有extract/capture链：稳定性power、佣兵军官概率、真实条件上下文、永久回调对象身份及运损计时均进入私有capture。原版来源指纹沿用条件模块并补充玩家协议/教会/建设队列getter来源；原始存档未改变。
- scripts/lib/campaign-native-condition-restore.mjs先调用全产业storage初始化，再提供prepareNativeConditionPhase给后续完整产业组合pass使用。restoreNativeConditionDrafts只运行各市场的局部条件阶段，明确不是整套econPostSaveRestore：没有声称“全市场条件先跑完再全市场产业”是原版完整顺序。后续完整组合pass须消费prepared原始输入一次，不能把已经执行过的result再次作为条件初始输入。
- 本轮实际私有65市场/346产业全部进入真实条件阶段；遍历305条件、应用304（保留原版未勘探/压制判断），不靠测试市场库存。28个旧永久资源回调对象保留，重新创建的同modId插件另有身份；不合并或丢弃原对象。管理员getter读现有捕获，不额外刷新技能；临时计时不推进。
- 缺失零商品缓存按原版加载构造补齐，仅供条件回调读取，不构造stockpile/零售库存或交易报价。旧capture没有新增字段时明确pending，缺失上下文和身份冲突拒绝。
- 两个既有套件最终各11项通过（条件套件复用原来的原版差分，本轮没有新建oracle或测试项目）；存档套件仅增加2个链式用例。严格campaign类型和8文件单线程lint通过。原版实机及Web视觉未测，本轮无UI改动。
- 首次新增断言正则转义错误已修正；真实恢复临时CLI先遇到Node自动ESM解析/内联换行编码问题，明确ESM启动后exit0完成。日志保留失败与修复记录，没有用启动失败代替功能结果。
- artifacts/native-save-condition-restore-report.json记录真实链结果；详细capture/draft及运行日志均只在忽略的artifacts内。原版campaign/descriptor SHA256与复捕获一致。后台短进程均已退出；未启动浏览器/游戏或子代理，未暂存/提交/推送/打包。

## 仍需完成

产业/管理员技能的完整有序重应用、旧/新移民回调实际执行、全世界监听器/网络/价格、准入、零售库存仍未接齐。readyForAuthority=false、Corvus经济/地形等门禁不变，规则锁不变；本轮不能被称为真实市场已可交易，更不是完整生涯完成。
