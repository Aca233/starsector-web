# Combat multirate — concentrated verification, 2026-10-04

**Status: authorized concentrated headless checks and one short ABBA completed.**
This is not production-chain, original-game or live multiplayer acceptance.
Verification and fixture corrections remained within the user's original
implementation authorization.

**Retained deliverable: the user-approved multirate behavior, not completion of
the performance target.** Ordinary planning 10 Hz, ordinary aim 20 Hz and PD
30 Hz remain enabled under the standard rule, with physical/control/effects and
live firing checks still per step. The small measured pair-mean difference is
not justification to claim a stable speedup, a 16 ms budget or the broader
performance plan complete.

## Executed

- App tsc: `node node_modules/typescript/bin/tsc --project tsconfig.app.json
  --pretty false`, exit 0, no diagnostics; executed once.
- Changed-TS scoped oxlint: Engine, CapitalShipAI, TacticalWorld,
  AutofireController, ShipWeaponControlSystem and the driver entry, exit 0,
  no diagnostics; executed once. Static results are recorded in
  `artifacts/combat-multirate-20261004/static-check-result.json`.
- Current-source false/true bundles: successful. Initial build attempts found
  two driver-only metafile hashing problems (virtual define input and JSON
  import-attribute suffix). C fixed only the input recorder and reran that
  failed build item; app tsc/lint were not repeated. See `build.log`,
  `build-repair.log`, `build-final.log` and `build-manifest.json` in that directory.
- `COMBAT_MULTIRATE_BUNDLE` was explicitly set to
  `C:/starsector-web-master/artifacts/combat-multirate-20261004/multirate.mjs`.
  All required exports loaded, and the local manifest adapter succeeded.
  Initial focused run: first 12 cases passed, case 13 failed. C corrected only
  the fixture, then used
  `COMBAT_MULTIRATE_UNIT_START=13`: cases 13-19 passed, cases 1-12 were explicitly
  skipped rather than repeated. Cumulative coverage is 19 passed unit cases,
  not one repeated full run. See `fire-unit.log` and `fire-unit-targeted.log`.
- `check-boundaries.mjs`: all 7 checks passed. They cover false/true admission,
  human/external/autopilot root/module exclusions, legacy Owner precompute gate,
  fresh native intents and per-step controls/effects, field survival through
  native phase copies, 10 Hz schedule and old-batch cleanup. See
  `boundary-result.json` and `boundaries.log`.

## Resolved fixture failure, no production correction

`scripts/check-sampled-autofire.mjs:263`, case “multirate live
bore/range/target/muzzle, obstruction, ammo and flux still gate every held step”:
expected `FRIENDLY_BLOCKED`, received `NO_TARGET`.

The preceding fixture restores the muzzle and moves the target to x=9000;
primitive guard resets plus that out-of-range scan leave an empty aim sample.
It then restores x=1000 and immediately asks for obstruction gating.
Its `held()` helper forces the sample's remaining time positive, preventing due
aim work from reacquiring a target even after the acquisition window opens.
Production `multirateAim` correctly clears/remains without a target here; range
and muzzle primitive guards can also reset preceding samples. C changed the
fixture to assert that restoring the target does NOT bypass the acquisition
floor, then allow up to 12 ordinary physical steps for actual reacquisition,
and only then test friendly/asteroid obstruction with a live intent. The final
intent-shape assertion now refers to the resumed sample. No production fire
rule, sampler, acquisition floor or native capability qualification was changed.

## Short ABBA measurements

After all prerequisites passed, `run-abba.mjs` ran once, with exclusive sequential
fresh-process A/B/B/A and no concurrent C tests/builds. Each run reused the
unchanged seed917 standard armed scenario, 150 warm + 120 timed physical steps
at 1/60 s. All four initial full-capture/dual-RNG hashes match, with 22 roots
(20 AI + two players), 56 attached modules, 552 mounts, 70 fighters, 28 bombers,
zero drones. No capacity/wave/spawn/weapon reduction was introduced.

All timings below are milliseconds; P95/P99 use nearest rank. Per-row
percentiles have 120 samples; pooled variant percentiles have 240. Full-precision
raw samples, counters and captures are preserved under
`artifacts/combat-multirate-20261004/` in `timing-result.json`, `timing-row-0..3.json`,
`timing.log` and `complete-0..3.json`.

