# Dedicated combat authority — 2026-09-20

## Scope before implementation
This is an explicitly requested multiplayer infrastructure extension, not a native gameplay/UI restoration. Native installation evidence: ../starsector-core/data/config/settings.json declares the original renderer fps setting (60); this is NOT evidence of a native multiplayer server or a physics tick rate. Existing Web authority source src/network/host.worker.ts already executes fixedUpdate(1/60), input freshness, AI takeover, deployment validation, snapshots and battle reports. Reuse that implementation unchanged; do not invent native multiplayer rules or alter damage/AI/physics. No original desktop interaction is required or authorized for this infrastructure change. Native UI equivalence is not claimed.

Expected: an opt-in server mode, isolated worker per match, no human client owns authority, all clients use the existing replica path. Closing/reloading the room creator's browser must not kill a running server match; frozen match controller seats stay stable. Existing host-compute LAN/Steam remain the default. Empty rooms release workers; server failure ends a match explicitly, without invented recovery checkpoints. Public hosting is gated on explicit origin configuration and verified access, not disabled Host/Origin checks.

Validation plan: actual Node worker using production engine; real WebSocket clients including seat 0; input/deployment permissions, creator disconnect/rejoin/leave, worker shutdown/failure/capacity; browser entry with no host worker; ARM 8/16/32 ship measurements at unchanged target and overload protections. Never infer fleet capacity from CPU count. Build a combat-only private test artifact, exclude campaign and never commit/push/release unrelated changes.

Status: dedicated combat implementation and private test deployment verified; no public launch or verified public ingress.


## Test-environment optimization follow-up
User confirmed this is a private test environment, not a public launch. Official Huawei docs checked: container remote access is IDE-based; the documented VS Code port forward targets local localhost, not a public game URL. Quota exhaustion can stop the environment. No third-party tunnel or public port is being enabled.

Infrastructure evidence before edits: host.worker.ts already separates its 60 Hz fixedUpdate loop and tiny once-per-second performance messages from its one-in-flight snapshot capture gate. The gateway currently ACKs every snapshot even when every browser is hidden/disconnected; its broadcast then discards those expensive snapshots. Expected change: only dedicated authority with no eligible viewers withholds the single capture credit, retaining a tick number, not a frame; physics/AI/deployment continue unchanged. Visibility/load/resync releases the exact credit and demands a fresh full snapshot. Progress telemetry, not a stalled display tick, proves liveness while unobserved. Terminal snapshots still validate battle results. LAN/Steam host computation and gameplay rules stay unchanged. Verify with before/after real Worker + PMD/delta clients, more than 12 seconds hidden, fresh-frame/control resumption, finish/failure cleanup and ordinary LAN/Steam regressions. No new native UI/gameplay equivalence is claimed.

## Verified optimization results
- Real ARM Node 25.9.0, two concurrent rooms, 16 ships each (2 neutral human Onslaughts + 14 AI Hammerheads), fixed seed. Gateway uses real WebSockets, PMD, binary delta + motion-reference negotiation and exact consumption credits. Clients decode via production decoder in the same process; this adds synthetic client CPU and is NOT a real WAN/browser capacity test.
- All hidden for 14 seconds: before 1673 full captures / 288.36 MiB uncompressed worker payload; after 0 captures / 0 MiB. Physics telemetry remains approximately 60 Hz, zero recovery events. CPU time across the whole benchmark process in that phase: 26.69 CPU-seconds before vs 11.59 after (~56.6% less in this single paired run). Do NOT extrapolate that saving to foreground gameplay or memory.
- One hidden browser does not stop other viewers' snapshots. All-client disconnect and resume preserve the same battle and advancing simulation. Fresh-state ACKs resume controls. Hidden terminal snapshots/reports still validate and release the Worker. A stale performance tick cannot hide a stalled worker; after visible demand returns, performance-only messages cannot hide a failed snapshot pipeline.
- Resume drops the worker's bounded accumulated one-shot sound queue ONLY for the exact server idle-resume credit; ordinary LAN/Steam ACKs are unchanged. Muzzle events already prune by simulation time and have bounded event/particle/style caps.
- Historical inline-client run (NOT an isolated server limit): active rooms produce roughly 59-60 snapshots/s, but synthetic receiver delivery falls from roughly 53 Hz early to 24-28 Hz later. Physics remains about 60 Hz. The clients decoded on the gateway event loop, confounding this foreground result; the isolated-client matrix below supersedes its capacity interpretation; this change does not claim stable 60 Hz client delivery, 60 render FPS, or maximum concurrent capacity.

