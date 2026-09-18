# LAN snapshot and same-pass glow optimization — 2026-09-18

## Adopted changes

- src/network/CombatSnapshot.ts: restrict presentation-field omission to exact known object types at their native paths. Do not resend damage-state's duplicate armor/cell index, private component health trackers, or seven authority-only projectile fields. Hull/armor state, active scorch marks, disabled timers, targets, and projectile visual fields remain present. Full snapshots still carry their own layout dictionary; decoding/apply and reconnection format are unchanged. This is a presentation projection, never a simulation checkpoint or host-migration state.
- src/engine/render/webgl/passes/WebGLShipPass.ts: reuse the hot/cold damage-glow decision within one synchronous render pass. Keep clipped fragment ownership separate. No cross-frame cache and no change to texture retention or glow color revision.
- Physics, RNG, AI frequency, aiming decisions, timestep, ship count, and overload safeguards are untouched. AutofireController.ts is byte-identical to this turn's frozen baseline, despite older existing edits relative to Git.

## Rejected first candidate

The first snapshot candidate scanned all getters and array-index accessors before traversing the fields. It reduced bytes but regressed host capture+encode (100-ship sample: ~12.91 → 13.83 ms). It was revised, not counted as a success. Both read passes and recursive packing still execute before omission, preserving ordinary getter reads, cycles, exceptions, and referenced-ship discovery. Thus **capture CPU alone is not reduced**; the gains are less encoding, transport, decoding and apply work. Exact prototype inspection remains; arbitrary Proxy reflection traps are not a supported equivalence guarantee.

## Paired browser-stage A/B

Headless Edge, frozen source graph, identical seed and neutral controls, tick 240; 8 alternating batches of 12 iterations, first batch discarded. Compare medians within each scene, not timings between separate runs/scenes. This is an isolated stage microbenchmark, not live LAN throughput or overall FPS.

|Scene|Old frame bytes|New frame bytes|Fewer bytes|Host capture+encode change*|Guest decode+apply change*|
|---|---:|---:|---:|---:|---:|
|8|112136|84149|25.0%|−2.3%|−16.2%|
|32|406416|304669|25.0%|−8.3%|−18.9%|
|100|1114039|805094|27.7%|−6.3%|−16.8%|
|carriers8|687256|614271|10.6%|−2.1%|−8.9%|

*Sum of per-stage medians, descriptive only; small host changes may be timing noise. 100-ship capture itself increased (~10.33 → 11.15 ms) while encoding decreased (~15.01 → 12.58 ms). No claim that simulation speed rises by the byte-saving percentage.

## Validation

- Final snapshot implementation: 134 paired checks across 8/32/100 ships, capitals, carriers and dynamic craft, modular craft, and three teams. Authority projection, RNG/target state, binary round trip, server frame validation, viewer projection, and old full-frame compatibility passed.
- 36 additional checks explicitly validate finite, evolving damage heat/intensity and disabled components on authority/viewers. They correct a diagnostic-helper limitation: the original injected-damage helper omitted hullFraction when advancing decals. The helper is corrected for future runs; the independent finite-damage checks do not use that helper.
- Renderer: 14 in-memory trace comparisons for draw/retain/texture requests, including warm/cold hulls, fighters and clipped wrecks; duplicate hot-glow scan goes from 2 to 1 for ordinary visible damaged owners. No pixel-identical screenshot claim.
- Existing AI checks: all 84 passed.
- Final TypeScript and full lint: passed. Standard Vite production build: passed (existing large-chunk advisory remains); output artifacts/lan-fast-preview.
- Production Worker + real WebGL: 8-ship smoke completed, ~479 simulation ticks in 8.00 seconds, no worker/render exceptions. A 100-ship smoke hit the existing host-overload safeguard after 4.32 seconds; **not a 100-ship performance pass**. This smoke overlapped normal build activity, so its timing is not usable as a paired performance comparison. No renderer or snapshot parse errors preceded the overload.
- Worker source provenance checked in the diagnostic build. Temporary diagnostic browser/server closed after execution; no additional persistent game server was started.

## Limits and running instance

100-ship physics/AI overload remains a distinct bottleneck. Snapshot changes do not eliminate repeated physical simulation work, nor establish stable 60Hz under that load.

The existing port-3005 server was not stopped, restarted, or deployed over. Main production output is isolated at artifacts/lan-fast-preview, and Worker/WebGL diagnostics at artifacts/lan-fast-production-candidate. Refreshing the old server does not install this build. No original BattleOnline mod files were changed.

Raw diagnostic evidence is under artifacts/lan-fast-optimization-local (ignored, not a new project test runner).
