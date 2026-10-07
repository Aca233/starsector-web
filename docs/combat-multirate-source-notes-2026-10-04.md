# Combat multirate planning and autofire — implementation boundary

## Authorization and original comparison

2026-10-04: the user approved multirate decisions and complete-step budgeting,
explicitly rejected capacity limits, forced reinforcement waves and performance-based
fire delays, and authorized implementation. This is an intentional Web performance
rule extension, not an assertion of original-game equivalence.

- Original target in earlier audits: Starsector 0.98a-RC8.
- `C:/starsector-core` and `C:/decompiled` were checked before this change and are
  absent. Original source cannot currently be re-read.
- Historical source references only, NOT newly verified: ShipAIPlugin.java:13–25
  (periodic evaluation and advance); BasicShipAI.java:116,129–131,350–366
  (separate avoidance evaluation); AutofireManagerV2.java:47,53–55 (group cadence).
  See `lan-ai-decision-profile-source-notes-2026-09-29.md` and
  `threat-cadence-source-audit-2026-09-21.md`.
- Original screenshot/interactive verification: pending. No UI layout change is
  planned; no desktop, visible window or input operation is authorized here.

## Evidence → intended behavior → current gap → verification

Current Web `CapitalShipAI` already separates cached tactical navigation from
per-step avoidance, threat observation and effects. Keep the standard phased
pipeline and its native optimizations. Ordinary navigation/target planning may
refresh at 10 Hz with six deterministic phase buckets; forecast cadence retains
its independent existing phase. Every physical step still constructs a fresh
intent/effect record and uses current world reads for urgent work. Do not reuse a
committed intent or a closed world/index.

Current `AutofireController.sampledAim` couples aim evaluation and tracker clocks.
Separate the new ordinary 20 Hz aim / maximum 10 Hz acquisition and point-defense
30 Hz acquisition path without speeding up the existing slower retarget intervals.
Advance tracker clocks exactly once per physical step. Retain current target,
muzzle, ammunition, flux and obstruction checks before every firing decision.
Unknown/custom and unsupported weapon paths must retain the original live path,
not silently stop firing. Manual control remains full rate.

The existing v1/v3 whole-AI sampling is not this feature: it skips effects and can
disable standard-only fast paths. Do not enable it as a shortcut. No fleet/entity,
module, mount, fighter, projectile or beam cap; no dt, refire/lifetime, damage or
offscreen simulation reduction. Fleet-level 2 Hz planning and execution-core
rewrites are separate work, not automatically claimed by this block.

## Concentrated verification

After the complete block, run one app typecheck, scoped lint if useful, and focused
existing cadence checks plus the existing seed917 armed 20-AI/two-player scene.
The new rule may change trajectories and damage: require new-rule determinism and
live firing/control safety, not equality with the old cadence. Report complete
fixedUpdate measurements separately from snapshot/network/render costs. Do not
claim 16 ms, complete performance-plan delivery, original equivalence, or UI/live
multiplayer acceptance from a short headless run.

Implementation status and measured results will be recorded after integration.

## C — Engine integration and verification preparation (2026-10-04)

Implementation record only; the evidence/authorization above is retained.
Original directories were rechecked and remain absent. No original UI or desktop
operation was performed; source parity and original live verification remain pending.

- `CombatEngine.usesMultirateCombat`: standard defaults on unless
  `VITE_COMBAT_MULTI_RATE === 'false'`. This user-authorized rule does not select
  v1/v3, change 60 Hz physical dt, change fleet/spawn/weapon counts, add caps or
  waves, or delay firing for performance.
- `updateShipAI` supplies `multiratePlanning: true` only for ordinary native
  update/plan/control/effects methods. The assembly root and individual ship are
  checked against human/full-rate and externally controlled IDs; the player root
  and its modules remain excluded, including autopilot. No whole-AI
  `sampleDecision` shortcut was added.
- The standard fire-control world supplies `{fullRateShipIds, playerShip,
  cadence: 'multirate'}`. Its exclusion set includes external roots in addition
  to human/full-rate roots. v3 retains its former set and object without cadence;
  the explicit false switch leaves standard sampling absent.
- Standard phased-world, intents, numeric/query producers and fire fast-path
  gates were not broadened or disabled to implement cadence.
- World-copy audit: `CombatAIPhase.plan` rebuilds `world` with
  `{...world, decisionScene, navigationObstacleIndex}` and `planWorld` with
  `{...world, queryReads}`. Both preserve the new property. The prepared scene
  observer reads `CapitalShipAI.multiratePlanningLast` after actual native phases
  rather than merely trusting the Engine object literal.

### Owner/precompute safety boundary