Artifacts (under artifacts/server-authority-20260920): arm-room-before.json, arm-room-after.json, optimization-summary.json, room-before.json, room-after.json, integration-results.json, transport-results.json and local-browser-results.json. The earlier arm-authority-benchmark.json is worker-only and excludes gateway/fan-out; do not conflate its numbers with these tests.

## Reproduce (from project root)
    node scripts/build-battle-server.mjs --benchmarks
    npm run typecheck
    npx vite build --config vite.server.config.ts
    node scripts/check-network-publication.mjs
    node scripts/check-server-authority-lifecycle.mjs
    node scripts/check-server-authority.mjs
    node scripts/check-server-authority-transport.mjs
    node scripts/benchmark-server-rooms.mjs --rooms 2 --ships 16 --expect-suspended

Browser test: set PLAYWRIGHT_PATH to the installed Playwright module and EDGE_PATH to an installed Edge executable, then run node scripts/check-server-authority-browser.mjs. It launches headless only. Optional BATTLE_TEST_URL tests an existing loopback/SSH-forwarded dedicated server instead of starting a local one; test seats are reclaimed with their own resume tokens after closing the test browsers. No desktop input or window is used.

## Dedicated test runtime and safety
The private runtime consists of authority-worker.mjs, battle-server.mjs and web/. Start with HOST=127.0.0.1 PORT=32120 MAX_BATTLES=2 node battle-server.mjs. BATTLE_DIST optionally overrides the sibling web directory. Node >=22 is required; Node 24 LTS is preferable for future stable hosting, but the cloud's existing Node 25.9.0 was kept intact for testing.

Factory defaults: at most 4 active workers (test deployment overrides to 2), 128 roster ships per room (a safety bound, NOT a performance promise), 768 MiB old-generation limit per worker (NOT total RSS), 30-second worker boot deadline; gateway max 16 rooms / 64 simultaneous transport connections. Creator is room administrator, not compute owner; explicit administrator end still ends the match, reload/close does not. All disconnected seats are retained for the existing 30-second reconnect grace; empty rooms free workers. Server process failure ends matches; there is no persistent recovery checkpoint.

Loopback binding is deliberate. Public binding requires PUBLIC_ORIGIN with exact Host + Origin validation; HTTP/WS tests reject wrong Host, foreign Origin and an HTTPS-to-HTTP origin downgrade. Public ingress/TLS/WAN capacity remain unverified; no public tunnel provider has been installed. Build guards exclude unfinished campaign code/HTML from this private combat artifact; existing original-game assets are not campaign implementation. No commit, push or public release was made by this task.

Huawei references checked on 2026-09-20:
- Container remote connection: https://support.huaweicloud.com/devg-hdspace/zh-cn_topic_0000002489912090.html
- VS Code local-only port-forward example (VM documentation): https://support.huaweicloud.com/devg-hdspace/zh-cn_topic_0000002533244749.html
- Environment quota/automatic shutdown: https://support.huaweicloud.com/devg-hdspace/zh-cn_topic_0000002466610346.html
- Development-desktop public-access limitation (not blanket proof for every container product): https://support.huaweicloud.com/hdspace_faq/zh-cn_topic_0000002506355176.html


