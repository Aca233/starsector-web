# Incremental missile interception broadphase — 2026-09-17

## Change

The previous lazily rebuilt grid was rejected because guidance/contact boundaries repeatedly rebuilt the whole missile index. This version updates individual entries instead:

- One transient `ProjectileInterceptionIndex` belongs to an ordered `WeaponSimulationSystem.updateProjectiles` call. It is built only on a qualifying query, not eagerly for every simulation step.
- A moving missile updates its occupied cells only when its padded cell bounds change. The preceding projectile's final pose is published at the next iteration, covering all early-continue paths; a rocket pursuing a flare publishes its own movement before querying.
- Native array splices remove the actual returned projectile from the index. Ordinary bullet removals adjust the known array length without rebuilding or renumbering every missile. Surviving relative array order is unchanged.
- Queries return nearby missiles in original array order. `ProjectileCollisionHandler` still runs its existing hostility/flare/piercing checks, exact segment-circle intersection, nearest-hit comparison, obstruction checks, damage, and effects. No collision/damage batch boundaries were moved.
- MIRV splits, successful proximity fuses, impact/explosion callbacks, and interception effects conservatively invalidate the index. The next query reads the live array. Array identity/length changes also trigger rebuilds. This retains a safe path for custom on-hit effects that move or replace projectiles without changing array length.
- Small lists (<64), huge/nonfinite geometry, and duplicate object entries retain linear fallback behavior. Spatial bounds include full missile/projectile radii with outward floating-point padding; ballistic-as-beam queries preserve their zero projectile-radius collision rule.

There is no change to simulation frequency, AI cadence, damage rules, threat horizon, graphics settings, or effect counts. This is not a Worker migration and does not claim 100-capital / 180-FPS completion.

## Scope / mutation contract

Production files:

- `src/engine/simulation/collision/ProjectileInterceptionIndex.ts`
- `src/engine/simulation/systems/WeaponSimulationSystem.ts`

The index is not a persistent global cache. New projectile mutation paths added inside the ordered update must either publish motion/removal or invalidate after arbitrary changes. Every-frame weapon hooks run before this index is constructed; beam and mine updates occur after its lifetime. Dense scenes with many contacts/custom effects can still cause rebuilds; clustered/huge queries can still approach linear cost.

## Verification completed

- 16,000 randomized incremental-query comparisons: moves, changed radii, insertions/removals, array replacement/reversal, explicit invalidation, negative radii, beam-radius rules, large/nonfinite geometry. The final check requires **every brute-force circle contact** to remain in the candidate set, verifies original array order, and compares the nearest hit. It is not merely a nearest-hit test that could be masked by an infinite-radius candidate.
- 56 paired edge scenarios: movement before/after a shot in descending order, same-cell motion, large motion, equal-time ties, three-missile piercing, expiration, rocket-to-flare interception, fizzling flare rejection, ordinary/source proximity explosions, rocket explosions, MIRV children, and a registered custom on-hit effect moving/replacing already processed missiles. Complete simulation/FX state matched, excluding only wall-clock collision telemetry. The effect scenario actually intercepted the moved/replaced population at zero offset; other offsets additionally checked non-hit behavior.
- Frozen-source Node integration: 10 Onslaughts ×360 steps, six Odyssey/Paragon capitals ×360 steps, and 100 Onslaughts ×180 steps. All 15 checkpoints matched complete serialized state (including collision caches/telemetry, excluding `kernelMs` only).
- Verification helpers/results are ignored under `artifacts/incremental-interception/`; no project test runner or committed test suite was recreated.

## Browser measurement protocol

Final measurements use two isolated production-build browser pages, advancing them **serially**, with before/after order alternating every simulation step. Both builds use the same captured source graph; only the two interception files differ. Each scene resets visual clocks, visual RNG, HUD visuals, and renderer-owned visual caches.

