# Native combat ownership: evidence and rewrite boundary (2026-10-04)

## Status and original evidence

**Diagnosis only; no new production optimization, no 50% acceptance.** The user requires unchanged entity/mount counts, dt, simulation/prediction frequency, screen-external combat, geometrical results and full-step timing. A new same-round complete-step A/B is required for any subsequent speed claim.

Original target: 0.98a-RC8. `C:/starsector-core` and `C:/decompiled` are absent (checked again). Original source and native behavior equivalence remain pending. No UI changes, desktop/window/input operation, visible browser, packaging or release. This investigation compares the current Web execution only.

Minimum comparison: original evidence unavailable -> preserve existing Web phase order/precision/RNG/control and effect behavior -> present implementation has mixed object/numeric ownership -> verify a future replacement with complete raw, both RNGs, AI/defense and tracker witnesses, including mutable/custom-reader boundaries. A final snapshot alone is not that replacement acceptance.

## Separate the current baseline from rejected designs

- The previous unprofiled resident-planning ABBA was 34.5631 -> 100.5188 ms. Its generic whole-world projection/codec/hydration was rejected and production restored.
- The frozen **current** profile/diagnostic bundle explicitly defines `VITE_COMBAT_STATE_CORE=false` and `VITE_COMBAT_NUMERIC_MOTION=false`. Neither the failed accessor-backed core nor the failed whole-world resident Worker is part of that baseline.
- `CombatStateCore` installs descriptor adapters over an interleaved Float64 numerical table. Its storage is resident, but its computational consumers remain object-based. The earlier failed ownership experiment is not proof that native array computation is slow; it is proof that retaining accessor-based rules is insufficient.
- `CombatKinematicsStore` describes its own capture/commit ownership transfer: objects own the pose after commit, the next capture imports changes. It is not a sole authoritative numerical owner. It is also disabled in this diagnostic arm.
- `NumericAcquisitionFrame` supplies a phase-local Float64 contact plane; fire/tracker/controller/mount state still flows through objects. `NumericalFleetPlanner` takes `FleetUnit` objects and numerical scratch matrices, not resident SoA units. `CombatDecisionScene` navigation nodes and `NumericAcquisitionTree` nodes are objects. Therefore the computational graph is partly numeric, not an end-to-end native-owned simulation.

These are implementation facts. They do not establish any specific number of milliseconds lost to cache misses or data conversion.

## New diagnostic: V8 is not completely stable after warm-up

Artifacts: `artifacts/combat-native-cost-boundary-20261004/`.

`deopt-current.mjs` reuses the existing frozen `current.mjs` and seed917 scene. It executes150 warm +120 steady complete steps. `fs.writeSync` markers separate construction, warm, steady, final capture, serialization and shutdown. No performance score is taken from this traced execution.

The steady120 steps contain:

| Recorded event | Count |
|---|---:|
| Bailout |176|
| Optimization dependency invalidation |100|
| Wrong-map bailout |106|
| Field-type constness invalidation |68|
| Prototype-chain invalidation |28|

These are **events**, not unique functions or CPU-time attribution. A wrong-map event does not, on its own, identify the offending object, the field write or a fix. The dependency messages are not proof that application code explicitly patches prototypes. The trace supports investigation of heterogeneous receivers and lifecycle field transitions, but **does not prove deoptimization is the dominant34ms cause**. Hardware cache misses were not measured.

`analyze-ownership.mjs` deep-compares the final tick270 complete captured snapshot plus simulation and visual RNG witnesses with the earlier profiled run. It passes. This verifies this diagnostic's final observation, **not per-tick AI/defense/tracker equivalence** and not any new engine implementation.

`ownership-diagnostic.json` records bundle/driver/trace hashes and all phase counts. Capture/serialization/shutdown invalidations are excluded from steady counts. The earlier unphased trace is exploratory evidence only.

## Actual execution coverage, rather than hypothetical savings

The existing sampled profile's disjoint wall-stage marks sum to37.0164ms; its complete wall mean is37.0747ms. Profiling overhead is present, so these are **not a new unprofiled ABBA baseline** and cannot be compared to34.5631 as a regression or gain.

- Fleet and root/module AI planning/admission:13.3506ms.
- Fire query:9.0060ms.
- Remaining marked stages:14.6597ms.
- Illustrative equal four-way division of the first two with **zero** preparation/communication/synchronization cost: `14.6597 + 22.3567/4 = 20.2489ms`.
- Half of this same marked profiled execution:18.5082ms.

This arithmetic is not a strict lower bound: an algorithmic rewrite can also reduce work, and a real schedule can distribute different work. It does show why a repeat of the **unchanged-work, fire/AI-only four-lane** route lacks sufficient coverage. A successful design must additionally reduce actual work/input costs and/or cover more stages. It cannot merely promise a smaller serializer.

