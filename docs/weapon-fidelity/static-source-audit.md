# Static-Source Weapon Fidelity Audit

This audit records what can be closed without launching the original runtime. The reference is the inspected local 0.98a-RC8 data/assets. `STATIC_CLOSED` means the relevant static fields are mapped through the Web data/render chain; it does **not** mean runtime visual parity. `PROVISIONAL` marks presentation details that static files do not uniquely determine. Gameplay differences remain governed by `mechanics-dependencies.md`.

Current production combat rendering is WebGL2-only. Any Canvas renderer evidence mentioned below is historical evidence from the former fallback and is not part of the current supported runtime.

| Weapon / scene | Static-source state | Web evidence | Still provisional / open |
| --- | --- | --- | --- |
| TPC / `WPN-TPC-01` | STATIC_CLOSED for `100×35`, RGBA, ROUGH, `-256`, ppx `1`, muzzle particles, hardpoint-only glow; no synthetic projectile hit glow | deterministic real fire; production WebGL source strip sampling | fade residual appearance, exact mount flash perception |
| Autopulse / `WPN-AUTOPULSE-01` | STATIC_CLOSED for `50×20`, RGBA, SMOOTH, `-256`, ppx `1`, independent hit glow `50`, muzzle particles | deterministic real fire; independent hit-glow FX channel | hit-glow temporal envelope / perceived brightness |
| Mark IX / `WPN-MARK9-01` | STATIC_CLOSED for strip geometry/material, hit glow `50`, bullet sprite, muzzle offsets/particles/recoil | deterministic alternating-barrel real fire | hit-glow/fade perceived timing |
| Heavy Mauler / `WPN-HEAVYMAULER-01` | STATIC_CLOSED for `50×9`, RGBA, `64`, ppx `5`, hit glow `80`, bullet sprite and muzzle chain | deterministic real fire | hit-glow/fade perceived timing |
| HVD / `WPN-HVEL-01` | STATIC_CLOSED for `120×7.5`, RGBA, `64`, ppx `5`, hit glow `100`, bullet sprite and muzzle chain | deterministic real fire | hit-glow/fade perceived timing |
| Light MG / `WPN-LIGHTMG-01` | STATIC_CLOSED for beam-like style, `35×3.5`, RGBA, `64`, ppx `5`, hit glow `15`, sprite/recoil | deterministic real fire | source RAY collision and combat-stat differences are gameplay-open |
| Flak / `WPN-FLAK-01` | STATIC_CLOSED for projectile strip/material, hit glow `60`, bullet sprite and source muzzle particles | deterministic real fire | airburst runtime layering and source mechanics calibration |
| Dual Flak / `WPN-DUALFLAK-01` | STATIC_CLOSED for projectile strip/material, hit glow `60`, dual offsets and source muzzle particles | deterministic alternating-barrel real fire | source fuse mechanics mismatch; airburst runtime layering |
| Tachyon Lance / `WPN-BEAM-01` | STATIC_CLOSED for width/RGBA/ROUGH/scroll/ppx/resources; source has no target-beam hit radius | real BeamSimulation fire | charge/fire/end rhythm, width-based endpoint-glow fallback and EMP presentation |
| Graviton Beam / `WPN-BEAM-02` | STATIC_CLOSED for width/RGBA/ROUGH/scroll/ppx/resources; source has no hit radius | sustained real beam; render-only duplicate collapse | simulation lifecycle discrepancy and endpoint-glow perception |
| Tactical Laser / `WPN-BEAM-03` | STATIC_CLOSED for width/RGBA/ROUGH/scroll/ppx/resources; source has no hit radius | sustained real beam | simulation lifecycle discrepancy and endpoint-glow perception |
| Reaper / `WPN-MSL-01` | STATIC_CLOSED for compact body, `fadeTime=0.5`, smoke, engine, red GLOW trail and visual explosion `350 / [255,100,100,255]` | actual straight unguided launch; source explosion contract propagates through the production WebGL ribbon path | source kinematics/lifetime; fade residual appearance and detailed explosion-particle runtime execution |
| Atropos / `WPN-MSL-02` | STATIC_CLOSED for body/smoke/engine/GLOW trail and visual explosion `250 / [255,155,100,255]` | actual guided turn against offset target | guidance/kinematics; detailed explosion-particle runtime execution |
| Annihilator / `WPN-MSL-03` | STATIC_CLOSED for body, `fadeTime=0.5`, launcher/smoke/engine/NORMAL trail and visual explosion `75 / [255,165,0,255]` | repeated real launch and alternating offsets | cadence/kinematics; fade residual appearance and detailed runtime explosion perception |
| Sabot / `WPN-MSL-04` | STATIC_CLOSED for main missile body/smoke/engine/NORMAL trail and visual explosion `125 / [255,165,0,255]` | real current Web path reaches staged trigger | source MIRV/staged mechanics; child-warhead runtime appearance |
| Heavy Blaster / `WPN-HBLASTER-01` | STATIC_CLOSED for beam-like `45×7`, RGBA, scroll/ppx, source `.proj` in-flight glow `35`, independent hit glow `75`, mount/muzzle/audio resources | real armor/hull hit plus direct WebGL renderer regression: changing `glowRadius 35 -> 0` removes the 70×70 in-flight halo draw | source RAY collision/turn-rate differences; exact glow/bloom perception and hit-glow temporal perception |
| Burst PD / `WPN-PDBURST-01` | STATIC_CLOSED for width/RGBA/ROUGH/scroll/ppx, resources/audio and brighten duration `0.25`; source has no hit radius | real BeamSimulation shield contact | source timing/turn-rate differences; width-based contact size and perceived brighten curve |

