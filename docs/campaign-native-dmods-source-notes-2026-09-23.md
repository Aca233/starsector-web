# DModManager 与通用插件仓库（0.98a-RC8，2026-09-23）

## 编码前原版对照
- API DModManager.java:39–50 setDHull 即使已是默认D型也先设REFIT；Misc.java:3553–3557 的后缀规则与 g_0.java:204–205 一致，不凭舰名识别。
- DModManager:65–168 战后重载、175–246 指定数量重载均先构造实际参数并优先调用 GenericPluginManager.pickPlugin；不能硬编码没有插件。前者销毁保底、reduceNextDmodsBy消费/清零、own与全局上限；后者不受战后上限约束。
- 筛选顺序：先damage/可选destroyedAlways → removeUnsuited → 限struct → 追加fighterBay/phase/carrier → 去已装。追加项不再次做适舰筛选；抽中第二个struct消耗随机、移出池并回退循环计数。保留原版重复条目，不用Set去重。
- WeightedRandomPicker.java:165–208：nextFloat乘总权重、边界<=，不是nextInt；pickAndRemove按对象identity删除首个匹配。
- HullVariantSpec.java:217–255、897–955：移除压制/永久插件会按built-in/perma重新判断active集合；addPermaMod(false)不移除已有sMod。setHullSpec:1226–1241只追加新built-in，并不清空旧武器、机翼、插件。
- GenericPluginManager.java:21–83：两个真实仓库，saved后transient，相同优先级首个胜，负值拒绝；ObjectRepository:89–119按同一对象去重（两个仓库各自去重）。CampaignEngine:269的新构造真实创建空经理；历史Web缺字段不补空。
- 舰体字段复用公开storage/autofit/fleet-sync元数据，补CSV peak CR秒、skin.restoreToBaseHull、真实默认D-parent/base映射；HullMod SpecStore使用LinkedHashMap，注册候选顺序取实际原版集合而非排序。

## 交付与验证边界
- 补D-mod规则、通用插件挑选仓库、真实Runtime固定数量/战后/移除/默认Inflater连接；保留规则与插件服务替换。
- 安装jar无头运行真正DModManager/HullVariantSpec/GenericPluginManager，公开规格注入，不启动Sector/窗口、不读私人存档。集中类型、改动lint与一个既有短场景。
- 本块不改UI；原版/Web改装及恢复界面实机待核实。不把规则或窄场景当完整生涯；readyForAuthority=false/unavailable，不暂存提交发布。

## 本轮交付与验收结果
- importer 已执行：532 个舰体、129 个插件规格、22 组安装 jar 的真实 DModManager oracle。使用真实 HullVariantSpec 和 GenericPluginManager；公开静态规格与 recoverer 动态值为显式注入，不是完整世界/战斗实机。
- 复用了默认模块注册表提取的原生 restoration 字段，修正默认 D 型的 baseHullId：例如 hermes_default_D 原版为 null，DParent 才是 hermes，不能自动把两者等同。
- OriginalDModManager 已实现固定数量、战后销毁/回收、计数、内置/永久/压制移除、D 型转换；Java float/nextFloat/nextInt/long 和结构损伤重抽消耗与 oracle 一致。固定数量可以超过战后上限；recoverer=0 也执行 nextInt(1)，不得略掉 RNG。
- setDHull 无论是否已D型先设 REFIT；HullSpec 改动保留原武器/机翼/插件数组、原OP缓存对象，只按原版追加/覆盖内置项。装甲/模组/武器图形和实际原版恢复 UI 没有在本轮验证。
- Runtime 默认 Inflater 接 readInflaterDModCount/setInflaterDHull/addInflaterDMods；新增固定数量/战后/移除/转换入口。默认查询当前真实 Engine GenericPluginManager；候选插件缺同步优先级或执行服务即拒绝，绝不以空回调替代。空经理由新 Engine 真正初始化，旧 checkpoint 缺经理或DModManager类历史不补造。
- DModManager 三个类字段保存在当前 fleetServices.dmodClassState；恢复时验证已存在状态，未捕获的旧状态只允许显式绑定，不自动补零。默认随机来自当前持久化 newRandomSeeds；不读取墙钟随机或切换全局玩家。
- 自定义 GenericPlugin 可 checkpoint 为规范描述符；saved→transient顺序、跨仓库同对象重复、同分首个、负优先级拒绝、精确class查询与显式handler覆盖均已接 Runtime。自定义 equals/hashCode 和未知原生插件仍未实现。
- 集中验收：campaign tsc 退出0；17个相关文件 oxlint 退出0、无诊断；唯一既有短月结场景 1通过0失败，场景1667.3903ms/总2258.8107ms。未重复全套、未新建测试工程、无桌面操作。
- 同一场景同时覆盖全部266个默认HULL与原版注册表结果、13个模块HULL填充、共享模块身份、库存对象不被重建、旧历史拒绝、22个D-mod oracle、实际Runtime处理与循环checkpoint往返。
- 日志：artifacts/campaign-native-dmods-types-final.log、campaign-native-dmods-lint-final.log、campaign-native-dmods-scenario-final.log。

## 后续仍缺
生产舰队 String/name/boolean 工厂与行业实际交付闭环；D-mod 相关改装/恢复界面与原版实机对照；正式开局、完整网络回执和独立/合作玩家上下文。当前只是新补的规则与 Runtime 连接，尚不是完整制造/生涯。readyForAuthority=false、simulation.status=unavailable；没有生涯暂存、提交、推送、打包或发布。