| Run | Flag | Mean | Median (upper middle) | P95 | P99 |
| --- | --- | ---: | ---: | ---: | ---: |
| A1 | false | 49.468169 | 47.186200 | 68.713500 | 86.530600 |
| B1 | true | 45.632556 | 44.917400 | 57.419800 | 66.253300 |
| B2 | true | 44.389314 | 43.501100 | 56.424600 | 66.779500 |
| A2 | false | 44.212234 | 43.244100 | 55.246100 | 67.818200 |

| Variant | Pair mean | Pooled P95 | Pooled P99 |
| --- | ---: | ---: | ---: |
| A | 46.840202 | 64.261100 | 86.530600 |
| B | 45.010935 | 57.419800 | 66.779500 |

Pair means **46.840202 -> 45.010935 ms (-3.905335%) are observations of this
round only**, not proof of stable acceleration. A drifts from 49.468169 to
44.212234 ms; B is 45.632556 / 44.389314 ms, and the later adjacent B2 is even
slightly slower than A2. The A1/A2 spread exceeds the pair-mean difference.
No additional timing was run or will be added to seek a preferred result.
The measured mean remains far above 16 ms; the performance target is not complete.

### Actual activation and control evidence (outside timing)

The two B runs have matching 150-step read-only warmup evidence. No observer
replaces prototype/instance methods in these timing processes.

| Evidence | Each B run |
| --- | ---: |
| Ordinary AI roots/modules observed | 20 / 56 |
| AIs with actual `multiratePlanningLast=true` | 76 |
| Distinct mounts with actual multirate aim samples | 522 |
| Fresh tactical/effects records across all warm steps | 11,400 |
| Scheduled navigation clock resets (not all urgent recomputations) | 1,962 |
| Ordinary / PD aim-sample replacements | 13,940 / 18,648 |
| Ordinary / PD acquisition timer resets | 5,360 / 18,236 |
| Observed one-physical-step tracker clock advances | 77,592 |
| PD mounts in initial scene (not a unique admitted-PD count) | 257 |
| Full-rate root sampled-mount violations | 0 |
| Warmup projectiles / beams observed emitted | 98 / 14 |

Actual tracker examples show PD acquisition period 1/30 s and ordinary period
0.1 s. Root phase examples have actual multirate remaining values and phase
buckets. A has zero enabled planning AIs / multirate aim mounts and the same
11,400 fresh effects records; its warmup emissions are 102 projectiles / 13 beams.
Emission counts may differ under intentional trajectories, not reduced capacity.
Unit checks separately cover per-step firing safety, ammo/flux/cooldown and
continuous emission; warmup counters are not exhaustive safety proof for every
timed tick.

### Determinism

The two B final full existing `captureCombat` outputs plus authoritative and
visual RNG witnesses are byte-equal, SHA256
`47f7823dc58ed4952f165e40b931e847d61f8cb258051b4ce3273bf7fb9c6e0a`.
Both B authoritative witnesses are `[917,15808244532920,222]`; both cosmetic
witnesses are `[2654435884,52608887716870,5]`. A's final hash is
`66b4a7bc581bfbce567e32c6b68047810d1faf221add7fe21c5f1eaa06d0c6f3`, with witnesses
`[917,15731318768774,222]` / `[2654435884,48777252036074,7]`.
A/B damage or trajectory equality was not required. Full capture is still a
presentation snapshot, not a resumable hidden-state checkpoint.

## Acceptance boundary

Fleet-level 2 Hz planning and the remaining core rewrites of the broader
performance plan are still unimplemented in this workstream, not covered by this
delivery. Existing standard native fast paths are not evidence of completing
those outstanding tasks. Owner precomputation is temporarily disabled in the
new multirate mode because the legacy Frame/Owner plan does not carry the new
rule/admission; the explicit-false mode retains its legacy eligibility path.
No Owner protocol migration was attempted in this round.

Historical observed host instrumentation and before/after wire/authority/hidden/
replica comparison are not run by focused mode and have no pass claim. The
initial run failed before its skip summary; the successful targeted run now
explicitly records both historical comparisons as skipped, not passed.

These timings cover complete `fixedUpdate` only. Snapshot capture,
encoding, networking and rendering are excluded. This is not a 16 ms production
chain, original-game parity, UI or real multiplayer acceptance. Original source
directories remain unavailable; no desktop operation, packaging, release,
staging or commit was performed. Owner protocol migration remains out of scope.
