# AI／火控查询重复工作的最小对照（编码前）

用户 2026-10-03 同意改造查询/计算模型。再次检查 `../starsector-core`、`../decompiled`，均不存在；历史原版版本为 0.98a-RC8。没有新增原版截图或实机许可，本块不改 UI、不改决策频率、不改命中/资源规则，原版源码/实机/UI 等价仍待核实。这是 Web 内部只读查询工作复用，不冒称原版新增规则。

| 当前来源 | 预期行为 | 当前重复成本 | 验证 |
| --- | --- | --- | --- |
| CapitalShipAI.plan / CombatAIPhase.plan | 一个同步计划期间没有世界控制/技能提交，仍每次实际计划读取最新状态 | 同一舰 getMotionStats 在导航、位置候选预演、避碰、推进控制重复组合系统属性 | 单次计划内纯数值属性复用；计划结束即关闭，新计划／效果必须重读 |
| TacticalPositioning.forecastCombatPosition / chooseCombatVelocity.score | 保留 6 次加速度限制预演及原有候选评分与胜出顺序 | 每个候选都重新读取完全相同的运动属性 | 候选结果逐值对照，实际 getMotionStats／组合函数调用计数 |
| ShipCombatProfile.combatProfile / predictWeaponIntercept | 保留射程、速度、充能延迟、炮口和最佳炮弧判断 | 同一计划每门武器多次组合射程/速度属性，位置层又读取 | 只复用合格原生数值属性，不缓存目标/炮口/交点/评分 |
| FireControlQueryBatch 与 FireControlQueryRoster | 同一火控名册只读，特种飞行器名册不得扩权 | 每射手新建相同名册成员 Set；火控每源表仍需在武器状态阶段后新读 | 名册级复用 membership；关闭后拒绝借用、限制名册验收 |

实现采用**单个 AI 计划**的短租约，而不是跨帧缓存：未知技能属性组合、替换标量 getter／getMotionStats／表读取方法保持原读取路径。不让查询值流入技能、伤害或下一个计划。`VITE_COMBAT_QUERY_READS=false` 保留对照，数值运动保持缺省关闭。不取消主机追赶保护，不降低 60Hz，不新增 Worker，也不承诺整 AI 并行已完成。

沿用 check-combat-threat-phase.mjs 三舰型 LAN 混编场景，固定其它开关比较读取复用路径，完整快照/RNG 对照与一次 ABBA 成本记录；集中类型检查、改动文件 lint 和该场景，只有具体失败才定向复查。

## 验收中发现的具体边界失败与定向修复

首次完整场景通过后，代码复查发现共享 membership 被当成可传入的裸 Set；用冻结的首次测试 bundle 定向复现：源名册 `[ship]` 却选出 1 个敌方目标（`membership-regression-before.json`）。改为模块私有 WeakMap 登记的真实 roster 租借，要求名册 identity 与 active 同时匹配；裸 Set／其它名册不能扩权。只 lint 对应文件并重跑现有场景中的四项读取边界，不重跑完整性能/场景。成本记录明确属于修复前正常调用路径，不冒称最终版本重新计时。
