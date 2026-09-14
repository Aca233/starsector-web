# Weapon Fidelity Change Log

## 2026-09-14 — W01/W02/W03 first implementation batch

Baseline: `99178e58980fc37ca947866a31629d52c67f6b2c` with a clean worktree before changes.

Implemented:

- Added explicit `fadeTime` and `pixelsPerTexel` projectile data fields and registration validation.
- Restored inspected TPC/Autopulse source values for fade metadata, texel density, Autopulse fringe color, and core alpha; also recorded inspected Mark IX fade/texel values.
- Preserved RGBA alpha in pulse WebGL and Canvas fallback rendering.
- Preserved the sign of pulse `textureScrollSpeed` and replaced the fixed rough pulse repeat divisor with `pixelsPerTexel`-aware sampling.
- Added minimal TPC/Autopulse per-weapon visual overrides so confirmed projectile dimensions are not multiplied by the older TPC family geometry scales.
- Added `WPN-TPC-01`, a deterministic single-TPC empty-fire scene that advances the actual `CombatEngine.fixedUpdate` fire/control/projectile path rather than manually injecting the projectile.
- Kept `VIS-05` and labeled it as a synthetic layer-inspection scenario instead of treating it as real-fire proof.
- Added regression coverage for the new data contract, confirmed source values, per-weapon geometry override, and deterministic real-fire TPC scene.

## 2026-09-14 — TPC source-field renderer correction

- Captured the real-fire web scene at `WPN-TPC-01`, seed `9001`, `t=0.98s`; the capture exposed an extra projectile head-glow bulb.
- Rechecked `tpc.wpn` and `tpc_shot.proj`: weapon `glowColor` belongs to `GLOW_AND_FLASH` mount animation, while the projectile defines fringe/core colors but no projectile glow or `hitGlowRadius`.
- Removed the synthetic BALLISTIC_AS_BEAM whole-body halo and head-glow sprite from both WebGL and Canvas fallback paths.
- Removed the synthetic TPC `hitGlowRadius: 60`; Autopulse retains its source-defined `hitGlowRadius: 50`.
- Inspected the source beam textures: rough/smooth fringe and core textures are all `128×32`, with the core alpha footprint already narrower. Pulse core rendering now uses the same source `length/width` and scroll rate as fringe instead of applying a second core geometry/UV multiplier.
- Added `WPN-AUTOPULSE-01`, a deterministic real-fire scene using Paragon hardpoint `WS 001`, so Autopulse source corrections can be evaluated through the same production fire/update/render path as TPC.
- Captured the Autopulse real-fire web keyframe at seed `9101`, `t=0.98s`; reference-side paired capture is still pending, so this is evidence of harness/render behavior rather than visual acceptance.

Not claimed complete:

- No paired reference/web video or keyframe review has been performed on this implementation HEAD yet.
- `fadeTime` visual residual semantics remain pending reference confirmation.
- TPC muzzle offsets, UV orientation, impact effects, charge/recoil timing, and stop/fade timing remain subject to paired visual review.
- Autopulse now has a real-fire harness, but no paired reference/web visual review has been completed.

## 2026-09-14 — W04 ballistic first batch

- Corrected Mark IX source width from rounded `8` to `7.5` and transported its confirmed `textureScrollSpeed=64`, `fadeTime=0.20`, and `pixelsPerTexel=5` through real projectiles.
- Preserved configured fringe/core alpha in the ordinary ballistic WebGL and Canvas paths instead of rendering both layers fully opaque.
- Added projectile source slot/barrel-offset state for acceptance/debug evidence so real-fire tests can prove which source barrel fired without changing collision behavior.
- Added `WPN-MARK9-01`, an actual Onslaught `WS 019` fire-control scene; regression checks prove the first two shots alternate between source offsets `[28,-4]` and `[28,+4]` and use normal recoil/muzzle-particle generation.
- Kept `VIS-06` but labeled it synthetic so its hand-injected Mark IX projectiles cannot be mistaken for production-path evidence.
- Corrected Heavy Mauler source width to `9` and mapped its `fadeTime=0.20`, `textureScrollSpeed=64`, and `pixelsPerTexel=5`.
- Corrected HVD source width to `7.5` and mapped its `fadeTime=0.30`, `textureScrollSpeed=64`, and `pixelsPerTexel=5`.
- Added `WPN-HEAVYMAULER-01` and `WPN-HVEL-01`; both use normal fire control, recoil, muzzle-particle generation, projectile update, and render data transport on Onslaught medium turret `WS 012`. The Heavy Mauler scene swaps only the lab mount's `WeaponSpec` to the Registry Heavy Mauler spec and does not change the ship's production loadout.
- The medium-turret acceptance fixture initializes `WS 012` facing forward so the 0.9s deterministic fire checkpoint tests the weapon chain rather than waiting for the turret's normal traverse from its 60° ship-slot base angle; production turn rate and arc remain unchanged.