Read-only review: `multicore/Types.ts` Frame has no multirate rule/admission field;
`Owner.ts` creates a TacticalWorld without it and calls `ai.update(frame.dt, ...)`;
`OwnershipPool.ts` may apply published rows or fall back to Engine.updateShipAI.
Primitive controller clock replication alone therefore cannot prevent mixing a
legacy Owner plan with a current multirate authority plan.

Engine now rejects this combination in two places: `canPreviewNativeAI` is false
under the new rule, preventing ordinary old Owner preparation, and the synchronous
batch-application gate refuses `options.aiBatch` before calling `matches`/`commit`.
The existing `finish` cleanup is retained. Explicit false keeps the former path.
Re-enabling owners would require a separate, authorized change to the Frame,
publisher/Owner world, eligibility/context validation and fallback contracts,
with per-root/module full-rate admission. Those files were not changed by C.

### Prepared drivers — not executed

Files under `artifacts/combat-multirate-20261004/` are a small harness, not a new
test project. The historical frozen
`artifacts/combat-fire-scan-program-20261004/baseline.mjs` is reference only; the
deleted historical source entry is not imported.

1. `build.mjs`: one preparation invocation builds the current source with the
   explicit false/true flags, records bundle/input/scenario hashes and rejects
   observed source changes between variants. Native state-core/numeric-motion
   switches match the preceding scenario's disabled configuration.
2. `check-boundaries.mjs`: optional focused integration checks in the same
   seed917 scene: admission/exclusions for roots and modules, actual native phase
   property survival, fresh intents and controls/effects each physical step,
   six-step navigation schedule, duplicate rejection and obsolete batch cleanup.
   No prototype or native instance method is replaced.
3. `run-abba.mjs`: exclusive sequential fresh-process A/B/B/A, each using the
   existing `scenario.mjs` unchanged (seed917, standard, 20 AI plus two players,
   150 warm + 120 timed). Equal initial full-capture/dual-RNG hashes and explicit
   root/module/mount/fighter/bomber/drone counts check against scene reduction.
   No capacity rerun or additional fleet/loadout scenario is added.
4. `run-step-child.mjs` reads native primitive fields and existing per-mount
   tracker WeakMaps outside timing, during the existing warmup only. Evidence
   includes actual multirate admission, scheduled clock resets (not a claim of
   all urgent navigation recomputations), fresh live tactical/effects records,
   sampled-aim object replacement counts, acquisition timer resets, ordinary/PD
   periods, full-rate exclusions and observed one-physical-step tracker clock
   advances. PD coverage and emissions are recorded, not invented.
5. Two B runs save and byte-compare final full existing `captureCombat` output
   plus both RNG witnesses. They reuse the two B timed runs; there is no extra
   determinism scenario and no requirement of A/B damage/trajectory equality.
   Capture is a presentation snapshot, not a resumable hidden-state checkpoint.

Timing includes only complete `fixedUpdate` calls, without a phase trace.
Warmup observers/assertions, complete snapshot capture, encoding/hash/JSON,
disk I/O, networking and rendering are outside timing. This does not establish
a 16 ms production chain, exhaustive per-tick firing safety, native-game parity,
UI acceptance or live multiplayer acceptance. A/B-focused cadence and firing
safety checks are still necessary before any acceptance claim.

As requested, no build, typecheck, lint, performance or correctness driver has
been started by C. Wait for the main agent's explicit A/B-complete notification
before concentrated verification. The existing frozen-bundle
`scripts/check-ai-decision-profile.mjs` was left unchanged because its historical
default-exact comparison is not acceptance evidence for this new rule.

### Focused fire-fixture preparation follow-up

C's current-source entry additionally exports `AutofireController`, `Vector2`,
`immutableCopy` and `assetManager` for B's explicitly requested
`COMBAT_MULTIRATE_BUNDLE` focused mode in the existing fire-check script. The
missing historical artifact imports/observed/replica comparison must not be
reported as executed. C communicated the exports, unchanged seed917 fixture and
Node-relative-manifest loading caveat directly to B with user authorization;
C did not edit B's script. The original hot-path revision is still awaiting B's
explicit completion, so no initial-version build or validation was started.
After all source is ready, the authorized sequence is one typecheck/scoped lint,
focused legacy/new fire units plus integration boundaries, then exclusive short
ABBA with no concurrent build/test load. No Owner protocol migration is in scope.

### Concentrated verification started — incomplete (2026-10-04)

