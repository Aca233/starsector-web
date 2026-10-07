# Planning numeric execution slice — rejected result

## Scope and outcome

2026-10-04, original target 0.98a-RC8. Original resources/decompiled code unavailable; no original game, UI or browser equivalence claim. No desktop/input, subagents, career, commit, packaging or release operations.

**Rejected and restored. Full-step halving remains unmet.** This experiment was a real on-demand numeric solver migration, not whole-world Worker serialization or a getter cache. Nevertheless, it failed performance acceptance; the rejected implementation is retained only under the artifact directory, not in the production execution graph.

## Executed implementation

The private CombatAIPhase bound a narrow synchronous planning span only to genuine Engine-created planning worlds. A resident owner scratch held Float64 obstacle columns and scalar motion/projectile inputs. TacticalNavigation published at the original Obstacle push locations and solved candidate/integration risk numerically; ThreatAssessment published only after the existing live owner/status/lifetime/broadphase reads, then ran exact quadratic/pursuit geometry. Original candidate order, Math.hypot versus coordinateLength, scalar arithmetic, and the original shield/damage/add output boundary were retained. No entity, mount, frequency, dt, geometry precision or offscreen combat reduction.

This owned only planning scratch, **not the Ship/physics world**, and still had per-call descriptor/native-math qualification and source scalar publication. It did not establish a fully numeric source-owned execution graph. The descriptor/publication cost is a suspect, not a measured isolated causal attribution.

## Verification

- App tsc exit0; four changed/new files oxlint exit0.
- Existing seed917:270 exact complete snapshots, dual RNG,20,790 AI-defense rows and195,934 tracker/per-mount RNG rows equal to this candidate's frozen baseline.
- Real execution:270 spans,20,520 bindings,39,810 numeric obstacle publications,44,831 numeric risk evaluations,88,105 numeric projectile ETA evaluations; capacity growth0/fallback reentry0 in this scenario.
- Nine focused boundary groups including700 exact navigation scores and1,200 exact straight/guided ETA cases; NaN/Infinity/subnormal/overflow/signed-zero/nullish cases; copied-world rejection; nested scratch lease/recovery; mixed nonnumber producer fallback without coercion; unknown projectile/vector/Math getters never invoked just for qualification; changed descriptor recovery; real observation close and unknown-controller generic fallback.
- Those focused tests do not prove arbitrary hostile Proxy/global-intrinsic interception, all custom callbacks, maximum battle-size memory, browser or original-game equivalence.

## Exclusive full-step ABBA

Four fresh processes, same seed917,150warm+120timed complete fixedUpdate, unchanged tracing. No build/typecheck/lint/logic/profiler ran alongside timing.

| Run | Mean full step ms |
|---|---:|
| A |39.7457508|
| B |41.6350892|
| B |41.1312958|
| A |42.6191767|

Paired averages **41.1824638 ->41.3831925ms (+0.4874%)**. AI/fleet stage **14.5561679 ->15.2608763ms**. Half target20.5912319ms: not met. Small overall delta with noticeable A drift is not evidence of stable speedup; the AI stage moved in the wrong direction. Four final full snapshot+dualRNG witnesses match `39cbb8a975ee754e2d04d09939a5d66110cf6b2aa66efd9f79cbb67855156e4b`.

This round's A stage averages: AI/fleet14.5562ms, fire query9.7169ms, remaining complete-step work16.9094ms. These are disjoint measured execution stages, not an attribution to CPU cache misses, nor a license to sum overlapping profiler totals. A small geometry/input slice cannot be presented as removing the entire AI/fire cost.

## Restoration / evidence

Before restoring, captured all four candidate source files and bundle hashes. Checked current hashes against those candidates to avoid overwriting concurrent unrelated edits. Restored only CombatAIPhase.ts, TacticalNavigation.ts and ThreatAssessment.ts, then verified byte-for-byte against this block's before hashes. Saved and removed PlanningNumericSpan.ts. FleetColumnSolver/FleetTactics/CombatEngine and all older accepted changes were not touched by restoration.

Evidence: `C:/starsector-web-master/artifacts/combat-planning-numbers-20261004/`: rejected-summary.json, logic-result.json, boundary-result.json, timing-result.json, candidate-manifest.json, source-before/, source-candidate/, frozen bundles and drivers. Do not rerun connect.mjs/setup scripts against restored production sources.

## Follow-up current-production rule-work count (not a timing result)

After restoration, an artifact-only AST counter bundle ran the same seed917 with150warm+120 observed steps. The counter inserts were compiled before native method identities were captured, so they did not monkeypatch methods after admission. No production files were edited for this count. Final full world+dualRNG witness matches the four ABBA processes. This is a final-state diagnostic, not another270-step differential acceptance, hardware cache profiling, or millisecond attribution.

| Actual calls per observed step | Count |
|---|---:|
|src/engine/simulation/ShipSystem.ts:ShipSystem.isPhased|43762.250|
|src/engine/simulation/Ship.ts:Ship.isPhased|21348.350|
|src/engine/simulation/ShipSystem.ts:ShipSystem.modifiers|5285.783|
|src/engine/simulation/WeaponRange.ts:combatWeaponRange|2545.892|
|src/engine/simulation/ShipSystem.ts:ShipSystem.hasNativeStats|1318.808|
|src/engine/simulation/Ship.ts:Ship.hasExactThreatPhaseHooks|867.158|
|src/engine/simulation/Ship.ts:Ship.getMotionStats|442.175|

These calls are distributed, not all AI work. For example, Ship.isPhased:AI1044.56, flight2117.88, terrain4162.92, ship collisions9366.00, projectiles3222.14 per step. Native-stat qualification is concentrated in AI1186.66/1318.81. Fire query alone is NOT responsible for most phase reads. Counts prove repeated work exists but do not prove these short getters dominate time. Do not replace current rules with cached false values, ignore callbacks, or claim these reads consume a specific ms budget.

The next meaningful implementation must move input publication/consumption and rule qualification together at actual authority-owned mutation/observation boundaries, covering larger execution domains. A per-query wrapper, permanent mutable-spec eligibility cache, whole-world DTO or another output-only rewrite is explicitly not the next step. The present experiment is closed as rejected; this document does not claim that larger rewrite has been implemented.

Additional evidence:work-counts-result.json,work-counts.mjs SHA256 and count-current-work.mjs.
