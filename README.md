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

The Visual Lab provides play, pause, replay, fixed-step, seek, seed, zoom, camera lock, AI, damage, motion and layer controls. Its scene catalog is:

| Scene | Focus |
| --- | --- |
| VIS-01 | Onslaught hull / hardpoints |
| VIS-02 | Onslaught engine plume |
| VIS-03 | Onslaught shield |
| VIS-04 | TPC charge / muzzle / projectile |
| VIS-05 | Ballistic weapon family |
| VIS-06 | Paragon beams |
| VIS-07 | Paragon fortress shield |
| VIS-08 | Doom phase cloak |
| VIS-09 | Missiles / contrails |
| VIS-10 | Impact / vent / explosion |
| VIS-11 | Broadsword / Dagger wings |
| VIS-12 | Full layer integration |

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

## Collision / Wasm pilot

Run:

```powershell
npm run benchmark:collision
```

The benchmark compares the baseline object-oriented collision query and an optimized typed-array implementation at:

- small: 10 ships / 200 projectiles
- medium: 50 ships / 2,000 projectiles
- large: 100 ships / 10,000 projectiles

It records preparation, boundary-transfer, compute, total P95/P99 and memory delta in `benchmarks/collision-results.json`.

A minimal isolated Rust candidate is in `benchmarks/wasm-pilot/`. On the validated Runner, `rustc`, `cargo`, `rustup` and `wasm-bindgen` were unavailable, so no honest JS↔Wasm boundary or compute measurement could be made. Wasm is therefore **not adopted** and is not a build dependency. The measured optimized TypeScript-equivalent path already reduced the large benchmark mean total from about 8.45 ms to 5.37 ms on that Runner.

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