## Private deployment verified
Cloud directory: /workspace/starsector-authority-20260920/private-test-v1. Service PID at validation: 3645; current PID is in service.pid, log in service.log. Command: NODE_ENV=production HOST=127.0.0.1 PORT=32120 PUBLIC_ORIGIN=http://127.0.0.1:32120 MAX_BATTLES=2 node ./battle-server.mjs. PUBLIC_ORIGIN here is deliberately a loopback origin: it enables PMD/delta for a prospective SSH forward without exposing any interface to the public network. Archive SHA-256 was verified before extraction. Runtime web build: 2026-09-20T08:58:06.081Z.

Cloud-service-smoke.json confirms the deployed executable serves HTTP, produces real authority snapshots with PMD/delta, supports creator close/reconnect and hidden/resume, and releases test seats. Local headless browser tests separately confirm UI create/join/start, actual controls, page reload and creator closure; they did NOT exercise cloud HTTP through a local browser. An attempted automatic hidden SSH forward was rejected by tool policy; no alternate automatic tunnel was attempted and no local playable URL is claimed active. To test manually in the existing remote VS Code window, forward remote port 32120 to local 32120 and visit http://127.0.0.1:32120/?view=lan. Keep that connection alive; this is private local access, not a URL friends can open.

The service is left listening on cloud loopback for the user's testing; no autostart/system service was installed. Before stopping it, check service.pid, /proc/PID/cwd and /proc/PID/cmdline match this directory and node ./battle-server.mjs, then send SIGTERM to that exact PID. The development environment itself was not shut down. Its running-time quota still applies even when no battles are active.

## Follow-up: screenshot showed 30 Hz
The screenshot in the UI smoke test was taken immediately after deliberately reloading the creator page. The HUD counts accepted snapshots over the trailing one-second window; it is not the physics frequency or a configured 30 Hz cap. Added optional BATTLE_MEASURE_MS=12000 and allowlisted console telemetry capture to the browser test. In a fresh two-browser/two-ship local run, receiver samples before reload were 54-61 Hz (mostly 58-60); the deliberately reloading interval showed 34 Hz, followed by 56 Hz. Physics telemetry stayed near 60 steps/s. This local run has essentially no socket skips and only a few credit-window skips; exact allocation of a transient stall needs deeper timing, not guesses from independently sampled windows. Original target remains 60 Hz; no counter clamping, duplicate packets or fake higher-rate output was added. The earlier lower-throughput ARM test ran client decoding on the gateway event loop; use the corrected isolated-client matrix below, not that number as a server limit.

Artifact browser-flow-samples.json contains only allowlisted performance fields from the built-in diagnostic logger (no resume tokens or world data). Reproduce with BATTLE_MEASURE_MS=12000 node scripts/check-server-authority-browser.mjs and the Playwright/Edge environment variables above. Native game equivalence, real dual-account Steam WAN behavior and persistent public hosting remain out of scope/unverified.


## Foreground capacity retest — isolated load generators
The earlier foreground harness decoded every synthetic client on the gateway event loop. That artificially depresses receiver Hz and inflates input ACK latency; it is not a server-only capacity measurement. The hidden-phase paired result remains scoped to whole-process CPU, not a foreground gain.

- Added scripts/benchmark-server-peer.mjs: one Node Worker per client using the production PMD/delta/motion-reference decoder, credit receipts and neutral input probes. Only small accounting records return to the gateway; no full presentation graph is cloned back. Each synthetic client has a 256 MiB old-generation limit. The production authority/gateway and its private deployed service are unchanged by this foreground test.
- scripts/benchmark-server-rooms.mjs --isolated-clients --active-seconds N now records receiver Hz, simulation progress, latest-input sequence ACK p50/p95, gateway callback duration, event-loop delay, socket/credit skips and per-client WebSocket socket bytesWritten. Samples/pending inputs stay bounded. Nominal probe frequency is 50 Hz; only latest input sequences actually observed in a decoded snapshot are timed. This is not every-command latency or input-to-photon latency.
- CPU/RSS include client workers. The event-loop monitor uses 10 ms resolution, so an idle baseline near 10 ms is not 10 ms of gateway processing per frame. wireMbps is compressed WebSocket socket bytesWritten during the phase, not uncompressed worker payload and not TCP/IP/TLS wire overhead. Short-window rates depend on battle progression and loadout.
- Fixed seed 1511506142; each room has two neutral human Onslaughts, with the remaining ships AI Hammerheads; battleSize=3200. Number of ships is not number of real players. Two local synthetic peers per room; no browser render, WAN or TLS is represented.
- A longer run exposed a harness teardown race: stopping a client's input timer by asynchronous worker message and immediately removing the room let an in-flight probe hit a deleted room. Fixed the harness to terminate load generators before room removal, then await authority cleanup. This was a test teardown failure, not a live room crash. The affected unfinished run is excluded from successful results and rerun.