Still pending for W04 visual acceptance:

- Paired original/web captures for Mark IX, Heavy Mauler, and HVD. A headless Edge capture attempt was not accepted as evidence because the process lifecycle did not reliably produce the requested timestamped frame.
- Reference confirmation of generic ballistic tracer/core/head-glow intensity and effective sprite/transparent-bound geometry.
- Confirmation of `fadeTime` visual-residual semantics; collision lifetime remains unchanged.

## 2026-09-14 — W04 PD / fragmentation batch

- Restored Light MG source visual geometry `35×3.5`, recoil `3`, barrel-below rendering, hit glow `15`, RGBA, `fadeTime=0.30`, `textureScrollSpeed=64`, `pixelsPerTexel=5`, and the bundled `shell_small_yellow.png` source asset.
- Added validated `visualSpawnType`, copied through real and synthetic projectiles and consumed only by projectile renderers. Light MG uses `visualSpawnType=BALLISTIC_AS_BEAM` while gameplay `spawnType` remains `BALLISTIC`; this avoids changing the current web collision model as a side effect of visual work.
- Restored Flak source width `6.5`, core alpha `150`, `fadeTime=0.20`, `textureScrollSpeed=64`, and `pixelsPerTexel=5`.
- Restored Dual Flak source width `4.5`, core alpha `150`, `fadeTime=0.20`, `textureScrollSpeed=64`, `pixelsPerTexel=5`, and the source muzzle spec: spread `25`, size `8+8`, duration `0.12`, count `46`, RGBA `[255,155,75,245]`.
- Added `WPN-LIGHTMG-01` on native Broadsword `WS 001`, `WPN-FLAK-01` as a lab-only Flak mount on Onslaught `WS 014`, and `WPN-DUALFLAK-01` on native Onslaught `WS 014`. Dual Flak regression proves alternating source offsets `[18,-7]` / `[18,+7]`.
- Re-ran the explicit asset importer after restoring Light MG's source sprite. `public/game-assets/asset-manifest.json` now contains 173 referenced assets and the normal web runtime remains independent of the local Starsector installation.
- Recorded Light MG collision/combat-stat differences and the Dual Flak proximity-fuse difference in `mechanics-dependencies.md`; those gameplay values were not changed in this visual batch.

Still pending for this PD batch:

- Paired original/web static and dynamic captures for all three weapons.
- Flak / Dual Flak proximity-explosion appearance and dense-fire brightness review against the reference runtime.
- Any mechanics reconciliation listed in `mechanics-dependencies.md` requires separate authorization/review and is not implied by visual implementation status.

## 2026-09-14 — W05 beam source/material batch

- Moved real Beam width out of the fire-control ID branch into validated weapon data: Tachyon Lance `25`, Graviton Beam `20`, Tactical Laser `13`.
- Mapped the three `.wpn` material contracts through real Beam entities, including RGBA, `textureScrollSpeed` (`292 / 260 / 72`) and `pixelsPerTexel=5`; source alpha is now preserved by both WebGL and Canvas beam paths.
- Removed the confirmed-source path's secondary core geometry shrink and `1.35×` core UV acceleration. The inspected 128×32 core texture already contains the narrower alpha footprint, so source fringe/core now share submitted width and scroll speed.
- Added renderer-only `beamVisualMode`: sustained beams use combat time for UV phase and same-slot duplicate Beam entities are collapsed only for rendering if they coexist. Beam simulation, damage, flux, collision/contact and lifetime are unchanged.
- Canvas beam fallback now gates impact glow on `isHitting`, matching the WebGL behavior instead of drawing a false endpoint hit glow on an air shot.
- Added `WPN-BEAM-01` (Paragon `WS 003` Tachyon), `WPN-BEAM-02` (`WS 005` Graviton), and `WPN-BEAM-03` (`WS 007` Tactical Laser) as deterministic real-fire scenes. Regression tests exercise actual fire control and BeamSimulation data transport.
- Stored source chargeup/chargedown values as provenance metadata only. The existing Web refire/damage-lifetime behavior is explicitly retained and tracked in `mechanics-dependencies.md` rather than silently rewritten by visual work.
- Added the source Graviton/Tactical hardpoint base/glow assets. The importer was also corrected so only `graphics/fx` beam/shield/contrail textures use repeat wrapping; weapon sprites containing `beam` in their filename now remain clamp-sampled.
- The asset closure now contains 177 referenced assets (173 after W04 plus four W05 hardpoint/glow files).

