# Visual Fidelity Audit

Date: 2026-09-16

The current Web renderer is not visually equivalent to the original game.
Earlier M3/M4 feature, screenshot and stability checks do not establish that
equivalence. Existing weapon static-source closure also does not validate the
whole combat presentation.

This is a chronological audit. The latest **Armor-cell damage and breakup coverage**
section supersedes older fixed-48px impact-stamp, 36-mark-cap, and 1.6-second
cooling descriptions; those were earlier implementations, not current behavior.

## User-approved typography exception

The user explicitly rejected the original game's bitmap fonts as unattractive
on 2026-09-16. Do not restore victor10/victor14 to pursue literal parity.
Combat HUD text intentionally uses a readable local system stack (Segoe UI,
Microsoft YaHei UI, Microsoft YaHei, sans-serif), normal weight, tabular numerals,
and browser antialiasing. Row spacing may differ to keep that text readable.
This exception changes typography acceptance, not the remaining visual scope.

## First Correction: Palette

Read-only reference: the local 0.98a-RC8 installation. This installation has not
been independently verified as an unmodified official distribution.

| Surface | Previous Web RGB | Reference RGB | Source |
| --- | --- | --- | --- |
| Low-tech shield interior | 66, 142, 255 | 255, 125, 125 | data/config/hull_styles.json |
| High-tech shield interior | 92, 118, 255 | 125, 125, 255 | data/config/hull_styles.json |
| Fortress shield interior | 255, 188, 64 | 255, 100, 255 | data/shipsystems/fortressshield.system |
| Shield ring | Technology-specific cyan/purple/off-white | 255, 255, 255 | Both files above |
| Low-tech engine flame | 255, 107.1, 22.95 | 255, 125, 25 | data/config/engine_styles.json |
| Midline engine flame | 255, 214.2, 96.9 | 255, 145, 75 | data/config/engine_styles.json |
| High-tech engine flame | 76.5, 173.4, 255 | 100, 165, 255 | data/config/engine_styles.json |

The profiles now use those reference RGB values. Onslaught, Paragon and Doom
also use neutral hull tint so their authored sprite colors are preserved.
The added palette test file was removed at the user's request. Palette changes
were checked against the reference configuration; Onslaught and Paragon shield
colors were also inspected in the browser. Typecheck and production build passed.

## Refactor Implemented

- Built-in data is generated from 39 local source files: five hulls and seventeen
  weapons, with SHA-256 provenance. Curated equipment and runtime sound/fuse/MIRV
  adapters are separate from imported data. Registration no longer contains
  hundreds of lines of duplicate ship/weapon definitions.
- Import parsing supports bare enums, nested arrays/objects, source numeric
  literals, comments and quoted content without regex substitutions in strings.
  Shield centers, hull sizes, bay counts, zero arcs, projectile data and source
  weapon cadence are preserved.
- Combat RNG and cosmetic scorch selection are isolated. Main-ship collections
  feed AI, collisions, weapons, mines, rendering and status updates. Orders,
  autopilot, target brackets and lead indicators can retarget reinforcements.
  Battle settlement waits for the surviving main ships on each side.
- Flight decks are driven by bay/wing configuration and mother-ship ownership.
  No-bay hulls have no automatic craft. Enemy bombers target the opposite side;
  destroyed carriers cannot repair/rearm or rebuild. HUD counts individual wings.
- Required texture preparation includes actual combatants, equipment, replacement
  craft and effect materials. Switching and reinforcement deployment pass through
  the ready gate. React detach releases presentation without disposing the retained
  simulation. Dynamic damage textures are reclaimed when their owner disappears.
- Scheduler reset inside a fixed tick cannot create a negative backlog. Repeated
  keyboard events do not retrigger toggle commands; modal/help input is blocked and
  combat pauses. HUD glow and fractional text scaling were removed, clipped names
  fixed, and lab controls constrained above the console at desktop/narrow sizes.

## Visual Corrections

- Hulk FRONT/REAR rendering now samples complementary half-height UV ranges,
  preserving the sprite pivot instead of drawing two complete copies.
- Shield inner fans use source colors/RGBA modulation and fixed counter-rotation;
  the rim uses source `graphics/hud/line8x8.png`, inward width and source-over
  composition. Normal width is 5 world units (3 fighter, 4 frigate); fortress
  interpolates color and thickness using the continuous system effect level.
  Source-sized 64/128/256 shield textures and radius-dependent wobble are used.
  Removed unsupported fortress brightness boosts and phase-jumping rotation rates.
- Environment background now retains its original image aspect ratio and neutral
  tint. Background URL and optional generated stars are configuration, with extra
  stars disabled by default. This is still a sandbox environment, not a matched
  capture of the original combat scene.
- Shield geometry now uses the source segment count (20-unit / 5-degree spacing),
  two additive triangle fans, endpoint tapers and a source-over inward rim strip.
  The per-segment 100-point hit meter starts at 55% brightness, is reduced by
  post-mitigation shield flux within a 50-unit neighborhood and recovers at
  20 points/second. Segment state follows the shield, survives renderer recreation
  and is no longer truncated to four world-space, short-lived ripples. Removed
  the duplicate generic two-sprite contact glow; weapon-specific contact FX remain.
- Shield shutdown retains its arc and fades for 0.35 seconds rather than folding
  the arc closed. Texture rotation is relative to the shield facing, as in the
  source fan UVs; a full omni shield retains the source ten-degree overlap/taper.
- Standard engine plumes now use the source layered geometry, texture scrolling,
  spread and flare rules in ShipEngineRenderer rather than the former custom
  four-layer glow. Contrails and exact final appearance remain separate work.
- Phase visuals use the original coil masks and seven-pose trail; cooldown does
  not keep the active-phase hard-flux jitter. VIS-13 exercises the real lifecycle.
- Explosions use fixed-texture independent particles rather than treating seven
  textures as animation frames. Ship flash/cloud sizing and breakup probability
  are source-backed; the split geometry/lifecycle remains simplified.

## Current development policy

The user requested removal of all project test files and no further manual asset
hash/size verification. The test suite and npm test command have been removed.
Do not recreate test files. Use typechecking, lint, builds and direct runtime
inspection for subsequent changes. Historical test counts below are not a
current acceptance gate, and removing tests does not establish visual parity.

The continued pass also fixed VIS-12 shield state: scripted frames no longer
force shutdown every tick, and both shields advance their real deployment/fade
timers. Repeated seeks now reproduce the same shield state.

## Current continuation checks

- Typecheck and lint pass after the segmented-shield change. No tests were added.
- A browser WebGL loss/restore preserved the engine, paused state and exact
  segment-array identity/values. The renderer returned ready with no GL error.
- Browser rendering reached ready with no GL error. Onslaught has 38 segment
  vertices; an inline runtime observation showed 0.55 resting brightness, five
  affected segments after a 100-flux hit, 0.775 peak brightness after 2.5 seconds
  and complete recovery after five seconds. VIS-04 uses the actual hit/recovery
  state instead of rebuilding a synthetic ripple list on every frame.
- Earlier dev/production pages sometimes ran near one RAF/sec, even with the
  renderer temporarily replaced by a no-op. A blank tab ran near 125 FPS;
  explicitly bringing the unchanged game tab to the front restored similar
  throughput. A focused production sample recorded 368 frames / 3.0358 sec
  (about 121 FPS), CPU median 1.4 ms / p95 3.2 ms, and GPU median 0.094 ms /
  p95 3.845 ms. Hiding HUD did not materially change throughput. Activation or
  browser throttling is implicated, not proven as the exact cause; this is not
  a universal performance guarantee. All observation wrappers were removed.
- FixedTimestepScheduler now measures FPS/TPS against uncapped wall time, while
  keeping the existing 100 ms simulation catch-up limit. Inline timestamp
  observations report 1/30/60/144 FPS at those input rates, with 6/60/60/60 TPS;
  resync clears the sample window without clearing lifetime counters. This fix
  is included in the latest successful production build.
- Native, same-scene comparison captures are still missing; rendered screenshots
  and source alignment alone do not establish original-game parity.

## Historical verification (before test removal)

No test files were added or edited for this refactor. Pre-existing modifications
to `tests/core.test.ts` were left intact.

- Typecheck, production build and lint passed; lint has no warnings.
- Asset importer completed with 220 referenced assets. Runtime no longer needs
  the original installation after import. Import output is reproducible.
- Existing checks: **131 passed, 5 failed out of 136**. These failures remain
  visible, not suppressed or skipped. They encode superseded sandbox assumptions:
  Mark IX muzzle particles still present at 1.18s; fortress brightness greater
  than base; Broadsword damage computed with old armor; two cases accessing
  default Onslaught bombers when it has no bays.
- Inline, non-file probes verified RNG isolation; no-bay/explicit-wing deployment;
  blocked bomber launch, rearm and dead-carrier stop; enemy bomber targeting;
  replacement queues; reinforcement survival and autopilot retargeting; parser
  string/enum handling; texture closure; reentrant clock reset. Mark IX emitted
  1/2/3/4 shots with visible muzzle particles at .75/.85/.95/1.05s, and four shots
  with expired muzzle particles at 1.18s. Lab capture buttons use the firing times.
- Browser: cold VIS-12, real combat, factory switch to Paragon, modal pause,
  presentation detach/reattach preserving engine identity, rapid ship switch and
  WebGL loss/restore were exercised. Restored renderer reported ready, zero
  pending textures and one recreation. Desktop (1440x900) and narrow (390x844)
  screenshots were inspected; temporary viewport/debug state was reset.
- GPU probe: no GL error, nonconstant canvas pixels, fortress uniforms interpolate
  through five levels without rotation jumps. Four repeated damage-overlay
  rebuilds held resident textures at 119, then released back to 117. Fragment
  draw calls use half-height 192 and UV [0,.5] / [.5,1] for Onslaught.

## Still Not Original Parity

- Common shield geometry, hit meters and deployment timing are source-backed.
  Special-system transient modulation and the complete combined weapon-impact
  composition still need a matched source/runtime comparison. Existing parity
  comments elsewhere in the code are not acceptance evidence.
- The standard engine path is source-backed, but matched thrust/turning captures
  and contrail comparison are still needed to validate final flame appearance.
- Default combat background and small-cloud geometry/compositing are now
  source-backed (details below). Region placement, seeded random realization
  and disabled optional stars remain sandbox policy. Alternate mission/campaign
  backgrounds, original starfield, non-small/charged clouds and matched capture
  composition are still open.
- Standard venting now follows the source animation and timing path (below),
  but venting, ship explosions, phase effects and HUD typography/layout still
  need matched source/runtime comparison. Destruction now respects hull breakup probability,
  but still uses a simplified two-part split when breakup occurs; the original
  disable/breakup lifecycle has not been ported.
- Weapon static-data tests do not validate perceived brightness, animation
  cadence or final impact composition.
- AI supports capability-based movement and retargeting but is not the original
  fleet planner. Curated loadouts, armor-grid sizes and collision adapters remain
  explicit deviations. Only a subset of original content is supported.

Next acceptance step: compare the same hull, environment, zoom, facing and
event time, first at rest, then shield deployment, thrust, single shots and
impacts. No matched original captures were obtained in this pass, so the remaining
visual work is open. Do not label this refactor a completed remake or full parity.

## Combat environment correction

- Traced settings.json backgrounds.defaultSpaceBackground through the actual
  combat/CombatEngine.java constructor, setDefaultBackground and renderBG;
  default combat uses graphics/backgrounds/background4.jpg, not background1.
  CombatState uses an unzoomed background projection. The Web pass now uses a
  fixed seeded crop, native image scale with cover-only enlargement, and no
  fabricated camera parallax or world-zoom scaling. Three direct render probes
  at different cameras and 0.5/1/2 zoom produced identical screen-space bounds.
- terrain/A.java renderBelow and Cloud.java render use source-over white
  modulation and one unrotated tile from a 4x4 atlas, at 312.5 world units on a
  125-unit grid with smallClouds=true. Replaced the old whole-atlas amber/blue
  blobs, multiplied tints, rotated additive duplicates and foreground overlay.
  The default combat map uses graphics/terrain/nebula.png. Normal clouds are
  drawn once below ships, not across their silhouettes.
- Ported A.spawnCloud radial thinning, >=0.25 thickness, and terrain/B.java's
  recursive midpoint-displacement field. The three region centers/radii are
  still the sandbox map, and seeded random draws do not reproduce Java's random
  realization. Two isolated generators with seed 1337 produced identical 108
  cells with valid tile coordinates, thickness and atlas indices.
- settings.json nebulaSpeedFighter/Frigate/Destroyer/Cruiser/Capital are all 1.
  Removed the unsupported 25% speed/thrust penalty, rocket drag and random
  contact particles. The source's small-cloud advance path does not run its
  legacy charge/flux effects; those effects were not claimed as ported.
- New background/nebula assets were copied without hash or file-size checks.
  Manifest hash/bytes fields are optional provenance, not runtime requirements;
  path, duplicate and explicit sampler validation remain intact.
- Typecheck, lint and production build passed without creating tests. Browser
  cold loading returned ready, with both ship terrain multipliers at 1. Direct
  draw observation confirmed 312.5-unit tiles, white modulation and 0.25 UV spans,
  with no GL error. A context-loss/restore run preserved engine/cloud-array
  identity, cloud values and paused state; 114 resident textures, zero pending
  uploads and one recreation. An initial probe attempted restoration during the
  loss-event microtask (browser rejected it); rerunning across separate browser
  tasks succeeded without a code change. No instrumentation remains attached.
- Inspected artifacts/combat-nebula-atlas.png. This is a Web capture only, not a
  matched original-game comparison, and therefore does not close visual parity.

## Venting and shared visual-random correction

- Replaced the old start pulse, paired flashing rings, family scale multipliers,
  perimeter-normal emitters and extra vent EMP arcs. Traced the actual
  renderers/ventingAnimation class, renderers/float.java, Ship.java render order,
  combat/ai/OO0O targeting radius, Fader/FaderUtil and IntervalUtil.
- Standard venting advances at 1.24 times the ship step, with 0.3/0.6-second
  internal brightness/extent faders. Capital ships have 18 emitters, other
  non-fighters (including cruisers) 12, and fighters 4. Intervals reroll between
  0.1 and 0.2 internal seconds rather than creating an immediate onset burst.
- Emission anchors and halo radii use the source's offset sprite/collision
  ellipse + 10, not the authored hull perimeter. Onslaught cardinal radii are
  254/154/150/154, Paragon 184/174/200/176, and Doom 143/110/115/110.
  Particle motion includes full ship velocity, bounded rotational tangential
  velocity, source braking, linear size growth and the source lifetime/faders.
- A single additive radial band uses repeated texture sampling, source segment
  density, texture scroll and 60% fringe-to-core color interpolation. Onslaught
  at full fade produces inner/outer extents 69.05/276.2, RGB 203/153/215,
  alpha 0.6 and 420 vertices (35 segments). The whole animation is drawn after
  the hull and weapons, before shields. Both atlas plume layers use identical
  dimensions; their source alpha factors differ. Fighters do not draw a halo.
- Ribbon shading no longer turns dark sampled RGB into white, or defaults to a
  1.5 alpha-density boost. GL_MODULATE uses sampled RGB and normal alpha density.
