# Native long-horizon threat planning — 2026-09-22

## Source evidence and scope

Local 0.98a-RC8; original decompiled AI `combat/ai/oooo_0.java:68,159-175` uses an interval for damage prediction. `combat/ai/new.java:103-105` explicitly refreshes damage before vent evaluation. Exact installed-JAR equivalence and native desktop behavior are not asserted. No UI changes.

Web previously computes all projectile, beam and future weapon threats over the full vent/recovery horizon each step. Native system consumers read imminent damage/flux; only defense's vent-calm timer and diagnostics also need long-range speculative threats. Unknown system callbacks retain the existing full assessment.

Candidate: retain actual projectile/beam prediction over the FULL horizon and immediate WEAPON prediction over defenseWindow every physics step. Sample only far WEAPON forecasts at 20Hz, with the established deterministic ship-ID phase. Hold only primitive far-threat-present/earliest fields, not a recursive threat array. The existing audited native threat phase provides eligibility; no added full-world descriptor audit. The compact result explicitly marks deferred far threats so missing detailed rows never means safe venting. Recompute the complete assessment after system AI and immediately before a possible vent, reset observation with dt=0, then re-evaluate permission. Existing scalar Publisher/Owner serialization carries all scheduling/aggregate fields.

This is approximate far-horizon planning, not a claim of original-game equivalence: distant threat appearance/disappearance and diagnostic ETA can lag <=50ms. Current close threats, shields, aim/fire safety, collision and physics are NOT sampled. First use, control/lifecycle resets, roster-size or defense-window changes and native fallback invalidate the sampled aggregate. Higher far-horizon changes are bounded by the 50ms window, but any actual vent commitment always uses fresh full-horizon state.

Rollback: VITE_AI_THREAT_FORECAST_20HZ=false. Validate live near-weapon/projectile threats, conservative vent observation and post-system fresh vent check, native fallback, owner scalar state and replay/rollback. Measure whole-step costs in the existing scene, not isolated assessThreats speed. No network Hz/RTT claims without a room/browser test.

Status: experimental candidate, not yet accepted.

## Retained result (incremental, NOT the completed large-refactor goal)

- TypeScript and scoped lint passed. 38 combat-AI checks passed, including real near-weapon/long projectile inputs, deferred-threat vent rejection, refresh-before-vent, all three phase offsets, fallback/reset and Owner/serial scalar agreement. The Owner test now supplies the same native forecast envelope to serial and worker paths rather than comparing native and deliberately unoptimized worlds.
- Existing 22-ship scenario: 600 steps per 3/5-seat case, 240 warmup and 360 measured samples, alternating control/candidate order. Each arm's candidate replay and rollback bytes/RNG checked over 1,200 frames. Both cases happened to match the old transmitted frames throughout this short run; the policy remains approximate, not universally equivalent.

| Seats | Full-step mean ms | Mean reduction | P50 ms | P95 ms |
| --- | --- | --- | --- | --- |
| 3 | 7.1899 -> 6.4930 | 9.69% | 6.8903 -> 6.2493 | 10.1266 -> 9.0633 |
| 5 | 6.9394 -> 6.4951 | 6.40% | 6.7850 -> 6.4592 | 9.2753 -> 8.2546 |

This clears the criterion of a useful incremental CPU saving, **not the aspirational >=20% whole-step target**. The full native AI/fire-control ownership redesign and guest presentation-replica migration are NOT complete.

### Real local 48-ship room check

One room, two isolated native-apply peers, eight active seconds per arm. The control authority bundle uses the exact preserved pre-change AI sources, not just a disable flag. Both runs passed with zero recoveries.

| Metric | Control | Candidate |
| --- | --- | --- |
| Physics Hz | 59.585 | 59.724 |
| Full-state publication / replica application Hz | 35.851 | 35.235 |
| Process CPU including both peers | 19,594 ms | 18,437 ms |
| Seat 2 input -> full-state application P50 | 36.71 ms | 37.39 ms |
| Seat 2 input -> full-state application P95 | 108.70 ms | 100.61 ms |

This does **not** demonstrate materially higher host/guest Hz or a stable end-to-end latency gain. Physics was already capped near 60Hz; full-state Hz is slightly lower, median latency essentially unchanged, and the tail improvement is a single short observation. The synthetic peer does not establish the production secondary control socket, so auto-motion does NOT prove browser motion-lane latency. No browser render FPS, actual input-to-visible or WAN claim.

Reproduction:

- `node scripts/check-combat-ai.mjs`
- `node artifacts/ai-threat-planning-20260922/check-simulation.mjs`
- `node scripts/build-battle-server.mjs artifacts/ai-threat-planning-20260922/candidate-runtime --worker-only`
- `node artifacts/ai-threat-planning-20260922/build-control.mjs`
- `node scripts/benchmark-server-rooms.mjs --runtime artifacts/ai-threat-planning-20260922/<control|candidate>-runtime --ships 48 --rooms 1 --active-seconds 8 --apply-replica --auto-motion --no-motion-reference --out <output>`

Proof and final-source hashes: `artifacts/ai-threat-planning-20260922/result.json`. Rejected pre-aim candidate fully removed from production sources. All prior retained optimizations and career changes preserved; no career files touched, no commit/push/release. This turn's retained source changes are only the three AI files, dedicated-server flag forwarding, combat-AI tests and their lab exports.