Still pending for W05 visual acceptance:

- Paired original/web static and dynamic captures for Tachyon Lance, Graviton Beam and Tactical Laser.
- Reference review of outer halo/muzzle/impact intensity and the exact apparent width after texture alpha/blending.
- Tachyon's charge/start/hold/end rhythm and EMP presentation; source timing metadata is not yet a gameplay implementation.
- Any Beam lifecycle/refire/damage reconciliation listed in `mechanics-dependencies.md` remains outside this visual-only batch.

## 2026-09-14 — W06 missile / rocket source-visual batch

- Added validated, renderer-only `launcherSmokeSpec`, `missileEngineVisualSpec`, and `missileTrailSpec` contracts. Nested RGBA, finite-range and `NORMAL/GLOW` blend values are rejected before weapon registration when invalid.
- Split launcher smoke from additive muzzle flash. Source launcher smoke now enters the normal-blend muzzle-particle path using visual RNG, without changing combat RNG, fire timing, projectile kinematics, guidance, collision, damage or fuse behavior.
- Replaced Typhoon-ID-specific engine-flame/glow sizing with per-projectile source visual data in both WebGL and Canvas missile renderers.
- Replaced the hard-coded Typhoon gray contrail with projectile trail data consumed by `MissileGuidanceHandler` and `ContrailEngine`; trail duration/width/color/blend and spawn offset are now weapon-specific.
- Restored Reaper visual data to the compact `14×23` body/sprite, source launcher smoke, source engine geometry and red `[255,100,100,50]` `GLOW` trail with `2s` lifetime. Gameplay guidance/kinematics values were deliberately left unchanged and recorded separately.
- Mapped source body/launcher/engine/trail visuals for Annihilator, Sabot and Atropos without rewriting their existing Web combat mechanics.
- Added real-fire scenes `WPN-MSL-01` Reaper straight flight, `WPN-MSL-02` Atropos guided turn, `WPN-MSL-03` Annihilator repeated launch and `WPN-MSL-04` Sabot current two-stage path. Regression evidence verifies Reaper remains unguided, Atropos changes facing in the actual guidance handler, Annihilator launches repeatedly, and Sabot reaches the current Web `stageTriggered=true` path.
- Corrected `VIS-08`: it is now explicitly a synthetic straight-flight / trail / hit-layer scene and no longer bends an unguided Typhoon/Reaper along a hand-authored curve.
- Re-ran the explicit asset importer after restoring missile and launcher sprites. The asset closure is now 185 referenced assets; normal runtime still resolves bundled `/game-assets` files and does not read the local Starsector installation.

Still pending for W06 visual acceptance:

- Paired original/web static and dynamic captures for Reaper, Atropos, Annihilator and Sabot.
- Reference review of engine-flame length/brightness, launcher smoke density, trail apparent width/fade and explosion/impact layering.
- Gameplay reconciliation for Reaper/Annihilator/Atropos kinematics and Sabot staged/MIRV behavior remains separately scoped in `mechanics-dependencies.md`.

## 2026-09-14 — W07 impact / audio ownership and final weapon-source batch