- Runtime draw inspection exposed negative plume atlas UVs. Root cause:
  VisualRandom.sample's final XOR returned a signed integer divided by 2^32.
  The final value is now coerced unsigned, restoring sample to [0,1) and signed
  to [-1,1). An inline, non-file check exercised 86,016 seed/channel/index
  combinations, all in range and reproducible. This changes seeded visual
  realizations across the renderer; earlier screenshots are not a stable
  same-seed baseline across this fix. Combat SimulationRandom is unchanged.
- VIS-09 now advances the actual FluxTracker instead of writing a synthetic
  three-second flux envelope. Its 14-second timeline covers the supported
  built-in hulls. At 0.5s Onslaught is not yet venting, at 2s it holds 12180
  flux with 10.15s remaining, and at 13s it has zero flux and no vent particles.
  Repeated same-seed 2s rebuilds produced identical particle states; Doom has
  12 emitters. Isolated startup checks showed no first-frame particles and
  internal fades of 0.06889/0.03444 after one 60Hz step; stop/restart clears
  particles without replaying a fabricated flash. Atlas columns/rows and UVs
  were checked after the random fix and are valid.
- Context loss/restore preserved the vent renderer state, particle-array
  identity/values, both faders, scroll time and paused state. Restored rendering
  was ready with zero pending uploads and no GL error. Inspected the updated
  Web-only capture artifacts/vent-source-onslaught.png; it is not an original
  matched capture and does not prove complete visual parity.
- A broader browser check found six late debris uploads on the first Heavy
  Blaster impact. Moved all eight debris variants into shared CombatFXAssets
  used by the simulation and readiness closure. A fresh routed request check
  saw all eight requested before presentation was ready; the impact scene then
  rendered 30 debris entities with zero pending uploads and no GL error. All
  temporary routes, draw wrappers and restore-observation globals were removed.
- Typecheck, lint and production build passed. No test files were created and
  no file hash or file-size verification was performed. Phase and combined
  combat views also reached ready with finite ship states and no GL error.

## HUD meters, affiliation, and readable text

- Traced player console class/new/_return, floating labels renderers/A/_null,
  renderers/A/I, prototype/Utils.cfr_renamed_8, O0OO and settings.json. Friendly
  text is RGB 155/255/0 and hostile text 255/100/0; both were previously green.
- Player meters now use 80x7 pixels and floating meters 60x5, with a solid fill,
  a one-pixel end cap, and two 3x1 hard-flux ticks. Removed the invented framed
  background. Main row offsets are 0 (label), 48 (meter), 128 (104-wide number).
  Numeric hull/flux values truncate, matching the source console. Native glyph
  row spacing is intentionally not retained after the user's font decision.
- Added the console's white additive flux warning for flux >90%, overload, or
  venting. CombatHudVisuals owns the 0.25-second in/out Fader and endpoint holds
  on fixed visual steps, not CSS wall time. Stopping completes the current fade;
  switching/restarting/rebuilding resets it. Only fill/cap brighten, not ticks.
  An inline state probe covered threshold, endpoint holds, zero-dt hold, stop
  and restart. At VIS-09/2s the browser reported brightness 0.60000002, fill
  RGB 255/255/153 and green hard-flux ticks; brightness held while paused.
- The original victor14/victor10 descriptors and atlases were briefly connected
  and inspected, then removed at the user's request, together with the bitmap
  renderer, font-preparation code, manifest entries, and superseded captures.
  Current builds request no original fonts and render no bitmap-text nodes.
- Text now uses local system glyphs: 12px/15px console text, 11px/13px floating
  text. It has accessible real DOM text and no per-string raster/mask cache.
  Autofire uses an accessible switch and CSS indicator instead of unsupported
  bitmap square glyphs. Clicking group 3's switch toggled autofire and back
  without changing the selected weapon group.
- Typecheck, lint, and production build passed. Inspected desktop (1440x900) and
  narrow (390x844) readable-font captures. Narrow console is 320px wide with no
  text outside the viewport. Production reached ready with no GL error.
  No project test files or hash/file-size verification were added.
- Remaining HUD work includes console/paperdoll positioning, weapon-group
  composition, status-icon presentation and native floating-label placement/
  faders. The new Web captures are not matched native-game comparisons and do
  not establish full visual parity. Font parity itself is no longer required.

## Weapon-group console composition and controls

- Traced renderers/A/F, its weapon-group widget (*_cfr_45), oOOO, G, O0OO and
  class/new/_return's setShip/pivot calculation. The source lists distinct
  weapons as separate two-line entries, hides empty groups, and supports seven
  groups. The prior Web console counted every mount under the first weapon's
  name/damage type, and still restricted validation/input to five groups.
- WeaponHudModel now groups by spec ID in stable declared-slot order, removes
  duplicate slot references from counts, and skips empty groups. This preserves
  identity rather than copying Java HashMap order or grouping colliding shortened
  display names. WeaponGroupConsole renders a size-scaled icon, count/name,
  damage type, mode control and autofire indicator for the actual entries.
- Desktop groups step left by half the previous group height; the horizontal
  pivot uses the source formula and minimum 50px content height. At the retained
  system-font line height of 15px, a normal entry is 30px tall and successive
  Onslaught group x positions were 235.5/220.5/205.5/190.5/175.5. Group numbers,
  the 26px icon column and 3px icon/text gap follow native dimensions. Static
  selection/autofire opacity now follows source endpoints rather than turning
  the selected group white; transition faders and override glow remain open.
- Autofire and mode buttons now use declared group.index, not the array index.
  Mod validation permits 0–6 and keyboard input handles 1–7 / Ctrl+1–7. Browser
  observation with only visible groups 5 and 7 confirmed group 5's buttons alter
  only that group, key 7 selects array index 2, and Ctrl+7 toggles group 7. The
  initial inline validation attempt rejected an existing ship ID; repeating with
  the existing-ID option verified group 7 accepted and group 8 rejected.
- Removed the four-mount status cap. An eight-mount mixed group showed four
  distinct types with correct per-type counts and all eight individual rows;
  a disabled mount showed its real 7s remaining timer rather than a ready glyph.
  Per-type ammo totals remain in tooltips, not an extra unsupported group column.
  All temporary groups, selected index and disabled state were restored.
- At wide desktop sizes the mount list is 13px right of the 340px group panel,
  bottom-aligned, as in oOOO; it no longer pushes the entire console upward. At
  1440x900 both blocks ended at y897. The status text still uses Web cooldown/
  ammo presentation instead of G's native charge/reload indicator and range
  highlight, so it is not claimed to be a complete port of that widget.
- Inspected updated 1440x900 and 390x844 Web captures. Narrow groups are straight
  rather than diagonal, with mount status below, and no controls outside the
  viewport. These are responsive Web policies, not native-screen evidence.
  System fonts remain in place. Typecheck, lint and production build passed;
  no test files, hash verification or file-size verification were introduced.
- Full native HUD comparison remains open: paperdoll size/placement, carrier
  presentation, status effects, group and selection faders, weapon charge/reload
  display, floating-label placement and matched original captures still need work.
- Final production spot checks also loaded Paragon and Doom in VIS-11 at 0.5s:
  both showed their four configured groups, all selected mounts, no offscreen
  weapon controls, no original-font requests and no GL error. Returned the
  preview to Onslaught VIS-09 at 2s, paused and ready.

## Disabled hull retention and settlement tail

- Traced Ship.java death handling (4334 onward), hulk selection (4441 onward),
  makeLookDisabled/fadeToColor, advance's hulk fading (1819/1936), splitShip's
  retained modules/decals, and entities/H's breakup interval. Normal ships retain
  a hulk regardless of radius; fighters have a 0.5 retention chance. The prior
  radius >80 gate incorrectly made all smaller hulls disappear.
- HulkVisuals now creates an intact retained hull with the dead Ship instance,
  its mounted weapons, and existing damage marks. Death cancels active venting,
  clears control input, lowers shields and disables the ship system. H's interval
  is represented as 0.165–0.33 seconds for the existing two-piece adapter. There
  is no immediate arbitrary position jump or 20% velocity loss.
- Both rectangular pieces reproduce the unsplit source pose at the split instant.
  Their centers/pivots are compensated; mounts are assigned once by their source
  sprite position, and turret facing remains relative to the rotating piece.
  Both inherit angular/linear velocity; the clone receives the source 0.5-unit
  outward impulse. The rectangles, approximate collision circles, and lack of
  native piece collision/physics are still limitations, not native tessellation.
- Retained hulls, weapon sprites and permanent damage decals render together.
  Native disabled color is neutral RGB 120/120/120 (a 0.5s transition for intact
  hulls), not the old brown tint plus whole-sprite lifetime transparency. Scorch
  heat cools once per source ship per tick, even when two pieces share it. Engine,
  weapon-charge and vent effects are not drawn on wrecks. The generic random
  6-per-second smoke/spark emitter was removed; source damage-bound emitters still
  need a proper port rather than this unrelated substitute.
- Normal hulls remain opaque rather than decaying across an invented 180-second
  lifetime. Fighters wait 10s then fade over 0.5s. Native offscreen/FOW reclamation
  (outside the viewport margin for >30s, with damage/visibility conditions),
  station exclusions, and damaged-hulk overkill destruction remain unimplemented;
  non-fighter wrecks currently persist until scene reset. Large/long battles need
  that native reclamation policy before this lifecycle can be considered complete.
- FighterSystem's separate fighter/bomber death paths now call the common
  destruction handler, so they use the source-backed ship explosion and hulk
  policy once, rather than their previous fixed 42/50-radius bursts. Generic
  debris counts/colors and camera shake still remain Web policies.
- The Web result modal previously paused the session within a 150ms UI poll,
  freezing the death explosion near its beginning. It now waits for outstanding
  ship explosions. Statistics are finalized immediately; subsequent fixed ticks
  advance only FX/contrails/shake until the modal appears. This settlement-tail
  policy is a Web UX adaptation, not a claim about native combat exit behavior.
- Memory-only browser observations on the production build:
  - Intact Onslaught retained 13 mounts and 3 scorch marks; heat reached zero.
    At age 184s its hull draw still had alpha 1 and RGB multiplier 120/255.
  - Forced breakup delay was 0.2666845s; hull stayed whole at 0.1s and split on
    the 0.283333s fixed tick. Reconstructed origins agreed within floating-point
    rounding. Mount ownership was 5 front + 8 rear; both UV halves had alpha 1.
  - A temporary radius-30 FRIGATE fixture retained its hull. A fighter with the
    non-retention random branch produced no hulk. These were in-memory fixtures,
    not changes to imported hull data or project test files.
  - The actual fighter and bomber update paths each produced one ship explosion,
    one retained hulk on the retained random branch, and exactly two total losses.
    Both hulls were present at 9.7s, fading at 10.2167s, and removed after 10.5s.
  - At 1s after the final kill the result existed but the modal did not; explosion
    life was still 1.25s. At 2.2667s the effect had finished and the modal appeared.
    Combat time/statistics stayed at the original 2s while visual time advanced.
  - A context-loss/restore cycle retained a dead fighter source already removed
    from engine.ships. The readiness closure includes hulk weapons as well as
    hulls. Restore reached ready with no GL error; clearing hulks reclaimed three
    dynamic damage textures (126 to 123 resident textures, no new uploads).
- Inspected current 1440x900 captures hud-retained-hulk.png and hud-split-hulk.png.
  These are Web observations, not matched native-game captures. Typecheck, lint
  and production build passed. No test files were created, no original bitmap
  fonts were restored, and no file hash or file-size verification was performed.
- Full visual-fidelity acceptance remains open: irregular/multi-piece breakup,
  native hulk collisions/damage/reclamation, remaining HUD work, combined impacts,
  alternate environments and matched original captures are not resolved here.

## Irregular polygon breakup and source piece counts

This section supersedes the rectangular two-piece geometry described above.
It does not supersede the outstanding native hulk-physics, damage and cleanup gaps.

- ShipHullSpreadsheetLoader reads minPieces/maxPieces from ship_data.csv with
  defaults 2/2. The actual installed rows specify 2–4 for Onslaught and Paragon,
  2–3 for Doom, and blank/default 2–2 for the two fighters. Added these fields to
  ShipSpec, the source loader and the five generated hull records. Source-loader
  reads confirmed the three main hull ranges without hash or file-size checks.
  Mod validation rejects non-finite/reversed ranges and applies a Web input cap
  of 64 pieces; that defensive cap is not a native engine limit.
- Piece counts follow StarSystemGenerator.getNormalRandom: Gaussian *0.2 +0.5,
  clamped to [0,1], mapped across the min/max range and rounded. A memory-only
  10,000-draw sample for 2–4 yielded 1124/7838/1038 counts for 2/3/4 pieces. The
  Web deterministic RNG/Box–Muller sampler is not Java Random's bitstream.
- HulkGeometry ports the relevant Tesselator search and seam construction:
  perimeter subdivision at 20 units, 8 random attempts for cruiser/capital and
  12 for smaller hulls, four cardinal/diagonal fallbacks with +/-15-degree jitter,
  relaxing perimeter-balance limits, duplicate/near-vertex avoidance, and the
  tapered 20-unit interior clearance check. Fracture segments use a 5–10-unit
  hull-scaled spacing with at least seven segments. Their shared displacement
  uses the source normalized midpoint noise with persistence 0.7 and +/-10-unit
  hull-scaled offsets. No horizontal/vertical rectangular fallback remains.
- Paragon's native outline includes a doubled bridge into its interior hole.
  Initially treating it as an ordinary simple polygon rejected every cut; that
  was corrected to accept this weakly-simple representation while rejecting real
  crossing edges. Polygon occupancy and projectile boundaries preserve the hole;
  the artificial doubled bridge is not treated as a separate physical wall.
- Both child polygons share the same noisy cut. Exterior visual-bound offsets
  follow the source 0–10-unit outward rule on first split and inherit the prior
  collision-to-visual offsets on subsequent cuts. New seam vertices do not receive
  that exterior expansion. Non-degenerate/non-crossing guards reject invalid Web
  cuts rather than fabricating a straight split. Floating-point details and these
  guards are not claimed to reproduce every native random outcome exactly.
- One shared H-style sequence advances each destroyed ship's pieces. The interval
  range is [0.5,1] * 0.33/(pieceCount-1); each event cuts the largest bounding-area
  piece, rather than independently splitting every child. A forced-four-piece
  trace split at 0.100/0.166667/0.250s, always selected the largest piece, and then
  stopped. Native-style failed cut attempts consume their attempt; they do not
  force the requested number with invented geometry.
- Piece centers use Tesselator's vertex mean snapped relative to the parent on
  the source armor spacing clamp(spriteHeight/10,15,30). Source-space polygons
  and compensated render origins prevent a split-frame jump. Mounts are assigned
  once by containment; hull radii derive from polygon bounds plus 20, no longer
  the old 0.55/0.5 constants. Hull-to-hull piece collision, mass redistribution and
  secondary damage/overkill are still not a full native physics implementation.
- HulkSpriteMask clips the actual hull image to each immutable visual polygon.
  Per-piece damage canvases use the same mask; weapon ownership follows the
  collision polygon and the retained turret pose. Cached hull/damage textures are
  reused while unchanged, rebuilt after context restore and reclaimed when the
  corresponding pieces/glows disappear. Numeric visual IDs avoid cache collisions
  between pieces without consuming gameplay RNG.
