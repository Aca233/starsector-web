# Native fleet numerical columns: results (2026-10-04)

**Retained as a narrow executable input/solver rewrite. Full-step50% target is NOT achieved.** Do not present this as end-to-end authoritative DOD, a root-cause cure, or a significant/stable speed result.

## Actual source change

- `src/engine/ai/FleetColumnSolver.ts`: resident Float64 input columns, byte flags, row-indexed solver, generation-stamped numerical distance/pressure scratch and a synchronous publication lease. No Ship/component/unit-object hydration inside the solver, no Worker/codec/getter wrapper. Numerical caches implement the original demand solve, not cached mutable-rule qualification.
- `src/engine/ai/FleetTactics.ts`: a direct scalar publication path eliminates hydrated Readiness/FleetUnit input records and per-unit visible-team Sets in this native path. Original component/rule reads remain at the publisher. Old producer/solver stays for generic/disabled and reentrant callers. Per-weapon readiness arrays and cold order/result maps remain; this is not zero-allocation throughout.
- `src/engine/simulation/CombatEngine.ts`: supplies the real owner only within its already-qualified worker-owned deferred native fleet path. FleetPlan still flows into the existing original AI/control/effect sequence. No new authority permission bit or serialized state.

Input columns own ONE fleet observation epoch, not persistent entity state. Row indices may change next epoch; they are not persistent slot+generation entity handles. Motion, flight, fire and lifecycle writers have NOT been migrated. Output objects are materialized at the old fleet-to-AI boundary. The current direct publisher still extracts scalar inputs from Ship writers every pass; it is not a resident physical world and is not claimed to eliminate that remaining input cost.

## Correctness / actual use

Existing seed917 heavy armed scene, unchanged counts/dt/AI frequencies/precision/timing boundary:
-270 per-step complete captured snapshot and both RNG witnesses match baseline.
-20,790 AI/defense and195,934 tracker/per-mount RNG rows match.
- Native column path really executes270 solves/epochs,47,207 unit publications,2,824,129 distance solves,3,655,999 influence solves,3,644,884 distance requests; one capacity growth, zero actual-scene reentrant fallback.
- Seven focused boundary groups pass: empty input; row/order/subset/stride transitions; growth with duplicate IDs/Ship rows; row zero target/explicit engage; epoch rollover; NaN/non-number rejection plus subsequent recovery; reentrant visibility reader retaining the original path.
- App typecheck and changed-file lint exit0. These checks precede exclusive timing. Candidate source hashes still match the validated frozen bundle.

This is Web-to-Web evidence. It does not establish universal unknown getter/order/global-math callback equivalence. Ordinary property readers are not skipped or permanently qualified by a cached spec; a broader native protocol still needs explicit callback/read-write proof. Seven fixture groups are not that complete proof.

## Exclusive full-step ABBA

Four fresh processes; each150 warm +120 timed complete fixedUpdate steps. No build/typecheck/lint/profile/logic check concurrent with timing in this task. One witness across all four final complete snapshot +dual RNG results:
`39cbb8a975ee754e2d04d09939a5d66110cf6b2aa66efd9f79cbb67855156e4b`.

| Arm | ms/full step |
|---|---:|
| A baseline |42.2704|
| B columns |41.5669|
| B columns |41.3961|
| A baseline |42.8182|
| A mean |42.5443|
| B mean |41.4815|

Measured mean delta **-2.4982%**. Same-round half target21.2722ms: **not reached**. One small-delta ABBA is not multi-run/statistical repeatability evidence. Keep it as a validated structural slice with a small observed delta, not a speed guarantee. FleetAI (fleet+AI admission/planning, not fleet kernel alone) stage mean15.0354 ->14.4281ms; cannot attribute all full-step delta to the fleet kernel.

The previous34.5631ms baseline belongs to another round. Current42.5443ms baseline reflects this run's environment/bundle; never compute34.6 minus this round's gain or stack earlier percentages. Profiler times and this unprofiled ABBA also cannot be mixed.

## Limits / next domain gate

The roughly3ms fleet domain was explicitly insufficient to support the halving target; this block only establishes real direct numerical publication+solve+original commit connectivity. Do not keep refining this small domain into a supposed whole-engine solution. Remaining dominant root/module threat/navigation/fire and their true state writers require a broader native execution-domain replacement. No getter caches, generic whole-world codec or playback will provide that proof.

Resident dense pair scratch/visibility capacity is quadratic and geometrically over-allocated. The current scene's resident allocation is bounded by one growth, but largest battle memory/performance is not validated. A wider owner must not blindly replicate this scratch layout across systems. Existing sparse-demand generic solver is retained.

Original target0.98a-RC8; C:/starsector-core and C:/decompiled absent. Original source, real-game/UI and real browser/LAN overload acceptance pending. No desktop/windows/input action, staging/commit/push/package/release or career-source modification.

Artifacts: `artifacts/combat-fleet-columns-20261004/accepted-summary.json`, `logic-result.json`, `timing-result.json`, `candidate-manifest.json`, exact `source-before/` and `source-candidate/` plus frozen baseline/candidate bundles. Do not rerun setup/producer scripts over these accepted sources.
