# 管辖殖民地技能进入共享产业重应用（2026-09-20）

实现前证据：campaign-governed-skills-native-audit-2026-09-20.md，原版0.98a-RC8。本轮无桌面操作/子代理/提交/推送/打包/发布。

## 实际完成

- 新增来源目录reference-governed-skills.json和可复现导入器：70份源码/配置哈希，58个实际注册skill（含aptitude skill），8个实际加载的GOVERNED_OUTPOST效果。先按skill_data.csv/aptitude_data.csv过滤，再读取.skill；不是扫描到文件就当成启用。
- 源码中FleetLogistics市场回调在本版未加载，因为CSV行已注释。其旧modifier不会被新刷新擅自清掉，该skill输入明确拒绝。IndustrialPlanning属于CHARACTER_STATS，本阶段不伪造其supply_bonus/custom_production_mod。
- OriginalGovernedSkills实现全部8个活跃回调及原版调度语义：先清全部loaded cache，再按真实管理员技能顺序、技能原始效果index和float level阈值apply。无技能也执行清理，并按DynamicStats.getMod创建两份空modifier容器。
- 太空行动/超越认知流通性、舰队规模、地表防御乘数、稳定性按原版float运算；unapply只清自己的flat或mult通道，保留外部值及同id其它通道。没有凭空增加playerOwned门槛，也不按level倍乘常量。
- 真正接入OriginalIndustryCommodityPass的显式governedSkills入口：唯一条件phase→技能phase→产业。返回独立governedSkillsPhase；conditionPhase仍表示条件结束状态，不能被后续技能覆盖。
- OriginalMarketStability的稳定性/财务计算与OriginalPopulationGrowth的港口流通性都消费技能结束状态。增长与已安装线轴可同时工作，不重复条件/技能或改变人口incoming计费时序。

## 验证

- 8文件短串行回归 **89/89通过，无跳过**：技能、条件、稳定性、共享财务、扩展增长、常规产业、财务、人口。
- 新增 **308组原版Java差分**：抽取真实CharacterStats.refreshGovernedOutpostEffects/getOutpostEffects/applyGovernedOutpostEffectsToMarket及8个apply/unapply；覆盖58种已加载skill、原技能顺序、阈值、未学习技能清理、通道保存、nullable动态容器。
- 新增 **8组原版条件→技能→产业稳定性/财务链式对照**；逐阶段比较状态和实际产业读取的income/upkeep系数。原有30组条件→财务及90个产业财务原版刷新继续通过。
- 增长接线测试覆盖等级0/1/2、原条件结束快照不被改写、技能和线轴共同进入最终access、稳定性继续传给immigration。
- 严格类型检查通过，12个相关文件单线程oxlint零诊断。
- 证据日志：忽略目录artifacts/campaign-governed-skills-regression.log、campaign-governed-skills-types.log、campaign-governed-skills-lint.log。

## 明确未完成

本轮接入需要显式实际管理员技能列表；尚未从真实保存执行Market.getAdmin的默认人物/玩家身份切换、CharacterStats.readResolve/全部人物技能刷新及事件监听器。不会把默认空列表称为完成管理员恢复。IndustrialPlanning及其它人物dynamic getter、fromOther仍需恢复，原有capture/storage readiness不变。

界面/管理员选择操作/原版实机均未验收，本轮未修改UI。完整世界经济重应用、网络、月结、库存、任务势力与合作生涯仍未完成，readyForAuthority=false，生涯更改不得发布。
