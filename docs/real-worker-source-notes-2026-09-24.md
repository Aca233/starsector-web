# Real Worker / multicore latency audit — 2026-09-24

## Boundary and original-source evidence

Original: Starsector 0.98a-RC8, local `../decompiled/starfarer_obf/com/fs/starfarer/combat/systems/WeaponGroup.java:301–314` (`advanceAuto`): weapon AIs advance and decide fire in the original iteration order. `combat/ai/private.java:233–282,392–439` covers target observation/range/arc and independent obstruction checks (consulted in the preceding fire-control audit). This does not license reducing cadence or treating all authority mutations as independent.

Expected: preserve fixed 1/60 steps, complete units/weapons, original authoritative commit order, floating-point precision, RNG, safety checks, cancellation and serial fallback. This block changes only host-local scheduling and fixed-field wire access, not gameplay rules or UI. No original desktop run/UI validation was attempted; desktop operations remain forbidden.

## Measured gap

The prior Node benchmark explicitly disabled multicore. The new headless harness uses the production local Worker, nested owner Workers, real SharedArrayBuffer and transferable ACKs. It compares every valid presentation field, replay witness, audio/results/outcome each tick; every 30 ticks it compares full authority binary data and hidden weapon target/tracker/RNG state outside timed steps. Test-only freshness markers prevent stale batch telemetry on serial probes from being counted twice. Campaign imports are rejected by the build.

On this machine (headless Edge 153, 16 logical CPUs, cross-origin isolated), 100 Onslaughts really produce about 99 committed predictions per tick, yet 4-owner simulation is slower than serial. The legacy lane bypasses the existing complete-step cost guard. The 200-ship diagnostic also loses; preparation and validation consume much of the potential benefit.

## Bounded candidates / acceptance

1. Replace repeated indirect world-field access with static, typed wire functions. Preserve exact field order and getter/setter semantics, optional nested reads, original Float64/tag representation, fresh reads each tick and every commit-time validation. Do not cache mutable observations or remove eligibility checks.
2. Apply the existing measured wall-cost guard to the native local lane as well as mixed local scenes; LAN policy stays unchanged. Warm-up/probe/retirement/retry still execute complete authority steps, not reduced-rate AI. Respect disposal after the completed batch. No worker-count increase or claim of GPU acceleration.

Verification: one concentrated typecheck + scoped lint + existing owner partition/lifecycle scenario extended with wire/budget contracts, then paired real-worker acceptance against the frozen pre-change source graph. Reject a wire candidate if overall ACK/simulation mean or P95 regresses rather than retaining it for smaller isolated counters. Treat headless ACK latency as worker turnaround, NOT render FPS/input-to-photon/whole-PC utilization. CPU and GPU utilization are not inferred from worker count.

## 本轮落地结果

固定 world wire 候选虽降低部分 pack 均值，但往返 P95 上升，已撤回；其归档源图不是生产代码。最终只保留原生本地 lane 使用现有成本保护这一改动。类型检查、改动文件 lint、扩展后的既有 owner 场景 162 项检查及 100/200 舰真实 Worker 配对通过。详细数据、冷启动/尾延迟限制及 GPU 未实现范围见 `real-worker-performance-2026-09-24.md`。没有改变玩法/UI，未补做原版桌面实机验证。
