# Deferred in-flight fire-budget occlusion

User approved another substantive optimization, after 20Hz tactical AI. Preserve that change, 60Hz physics/input/defense/aim, real weapon safety and actual damage.

## Evidence before code
- Current 22-ship/5-seat navigation fixture sampled for 600 steps after 240 warmup: 4,216.8ms sample; InFlightFireBudget.penalty about 517.7ms inclusive (12.3%), estimate 479.1ms. Acquisition already uses native 0.05–1s cadences; no further frequency reduction is justified here.
- Local Starsector 0.98a-RC8 decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/new.java:35–37,314–316,343–365 supplies the armor neighborhood weights; Web ArmorGrid applies those weights. Do not replace damage formulas with raw damage.
- docs/ai-fire-budget-and-positioning-2026-09-18.md identifies this ledger as a Web advisory target-score penalty, not an original-engine kill guarantee. Existing penalty is exactly zero when predicted hull damage / max(1,hullHp) <= 0.6.

## Implementation plan
For native pure armor readers only, calculate the same per-shot predicted hull damage before testing intercepting ships/rocks. The sum with all blockers ignored is an upper bound on the original credited sum. If this upper bound already yields zero penalty, skip occlusion. Otherwise test every pending shot in original order and return the original exact credited sum. Keep estimate() default semantics, custom estimate/armor callbacks and a build-time rollback. No cross-frame cache; new emissions stay visible via add().

## Verification
Extend the existing combat-AI script for exact bounded/unbounded penalty comparisons, blockers, armor, modifiers, multiple teams, same-step addition and custom callback fallback. Reuse the existing full-frame/RNG navigation differential and paired timing. No new visible app, UI work, commit, push or release.

## First candidate rejected; smaller refinement
The deferred-occlusion bound passed 34 contract cases and 1,200 exact full-frame/RNG checks, but full-step P50 changed +1.94% (3 seats) / -1.00% (5 seats): no compelling gain. Its production/test changes were restored from exact pre-turn copies; rejected source and timings are preserved as *.bound-rejected.txt and bound-rejected-simulation.json.

The replacement avoids the whole advisory estimate when fewer than two candidate hulls compete. Autonomous hulls all have priority 1, while missiles/decoys have priority 0/2/3: a hull-only utility penalty cannot change their cross-tier order. More than one hull still uses the original complete score. Native estimate/penalty identities are required; overridden callbacks retain calls. All aim, obstruction/flux/weapon gates and actual damage are unchanged. Build-time rollback: VITE_AI_FIRE_BUDGET_COMPETITION=false (also forwarded by the dedicated builder). No new Ship/ArmorGrid state or callbacks are retained.

## Adaptive advisory policy (final candidate)
The exact competition-only cut also measured no compelling full-step gain: P50 +1.27% / -2.57%; its source/timings remain in *.competition-only.txt and competition-only-simulation.json.

The final candidate intentionally reduces advisory AI detail, as authorized by the user:
- No competing hull: omit the native score that cannot affect ordering.
- Native, healthy target (>50% maximum hull) and total friendly raw in-flight damage <25% current hull: omit detailed kill/armor/interception forecast for that target-score query. This is a heuristic, NOT a mathematical bound on damage under arbitrary multipliers. It may cause extra shots at an already-doomed healthy target.
- Damaged hulls, larger volleys, custom estimate/penalty methods, unknown armor callbacks and runtime effects retain the detailed path. New launches via add() are read immediately; there is no cross-frame cached decision.
- Active shields/phase already make the old native estimate zero, so no precise forecast is needed there.
- Target utility, aim, acquisition cadence, PD priority, obstruction, flux/ammo gates, actual damage and 60Hz physics remain unchanged.
- One build-time switch restores the original scoring path: VITE_AI_FIRE_BUDGET_ADAPTIVE=false, also passed by scripts/build-battle-server.mjs. Earlier experimental switches are not in production.

Validation uses candidate-vs-candidate deterministic replay and rollback-vs-original exact frame/RNG comparisons. Candidate-vs-original changed-frame counts are recorded rather than assuming behavior equivalence for this policy change.

## Final result — adaptive policy retained, default on

| Controlled seats | Full-step P50 ms | P50 reduction | P95 ms | Ships/weapons phase mean reduction |
|---|---|---|---|---|
| 3 | 7.6705 → 6.8313 | 10.94% | 11.1962 → 10.2633 | 19.50% |
| 5 | 8.1656 → 7.1778 | 12.10% | 11.8203 → 10.3978 | 19.04% |

Full-step mean reduction: 3 seats 11.51%; 5 seats 11.18%. This comparison already includes the previously retained 20Hz tactical AI in BOTH arms; do not add percentages from separate benchmarks.

- Final TypeScript build and scoped lint passed. Existing combat-AI suite: 35 checks passed.
- Existing navigation fixture: 22 ships, 3/5 seats, 600 fixed 1/60 steps per case; 240 warmup + 360 timed, control/candidate order alternated. Candidate replay and rollback/original snapshots and RNG checked at all 1,200 steps.
- Candidate-vs-original full snapshot differences: 0/1,200 in these short scenarios. This observation does NOT prove general behavior equivalence for the healthy-target heuristic, nor long-match ammo efficiency/balance.
- Player input, physics, aiming, PD, real firing gates and actual damage were not reduced or approximated. No room-Hz, RTT, guest Hz or GPU/render verification. No desktop interaction.
- Final evidence and source hashes: artifacts/weapon-ready-gate-20260922/result.json and simulation.json. Earlier ineffective experiments were not retained as separate production paths.
- Prior CapitalShipAI hash remains e2c0f824290b4a385522a6d04ed57103da806f6e6ad67cc18ac9f7c3d3c98c9d; no earlier effective optimization or career-mode work was reverted. No staging, commit, push or release.
