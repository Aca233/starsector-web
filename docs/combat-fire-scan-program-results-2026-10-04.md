# Native fire scan program — rejected result

2026-10-04. Original target0.98a-RC8; C:/starsector-core and C:/decompiled unavailable. Web-to-Web logic comparison only, no original game/UI/browser equivalence. No desktop/input/subagents/career/commit/package/release action.

## Outcome

**Rejected and restored. No new speedup retained. Full-step halving and the earlier16ms ambition remain unmet.** This was a real acquisition-input/rank/index-sort/lazy-selection program, but it was still the wrong coverage for the large rewrite objective. Do not present it as source-owned Ship/physics state or as a completed DOD combat backend.

Current source already has modifier-table publication/owned native modifiers. Adding another generic stat getter/cache was explicitly avoided. The implemented branch instead removed the remaining candidate graph materialization in the sealed native hull-only scan. It did not rewrite persistent per-mount tracking, the entire AI decision graph, system-stat production or authority state ownership; those remain the larger required domains. A small branch must not be funded as the next supposed halving solution without evidence of large full-step coverage.

## Actual implementation and boundaries

- Numeric acquisition publishes accepted hull entity-handle/point rows directly to resident AutofireScanColumns; no AcquisitionHit -> target/AimSolution/Vector2 graph per accepted hull.
- Original policy, live shield/utility/fire-budget rule calls publish their final primitive scores at their original rank positions. Sort consumes row indices and numeric fields; only candidates reached by the existing lazy safety selection are materialized.
- Generic and accepted-missile branches remain the original implementation. Cold entity references remain at live rule/output boundaries, not a transported world. No Worker/SAB/whole-world DTO work.
- Source is a one-scan synchronous input lease. Busy/reentry falls back. Unknown Vector2/Math dispatch retains vector methods; nonnumber custom rank results are not coerced into Float64 before the original comparator arithmetic. Generic vector identity remains at lazy output.
- During review, fixed a fallback double-probe bug: if scanInto rejects inputs, do not invoke legacy numeric scan to qualify/read the same input again. A test-only forced live input rejection verified exact producer-call counts and legacy world results. This repair is not a claimed optimization.

## Final-source verification

- Final app tsc and four changed/new files oxlint:exit0.
- Existing seed917270 complete raw snapshots, dual RNG,20,790 AI/defense rows and195,934 tracker/per-mount RNG rows match frozen baseline.
- Actual work:34,012 column scans,10,016 input/rank rows,10,016 scalar rank rows,2,818 materialized candidates,0 nested fallback in the heavy scenario,2 capacity growths.
- Only7,198 candidates avoided graph materialization. Across270 steps, the rank domain consumed about37.10 rows/step; this is NOT coverage of all weapon tracking or all AI/fire time. Counting avoided objects is not evidence of removing a20ms budget.
- Five focused boundary groups:500 exact stable object-vs-index sorts including empty/tie/NaN/Infinity/signed-zero/capacity growth; nested owner lease/recovery and stable held authority outputs; custom-number coercion timing; Math/vector/origin getter-safe qualification/recheck; fallback vector identity/mutations.
- Two actual Engine steps with test-only rejection inserted at NumericAcquisitionFrame.input before native identities were captured:baseline/candidate producer calls1695/1695 then650/650; complete snapshots and dual RNG match each step. No production injection remains.
- These tests do not prove arbitrary same-realm Proxy interception, every custom callback/reentrant mutation combination, original game, browser, memory at maximal battle size or hardware cache behavior.

## Full-step fresh-process ABBA

Same seed917,150warm+120timed per fresh process, unchanged complete fixedUpdate and stage trace. No build/typecheck/lint/logic/profiler alongside timing.

| Run | Mean ms | Median ms | P95 ms |
|---|---:|---:|---:|
| A |41.01804|39.23730|56.61900|
| B |47.45924|45.61040|65.97530|
| B |54.28042|44.22180|107.58360|
| A |48.96721|44.25130|79.82910|

Means **44.99263 ->50.86983ms (+13.0626%)**; paired half line22.49631ms not achieved, nor16ms. This half line records the same-round test, not a relaxed replacement for the user's lower performance ambition.

**Environmental caution:** A itself drifts41.02->48.97ms; unrelated AI/terrain/projectile phases drift as well. Cannot causally attribute all13.06% to this candidate or claim a stable regression size. There is no measured speedup evidence, so acceptance fails and the candidate is restored. No repeated timing round to fish for a passing number.

All four full final world+dualRNG hashes match `39cbb8a975ee754e2d04d09939a5d66110cf6b2aa66efd9f79cbb67855156e4b`.

## Restoration and evidence

Before restore checked each current candidate hash and the frozen baseline hash to avoid overwriting concurrent edits. Restored only AutofireController.ts, NumericAcquisitionFrame.ts and WeaponAcquisitionKernel.ts byte-for-byte. Saved and removed AutofireScanColumns.ts; no disabled failed production module remains. Verified FleetColumnSolver.ts, FleetTactics.ts and CombatEngine.ts still match their earlier accepted hashes.

Evidence directory: `C:/starsector-web-master/artifacts/combat-fire-scan-program-20261004/`: rejected-summary.json, final typecheck/lint logs, logic-result.json, boundary-result.json, fallback-result.json, timing-result.json, source-before/, source-candidate/, candidate-manifest.json and frozen bundles/drivers. connect/setup/fallback builders are experiment artifacts, not instructions to overwrite the restored production checkout; do not rerun them casually.
