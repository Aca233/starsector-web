# 原生舰队装配链（0.98a-RC8）

## 原版证据 → 行为
- DefaultFleetInflater.java:225–525：构建 CoreAutofit、独立主/D-mod Random、UPGRADE 抽签、势力蓝图/时间戳/优先级、tier/category/size 装备池、逐舰名字 hash 再播种、目标方案、随机化/S-mod/D-mod、setVariant 和最终 FleetData 同步。空舰队同样执行初始化、蓝图读取、Memory 和同步，不能空返回。
- DefaultFleetInflater.java:527–575：质量与 D-mod 均值、上下限/S-mod 概率和 LinkedHashSet makePicks；全选不消耗随机数，非全选保留抽取插入顺序。
- CampaignFleet.java:201–221：setInflater 不重置 inflated；仅 nullable inflated==null 执行；false 不是 null。装配完成后按当时的 inflater 调 ListenerUtil，再重新检查 removeAfterInflating，最后设 true。
- CoreAutofitPlugin.java:115–220：实际默认选项、舰长 stats 与共享分类 fallback；本轮建立真实会话数据，不把 studio 的预览补齐算法用作原版自动装配。doFit 的复杂装备适配仍必须是真实已移植/明确注入的服务，不能空函数。
- ListenerUtil.java:401–405：真实 FleetInflationListener 调用；旧世界未捕获的 listener roster 不自动猜为空。

## 当前差异 → 修改
- 制造目前要求整个 inflater 外部实现；移植 DefaultFleetInflater 主程序、可持久实例参数与 CampaignFleet 装配状态管理，接现有实际成员/势力/变体/随机数服务。
- 支持替换 CoreAutofit 与装备读取服务以便大改，但缺失知识历史/装备服务/最终 doFit 必须明确拒绝，不借固定标准变体放行。
- 库存/变体/AI 工厂完整绑定仍需另接；不得据算法场景通过宣称生涯/自然制造完成。

## UI 与验证
- 这是无界面的原生装配规则链，不改变原版 UI 布局。原版实机与最终配装页面待许可，不操作桌面。
- 加入现有短月结场景集中覆盖随机顺序、优先装备、nullable inflated、回调顺序、实际默认同步入口。一次类型/lint/短场景，失败才定向复查。

## 本轮实现细节
- 原版 forceAutofit Memory 键核实为 `$overrideNoAutofit`，不是由常量名称猜出的字符串。
- CoreAutofit 的分类表是跨实例共享状态：新 Web 原生运行实例显式创建 class state；保存恢复后继续引用同一分类数组；旧 checkpoint 没有该状态时要求显式绑定，不能每次装配重置。
- 装配器和参数保留实际句柄；新建世界捕获空 FleetInflationListener roster，老世界缺失则报未捕获，不悄悄补空。回调拿到装配/前一回调修改后的当前 inflater，remove 检查同样读取当前实例。
- 默认随机构造使用现有明确的 Web 持久 newRandomSeeds 分支，不声称它重建了未知 JVM nanoTime/seedUniquifier 历史；原版显式 seed 的逐舰算法保持 long 溢出/hash 和 Random 顺序。

- 续查构造：CoreAutofitPlugin.java:91–105 每分类含 base0…base99 标签；补回该别名标签表及 119–130/258–263 的两个替代分类映射、debug、availableMods、slots/baysToSkip、fittingModule、missilesWithAmmoOnCurrent 初值。
- FleetMember.java:418–429 / HullVariantSpec.java:364–377,1554–1556 核实正常已加载变体的 station/civilian 默认读取；不以成员缓存字段代替变体判定。

## 本轮验收（主代理续接）
- 修复新增短场景遗漏的 restoreOriginalStorageVariant 导入及 Long 边界 Number 精度警告。
- 构造分类补回 base0…base99、替代分类映射和跳过槽位等实际初值；恢复后仍共享同一分类状态。
- 最终已有短月结场景通过（476.191ms）；与仓库场景合跑 2/2，通过总耗时 1558.3303ms。类型检查退出 0，改动 lint 退出 0。最终日志见 artifacts/campaign-native-storage-graph-{types,lint,lint-final,scenario-final}.log。
- CoreAutofit.doFit、势力装备蓝图历史/规格适配、DModManager 和生产所用 String/name/boolean 工厂仍未全部移植；该场景的 fit/spec/空变体/部分同步是明确契约适配器，不证明自然自动装配已完成。

## 后续实现更新
CoreAutofit.doFit 已在 OriginalCoreAutofit/OriginalAutofitEquipment 移植并接为 runtime 默认；本文件上方“doFit 尚未实现”为前一阶段记录。实际装备/spec/OP cost-stats、变体与 D-mod/知识历史默认绑定仍未齐，不能因此放开自然制造。详见 docs/campaign-native-core-autofit-source-notes-2026-09-23.md。