- Hulk projectile collision now uses swept centerline-to-polygon intersection,
  selecting the earliest hit and putting impact FX at that point. It no longer
  blocks every shot inside a circular proxy. In the browser, a segment inside
  Paragon's hole and one outside the hull but inside its old radius both passed;
  a -300 to +300 horizontal sweep hit x=-165.1471 with one impact dispatch. This
  is not a claim that all projectile-radius, beam or rigid-body collision rules
  have reached native parity.
- Final memory-only geometry observations: 200 seeds per main hull, 75 independent
  occupancy samples per seed (45,000 total), with no area-conservation, invalid-
  polygon, reconstructed-origin, duplicate-slot or occupancy-coverage failures.
  Requested counts were reached in 200/200 Onslaught, 198/200 Paragon and 188/200
  Doom cases; the other 14 exhausted their allowed cut attempts and retained fewer
  pieces, rather than returning fake geometry. These measurements establish Web
  invariants, not identical native distributions or matched native appearances.
- Inspected final 1440x900 production captures hulk-irregular-onslaught.png,
  hulk-irregular-paragon.png and hulk-irregular-doom.png. In-memory forced counts
  within the source ranges produced 3/4/3 pieces retaining 13/8/11 equipped mounts.
  Paragon's central hole remained open. All three views had no GL error or pending
  uploads. Twelve unchanged renders added no uploads. A final Doom context restore
  reached ready with all three pieces, stayed at 121 uploads across twelve renders,
  and clearing those pieces reclaimed six hull/base-damage textures (121 to 115
  residents) without additional uploads. A separate four-piece hot-damage case
  reclaimed four glow and then eight hull/base textures after cooling/clear.
- Typecheck, lint and production build passed. No test files were added, original
  bitmap fonts were not restored, and no file hash/file-size verification ran.
  The source import script that computes provenance was not executed.
- Full acceptance is still open: native breakup armor destruction and cut-edge
  damage, piece mass/contact dynamics, hulk overkill destruction, source smoke/
  secondary effects, offscreen/FOW cleanup, remaining HUD/weapon-impact/environment
  work and matched original-game captures remain outstanding.


## Armor-cell damage and breakup coverage

- Read-only references: combat/entities/ship/new.java (grid and per-cell listener),
  renderers/damage/String.java, OOoO.java and void.java (decals/heat/flicker),
  combat/entities/H.java and Ship.splitShip (breakup armor and copy coverage).
  Visual inspection of the local packed atlas and individual tiles established
  bottom-up UV row mapping: burns 25%, cracks 56.25%, holes 18.75%. The two
  independent 75% thresholds replace the earlier approximate 22/56/22 weighting.
- Combat grids now use square clamp(spriteHeight/10,15,30) cells, pivot-aligned
  ceil-rounded extents and two support cells on every side. Main hull layouts in
  Web local X/Y order are Onslaught 18x14 at30, Paragon 17x16 at30, Doom 15x14
  at23.8; Broadsword 7x6 and Dagger 8x6 use15. Serialized armorCols/armorRows
  remain accepted legacy data but no longer override native-derived dimensions.
  Mapping floors relative to the pivot before adding integer cell offsets, so
  floating-point subtraction does not misclassify Doom's origin boundary.
- ShipDamageState replaces free-position hit stamps with at most one decal per
  interior armor cell. A cell below90% creates its randomized native tile;
  opacity follows 1-armorFraction. Tile draw size is max(1.5*grid,40)*(1+.5*r),
  not its48px atlas footprint. Cell center, kind, variant, angle and size persist
  across subsequent damage and breakup. The arbitrary25-damage gate and36-mark
  cap are gone. Native support-margin cells do not generate damage decals.
- ArmorGrid dispatches each distributed cell damage (including overflow) once;
  projectile, beam, mine, asteroid and ship-contact paths no longer stamp an
  additional aggregate hit. Explicit armor sync is cold. Heat adds
  255*damage/maxCellArmor*2.5, caps255, skips immediate cooling on the hit frame,
  then loses20/sec. Source hull-dependent phase, .25-1 pulse period and _void
  electrical flashes use visual RNG, never gameplay RNG. Existing marks fade
  with restored armor in Web; this repair extension is not native repair parity.
- Rendering uses the source base opacity and per-cell integer glow RGB/alpha
  (255, floor(amount*.65), floor(amount*.25), floor(amount)). Additive composition
  retains source tile alpha, hides glow on living fighters and allows it on
  fighter hulks. Disabled hull RGB tint no longer also darkens the decal pass.
  Canvas compositing is still not a claim of native GPU pixel equivalence.
- Breakup starts by zeroing cells whose3x3 samples at offsets +/-0.6grid touch
  exact bounds. The first successful split clears the source grid; seam cells
  remain zero with NO forced seam heat (the native boost is disabled). Each
  piece draws only decals passing the source9-point visual-bound coverage rule,
  clipped by its visual polygon and original sprite alpha. Original marks are
  not rerolled. Pieces still share the retained source Ship's damage state;
  independently evolving native piece armor/heat/flicker and secondary hit
  damage require a separate piece-physics/state implementation.
- Nine-point membership is cached per immutable polygon/source cell and reused
  for rendering, hot-glow detection and revision tracking. This avoids scanning
  every polygon for every cold cell on every glow upload. A bounded60-step
  Doom three-piece FX+render browser probe improved from27.5ms median/32.9ms
  P95 before that fix to2.1ms median/5.0ms P95 afterward (max8.8ms). These are
  synchronous probe timings on this host, NOT whole-game frame-time guarantees.
- Final memory-only checks covered all five hulls: all cell-center round trips
  and near-origin sides, 90% creation threshold, cold armor sync, opacity,
  retained tile identity, heat cap/first-frame hold/20-per-second cooling,
  visual/gameplay RNG isolation, breakup armor and cold electrical flicker.
  No failures remained. Main-hull first-cut decal totals were140/156/110;
  these are source-grid records before piece/sprite clipping, not on-screen
  stamp counts. A10,000-pair deterministic threshold grid yielded
  cracks5625/burns2500/holes1875 without distribution sampling or a test file.
- The damage-disabled Visual Lab now suppresses cell callbacks while temporarily
  applying/restoring armor, while existing visual heat can advance. A browser
  protected-damage probe restored all armor with zero new marks and released
  the suppression flag. Three production captures were inspected:
  hulk-cell-damage-onslaught.png, hulk-cell-damage-paragon.png and
  hulk-cell-damage-doom.png. Paragon's hole remains open; all are Web-only
  captures, not matched original-game comparisons.
- Final optimized Doom context loss/restoration returned ready with GL0 and
  no pending uploads. Twelve unchanged renders kept uploads122; removing the
  three pieces reclaimed7 hull/base/active-glow textures (122 to115 residents).
  The live baseline was restored afterward with no temporary probe globals.
- Typecheck, lint and production build passed. No test files were created,
  no file hash/file-size verification ran, and no provenance import ran.
  Readable system fonts remain the approved exception.
- Overall visual fidelity remains unaccepted: native piece physics, overkill,
  damage-bound smoke/secondary effects, cleanup/FOW, remaining impact/HUD/
  environment work and matched original-game captures are still open.


## Source armor-hit particles and newly disabled hull damage

- The prior goal turn made concrete progress (armor-cell state/rendering). This
  continuation checked the current worktree and read the original task before
  changing the next layer; the overall fidelity objective is still active.
- Read-only source: Ship.applyDamageInner (~4157-4588), Ship.randomDamage
  (~4800), EmitterFactory's three-argument one-shot emitter (~236-287),
  fs.common BaseParticle/Emitter/SmoothParticle, and H's constructor.
  SmokeEmitter exists and damage/String implements its delegate, but no active
  instantiation was found in the local decompiled engine/API sources. That does
  not support the Web's generic continuous damage smoke. This is not a claim
  that every source weapon/plugin smoke effect has been identified.
- Removed two invented live-ship emitters: the hull-HP threshold random black
  smoke/hot sparks and random depleted/support-cell smoke. The previously
  removed generic hulk smoke stays removed. Weapon-authored missile/launcher
  smoke, ship explosions, engine/venting FX and other dedicated emitters remain.
- New ArmorImpactVisuals ports the source armor-loss count: clamp loss to100;
  below10, emit one with probability loss/10; otherwise floor(loss/10). A hit
  can emit zero, unlike the previous burst's forced minimum. Each native
  SmoothParticle is integer size3-5, RGB255/200/55, offset within10 world units,
  velocity components equal to offset*3*independent random, no ship-velocity
  inheritance/drag, constant size and one-second linear brightness. Rendering
  uses the source particle texture at the actual size, with no2.5x enlargement,
  velocity stretch, white core or generic glow envelope. The legacy soft-density
  cap is not applied to these source counts; native viewport emission culling
  and particle-group budgeting are still not reproduced.
- Direct projectile, fragmentation AoE, beam tick, asteroid, mine and both
  ship-contact armor paths call the shared emitter once per armor application,
  not once per armor cell. Removed the direct hull/armor projectile's additional
  generic colored smoke/glow/spark burst, beam-contact generic colored sparks,
  asteroid-ship fixed shower and duplicate40-spark ship-collision shower.
  Ship-collision armor now uses its resolved world contact point, not a separate
  75%-radius point. Overall collision/contact geometry is not native-complete.
  Shield generic bursts, dedicated weapon EMP effects, hulk hit handling and
  other legacy debris/secondary effects remain distinct open work.
- Retained destroyer/cruiser/capital hulls now receive source disable-time armor
  damage after H starts: central2000 HE then ten random HE hits. Random amounts
  are ordinal*500*(.5+.5*r); offsets are a world-axis-aligned radius-wide box,
  transformed back into ship local space. It runs on retained unsplit hulks too,
  fixing the previously nearly intact appearance on deaths without breakup.
  The port updates armor, cell heat and armor particles, not live HP/flux/stats,
  native weapon/engine component damage, generated debris or overkill physics.
  No random sequence is applied to fighters/frigates. All draws use visual RNG.
- This supersedes the prior all-cold forced-hulk captures: zeroing armor and
  cutting seams still inject NO heat, but the subsequent source disable-time
  damage legitimately heats many cells, including cells already stripped.
  Existing source cooling/flicker then advances; there is no permanent hot seam.
- Memory-only source probes covered11 damage values x200 seeds (2200 emissions),
  count/offset/velocity/size/material/lifetime bounds, .25s brightness=.75,
  one-second expiry, all five built-in hulls with forced/no breakup, the11-hit
  sequence on retained large hulls, transformed world-box offsets, preserved
  dead HP/gameplay RNG, and suppression. No failures remained. The low-damage
  rates are seeded Web observations, not a Java Random bitstream claim.
- Browser observation of a real direct200-energy armor path produced3 native
  particles and zero other burst particles. A100-kinetic hit dispatched armor
  loss7.500000375 once and legitimately rolled zero particles. Render-call
  observation of a100-armor-loss emission found exactly10 square draws, sizes
  3/4/5 and alpha.75 at .25s; all expired at1s. Suppressing damage produced no
  particles and did not advance visual RNG. A10-second status-only observation
  of10%-HP/zero-armor live hull produced zero particles and contrails.
- Inspected Web-only unbroken Onslaught captures hulk-disable-damage-onslaught.png
  at2s and hulk-disable-cooled-onslaught.png at20s. The forced clean death created
  99 damage records,110 initial native particles, retained57.0% total grid armor,
  and did not alter battle statistics. At2s particles/contrails were zero; at20s
  heat was zero and two cells had transient electrical flicker. A four-piece
  Paragon capture hulk-disable-damage-paragon.png retained its central hole.
  These are not matched original-game appearance evidence.
- Newly hot full-hull damage exposed CPU tint rebuilding cost. Native integer
  RGB variants now cache per source tile and green/blue pair (fewer than230
  reachable pairs per tile), while alpha remains per draw. Small CPU canvases
  do not get separate managed WebGL textures. In the same60-step hot Paragon
  four-piece FX+render probe (156 records,106 hot), median/P95 went from
  10.7/21.1ms to6.0/14.0ms; max14.6ms after the change. These synchronous local
  timings are not general whole-game performance guarantees. Twelve unchanged
  renders held uploads371 without reducing particle or decal fidelity.
- Final optimized context restore returned ready, GL0 and no pending uploads.
  Twelve renders held uploads130. Removing four pieces reclaimed12 hull/base/
  active-glow textures (130 to118 residents). Temporary patches/globals were
  removed, and the paused Onslaught VIS-09/2s baseline was restored afterward.
- Typecheck, lint and production build passed. No test files were created and
  no file hash/file-size verification or provenance import was run. Readable
  system fonts remain unchanged. Overall fidelity, native piece physics/
  overkill/cleanup, shield/weapon impact and secondary-effect work, remaining
  HUD/environment differences and matched native captures are not yet complete.

## 2026-09-16 — Native direct-hit particle pairs and shield burst removal

- Source evidence: BallisticProjectile.setDidDamage (around241), MovingRay.
  notifyDealtDamage (around243), Missile.notifyDealtDamage (around932),
  ship/A/class (around112–140), CombatEngine.addHitParticle (around1997–2038),
  Misc.getHitGlowSize (around5353–5410), GenericTextureParticle and BaseParticle.
  GenericTextureParticle uses equal start/end diameters, target-velocity motion,
  and linear byte-quantized alpha; the previous expanding .18s quadratic flash
  with a synthetic nested white core was not this source particle system.
- Added HitGlowVisuals.ts. Each direct ballistic/moving-ray hit now creates a
  fringe particle of diameter3*size at brightness.4 and an independent white
  particle of diameter.5*size at brightness1. Unspecified hitGlowRadius falls
  back to length*2 for BallisticProjectile and length*.5 for MovingRay. Both
  configured and fallback values receive source [1,1.5) visual random scaling.
  Each particle derives its own lifetime from its diameter via addHitParticle:
  below50 -> diameter*.01; 50–100 -> .5; above100 -> .5+(diameter-100)*.01,
  capped2s. Source color alpha is replaced by brightness, as graphics/util/B
  does, not multiplied by it. Both particles inherit a snapshot of target
  ship velocity; neither expands, follows future acceleration, or adds drag.
- Ported Misc's kinetic/HE/fragmentation normalization, size floor and bonus,
  EMP ceiling and1.5 cap. Spawned projectiles now retain nominal baseDamage
  separately from CR-modified damage. Particle brightness remains1 (fringe.4
  for ballistic/rays), not CR damage ratio: native DamageAPI.getMultiplier is
  distinct from stat modifiers. The Web does not yet model native projectile
  damage-fade multipliers or pass-through half-size hits.
- Direct hull hits pass the existing resolved ArmorGrid damage result. Direct
  shield hits use the post-efficiency flux damage, with Ship.applyDamageInner's
  visual over-cap result conversion (including its flux-per-damage divisor),
  computed before flux is increased. This changes no damage, flux, overload,
  statistics or gameplay RNG. The size helper supports resolved EMP, but the
  current hull component system does not return a native resolved EMP result;
  no raw incoming EMP is misrepresented as one.
