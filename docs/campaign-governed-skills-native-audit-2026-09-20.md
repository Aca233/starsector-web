# 管辖殖民地技能阶段：实现前对照（2026-09-20）

原版0.98a-RC8。本轮仅后台，无桌面/子代理/提交发布。界面未核实，不修改UI。

## 原版证据与预期

- Market.reapplyIndustries:313先getAdmin().getStats().refreshGovernedOutpostEffects，再按原产业顺序unapply/apply，最后hazard upkeep；不能把技能放到条件之前或条件循环里面。
- CharacterStats.refreshGovernedOutpostEffects:1087构建全部已加载GOVERNED_OUTPOST效果cache，先unapply全部，再按该管理员实际skills顺序和每项效果在skill中的原始index判断level>=required并apply。modifier ID为skillId_GO_index，不是筛选后重新编号。不以isPlayerOwned/技能文案scope筛选。
- SpecStore技能加载:524起，只有skill_data.csv中的id或aptitude effect skill才实际装入；磁盘上有.skill文件不等于已加载。FleetLogistics的3个市场效果存在源码，但fleet_logistics在CSV被注释，本版不可当作active技能或清除其遗留modifier。
- 活跃GOVERNED_OUTPOST实际为8个：Hypercognition(4)、PlanetaryOperations(2)、SpaceOperations(2)。方法只操作市场accessibility flat、stability flat、combat_fleet_size_mult flat和ground_defenses_mod mult，unapply仅清各自通道。
- 即使管理员没有这些技能，全cache unapply也会通过getMod创建空的两种DynamicStats.mods条目；不能把未取得技能等同于什么都不执行。原有外部及其它通道modifier保留。
- IndustrialPlanning的scope文案写管辖殖民地，但实际两个效果均是CHARACTER_STATS，不属于本阶段。它经CharacterStats刷新写supply_bonus/custom_production_mod；BaseIndustry随后调用admin.dynamic.getValue(key,0)读取mods而非stats。这一段留作独立人物恢复，不能在GOVERNED阶段误套。
- Market.getAdmin会创建默认人物，且玩家所有的默认管理员改为playerPerson并刷新；管理员身份/人物readResolve/事件监听还需捕获，不可由UI或产业自行填默认技能。

## 改动范围

来源目录按CSV/aptitude激活清单过滤.skill，并记录效果index/threshold/script及原版常量。独立可替换的governed技能纯规则，接受明确实际技能顺序；未加载id拒绝。

共享条件→产业pass新增显式governedSkills入口：先已有唯一条件phase，随后技能阶段，随后产业。条件phase仍保留条件结束时状态，独立返回governedSkillsPhase；稳定性/财务/增长流通性消费技能结束状态，不能覆盖历史条件结果或重放技能两次。没有管理员捕获的旧调用保持旧的已声明输入语义，不宣称完整管理员恢复。

## 验证计划

原版Java抽取8个技能apply/unapply与CharacterStats刷新/筛选方法，对照全cache清除、实际skills顺序、level阈值、flat/mult通道与空dynamic创建。覆盖条件→技能→产业稳定性/财务及人口增长access桥接，来源可复现、严格类型与短串行测试。管理员真实保存/人物技能刷新和完整world恢复仍须后续贯通，ready gate不提升。
