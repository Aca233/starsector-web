# M3 Visual Fidelity Validation

Validated on 2026-09-13 against the production Vite preview using deterministic Visual Lab deep links.

## Scope

M3 covers the planned V04-V08 visual pass:

- V04: reusable ship/hull/engine profiles with Onslaught as the primary sample and Paragon/Doom reuse checks.
- V05: shield open/hold/hit visuals and fortress-shield profile behavior.
- V06: TPC, ballistic, beam, and missile-family rendering profiles wired into the WebGL paths.
- V07: venting, hit flashes, missile explosions, and layered ship-destruction effects.
- V08: HUD density/layout behavior and glyph/radar presentation at 1280x720, 1920x1080, and 2560x1440.

## Controlled capture matrix

All captures use seed `1337`, production preview rendering, and Visual Lab's deterministic seek path.

| Evidence | Scene / fixed time | Resolution | Result |
| --- | --- | --- | --- |
| `VIS-01-onslaught-1920x1080.png` | VIS-01 / 0.25 s / Onslaught | 1920x1080 | pass |
| `VIS-01-paragon-1920x1080.png` | VIS-01 / 0.25 s / Paragon profile override | 1920x1080 | pass |
| `VIS-01-doom-1920x1080.png` | VIS-01 / 0.25 s / Doom profile override | 1920x1080 | pass |
| `VIS-03-shield-hit-1920x1080.png` | VIS-03 / 1.00 s | 1920x1080 | pass |
| `VIS-05-tpc-1920x1080.png` | VIS-05 / 0.95 s | 1920x1080 | pass |
| `VIS-07-beam-1920x1080.png` | VIS-07 / 2.20 s | 1920x1080 | pass |
| `VIS-08-missile-1920x1080.png` | VIS-08 / 3.50 s | 1920x1080 | pass |
| `VIS-09-vent-1920x1080.png` | VIS-09 / 2.00 s | 1920x1080 | pass |
| `VIS-10-explosion-1920x1080.png` | VIS-10 / 2.65 s | 1920x1080 | pass |
| `VIS-11-hud-1280x720.png` | VIS-11 / 2.00 s | 1280x720 | pass |
| `VIS-11-hud-1920x1080.png` | VIS-11 / 2.00 s | 1920x1080 | pass |
| `VIS-11-hud-2560x1440.png` | VIS-11 / 2.00 s | 2560x1440 | pass |

The validation gate requires all 12 PNGs to have the expected dimensions and to exceed a minimum content-size guard, which also catches browser error pages. A contact-sheet review was then used to visually inspect the three ship profiles, shield hit, TPC, beam, missile impact, venting, ship destruction, and the three HUD resolutions. A separate VIS-09 capture at 0.80 s was used to inspect the vent-start halo/plume region at higher scale.

The generated PNG/JPEG evidence lives under `artifacts/m3/` and is intentionally ignored by Git because it is reproducible local validation output rather than runtime content.

## Automated gate

After the visual review:

- TypeScript project typecheck: pass.
- Vitest: 26/26 tests pass.
- oxlint: 0 warnings, 0 errors.
- production Vite build: pass.
- `git diff --check`: pass.
- runtime-source scans: zero `/api/asset`, zero `starsector-core`, zero direct `Math.random()` in `src/engine/render`, and zero direct `performance.now()` in `src/engine/render`.

## Fidelity boundary

This M3 validation proves the planned browser-side visual systems, deterministic scenes, profile reuse, and multi-resolution HUD behavior are implemented and reproducibly reviewable. It does **not** claim pixel-perfect parity with the original game because no standardized paired original-game reference capture set is available in this repository. A paired original-vs-web comparison remains a separate reference-data validation task rather than an unverified claim.
