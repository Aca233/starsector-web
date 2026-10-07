# Fused native friendly obstruction — results (2026-10-04)

**Half goal NOT achieved.** Keep only the restricted owned numeric substitution, not a claim of finishing performance work.

## Actual change
Native friend/assembly/source/pass-through/shield filters, conservative moving broadphase and exact contact now run together over the admitted Float64/Uint8/Uint32 plane. No Ship candidate array/filter/sort/map or per-shooter blocker Set in this path. Mutable pass-through flags are still admitted live per query; unknown mount/void-shield accessors and invalid/closed/restricted bindings fall back. Obstacles, firing order, entity/mount counts, simulation cadence, dt, resource checks and timing scope are unchanged. This is phase-owned data, **not yet a persistent cross-step binary AI/fire controller or Worker protocol**.

## Correctness and coverage
270 steps matched full raw snapshots, dual RNG, 20790 AI/defense rows and 195934 tracker/per-mount RNG rows. Actual work: 270 planes, 540 team trees, 13904 fused queries, 60683 exact contacts, 5291 blocked results; zero observed heavy-scene fallbacks. 1024 fused BVH vs exhaustive numeric contact cases passed, including moving polygons/shields, membership/assembly/pass-through/void, huge/subnormal coordinates. Actual binding accessor/team/close/restricted-source checks passed. Default-enabled path matched 8 real scene steps with actual 155 fused queries. App typecheck passed; changed-file lint exit0, no warnings/errors. These are Web-only evidence, not original/runtime/UI/browser equivalence or a generic callback sandbox.

## Exclusive whole-step ABBA
First version: 36.0259 -> 37.2336ms (+3.35%), rejected as a final candidate. It culled nodes but omitted per-leaf broadphase, producing 178007 exact segments. Refinement restores conservative per-leaf pruning and excludes inactive shields from collider extents; contacts drop to 60683 with identical gameplay witnesses.

Final same-seed917, fresh-process 150warm+120timed, no concurrent heavy jobs: baseline 35.9770, candidate 35.0798, candidate 35.2551, baseline 35.7186ms. Mean **35.8478 -> 35.1674ms (-1.90%)**. Fire stage **8.8563 -> 8.1606ms**. Half target 17.9239ms is still missed. All timing rows share full-raw/dual-RNG hash 39cbb8a975ee754e2d04d09939a5d66110cf6b2aa66efd9f79cbb67855156e4b. Measurement used flag true; retained default enables the same path only in compiled sealed native scopes, with flag false available for fallback. Default wiring separately checked above. No cross-round speedup summation.

## Root implication and next boundary
The same-round baseline fleetAI+fire-query is 21.3433ms (59.54%). Even magically removing all of its transport/admission overhead and perfectly dividing all of it gives 4-lane 19.8403ms, 6-lane 18.0617ms, both above the 17.9239ms target. Only this pair would need 83.98% serial-cost elimination to halve the step. This proves another fire-only/subkernel migration is insufficient; it does not establish that current code already executes those hypothetical lanes. Broader pure AI/flight planning coverage plus resident data ownership and ordered authority commits remain unimplemented next work. Projectile ordered damage/resource effects cannot be parallelized wholesale without proving dependencies.

Artifacts: C:/starsector-web-master/artifacts/combat-fused-fire-context-20261004/accepted-summary.json; execution-budget.json; source-before/source-accepted. Original directories checked and missing; no desktop/subagents/commits/push/package/release.
