# Packed numeric snapshot trial — 2026-09-22

## Current decision — retained (user-requested)

The user explicitly requested keeping this improvement. The verified candidate has been reintegrated into active source rather than left as a default-off experiment. Binary-enabled authority snapshots use owned numeric blocks; generic/JSON-only captures retain the established scalar representation. The source wire protocol is now 26 (SWF3), and both host and guests must use matching protocol builds. Existing legacy SWF2 decode remains available, but protocol-25 clients are not silently admitted to a protocol-26 room.

Every archived before-file hash matched current source before restoration, so no later WIP was overwritten. No gameplay, precision, simulation rate, full-state target, ACK/credit or queue policy was changed. No installed application or dist was replaced, no release/campaign work was packaged, and no commit/push was performed by this task.

A retained-source verification is recorded under artifacts/network-packed-numeric-20260922/retained/. Typecheck and changed-file lint passed; the codec/relay/motion group passed 28/28, and the targeted packed authority restore test passed 1/1. The isolated battle-only build succeeded, but full multiplayer regression has NOT passed: the second browser timed out loading its page before battle; the alternate existing shared-authority scenario hit the sustained-overload safeguard. These failures are recorded below, not treated as successful acceptance. The earlier offline performance figures remain evidence of a small local processing benefit, not a claim of equivalent Internet latency reduction.

## Earlier decision (superseded by the user’s request)

**Do not adopt this as the requested immediate improvement.** Implemented and checked an end-to-end numeric-block candidate, but the measured gain is too small to justify a new default wire protocol on this evidence alone. Archived the implementation, restored every touched pre-existing source/test file to its pre-experiment bytes, and removed only the two newly created candidate modules from src. This is NOT a delivered multiplayer performance improvement. Protocol remains 25, physics/full-state target remain 60 Hz. Existing unrelated work was preserved.

## What was actually implemented

- Native typed-array capture with owned bytes (no dirtyVersion assumption, no engine/packet aliasing).
- SWF3 numeric blocks with exact original typed widths, explicit little-endian storage and legacy signed-zero/nonfinite behavior.
- Bounded full decoder, relay skipped-branch validation, malformed UTF8 fallback, motion-reference scanning, target-type checking and restore.
- Same-tick encoding fragment reuse and JSON/private-tape fallbacks.
- Connected to the existing binary-enabled authority Worker, not just a disconnected helper.

No new language, dependency, lower simulation/sync rate, dropped fields, larger queues or relaxed ACK rules. No gameplay or UI changes; original-game visual validation not performed.

## Measurement

Existing native 22-ship fixture (seed 917), 132–185 real projectiles. Two rounds; 30 warmup + 120 measured ticks each; control/candidate alternate execution order while reading the SAME authoritative tick. Five sequential offline receivers, real delta + deflate/inflate + decode + native restore. Physics, assertions and equality comparisons are outside timing. CPU profiler off. This is **not five networked machines, RTT, rendered FPS or live full-state Hz**.

| Metric | Round 1 control → candidate | Round 2 control → candidate |
|---|---:|---:|
| Complete sequential pipeline p50 | 32.821 → 31.570 ms (−3.81%) | 32.608 → 31.742 ms (−2.66%) |
| Pipeline p95 | 39.269 → 35.979 ms (−8.38%) | 36.847 → 37.811 ms (+2.62%) |
| Host capture p50 | 2.288 → 2.147 ms | 2.306 → 2.189 ms |
| Host encode p50 | 1.794 → 1.727 ms | 1.813 → 1.756 ms |
| Total compressed bytes, 5 receivers/tick | 115697.5 → 114756.2 (−0.814%) | same |

The control toggles only packed capture off using the same candidate codec/restore, not a separately frozen old frontend. Results establish the marginal benefit of numeric blocks, not the total effect against the installed build. The candidate also adds codec dispatch/support cost that this comparison does not isolate. Two rounds do not establish statistical confidence or Internet improvement.