- Headless Chromium, WebGL2 / ANGLE D3D11, RTX 5060, 2560×1440, DPR 1.
- Fixed 1/60-second simulation; 360 steps, first 60 warm-up and 300 measured.
- 10/50/100-capital seeded Onslaught formations, seed `0x51180`; camera fits the fleet.
- Player AI + engine simulation, visual update and renderer submission are timed separately. The normal requestAnimationFrame loop is stopped so its multi-step catch-up does not contaminate the phase costs.
- Reported values are **CPU work**, not native gameplay FPS, physical refresh-rate verification, or a GPU timer. `gl.finish()` is not treated as a reliable GPU timing measurement. Audio synchronization/player-input work is outside this scripted workload.
- Final browser engine-state hashes must match between builds; entity counts alone are not accepted as equivalence evidence.

## Final paired browser results

| Capitals | Simulation mean before → after | Reduction | Simulation P95 before → after | Step + render mean before → after |
|---|---:|---:|---:|---:|

| 10 | 7.77 → 7.53 ms | 3.1% | 10.20 → 9.90 ms | 13.96 → 13.63 ms |
| 50 | 73.70 → 63.32 ms | 14.1% | 100.10 → 87.10 ms | 95.19 → 84.74 ms |
| 100 | 292.01 → 248.18 ms | 15.0% | 425.50 → 355.80 ms | 335.12 → 291.17 ms |

All three final browser state hashes matched, all starting capitals survived, and no page errors were reported. Peak projectiles/missiles were 326/139, 1,623/695, and 3,220/1,417 for 10/50/100 capitals. Data and all per-step samples: `artifacts/incremental-interception/browser-paired.json`.

The 10-capital result is effectively flat; its complete-cycle P95 slightly increased (17.6 → 18.0 ms), so this is not advertised as a universal small-scene win. At 100 capitals, complete-cycle mean fell 13.1% and P95 fell 478.5 → 407.0 ms. Rendering submission remained essentially unchanged (43.04 → 42.92 ms).

The initial separate 180-step run suggested about 27% simulation improvement. It was shorter, did not alternate the two versions within each step, and used the first candidate before splice/duplicate-entry hardening. **Use the final 360-step interleaved results above (about 15% at 100 capitals), not the preliminary 27%, as the reported result.** Single-run timing distributions are not a claim of statistical confidence or sustained gameplay FPS.

This is a retained structural improvement without fidelity cuts, but **248 ms per simulation step is still far from a 60 Hz simulation**, and 43 ms of rendering submission is incompatible with 180 Hz presentation. It does not solve the user’s large-fleet responsiveness goal by itself.

## Final edge and current-source integration checks

- An additional 1,005 cell-boundary/tangency, negative native-splice, and duplicate-object fallback checks passed (`boundaries.json`).
- Other tasks changed AI, hullmod/range and game-state modules while this work was running. Performance comparisons remained pinned to the frozen common source graph; those concurrent edits were not overwritten.
- A separate latest-source comparison preserved those edits and replaced only the interception implementation in the baseline: 10 capitals ×180 steps, six Odyssey/Paragon capitals ×180 steps, and 100 capitals ×120 steps. All eight complete-state checkpoints matched. No source changes occurred during that final integration run (`latest-integration.json`).
- Instrumentation in the latest-source 100-capital integration counted 110,828 queries: the original loop would receive 233,231,307 array entries, versus 48,808 candidate entries from the index, with 1,595 rebuilds and 1,331 cell-bound changes across 120 steps. These are **candidate-loop workload counts, not an overall CPU speedup percentage**. Other simulation work still dominates after filtering.
- Current-checkout typecheck, lint and production Vite build passed. A fresh current-build, 10-capital/60-step browser smoke also completed with zero page errors; it is not a second 100-capital performance claim. The 100-capital final paired screenshot was inspected.
- The two optimized source files still match the measured final candidate. `git diff --check` passed (apart from Git's informational LF/CRLF conversion notice).

The goal remains open: no claim of sustained 100-capital gameplay at 180 FPS is made.
