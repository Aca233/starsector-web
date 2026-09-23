# Phase52: capture-time private tape experiment — source notes

2026-09-22. Scope: trusted authority capture representation only. No gameplay/render changes; original-game visual comparison is not applicable. No campaign edits, build replacement, release, or default flag change.

Evidence: Phase49 actual compiled profiling found both simulation and publication cost; Phase50 removed helper-side DTO reconstruction but left capture -> producer tape traversal; Phase51 actual compiled control/candidate both failed sustained overload. Thus serializer activation alone is not a proven remedy.

Existing contract: CombatSnapshot.ts `pack` visits live fields once in native mode; retains array mapper semantics, record-layout discovery order, projectile factoring, ship discovery, cycles, precision, and RNG. SnapshotTape.mjs is a private 4MiB same-machine tape. BinarySnapshot.mjs produces the existing SWF2 bytes. This experiment must preserve all of them.

Experiment: eagerly stage completed native subtrees into a bounded postorder tape, leaving private backward references in the capture rather than keeping the full DTO. Preserve record envelopes needed by array batching. Disable staging below custom array callbacks and projectile-column factoring so they see ordinary values. On unsupported/overflow, materialize already-captured references, never recapture the engine or execute callbacks twice. Validate reference cycles, logical depth, expanded work budget, transfer ownership and exact bytes. No opaque values may escape the prepared-capture API.

Acceptance: one concentrated typecheck/changed-file oxlint/existing relevant scenario block. Same-engine differential byte tests and RNG invariance, custom mapper count, overflow fallback. Producer capture+prepare P50 <= 0.95 control, serial capture+prepare+encode P95 <= 1.10 control in both orders on existing 22-ship 3/5-seat early/late states. Microbenchmarks do NOT establish game Hz, RTT or remote n2n/Steam improvement. If it loses, retain evidence, remove the candidate from production files, and do not enable it.