## Original trial checks and corrections

- One typecheck and changed-file lint: exit 0.
- Existing codec/relay/motion group: initially 27/28 passed; the added test incorrectly compared a private tape reader's null-prototype DTO directly with ordinary JSON. No wire-value mismatch. Fixed the assertion to compare JSON-visible values. Three affected numeric tests then passed.
- Existing native-capture group plus paired benchmark: initially 23/24 passed; same new tape assertion problem. Targeted corrected native authority test then passed. Verified capture/decode ownership, all supported typed widths, invalid type/reserved bytes/NaN/truncation, legacy SWF2 rejection, cache reuse, JSON fallback, relay summary parity, complete restored-world parity and motion-reference parity.
- No repeated full-suite runs. No compiled five-browser run: this narrow candidate did not demonstrate enough benefit to justify that next test or deployment.
- Full 11-file restoration verified by SHA-256 against the exact pre-experiment bytes (not Git HEAD).

## Evidence and reproducibility

artifacts/network-packed-numeric-20260922/: pipeline.json (per-sample timings), candidate/ (full implementation and extended tests), before/ (pre-experiment source), candidate-source.json (hashes), typecheck.log, lint.log, codec.log, native.log, codec-targeted.log, native-targeted.log, restore-check.json. The initial check-status records failures accurately; targeted logs record their corrections. Never overwrite current WIP with the archived files: review/reapply only the relevant diff if revisiting.

## What the larger refactor needs to change

The current graph is still recaptured, re-encoded, decoded and restored each tick; replacing just typed-array leaves cannot remove most of that cost. The next architectural candidate is an explicit per-entity replication schema with component-level dirty tracking, stable identity/generation and acknowledged baselines. Static/spec/loadout data should be sent once per lifecycle; motion remains full precision at the established rate; armor/weapon/FX state updates must follow real mutation coverage. Damage, spawns, destruction, sound and muzzle events need ordered/idempotent delivery independent of replaceable state. Reconnect/baseline loss must fall back to a complete validated state. Do not merely compute an object diff AFTER the current expensive full capture/encode, since that retains the measured bottleneck.

This is an implementation direction, not a measured completed improvement. It needs its own coherent vertical slice and actual compiled A/B validation before replacing the existing default.

## Reintegration verification — final status

- Restored 13 candidate files only after verifying every current baseline and archive hash. The sole subsequent implementation-file difference from the archived candidate is a HostSnapshot.ts comment clarifying when packed capture is requested. No unrelated source was replaced.
- Typecheck and changed-file lint: exit 0; codec/relay/motion tests 28/28; targeted native authority test 1/1.
- Isolated battle-only frontend built successfully: build 2026-09-22T02:06:15.784Z, 2438 audited runtime modules, frozen source graph. Existing dist/installed app untouched.
- First scenario invocation could not resolve Playwright; reused the bundled runtime through NODE_PATH without installing a dependency or rebuilding.
- Actual five-browser scenario: failed at joining seat 1, page.goto load timeout (30 seconds), empty second-page body, room still in lobby with one peer and tick −1. No browser/Worker errors were recorded, but the page never completed loading. Browsers and test relay were cleaned up. No combat, latency or full-state-Hz result can be claimed from this run.
- Instead of restarting the complete browser scenario, ran the existing shared authority/Steam preparation regression. It failed because the real authority Worker reported sustained overload/pause recovery failure. There is no before/after attribution establishing whether the candidate, existing WIP or machine load caused this. This is NOT a completed Steam/native-transport acceptance. No safeguard, frequency, test scale or acceptance condition was relaxed to force a pass.
- Improvement remains in active source as requested. Full multiplayer acceptance is pending; no repeated performance benchmark, release, installation, commit or push.

Evidence: retained/check-status.json, codec.log, native.log, build.log, build/build-audit.json, compiled.log (missing local dependency), compiled-with-runtime.log, compiled-five/result.json, shared-transports.log, retention-result.json.
