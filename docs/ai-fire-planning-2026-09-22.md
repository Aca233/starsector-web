# Fire-control planning cadence — 2026-09-22

## Original evidence → behavior → current difference → verification

Local installation: Starsector 0.98a-RC8 (`../starsector-core/starsector.log:1`). The decompiled tree is not asserted byte-for-byte identical to the installed JAR.

- `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:75-120`: weapon AI advances each update, with separately timed subdecisions. `combat/systems/WeaponGroup.java:301-314` advances the plugin before querying `shouldFire()`.
- `combat/ai/attack/AutofireManagerV2.java:43-54`: group management is independently scheduled; this is NOT the per-weapon aim rate.
- `combat/ai/oooo_0.java:68,159-175` and `combat/ai/new.java:103-105`: prediction is layered; vent evaluation explicitly refreshes damage. Threat/vent cadence is therefore NOT changed by this patch.
- Current Web acquisition already staggers empty-target scans at 0.05–0.1s. Its fallback preAim nevertheless scans all hostile hulls every fixed step.

Candidate: reuse the existing acquisition revision for fallback pre-aim *selection*. Keep the preferred ship check, retained-target validity, fresh intercept, turret actuation and every firing safety check per step. Hold only a target identity (or an empty result), never a point or firing permission. A newly preferable ordinary pre-aim target can be selected up to 0.1s later. This is an explicitly approximate Web planning policy, not native equivalence or a byte-identical simulation optimization. No new RNG draws, no physics/network cadence change.

Qualification uses the existing audited native roster and live pre-emission revalidation. Smaller rosters can qualify for planning without enabling the >=100-ship broadphase/query batch. Unknown hooks remain on the prior per-step path. Rollback flag: VITE_AI_PREAIM_CADENCE=false.

Validation: existing combat-AI checks extended for empty-result reuse, current target/retained target revalidation, live intercepts, fallback, clear and revision expiry; one paired full-step benchmark using the existing navigation scenario, candidate replay and rollback comparison. Room/browser Hz and input-to-visible latency are separate metrics and must not be inferred from a microbenchmark. No visual/interface changes; no desktop interaction/native live UI test needed for this nonvisual candidate.

Status: candidate under implementation; no speedup claimed and not published.

## Qualification failure found during integration

The first existing-scene A/B had zero planned mounts: the legacy fire-control qualification rejected the built-in ArmorGrid.cells tracked accessor as a custom hook. Therefore its timing differences are NOT evidence of planning gains. Add an exact built-in descriptor identity check; unknown getters remain rejected without invocation, and raw-cell exposure still prevents mutation-revision caching. This fix enables eligibility, not permission to cache armor contents. Retest the failed integration rather than claiming the inactive candidate was faster.

## Result: REJECTED, production sources restored

40 contracts, typecheck and scoped lint passed. Candidate and its replay matched 1,200 frames, and rollback with pre-change qualification matched the preserved control. The original built-in descriptor mismatch was diagnosed, not silently bypassed.

The active candidate did not meet the performance gate:

| Controlled seats / 22 ships | Full-step mean ms | Full-step P50 ms |
| --- | --- | --- |
| 3 | 9.3107 -> 9.5578 (+2.65%) | 8.9671 -> 9.0161 |
| 5 | 7.1875 -> 7.7081 (+7.24%) | 6.9720 -> 7.5337 |

Qualification cost outweighed the reduced fallback scans. **All nine touched source/test/builder files restored to their exact turn-start bytes**, including the accessor qualification change; pre-existing user changes remain. Rejected source copies and measurements are in `artifacts/ai-fire-planning-20260922`. No production optimization enabled, no commit/push/release. The guard issue is documented, but enabling a previously rejected fast path is not treated as a safe performance fix without a successful full-step gate.
