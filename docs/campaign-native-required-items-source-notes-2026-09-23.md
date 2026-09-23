# 原版特殊插件必需物品（2026-09-23）

## 范围与证据（编码前）
- 原版：本机 Starsector 0.98a-RC8；不读取私人存档、不启动界面。
- API 源码：FragmentSwarmHullmod:319、SecondaryFabricatorHullmod:31 → fragment_fabricator；FragmentCoordinatorHullmod:31 → threat_processing_unit（alpha_core 是被注释的旧实现）；ShroudedMantleHullmod:52、ShroudedThunderheadHullmod:98、ShroudedLensHullmod:52 → 对应三种渊幕物品。
- 六个方法都调用 Settings.createCargoStack(SPECIAL, new SpecialItemData(id,null), null)。CampaignEngine:1508 / StarfarerSettings:2547 委托真实 CargoItemStack 构造器；CargoItemStack:102–163 初始数量0、roundSize=false、无货舱，并执行规格插件 setId/init，不能用只有ID的空壳替代。
- loading/X:54–64；BaseSpecialItemPlugin:35–59、96–119、335–340；ShroudedHullmodItemPlugin:54–101。前者右键无动作是原版行为；后者仅在角色未学会时显示分析，永不直接消耗物品，写 player memory 的 $shroudedHullmodId（0天）并打开 ShroudedHullmodItemRC 规则对话，不能直接添加插件知识。
- special_items.csv 提供中文名称、价格、图标、音效、插件类与params；rules.csv:393–480 是分析对话流程。

## 预期行为与当前差异
- 补齐六个真实必需品工厂、Base/Shrouded 插件初始化，以及 cargo add/copy/sort/安装扣取/原物退回默认路径。保持外部服务可替换，未知插件类仍拒绝。
- 必需品查询每次创建新零数量堆栈与绑定插件；需要数量1由 HullModItemManager 操作处理，不擅自改变工厂默认值。
- 渊幕右键只接真实对话服务；缺少UI/规则服务则明确拒绝，不填空回调。此次不改变界面；原版/Web同分辨率画面和实际右键交互仍待许可与UI实现，不冒充实机验证。

## 验证方法
- 无头运行安装jar中的六个getRequiredItem及真实CargoItemStack/X插件工厂；只注入公开规格Settings查询，不建立Sector、窗口或存档。
- 在既有月结短场景中验证工厂/货舱/经理/Runtime/循环checkpoint，集中一次类型与改动lint。具体失败才定向复查。
- 保持 readyForAuthority=false、simulation.status=unavailable；不暂存、不提交、不打包、不发布。

## 实现接线
- 新规则工厂覆盖七个原版 Base/Shrouded 物品（六插件所需五种，另有两个同基类物品）；其它custom插件仍要求真实实现。
- Runtime 的 bindNativeSpecialItem 读取当前真实角色联合知识、PlayerCharacterData Memory 和舰队，不切换全局上下文。PlayerCharacterData.java:96–97 的 knowsHullMod 实际委托 CampaignUI.isHullModAvailable，所以这里不是只查已学集合。
- 新增堆栈经现有 NativeCargo 默认路径进入 add/copy/sort；RequiredItemManager/自动配装/DefaultInflater/遭遇战返还共用原路径。分析对话的声音、规则创建和呈现仍必须由真实服务提供；当前只验证记录适配器中的调用次序。

## 集成验收结果（2026-09-23）
- 无头安装jar提取成功：六个getRequiredItem、七个Base/Shrouded物品规格；真实工厂初值、独立对象、插件绑定、价格/名称/右键移除策略与Web对照一致。未读取私人存档或启动游戏。
- 特殊物品：默认货舱新增/排序、双插件共享仿织器预占、舰队后仓库扣取、保存确认、在用品货舱、拆除退回、Runtime监听器与循环checkpoint恢复已在既有场景验证。生产过滤现在直接遍历六个原版必需品，不再使用虚构物品回调。
- 玩家分析：Runtime读取当前真实联合知识与CharacterData Memory；缺真实UI/规则服务仍拒绝。测试中的规则对话仅是调用次序适配器，未证明完整对话/UI可用。首次场景失败因小XML夹具未显式绑定角色Memory字段；按已知缺省null进行夹具绑定后通过，未放宽运行时的未知历史拒绝。
- 空变体/模块：一个用户新授权子代理交付规则，主代理审查并完成默认Inflater/CoreAutofit接线、类型兼容及同场景断言；已回收子代理。fresh源为null，不冒充HULL；模块库存共享、override深克隆、HullSpec/OP缓存浅引用均核实。
- 最终集中验收：tsc=0，12个相关mjs/d.mts/mts的lint=0（无诊断）；唯一既有短月结场景1通过0失败，1175.3467ms，总1881.0061ms。无全套/人员长场景/桌面测试。
- 日志：artifacts/campaign-native-required-items-types-final.log、-lint-final.log、-scenario-final.log。
- 未完成：真实默认模块注册表顺序初始化、DModManager、生产String/name/boolean舰队工厂及行业交付闭环；实际改装/分析UI与网络按钮回执、正式开局和独立玩家上下文等仍未完成。readyForAuthority=false、simulation.status=unavailable；整体目标active。未暂存/提交/推送/打包/发布。