The profile attributes about0.6381ms **exclusive** to `NumericAcquisitionTree.ts`. The tree does build object nodes and fresh traversal stacks, but the evidence does not support5-8ms of recoverable cost there. Never sum overlapping inclusive hotspots or stack a rejected Worker's codec cost onto the current baseline.

The unexecuted `combat-native-oracle-budget-20261004/build.mjs` remains an unfinished diagnostic artifact. No record/replay driver, correctness result, budget result or performance acceptance exists. Expansion is stopped: replay cannot establish native data ownership or its real preparation costs, and the current stage evidence already provides a coarse coverage gate.

## Required native rewrite domain and write ownership

This is an implementation contract, **not implemented code**. It deliberately describes real authority and mutation, rather than a wrapper that regenerates object inputs for a Worker each step.

| Domain | Sole numerical writer / publication | Required consumer and sequencing |
|---|---|---|
| Entity pose/lifecycle/assembly links | Authority state/motion/collision/effect stages, stable slot+generation | Fleet, threats, navigation, acquisition and collision use numeric slots directly; root/module sync, docking, recoil and displacement write the same authoritative storage |
| Fleet tactical allocation | Fleet solver with stable contributor order | Preserve sequential claims, tie order, summation order and orders; no parallelization of shared claims |
| Root/module AI controller memory | Exclusive per-controller planner | Read an actual stable observation boundary; output compact intent/effect recipe; no reconstructed Ship/controller world |
| Mount and tracker state | Exclusive per-mount/fire-control planner | Own aim/retarget timers, group state, target handles and per-tracker RNG; a two-float intent is insufficient |
| Flux/ammo/emission/damage | Authority resource/effect commit | Preserve original check/reservation/emission order; never run concurrently with a reader that assumes precommit state |
| Flight/deck/lifecycle | Ordered authority updates unless separately dependency-proven | Flight is not read-only: earlier craft docking/retreat alters later reads; `FlightDecisionRoster` explicitly documents this |
| Projectile movement/impact | Exclusive mechanism stream + ordered impact commit | Preserve earliest-hit/tie ordering, guided dynamics, damage and spawning RNG; source and target links use generation-checked handles |

The first shippable replacement slice must connect the **input owner -> actual numerical solver -> original authority commit** over a broad executable domain. A new SoA container whose consumers still call old object getters is not that slice. Neither is a DTO, standalone kernel or final replay.

Compatibility at the boundary is necessary, but is not allowed to become per-query whole-object admission, getters over a numerical owner, full-world reconstruction or unknown-hook elision. Mutable weapon specs and callbacks cannot receive permanent qualifications. An unknown writer/getter/world hook must retain the ordered generic path or be explicitly supported by the new ownership protocol.

Cross-stage observation data cannot be silently shared: AI planning is before AI effects/flight/state/motion, whereas fire queries observe the later post-motion/weapon-state world. A single authoritative numerical owner must implement those real mutation boundaries. Data resident in a SAB does not by itself implement them. Buffer growth/recycling needs explicit publication and generation safety; frozen generic object references do not confer ownership.

## Numerical and spatial limits on the proposed techniques

- Keep Float64 for state currently represented by JS doubles. Float32 for pose/velocity can change target ties, geometry and integration; it is not bitwise-equivalent by default.
- SoA provides contiguous field streams; it does not guarantee100% useful64-byte cache lines, zero misses or a global20-30% gain. Profile the actual kernels.
- Precomputed sin/cos at a well-defined unchanged-angle boundary can be useful. Algebraically equivalent formulas, dot-product shield arcs and reordered rotation arithmetic are **not automatically floating-point identical**. Do not substitute final geometry under a strict witness requirement without boundary proofs.
- A flat BVH with refit must handle births/deaths, generation changes, eligibility/team changes, hull/ shield extents, nonfinite values and conservative motion envelopes. Refit changes candidate traversal order: restore original semantic order/ties where the query is order-dependent.
- A fixed32-entry stack is not a universal safe capacity. Prove a balanced-depth limit, size scratch storage from actual topology, or use a correct escape-index traversal. Do not silently overflow or skip candidates.
- Projectile type bucketing must preserve cross-bucket impact/side-effect/RNG order. Pure numerical propagation can be partitioned; ordered gameplay commits cannot be reordered merely because buckets are faster.

## Acceptance gate

1. Real default native authority execution and counters show the owned path is used, not a disabled flag/fallback benchmark.
2. All complete-step witnesses match at every step of the existing270 heavy scene; cover lifecycle/module relations, mutable specs and known generic boundaries without claiming those fixtures establish universal equivalence.
3. Typecheck, changed-file lint and the related existing scenario after the complete implementation block. Timing stays exclusive of build/lint/profile/logic checks.
4. Fresh-process same-round ABBA using the complete original timed step; no synthetic replay, phase-only kernel, changed warm-up workload, simulation rate or lowered entity count.
5. At least50% full-step reduction; a5-10% local improvement is explicitly partial, not completion. Original native/UI/browser equivalence and5-8ms safety targets require separate evidence.

No production engine files were changed in this diagnostic block.
