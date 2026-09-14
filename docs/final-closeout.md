# Final Project Closeout

Validated on 2026-09-14. This document consolidates the project-plan completion state after M1-M4, the bounded Wasm collision work, and the M8 Worker decision. No test files are added or modified by this closeout.

## Completion status

| Scope | Status | Closeout evidence |
| --- | --- | --- |
| M1: standalone runtime | complete | packaged assets/content, production build, no runtime `/api/asset`, clean-checkout deployment validation |
| M2: stable/verifiable foundation | complete | `CombatSession`, fixed-step scheduling, input/focus handling, deterministic Visual Lab, texture/resource lifecycle |
| M3: sample-ship visual systems | implementation complete | deterministic VIS capture matrix, reusable visual profiles, multi-resolution HUD validation |
| M4: integrated combat / performance | complete within browser scope | integrated battle capture, 60 s endurance measurement, real GPU timer queries, repeated restart/switch checks, multi-resolution production runs |
| bounded Wasm collision pilot/runtime | complete | measured Rust/Wasm pilot, spatial candidate pruning, production Wasm path with exact TypeScript fallback |
| M8 Worker decision | complete | authoritative simulation stays on the main fixed-step loop; production collision telemetry added to support any later reassessment |

The formal project plan defines M1-M4. The Wasm and Worker items are follow-up architecture decisions required by the same specification rather than evidence that M1-M4 were incomplete.

## Clean-checkout production deployment validation

A fresh deployment check was performed from a Git archive of commit `11cc7cb15a2ff3ebd34fcf5e8769d879f3d340a3`, extracted into a newly created temporary directory. The directory did not inherit the project worktree's `node_modules`, local caches, ignored artifacts, or untracked files.

Validation sequence and result:

1. `npm ci` in the fresh archive: pass.
2. `npm run build`: pass; Vite transformed 1,959 modules and produced the production bundle.
3. Required build outputs: present:
   - `dist/index.html`
   - `dist/game-assets/asset-manifest.json`
   - `dist/content/manifest.json`
   - `dist/runtime/collision_core.wasm`
4. Clean source/build scan for `/api/asset`: zero matches.
5. Runtime source scan (`src/`) for `starsector-core`: zero matches.
6. Production Vite preview started from the fresh archive and returned:
   - `/`: HTTP 200
   - `/game-assets/asset-manifest.json`: HTTP 200, 172 entries
   - `/content/manifest.json`: HTTP 200, 5 ships / 17 weapons

Result: **pass** for an isolated clean-checkout build and production-preview path.

### Validation boundary

This check deliberately does not claim that the Windows host physically lacks a Starsector installation somewhere else on disk. It proves the packaged Git checkout can install dependencies, build, and serve its required runtime assets from an isolated directory without inheriting the original worktree or depending on a parent-directory game tree. The normal build/runtime code also contains no `starsector-core` source dependency and no `/api/asset` runtime path.

## Visual acceptance status

The browser side of the visual plan is reproducible and documented:

- Visual Lab exposes VIS-01 through VIS-12 with deterministic seed/time control.
- `docs/m3-visual-validation.md` records the controlled sample-ship/effect/HUD capture matrix.
- `docs/m4-final-validation.md` records the integrated combat capture and production performance/resource measurements.
- Local reproducible capture artifacts exist under `artifacts/m3/` and `artifacts/m4/`.

The project still does **not** claim pixel-perfect parity with native Starsector. The specification's paired original-vs-web comparison requires a standardized native reference set, and that reference set is not present in the repository.

## Architecture decision reconciliation

The M4 validation document originally recorded that Rust/Wasm was not adopted because the then-available Runner lacked the Rust/Wasm toolchain. That was a correct historical M4 statement but is no longer the current architecture state.

Later work superseded it:

- `065f997` completed the measured Rust/Wasm collision pilot.
- `d21c181` integrated a bounded production spatial + Wasm collision path.
- unsupported/special collision cases and Wasm load/runtime failures retain the exact TypeScript path.
- TypeScript remains authoritative for combat state, damage, armor, flux, lifetime, effects, and audio.
- `11cc7cb` (M8) explicitly decided not to move the synchronous collision-only kernel into a Worker and added production collision telemetry for future evidence-based reassessment.

Accordingly, the current decision is **bounded Wasm adopted; collision-only Worker not adopted**.

## Final deliverable mapping

The specification's final deliverables map to the repository as follows:

1. Buildable standalone project: repository + `package-lock.json` + documented npm workflow.
2. Deployable website artifact: `npm run build` -> `dist/`, verified through production preview.
3. Asset/content manifests: `public/game-assets/asset-manifest.json` and `public/content/manifest.json`.
4. Startup/development/release instructions: `README.md`.
5. Visual Lab instructions: `README.md` Visual Lab section and deterministic VIS scene catalog.
6. Visual comparison record: `docs/m3-visual-validation.md` plus M4 integrated capture; native paired-reference comparison remains externally blocked as noted below.
7. Stability/performance record: `docs/m4-final-validation.md`.
8. Wasm adopt/not-adopt conclusion and basis: README collision section, `benchmarks/wasm-pilot/README.md`, and this closeout.
9. Outstanding-item list: next section.

## Outstanding items

### External acceptance dependency: native paired reference captures

This is the only known closeout item that cannot be completed from the standalone repository alone. A standardized native-StarSector reference capture set is needed to perform the specification's formal paired original-vs-web visual comparison (overlay/difference/frame-sequence review under matched camera, scale, resolution, state, and timestamps).

Until those references are supplied, the correct status is:

- software implementation and repository-owned validation: **complete**;
- standalone clean-checkout deployment evidence: **complete**;
- performance/stability evidence: **complete**;
- Wasm/Worker architecture decisions: **complete**;
- native paired visual parity acceptance: **pending external reference evidence**.

No other repository-owned implementation task is currently identified as required to close the supplied project plan.
