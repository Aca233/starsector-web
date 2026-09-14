# starsector-web

A self-contained React + TypeScript + Vite combat sandbox inspired by Starsector combat presentation. The browser runtime is independent from a Starsector installation: all runtime images, audio and packaged content are served from this repository.

## Requirements

- Node.js 20+ (validated on Node 24)
- npm
- A modern browser with Canvas2D; WebGL2 is used when available

A Starsector installation is **not** required to build, test, preview, or play the packaged project. It is only needed if a developer intentionally regenerates the curated asset bundle with the offline import script.

## Install, test and run

```powershell
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run preview
```

Development mode:

```powershell
npm run dev
```

The production build is written to `dist/`. There is no `/api/asset` endpoint and Vite is not allowed to read the parent directory.

## Runtime architecture

The main lifecycle is owned by `CombatSession` rather than React renders. A session owns the `CombatEngine`, `FixedTimestepScheduler`, renderer, player AI, `VisualClock`, deterministic `VisualRandom`, performance counters and disposable GPU resources.

The timing boundary is deliberate:

- `requestAnimationFrame`: accumulator input, interpolation, camera presentation and drawing only.
- fixed 60 Hz simulation ticks: AI, manual steering/throttle/strafe, movement, weapons, collision and damage.
- camera presentation uses an exponential time-based follow controller, so 30/60/144 Hz render rates converge to the same camera response.
- scheduler overload preserves a bounded backlog and reports any simulation time discarded by its safety cap.
- `VisualClock`: visual animation time.
- `VisualRandom`: seed/channel/time-derived visual noise so the same scene, seed and timestamp can be reproduced.

Restart and ship changes clear battle time, settlement, statistics, projectiles/effects/contrails, tactical command state and countermeasure cooldowns before rebuilding combatants.

## Assets and content

Runtime assets live in:

- `public/game-assets/`
- `public/game-assets/asset-manifest.json`
- `public/content/manifest.json`

`AssetResolver` is the runtime URL policy and rejects bundle-root traversal. `TextureCache`, HUD image loading and `SoundManager` resolve resources through it. The WebGL texture manager separately tracks CPU image state and GPU pending/uploaded/invalidated state, keys resources by sampler configuration, prevents duplicate pending uploads and recreates resources after WebGL context restoration.

`ContentRegistry` is the authoritative ship/weapon registry. Built-in and imported weapons use the same lookup path, so a dynamically registered weapon can be equipped by a ship slot.

Original `.ship`, `.wpn` and CSV parsing is import tooling, not a runtime filesystem dependency. The parser preserves JSON primitives and quoted `//` text and supports quoted CSV fields.

### Regenerating the curated game-asset bundle

Use a legally available Starsector `starsector-core` directory only as an explicit developer input:

```powershell
./scripts/import-game-assets.ps1 -StarsectorCore 'C:\path\to\starsector-core'
```

The script scans the current source for referenced graphics/audio, copies only that closure, rejects source-root traversal and regenerates SHA-256/size/type/sampler metadata. It does **not** copy the whole game installation. Once generated, the application builds and runs without the source installation.

## Visual Lab

Open:

```text
?view=visual-lab&scene=VIS-01&seed=1337
```

The Visual Lab provides play, pause, replay, fixed-step, deterministic seek, seed, zoom, camera lock, live-AI handoff, damage, motion and layer controls. In controlled mode it owns the fixed visual tick instead of letting live combat mutate the scene. Required benchmark textures are decoded and uploaded before Play/Step is enabled; load failures are shown in the panel rather than silently benchmarking missing layers.

The M2 acceptance-scene catalog follows the project plan exactly:

| Scene | Controlled scenario |
| --- | --- |
| VIS-01 | Onslaught static, four facings |
| VIS-02 | Idle, thrust, release, strafe, burn drive |
| VIS-03 | Shield deploy/close plus one hit |
| VIS-04 | Repeated shield hits |
| VIS-05 | Single TPC shot |
| VIS-06 | Continuous ballistic firing |
| VIS-07 | Beam charge, sustain and stop |
| VIS-08 | Missile straight flight, turn and impact |
| VIS-09 | Complete vent cycle |
| VIS-10 | Small impact and ship explosion |
| VIS-11 | Frozen HUD state |
| VIS-12 | Two ships plus fighters/bombers integration |

`VisualScenarioController` rebuilds a scenario from its seed and absolute timestamp, so seek/replay does not depend on the path taken to reach that frame. Renderer-owned evolving state such as vent particles and tactical-arc fades is advanced from `updateVisual()` and reset on restart/ship change; `render()` samples the current `VisualClock` without advancing those effects.

Ship, engine, shield, weapon-family and explosion visual profiles are centralized under `src/engine/visual/VisualProfiles.ts`. The existing shield shader remains in place; its colors/animation now consume the profile layer rather than requiring a shader rewrite.

The HUD has responsive density rules for 1280×720, 1920×1080 and 2560×1440-class viewports. The project intentionally does not claim pixel-perfect parity without a controlled reference-capture set; Visual Lab is the deterministic comparison surface for that future work.

## Rendering lifecycle and metrics

