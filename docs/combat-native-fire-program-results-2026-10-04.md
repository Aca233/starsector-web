# Native fire-program result — REJECTED (2026-10-04)

Hard goal remains **not achieved**: at least -50% whole-step time in the same seed917 scene; no entity/mount/cadence/dt/timer changes.

## Correctness and actual execution evidence
270 strict per-tick raw snapshots + dual RNG + every AI/defense/tracker/per-mount RNG agreed. Actual 4-worker replay completed 268 parallel ticks with zero failures/fallbacks. Actual host init/step path ran 30 ticks, 28 parallel. Six 8-step boundary scenarios passed. Typecheck passed; oxlint 1.82.0 returned exit0 and no diagnostics. This establishes current-Web replay/host wiring, **not original source, original runtime/UI or browser performance equivalence**.

## Exclusive ABBA verdict
150 warm + 120 measured, fresh processes, complete capture/IPC/wait/validation/merge included, with no concurrent build/typecheck/logic/profile workload. Baseline 35.2322 / candidate 102.1254 / candidate 103.0675 / baseline 34.9849 ms. All final full-raw/dual-RNG witnesses identical.

Baseline mean **35.1086ms**; candidate mean **102.5965ms**, **+192.23%**. Half target **17.5543ms**. Fire-query mean approximately 8.7332 -> 72.1433ms. Candidate IPC publication alone averaged 11.3006ms and waiting 14.0121ms; remaining capture/reification/validation/merge dominates. Max worker kernel averaged 8.7137ms, also no kernel win over original serial fire-query. No acceptance, no default enablement.

## Root-cause conclusion and action
Moving the object rule plane to workers reproduces authority admission, copies a world-rich graph four times, rebuilds native view/controller/mount/tracker objects and geometry caches each step, and round-trips every mutable field. This is a data residency/lifecycle and execution-graph problem, not an insufficient worker-count problem. Pooling weapon specs within one frame did not fix the architecture.

All 11 old files restored byte-for-byte from source-before; all 5 candidate-only files saved under source-rejected then removed. Previous accepted production optimizations remain. Restore hashes and exact tests/timing are in artifacts/combat-native-fire-program-20261004/rejected-summary.json. No commits/push/releases or desktop interaction.

Next implementation must use existing resident numeric AI infrastructure or a single phase-owned read plane rather than another whole-world object DTO loop; AI and fire together are ~60% of this baseline. Half cannot be achieved by fire-only rewriting even if fire cost became zero.

## Follow-up: actual failed-candidate cost split and execution budget
The failed fire migration's frozen bundle was profiled once with real4workers (150warm60profiled), without restoring it to production. Diagnostic create/publication preparation averaged34.1867ms, result validation/application finish4.5959ms; profiler parent hotspots include capturePlanningMemory, repeated hasNativeQueryLoop/admission and spec-schema projection, plus postMessage and GC. Last packet was949,857 serialized bytes,174contacts/jobs,13models,97environment records (six ship scopes). These numbers are diagnostic WITH instrumentation, not uninstrumented ABBA and not additive to another baseline. The admission/memory conversion loop itself is larger than the original entire fire-query; replacing only IPC transport will not fix it. Full diagnostic: rejected-parent-profile-result.json.
