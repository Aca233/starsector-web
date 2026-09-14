# Final Project Closeout

Validated on 2026-09-14. This document consolidates the project-plan completion state after M1-M4, the bounded Wasm collision work, the M8 Worker decision, and the final engineering-gap remediation. The existing `tests/core.test.ts` is extended with focused validation/RNG regressions; no separate test file is added.

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

### Final engineering-gap remediation

A later source audit found repository-owned gaps that the earlier closeout wording had overstated. Those gaps are now handled in code:

- ship/mod imports are validated for required structure, numeric ranges, enums, duplicate IDs/slot IDs, weapon-slot references, weapon size compatibility, weapon-group slot references, bundled sprite references, and optional nested weapon structures such as muzzle-flash/proximity-fuse definitions before registration;
- the asset/content manifests are validated before renderer asset preparation is considered ready; the content manifest has `schemaVersion`, `contentVersion`, and one declared default-loadout record for every built-in ship;
- pending WebGL image listeners are explicitly removed on invalidation/disposal, with a generation fence preventing stale load callbacks from uploading after lifecycle reset;
- WebGL sampler wrap/filter/mipmap behavior comes from manifest metadata rather than filename heuristics;
- Vite `BASE_URL` is the single public-runtime URL base for manifests, game assets, cursor and Wasm; a `/starsector/` production build/preview has been exercised successfully;
- interactive HUD/UI elements block combat mouse/wheel handling through ancestor-aware target detection;
- authoritative combat randomness and cosmetic randomness use separate deterministic `SimulationRandom` streams. Weapon spread, failures, collision-affecting fragments and AI decisions stay on the combat stream, while particles, trails, cosmetic arc geometry, UI/radio IDs and similar presentation sampling use the cosmetic stream; direct `Math.random()` remains only in the independent audio pitch-variation path;
- the former App-wide 100 ms HUD rerender tick has been removed; HUD refresh is localized to the HUD subtree.

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

### External typography/reference boundary

The packaged asset closure contains no original Starsector font or bitmap-font glyph-atlas file. The project therefore does not relabel the system monospace `HudGlyphSample` as an original glyph sample. Exact native typography acceptance requires a legally available original glyph/font reference supplied from outside this repository. The asset-manifest schema now has explicit font/glyph-atlas metadata support so such a reference can be validated rather than guessed when one is supplied.

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

The final audit distinguishes repository-owned engineering work from evidence/assets that cannot be generated honestly by the standalone web repository.

### External acceptance dependency: native paired reference captures

A standardized native-StarSector reference capture set is still needed for the formal paired original-vs-web visual comparison (overlay/difference/frame-sequence review under matched camera, scale, resolution, state, and timestamps). Browser-side deterministic capture tooling is ready, but native evidence is not present in the repository.

### External acceptance dependency: original font/glyph source

No original font or bitmap-font glyph atlas is packaged in the independent asset closure. Exact original-glyph acceptance remains pending until a legally available reference is provided. The current `HudGlyphSample` intentionally demonstrates the web HUD font stack and is not counted as proof of native-font parity.

Until those external inputs are supplied, the correct status is:

- repository-owned engineering remediation and automated validation: **complete for the identified audit gaps**;
- standalone/root and nested-base deployment path: **validated**;
- performance/stability evidence: **existing M4 evidence remains the current measured record**;
- Wasm/Worker architecture decisions: **complete**;
- native paired visual parity acceptance: **pending external reference evidence**;
- exact original-font/glyph parity acceptance: **pending external reference material**.

No original-game evidence is fabricated or inferred from the web implementation. Any future claim of complete visual parity must attach the missing native evidence rather than merely changing this status text.