Both renderers implement `dispose()`. The WebGL renderer handles `webglcontextlost` / `webglcontextrestored`, invalidates GPU texture state, recreates programs/buffers/textures and exposes recreation counters.

Performance telemetry distinguishes:

- simulation time
- visual update time
- render preparation time
- JavaScript draw-submit time
- draw calls
- projectile / particle / texture counts
- resource recreations
- JS heap usage when the browser exposes it

JavaScript draw-submit time is **not** labelled GPU time. GPU time remains `unavailable` unless a real GPU timer query is available and measured.

## Collision / bounded Wasm runtime

Run:

```powershell
npm run benchmark:collision
```

The benchmark compares the object-oriented baseline, a packed typed-array TypeScript path, the full-scan Rust/Wasm kernel, and the production-style uniform-grid + indexed Wasm path at:

- small: 10 ships / 200 projectiles
- medium: 50 ships / 2,000 projectiles
- large: 100 ships / 10,000 projectiles

The kernel uses the real Onslaught, Paragon, and Doom hull polygons plus rotated hull intersection, shield geometry, circle broadphase filtering, and nearest in-step hit selection. The runtime rebuilds a conservative uniform-grid ship index once per projectile simulation step, batches only ordinary ballistic projectiles, and passes only per-projectile candidate indices into the bundled `public/runtime/collision_core.wasm`. Missiles, proximity fuses, flares, light-MG interception, small batches, unsupported hulls, and every Wasm load/runtime failure remain on the exact TypeScript path. TypeScript continues to own damage, armor, flux, entity lifetime, effects, audio, and all authoritative combat state.

The latest measured run records `runtimeIntegrated: true` for this bounded path. Spatial pruning removed 91.3% of naive pairs at 50/2,000 and 92.0% at 100/10,000. Spatial+Wasm end-to-end measured 84.5% of the fastest TypeScript path at medium load and 74.6% at large load; large-load P95 was 63.52 ms versus 80.36 ms for the fastest TypeScript path. The 100/10,000 stress case is still outside a 16.67 ms frame budget, so this is intentionally a limited accelerator with a TypeScript fallback rather than a transfer of simulation ownership. The precompiled module is shipped with the web build, while compiling it from Rust remains optional for normal `npm` build/runtime use. See `benchmarks/wasm-pilot/README.md` for boundary details and raw measurements.

### M8 Worker decision

M8 keeps the authoritative simulation on the main fixed-step loop and does **not** move the collision kernel into a Web Worker yet. Projectile collision results are consumed synchronously inside the same fixed tick so hit order, target destruction and damage/effect application stay deterministic. Moving only the geometry query to a Worker would either require blocking the main thread for a reply or accepting delayed authoritative results; neither is an acceptable drop-in replacement for the current contract.

Instead, the production runtime now records browser-side collision telemetry per rendered frame: kernel wall time, TypeScript/Wasm batch counts, Wasm fallback count, projectile count, candidate-pair count and maximum candidates per projectile. The Visual Lab displays the current values and window P95, and `window.__combatPerformanceReport().collision` exposes the aggregate report for real-browser captures. A future full-simulation Worker remains a separate architecture task using sequenced inputs and timestamped snapshots when browser measurements show that moving simulation work off the main thread is worth the added latency and synchronization complexity.

## Final closeout status

The software-owned scope of the project plan is closed: M1-M4 are implemented and validated, the bounded Wasm decision is measured and integrated, and M8 records the explicit decision not to move the synchronous collision kernel into a Worker yet. A clean-checkout deployment validation was also run from a fresh `git archive` extraction with no inherited workspace `node_modules`, cache, or untracked files: `npm ci` + production build passed, required manifests and `collision_core.wasm` were present, and the production preview served the root page plus both manifests successfully.

The one remaining external acceptance dependency is a standardized set of paired native-StarSector reference captures for the planned original-vs-web visual comparison. The repository contains deterministic browser capture evidence, but it intentionally does not claim native pixel-perfect parity without those references. The complete closeout matrix, deployment evidence, decision supersession notes, and outstanding-item list are in `docs/final-closeout.md`.

## Regression coverage

`npm test` covers:

- Starsector JSON comments/primitives/quoted URLs
- quoted/escaped CSV fields
- armor damage clamp (100/1000/10000 effective armor cases)
- imported weapon registration and equipment
- scheduler behavior at 30/60/144 Hz
- preservation of scaled backlog rather than dropping it
- 20 repeated ship switches resetting timing/cooldowns/settlement
- seeded visual random replay
- asset-root traversal rejection
- spatial-grid collision candidate pruning
- swept hull collision and shield-before-hull fallback behavior

## Production verification checklist

Before release:

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

Then verify:

1. `dist/` contains `game-assets/asset-manifest.json` and `content/manifest.json`.
2. source and `dist/` contain no `/api/asset` references.
3. runtime source contains no `starsector-core` dependency.
4. `src/engine/render` contains no direct `Math.random()` or `performance.now()` calls.
5. production preview serves the application and bundled assets without parent-directory access.
6. restart / ship switch can be repeated without stale battle state.

The original-format importer and asset regeneration script are explicit developer tools; they are not invoked by normal build or runtime code.
