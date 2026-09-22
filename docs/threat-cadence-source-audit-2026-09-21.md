# 分层威胁评估：编码前最小审计（2026-09-21）

> 最终状态：候选已实现并测试，但整体性能验收失败，已撤回本轮默认路径改动。此前的多船优化保留。以下实现记录描述的是归档候选，不是当前默认功能。

## 原版证据 → 预期行为
本机 0.98a-RC8（日志核实）；源码位于 ../decompiled/starfarer_obf/com/fs/starfarer/。
- combat/ai/D.java:76–77、102–110：ThreatEvaluationAndResponse 内部 IntervalTracker(.25,.5)，randomize，昂贵重算受 intervalElapsed 控制。受盾击记录 flag，不能据此把全部防御逻辑降至 2Hz。
- combat/ai/BasicShipAI.java:116、129–131、350–366：避碰独立 .0501–.0835s；正在避碰继续更新；forceCircumstanceEvaluation 强制重算。
- combat/ai/attack/AutofireManagerV2.java:47、53–55：组级管理 .4–.7s；combat/ai/private.java:75–120 是另外的找目标时序。

## 当前差异与本次边界
Web CapitalShipAI 每步把所有敌舰武器预测到整个排散恢复 horizon；不是原版 D 算法的完整移植。采用原版分层节拍的 Web 适配，而非声称原版等价。
- 仅审计通过的 native AI phase 启用；单独调用/未知扩展/非审计阶段继续全量。
- 每步保留实际弹丸/光束的原完整 horizon 与近端武器预测（defenseWindow），不改运动、碰撞、炮塔、实体数量和画面。
- 远期武器预测 .25–.5s 错峰重算；缓存仅包含 count/earliest 等标量，不缓存敌舰/武器对象。
- 控制权重置、目标/命令/阵营/舰队数量/防御窗口变化及显著 horizon 扩展触发重算；完整预测首步即执行。
- 排散开始边界再做 live 全量验证；缓存中的“无危险”不具备开始排散的最终授权。
- 状态放入既有 defense codec part 的 own primitive fields；独立确定性随机流不消耗战斗 RNG。Worker 计算后回滚，authority commit 后才推进。
- 现有 threat.threats 在分层模式表示当前实际与近端威胁，远期摘要显式单列；只在原生消费者中使用，未知系统回退完整数组。

## 验证方法
同一 live world 下即时伤害/盾幅能/实际伤害/朝向对照完整参考；弹丸寿命/新光束/突然近端武器、排散安全、节拍和失效、未知扩展回退；新串行与实际 Worker 状态一致及 discard/retry；冻结同一源图和初始场景的前后性能、真实 rAF FPS/TPS（不把固定步耗时当 FPS）；typecheck/scoped lint 与普通入口无头 smoke。
本次无 UI 改动，原版实机/桌面测试遵循用户不占用输入的要求，未做；没有完美架构或百舰流畅的先验保证。

## 候选实现记录与边界（已回退）
- `CapitalShipAI.update → ShipDefenseController.assess` 曾接入默认 native AI phase 完成真实路径测试；验收后已撤回。
- `ThreatAssessment` 把实际轨迹 horizon 和潜在武器 horizon 分开；原四参数 API 保留完整预测。
- `ShipDefenseController` 将计时、随机种子、预测摘要存入既有 defense 标量 part；没有 Worker 私有跨帧对象缓存。
- `WeaponThreatEnvelope` 的分层权限必须由完整 roster 明确审计得到，不能因“有 envelope”就启用。原生 reader/prototype、不可变规格、未知系统、动态 modifier/status 的兼容检查失败则回退。
- `Frame.strategicThreatCadence` 明确从主端传入，纳入 publish/matches 校验；readonly projection 不自行猜测权限。自定义 reader 即使返回相同数值，权限变化也会使旧提案失效。
- 首次完整预测立即执行，后续间隔使用独立确定性随机流 .25–.5s（量化到模拟步）。即时伤害、实际轨迹、护盾朝向不读取旧摘要。
- 缓存中的危险会保守地继续阻止排散至下次重算；缓存中的安全必须经排散开始前的完整 live 检查。舰船系统在同一步增加幅能时，重新计算排散时长，不能继续沿用之前较短的 horizon。
- `earliestThreat` 诊断包含采样预测的老化 ETA，不再承诺每步远期精确值。普通未知扩展仍取得完整数组。
- 本次只分层远期武器预测。移动/碰撞/炮塔不降频；原版高层目标/避碰/AutofireManager 算法未整体移植，原版实机仍未验证。

性能与验收记录见 `threat-cadence-performance-2026-09-21.md`。所有浏览器/构建均用于本地忽略目录里的测试，没有发布、暂存或提交。
