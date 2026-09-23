# 产业存档存储恢复进展（2026-09-20）

## 实际改动

新增 OriginalIndustryRestore 原版提供者及只读 capture 适配器：

- 实现 BaseIndustry.readResolve 的已核实数据步骤：buildTime下限、modifier身份、空bonus初始化、供需中特定旧flat项清理。
- 随后执行 doPostSaveRestore 的存储步骤：新供需容器、新income/upkeep MutableStat，不沿用保存前缓存；保留持久化supplyBonus/demandReduction。
- 严格匹配30个已有产业ID的15个原版类（commerce保存别名TradeCenter2）。未知插件/错别名/未解码的已序列化storage直接拒绝，不套用默认产业。
- 给完整捕获按市场/产业顺序准备所有storage，保留objectRef与捕获来源哈希。未执行任何market reapply，因此不存在逐市场提前计算导致其它市场仍为空的错误次序。
- 正确读取Boolean improved=null为false；不拿保存的wasDisrupted当成当前isDisrupted。扰乱memory、管理员/fromOther、installed item及完整回调仍明确待解析/执行。

## 真实私有捕获结果

对现有只读捕获生成了另一个被Git忽略的草稿，未改原版存档或capture：

| 项目 | 数量/状态 |
| --- | --- |
| 实际注册市场 |65|
| 完成storage初始化的产业 |346|
| 保留非空flat supplyBonus的产业 |225|
| 待执行真实市场重应用 |65|
| readyForAuthority |false|

私有文件只在 artifacts/native-save-industry-storage-draft.json 与 artifacts/native-save-industry-storage-report.json，未加入夹具/源码/发布。两文件重新解析通过，git check-ignore通过。

**重要区别**：初始化后的空供需与零收支只是原版临时容器，不代表产业没有生产或没有费用。旧capture报告的“346需要完整post-save恢复”尚不能置零，因为原版econPostSaveRestore还包括所有市场的conditions→admin→industries回调。没有生成可以交易的价格、库存或市场快照。

## 验证

后台单进程串行定向回归 **30/30通过**（约4秒），涵盖新storage7项、已有native-save9项、resource14项。

- 新增原版Java **120组** readResolve/postSave状态对照覆盖全部30个产业ID。执行完整原版MutableStat/StatBonus和抽出的真实BaseIndustry方法，检查postSave确实更换四个对象，不只是清数值。
- 集成测试证明保留的旧supplyBonus确实进入首次resource-condition→industry计算；若错用全新产业默认构造器，首轮供给会少3。
- 既有1296原版resource顺序快照继续通过。
- 严格campaign类型检查通过；4个新JS文件单线程lint零diagnostics。
- 日志：artifacts/campaign-industry-storage-regression.log、campaign-industry-storage-types.log、campaign-industry-storage-lint.log。

## 下一段真实依赖

继续解析当前扰乱memory/已安装物品与管理员、技能/监听器getter，再按原版第二个marketsCopy开始逐市场重应用，随后还需网络、缓存、子市场库存、月结与权威发布。不能把stored bonus等同于管理员重应用完成，也不能凭局部小测试宣称整个世界恢复。

全生涯仍未完成；原版/UI实机与Web交互未验收。本轮无桌面操作、子代理、暂存/提交/推送/打包/发布。