### Twenty-second foreground matrix (ARM64 Node 25.9.0)
| Rooms × ships/room | Received snapshots/s (per client) | Physics steps/s | Latest-input ACK p50 / p95 ms (range of clients) | WebSocket Mbps/client |
| --- | --- | --- | --- | --- |
| 1 × 2 | 60.0 | 60.0 | 10.5–10.6 / 18.3–18.4 | 0.46 |
| 1 × 8 | 60.0 | 60.0 | 21.5–21.6 / 31.0–31.1 | 4.12 |
| 2 × 16 | 58.7–59.3 | 59.94–59.99 | 39.0–39.7 / 50.1–50.7 | 7.19–7.59 |
| 1 × 32 | 24.0 | 59.1 | 49.2–50.7 / 125.1–126.8 | 4.73 |
All four completed with zero authority recovery events. These are phase averages, not promises of no stalls or stable per-second 60 Hz. The lower Mbps at 32 ships does not imply better compression: it is sending fewer snapshots. Artifacts: arm-isolated-{1-2,1-8,2-16,1-32}.json and foreground-summary.json under artifacts/server-authority-20260920.

### What the profiler does and does not establish
A separate 2 × 16 main-thread CPU profile (15-second phase plus boot/cleanup, with profiling overhead) has about 8.48 CPU-s sampled under receiveAuthority: 2.57 s full-state decode, 3.93 s motion-reference creation, 1.98 s other gateway work. This is a sampled-stack attribution, not production wall latency; it does not profile the authority or synthetic client workers. Equal-anchor patch work is already shared per broadcast, so do not propose adding a cache that already exists.

The 32-ship short run's final authority telemetry sampled ~12.18 ms simulation, ~7.80 ms capture and ~4.72 ms encode. They are not phase averages and must not be added to infer an exact speedup. Nevertheless, taking captures at 60 Hz as well as simulating at 60 Hz stresses one room's worker budget; additional room-level CPU cores do not automatically parallelize that worker.

Next measured targets (NOT implemented here): reduce capture/serialization allocation; avoid reconstructing the full trusted-worker presentation graph in the gateway while preserving strict validation and report/deployment invariants; improve lossless motion-reference/patch CPU and bandwidth. Do not simply disable deltas (bandwidth tradeoff unmeasured), enlarge queues, lower physics/AI fidelity or fake Hz counters. Any future optimization needs the same isolated-client before/after matrix plus malformed-state, final-report and LAN/Steam regressions.

Reproduce: node scripts/build-battle-server.mjs --benchmarks, then node scripts/benchmark-server-rooms.mjs --rooms 2 --ships 16 --isolated-clients --active-seconds 20 --out <report.json>. On ARM use the combat-only bundled runtime and explicit --runtime runtime --assets assets. No campaign build, commit, push or public release is authorized.