- Direct missiles use top-level explosionRadius with no ballistic jitter,
  effectiveness scaling, fringe diameter2*size and white diameter.5*size, both
  brightness1. WeaponSpecLoader defaults are radius100, color255/165/100 and
  useHitGlowWhenDealingDamage=true. Added the flag to the source loader and
  four built-in missile records; loaded those four source specs with a plain
  readText callback and matched the fields without a provenance/hash import.
  A false flag suppresses the direct pair without consuming visual RNG.
- This supersedes the old blanket rule forbidding missile hit effects on
  shields. Source missile hit-particle pairs are valid there. Removed generic
  projectile shield ripple/burst calls and their unused FX implementation and
  profile parameters. Removed the beam shield timed spark/ripple emitter;
  continuous beam glow and source shield segment reactions remain. Mine and
  asteroid pulse/ripple effects, hulk hits and other legacy effects were not
  silently removed by a global particle change.
- Direct missile hull hits no longer call the interception helper on top of
  the source pair. That helper currently approximates missile destruction
  rather than notifyDealtDamage; it is deliberately still available to the
  distinct interception/flare-detonation paths. Native missile explosionSpec
  secondary effects/AoE (notably Reaper detailed explosion), guided/proximity
  routing, onHit plugins, destroyed-missile flags/effects and the synthetic
  Sabot child adapter remain open. This is NOT a complete missile FX port.
- In-memory probes covered800 particle pairs across200 seeds and four routes,
  source sizes/brightness, independent duration/expiry, input-copy ownership,
  velocity advancement, normalization/floor/cap/EMP cases, flag suppression and
  four source missile specs:12820 numeric/field checks, no failures. These were
  inline observations only, not saved or claimed regression-test coverage.
- Production-browser swept collisions for Mark IX, TPC and Annihilator all
  selected SHIELD, consumed their projectile, modified five shield segments,
  generated400/250/100 flux respectively, and emitted exactly two hit particles
  with zero generic particles, ripples or explosions. Advancing .1s moved both
  particles (+8,-3) with target velocity(80,-30), kept their diameters constant,
  and did not advance gameplay RNG. Annihilator's HE shield hit yielded
  diameters100.5/25.125 and separate lifetimes.505/.25125.
- Captured actual renderer calls at .1s for that missile: exactly two square
  sprites, diameters100.5/25.125, fringe RGB255/165/0, white core, alpha.8/.6.
  Inspected artifacts/shield-native-missile-hit-particles.png at zoom1.5;
  compact orange/white contact glow and shield segment reaction, no radial
  particle shower. This is a Web-only capture, not matched native evidence.
- Real swept hull contacts using20-damage Mark IX and Annihilator shots passed
  armor loss1.500000075 /6.0000003 to the pair factory, emitted the expected
  paired glows, and no separate explosion/ripple. Their low armor-loss rolls
  produced one and zero SOURCE_SMOOTH particles respectively. A one-second
  sustained100-DPS energy-beam shield observation generated100 soft flux,
  zero hard flux, five affected segments, and zero generic particles/ripples/
  one-shot hit glows/explosions; gameplay RNG was unchanged.
- With the pair alive, twelve unchanged renders held texture uploads119.
  Context loss/restore returned ready, GL0, no pending uploads, and preserved
  both particle lifetimes; twelve restored renders held uploads118. The
  temporary restore handle and renderer/method probes were removed afterward.
- Typecheck, lint and production build passed. No project test files were
  created and no file hash/file-size verification or provenance importer ran.
  The build tool's ordinary output is not a manual file verification pass.
  Readable system fonts remain unchanged. Overall fidelity is still open:
  beam effectiveness/brightness lifecycle, weapon plugins and secondary FX,
  native hulk physics/overkill/cleanup, remaining HUD/environment work, and
  matched original-game captures have not been completed by this change.
- Final browser state was restored to paused Onslaught VIS-09 at2s, ready and
  actively venting: zero damage marks, hulks and hit particles, no battle result,
  GL0 and no probe globals. Browser console had zero errors. Computed HUD font
  was Segoe UI / Microsoft YaHei UI / Microsoft YaHei / sans-serif, with no
  original .fnt or victor font requests.

## 2026-09-16 — Beam contact state, charging continuity and native L geometry

- Source evidence: BeamWeaponRay.java (render112–148, advance154–211,
  notifyDealtDamage219, wasShortened/forceShowGlow232, getHitGlowRadius339),
  WeaponSpecLoader.java (defaults281–333), ship/trackers/D.java (charge level,
  create/destroy transitions and overload/vent reset), ship/A/oooo_1.java beam
  creation, renderers/L.java first overload, and graphics/Sprite integer alpha.
  This section supersedes earlier rectangular-beam/muzzle-orb and shot-age-based
  hit-brightening descriptions, not the remaining native combat differences.
- Added visual/BeamVisuals.ts. The previous collision's showGlow state now drives
  contact brightening while ACTIVE. Default brighten duration is1s (Tachyon,
  Graviton, Tactical Laser); Burst PD explicitly uses.25s. Loss of contact or
  leaving ACTIVE dims by1/sec. Zero/nonpositive brighten duration responds
  immediately on shortening, including nondamaging stages. Unlike the prior
  renderer, a long-lived beam newly touching a target does not start fully lit,
  and its glow does not disappear immediately when the target leaves the ray.
  A fading glow remains at the current ray endpoint, as the source does.
- Source contact radius is configured positive hitGlowRadius, otherwise current
  width*3. Resolved shield/armor/hull damage drives Misc effectiveness scaling;
  the source fringe/core diameters are2*radius and.5*radius, with alpha capped
  by weapon intensity and multiplied by the actual source color alpha using
  integer truncation. Removed the extra1.22 profile radius multiplier, .85
  fringe alpha, .6 core size and arbitrary minimum14/width*1.8 radius.
  useGlowColorForHitGlow and BeamAPI's runtime effectiveness-scaling switch are
  supported. Resolved component EMP is still unavailable and not invented.
- IMPORTANT boundary: the Web still resolves beam damage per fixed tick, not
  BeamWeaponRay's .1s brightness-squared damage batches. Effectiveness compares
  each actual result to nominal base DPS times that SAME tick duration; using
  .1s nominal damage against a1/60s result would force almost all hits to the
  minimum. Stable damage ratios match the source normalization, but native
  batching/armor/particle cadence and damage during charge-up/down remain open.
  New ramp beams are visual-only, preserving current combat damage semantics.
- Added source defaults/flags to the loader and four built-in beam records:
  hitGlowBrightenDuration, beamFireOnlyOnFullCharge, useGlowColorForHitGlow,
  fringeScrollSpeedMult, darkCore and dark layer iteration counts. Loaded the
  original four .wpn records through a plain readText callback, not the hash
  provenance importer. All four have full-charge-only=false and darkCore=false;
  the three long/default glow timers are1s and Burst PD's is.25s.
- Charging now creates a visual ray when the source full-charge-only flag is
  false. Charge/down widths follow the mount tracker; ACTIVE stays full width
  until that tracker leaves ACTIVE rather than arbitrarily fading in its last
  .1s. Cancelled partial charging retains its current level into a proportional
  visual chargedown. The active transition records one shot, not a shot for the
  preview; source baseDPS is retained separately from CR-modified output.
- Production observation caught a pre-existing lifecycle bug: the beam's own
  duration expired one tick before the mount left ACTIVE, so chargedown created
  a new beam and erased UV/contact state. Mounted beams now expire with their
  authoritative mount/cycle instead. Same-cycle phase refreshes retain ID,
  elapsed UV time and glow state; a new cycle resets that state and refreshes
  damage fields. Dead/venting/overloaded sources remove rays immediately. Missing,
  disabled, replaced, mismatched-cycle or idle mounts also remove visual rays,
  not only damaging rays. The old render-only sustained-beam deduplication/global
  combat-time UV helper was removed; duplicate simulation entities are not hidden.
- Replaced the simple sprite rectangles with RibbonBatcher.drawBeam, porting
  renderers/L's distinct continuous-beam mesh (NOT N's MovingRay pulse mesh).
  Brightness scales width; opacity uses source integer truncation, then square,
  then source color alpha. The main strip starts width/3 forward from the muzzle
  and ends width/6 before the target; fringe extends/fades beyond the target,
  two full-alpha muzzle triangles converge behind the barrel, and core ends fade
  separately. darkCore uses its.75*width cap and normal-alpha core pass. Source
  coreWidthMult, fringe/core scroll phases and128*pixelsPerTexel UV span apply.
  No family width, color or opacity enhancement is applied to these beams.
- Removed the continuously added compact muzzle glow sprite, which is absent
  from BeamWeaponRay/L's path, and the generic fallback muzzle flash on actual
  beam activation. Authored muzzleFlashSpec handling and weapon glow sprites
  remain. Source helper M used by the beam owner is looped sound, not evidence
  for another muzzle particle. Synthetic VIS-07/composite captures now explicitly
  author their contact age/state, instead of relying on renderer shot-age guesses.
- Memory-only helper/mesh observations:443 numeric checks,18 mesh combinations
  (three intensities, darkCore on/off, three core-width multipliers), no failures.
  Covered contact ramp/loss/instant response, late first contact, same-damage
  normalization at30/60/120Hz, charge/down levels, byte alpha,36 normal vertices,
  dark iteration counts, asymmetric extent/UV geometry, blend modes and finite
  vertices. These are inline observations, not saved regression-test files.
- Real WPN-BEAM-01 at.65s: same source ray later used by ACTIVE, intensity.533333,
  width13.3333 from authored25,36 vertices and strip alpha72/255, no contact
  sprites or generic muzzle flash. At1.3s it was ACTIVE and one shot recorded;
  at2.1s the SAME ray had elapsed1.716667, chargedown intensity.8 and still only
  one shot. Graviton similarly showed a.433333 charging preview at.76s and a
  same-entity.7 chargedown at1.43s. The independent early-expiry bug no longer
  resets the ray between burst ACTIVE and CHARGEDOWN.
- Real Burst PD at.66s: nondamaging charging ray, intensity.433333, geometric
  shortening but zero glow/shot count. At.86s: ACTIVE, glow.64, effectiveness.67,
  authored width17 and36 vertices. Observed exactly two contact sprites with
  diameters68.34/17.085 and alpha163/255. At1.08s the SAME ray retained glow.92,
  elapsed.463333 and chargedown intensity.366667; the glow alpha is limited by
  that intensity, not kept at.92. Scene return fire creates other FX, so the
  scene's total generic-particle count is not misattributed to the beam.
- Inspected Web-only captures beam-source-charging-tachyon.png and
  beam-source-contact-burstpd.png. They show the thin low-intensity pre-fire
  beam and a compact source-sized contact glow. These are not matched native
  screenshots or a claim of whole-game visual completion.
- Isolated real beam-handler observation: one-second100-DPS shield contact
  generated100 soft flux, no hard flux, glow59/60 (previous-contact update),
  effectiveness1, zero generic particles/ripples/one-shot glows, unchanged
  gameplay RNG. After31 missed frames glow was.5 and flux unchanged; the glow
  moved to the ray's new endpoint. Dead/venting/overloaded sources each removed
  the ray. Five invalid-mount/cycle variants each removed a nondamaging ray.
  Flipping full-charge-only produced one preview when false and none when true.
- Runtime flag observation: configured radius40 with effectiveness scaling off
  produced80/20-diameter contact sprites. useGlowColorForHitGlow selected a
 20/210/80/128 core color and alpha81/255 at glow.64, rather than white. Twelve
  unchanged renders held uploads137. Context loss/restore preserved beam ID,
  elapsed time and glow; it returned ready, GL0 and no pending uploads. Twelve
  restored renders held uploads117. Temporary instrumented methods/handles were
  restored/removed; no frame-time or whole-game performance claim is made.
- Typecheck, lint and production build passed. No test files were created and
  no file hash/file-size verification or provenance importer ran. System fonts
  remain unchanged. Full fidelity is still incomplete: native beam .1s damage
  cadence/ramp damage/forward length growth, weapon-specific beam plugins,
  missile secondary effects, native hulk physics/overkill/cleanup, remaining
  HUD/environment discrepancies and matched original captures remain open.
- Final restored baseline: paused Onslaught VIS-09/2s, ready, venting, zero
  marks/hulks/beams, null battle result, GL0, no probe globals, no original .fnt
  or victor requests. HUD still uses Segoe UI / Microsoft YaHei UI / Microsoft
  YaHei / sans-serif. Final typecheck and lint passed; browser reported no errors.


## 2026-09-16 — Beam damage batches, ramp damage and regrowing collision front

This section supersedes the prior visual-only charging/chargedown and fixed-tick
beam-damage boundary. It is further progress, NOT full-game fidelity completion.

Source and implementation:
- BeamWeaponRay.advance integrates tracker brightness squared, resolves only when
  its damage clock reaches .1s, and resets elapsed/integral to zero (no remainder
  carry). A new ray's initial random phase affects timing but does not award
  unelapsed damage. The Web now uses one authoritative gameplay-RNG draw per ray,
  not visual RNG. A tiny double-precision threshold tolerance only handles the
  six-fixed-tick .1s boundary. DamageSample = modified DPS * brightness integral;
  effective DPS = modified DPS * integral / elapsed. No manual final flush.
- The source's explicit burst-only chargedown tail bonus is retained when remaining
  down time is below .1s: brightness squared / 4 * source chargedown duration.
  The sample is applied to the CURRENT collision target; a miss consumes the sample
  and cannot bank it for a later target. Geometry/shortening/glow still update every
  frame, including nonsampling frames. Glow effectiveness now uses native base
  DPS * .1 rather than the previous Web fixed-tick denominator.
- Real charging and chargedown rays are damage-active. Explicit damageActive=false
  fixtures remain harmless. Armor receives the batch damage plus effective DPS
  (including target CR) as hit strength; ArmorGrid still applies its .5 DPS factor.
  Direct armor-loss particles and approximate direct component damage run only on
  actual samples. Source CR is read live for both damage and EMP output, consistent
  with Damage F's shared modifier in computeDamageDealt/computeFluxDealt.
- Native shield G.shieldHit(point,damage,isDps,dt) ignores its last two arguments;
  no additional frame-time conversion is required for its segment reaction.
- ship/A/oooo_1 uses min(range, previous SHORTENED length + dt * beam speed), then
  projects both endpoints from the current muzzle/direction. The Web now follows
  that rule and records rayEndPrevFrame. Newly emitted rays have zero length;
  losing contact regrows from the obstruction instead of jumping to full range.
- weapon_data.csv speeds are imported by plain source reads: Tachyon/Burst PD10000,
  Graviton/Tactical Laser2400; loader default1400 matches WeaponSpreadsheetLoader.
  No provenance importer, hashing or file-size comparison was used.
- Same-cycle phase refreshes preserve geometry, elapsed UV time, damage clock and
  contact glow. A new cycle resets all those. The Web's shot statistic now counts
  once on the first real ray, including charging, so an early hit cannot precede
  its shot count. This is a Web statistic, not a claim about native accuracy UI.
- Finite beam ammo is consumed at firing request, not a second time at ACTIVE.
  Burst charging continues after trigger release, like native tracker D's forced
  burst request. Sustained charging may cancel into proportional chargedown.
  Chargeup and ACTIVE accrue source energy/second; chargedown does not. The full
  native tracker/time-mult/energy-failure path and substep transition carry are not
  claimed identical; state transitions remain Web fixed-step quantized.

