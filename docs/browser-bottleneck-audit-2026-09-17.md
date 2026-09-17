# Browser bottleneck audit — 2026-09-17

## Outcome

The user's observation is valid: the previous small simulation wins did not establish a perceptible improvement at 100 capitals. This round **does not claim a performance gain**. Both experimental changes were rejected; production simulation code and build targets remain unchanged from the start of this audit.

## Browser workload

- Production Vite build; source modules frozen at the start of the audit. Candidates used that same source snapshot, not a later moving checkout.
- Headless Chromium, WebGL2 / ANGLE D3D11, NVIDIA RTX 5060, 2560 × 1440, DPR 1.
- 100 Onslaught capitals in 50 opposing pairs, seed `0x51180`; camera zoom 0.14124 fits the fleet. Screenshot inspected.
- 180 fixed 1/60-second steps; first 60 warm-up, remaining 120 timed. Player AI and ordinary engine AI enabled. All 100 capitals survived; peak 3,155 projectiles.
- The harness stops the normal requestAnimationFrame loop, advances exactly one simulation step, and invokes the normal visual update/render methods. This isolates CPU work rather than mixing in the scheduler's multi-step catch-up.
- **These are not live gameplay FPS, monitor refresh measurements, or verified 180 Hz presentation.** The scripted timeline covers only three simulated seconds, not sustained battle/destruction behavior. No simulation-frequency, damage, or visual-quality reductions were made.
- Draw submission is CPU time; `gl.finish()` wait is not treated as a reliable GPU timer. Audio synchronization and ordinary player input are not included in the scripted step. Machine/background-load variance remains possible.

## Unprofiled baseline

| CPU work | Mean | P50 | P95 |
|---|---:|---:|---:|
| Simulation, including player AI | 195.64 ms | 184.90 ms | 291.90 ms |
| Visual update | 0.05 ms | 0.00 ms | 0.10 ms |
| Render submission | 30.69 ms | 31.40 ms | 42.20 ms |
| Complete scripted step/render cycle | 226.40 ms | 216.90 ms | 334.70 ms |

Data: `artifacts/browser-bottleneck/browser-baseline-180.json`.

A 60 Hz simulation has an average **16.67 ms per simulation-step** budget, not 5.56 ms. A 180 Hz presentation has **5.56 ms between displayed frames**. They share the main thread in the current single-player implementation: `useCombatLoop` calls the scheduler, which invokes simulation and rendering synchronously. The LAN host worker does not move this single-player simulation off-thread. Both simulation throughput and rendering cost need substantial improvement; moving simulation to a worker alone would not make a 196 ms step run at 60 Hz.

Previous Node SSR ms/tick results must not be compared directly against this browser baseline.

## Rejected experiments

### Native ES2022 class fields

A separate CPU profile found approximately 13.2% of self samples in an emitted class-field compatibility helper, with frequent Vector2 construction/clone callers. That was a candidate, not a measured speedup.

The same source built with `build.target = 'es2022'` preserved native class fields but produced 197.67 ms mean simulation and 36.39 ms mean draw submission (234.14 ms total) in an unprofiled run. Median simulation improved slightly, but mean and tails did not demonstrate a meaningful benefit. **Not adopted; browser compatibility requirement was not changed.** No claim of statistical significance is made from these individual runs.

Data: `browser-after-100.json`; candidate build helper: `build-candidate.mjs`.

### Lazily rebuilt missile spatial broadphase

A grid queried only nearby missile candidates while preserving exact circle intersection and original candidate order. It was invalidated around guidance, special rounds and effects so it would not knowingly use stale missile positions.

The invalidation design was too expensive: 583.13 ms mean simulation / 618.08 ms mean scripted cycle, versus the 195.64 / 226.40 ms baseline. Frequent rebuilds overwhelmed candidate savings. **Rejected and removed from production.** Matching survivor/projectile counts are not a behavioral-equivalence proof; the prepared equivalence helper was not executed after this rejection.

Candidate source remains only under ignored `artifacts/browser-bottleneck/rejected-*`; build/data: `build-grid/`, `browser-grid-100.json`.

### Profiling overhead

`browser-before-100.json` and `browser.cpuprofile` are the separate **120-step profiled run**, not the 180-step unprofiled baseline. Profiler overhead was substantial, so their timing must not be used for speedup comparisons. Keep `browser-baseline-180.json` as the baseline record.

## Next structural work and acceptance criteria

1. Give missile membership and motion explicit mutation boundaries. Maintain a spatial index incrementally on move/spawn/remove; do not rebuild it for every special round. Retain conservative invalidation for arbitrary plugin effects, MIRV additions, flares, explosion deletions and piercing, and preserve same-tick hit/tie order.
2. Reduce all-fleet/all-projectile threat work with conservative reachability queries; do not silently shorten threat horizons or lower physics cadence.
3. Audit rendering separately: 31 ms of CPU submission is already too much for 180 Hz. Measure effects/draw upload/batching costs before deciding on narrowly scoped quality reductions.
4. Validate sustained seeded fights and edge cases, then run alternating/repeated browser comparisons. Retain only changes with a convincing end-to-end benefit and acceptable gameplay/visual impact. Local-function percentages and equal entity counts alone are insufficient.

There is **no verified 100-capital / 180-FPS result**.

## Final workspace verification

- Baseline and both experimental production bundles built successfully from the frozen source snapshot; all three browser workloads completed with zero page errors.
- Restored `WeaponSimulationSystem.ts` to its captured pre-experiment contents, after checking that it had not received a concurrent edit. Removed only the new experimental index from `src`; rejected code is archived in the ignored artifacts directory. Existing earlier optimizations were retained. No build-target change was applied.
- Final lint command passed. Current-checkout typecheck is blocked by `src/engine/extensions/ship-systems/LidarArray.ts:5`: `lidararray` is not included in the accepted system-ID union. This audit did not edit that module or the union; the concurrent source issue is left untouched. Thus this round does **not** report a clean current-checkout typecheck.