## Renderer invariants closed by static evidence

- Source-authored pulse, beam and ballistic strips preserve the fourth RGBA channel and signed scroll direction.
- The production WebGL strip paths consume `pixelsPerTexel` and preserve source texel density without stretching one complete texture to the requested world length.
- Where the source supplies one length/width/scroll contract for fringe and core, both layers use that submitted geometry. The source texture alpha footprint provides the internal visible narrowing.
- Source-authored ordinary ballistic projectiles keep their `bulletSprite`; `projtrail/projbody` use source strip geometry, while the legacy enlarged tracer and synthetic tip glint are restricted to non-source fallback projectiles.
- Projectile `.proj glowRadius/glowColor` are consumed as an independent in-flight halo by WebGL; this is distinct from weapon-animation `.wpn glowColor` and from impact-only `.proj hitGlowRadius`.
- Persistent missile trails are owned by `ContrailEngine` and consumed by the production WebGL ribbon renderer.
- `.proj hitGlowRadius` owns an independent `hit_glow.png` layer and never creates a seven-frame fireball.
- Missile top-level visual `explosionRadius/explosionColor` own source-authored explosion size/color; the source comment also requires a white additive core above that color, rendered by WebGL. Exact white-core size/falloff remains `PROVISIONAL`; `explosionSpec.radius/coreRadius` and fuse/damage radii remain outside the visual contract.
- Source-authored missile explosions do not inherit generic Web shockwave/smoke/debris multipliers. Detailed source particle execution that static JSON cannot uniquely define remains PROVISIONAL.
- Burst PD consumes source `hitGlowBrightenDuration=0.25`; target beam files without a source hit radius use only the explicitly PROVISIONAL width-based Web endpoint fallback.
- Static visual fields never feed collision radius, damage radius, damage, refire, speed, guidance or projectile lifetime.

## Evidence boundary

Static files cannot uniquely establish perceived bloom intensity, monitor-space brightness, temporal persistence after entity removal, exact hit/explosion layering, or the feel of charge/loop/chargedown animation. Those remain `PROVISIONAL` until runtime reference evidence is intentionally reintroduced. Tests/builds prove data flow and deterministic behavior, not visual parity.