Observed evidence (inline only; no saved test scripts):
- 6889 inline clock/source assertions across480 samples: 30/60/120Hz, four phase
  offsets, no unearned initial damage, .1s sampling/reset, charge/active/down
  integrals, burst-only tail bonus, explicit visual-only/zero-dt behavior, fixed
  hit-glow denominator, four authored speeds and missing-speed default.
- Isolated REAL handler at100DPS/2400 speed: front lengths40,80,120,160,200 over
  five frames with no damage; frame6 contacts a shield at240 and applies10 soft
  flux. Frames7–11 remain geometrically shortened with unchanged10 flux. Frame12
  loses contact, regrows to280, consumes the missed sample without damage. After
  moving the muzzle to(10,20) and rotating90deg, previous/current ends were
  (10,300)/(10,340). Recontact reached20 total flux, not30. Exactly two shield
  absorptions, one shot-hit record, zero hard flux, no generic particles/ripples/
  one-shot glows. Fresh phase consumed one gameplay-RNG draw, not one per frame.
- Real armor handler at half charge, source CR.3/target CR.2: one sample in six
  frames, damage2.544 and DPS hit strength25.44. Same ray at half chargedown with
  source CR changed live to1 produced2.915/29.15. Two armor-loss notifications
  and two direct component calls, not twelve. Explicit visual-only mode added
  no damage and did not advance the damage clock.
- Real CombatEngine spawn callback: same-cycle refresh retained length317,
  clock.074, integral.021, glow.4 and hit flag with no new shot. New cycle reset
  length/clock/integral/glow/hit flag and added exactly one shot.
- Real control lifecycle with one remaining ammo: request consumed it; reaching
  ACTIVE did not consume another. Burst release during charge did not cancel;
  sustained release at quarter charge produced.025s down and no extra flux.
  full-charge-only suppressed the charge ray but retained ACTIVE/down rays.
  Exhausted ammo prevented a subsequent request. All phase emissions start at
  zero length and retain the same cycle id.
- Real lab Tachyon at.43s: ray length466.667 and intensity.093333; at1.3s ACTIVE
  and2.1s CHARGEDOWN, the same id0.1844118325971067 retained clock/elapsed state,
  with one shot throughout. Graviton at.76s: length104, intensity.433333.
- Real Burst PD at.66s: already one charging hit/one shot, damage1.467407, first
  sample duration.1004421 and mean intensity squared.0417414; ammo3. At.86s
  ACTIVE and1.08s CHARGEDOWN the same id0.14249755744822323 kept one shot/hit
  and ammo3, with cumulative damage32.24537/130.03472. These scene totals are
  not a claim of isolated native DPS; target modifiers and returned fire exist.
- Inspected Web-only beam-source-front-growth-graviton.png: the low-intensity
  charging ray ends shortly beyond its muzzle rather than spanning full range.
  No matched native screenshot was available.

Remaining boundaries:
- Native source time multiplier, beam-speed stat modifiers, multiple barrel/ray
  DPS splitting and converge-on-point behavior are not ported; the four built-in
  beams have one authored barrel. Pure EMP-only/modded beams are not claimed.
- TachyonLanceEffect is still a legacy approximation. Its native.2–.3s IntervalUtil,
  dpsDuration/wasZero guard, rayEndPrevFrame shield test, raw EMP*.5/effective
  DPS*.25 arc damage and beam.width+5 arc thickness remain open. Graviton and
  other weapon-specific plugins also remain open. This change intentionally
  retains existing ACTIVE per-frame plugin/audio/debris/flameout scheduling,
  rather than accidentally dividing it by the new batch interval.
- Approximate direct weapon-component damage/EMP reporting is not a native port.
  Missile secondary effects, native hulk physics/overkill/cleanup, remaining
  HUD/environment gaps and paired original captures also remain incomplete.
- System fonts are unchanged; project test files remain removed. No original
  installation files were changed. No full-fidelity or sound-fidelity signoff.

Final checks for this increment:
- Latest mounted Tachyon source-CR observation: CR.2 -> multiplier.94 ->1410DPS
  and940EMP/s, both restored with CR.7 afterward. This checks the shared live
  source modifier rather than leaving EMP cached at unmodified source output.
- Inspected beam-source-batched-burstpd-contact.png (Web only). The source beam
  ends at the shield with its continuous glow; the bright returning projectile
  effects over the firing ship are enemy fire, not new beam damage particles.
- Twelve unchanged contact renders held137 uploads. Context loss/restore returned
  ready/paused, GL0 and zero pending uploads; another12 renders held117 uploads.
  Beam id, length384.2448534, elapsed.2433333, phase/integral.0933333 and glow.64
  survived unchanged. Temporary restore handle was removed.
- Final typecheck/lint/production build passed; latest main bundle is
  index-3Dz6Aq5x.js. No project test files found. Scoped diff whitespace check
  reported no errors (only normal Git LF/CRLF notices).
- Restored paused VIS-09 at2s with Onslaught actually venting, renderer ready,
  marks0/hulks0/beams0, null battle result, GL0, no probe globals or .fnt/victor
  resource requests. Computed .hud-text remains Segoe UI / Microsoft YaHei UI /
  Microsoft YaHei / sans-serif. Lab/body monospace styling was not changed.
- Browser had zero errors; its existing autoplay AudioContext warning means
  these observations do not establish auditory fidelity. No hashes, file-size
  checks, saved tests, original-game writes or font restoration were performed.


## 2026-09-16 — Tachyon plugin timing, weighted EMP arcs and native arc mesh

Previous goal turn: progress (source damage batches/ramp damage/front growth).
This increment is also progress, not a whole-game or complete component-model signoff.
It supersedes the prior Tachyon per-frame probability/thin branching arc approximation.

Authoritative references:
- api/impl/combat/TachyonLanceEffect.java and api/util/IntervalUtil.java.
- CombatEngine.spawnEmpArcPierceShields -> systems/EmpArcEntity.java.
- Missing nested D$oo and ship/null$oo were extracted from the original jar and
  decompiled into artifacts/native-emp-reference (read-only original jar; no
  tests, hashes or size checks). The main decompiled D.java omitted the graphics
  nested class; guessing from the old Web arc renderer was not sufficient.
- renderers/damage/oooo_1, renderers/L texture enum and D$oo's actual vertices;
  Ship.applyDamageInner, ship/new.buildComponentMap and ship/super health tracker.

Changes:
- Per-ray Tachyon effect state is retained across charge/ACTIVE/down and reset
  on a new firing cycle. IntervalUtil samples .2–.3s, consumes dpsDuration only
  while a ship target exists and brightness>=1, and uses the native wasZero guard
  against repeated positive duration. After firing, the next eligible advance
  chooses a fresh interval, drops overshoot and starts at zero. It is not a
  per-frame random rate or a timer driven by render/wall-clock time.
- The shield arc test uses rayEndPrevFrame, not the latest beam endpoint, with
  native minimum-one-degree angular coverage and no radial-distance condition.
  Pierce probability is (target hard-flux fraction-.1) times the TARGET dynamic
  SHIELD_PIERCED_MULT (new runtime property default1). A failed pierce consumes
  that interval; contact interruption/partial brightness does not reset it.
- EmpArcEntity target selection includes engines and non-hidden Web weapon
  modules, including temporarily disabled modules, with inverse-distance weights
  and a center fallback. Endpoints follow the target's translation/rotation.
  At zero distance a small finite denominator implements the limiting dominant
  weight instead of introducing an infinite/NaN picker sum.
- Extra ENERGY damage is effective beam DPS*.25; extra EMP is RAW source EMP*.5,
  not the CR-scaled EMP stream. The energy hit bypasses the shield and uses the
  normal nondps armor/hull path. It is no longer an EMP-only fixed200/350 event.
  It adds no shot or shot-hit count and does not change beam glow effectiveness.
- Arc component transfer uses actual armor+hull damage plus EMP over the native
  21-cell map: inner nine*.5, outer twelve cross*.25, corners excluded. A new raw
  weapon-component API avoids the old proximity EMP*2.8 multiplier for arcs.
  Legacy weapon maximum HP and random repair timers are NOT yet native.
- Engine arc damage accumulates instead of a random per-frame flameout. Base HP
  is800/600/400/200/100 by hull category times(.75 + clamp(width+length,25,100)/200).
  Repair duration is20/15/12/8/4 seconds times[.9,1.1); disabled engines reject
  damage while repairing. Intact damaged engines wait5s without a hit to repair;
  disabled ones restore over their repair duration. This arc-created tracker is
  still an adapter alongside pre-existing generic engine-malfunction paths; full
  global controller disability/system-activated immunity/stat modifiers and the
  native interval-delayed transition to disabled remain open.
- Removed the Tachyon per-frame shield/hull random EMP loops, unrelated random
  rear-engine flameouts, generic beam hull debris loop and invented beam shake.
  Continuous contact sound and direct beam component damage are still separate
  Web adapters; base beam damage and source armor-loss particles remain intact.
- Native D$oo arc geometry uses a correlated random walk with1–2-unit segment
  spacing, endpoint-distance envelope min(d*.25,100), no arbitrary side branches,
  and cached geometry. Fringeb/coreb source textures use128-unit UV span, parallel
  cross sections, passed width(beam.width+5 =30 for Tachyon), fixed15-unit core,
  and a transparent last vertex when the chain has>10 points. D$oo's core UV
  accumulator starts from the previous fringe endpoint; the port retains that.
- Native endpoint disks are100/25 at the target and50/12.5 at the origin. Source
  fringe/white colors and byte alpha replace the old oversized rectangle glow.
  Default source flicker advances in simulation at dt*.8; render never resamples
  noise. The default native flicker can reset/repeat before expiration, so it is
  not replaced by an invented fixed.22s lifetime. Non-default movement/warping/
  single-flicker API variants are not implemented by this dedicated default path.
- Added source beamfringeb/coreb textures and EMP impact02/03 audio variants by
  ordinary copying; their manifest entries intentionally omit hash/bytes. Source
  Tachyon impact selection uses volume.3/pitch1.5 and the three source variants.
  SoundManager's existing pitch wobble/spatial attenuation/lazy-load behavior is
  not native audio parity and remains outside this signoff. Existing generic
  arcs (other callers) retain their prior implementation.

Evidence:
-3858 inline assertions (not saved tests) covered interval phases, wasZero,
  interruption/brightness pause, drop-overshoot semantics, weighted engine/module
  boundary (distance10 vs30 gives75%/25%, including disabled modules), rotated
  coordinates, narrow angular shield coverage, all49 cells around the21-cell
  component region, default source point generation for lengths1–1200, mesh layer
  counts/UVs/30-vs15 widths/byte alpha/terminal fade, anchored motion and flicker
  expiration over100 seeds. Longest observed default source flicker was126 frames
  at60Hz; this is not a fixed-duration arc claim.
- Additional inline source cases: hard flux0 and target multiplier0 prevent
  shield arcs; hard flux.8/mult1 with roll.8 prevents an arc; mult2/roll.99 permits
  it. Opposing current/previous endpoints proved it is the PREVIOUS endpoint's
  shield arc that controls piercing. Modified DPS1410*mean.8*.25 produced282
  energy, while raw1000 EMP produced500 (not470). A hull-side previous endpoint
  bypassed the shield test without consuming a pierce RNG draw.
- Actual handler in a controlled paused Web scenario:18 fixed steps at full
  brightness, three150-energy DPS batches, then one375-energy NON-DPS arc. It
  used width30, source fringe85/25/215, white core,60 generated points and one
  shot/one shot-hit total. EMP statistic800 = three100 base samples +500 arc.
  No assertion is made that the lab's displayed.43s represented those separately
  driven handler steps; this was an explicitly controlled in-memory scenario.
- Actual shield cases: low hard flux yielded zero arcs/zero armor calls and one
  pierce RNG draw. Hard flux.8 with forced successful roll yielded one375-energy
  armor call, one native240-point arc from shield point(148.7533,99) to engine
  position(502,10), and no instant flameout. Engine0/1 HP decreased from936 to
 652.9118; an outer component received the half-sized transfer. This was a forced
  branch observation, not a statistical claim about natural pierce frequency.
- Actual engine tracker:936 maximum HP,100 damage ->836; no healing through5s;
  at5.5s ->859.4553. Overwhelming damage disabled it for19.95288s; halfway HP468
  and timer9.97644, then full936 and enabled. Generic whole-controller mode and
  source weapon durability remain unverified/unported boundaries as above.
- Inspected Web-only tachyon-native-hull-arc.png and tachyon-native-piercing-arc.png:
  localized purple/white curves join impact to component; no fake branches or
  opaque thick rectangular strip. No paired original screenshot is available.
- Actual draw capture produced exactly100/25/50/12.5 endpoint disks, correct
  fringe and white colors. Twelve unchanged renders kept120 uploads and neither
  geometry nor gameplay visual RNG changed. Translation/rotation moved anchored
  endpoints and left the240 local points unchanged. Context loss/restore returned
  ready, GL0, no pending uploads, same364.28595 length/240 points/brightness1 and
  the same endpoints; another12 renders kept120 uploads. Probe handle removed.

Still open: complete source weapon/engine component health and repair integration,
other beam plugins (especially Graviton), time/beam-speed modifiers, multiray
convergence, missile secondary effects, native hulk physics/overkill/cleanup,
remaining HUD/environment gaps and matched original captures. System fonts remain
an intentional exception. Do not equate this progress or successful builds with
completion of the full goal.
Final checks for the Tachyon increment:
- Reloaded the final index-YAIL8z2R.js build. A fresh, detached in-memory Ship
  confirmed the cleaned-up timer:936 max HP, no healing through5s,859.4553 HP
  at5.5s,19.95288s full repair,468 HP/9.97644s at halfway,936 HP and enabled at
  completion. No probe entity was attached to the live battle.
- Restored paused VIS-09/Onslaught at2s: actually venting, ready, marks0/hulks0/
  beams0/arcs0, null result, GL0. Computed HUD fonts remain Segoe UI / Microsoft
  YaHei UI / Microsoft YaHei / sans-serif, with no .fnt/victor resource requests.
- Browser reported no errors, with the existing AudioContext autoplay warning.
  Lint/build and scoped whitespace check passed in the preceding context; no
  tests, hashes, file-size checks, font restoration or original-game writes.

## 2026-09-16 — Graviton target listener and shield-damage multiplier

Previous goal turn: progress (native Tachyon/EMP arcs). This increment is also
progress, not full-fidelity acceptance. System fonts remain an intentional exception.

References: api/impl/combat/GravitonBeamEffect.java, api/util/TimeoutTracker.java,
and Ship.java's AdvanceableListener loop before weapon advancement.

Changes:
- Added GravitonBeamEffect's per-ray wasZero guard. Only full-brightness pulses
  with positive dpsDuration, a ship target and a real source weapon can notify.
  Partial brightness, lost contact or missing weapon pauses the guard. The
  CURRENT endpoint's angular shield coverage is used, unlike Tachyon's previous
  endpoint. The native one-degree minimum/angular-only check is shared.
