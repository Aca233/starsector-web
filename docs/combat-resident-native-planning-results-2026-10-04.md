# Resident native planning — rejected (2026-10-04)

**The full-step halving goal remains unachieved. No candidate source remains enabled or installed.**

## Actual scope and correctness
Shared binary input/output leases, worker-private resident contacts/controllers/mounts, persistent immutable model publications, full real planFire/group scheduling, atomic validated authority merge. No entity/mount/cadence/dt/timer/ordering reduction. Controller/model reuse alone was not a dense-input or authoritative data-ownership rewrite: the host still captures the whole object packet, writes a generic tagged tree, and each worker decodes all jobs and constructs/adapts the full contact/frame/budget context.

270 full raw/dual-RNG/AI-defense/tracker checks passed, with20790 AI rows,195934 tracker rows,47207 full jobs,197554 mount jobs,19411 detailed budget sources and268 actual worker-completed stages; fallbacks0. Final app typecheck and changed-file lint exited0. The initial nested metadata reservation bug and Float32 armor transport bug were corrected. The latter first diverged at tick211: values-only object comparison missed the typed-array length/prototype loss; ArmorGrid.replaceCells received an ordinary record instead of Float32Array. Serial capture and resident-vs-fresh worker probes isolated this; final strict replay exercised real typed armor. These are Web/headless evidence, not original/browser/UI or unknown-callback equivalence.

## Exclusive full-step ABBA
Same seed917,2 players+20 AI,standard,60Hz;150 warm+120 timed; four fresh processes; no concurrent build/typecheck/lint/profile/logic tests.
- A:33.8171ms
- B:98.8471ms
- B:102.1904ms
- A:35.3090ms
- Mean **34.5631 -> 100.5188ms (+190.83%)**. Half target17.2815ms missed.
All timing witnesses match39cbb8a975ee754e2d04d09939a5d66110cf6b2aa66efd9f79cbb67855156e4b.

Fire-query:8.3614 -> 72.3578ms. Candidate publication6.6198ms, wait18.1601ms, output decode/merge3.3457ms; kernel17.9688ms is INSIDE wait, never summed again. Remaining44.2322ms includes the unsplit host admission/capture and validation/finish; these are not individually timed. About656937 input bytes/stage and264562 aggregate output bytes/stage still flow. Resident counters confirm actual reuse (52 model builds,~13.9k model hits;445 controller creations vs~46.5k reuses); such reuse demonstrably fails to reduce the complete step. Do not relabel this as successful resident ownership or infer object allocation has no cost.

## Decision and accountability
Reject, not retain behind an off-by-default flag. The earlier object-worker candidate already regressed~192%, and previous budget already proved fire-only parallelism insufficient. This experiment retained that critical-path full-world projection/adaptation despite changing transport/storage; it should have been gated on eliminating input preparation/duplicate frame construction BEFORE building another complete transport. Do not repeat another generic serializer, output representation, getter cache, or fire-only worker variant. A future rewrite must demonstrate actual common numerical input ownership and broad AI/fire/flight execution coverage against the full-step budget, not just persistent wrappers. This is a next boundary, not proof of implementation or halving.

## Restoration
All11 original files restored byte-for-byte against source-manifest.json; all7 newly introduced modules frozen under source-rejected then removed from production. Existing accepted fused native blockers, planning producers/AI effect structure and unrelated changes preserved. Candidate manifests/compiled evidence retained under C:/starsector-web-master/artifacts/combat-resident-plan-20261004. No desktop, subagents, commits, push, packaging or release. Original0.98a-RC8 sources/runtime/UI remain unavailable/unverified.
