# 无竞争舰船排序分数：来源与候选边界（2026-09-26）

上一轮差量解码只读overlay已因显示阶段六段全部变慢撤回，不重试。本轮回到火控排序，尝试直接消除无决策作用的计算，不加Map/对象池、不缓存几何或目标。

原版0.98a-RC8证据：重新阅读decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:233–280。阵营/可见性/可攻击性、角色、射程、预测、射界和指定目标流程仍须保留。反编译有混淆/类型异常，不能照抄；Web FireTargetUtility是已明确的Web排序策略，不冒充原版逐式等价。本轮不改玩法/UI，没有新增原版实机/画面结论。

当前AutofireController.aim已经在候选合法性/几何通过后按priority→threat→utility→retained→traverse→ID排序。AI舰船priority恒为1；导弹priority只能0/3，诱饵为2。若整个合法candidates仅含一个SHIP，它在priority=1这层中无竞争：其utility、traverse、retained不可能决定任何两个不同候选的顺序。已有competingHulls计数和omitBudget机制已避免该情形的native预算扣分，但仍计算转向角、到达时间、护盾覆盖和完整utility。

候选只改AutofireController：沿用已有计数，在ADAPTIVE_FIRE_BUDGET开启、autonomous、SHIP计数<2、当前名单的FireTargetQualification仍active，且不存在预算对象或原omitBudget已允许不调用预算时，将唯一SHIP的私有排序tuple写为priority1/threatInfinity/其余0，solution引用保持原对象。非SHIP始终原rank，多舰船/手控/普通或复制名单/资格已关闭/外部预算都原rank。排序比较器、候选顺序、全部扫描/原生guard、canTarget/拦截/射界/友伤/障碍、实际decide、tracker/RNG/扫描频率均不改变。不会用此tuple作为开火授权或对外显示分数。

资格只在闭合数据命令Worker原生只读瞄准域可用；普通引擎和可观察getter/回调路径不获得证明。rank中原shipPolicyAction读取保留；已允许省略的预算不产生副作用。coveredByShield→Ship.isShieldPointBlocked→Shield.isHitBlocked的原生实现只做当前几何读取，不触发伤害/权限回调。无跨阶段数据、不改数据/精度/校验、不做全局intrinsic monkeypatch沙箱保证。

验证使用现有check-combat-ai和同realm冻结旧Autofire：覆盖0/1/多个舰船候选，混合导弹/诱饵、PD/PD_ALSO/STRIKE和手控，正常/遮挡/无目标、死亡/相位/隐藏/换队、每阶段变化、资格撤销/复制名单、普通getter/自定义预算回退、完整aim/preAim/decide/tracker/RNG。测试须证明实际少做排名几何，而不仅是结果恰好相同。一次typecheck、改动文件oxlint、相关既有AI场景；失败只定向修复。正式真实Host200舰150+180tick单次无插桩A/B；无可靠净收益即精确撤回。保留并发工作，不用子代理/桌面，不暂存提交发布。

## 验收与运行记录补充

集中typecheck10696ms、改动lint101ms通过。既有AI场景1–51（含104挂点/阶段完整对照与预瞄索引合同）通过；第52项首次失败不是火控结果不一致，而是该既有测试默认冻结的是更早、尚未省资格查询的版本，要求beforeQueries>afterQueries。本轮冻结前后均已有该优化，应保持查询次数相同。为新UNCONTESTED_RANK_BASELINE显式增加expectFewerEligibilityLookups=false选项（旧默认不变），要求严格相等，不删除资格/结果验证。只定向复跑52–53和改动测试lint：52项182checks、130组完整对照、前后查询均67；新增53项27场景、170checks、79次完整aim/preAim/decide/tracker/RNG对照，10场景确实少读排名护盾几何，共省60次测试用计数调用。普通/复制/关闭/长度失效/自定义预算和手控仍保持原读取次数与回调顺序。

55tick冻结新旧Worker诊断逐包/显示/状态通过，但既有fire-query-audit配对模式只导出serial（before）臂及其恢复计数，不能据此声称候选启动计数已验证。随后仅补一次3tick候选直接启动/恢复探针：两者均134次排名、110次不竞争舰船排名省略；witness/authority+hidden/display一致。这些有计数插桩的短运行都不作为速度证据。

正式性能前的无漂移断言发现另一任务刚更新SimulationCatalog.ts；该Node断言失败后PowerShell仍执行了后续性能命令。没有重启、丢弃或挑选该运行：--baseline与--candidate已经显式锁定全部317模块，两臂使用相同旧目录/舰装源，唯一差异仍AutofireController。随后又观察到DesignModel.ts并发更新；已只读保存对照，不覆盖它们。本次性能结论限定冻结源图，不冒充包含这些新增目录功能的整个最新工作区回归。工具及本轮目标源码无漂移，最终再核对measured图与candidate完全相同。