### Sixty-second confirmation runs
| Rooms × ships/room | Received snapshots/s | Physics steps/s | Latest-input ACK p50 / p95 ms | WebSocket Mbps/client |
| --- | --- | --- | --- | --- |
| 1 × 16 | 59.05–59.07 | 59.98 | 32.85–32.87 / 45.10–45.13 | 10.01 |
| 2 × 16 | 59.83–59.95 | 60.00 | 34.42–38.39 / 47.83–48.55 | 10.15–10.32 |
| 1 × 32 | 30.02–30.03 | 59.98 | 50.02–50.10 / 99.33–99.99 | 10.30 |
All three passed with zero authority recovery events and clean room/worker teardown. These are independent runs, not a paired optimization comparison; higher room count did not reliably imply lower Hz in this sample. Fleet state evolves during the minute, so neither the higher throughput nor bandwidth versus the shorter 32-ship run is a code optimization. Single-room 32-ship receipt averaged 24 Hz in the 20-second run and 30 Hz in the 60-second run, while physics remained near 60 Hz. Both are real measurements, not a deliberate 30 Hz cap.

The extended 16-ship scenes use roughly 10 Mbps of compressed WebSocket output per client; two rooms with two viewers each use roughly 41 Mbps total before IP/TLS overhead. This makes a hypothetical 5 Mbps public egress plan insufficient for the measured full-rate load, even when CPU can keep up. It is not a bandwidth cap setting or a universal requirement for every ship/loadout.

Reports: arm-isolated-long-{1-16,2-16,1-32}.json; combined foreground-summary.json. The failed teardown run is not included. No production foreground optimization was shipped in this retest: only benchmark correctness/observability and the browser observer changed.

### Regression and deployment state after this retest
- Publication gate 6/6; authority lifecycle 6/6; real authority integration 11 checks; transport/security 5 checks; LAN delta relay/client/worker and Steam binary gateway 30/30. Targeted oxlint, script syntax checks and git diff --check passed.
- Two headless local browser checks: ordinary loopback plus an explicitly configured PUBLIC_ORIGIN loopback service exercising the exposed-route transport. Both passed create/join/apply/ready/start, server input acknowledgement, actual creator reload and creator close/guest continuity, with zero page errors. The observer now reconstructs negotiated deltas/motion references instead of silently ignoring non-SWB1 packets. compressed-local-browser-results.json has remote=true only because it used BATTLE_TEST_URL; its URL is still 127.0.0.1, NOT Huawei/WAN. Test service was closed afterwards.
- Original cloud private service still responds on its own loopback port 32120: authority=server, protocol=25, build=2026-09-20T08:58:06.081Z. Its service was not restarted or replaced for these benchmarks. No public ingress or PC-to-Huawei browser gameplay latency has been verified. Existing manual VS Code forwarding requirement remains.


## Foreground optimization v2 — evidence and intended change before edits
User approved proceeding after the isolated-client tests. Scope remains multiplayer transport infrastructure only, not native gameplay/UI restoration. Evidence: isolated main-thread profile attributes ~2.57 sampled CPU-s to full binary decode in receiveAuthority; that graph is immediately discarded after summarizeCombatFrame extracts a small validation summary. Ordinary binary WebSocket broadcast already forwards the original bytes.
Plan: share the existing semantic summary validator; dedicated Node authority alone opts in to validating its captured frame before serialization and sending a small summary alongside the exact same binary body over trusted Worker IPC. Gateway validates summary structure, ship/deployment counts/IDs/teams, tick monotonicity and the IPC credit tick before forwarding bytes. No network message can enter this fast path. Missing metadata and decoded-state transport adapters retain the old full decoder route. Standard LAN/Steam Worker init stays opt-out. Physics/AI/render/snapshot target, flow credits, final report validation and wire protocol are unchanged.
Verification: differential summaries against decoded production worker packets, malformed frames/summaries and final report/deployment tests, mixed/legacy adapter fallback, forged network state rejection, existing lifecycle/publication/LAN/Steam checks, then before/after isolated cloud benchmark using frozen pre-change bundles. No claim of binary integrity from a summary alone: the fast path trusts locally generated worker bytes, not client bytes; production codecs and browser decoders still enforce the binary contract. No cloud service replacement until measured and reviewed.