The main agent explicitly confirmed A/B readiness and authorized execution.
One app typecheck and changed-TS scoped lint passed without diagnostics. Current
false/true builds passed after two driver-only esbuild metafile path-recording
fixes; static checks were not repeated. All 7 integration boundary checks passed.
Focused fire units loaded the current bundle/local manifest and passed their
first 12 cases, then failed at `check-sampled-autofire.mjs:263` (expected
FRIENDLY_BLOCKED, actual NO_TARGET after a correctly invalidated target-loss
sample). The likely fixture reacquisition gap and exact executed/unexecuted
scope are recorded in `combat-multirate-results-2026-10-04.md`. C did not modify
B's script; the available app messaging tool could not find B's supplied ID.
ABBA was not started while this prerequisite remains failed. P95/P99/raw samples
were added to C's prepared driver but are not measured results yet. No original,
16 ms production-chain, UI, live multiplayer, release or Owner migration claim
is made.

### Targeted fixture repair and completed short ABBA (2026-10-04)

After B closed, the user explicitly authorized C to edit the existing
`check-sampled-autofire.mjs` fixture only. Source review confirmed that its
positive held-aim timer prevented target reacquisition after an empty scan;
the production acquisition floor was behaving as intended. The fixture now
preserves immediate NO_TARGET on restoration, advances ordinary physical steps
until a real intent is reacquired, and then tests obstruction. An explicit
focused-only 1-based `COMBAT_MULTIRATE_UNIT_START` filter lets the rerun begin at
13. Cases 13-19 passed; cases 1-12 were skipped because already passed. No
production file, static check, build or integration check was changed/repeated.

One exclusive fresh-process short ABBA then passed, with identical initial
seed917 20-AI/two-player armed scene across four runs: 22 roots, 56 modules,
552 mounts, 70 fighters, 28 bombers, zero drones. B/B final complete captures
plus dual RNG witnesses are byte-equal. Both B warmups observe 76 actually
activated planning AIs, 522 sampled mounts, 11,400 fresh per-step tactical/effects
records, 13,940 ordinary / 18,648 PD aim refreshes, 5,360 ordinary / 18,236 PD
acquisition resets, 77,592 observed single-step tracker-clock advances and no
full-rate-root sampling violations. Clock-reset counts are not all urgent
navigation recomputation counts. Actual PD/ordinary period examples are 1/30
and 0.1 seconds; activation readers do not replace native methods.

Complete-fixedUpdate pair means: A 46.840202 ms, B 45.010935 ms (-3.905335%).
Pooled 240-sample nearest-rank P95/P99: A 64.261100/86.530600 ms,
B 57.419800/66.779500 ms. A1/A2 variability exceeds the pair-mean difference,
so stable long-run benefit is not established and the result is not near 16 ms.
All individual means/medians/percentiles, raw samples, hashes and witnesses are
recorded in `combat-multirate-results-2026-10-04.md` and the artifact JSONs.
Historical observed/replica comparisons were explicitly skipped, not passed.
Timing excludes capture/encoding/network/render; no original parity, desktop,
UI, true multiplayer, hidden-state resume, Owner migration or release acceptance
is claimed. No publish, package, staging or commit was performed.

### Final scope and interpretation after main review (2026-10-04)

The retained result is the user's approved 10 Hz ordinary planning / 20 Hz
ordinary aim / PD 30 Hz behavior implementation with per-step control, urgent
work, effects and live firing safety. It is NOT completion of the performance
target or broader performance plan. The pair means 46.840202 -> 45.010935 ms
(-3.905335%) are observations of this round only: A1/A2 drift 49.468169 ->
44.212234 ms, while B1/B2 are 45.632556/44.389314 ms. Later adjacent B2 is even
slightly slower than A2, so stable acceleration is unproven and 16 ms is not met.
No extra timing, capacity run or repeated successful check was added to improve
the reported result.

Fleet-level 2 Hz planning and the remaining core rewrites from the broader
performance plan are still unimplemented in this workstream. New-mode Owner
precomputation remains temporarily disabled: the legacy Frame/Owner world and
plan do not carry the new cadence/admission, so the Engine blocks precompute
and batch application rather than mixing rules. Explicit false retains legacy
eligibility; protocol migration remains outside this round's scope.
Concentrated verification closes here with the detailed measurements and
executed/skipped boundaries in `combat-multirate-results-2026-10-04.md`; no new
tests, benchmarks, releases, packaging, staging or commits follow this note.

### Attribution correction (2026-10-04)

The fixture write-set adjustment was coordinated by the main agent within the
user's original implementation authorization, not a new human authorization.
Earlier wording attributing a separate human authorization or completed chat
message coordination is superseded by this correction; no successful message
to another chat is verified. This does not alter the implementation or measured
verification results. The results document retains only the technical fixture
repair and targeted verification account, without internal coordination details.