- Added explicit projectile impact presentation routing for `SHIELD / ARMOR / HULL`. Shield-blocked heavy projectiles and missiles no longer create a hull-style fireball at the shield surface; damage, flux, collision and projectile consumption are unchanged.
- Replaced sustained Beam per-tick/random contact presentation with simulation-time contact state. Contact FX use a `0.08s` Web cadence and contact audio a `0.18s` Web cadence; these are conservative implementation defaults pending paired reference calibration and do not throttle Beam damage.
- Removed the unconditional per-tick Tachyon visual EMP-arc/sound burst. EMP arcs tied to the existing mechanical EMP chance remain intact and retain their explicit `emp_discharge` event.
- Made `CombatFXSystem.spawnEmpArc` visual-only by removing its hidden AudioContext-time `playThrottled` side effect. Weapon/mechanics callers with semantic audio events continue to play their sounds explicitly, isolating event count from wall-clock replay timing.
- Restored Heavy Blaster source visual contract: renderer-only `BALLISTIC_AS_BEAM`, `45×7`, fade `0.3`, scroll `64`, `pixelsPerTexel=5`, RGBA/glow radii, source projectile/mount/glow assets and source muzzle-particle specification. Web collision remains ordinary `BALLISTIC` and the source RAY discrepancy is documented.
- Restored Burst PD source beam material: width `17`, ROUGH texture, scroll `128`, `pixelsPerTexel=5`, source RGBA/mount/glow assets and `burst_pd_fire` audio. Existing Web Beam lifetime/refire/turn-rate mechanics remain unchanged.
- Corrected Heavy Blaster and Burst PD sound mappings to their bundled source files (`heavy_blaster_fire_01.ogg`, `burst_pd_fire_01.ogg`).
- Added `WPN-HBLASTER-01` real armor/hull hit and `WPN-PDBURST-01` real shield-contact scenes. The Heavy Blaster fixture disables only the target Shield instance to prevent enemy AI from converting the armor test into a shield test; Burst PD explicitly uses a deployed real shield.
- The explicit asset importer now closes 195 referenced assets after adding Heavy Blaster/Burst PD weapon, glow, projectile and audio resources.

Still pending for W07 visual acceptance:

- Paired original/web captures for shield energy vs ballistic impacts, armor/hull contacts, sustained Beam contact, Heavy Blaster and Burst PD.
- Reference calibration of spark density, ripple radius, hit glow brightness, explosion layering and the provisional `0.08s / 0.18s` Beam contact presentation cadence.
- Source RAY/turn-rate/timing reconciliation in `mechanics-dependencies.md` remains gameplay-scoped and was not changed by W07.

## 2026-09-14 — W09 lifecycle / telemetry closure

- Added contrail strip/point counts to runtime performance telemetry and report maxima. Trail geometry remains separate from the generic particle count, so a long ribbon cannot be hidden inside one opaque particle total.
- Preserved performance semantics: simulation/visual/render-preparation/draw-submit are CPU-side measurements; GPU time remains populated only by actual `EXT_disjoint_timer_query_webgl2` query results and is `null` when no browser GPU sample exists.
- Added regression coverage proving pause freezes combat/renderer visual state, restart/switch clears weapon FX ownership, detached trails reject new points and expire, and the same Reaper real-fire scene reaches identical state under 30/60/144 Hz render cadence after the same 90 fixed ticks.
- Added a 60-cycle real-scene replay regression. Every `WPN-MSL-01 @ 1.5s` cycle reproduces the same projectile/muzzle/trail counts, and every replay returns projectile/beam/contrail/muzzle/explosion/EMP ownership to zero.
- Headless diagnostics are recorded in `w09-stability-performance.md`: 60 deterministic replay cycles showed no state drift; an autopilot-vs-autopilot run advanced 61.68 simulated seconds before battle termination with transient projectile/beam/particle/trail/explosion queues rather than monotonic trail/explosion growth.

W09 engineering closure does not change weapon visual-acceptance status. Real browser GPU samples and paired original/Web captures remain separate evidence requirements.

## 2026-09-14 — Static-source renderer closure pass

- Switched the active acceptance workflow to static 0.98a-RC8 reference files plus deterministic Web real-fire scenes; original-runtime launch/capture is not required for this pass. Runtime paired visual acceptance remains a future evidence tier rather than being inferred from static data.
- Added `CanvasStripSampling` so Canvas2D follows the same signed horizontal UV phase and `pixelsPerTexel` density as WebGL instead of stretching an entire source texture over every pulse/beam.
- TPC/Autopulse source-authored strips now preserve configured fringe alpha exactly in both renderers. TPC no longer aliases its source hardpoint-only glow into a turret glow field, and Canvas hardpoints now use `hardpointGlowSpriteUrl` when present.
- Neutralized family-only geometry/brightness multipliers for TPC and Autopulse IDs so their authored source fields are not amplified after transport.
- Converted source-authored ordinary BALLISTIC projectiles (Mark IX, Heavy Mauler, HVD, Flak family) to source length/width + RGBA + signed scroll + texel-density strip sampling using bundled `projtrail/projbody`; the enlarged legacy tracer and synthetic projectile-tip glint remain only for projectiles without a static-source strip contract.
- Inspected bundled strip texture alpha footprints: `projtrail.png` is `64×16` with alpha bbox `0,2–63,14`; `projbody.png` is `32×16` with alpha bbox `2,2–30,13`; rough beam fringe/core are `128×32` with their own distinct alpha footprints. Renderer geometry therefore avoids adding a second source-unbacked core/trail narrowing for closed source paths.
- Added regression coverage for Canvas source slicing, including TPC `100/128`, Autopulse `50/128`, 5 px/texel beam wrapping, signed wrap, and 64/32px ballistic source textures.