- The target lazily owns a listener keyed by WeaponMount object identity, not
  source slot text, weapon spec, beam id or cycle. Repeated rays/cycles from one
  mount only refresh its one-second timeout. Different mounts, including equal
  slot names on different ships, count separately. One/two/three-or-more active
  weapons yield multipliers1.05/1.08/1.10; no unlimited or multiplicative stacking.
- TimeoutTracker.add(w,1,1) becomes a refresh to1s. The target's next positive
  Ship.update advances time then updates the multiplier; notification alone does
  not amplify its triggering batch or other beams processed later that tick.
  Entries expire at<=0 and the empty listener is removed, restoring multiplier1.
  Source death, cessation of fire or shield lowering does not prematurely clear
  remaining hit history. New ray cycles reset only the ray guard.
- Shield.absorbDamage applies the multiplier once for all existing shield-damage
  callers. It is separate from efficiency, upkeep and hull/armor damage. Beam,
  projectile, fragmentation splash and mine statistics/floating numbers, and
  collision floating numbers, include the same factor under their existing raw
  damage reporting convention. Graviton does not convert soft beam flux to hard.

Evidence (memory-only; no test files):
-130 inline source-module assertions: stack cap and weapon deduplication, refresh
  and independent/inclusive expiry, current-vs-previous endpoint and angular-only
  coverage, full brightness, pulse guard/paused guard, target/weapon absence,
  visual-only fixtures, shield NONE/PHASE/down, multiple rays and target changes.
  Shield flux covered four damage types, three efficiencies and four vulnerability
  multipliers, leaving efficiency itself unchanged. Only the unused sound import
  was stubbed in this pure-module harness.
-36 production-browser assertions drove the actual BeamSimulationHandler and
  Ship.update on detached in-memory ships, using real Graviton specs. At step6,
  first one/two/three/four-beam batches generated20/40/60/80 soft flux at mult1;
  step12 generated21/43.2/66/88 at1.05/1.08/1.10/1.10. Damage statistics matched,
  hard flux stayed0, and the listener expired after1s without another hit.
  Three/four-mount cases were explicitly synthetic, not a stock loadout claim.
-128 production-browser assertions drove the actual projectile shield/hull damage
  method with a controlled active multiplier: all four damage types, CR.7/.2,
  fortress levels0/.4/1, unchanged armor/hull results. For100 energy damage on a
  .6-efficiency shield, baseline60 hard flux became64.8 at1.08. Full fortress
  gave6 ->6.48; CR.2 gave63.6 ->68.688. Type/system/CR/efficiency/vulnerability
  each applied once. These were direct damage-path checks, not swept collision
  geometry or natural combat-frequency evidence. Mine/splash/collision routes
  were reviewed at their shared shield API, not separately scenario-playtested.
- All294 assertions used local-only objects; the live lab's.9s clock, enemy
  listener and effect arrays were left unchanged. No debug global was installed.
- Typecheck, lint and production build passed; initial Graviton bundle was
  index-TnwmOU0x.js. No rendering change or new asset was needed, so no new visual
  parity or audio claim is made from these damage-path observations.

Still open: target/source time-stat integration (this listener uses the existing
Web combat step), complete component durability/repair, additional weapon-plugin
and API variants, beam-speed modifiers and multiray convergence, missile secondary
effects, native hulk physics/cleanup, HUD/environment gaps and matched original
captures. The full goal is not complete. No original-game files were modified.

Final baseline for this increment:
- Reloaded final index-TnwmOU0x.js; paused VIS-09/Onslaught at2s, actually venting,
  presentation ready, marks0/hulks0/beams0/arcs0, null battle result and GL0.
  Both live capitals have multiplier1 and no Graviton listener. No probe globals
  were installed; the browser's built-in oncontextrestored property is unrelated.
- HUD computed fonts remain Segoe UI / Microsoft YaHei UI / Microsoft YaHei /
  sans-serif; no .fnt/victor requests. Browser errors0, existing autoplay warning1.
- Final lint/build and scoped diff whitespace checks passed (Git LF/CRLF notices
  only). No tracked/unignored project test files remain; tests were not recreated.
  No hashes or file sizes were checked and no original-game files were written.

## 2026-09-16 — Weapon durability, repair lifecycle and direct component transfer

Previous goal turn: progress (Graviton). This increment is progress too. It
supersedes earlier weapon HP500/800/1500, immediate disable,5–9s timers,50%-HP
recovery and the direct-hit proximity/EMP*2.8 model; it does not complete engines.

References:
- ship/super.java: installed-weapon size HP125/250/400 *2, hardpoint *2 and repair
  time+5; normal10/15/20s repair;5s healthy repair delay; periodic zero-HP disable;
  disabled damage rejection, continuous repair, permanent-disabled early return.
- loading/specs/nullsuper.isHardpoint confirms the obfuscated slot enum; weapon
  classes ship/A/if,oooo_1,return advance trackers with !ship.isHulk() as repair
  permission. Their isDamageable excludes HIDDEN; imported decorative slots are
  already excluded. Arbitrary decorative/show-damage API variants remain open.
- util/IntervalTracker: .5–1.5s, sample at creation, no carried overshoot, next
  interval starts on the following advance, including undamaged/full-HP weapons.
- Ship.applyDamageInner and ship/new.buildComponentMap: actual armor+hull+EMP,
  inner9 cells*.5, outer12 cross cells*.25, then target/source component modifiers.

Changes:
- New WeaponComponentHealth owns the health check/repair clock; native-mounted
  weapons initialize it at installation. Turrets small/medium/large now have
 250/500/800HP and10/15/20s repairs. Hardpoints have500/1000/1600HP and15/20/25s.
  HP is based on installed weapon size, not the mounting slot's maximum size.
  Installation supports a health multiplier; live weapon repair-time and
  repair-under-fire hooks are exposed with neutral built-in defaults.
- Damage reduces HP and resets hitAgo but does not itself disable. The native
  interval checks zero HP, then repair can begin in that same simulation step.
  Healthy damage repairs only after strictly more than5s without a hit, unless
  repair-under-fire is enabled (not for pending-zero-HP weapons). Disabled mounts
  reject more damage and recover continuously to full HP before re-enabling.
  Repair-time multipliers scale actual healing; the remaining-time API is in
  base repair seconds, with HUD seconds adjusted by the multiplier.
- Explicit/legacy CR disable calls now use the same health state, including a
  real permanent flag instead of9999s for WEAPONS. They stop charge/burst state,
  remove live beams when the authoritative disabled flag becomes true, retain
  ordinary weapon cooldown and no longer add an invented.5s cooldown on recovery.
  Permanent HUD text is now a readable label, not Infinity/9999 seconds.
- Disable/repair notifications are consumed once when transitions actually
  happen, rather than inferred immediately from a damage-path return value.
  Component queues also drain for fighters/dead entities; fighter events do not
  spam capital radio/floaties. Those messages/recovery sparks remain Web adapters.
- Common ComponentDamage replaces direct projectile/beam proximity thresholds,
  EMP*2.8 and the55% random rear-engine flameout branch. It is also used by native
  Tachyon arcs. Target EMP damage taken, target weapon/engine damage taken and
  source damage-to-weapon/engine hooks multiply the resolved transfer once; they
  do not re-multiply actual hull/armor loss. HIDDEN weapons are excluded.
- Engines reached by direct contacts now use the existing arcDamage health path
  instead of random instant flameout. That field retains its old name but accepts
  both arc and direct-contact damage. Engine disabling is still immediate at zero
  HP and its tracker is still lazily initialized: full native engine/controller
  immunity, periodic health checks, CR and system-activation semantics remain open.
- Added ordinary source disabled_small/medium audio copies and mapping entries,
  omitting hashes/bytes from the new manifest entries. Normal/critical size keys
  use source volume.5/pitch1. SoundManager spatial/pitch/lazy-load approximations
  and browser autoplay gating still preclude auditory-fidelity acceptance.

Evidence (no test files were written):
-32610 memory-only assertions: all size/mount/health profiles, strict5s delay and
  reset on hit, repair under fire, delayed disable/same-step healing, disabled
  damage immunity, half/full recovery, .5/1/2 repair multipliers, hulk repair
  prohibition, permanent-state behavior, initial/next-frame interval RNG and
  overshoot, and49-cell map/hidden exclusion with independent target/source stats.
  An independent double-precision translation of the zero-malfunction source
  tracker matched12 seeded900-frame sequences of damage and repair modifiers.
  This is not a float32 engine replay or CR-probability validation.
- Production mount inspection: Onslaught TPC hardpoints1600HP/25s, Mark IX turrets
 800HP/20s; Paragon Graviton500HP/15s, Tactical Laser250HP/10s, Tachyon800HP/20s.
-37 production-browser assertions used detached real ships and the actual
  projectile damage method:150 energy produced22.500001 armor loss;40 EMP with
  targetEMP*2 made the transfer base102.500001. Inner weapon loss was79.950001
  with targetWeapon*1.3/sourceWeapon*1.2. Hidden HP was unchanged. A controlled
 1s check interval left a zero-HP Tachyon active until the check; the disable
  frame healed to10HP, halfway reached400HP/10 base seconds remaining, and full
  recovery reached800HP with no artificial cooldown. Onset/recovery fired once.
  A permanent weapon remained disabled/HP0 after11000 simulated seconds.
-23 further browser assertions drove a real Graviton beam hull hit and source
  update: a.1s batch yielded.750000 armor damage, transferred to three nearby
  weapon cells without a shield debuff. A zero-HP source beam survived the pending
  check, was removed when the .5s check disabled it, then recovered to500HP in15s.
- Rear-engine direct impact:150 energy ->22.500001 armor damage ->11.250001 engine
  HP loss,936 ->924.749999, no flameout. A throwing combat-RNG sentinel confirmed
  the old random flameout draw was gone; three affected engine trackers sampled
  only their source-style repair-duration initialization through target RNG.
- Tachyon regression through real emitBeamState/BeamSimulationHandler: three150
  DPS samples and one375 NON-DPS arc remained. The shared map transferred
 283.088238 to engine0 from(66.176475 actual armor+500EMP)*.5; native arc state
  was present. This was a controlled detached scenario, not a screenshot match.
- Two fresh15s full fixed-update battles with both capital AIs and seed7788
  yielded identical value snapshots (direct comparison, no hashes).37800 mount
  state observations were finite/in-range. Several mounts accumulated damage;
  the deliberately depleted enemy Tachyon was548.666667HP with6.283333s base
  repair remaining at15s, and capital notification queues were empty. This is a
 15s smoke check, not evidence for every combat mode or arbitrarily long battles.
- Corrected an inline dead-fixture assumption: hullHp=0 does not set isDead by
  itself; after explicitly marking the detached fixture dead, fighter/dead
  component queues drained with no capital messages. No gameplay fix was needed.
- Actual HUD temporarily showed 永久故障 for the selected TPC; the other TPC
  remained ready. Computed fonts stayed Segoe UI / Microsoft YaHei UI / Microsoft
  YaHei / sans-serif. The controlled live-HUD mutation was cleared by navigation.

Remaining scope:
- Complete engine/controller health integration and true permanent engine state;
  the legacy per-second CR selection is not the source per-component malfunction
  scheduler or LowCRShipDamageSequence. No source probability claim is made.
- Component transfers for other collision/explosion callers, full mutable-stat/
  hullmod integration, source-time modifiers, force-disabled/decorative API modes.
- Other weapon/API variants, beam-speed stats/multiray convergence, missile
  secondary effects, hulk dynamics/cleanup, HUD/environment differences and paired
  original captures. Typography stays an intentional exception. Full goal active.

Final checks for this increment:
- Final lint/typecheck/production build passed, main bundle index-BcZDz4YU.js.
  Scoped diff whitespace check passed after removing one new blank-line space;
  Git emitted only normal LF/CRLF notices. New source/audit whitespace checked too.
- Reloaded paused VIS-09/Onslaught at2s, actually venting, presentation ready,
  marks0/hulks0/beams0/arcs0, null battle result and GL0. Every live capital
  weapon is at full native HP and enabled; disable/repair queues are empty.
- New disabled_small/medium audio URLs each returned200; this checks serving,
  not byte identity or auditory playback. Browser errors0, autoplay warning1.
  No native font requests/probe globals; HUD remains the approved system font.
- No test files were recreated; no tracked/unignored project test files remain.
  No content/asset importer, hash/file-size verification, original-game writes,
  commits, agents or new tasks were used. Full fidelity is still not complete.


## 2026-09-16 — Engine controller health/lifecycle increment

This section supersedes the prior lazy engine-damage adapter. Readable system
fonts remain intentional; no test files or asset/content imports were added.
User feedback after this increment: shorten subsequent work to bounded changes
and necessary checks rather than extensive source investigations/regression runs.

Implemented:
- Shared ComponentHealth advance extracted without changing weapon interval,
  damage/repair behavior. EngineController initializes every engine at creation:
  native hull-size HP, width+length factor, independent repair-duration and health
  interval draws. Onslaught engines are four936HP and two1000HP, not equal-weight.
- Weighted ordinary-engine fractions, READY / FLAMING_OUT / DISABLED cascade,
  .5 normal / .99 extended-glow threshold, hull-size cooldown, accelerated2.5x
  health checks during flameout, no cascade repair, disabled-state damage immunity,
  full-health repairs and true permanent state. Critical/temporary malfunction
  contributions compensate the cascade threshold but not propulsion losses.
- Last ordinary engine disable veto while the regular system and extended glow
  are active; permanent flag is set before the veto, matching the inspected source.
  Optional systemActivated engine flag is accepted by the Web spec/loader/validator;
  its damage immunity and denominator/fraction exclusion are implemented.
- Ship motion discards thrust/turn commands during cascade/disabled states and
  retains inertia instead of inventing residual thrust or an immediate1-speed clamp.
  Ordinary motion uses the weighted penalty; zero-flux adds50 speed and10deg/s
  max turn rate, no invented acceleration bonus. Glow advance follows health and
  controller advance, including reset-to-zero and idle-first recovery.
- Engine disable queues emit the source320/80-diameter pair for a width20 nozzle,
  .2s lifetime, engine RGB and white core, with ship velocity; queue handling is
  one-shot and clears dead-ship events. Existing sound and floaty adapters remain.
- Visual-lab reset clears controller/health/permanent state, avoiding stale fixtures.

Checks actually completed (memory-only, no saved test scripts):
-116400 assertions:10800 weapon frames against the pre-extraction implementation
  and12000 engine-health frames against an independent double-precision translation
  of source health/repair equations (not a native float32 replay).
- Engine branch fixtures exercised profiles, weighted fractions, strict threshold,
  cooldown, force/cascade/repair order, permanent veto, system immunity, all-system
  denominator fallback, under-fire repair and repair multipliers before proceeding
  to the differential run. A reference-fixture omission of the permanent=false
  field was corrected; no implementation change was required for that mismatch.
-23 completed production-browser assertions on detached real ships: actual150
  energy rear projectile ->22.500001 armor ->11.250001 inner engine loss, with
  zero target RNG draws; deferred disable and same-frame repair; explicit particle
  colors/diameters/duration and one-shot/dead queue handling; no zero-flux accel
  bonus,14deg/s Onslaught boosted turn cap, and command-free inertial movement.
