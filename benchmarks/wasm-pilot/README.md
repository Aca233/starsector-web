# Rust/Wasm collision pilot

This directory contains the source and benchmark harness for the batched projectile-to-ship collision kernel. The validated kernel is now used by a **bounded** browser runtime path: TypeScript still owns authoritative combat state and applies every damage/armor/flux/effect result, while Wasm receives packed geometry only for eligible ordinary ballistic batches. Unsupported/special cases and any Wasm failure fall back to TypeScript.

## What is measured

The pilot uses the project's real Onslaught, Paragon, and Doom hull polygons from `src/engine/data/hull_bounds.ts`, together with their collision radii and shield geometry. Each query performs:

1. circle broadphase candidate rejection;
2. active shield circle/arc intersection, including shield-center offsets;
3. projectile transformation into the rotated ship-local frame;
4. exact segment-versus-hull-polygon intersection;
5. nearest in-step hit selection across all candidate ships.

Static hull geometry is uploaded once. Dynamic state is transferred in one batch, never one JavaScript/Wasm call per projectile.

### Packed boundary

Static input:

- hull vertices: packed local-space `x, y` pairs;
- hull metadata: packed `startVertex, vertexCount` pairs.

Dynamic ship input uses 13 `f64` values per ship:

- world `x, y`;
- `facingCos, facingSin`;
- broadphase radius squared, expanded to contain an active offset shield;
- hull outline id;
- shield radius squared and half-arc cosine;
- shield-active flag;
- shield local-center `x, y`;
- shield-facing cosine/sine (separate from hull facing for omni shields).

Projectile input uses `x0, y0, x1, y1`. The indexed runtime export additionally receives a prefix-offset array plus flattened ship indices produced by the TypeScript uniform grid. Output uses five `f64` values per projectile: target index (`-1` for none), segment fraction `t`, world hit `x`, world hit `y`, and collision type (`0` none, `1` hull, `2` shield).

TypeScript continues to own damage, armor, flux, effects, audio, rendering, entity lifetime, and the combat session. No JSON serialization crosses the Wasm boundary.

## Build

The normal application build does not require Rust. To compile the optional pilot on a machine that has Rust plus the `wasm32-unknown-unknown` target:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-wasm-pilot.ps1
npm run benchmark:collision
```

The build artifact is written to `artifacts/wasm-pilot/collision_core.wasm`, which is git-ignored. The validated browser artifact is copied to and checked in as `public/runtime/collision_core.wasm`, so normal application installs/builds do not require Rust. `WASM_PILOT_PATH` can point the benchmark at another compiled module. `scripts/build-wasm-pilot.ps1` also accepts `RUSTC_BIN` and `RUST_SYSROOT`, so CI or a temporary toolchain can rebuild it without changing the system PATH.

## Correctness probes

The benchmark asserts equivalence between the object baseline, packed TypeScript implementation, full-scan Wasm output, and spatial/indexed Wasm output before accepting timing results. The covered cases are high-speed crossing, edge grazing, starting inside a hull, nearest selection across overlapping targets, and shield-before-hull interception. Project regression tests additionally cover the runtime spatial index and TypeScript fallback path.

## Latest measured result

The checked-in `benchmarks/collision-results.json` is the authoritative raw record. The latest run used Node v24.13.0, 8 warmups and 40 measured samples per workload.

| Workload | Fastest TS mean | Spatial+Wasm mean | Spatial+Wasm / TS | Fastest TS P95 | Spatial+Wasm P95 | Candidate reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 ships / 200 projectiles | see raw JSON | 0.156 ms | see raw JSON | see raw JSON | 0.370 ms | 90.8% |
| 50 / 2,000 | 3.195 ms | 2.701 ms | 84.5% | 3.526 ms | 3.170 ms | 91.3% |
| 100 / 10,000 | 55.970 ms | 41.751 ms | 74.6% | 80.358 ms | 63.524 ms | 92.0% |

The Wasm module was 1,618,500 bytes in the recorded run. Preparation (including spatial candidate construction), boundary-transfer, compute, result-read, total, P95, P99, max, frame-budget exceed counts, candidate-pair counts, process-memory deltas, initialization cost, and Wasm linear-memory sizes are retained in the JSON result.

## Decision

The integration gate requires both substantial spatial reduction and spatial+Wasm end-to-end <= 90% of the fastest TypeScript path at medium load and <= 80% at large load. The measured medium/large ratios are 84.5% and 74.6%, with 92.0% pair reduction at large load, so the checked-in result records `runtimeIntegrated: true`.

The integration is deliberately narrow: batches below eight projectiles, missiles, proximity-fuse projectiles, flares, light-MG interception, unsupported hull geometry, module-load errors, and runtime traps use the TypeScript exact path. Reusable Wasm buffers avoid per-step allocator churn; the precompiled module is a browser asset, not a Rust build dependency.

The 100/10,000 case remains well outside a 16.67 ms frame budget even after candidate pruning (63.52 ms P95, 40/40 samples over 16.67 ms). These measurements were taken in Node on this Runner rather than a production browser/JIT, so browser telemetry remains the final authority for real gameplay performance.
