# 特殊产业与污染生命周期进度（2026-09-20）

目标仍是完成生涯模式；本轮实际修改和验证如下，不是完成声明。仍未操作桌面/窗口/键鼠、不用子代理、不暂存提交、不打包发布。

## 已实现的本地规则

1. OriginalSpecialIndustries：贸易中心、技术挖掘、狮心卫队总部、低温避难所的商品/技术挖掘动态乘数。保留原版供需map与modifier顺序、核心/改进差异、独裁政体功能限制。Cryosanctum短缺导致器官+1，已对照真实jar字节码，不把反直觉行为擅自改成减产。
2. 接入有序commodity pass、产业数量、当地稳定性/财务、移民/环境层。贸易中心收入刷新取自自身unapply之后、核心/改进/物品重加之前；后续产业再读到新的乘数。技术挖掘按遗迹等级限制财务规模；低温避难所apply固定6，但直接income-refresh仍用市场规模。数据缺失/矛盾输入不猜默认。
3. 贸易中心的alpha、改进、全息套件收入加成与失效清除；技术挖掘alpha收益乘数跨beta/gamma保留，因为其unapply未调用Base。贸易/技术挖掘增加三英移民成分，失效后的回调注册行为不同。
4. OriginalHeavyIndustryPollution：有状态advance、set-item后处理、update-status回调。立即添加污染、严格超过90日永久化、区分自建/原有污染、非宜居早退、卸载/重装累计天数不重置；无物品的advance不检查移除。返回待执行的条件增删效果，不虚构condition ID或冒充world执行。
5. Pollution条件：原版hazard+0.25、瞬态移民回调/Path成分+10。独立apply/unapply保留真实modId和集合顺序，删除条件时可以先解除其效果；接入通用环境/移民核。
6. 原版保存别名：CoreLifecyclePluginImpl注册TradeCenter2为现代产业，TradeCenter是旧市场条件。导入器记录实际别名与源码哈希，保存解析严格区分，不能按相似名字放行。

## 证据与测试

- 先写 campaign-special-industries-native-audit-2026-09-20.md，再实现。
- 1056组特殊产业Java方法块快照：比较完整供需modifier、有效值、合法性、势力/运作状态和技术挖掘乘数历史。
- 1008组HeavyIndustry实际原版方法矩阵：阈值、float天数、两种锻炉/空物品、宜居与污染存在性、永久/自建标记和三类回调。
- 扩大既有原版探针：360次财务更新+122个经济组；216次稳定性顺序；198次移民与120次环境/条件回调。探针中的非本领域引擎行为为显式stub，不是完整游戏运行。
- 完整campaign：674项，669通过、0失败、5项既有可选探针跳过。artifacts/campaign-special-regression.log。
- 严格campaign TypeScript与全tsc-b均exit 0，artifacts/campaign-special-types.log。
- 定向oxlint覆盖33个本轮相关实现/声明/测试文件，0 diagnostics，exit 0。artifacts/campaign-special-lint.log。未宣称全仓库lint通过。
- 专项与原版对照包含core切换、建设/升级/失效、无原料、固定规模、物品/交易收入顺序、存档错误/旧类别名、不可变结果和缺失输入。

## 保存态复核

只读复核本地未修改存档：65市场、346产业。保存态中商品产业插件缺口已从4类/7实例降为0，匹配原版别名；这是“有相应商品规则”，不是“完成产业恢复/已加载运行”。剩余12种环境条件尚未分类。全部346个产业仍需post-save重建。

原始campaign.xml与descriptor.xml独立哈希复核均未变化。capture/report/诊断保留在被git忽略的artifacts，不纳入测试数据或发布。readyForAuthority保持false。

## 明确仍未完成

- 贸易中心的开放市场对象身份/保存恢复、独立势力设置和forceStockpileUpdate；狮心卫队memory、巡逻生成/回收；技术挖掘实际遗迹战利品随机流程/耗竭；突袭与特殊界面。
- 污染回调尚未接入权威世界时钟/物品安装事务；返回条件事件不等于世界已完成添加/删除及完整重算。
- 全星区有序post-save恢复、真实管理员/技能/监听器、逐getter网络惰性副作用、完整经济组、月结与可交易库存发布。
- 品质/挖掘动态乘数尚未消费到完整舰船生产或遗迹库存。
- 原版UI/交互、势力与自创势力、殖民地完整流程、任务/战斗及可各自游玩/加入合作的联机端到端验收。

默认reference.cooperative 0.15.0不变，Corvus仍没有被假标为执行了industrySimulation。下一步优先完成剩余12种条件与真实管理员/存档状态输入，并实现有序恢复runtime；不可因诊断缺失插件数组为空而发布市场快照。原版/Web同状态UI验收待用户许可，不占用其电脑。
