# M4 Final Validation

M4 closes V09 (environment / transparency / occlusion) and P01 (runtime performance / resource stability) without adding or modifying test files. Existing tests were only executed as regression coverage.

> Historical validation note: M4 was recorded while a Canvas2D combat fallback still existed. Production combat was later changed to WebGL2-only; Canvas2D is now retained only for HUD/offscreen texture work. The measurements below remain historical evidence for the WebGL2 path, not a statement of current dual-renderer support.

## V09 environment and combat presentation

- At the time of this validation, background, far/mid nebulae, asteroids, foreground translucent nebulae, world effects, and tactical overlays were separate render layers in both the WebGL2 path and the then-existing Canvas2D fallback.
- Foreground nebulae are composited after world-space ships/effects so they can occlude the battlefield softly, while target brackets / lead indicators / tactical information remain above the haze.
- Starfield generation and asteroid initialization are deterministic; WebGL environment objects are viewport-culled.
- Production headless visual capture (`artifacts/m4/final-battle-1920x1080-v2.png`) was reviewed at 1920x1080. It shows the background/nebula field, asteroids, two capital ships, shields, projectiles/beams and HUD simultaneously, with tactical markers remaining readable.

This validation does **not** claim pixel-perfect parity with the native game. A standardized set of original-game reference captures was not provided, so there is no defensible paired pixel-diff result.

## P01 measurement environment

The browser run used an isolated headless Microsoft Edge 153 process against the production Vite preview. The measured browser reported:

- Windows 10/11 x64 user agent
- 16 logical hardware threads
- 32 GiB reported device memory
- WebGL 2.0
- ANGLE / Direct3D 11 on NVIDIA GeForce RTX 5060
- `EXT_disjoint_timer_query_webgl2`: available

GPU numbers below are therefore actual timer-query measurements. No synthetic or inferred GPU timing value is reported.

## Warm 60-second endurance run

All required/lazy textures were warmed before the authoritative endurance window.

| Metric | Result |
| --- | ---: |
| Samples | 10,263 |
| Window | 60.0165 s |
| CPU frame mean | 1.3680 ms |
| CPU frame P95 | 2.70 ms |
| CPU frame P99 | 4.20 ms |
| CPU frame max | 14.20 ms |
| GPU mean | 0.3513 ms |
| GPU P95 | 1.7139 ms |
| GPU P99 | 4.5527 ms |
| GPU max | 11.2791 ms |
| Max projectiles | 16 |
| Max visual particles/effects | 1,234 |
| Max draw calls | 737 |

CPU stage P95/P99 values were: simulation 1.10/1.90 ms, visual update 0.10/0.10 ms, and draw/submit 2.10/3.20 ms.

### Resource stability during warm endurance

| Resource | Start | End | Delta |
| --- | ---: | ---: | ---: |
| Resident textures | 78 | 78 | 0 |
| Texture uploads | 78 | 78 | 0 |
| Pending uploads | 0 | 0 | 0 |
| Texture invalidations | 0 | 0 | 0 |
| Renderer recreations | 0 | 0 | 0 |
| JS heap | 15,083,047 B | 13,217,472 B | -1,865,575 B |

Heap ranged from 8,373,537 B to 43,664,124 B during the window and finished below its starting value. This is evidence against monotonic growth for this run; it is not a proof that every possible workload is leak-free.

An earlier cold-ish 60-second run loaded six additional textures (72 -> 78). The warmed run above is the relevant steady-state comparison and showed 78 -> 78 with zero additional uploads.

## Repeated switch / restart stress

After texture warm-up, two rounds of 30 ship switches and two rounds of 30 battle restarts were performed (60 switches + 60 restarts total). Resident textures stayed at 78 and upload / invalidation / renderer-recreation counters did not continue increasing. Heap values fluctuated rather than rising monotonically (about 27.7 MiB -> 12.1 -> 14.6 -> 15.7 -> 15.6 MiB across the checkpoints).

## Multi-resolution production runs

Each resolution used the same production build with real GPU timer queries. Scene state is live, so the three short windows are not intended as an apples-to-apples scaling benchmark.

| Resolution | Window | CPU P95 | CPU P99 | GPU P95 | GPU P99 | Texture delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1280x720 | 6.09 s | 4.70 ms | 7.60 ms | 5.4278 ms | 22.1901 ms | 82 -> 82 |
| 1920x1080 | 5.71 s | 3.40 ms | 8.50 ms | 0.3066 ms | 4.8969 ms | 82 -> 82 |
| 2560x1440 | 6.02 s | 2.60 ms | 4.30 ms | 0.5698 ms | 1.2467 ms | 82 -> 82 |

All three windows had zero additional texture uploads, invalidations, and renderer recreations after warm-up.

## Regression / build gates

Before final commit the M4 worktree passed:

- `npm run typecheck`
- existing `npm test` (26/26; no M4 test file changes)
- `npm run lint` (0 warnings / 0 errors)
- `npm run build`
- runtime dependency scans and `git diff --check` (final closeout gate)

## Wasm decision (historical M4 state)

At the time M4 was closed, the available Runner did not expose the Rust/Wasm toolchain, so M4 itself did not adopt or claim a Rust/Wasm speedup. This statement is retained only as the historical M4 result. It was superseded by the later bounded collision pilot and production integration: `065f997` completed the measured Wasm pilot, `d21c181` integrated the spatial + Wasm runtime with exact TypeScript fallback, and M8 records the separate Worker decision. See `benchmarks/wasm-pilot/README.md`, the current README collision section, and `docs/m8-worker-decision.md` for the authoritative current architecture.

## Scope boundary

M4 validates the standalone browser combat project and its production build. It does not claim that the native Starsector client was launched or modified, and it does not claim native-game pixel-perfect visual parity without paired original captures.
