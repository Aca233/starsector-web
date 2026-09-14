# Weapon Fidelity Reference Baseline

Status: static-source implementation baseline recorded; runtime paired visual capture is deferred and is not required for the current calibration pass.

## Web project baseline

- Project: `C:\Program Files (x86)\Starsector\starsector-web`
- Baseline HEAD before this batch: `99178e58980fc37ca947866a31629d52c67f6b2c`
- Worktree was clean before W01/W02/W03 changes began on 2026-09-14.
- Existing screenshots from earlier revisions are historical evidence only and are not accepted as the before-image for this batch.

## Local reference input

- Reference directory: `C:\Program Files (x86)\Starsector\starsector-core`
- The reference directory is treated as read-only and is not a runtime or build dependency of the web project.
- This local installation has not been established as an unmodified official distribution. Values below are therefore recorded as values from the inspected reference installation, not as a claim about every Starsector release.

Inspected reference files for the first batch:

- `data/weapons/tpc.wpn`
- `data/weapons/proj/tpc_shot.proj`
- `data/weapons/autopulse.wpn`
- `data/weapons/proj/autopulse_shot.proj`
- `data/weapons/mark9.wpn`
- `data/weapons/proj/mark9_shot.proj`
- `data/weapons/tachyonlance.wpn`
- `data/weapons/gravitonbeam.wpn`
- `data/weapons/taclaser.wpn`
- `data/weapons/pdburst.wpn`
- `data/weapons/proj/reaper_torp.proj`
- `data/weapons/proj/atropos_torp.proj`
- `data/weapons/proj/annihilator_rocket.proj`
- `data/weapons/proj/sabot_srm.proj`

## Confirmed first-batch source values

| Weapon | Reference values used in this batch |
| --- | --- |
| TPC | projectile `100 x 35`, `fadeTime=0.3`, ROUGH texture, `textureScrollSpeed=-256`, `pixelsPerTexel=1`, fringe `[255,0,0,255]`, core `[255,255,255,200]` |
| Autopulse | projectile `50 x 20`, `fadeTime=0.25`, SMOOTH texture, `textureScrollSpeed=-256`, `pixelsPerTexel=1`, fringe `[0,0,255,255]`, core `[255,255,255,200]` |
| Mark IX | projectile `40 x 7.5`, `fadeTime=0.20`, `textureScrollSpeed=64`, `pixelsPerTexel=5`, fringe `[235,255,215,235]`, core `[225,255,205,200]` |
| Tachyon Lance / Graviton Beam / Tactical Laser | inspected beam definitions use `pixelsPerTexel=5`, supporting the existing rough-texture `128 * 5 = 640` sampling scale for those beam definitions |
| Burst PD | width `17`, ROUGH, scroll `128`, `pixelsPerTexel=5`, fringe `[0,0,155,255]`, core `[255,255,255,255]`, glow `[100,100,255,255]`, `hitGlowBrightenDuration=0.25`; no source `hitGlowRadius` field |
| Reaper visual explosion | top-level `.proj explosionRadius=350`, `explosionColor=[255,100,100,255]`; recorded separately from `explosionSpec` mechanical/damage fields |
| Atropos visual explosion | top-level `250`, `[255,155,100,255]` |
| Annihilator visual explosion | top-level `75`, `[255,165,0,255]` |
| Sabot main missile visual explosion | top-level `125`, `[255,165,0,255]`; child-stage/MIRV behavior remains a separate mechanics concern |

## Impact / explosion semantic evidence

The static audit distinguishes three separate concepts: projectile `.proj hitGlowRadius` (impact glow only), missile top-level `explosionRadius/explosionColor` (purely visual explosion size/color), and gameplay-linked `explosionSpec` / proximity / collision fields. These are not interchangeable. An earlier audit note associating `38` with Mark IX was corrected by rereading `mark9_shot.proj`: Mark IX is `hitGlowRadius=50`; `38` belongs to `heavyac_shot.proj`.

## Acceptance evidence state

The active pass uses the read-only local `.wpn/.proj/CSV/textures/audio/config` reference plus deterministic Web real-fire scenes. Original-runtime capture is intentionally outside the current pass. Therefore no weapon is marked runtime visually accepted by this document, even when its static source fields and Web data/render chain are closed. `WPN-TPC-01` and the other `WPN-*` scenes remain repeatable Web-side evidence for future paired capture if that evidence tier is resumed.