### Foreground v2 implementation and final verification
Implemented shared CombatFrameSummary semantic validation, opt-in dedicated-worker summary metadata and prepareAuthoritySnapshot's trusted IPC fast path. Legacy/no-summary, JSON and decoded-state adapters still decode/validate fully. The fast path does not take network client messages. Ordinary LAN/Steam init never enables summaries. ProjectedSnapshotEncoder already validates values/keys/depth while writing; the redundant gateway full-object reconstruction is removed, not the client decoder or wire checks. Sparse ship/deployment slots are explicitly visited with Array.from: encoder array holes become null, so moving semantic validation before encoding must not accidentally accept holes that the old post-decode validation rejected.

Tests passed:
- Summary unit checks 6: detached metadata, exact wire envelope equality for identical captured input, JSON/legacy/adapter fallback, malformed world/craft/muzzle/deployment, stale/mismatched tick, byte budget, invalid summaries and sparse arrays.
- Real 16-ship Worker differential checked 1200 snapshots through tick 1200; 1185 snapshots included live AI weapon muzzle event windows. Every summary matched the full production decoder plus semantic validator. This is correctness coverage, not a timing measurement.
- Lifecycle 9, integration 12 checks (including client attempts to forge snapshot/summary messages and 71 real-packet differential checks), publication 6, exposed-route transport/security 5, LAN delta/Steam binary gateway 30, additional delta/binary-host/binary-snapshot 30. Local headless browser create/join/input/reload/creator-close 4 checks with zero page errors. Typecheck, targeted oxlint and diff whitespace checks passed. Combat-only Vite build guard passed; existing bundle-size warnings remain.

Measurement method: 30-second isolated-client phases, same seed/fleet as before. Preliminary ABBA order ran before1, after1, after2, before2, each at 2×16 and 1×32. After sparse-slot hardening, rebuilt the final bundles and ran a fresh baseline/final confirmation pair; do not label the preliminary bundle as the exact final source. Frozen bundles and raw reports live under artifacts/server-authority-20260920/foreground-v2; summary.json records both separately.

| Final confirmation | Gateway callback mean, before → final | Per-client latest-input ACK p50, before → final | ACK p95, before → final | Received Hz, before → final |
| --- | --- | --- | --- | --- |
| 2 rooms × 16 ships | 5.17 → 3.77 ms (~27% less) | 40.0–40.4 → 36.2–37.0 ms | 50.2–50.4 → 47.7–47.9 ms | 59.5–59.7 → 59.7–59.9 |
| 1 room × 32 ships | 8.26 → 5.54 ms (~33% less) | 55.1–55.8 → 53.0–53.6 ms | ~117 → ~118 ms | 25.27 → 25.17 |
The gateway figures average per-room means; they are NOT whole-server CPU or FPS gains. Preliminary 2×16 runs also reduced gateway mean from ~4.9 to 3.6–3.8 ms, but input ACK improvement varied materially (one after run ~30–31 ms median, another ~37 ms). Whole-process CPU includes synthetic client threads and is not reported as server-only savings. No WAN/TLS/GPU/input-to-photon latency was measured.

32-ship throughput did NOT reliably improve. Preliminary runs varied ~21–25 Hz, with one recovery event in before1 and one in after1; these counters include warmup. The final baseline/final confirmation had zero recoveries and ~59.93 physics steps/s in both, but receiver Hz and ACK tail did not improve. Do not hide those overloading events or present this as solving large-room performance. Capture/encoding on the authority worker remains the next bottleneck to measure/optimize.

Bandwidth is unchanged for comparable delivery: final 2×16 was ~8.6–8.9 Mbps per client in these 30-second phases. This optimization removes CPU work, not snapshot content. The final gateway profile has zero sampled time under receiveAuthority→decodeBinaryState (previous isolated profile ~2.57 CPU-s); remaining motion-reference/patch work is still significant. Profiles include startup/cleanup and profiler overhead, so do not subtract them as a paired wall-time benchmark.

