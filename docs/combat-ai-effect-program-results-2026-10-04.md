# AI plan/effect program result — 2026-10-04

**Retained structural rewrite; not a performance improvement, not -50% completion.**

One production file: src/engine/ai/CapitalShipAI.ts. The actual legacy update and staged plan/controls/effects both now run explicit authority-bound effect records through the same ordered executor. No callbacks/defense/vent writes move into planning, no copied World DTO or new transfer capability, no cadence/dt/entity/timer changes, no default worker enablement.

## Correctness
270 heavy seed917 ticks: complete raw snapshots + dual RNG + all 20,790 AI/defense rows + 195,934 tracker/per-mount RNG rows identical. Phase work, candidates, numerical fleet pressure and producer counters also identical. Six eight-step boundaries agree: legacy update, authored effects, live mutation before effects, stopped before plan, retired after controls, fresh-projectile vent recheck (16 actual rechecks). Ten checks cover stale/foreign/repeated/wrong-order intent rejection. App tsc exit0 and oxlint1.82.0 exit0/no diagnostics.

## Exclusive whole-step ABBA
150 warm +120 timed, fresh processes: 35.5233 /35.8691 /35.3862 /35.5924ms, identical final raw/dual-RNG hashes. Baseline **35.5578ms**, new **35.6277ms** (**+0.20%, effectively neutral in this run**), half target17.7789ms. This is not an accepted speedup. Architecture retained because it makes the actual planning/write boundary explicit without a material measured regression; do not report it as ms reduction.

## Remaining blocker
The effect record is authority-bound and contains actual scene/target/profile/assignment references. It is deliberately NOT yet worker-transferable or an immutable whole-world snapshot. Next work must publish a compact numeric pure-planning input to resident owners and return command/AI-memory/threat recipe data, bind real authority identities once, then run this executor in original order. Existing legacy Owner.update+speculative world mutation cannot be enabled over the native phase without this integration. Per-step whole-world DTO cloning/reification already failed by +192.23%; do not reuse that architecture or treat speculative worker kernel timings as whole-step gains.

Original0.98a-RC8 source and runtime/UI not verified (core/decompiled absent). Only current-Web logic and Node execution verified; no claim of original equivalence or actual browser performance, no desktop operation, no career changes or releases. Full hashes/evidence: artifacts/combat-ai-effect-program-20261004/structural-summary.json.

## Critical path budget correction
Using THIS block's baseline phase means (35.5578ms whole step), AI+fire-query is21.1129ms (~59.37%), leaving14.4449ms outside that scope. Perfect same-work4way distribution with ZERO capture/IPC/wait/merge costs still gives19.7231ms, worse than17.7789ms half target.6way gives17.9637ms before overhead. This is an optimistic Amdahl bound for simple migration, not a claim that better algorithms cannot halve time.

AI+fire+flight+projectile expands the optimistic scope to~73.92% and4way theoretical floor~15.85ms, but flight deployment/docking and projectile ordered damage writes are NOT all pure and cannot be moved unchanged. Native planner/authority commit must be separated for a larger real work fraction; physical6cores/12logical threads are not twelve equal independent compute cores. No additional broad tests were run for this arithmetic. See execution-budget.json for exact scope/floors.
