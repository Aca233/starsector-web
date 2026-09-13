# Rust/Wasm collision pilot

This directory contains an isolated benchmark prototype for batched projectile-to-ship collision queries. It is **not** a runtime dependency: the browser combat runtime still owns authoritative state and still runs in TypeScript. The pilot answers only whether this collision kernel is worth a later, separately validated runtime integration.

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

Dynamic ship input uses 11 `f64` values per ship:

- world `x, y`;
- `facingCos, facingSin`;
- broadphase radius squared, expanded to contain an active offset shield;
- hull outline id;
- shield radius squared and half-arc cosine;
- shield-active flag;
- shield local-center `x, y`.

Projectile input uses `x0, y0, x1, y1`. Output uses five `f64` values per projectile: target index (`-1` for none), segment fraction `t`, world hit `x`, world hit `y`, and collision type (`0` none, `1` hull, `2` shield).

TypeScript continues to own damage, armor, flux, effects, audio, rendering, entity lifetime, and the combat session. No JSON serialization crosses the Wasm boundary.

## Build

The normal application build does not require Rust. To compile the optional pilot on a machine that has Rust plus the `wasm32-unknown-unknown` target:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-wasm-pilot.ps1
npm run benchmark:collision
```

The build artifact is written to `artifacts/wasm-pilot/collision_core.wasm`, which is git-ignored. `WASM_PILOT_PATH` can point the benchmark at another compiled module. `scripts/build-wasm-pilot.ps1` also accepts `RUSTC_BIN` and `RUST_SYSROOT`, so CI or a temporary toolchain can run the pilot without changing the system PATH.

## Correctness probes

The benchmark asserts equivalence between the object baseline, packed TypeScript implementation, and Wasm output before accepting timing results. The covered cases are high-speed crossing, edge grazing, starting inside a hull, nearest selection across overlapping targets, and shield-before-hull interception. These assertions live inside the benchmark script; no project test file is added.

## Latest measured result

The checked-in `benchmarks/collision-results.json` is the authoritative raw record. The latest run used Node v24.13.0, 8 warmups and 40 measured samples per workload.

| Workload | Fastest TS mean | Wasm mean | Wasm / TS | Fastest TS P95 | Wasm P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 ships / 200 projectiles | 0.187 ms | 0.085 ms | 45.6% | 0.345 ms | 0.145 ms |
| 50 / 2,000 | 3.482 ms | 2.322 ms | 66.7% | 4.109 ms | 2.706 ms |
| 100 / 10,000 | 54.906 ms | 33.787 ms | 61.5% | 87.642 ms | 57.778 ms |

The Wasm module was 1,614,418 bytes. First file-read + compile + instantiate time in the recorded run was 18.67 ms; static outline upload was 2,304 bytes. Preparation, boundary-transfer, compute, result-read, total, P95, P99, max, frame-budget exceed counts, process-memory deltas, and Wasm linear-memory sizes are all retained in the JSON result.

## Decision

The local pilot threshold is end-to-end Wasm <= 90% of the fastest TypeScript path at the medium workload and <= 80% at the large workload. The measured ratios were 66.7% and 61.5%, so the pilot decision is **adopt for a future bounded runtime integration**.

`runtimeIntegrated` remains `false`: this pilot deliberately does not rewrite the production simulation or make Rust a build/runtime dependency. The 100/10,000 case also remains well outside a 16.67 ms frame budget even with Wasm (57.78 ms P95, 40/40 samples over 16.67 ms), so a real integration still needs spatial/candidate reduction rather than relying on an O(projectiles × ships) kernel alone.

These measurements were taken in Node on this Runner, not in the production browser/JIT environment. Browser-side integration must therefore be re-benchmarked before enabling a Wasm production path by default.
