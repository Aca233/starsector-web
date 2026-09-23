# CoreAutofit 实际执行规则（0.98a-RC8）

## 原版证据 → 预期行为
- CoreAutofitPlugin.java:264–552：模块递归、拆装、保留槽位、先机翼后武器、原型/升级两遍、舰船插件和 S-mod、通量分配、玩家武器组/非玩家清空、模块期间不同步 UI。
- 同文件:554–1017、2065–2255：按 OP 成本转换 S-mod、插件适用/物品限制、三成通量换插件的严格不等号差异、原版随机插件候选与加权选择。保留 addedTotal 覆盖而非累加行为。
- 同文件:1030–1750：槽位优先级、OP/兼容/射界过滤、类别回退、势力优先、升级阈值、价格/黑市/已使用偏好、对称槽独立 long 种子、机翼独立过滤 RNG。
- RANDOMIZE_CHANCE 是共享静态字段（初值 .5），实际进入武器匹配循环后被设为1；disabled 的武器类别随机分支不消耗 RNG。tagLevels 缓存与 categories 别名也是共享状态。
- DefaultFleetInflater.java:585–645：clear 后会给候选列表第一个 wrapper 加1，不是旧装备 id 匹配。已用安装 starfarer.api.jar 的 javap -c 交叉核对（两个 getId 都读取 curr），不能自作修正为直觉上的返还。
- HullVariantSpec.java:428–439,897–906,943–991,1389–1397：内置机翼不可覆盖；空机翼存空串；原版武器 HashMap put/remove；插件修改失效 OP 缓存；不能用数组重建破坏共享变体。

## 当前差异 → 修改
- 将 doFit 及选装执行算法从外部整段回调降为实际规则模块；运行时默认调用已移植算法，底层装备规格、OP cost stats、模块 lookup 和真实插件服务保留替换点以供大改。
- 必需底层数据未知仍明确拒绝，不能通过复制标准方案或空 UI/世界回调伪装自然制造。DefaultFleetInflater 原版 getShip/getMarket/getFleetMember=null、syncUI 空函数是已核实的本委托行为，不扩展为普通玩家改装行为。
- 新变体 mutation 复用实际 HashMap 规则；旧 class-state 未捕获新增静态历史不猜初值。

## UI 与验收
- 本轮为无界面的配装执行，不变更布局。原版改装界面及完整自然制造实机/UI 验证仍待进行，不操作桌面。
- 扩展已有短月结/装配场景：保留实际候选引用、随机顺序、清槽返还、原型/升级安装、通量/S-mod/模块顺序，底层 fixture 适配必须注明；一次集中类型/lint/同一短场景。

## 本轮落地与验收
- 新增 OriginalCoreAutofit / OriginalAutofitEquipment / OriginalInflaterAutofitDelegate 及声明；默认 runtime.fitInflaterVariant 已指向实际 doFit，允许显式替换底层规格/OP/变体/插件服务或整段配装规则。不是复制目标配置。
- 已移植 doFit 的原型/升级两遍、模块克隆递归、拆装与跳过槽、武器/机翼真实候选匹配和安装、通量预算、舰船插件、S-mod、随机插件、玩家组生成入口/非玩家组清空。autoAssignOfficers、doQuickAction 和单独 addSMods 入口不在本轮范围。
- 真实变体变更复用 Java HashMap put/resize 顺序并保持数组对象；机翼空槽保存空串，内置机翼仍受原版保护。两种候选清槽的“返还第一项”由安装包字节码复核后保留。
- categories 别名表、tagLevels 与 RANDOMIZE_CHANCE 保存为共享 class state；初值 .5，只有进入有候选的武器循环才设为1。旧 checkpoint 未捕获新增状态时，不自动猜过去的共享值。保存恢复验证类别别名与实际 Category 对象身份。
- 源码追加核实：Tags.AUTOMATED_FIGHTER 实际为 auto_fighter；Person.isPlayer 为当前引擎玩家 Person 对象身份；HullVariantSpec.getDisplayName 直接读取 variantDisplayName；HullModItemManager:54 对 member/variant 为 null 返回 true（普通玩家改装仍需要实际物品管理器）。
- 现有短月结场景通过实际 doFit：武器/机翼入槽、原版 wrapper 数量变化、射界身份例外、分类/优先/价格偏好、对称独立 RNG、机翼过滤 RNG、通量、S-mod、保留槽位、模块克隆与共享状态恢复。装备规格/OP/物品管理等使用明确的 source-shaped primitive probes，不是完整装备注册器或正式玩家改装世界。
- 类型检查退出0、全部改动 lint 退出0；补齐载机实际安装覆盖后同一短场景最终1通过0失败（481.0591ms，总1018.7613ms），没有大型人员/UI/全套测试。日志 artifacts/campaign-native-core-autofit-{types,lint,scenario,types-final,lint-final,scenario-final}.log。
- 下一关键缺口：实际装备/槽位/spec 注册器、variant OP cost-stats 与插件成本默认接线、势力装备知识历史、空变体构造/模块默认查找及 D-mod manager；生产 String/name/boolean 工厂和行业产物、完整旧仓库图导入仍待补。当前自然制造不能据本场景宣称可用。
- 无 UI 改动、无桌面操作、无子代理；未暂存/提交/推送/打包/发布。readyForAuthority=false、simulation.status=unavailable，完整生涯目标仍 active。
