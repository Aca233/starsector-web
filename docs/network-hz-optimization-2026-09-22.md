# Hz optimisation — 2026-09-22

Scope: synchronous native combat and unchanged LAN protocol. No career changes, no release.

Evidence: actual production Node authority, 32 ships ~59.9 physics /56.7 snapshot Hz; 48 ships ~59.5 /43; profiled 64 ships overloaded. These are host measurements, NOT guest APPLY Hz or WAN latency. Profiling perturbs timings. Six-second 48-ship profile attributes ~3.0s to simulation and ~1.8s to snapshot production.

Native reference inspected: local 0.98a-RC8 decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1485–1503 keeps AI.advance then Ship.advance. Preserve order, fixed timestep, every target decision, RNG and exact arithmetic. No gameplay or UI change; native UI verification not applicable/performed.

Candidate: ShipCombatProfile scores the same numerical bearing more than once. Cache only score/alignment for the immutable numeric arcs inside ONE call; still replay EVERY non-adjacent candidate in original order and perform the original tolerance-based best-choice comparison. This is not global candidate deduplication (which changed decisions in earlier experiments), not a cross-frame cache, and not lower-frequency AI. Disable reuse with replaced math primitives. Require full-world/RNG differential and actual host before/after measurements before retaining.

Guest audit: default motionAuto bypasses detailInterval; do not delete credit/backpressure. Node clients do not use LanSnapshotDecoder. Receive and APPLY remain separate metrics.

## 本轮结果（截至此处）

- 重复 bearing 评分缓存未显示净收益，已仅撤回本轮自己的改动，源文件与实施前保存件完全相同。
- 单字段 codec marker 快路在 22 舰同轨迹、300 tick 全字节/RNG 差分通过，但 capture+encode P50 4.6549→4.6020ms，P95 6.8788→8.3972ms；均值也变慢。已撤回，不默认启用。
- 不把不同时间、不同后台负载的 48 舰快照 Hz（约 28–43）差异当成候选收益。首个 64 舰测试有 profiler 且过载终止，不能当可持续容量承诺。
- 当前保留的修复：固定记录共享 accessor、批量校验/绑定、marker 判断移出普通值路径，以及 7 种精简武器布局的 generated restorer（包括冷启动短布局）。11 组专项检查通过。该通道仍默认 OFF；冷布局修复之后没有新的完整路径性能结论。
- 主机、客机、网络四项目标尚未达成。没有部署、打包、提交、推送；没有生涯改动。

## 明确下一步边界

停止继续堆叠已否决的通用捕获/编码小快路。默认 guest detail 限速不是瓶颈，禁止以放宽 credit、降低物理 Hz 或改显示计数应付。

真正剩余的架构问题是同步步骤仍与完整世界 capture/encode 共占 authority 线程。后续方案需明确消除哪部分旧图工作、组件生命周期/变化通知所有权、冷加入/可靠事件/预测还原语义；仅新增一份 display packet 或把序列化前的转换成本移出计时不算解决。现有 renderer-only 通道只证明局部约13%收益，不能承诺完成这些四项指标。


## 同段射线去重复（实施前）

本机 0.98a-RC8 `../decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1485–1503` 再次核对：仍按 AI.advance→Ship.advance，不降低 AI/物理频率。当前 `TacticalPositioning` 是已有 Web 建议层扩展（见 `ai-fire-budget-and-positioning-2026-09-18.md`），此次不声称它等同原版 AI，也不改变其评分规则/UI。

现状：同一候选同一炮口，对最多20个障碍物重复创建完全相同的 end-start 与长度平方。改为使用刚计算过的 direction，一次计算 length2；障碍物顺序、提前退出、原距离公式、严格端点/切线判断、候选顺序及浮点累加次序不变。不跨帧缓存、不触及 RNG。验证：既有 AI 场景 + 双实现全快照/RNG精确差分，之后实际 authority。同一场景不能以只跑得快冒充行为正确。
