# Component replication: owned armor cells, first vertical slice

## Scope before coding

The requested architecture is larger than one component. Implement mutation-driven armor-cell capture, immutable encoded storage, bounded exact-content decode reuse and revision-checked restore skipping in the actual authority/guest path. Reuse existing per-peer byte-delta baselines, independent motion and reliable muzzle/sound paths. Do not claim all ship components or lifecycle messages have been converted. Full self-contained SWF3 snapshots remain the recovery contract: no new missing-baseline dependency, fake ACK or queue change. No new protocol revision, scalar quantization or frequency reduction.

## Native evidence → invariants

Local decompiled starfarer_obf/com/fs/starfarer/combat/entities/ship/new.java:391–410 implements bounded getArmorValue, setArmorValue and direct getGrid access. Native API exposes mutable armor, so simply trusting dirtyVersion while arbitrary callers hold the array would be incorrect. Existing Web ArmorGrid.setCell/getCell and damage formulas remain numerically unchanged; a private mutation revision is added without changing public dirtyVersion behavior. Existing Float32 storage and callback order remain unchanged. Original version is the locally investigated 0.98a tree; original desktop visual verification is not performed.

Ownership rule: the native component may reuse captured bytes only while the mutable backing array has not escaped. Public cells remains enumerable/readable/writable and returns the original mutable array for compatibility, but accessing/replacing it permanently disables trusted reuse for that grid. Safe internal reads use getCell/copyCells; known bulk writes use tracked methods. Unknown accessors/subclasses retain generic paths. No Proxy and no per-tick whole-array diff to detect host changes.

Validation correction: HUD/tactical consumers are display DTOs, not live ArmorGrid instances. Their original in-range array reads are retained; CombatHudProjector uses an owned copy so display projection does not escape live armor storage. A concurrent workspace change supplies ArmorReadCache for the tactical projector and is preserved, not overwritten. No drawing coordinates, colors, interactions or layout changes. Cold apply, direct external mutation, replacement, reset/skip/reconnect, new grid with reused ship ID, malformed blocks and bounded cache ownership must be checked. Immutable decoded blocks expose only copies and copy-into methods, never mutable retained storage. Cache hits require complete byte equality, not an untrusted revision/hash claim.

## Validation

One coherent implementation, then one typecheck, changed-file lint, existing codec/motion/relay tests and extended existing native-capture fixture. Do not rerun the five-browser startup or sustained-overload scenarios from the prior turn without a specific fix; those unresolved failures are not acceptance for this work. Use existing native trajectory to compare source/RNG/viewer semantics and demonstrate actual reuse, not claim RTT/FPS improvement from counters. Preserve prior numeric-block optimization, all unrelated WIP, 60Hz targets and all fields/events. No commit/push/install/release/campaign packaging.
