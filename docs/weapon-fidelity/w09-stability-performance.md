# W09 Stability and Performance Closure

This note records engineering evidence only. It does **not** convert any weapon row in `acceptance-matrix.md` to visual acceptance; paired original/Web capture remains a separate requirement.

## Fixed-step and lifecycle invariants

Automated regression coverage now verifies:

- the same real Reaper scene produces the same projectile state, remaining range, muzzle-particle count, contrail strip/point count and contrail point ages after 90 fixed ticks when driven by 30, 60, or 144 Hz render cadence;
- pausing a `CombatSession` freezes combat FX, contrail aging, visual clock time and renderer-owned `updateVisual` state;
- restart and player-ship switch clear projectile, beam, muzzle/impact FX (including independent hit-glow state) and contrail ownership;
- a detached contrail accepts no new points and expires independently without keeping a projectile/collision owner alive;
- 60 repeated `WPN-MSL-01 @ 1.5s -> replay` cycles reproduce the same active object counts and return projectile/beam/contrail/muzzle/hit-glow/explosion/EMP ownership to zero after every replay.

## Headless CPU diagnostic — 2026-09-14

Environment: Node `v24.13.0`, Runner-local headless execution. These numbers are diagnostic observations, **not** browser performance thresholds and **not** GPU measurements.

For 60 deterministic `WPN-MSL-01 @ 1.5s -> replay` cycles:

- stable active state: 1 projectile, 0 beams, 1 contrail strip / 31 contrail points, 18 muzzle particles, 0 generic particles;
- total measured CPU wall time: `59.15 ms`;
- mean per cycle: `0.986 ms`;
- p50: `0.676 ms`;
- p95: `2.160 ms`;
- max: `9.715 ms`.

A separate autopilot-vs-autopilot headless combat advanced `61.68s` of simulated time before battle termination. Observed maxima were 21 projectiles, 4 beams, 449 generic particles, 2 contrail strips / 125 contrail points, 12 explosions and 153 muzzle particles. Ten-second samples showed transient queues rising and falling rather than contrail/explosion ownership growing monotonically.

## Runtime telemetry contract

`PerformanceMetrics` retains CPU-side timing fields (`simulationMs`, `visualUpdateMs`, `renderPreparationMs`, `drawSubmitMs`) and now reports `maxTrailStrips` / `maxTrailPoints` separately from generic particle counts. Renderer resource telemetry continues to expose draw calls, resident/pending textures, uploads, invalidations and resource recreations. GPU time is populated only from a real `EXT_disjoint_timer_query_webgl2` result; absent GPU query samples remain `null` and are never inferred from CPU draw-submit time.

## Remaining performance evidence

This W09 closure does not claim a browser GPU budget. A browser capture with real WebGL2 query results is still required before stating GPU-time acceptance, and paired original/Web weapon footage is still required before stating visual acceptance.
