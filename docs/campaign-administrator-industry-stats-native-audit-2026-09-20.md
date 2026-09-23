# 管理员产业数值：下一阶段实现前核对（2026-09-20）

原版0.98a-RC8，仅后台源码/配置核对，不代表实机或UI验收。本文件先记录已核实差异，功能尚未实现。

## 已核实证据

- decompiled/starfarer_obf/com/fs/starfarer/campaign/CharacterStats.java:632-697：skipRefresh立即返回；否则先报告aboutToRefresh，卸载所有已加载CHARACTER_STATS/FLEET回调，刷新aptitude maxTier，再按getStatsEffects顺序apply，随后fleet/玩家殖民地/玩家listener。必须显式区分产业投影与完整刷新，不跳过这些步骤却自称完全恢复。
- CharacterStats.java:925-939：getStatsEffects遍历真实skills顺序及全部effect索引，只有实际CHARACTER_STATS且等级达到阈值才产生skillId_stats_index。UI scope不参与dispatcher。
- CharacterStats.java:416-498：readResolve恢复保存技能、补缺失aptitude、调用refreshCharacterStatsEffects。不能只读技能然后无条件默认skipRefresh=false，保存图恢复时序仍需核实。
- decompiled/starfarer_obf/com/fs/starfarer/util/DynamicStats.java:45-50：getValue(key,base)读mods，不读stats；不存在直接返回base，存在调用StatBonus.computeEffective(base)，本次getter不创建条目。
- decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java:1390-1391：使用market.getAdmin().getStats().getDynamic().getValue，supply_bonus与demand_reduction基底均0；传入ind_*_1 flat。FuelProduction.java:16同样取fuel_supply_bonus基底0，使用产业第2号ID。
- IndustrialPlanning.java:Level1给supply_bonus flat+1；Level2给custom_production_mod mult1.5。industrial_planning.skill实际启用两项CHARACTER_STATS，索引0/1，阈值1。
- **ContainmentProcedures.Level5虽然源码有fuel_supply_bonus +1，但containment_procedures.skill这项效果被注释**；不能给学了控制流程的管理员凭空+1燃料，也不能清除这个未加载回调的旧modifier。需求减免未发现启用技能写入，需保留已捕获外部mods而非强置零。
- decompiled/starfarer_obf/com/fs/starfarer/campaign/command/CustomProductionPanel.java:363：custom_production_mod取的是全局playerStats，applyMods到产能MutableStat；**不是市场管理员的独立倍率**。下一阶段不得把管理员工业规划的产能mult当成该市场有效产能。

## 下一步实现边界

从原版已加载skill目录派生所有相关实际CHARACTER_STATS回调及来源哈希；保留真实人物dynamic.mods捕获与共享身份。先恢复明确四个数值通道，按原版StatBonus计算管理员产业输入，并独立保留玩家产能modifiers；只有正式完整刷新链才可执行其前后监听器/殖民地更新。缺CharacterStats、旧capture和未知动态类型均须显式未恢复，不能以零填充伪装原版结果。

验证应覆盖原版Java实际callback/getter、skipRefresh、完整effect索引、所有通道及遗留未加载modifier、管理员/玩家不同人物、技能阈值/顺序、捕获→真实产业回调链；还要核对原版保存readResolve顺序。暂不修改UI，待用户允许前台验证。

## 本轮落地设计

实际加载的CHARACTER_STATS共23个回调，检查其源类后四个产业通道只有IndustrialPlanning的2个回调会修改；保持其它技能/船队/监听器未执行的显式边界。新增独立的产业通道投影刷新（skipRefresh由调用者显式给出）、只读getValue投影和保存mods捕获。storage仅提供待调用的characterIndustryStatsDraft，不在Market.reapplyIndustries里擅自执行人物刷新；未来完整加载调度器决定刷新时机。customProduction始终保留modifier结构，不能直接当该市场管理员的生产倍率。新旧captured person兼容：缺字段不代表四个通道为零，必须保持pending。

## 上轮代码收尾结果

已实现四通道的独立CharacterStats产业投影、DynamicStats.getValue只读输入及保存桥接，包含显式skipRefresh、不清除禁用ContainmentProcedures旧modifier、工业规划真实2回调、管理员与全局玩家分别捕获，且共享CharacterStats内容冲突拒绝。新增模块OriginalCharacterIndustryStats，不把投影刷新插进原版Market.reapplyIndustries的错误时机。

定向检查与严格类型通过，实际保存只读复捕获65管理员/65玩家输入，源SHA未变；显式skipRefresh=false的孤立投影中35个管理员供给+1、30个为0；仅是投影验证，不是完整世界重应用。来源格式证据111项。私有数据只在Git忽略的artifacts；readyForAuthority=false。CharacterStats完整监听器/aptitude/舰队刷新与全市场经济链仍未完成。