Cloud candidate verification: the final server bundle was launched temporarily at loopback 32121 against the existing combat-only web assets. Its service smoke test passed HTTP assets, both compressed replicas, creator reconnect, hidden/resume and clean seat release; the owned candidate process was then stopped. The original loopback 32120 service is still running the prior deployment and was NOT restarted/replaced. Switching the live private test entry requires a deliberate restart that can interrupt rooms. No public hosting, campaign packaging, commit or push occurred. Final-service smoke result is foreground-v2/final-service-smoke.json.


## Capture/encode optimization v3 — investigation before edits
User asked to continue the dedicated-server path, not LAN/Steam integration. Evidence from v2: 32 ships maintain ~60 physics steps/s but only ~25 received snapshots/s after gateway decode removal. The authority's capture and encoding occupy its same simulation thread. This remains transport/presentation serialization work, not native gameplay/UI restoration. Before changing production code, profile the real authority isolate (not the gateway) with a test-only inspector wrapper; freeze current combat-only runtime and source for before/after. Any change must preserve all presentation state, references, events, 60 Hz simulation and bounds; generic accessor/Proxy semantics must not be silently removed. No public release, campaign packaging or restart of existing port32120 is authorized by this investigation.

Authority-isolate profile (20-second sample, 32-ship live battle, profiled overhead): ~14.64 sampled CPU-s fixedUpdate, 2.83 s captureCombat, 1.64 s encodeProjectedBinaryFrame. Physics/AI dominates; do not claim transport alone can deliver 60 Hz. Capture's array callbacks repeatedly call pack on finite primitive values; encodeArray uses generic per-item iterator/recursive dispatch. Candidate: dedicated-only opt-in primitive-array fast paths retaining exact values, order, full validation, generic/custom-array fallback and ordinary LAN/Steam defaults. Do not skip simulation-only subtrees: current traversal preserves getters, references and layout registration even where fields are later omitted. Validate exact bytes against frozen implementation plus pathological arrays and real combat, then measure.

The primitive-array prototype passed exactness tests but failed the first performance gate: local 32-ship fixed-world ABBA medians were ~4.10 ms capture / 2.36 ms encode baseline versus ~4.08–4.27 / 2.42 candidate. It was withdrawn (capture traversal and array iteration unchanged). Next candidate specializes only numeric tag/payload writes in the dedicated encoder: one buffer capacity check instead of multiple helper checks, exact pinned MessagePack widths/endian/float64, original helper for wide safe integers. No wire change, no field omission, no capture-semantic shortcuts; all existing type/key/depth/budget checks remain.


### v3 retained candidate and validation (2026-09-20)
Retained only the dedicated-server numeric writer in BinarySnapshot.mjs. host.worker enables it only when the trusted authority-summary initialization is active; normal browser-host LAN/Steam keeps the default encoder. It performs one capacity check and writes the same MessagePack tag/payload, keeping the library's wide integer helper. This is tied to pinned @msgpack/msgpack 3.1.3 and private fixed float64/integer defaults; revalidate on a library upgrade. No gameplay/AI/physics/capture traversal changes, no field removal or precision reduction. CombatSnapshot.ts and HostSnapshot.ts have no v3 diff. The earlier primitive-array experiment is NOT retained.

Repeated fixed-world 32-ship ABBA microbenchmarks, both encoders equally warmed (60 iterations each, medians of 100 calls per block):
- Local: mean of baseline block medians 2.494 ms vs optimized 2.256 ms (~9.5% encoding-only reduction).
- Cloud ARM run 1: 4.627 vs 4.440 ms (~4.0%); repeat: 4.563 vs 4.278 ms (~6.3%).
These numbers are NOT total frame time, whole-server CPU savings or user-visible latency. Capture is unchanged; its timing differences are noise. The final local validation with added over-budget coverage gave 2.512 vs 2.267 ms, also encoding-only. The repeated micro gain supports retaining this small opt-in writer, not claiming an end-to-end speedup.

