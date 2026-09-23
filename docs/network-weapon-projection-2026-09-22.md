# Weapon presentation projection: omit authority-only work state

## Before implementation

Transport/replica change only. Do not change native 0.98a-RC8 AI.advance -> Ship.advance ordering, physics rate, RNG or weapon rules. No UI change/desktop verification required. Local native evidence previously verified at `../decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1485–1503`. This is a Web networking projection, not a native simulation checkpoint.

Consumer audit in `artifacts/record-deltas-20260922/weapon-field-consumers.txt`: fireControl, fireControlTargetShipId/ProjectileId, cycleTargetShipId/ProjectileId, burstFluxReserved, lifecycleDt and aimIdleSeconds are used by authoritative AutofireController, TacticalNavigation/FriendlyFireLaneIndex, weapon progression and multicore owner validation. None is read by renderer, HUD, network replica, LocalFirePrediction or LocalTurretPrediction. CombatSnapshot is explicitly presentation-only; authority checkpoints do not use it.

Remove these 8 fields ONLY at native WeaponMount path + ordinary Object prototype, before recursive pack. Preserve plain/generic capture and same-named properties elsewhere. Preserve ammo, burst/cooldown state, barrel index, trigger, damage/repair, angle, spread, recoil/glow and all other fields. No mutation of authority objects, no changed-only write instrumentation. Existing decoder understands shorter layouts; retain old restorer shapes and add exact new shapes.

Gate: cold/active/skipped frames, local display edits, custom prototype fallback, full remaining projected state equality, unchanged authority/RNG and old packets; actual generated-restorer hits; paired capture/encode/decode/apply, then actual host/guest only if beneficial. Original path selectable for controlled comparisons. Do not infer a performance result from smaller packets.


## Implemented / enabled

`captureAuthorityCombat` now enables weaponPresentation by default; `VITE_LAN_PRUNE_WEAPON_AUTHORITY=false` retains the original authority projection. `captureCombat` and `captureHostCombat` legacy defaults remain full, including native diagnostics. The final optional explicit argument controls this independent projection. Component-journal mode stays full and OFF; its own full-field parity fixture passes with this option explicitly disabled. No new wire markers/protocol change are needed: existing frame-local layouts describe shorter records.

Traversal plans have distinct full vs presentation cache identity. Same-shape toggles cannot reuse the wrong omission set. Retained scalar/object fields still restore normally and correct local angle/ammo writes. Generic/custom prototypes and same-named properties elsewhere remain untouched. Native raw Object.values still reads source properties; only the omitted subtree recursion/value packing/encoding/restoration is removed. Do not claim all authority reads are gone.

Cold testing found an initially missing 27-key layout; added it along with the warmed and fixed-display-compatible exact shapes using the existing generator. Existing old layouts are retained.

## Measured results

32-ship paired ABBA exact same host state, 160 samples per arm, capture+encode+decode+one apply:

| ms | Full work-state projection | Presentation projection |
|---|---:|---:|
| Capture P50 | 2.0025 | 1.7093 |
| Encode P50 | 1.2812 | 1.1146 |
| Decode P50 | .6446 | .5712 |
| Apply P50 | 1.6888 | 1.5528 |
| Total P50 | 6.1265 | 5.2885 |
| Total P95 | 8.9782 | 7.8388 |
| Full binary bytes P50 | 140411 | 126664 |

Total median ~13.7% lower; unlike record templates, all four CPU stages improved. Earlier two same-state measurements also showed lower total median (~10–15%), but final scoped test above is the recorded result.

Actual room ABBA: 48 ships, 1 room, 2 isolated native-apply peers, 8-second active windows. Independent motionAuto ON and prediction compression OFF in BOTH arms (do not confound the prior compression-policy change):

| Run | Host produced Hz | Guest apply Hz (peer2) | Physics Hz | Input→apply P50 ms | P95 ms |
|---|---:|---:|---:|---:|---:|
| Full A1 | 33.09 | 33.21 | 57.81 | 38.30 | 125.90 |
| Projection B1 | 34.60 | 34.60 | 58.96 | 35.11 | 124.44 |
| Projection B2 | 36.57 | 36.70 | 58.16 | 35.09 | 117.03 |
| Full A2 | 33.11 | 33.23 | 57.97 | 39.12 | 128.49 |

Observed mean host/guest Hz improvement ~7%; input-apply median ~9% lower. Physics improved slightly in these runs, not evidence of a large simulation-kernel gain. This is genuine apply, not receive FPS; still no browser RAF/GPU/WAN guarantee. CPU consumed is roughly flat as more frames are processed; packet size reduction is not equivalent to reduced total Mbps at a higher publication rate.

## Validation and next boundary

- Typecheck, changed-file lint and generated restorer --check pass.
- Existing 7 capture-plan cases pass, including evolving combat, layouts, generic accessors and source/packet ownership.
- New fixture covers 2260 field occurrences /392 nonempty fireControl objects, cold and skipped frames, JSON/SWF3, local angle/ammo corrections, custom prototype fallback and the production default.
- Native capture regression: 26 passed /2 existing opt-in benchmarks skipped; component full-read-set comparison needed explicit projection rollback, then its targeted lifecycle/delta/JSON/tape test passed.
- RecordDelta 15 cases and retained FixedDisplay integration pass; both experiments remain OFF by default.

Next candidate from read-only analysis: frame-local factorization of primary ShipSystem alias (`ship.system === ship.systems[0]`). Do not impose that alias on a locally split target, do not use arbitrary cross-entity refs or retain target/wire objects across frames. Requires protocol gate and identity/cold/skip coverage before implementation. Not implemented in this block.

Aim/preAim query reuse was reviewed but not implemented: purity/invalidation proof beyond the current >=100 roster guard is incomplete, and broadening that guard may add more overhead than it saves. No pretend simulation optimization or AI frequency reduction.