- Controlled60Hz force-flameout: FLAMING_OUT frame1, DISABLED frame61 atHP0,
  READY frame182 at fullHP, using a fixture2s repair duration. Permanent damage
  remained after11000 simulated seconds. The live VIS-09 baseline stayed unchanged.
- Two browser probe setup issues were corrected: missing collision localPoint,
  then an exact-decimal repair-boundary assertion affected by floating-point
  rounding. The completed probe steps past that boundary; no tolerance was added
  to gameplay repair completion.
- Typecheck/lint/build passed; production bundle index-CBioPaLX.js. Main preview
  loaded VIS-09/Onslaught at2s, ready, clean live engines, browser errors0 and the
  existing autoplay warning. No additional full seeded-combat smoke was completed
  for this increment. No hash/file-size verification, original-game writes, commits,
  agents or new tasks were performed.

Remaining: native passive damping/overspeed/drift and full mutable motion stats
(including deceleration integration), exact extended-shifter/API and system-only
engine rendering, the native glow's short acceleration hold, hull-style normal
engine sounds, source CR scheduling/critical side damage, system cancellation,
other explosion/collision component callers and the broader prior fidelity gaps.
The existing Ship early return for dead hulls remains; this is not a complete
native hulk-controller port. Full fidelity goal remains active, not complete.


## 2026-09-16 — Remaining live armor-hit component transfers

Bounded follow-up after the user's speed feedback: reused the existing21-cell
component helper in mine hull hits, both ship-ram hull sides, asteroid hull hits,
and fighter/capital flak airbursts. Transfers use actual armor+hull loss, zero EMP
for these existing non-EMP paths, and the source ship's component modifiers when
available. Mine source lookup is shared with its existing faction lookup. Shield
branches do not call the helper. No collision/explosion geometry, damage falloff,
fuse behavior or destruction behavior is claimed newly source-exact by this patch.

Typecheck/lint/build and scoped whitespace check passed (index-CgbP9maG.js).
Six production-browser assertions on detached real instances covered mine
 detonation/component loss, flak airburst/component loss, the mine's shield branch
(with its shield predicate forced true to isolate routing), and untouched live
engines. Controlled mine hit left engine0 at489.848001HP;500 fragmentation airburst
left926.625000HP, both from936. Live VIS-09 remained ready at2s, errors0/autoplay
warning1. No large regression suite was run; ship/asteroid collision transfers were
reviewed and typechecked, not individually replayed during this increment.

All current live-ship armor.takeDamage callers now route component damage. The
intentional dead-hulk disable-damage visual path still does not; native hulk health
advance, fighter-airburst shield handling and explosion-contact geometry remain
separate gaps. Earlier engine/motion/CR/visual gaps remain; goal not complete.
No test files, hashes, size checks, importers, original-game writes, commits,
agents or new tasks were added/run.


## 2026-09-16 — Unified flak ship/fighter damage routing

Replaced separate fighter/capital airburst damage loops with one deduplicated
Ship path. Active fighter shields now absorb fragmentation through the existing
shield/system/CR/flux calculation instead of leaking straight into armor and
components. Hull contacts retain the shared component map; phase/dead/friendly
filters are applied once. Offset shield range uses the actual shield center.
Lethal hull airbursts dispatch destruction for capitals as well as fighters.
Existing fuse/interception/FX and radius-based explosion-contact approximations
remain; this is not a complete native explosion-geometry or missile-effects port.

Build (including typecheck), lint and scoped whitespace check passed;
index-DkMRML9O.js. Nine production-browser assertions used a real detached
Paragon assigned to the fighter context (and deliberately duplicated in ships):
actual shield predicate/flux, protected hull/components, one shield event, one
unshielded hull hit/component loss, actual phase getter/immunity and clean live
engines.400 raw fragmentation gave60 hard flux in that fixture. An initial probe
incorrectly assigned Ship.isPhased, a derived getter; the completed check sets the
underlying phase state instead. No gameplay workaround was added for the fixture.
The actual stock fighter roster and lethal-capital FX were not separately replayed.
Live VIS-09 remains ready, system fonts unchanged. No test files, importers,
hash/size checks, original-game writes, commits, agents or new tasks. Full goal
still has the previously recorded motion/CR/visual/API gaps and remains active.


## 2026-09-16 — Native command motion / explicit braking

Replaced Ship's exponential idle drag and unconditional speed clamp with shared
ShipMotion command equations from ship/null: finite overspeed reduction, reverse
using deceleration, explicit velocity-opposing braking, half-turn-acceleration
idle angular braking, finite angular overspeed recovery, and hull-size lateral
acceleration (.25 capital / .5 cruiser / .75 destroyer+fighter /1 frigate).
Ship.java:2004-2014 confirms idle slow-to-max insertion above max speed; below
max speed idle preserves momentum. Disabled/cascading controllers still discard
commands. All movement stats apply the existing CR/engine hooks consistently.

Manual S now supplies full reverse; X supplies explicit braking. Updated the HUD
and both control-guide translations. clearInput and visual-lab reset clear brake
state; flame rendering does not treat held W as acceleration while braking.
Mouse steering now shares actual motion stats instead of the obsolete18%-floor
engine formula. The existing Web capital AI requests braking for stationkeeping,
and waypoint braking starts from closing-speed stopping distance. Analog inputs,
Web command ordering/AI, terrain and system modifiers remain adapters.

Nineteen inline numeric checks passed for glide, finite overspeed recovery,
braking/no reversal, reverse deceleration, all lateral multipliers, angular
braking, damaged-engine stats, flameout immunity and zero-flux stat separation.
Build/typecheck/lint passed, index-D-f__T7f.js. A5s production detached battle
with both capital AIs had600 finite ship observations. Real Ship motion retained
20 speed while idle, then X-equivalent brake state reduced it to15 over.5s;
clearInput cleared braking, and capital strafe multiplier was.25. This is a short
smoke check, not full AI/waypoint/long-battle or keyboard-event acceptance.
Live VIS-09 remains clean/ready at2s, errors0/autoplay warning1. Typography and
no-test-file/no-importer/no-hash-or-size-check restrictions were preserved.

Still open: asymmetric engine drift and its coordinate conversion, fighter wing-
leader slow-to-max exception, full mutable-stat/system/time integration, exact
native command ordering and broader CR/hulk/visual/API gaps. The whole fidelity
goal remains active. Earlier claims that native command braking/overspeed/strafe
are entirely unported are superseded by this section, not by full-parity claims.


## 2026-09-16 — Asymmetric engine drift and flame command timing

Resolved the local-axis concern: ShipHullSpecLoader constructs W from the two raw
location values, loading/String returns them unchanged, and EngineSlot.compute-
Position uses the same rotation equations as the Web renderer. Engine drift now
uses clamp(slot.y / (collisionRadius*.3),-1,1), weighted by maxHP contribution,
times2 and effective turn acceleration. Motion applies commanded turn, then drift,
then passive angular braking only without a turn command, as ship/null does.
Symmetric damage cancels; DISABLED has no drift and FLAMING_OUT still discards
motion commands. Passive braking can counter mild asymmetry at idle: this does
not claim every individual engine failure visibly spins the ship.

Ported G's two.05s forward/spread visual interlocks and short forward-flame hold.
Renderer now uses the controller's accepted flame-shape mode, rather than raw W
input, and preserves that mode during disabled fade/recovery. Scripted visual-lab
poses explicitly set it. System-only nozzle brightness/shape now uses the current
Web Burn Drive flame-length shift and the source quarter-level remap; general
ColorShifter/ValueShifter/API and custom/Omega rendering remain outside this patch.

Also corrected the original-format loader: native system engines are encoded by
contrailSize128 (ShipHullSpecLoader), not just the optional Web systemActivated
flag. The five generated built-in source hulls contain no128 markers, so no asset
or content importer/regeneration was required.

Twenty inline checks passed: drift signs/cancellation/system-engine exclusion,
state reset, motion ordering/countersteering, forward hold and reverse interlock.
Production detached Onslaught steering after symmetric left/right nozzle failure
produced opposite drift terms +/-0.016159313 rad/s²; the same.1s turn command
produced0.007459624 vs0.004227762 rad/s. Hold persisted at.04s since command and
expired at.06s. Build/typecheck/lint passed (index-zBWg3tTG.js); live VIS-09 is
ready at2s with clean engines, GL0, errors0/autoplay warning1. No full visual-pair
comparison or system-only mod-nozzle browser scene was performed this increment.
No tests, hashes/size checks, imports, original-game writes, agents or tasks added.
Full fidelity remains incomplete for the previously recorded CR/hulk/API/stat/
visual gaps; drift-axis and short-flame-hold gaps above are now superseded.

### 2026-09-16 — Per-component low-CR malfunction scheduling

Supersedes earlier descriptions of ship-wide random weapon/engine failure.
Weapon and engine malfunction sampling now occurs at eligible component health
checks, with a critical roll only after that component fails. Idle weapon batteries
and unused engines do not independently fail through this scheduler. Normal and
critical CR thresholds use the source .001 offset and the supported dynamic range
multiplier; shield scheduling is still the separate legacy high-flux timer.

Critical weapon failures apply the last-eligible-weapon/zero-CR permanence policy,
empty finite ammo and remove permanent mounts from all groups. Engine permanence
is capped at .66 weighted contribution; a critical event can still inflict side
damage when permanence is vetoed. Critical self-damage uses the source hull-HP
base formula and direct-hull versus energy-contact branches, and queues actual
armor/hull damage presentation once. Permanent components stop subsequent repairs;
the source same-advance partial-heal quirk is retained. No ship-wide independent
critical picker remains. Post-lethal weapon firing is skipped.

Verification: the preceding implementation pass reported 27 memory-only checks
and a successful build/typecheck/lint (index-Dksd4KKa.js). This closeout reloaded
that production bundle and passed 9 detached browser checks: idle low-CR gating,
finite-ammo fixture, permanent ammo/group removal, actual hull self-damage,
subsequent repair freeze, presentation queue consumption, weighted engine cap,
and 3 simulated seconds of healthy combat. The forced weapon event removed
468.75 hull HP; six forced Onslaught engine critical callbacks left permanent
contribution 0.6518105849582173, below .66. The live paused VIS-09 remained ready,
with 20000 player hull HP and WebGL error 0. This was a bounded runtime check,
not a full battle, native visual comparison or complete regression suite.

Still open: native shield timing/range integration, LowCRShipDamageSequence,
travel-drive/control-lock exclusions, exact native weapon lifecycle/decorative/API
variants, and the previously recorded hulk/stat/visual gaps. Web weapon cooldown
is the current adapter for the native non-idle firing tracker. Typography remains
Segoe UI / Microsoft YaHei by user preference. No project test files, hashes/size
verification, content importers, original-game writes, agents or tasks were added.
Full-fidelity work is not declared complete; this pass closes only this increment.

### 2026-09-16 — Shield CR timing, recent-hit gating and forced overload

Supersedes the legacy one-second high-flux-only shield-lowering adapter above.
Ship.java:288,1919–1921,2207–2212 and util/IntervalTracker establish randomized
.75–1.25s checks, a strict flux > .75 gate, an active ordinary shield and a real
shield-damage age < 1.25s. The Web interval now initializes per ship, discards
overshoot on the following advance, advances on the effective ship clock, and
consumes the failure roll only after eligibility. Actual absorbDamage contacts
reset a separate damage-age clock; visual-only hits do not. The existing direct
asteroid-flux contact also records damage age without changing its damage formula.

CRPluginImpl's shield threshold uses .1 * range multiplier (no .001 subtraction),
now wired through the CR effect getter. Its non-fighter guards now also exclude
fighters from weapon/engine/critical/shield CR chances and zero-CR defense/system
lockout; movement/damage CR modifiers still apply. These are the supported Web
stats, not a claim that every native mutable stat/API modifier is represented.

Shield failure now calls forceOverload(0): hull-size-base overload rather than a
simple shield toggle, without fabricating max flux or ordinary hit-overload audio.
FluxTracker follows D.java:516–570 guards against interrupting venting or restarting
an existing overload. A localized shield-failure notice is consumed once, replacing
the generic overload notice/radio for this cause. Current overload discharge FX
remain the existing Web presentation. Visual-lab preparation resets the new state.

Build/typecheck and lint passed (index-fcZTtjyT.js). Sixteen detached production
browser assertions passed, including no cosmetic/high-flux-only failure, recent-hit
10s Onslaught overload at unchanged 80% flux, strict age/flux boundaries, phase
exclusion, dynamic range, actual Broadsword fighter exclusion, vent/overload guards,
interval overshoot discard, one Chinese failure notice and 3s healthy combat.
Live VIS-09 remained ready with WebGL error 0; initial page console errors0 and
only the existing autoplay warning1. No appearance screenshot or broad regression
suite was needed for these state changes.

Remaining CR gaps include LowCRShipDamageSequence, native lifecycle/control-lock/
travel-drive exclusions, all modifier/API and EMP-only contact variants. The hulk,
weapon-plugin/stat and native paired-visual acceptance gaps remain open. No project
test files, hash/file-size verification, imports, original-game writes, agents or
new tasks were added; original bitmap fonts remain intentionally excluded.


### 2026-09-16 — Deployment-only LowCRShipDamageSequence

The previously missing deployment damage sequence is now implemented for Web
ships. CRPluginImpl.applyCRToShip starts it only below the dynamic critical
threshold, outside the fighter/control-lock exclusions. Ship.applyDeploymentReadiness
provides the explicit entry hook; otherwise the first actual ship update captures
currentCR once as crAtDeployment. Later CR decay does not start another sequence.
Explicit reapplication is a new deployment; visual-lab preparation clears the
snapshot/sequence. The default 70% deployment remains unaffected.

The sequence follows LowCRShipDamageSequence, IntervalUtil and picker(true):
first interval .25–1s drawn before the 1–3s delay; strict elapsed > delay; one
attempt per elapsed interval; overshoot discarded next advance; uniform target
selection without replacement. Initial usable weapons come from the group list,
not every installed mount, followed by ordinary engines. Attempt count uses the
source severity/target-count rounding, minimum one and doubling at severity >= 1.
Critical-chance multiplier feeds both conditional critical probability and sequence
severity; zero multiplier deliberately preserves the source minimum-attempt rule.

Each attempt rechecks permanent-disable eligibility, permanently prunes rejected
targets, and consumes an attempt even if none remain. Weapon failures share finite
ammo/group removal; engine failures use the .66 weighted-contribution cap. Both
apply existing critical self-damage and event presentation. An explicit critical
event can revisit an engine already disabled since the deployment snapshot; its
permanent contribution is accounted per event as in Ship.applyCriticalMalfunction.
Per-component health scheduling still excludes permanent engines before sampling.

The plugin clock is world dt before phase scaling and does not advance for zero
dt or absent ship updates. The Web adapter releases its sequence immediately when
a ship is destroyed; native plugin hulk removal is checked after its delayed
interval block, so exact post-destruction plugin ordering remains with the broader
native hulk lifecycle gap. Runtime control-lock exclusions outside the explicit
deployment hook and complete mutable-stat/API representation remain incomplete.