Cloud live-room matrix: same frozen v2 baseline vs v3 candidate, before1/after1/after2/before2 order, separate 30-second phases for 2×16 and 1×32, real Worker/gateway, PMD/delta, one synthetic client Worker per recipient. Values below are phase received-Hz mean, mean of per-client ACK medians/p95s, mean physics steps/s, and whole-run recovery count (including warmup).

| Config / run | Received Hz | ACK median / p95 ms | Physics steps/s | Recoveries |
| --- | ---: | ---: | ---: | ---: |
| 2×16 before1 | 59.90 | 37.34 / 48.12 | 59.98 | 0 |
| 2×16 after1 | 59.85 | 35.44 / 47.64 | 60.00 | 0 |
| 2×16 after2 | 59.81 | 30.19 / 41.73 | 59.98 | 0 |
| 2×16 before2 | 59.85 | 31.14 / 43.81 | 59.98 | 0 |
| 1×32 before1 | 20.80 | 65.01 / 126.08 | 58.80 | 2 |
| 1×32 after1 | 23.13 | 57.78 / 117.15 | 59.95 | 0 |
| 1×32 after2 | 22.38 | 59.42 / 115.52 | 59.37 | 1 |
| 1×32 before2 | 26.03 | 51.12 / 111.58 | 59.90 | 0 |

Conclusion: no demonstrated repeatable room-level throughput/ACK improvement. 32-ship candidate lies inside the baseline's broad variability and still overloads in one run. Do NOT claim stable60Hz for32 ships or a proven latency reduction. 2×16 remains near60Hz under this short synthetic load. Gateway means stayed ~3.7–3.8 ms (2×16) / ~5.4–5.6 ms (32), as expected with no gateway code change in v3. Candidate 2×16 wire traffic ~8.75–8.76 Mbps/client; identical numeric wire representation is not a bandwidth optimization. Cloud telemetry capture/encode are final smoothed samples, NOT phase averages. CPU/RSS include synthetic client Workers. No WAN/TLS/GPU/input-to-photon test.

Validation completed against current candidate (default local runtime rebuilt first, not stale v2):
- Numeric differential suite: 7/7 locally; initial six-test version also passed twice on cloud ARM. Includes 20,000 seeded finite IEEE754 bit-pattern candidates plus integer sweep, integer tag boundaries, subnormal/-0 handling, sparse/custom arrays/getters, invalid types/keys/depth, owned outputs, and 61 byte-identical real32-ship snapshots through tick1200 with muzzle events. Added local seventh case rejects an oversized numeric projection at the unchanged16MiB budget and checks post-error recovery.
- Actual authority Worker: 1,199 snapshots checked through tick1200 in16-ship combat; all fast summaries match the fully decoded frame;1,184 muzzle-event frames.
- Summary6, lifecycle9, server authority12, transport5, publication6, projectile columns13, and selected LAN/Steam delta/binary compatibility41 checks passed.
- Two local headless browsers: create/join/apply/ready/start, both inputs acknowledged, creator refresh resumes same battle, closing creator leaves guest simulation running; no page errors. Tested existing combat-only browser build with NEW candidate authority, not a PC-to-cloud browser test.
- Typecheck and targeted lint passed. Combat-only Vite build passed with the existing large-chunk warning; no campaign entry packaged.
- Cloud candidate loopback32121 smoke passed HTTP/assets, both replicas with PMD/delta, creator reconnect and hidden/resume; candidate process then stopped. Existing loopback32120 PID3645 remains running, unchanged. No active-room restart, public ingress, commit, push or release.

Artifacts: artifacts/server-authority-20260920/capture-v3/ contains authority.cpuprofile, frozen before/after bundles, eight live-room JSON reports, ARM/local micro timings, comparison-summary.json, service-smoke.json and copied local browser/integration/transport/differential results. Next large-room investigation should target profiled physics/AI costs (native-source evidence and exact behavior/RNG equivalence first), not keep assuming the bottleneck is the network.
