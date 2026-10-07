# Canonical combat state core — results (2026-10-03)

## Decision
A real ownership/computation/effect/network slice is implemented, **not accepted as a speed improvement**. `VITE_COMBAT_STATE_CORE` is opt-in only; unset/false uses existing normal owners. Do not turn this into a release or describe it as removing the simulation-speed limit. No catch-up caps, fixed dt, controls, UI or wire format were changed.

## Implemented, not just a shadow DTO
- Permanent canonical numerical buffers own admitted pose/history/hull/lifecycle, ten flux fields and sixteen required numeric fields per weapon. Compatibility descriptors alias sole memory; no per-step pose import/commit-copy. Engine-private core is not saved as a second world.
- Numerical motion writes owned rows directly in ordered entity execution. Modules/stations retain their existing parent-relative rules through adapters. Fire observation reads these rows without copying poses; pose writes are excluded until query closure, while native per-weapon aim/intent clocks remain writable.
- Resource changes, recoil, teleports, component hits and collision responses use the same state through existing effect adapters. Those rule algorithms have NOT all been converted into numerical services.
- A live spatial broad phase preserves original i/j order and reindexes both assemblies after each response. It queries the still-unvisited suffix, including pairs introduced by displacement. Unknown damage/engine-FX hooks retain the full pair loop. Motion wire capture reads the core directly with unchanged layout.
- Growth/recycling, descriptor/identity replacement, custom integrator fallback, removal and disposal are covered. Frozen non-configurable native adapters require retiring their old rows rather than illegal descriptor redefinition/recycled reads; this late repair passed targeted checks.

## Existing armed numerical scene
- 2 controlled players +20 AI, three authored preset hulls, seed917: 22 roots, initially176 entities/734 mounts. Same phased world, AI intent phase and query-read settings in both arms; only core ownership/index differ.
- Both decision profiles:36 per-tick complete snapshot/RNG comparisons; async worker-backed authority, synchronous candidate and baseline agree. Existing motion wire also agrees each tick. This is Web-to-Web equivalence, **not original-source equivalence**.
- Four ABBA arms,150 warm +120 measured steps each (270 total). Complete final states and RNG agree across all four. Actual armed statistics include235 player and243 enemy shots by tick270; six removed entities materialized their last state. The core ran32,087 numerical movement steps with176 admissions and no roster fallback, so this is not a dormant flag/standalone table test.
- Final measured mean: **59.813 → 143.082 ms/step**, cost ratio2.392, **139.2% slower**. Existing AI/fire rules still traverse accessor-backed objects; their compatibility cost overwhelms this partial migration. Do not call it a performance success.
- Actual indexed collision workload: 810,810 possible pairs → 49,811 candidates (93.86% fewer), 5 responses. Candidate reduction alone does not prove whole-step speed.
- First implementation was also rejected: 60.123 → 176.235ms/step. Its per-read WeakMap/Map adapter and overly broad AI-derived collision admission were corrected; the second run above still fails speed acceptance. No further repeated broad timing trials were made.

## Browser authority: failed, retained as negative evidence
Real styled headless Edge, actual LAN host Worker/LanBattle/helper/WebGL, 2 players+4 AI with bundled armed presets, seed917, requested10 seconds. Probe confirmed the core was active:28 entities and4,800 numerical motion steps by tick240, with no core fallback. The room **ended during normal measurement** due to repeated authority overload (worker-runtime failure). Reported tick195→291 over10,016ms includes the stopped interval and is not a valid steady simulation speed.

This did not reach the blocked-main ACK or reconnect phase. No such acceptance is claimed. Existing earlier unarmed numeric-motion browser success is not evidence for this core. This one-machine dev/headless run is not multi-machine FPS or an A/B proof of browser-failure causation.

## Verification / evidence limits
- Full typecheck and initial changed-file lint passed. Final app typecheck and targeted changed-file lint also passed after repairs.
- Paired numerical report has17 checks. Final source boundary report has7 checks, including retirement and corrected expanded-shield contacts with actual hard-flux absorption. Initial shield-fixture setup used a wrong field; only the corrected final shield report establishes that particular assertion.
- Final paired timing predates the frozen-adapter retirement repair; final source was boundary/typecheck/lint verified, **not fully re-timed** after that repair. Frozen programs and file hashes are retained separately in implementation-manifest.json.
- Original target0.98a-RC8; C:/starsector-core and C:/decompiled absent. Original source/native interaction/UI equivalence remains pending. No desktop/window/input operations, no original screenshot comparison or UI completion claim.
- No new whole-AI worker parallelism. Native decision/fire/armor/projectile/system loops still need substantive migration before this core can be a speed solution. Current work is an explicitly disabled architectural experiment, not a completed replacement battle engine.

## Artifacts
- Initial rejected program: artifacts/combat-state-core-20261003/numerical/
- Final measured paired program: artifacts/combat-state-core-20261003/final-numerical/
- Final retirement + expanded-shield boundary program: artifacts/combat-state-core-20261003/final-boundaries-shields/
- Failed armed browser run: artifacts/combat-state-core-20261003/browser-armed/
- summary.json and implementation-manifest.json describe exact scope and hashes.

No staging, commit, push, package or release was performed. Career work and other tasks' existing changes were not cleaned up or reset.
