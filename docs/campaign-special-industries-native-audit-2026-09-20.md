# 特殊产业原版核对（实现前）

本机0.98a-RC8。继续后台文件/无窗口Java验证；不启动原版或Web界面。

## 证据 → 行为 → 当前差异

源码根 decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/：

- LionsGuardHQ.java apply/isFunctional/getStabilityAffectingDeficit：仅辛达里安独裁政体功能有效，补给/燃料/舰船需求=size-1，武器=size；船员/陆战队=size，陆战队受武器短缺影响。稳定性基值2，受四项需求的最大短缺限制；供需始终合法。巡逻/军事memory及生成舰队是额外生命周期，不能冒充commodity pass已执行。
- Cryosanctum.java apply：固定规模6用于apply财务、器官生产6、补给/有机物需求3；任一短缺时把deficit.two改成-1，从而产出+1。此反直觉行为已以starfarer.api.jar javap交叉核实（apply字节码71–76 iconst_m1）；不“修正”为减产。直接income-refresh仍使用市场规模。
- TechMining.java apply/unapply/modifyIncoming：没有供需写入；财务规模=min(市场规模,遗迹等级4/3/2/1/0)，不运作只清supply；unapply仅移除移民回调，不调用Base。alpha对tech_mining_mult乘1.25；beta/gamma不清旧alpha效果，null清除；改进另乘1.25。生成遗迹战利品和耗竭另有原版随机流程，不能把空供需当成没有挖掘收益。
- TradeCenter.java apply/unapply/核心/改进回调：无供需写入；稳定性-3、收入percent+25，alpha和改进各+25，全息套件+50。unapply清除自己的这些市场效果；失效时调用unapply但不清供需。Base.apply(true)收入/维护刷新发生在上述加成重加之前，因此必须保留产业顺序与当时乘数，不能用最终乘数重算所有产业。
- TradeCenter/TechMining.modifyIncoming：三英+10。贸易失效时移除回调，技术挖掘失效时仍保留。
- BaseIndustry.java updateSupplyAndDemandModifiers：Cryo/Lions默认alpha供应+1；Trade/Tech覆盖alpha不增加供应。四类均不使用“改进增加产量”。
- ItemEffectsRepo.java dealmaker_holosuite以及special_items.csv：仅commerce，修改市场收入percent，不修改供需/产业自身维护。
- TradeCenter创建开放市场、缓存同一Submarket实例并恢复、设置独立势力和forceStockpileUpdate，是有副作用的runtime流程；本轮静态经济层不把它默认为已运行。
- HeavyIndustry.java updatePollutionStatus、Pollution.java：污染涉及有状态的生成/移除及移民回调；在上述特殊产业接入之后继续落实，不能因没有污染商品需求而跳过。

当前还剩4类/7个实际存档产业没有商品插件。此次补其明确输入的供需/当地财务/稳定性/移民与技术挖掘乘数，缺真实势力、条件、动态stat或可用量时拒绝；不变更default权威ruleset或宣布完整星区运行。

## 验证计划与UI边界

原版方法块+完整MutableStat无窗口Java对照；Cryo异常另用真实jar字节码核实。测试停止/恢复、所有core转换、改进、物品、原料短缺、规模及保存态插件ID与类匹配，并扩充现有财务/稳定性/移民探针。

本轮不做UI改动。产业界面默认/悬停/确认及同分辨率截图对照仍待许可，不以源码或素材路径冒充实机UI证据。生涯不提交、不打包、不发布。

## 污染编码前补核

HeavyIndustry.advance只有special!=null才累计天数并updatePollutionStatus；不要求功能有效。setSpecialItem先Base解除旧物品效果/替换引用，然后检查污染。hasCondition(habitable)为false立即返回，包括卸下锻炉时。自建污染严格在累计天数>90（不是>=90）永久化；移除/重装不清累计天数。已有污染会令permaPollution=true但不接管addedPollution。Pollution继承BaseHazardCondition，配置hazard=0.25，注册transient移民回调，增加luddic_path 10。单独apply与unapply保持modifier与回调的身份/顺序；删掉条件对象之前需先执行unapply，不能只从条件列表抹掉它。计划提供显式有状态callback及条件效果，仍不宣称权威世界已接收时间推进。

## 真实保存态识别补核（别名修复前）

真实commerce实例的保存classAlias为TradeCenter2。CoreLifecyclePluginImpl.java:2000–2006显式注册：TradeCenter是旧的com.fs.starfarer.api.impl.campaign.econ.TradeCenter市场条件，TradeCenter2才是导入的econ.impl.TradeCenter产业。旧条件源码仅有稳定性效果，与新产业不等价。需导入原版别名注册并保存source hash，不能简单把所有TradeCenter字样都放行；类名、保存别名和产业ID是三件事。LionsGuardHQ/Cryosanctum/TechMining各别名与类名相同。