Build/typecheck and lint passed (index-DAjWQbyX.js). Seventeen memory-only production
browser checks passed: draw order, attempt formula, strict delay/zero-dt, first hit,
no catch-up/recovery cancellation, no restart on ordinary CR decay, fighter/lock/
threshold/range guards, zero multiplier behavior, last-weapon pruning, engine cap,
real ship-update lifecycle, phase-independent clock, destruction cleanup and 3s
healthy combat. The actual 10%-CR Onslaught update fixture completed its sequence
and retained 19041.306 hull HP after 10 simulated seconds. The engine-only fixture
consumed six attempts and stopped at .5 permanent contribution. Live VIS-09 stayed
ready, WebGL error0; page console errors0 with the existing autoplay warning1.
No project tests, hash/size verification, importers, original-game writes, agents,
or new tasks were added. Existing broader weapon/hulk/stat/visual gaps remain open.


### 2026-09-16 — User-reported protection before shield visually unfolds

Reproduced a false full-circle proximity trigger: a Paragon with only30/360°
deployed reported no shield coverage at90°, but flak at radius+5 still airburst.
The capital-ship fuse branch used shield.isActive to select the entire shield
radius, or the broad hull radius, without checking angular coverage. Ordinary
projectile collision already used currentArcDeg and was not changed.

Capital-ship proximity now measures distance to the actual deployed shield arc
(including its true endpoints and offset center) or the authored hull polygon.
A hull bounding radius is only the fallback when no valid outline exists. An
off/fading shield has no contact surface. Unopened arcs cannot create invisible
proximity protection; already deployed sections remain effective immediately.
Explosion damage/falloff and fighter/missile fuse thresholds are not changed.

Build/typecheck/lint passed (index-VuNrs0C_.js). Eleven production-browser checks
passed: the reproduced side stays clear at30° and triggers at360°, front/endpoint
contacts remain valid, zero-arc/off states stay clear, real hull contact still
triggers, shield offsets work, range expiry remains, and ordinary projectiles
pass unopened sides then hit at full deployment. One initial fixture incorrectly
assumed Paragon's center was solid hull; its native authored outline includes the
central gap, so hull contact was correctly rechecked at an actual outline vertex.
VIS-03 at1.2s shows a partial forward rim matching35.81° collision coverage
(37.80° visual fringe included), ready/GL0, console errors0/autoplay warning1.
No project test files, hash/size verification, importers or original-game edits.
This fixes the demonstrated fuse mismatch, not every remaining fidelity gap.


### 2026-09-16 — User-reported Mark IX / Hypervelocity Driver mismatch

Confirmed the current Onslaught's two kinetic types are mark9 and hveldriver.
Compared their source CSV, .wpn/.proj, sounds.json, BallisticProjectile, OoOO and
renderers/N rather than tuning fire rate by impression. HVD's CSV EMP400 was
missing: empPerShot now passes through the loader/spec, generated HVD entry and
spawned projectile into the existing armor/hull component-damage path. Both guns'
adapter collision-radius overrides were removed: native7.5 width gives3.75 radius,
not Mark IX7 or HVD6. Damage/speed/burst/cooldown data remain source-derived.

The native textured BALLISTIC branch was incorrectly drawing a centered full
length bullet sprite and scrolling rectangular trail/body pair. It now keeps a
muzzle-started OoOO-style trailing endpoint, growing to authored length, and draws
N's additive aspect-correct forward bullet nose plus tip/head/tail fringe strip.
Nose length uses the sprite pixel aspect, not .proj trail length: HVD10x14 and
Mark IX10x12 textures yield10.5 and9 world-unit noses at7.5 width, rather than
120 and40-unit stretched bodies. Core/fringe color and brightness-squared alpha,
transparent fringe ends and source UV phase are preserved. Other source-format
sprite BALLISTIC shots use this same branch; MovingRay and legacy fallbacks stay
separate. Native post-impact/range-expiry ballistic fading is still not ported.

Sound now uses the actual HVD loud sample at pitch1/volume.85, and Mark IX's
.75/.775/.8 pitch variants without generic jitter. Copied only the required loud
sample into the Web asset tree; its manifest entry intentionally has no hash/bytes.
No importer or hash/size check was run. The original installation was read-only.

Build/typecheck/lint passed (index-CEHSWgaD.js). Detached production checks confirmed
HVD275 kinetic/400EMP/1000speed, Mark IX200/0EMP/800speed, both3.75 radii, muzzle
trail initialization and increased real component health loss with HVD EMP enabled.
Held-fire checks confirmed Mark IX four-shot2.3s cycles and HVD2s refire within
fixed-step tolerance; first-burst subframe ordering is not claimed exact. The
initial strict speed equality check needed floating-point tolerance. An attempted
live audio-source capture did not verify playback in the visual-lab environment;
in-memory checks of the real sound sampler verified all native pitch/volume
variants, and HTTP200 confirmed the new sample is served. No listening comparison
is claimed. Production HVD and Mark IX scene screenshots at1.18s showed short
forward noses and tapered rear trails; live trail lengths were120/40 respectively,
ready/GL0, page errors0 with the existing autoplay warning1. This is not a paired
original-game capture comparison or full weapon-API acceptance. No tests added.


### 2026-09-16 — Cross-weapon source-contract sweep (all 17 currently registered weapons)

User requested the same kinds of mismatches be addressed across the implementation,
not only Mark IX/HVD. This section supersedes the earlier ballistic-fade, sound and
missile explosion-damage gaps where explicitly described below. It is a bounded
source/implementation sweep, not a claim that every native weapon/API behavior has
been completely ported or that paired original-game acceptance has passed.

Source contracts and regression boundary:
- Read every registered weapon's CSV/.wpn/.proj through the loader in memory. All
  17 generated weapon objects now match its complete mapped source fields (zero
  differences). The hash-producing content/asset import commands were NOT run.
- Removed ALL adapter collision-radius and visual-spawn overrides, not just the two
  kinetic guns. Native radii now also reach Mauler4.5, flak3.25, dualflak2.25,
  lightMG1.75, Heavy Blaster3.5, TPC17.5 and Autopulse10. The registry rejects future
  adapter keys except sound aliases and the legacy muzzle-flash color/size fallback.
- MIRV/fuse definitions, Sabot child material/onHitEffect and missile explosionSpec
  now originate in the loader, rather than separately maintained gameplay adapters.
  The existing importer was edited for reproducibility, but never executed.

Firing lifecycle:
- Mapped projectile chargeTime, autocharge and interruptibleBurst. Autopulse was
  previously firing with chargedown only, omitting its .05s charge; it now has the
  native .05+.05=.1s cycle. Charge release follows autocharge, and alternating-group
  cadence includes chargeTime. A cooldown-completion frame cannot spend its whole
  dt again on the next charge. Newly emitted bursts cannot advance twice that frame.
- Fixed floating-point timer boundary slippage for cooldowns/burst intervals.
  Mark IX first intervals are now .1s and its cycle2.3s; Mauler5s, HVD2s, TPC.2s
  and lightMG.8s were exercised. This is fixed-step verification, not a claim about
  all native subframe/modified-RoF paths.
- Noninterruptible bursts reserve the full burst flux at first emission, as tracker
  B does, without charging every subsequent round twice. Insufficient full-burst
  capacity prevents the first shot; disabling/interruption/end clears the latch.

Projectile lifetime and presentation:
- Added SourceProjectileLifecycle for ordinary source BALLISTIC and moving rays.
  Range consumes source-relative speed, not inherited ship/world velocity. Source
  tail growth, native fadeTime, squared damage/EMP decay and soft-flux late hits
  now continue past nominal range instead of instantly deleting the projectile.
- Impact remnants retain their head/tail and cannot damage twice. Tail catch-up and
  interpolated fade brightness use the same source state in renderer and simulation.
  Existing MovingRay visual-only impact remnants are skipped for managed shots, so
  the effect is not doubled. Scripted visual poses carry the same material/fade data.
- Heavy Blaster and lightMG are still MovingRay gameplay objects, but their native
  bulletSprite now selects N's textured-bullet renderer, not an unrelated untextured
  beam strip. Sabot child rounds similarly use their actual sprite. Source glowRadius
  follows fade rather than staying bright after its projectile disappears.

Source sound data:
- Added weapon-sounds.json containing source samples/pitches/volumes for every mapped
  fire/intro/loop plus flak explosion and Sabot split sound. Corrected Mauler's loud
  sample; Reaper, Sabot and Atropos no longer use the Annihilator sample; Burst PD
  uses heavy_burst_laser_fire_01.ogg. All actual native pitch choices are retained.
- One-shot playback keeps the chosen variant and stereo position across asynchronous
  loading. Aliases/variants decode a shared sample only once. Continuous beams use
  their loop, not a single playback of that loop; intro fires at charge start.
  Loop shutdown follows presentation/pause/source-weapon state.
-49 in-memory checks of the actual SoundManager sampler matched source pitch,
  volume and sample selection. This is NOT an original-vs-web listening comparison.

Collision/secondary effects:
- Projectile/missile contacts are swept against actual target radii, not a lightMG-
  only 24-unit endpoint bubble. Earlier ship/hulk/asteroid blockers win. TPC can
  pass through several missiles and records already-hit identities. Its destroyed-
  fighter passage is retained through the rest of the same segment.
- Beam contacts can damage/intercept missiles in front of the nearest ship, using
  the existing brightness-squared damage clock; tactical laser and Burst PD were
  exercised. Full native point-defense target-selection AI is not claimed.
- Beam shield coverage uses >0 deployed arc, removing the unrelated >5-degree gate.
  Flak splash now uses an actual hull/arc contact point instead of circular phantom
  armor, sharing ExplosionContact with the newly ported torpedo splash damage.
- Sabot uses +0..range speed/split-distance variance, inherited parent velocity,
  source angular/ETA split gates, the5-unit forward split point and actual split
  smoke/sound. Its five200-damage/200-EMP warheads carry1.75 radius and the source
  .25-probability extra EMP-only on-hit arc. Removed the invented pair of automatic
  electrical arcs on every ordinary EMP projectile hit (including HVD).
- ProjectileExplosionSystem implements Reaper/Atropos explosionSpec damage:
  duration, core-to-radius linear falloff, once-per-entity tracking, direct-target
  exclusion, moving origin and asteroid damage/shatter callback. The native
  HITS_SHIPS_AND_ASTEROIDS class allows friendly/self ship splash but excludes
  fighters and missiles. The cosmetic top-level explosionRadius is NOT its damage
  radius. Dedicated explosionSpec particle/detailed-flash rendering remains open.

Verification:
- Build/typecheck/lint passed; final production bundle index-D8W6dp6Y.js.
-43 detached checks exercised all17 weapon fire paths, damage/EMP and applicable
  complete firing cycles;36 exercised seven source shot types' inherited-velocity
  range, live range fade, reduced/soft damage, HVD EMP fade and final cleanup.
-10 checks exercised swept missile interception in both projectile-array orders,
  two-missile TPC passage, stationary impact remnants and no duplicate hull damage.
  Six Sabot checks covered child count, positive speed variance, inherited velocity,
  source geometry/sprite, EMP/plugin/lifetime and split point.
- Eight torpedo splash checks covered direct-target exclusion,4000 core/2000 half
  falloff, friendly-fire class, fighter exclusion, no repeat damage, late contacts
  during.1s duration and expiry. Two beam checks destroyed a missile with tactical
  laser/Burst PD. Six further checks covered burst-flux reservation/no double cost,
  insufficient capacity and autocharge release. Float armor accumulation required
  a.001 tolerance instead of exact HP equality; this was fixture precision, not a
  source-damage retune.
- Replayed all17 existing WPN scenes at1.18s: ready, finite projectile state, GL0 and
  zero page errors. Initial replay probing caught the expected intermediate asset-
  loading state after a fixture swaps weapon; final checks wait for the seek plus
  resource preparation. Autoplay warning remains (one per loaded page).
- Three15s integrated combat runs (Onslaught/Paragon/Doom) completed with finite
  ship/projectile/flux values on the final bundle. Live Mark IX is paused at1.18s,
  ready/GL0. Heavy Blaster screenshot at.82s was inspected for the corrected small
  forward textured heads/tapered trails, not used as a paired native comparison.

Remaining boundary (do not report the whole fidelity task complete): native missile
unarmed physical contacts/fizzle lifecycle, complete PD targeting and beam environment
occlusion, explosionSpec detailed particles/flash timing, mutable-stat/weapon-plugin
API variants, full native collision/hulk lifecycle and paired original captures.
The sweep covers17 already imported weapons, not the entire original weapon library.
Readable system fonts remain intentional. No project test files, hash/size verification,
original-game writes, agents, commits or new tasks were added.

## 2026-09-16 — Game-level state and combat handoff foundation

- App now retains GameSession above CombatSession. Serializable game contracts,
  structural/version validation, injected save storage, and live-combat DTO
  adaptation live in src/engine/game; combat does not import storage or game state.
- Free sandbox and durable fleet sorties are distinct. Only fleet outcomes write
  back owned hull/armor/CR/ammunition. Pending encounter identity prevents repeated
  settlement; an explicit retry restores the original checkpoint rather than
  repairing a damaged deployment. Settlement pauses the authoritative simulation.
- Added the HUD fleet/save panel with local checkpoint persistence, explicit fleet
  deployment, JSON import/export and confirmed new-game replacement. Future or
  malformed saves and missing required content are preserved, not silently reset.
- Visual Lab is ephemeral and does not read/write the gameplay save. Existing
  combat renderer, imported weapon behavior and modern HUD font choice are retained.
- No campaign map, economy, repair, salvage, fleet acquisition or mid-battle save
  is claimed. Component malfunction states and fighter inventory are not durable
  fields in this first contract. See game-architecture.md for exact scope.
- Memory-only checks covered validation, idempotency and storage failures; isolated
  browser checks covered sandbox isolation, damaged deployment/settlement/redeploy,
  death, checkpoint reload, import rejection and Visual Lab save isolation. No
  project test files or content importer/hash audits were introduced.

## 2026-09-16 — Source-provenance audit after the UI pass

A fresh read-only source audit found unresolved native conflicts/custom rules: fake
600 mine damage text, mine specs/lifecycle, universal flares, range modifiers,
refit mount colors, baseline-vs-effective readouts, curated variants, heuristic AI,
command points, replacement rates, custom result ranks and inaccurate ship text.
Collision coefficients remain unverified. See source-fidelity-audit-2026-09-16.md
for exact evidence and scope. All 17 generated weapons matched the converter's
mapped source fields; that does not validate gameplay adapters or omitted fields.
Only audit documentation changed; no numeric retuning or user-save mutation.


## 2026-09-16 — 清除无依据能力/读数及冗余 UI

按 source-fidelity-audit 的有证据项目落地：通用诱饵移除，原生射程/PD/挂点类型统一，空雷真实时序和伤害/可拦截实体接入，冲刺推进持续幅能与 CP 基本恢复校正。资料页只承诺自定义沙盒预设和实际装备查看；删除假评级、蓝图入口、未使用 HUD 面板、空机库/无系统提示及重复控件。保留用户要求的 Segoe UI / Microsoft YaHei。

验证：typecheck、lint、build，内存断言和隔离浏览器交互；没有生成测试文件，没有资源哈希/大小验证。详细修复范围及未完成的 AI、碰撞、机库流程/原生预设移植，见 source-fidelity-audit-2026-09-16.md 顶部状态，不把适配层宣称为完整原版。