This pass deliberately does not claim runtime visual parity. Exact perceived brightness, residual fade appearance, impact layering/cadence and animation timing that cannot be uniquely derived from static files stay provisional.

## 2026-09-14 — Final static-source impact / explosion semantic closure

- Split `.proj hitGlowRadius` from fireball rendering. Source hit glow now owns a dedicated short-lived `HitGlowAnimation` rendered with `hit_glow.png`; it never supplies explosion, collision or damage radius.
- Audited the earlier Mark IX radius assumption against `mark9_shot.proj`: Mark IX is correctly `hitGlowRadius=50`; the nearby `38` value belongs to `heavyac_shot.proj` and was not applied to Mark IX.
- Added validated `missileExplosionVisualSpec` from each missile `.proj` top-level fields explicitly marked visual: Reaper `350 / [255,100,100,255]`, Atropos `250 / [255,155,100,255]`, Annihilator `75 / [255,165,0,255]`, Sabot main missile `125 / [255,165,0,255]`.
- Matched the same `.proj` source comment by rendering a white additive core above each configured missile explosion color in WebGL and Canvas. Static evidence establishes the core's presence, but not a unique core radius/falloff curve, so those details remain PROVISIONAL.
- Source missile destruction, PD interception and flare-spoof destruction now consume the destroyed missile's own visual explosion contract. Generic Web fallback remains only for projectiles without a source visual contract.
- Kept `.proj explosionSpec.radius/coreRadius`, proximity-fuse range/radius, projectile collision radius and damage entirely outside the new visual explosion contract; no gameplay statistic was changed.
- Removed source-unbacked Beam `hitGlowRadius` values from Tachyon Lance, Graviton Beam, Tactical Laser and Burst PD. Their `.wpn` files do not define that field; the current width-based endpoint-glow size is retained only as an explicit PROVISIONAL Web fallback.
- Mapped Burst PD `.wpn hitGlowBrightenDuration=0.25` through `WeaponSpec -> Beam -> WebGL/Canvas` as a renderer-only contact-glow brighten envelope. Beam contact/damage cadence and lifetime are unchanged.
- Broke the old `glowRadius || hitGlowRadius` projectile fallback. Heavy Blaster keeps source `glowRadius=35` for in-flight glow and source `hitGlowRadius=75` only for impact glow.
- Added lifecycle ownership for hit glows, source-authored explosion rendering without generic shockwave/smoke/debris additions, validation coverage and real-fire data-propagation assertions. Core regression is now 58 tests.
- Final static-source audit state: all 17 target real-fire weapon scenes are `STATIC_CLOSED` for directly derivable source fields. Original-runtime paired visual acceptance remains intentionally deferred; perceived brightness, exact temporal fade/brighten curves and detailed explosion-particle execution remain PROVISIONAL.

## 2026-09-14 — Independent-audit renderer wiring corrections

- Independent review invalidated the earlier “17/17 renderer mapping closed” claim by reproducing two P2 wiring gaps: Heavy Blaster carried `.proj glowRadius=35` without either renderer consuming it, and Canvas read only legacy `engine.contrails` while source missile ribbons lived in `ContrailEngine`. The prior closure claim is superseded by this correction section.
- Heavy Blaster WebGL and Canvas `BALLISTIC_AS_BEAM` paths now render its source `.proj glowColor=[100,100,255,75] / glowRadius=35` as an independent in-flight halo. This remains separate from `hitGlowRadius=75`. A direct renderer regression changes the radius from `35` to `0` and verifies the 70×70 halo draw disappears in both renderers.
- Canvas missile trails now iterate `engine.contrailEngine.getStrips()`, preserve strip `NORMAL/GLOW` blend, source RGBA alpha, aged width and point alpha, while retaining the old point-contrail path for compatibility. A Reaper regression at `t=1.5s` verifies Canvas emits trail draw calls while `engine.contrails` is empty.
- Rechecked local 0.98a-RC8 `reaper_torp.proj` and `annihilator_rocket.proj`; both define `fadeTime=0.5`. Registry/real Projectile transport now includes that value. It remains visual metadata only and does not extend collision, damage or entity lifetime.
- Targeted regression increased from 58 to 60 tests. `STATIC_CLOSED` is restored only after these renderer-consumption tests; it still does not mean original-runtime paired visual acceptance.
