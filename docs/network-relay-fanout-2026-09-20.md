# Relay fanout optimization (2026-09-20)

Scope: networking-only, no native gameplay or UI change, no campaign, no desktop interaction, no release/deployment. Preserve other tasks' authority/codec work.

Evidence: server/LanDeltaTransport.mjs shares patches but calls encodeLanPacket per receiver; server/lan-server.mjs broadcasts each prepared buffer with ws.send. Pinned ws 8.21.3 lib/sender.js dispatch calls each peer's PerMessageDeflate.compress, and its unmasked server frame writer does not mutate compressed payload. lib/permessage-deflate.js _compress strips the RFC7692 flush trailer and resets the stream when server_no_context_takeover is negotiated. Those conditions permit byte-identical output sharing; context-takeover, fragmented, unmarked, mismatched or unknown-version paths must keep ordinary compression.

Plan: per-target immutable packet memoization; narrowly guarded in-flight compression deduplication with bounded jobs/bytes/waiters. No completed-output cache or unsent snapshot queue. No changes to CRC, motion-reference v1 math, network/consumption credit, protocol limits, precision or disconnect horizons. Owner failure must not tear down healthy follower peers; retry them through their own native compressor.

Validation: byte equality against encodeLanPacket; independent receiver bases and commit/reset; actual compressed WS with mixed parameters and close/error cases; workload measurements report codec/fanout only, not n2n routing, physics or game FPS. Results pending.

## Implemented and verified

- Per-broadcast LanDeltaSender packet memoization is keyed by payload identity plus exact base sequence/CRC, anchor flag and motion-reference steps. Different bases, windows, old formats and non-anchor packets are not conflated. Prepared packets are immutable; per-peer commit tokens, bases, credit and failure handling remain separate.
- LanBroadcastCompression only attaches to real server-side negotiated PMD of pinned ws 8.21.3, stock level1/mem7/chunk16KiB configuration, explicit server_no_context_takeover and matching negotiated window bits. Unknown versions/options/context takeover, fragments, unmarked bytes and pooled partial views use stock ws. This depends on private ws shape and must be re-audited on upgrade; automatic fallback does not promise compatibility with arbitrary future internals.
- Only current in-flight jobs share a result. No completed cache, additional message queue or retry history. Caps:32 jobs,32MiB of unique input,10 waiting senders per shared job; exceeding a cap uses ordinary ws admission rather than retaining new work. Shared compressed output is only used by unmasked server senders.
- If the owner closes/fails, healthy followers retry once through their own PMD streams. A closing follower is terminated before the error callback can write an empty replacement; other peers are not closed. Current ready-only broadcast order and all network/consumption/backpressure/timeouts are unchanged.
- The adapter is attached only to LAN/web-server endpoints, not Steam native peers. Packet memoization also benefits common LAN-delta code used inside Steam encoding, without changing SSB1.
- Aggregate compressionFanout counters on existing LAN diagnostics are process-wide relay totals, not per-room bandwidth: requests/jobs/shared/savedInputBytes/retries/fallback/activeJobs/activeBytes. savedInputBytes means duplicate compressor input avoided, NOT wire bytes saved. Payloads and identities are stripped by the logger.

## Performance evidence

Fixed recording: phase5/frames22, released v0.2.5 ef043ecef4547321929dd0ffb0eee47074d08b13,22 ships. No simulation/engine changes were made or tested as part of these benchmarks. Each trial replays60 original complete binary states to9 guests (12 warmup,48 measured), retains original sequence IDs, verifies byte-exact reconstruction, and fully drains each batch. It is not a60Hz offered-load or input-to-photon test.

Real PMD loopback WebSocket ABBA with receiver decoding in a separate process (fanout-isolated-abba.json/.log):

|Metric|before1|after1|after2|before2|
|---|---:|---:|---:|---:|
|Sender CPU over48 broadcasts|391ms|218ms|188ms|421ms|
|Mean batch completion|23.08ms|23.09ms|22.60ms|22.59ms|
|Native compression calls|432|48|48|432|
|Measured wire bytes|8,204,085|8,204,085|8,204,085|8,204,085|
|Packet builds over60 broadcasts|540|60|60|540|

Average sender CPU406→203ms (~50% reduction) in this fixed nine-recipient workload. Compression calls drop8/9; all2160 received complete states are byte-identical. Batch completion does NOT show a meaningful speedup: receiver work still dominates here. Do not interpret sender CPU savings as stable60Hz, lower network RTT, or a50% whole-game CPU reduction. No bandwidth saving is claimed.

Earlier same-process receiver ABBA (fanout-abba.json) mixed sender and nine receiver CPU costs:1594/1312ms before vs1281/1531ms after, overlapping noise. That evidence alone would not justify a sender CPU claim; the isolated-process run addresses that measurement limitation. The earlier harness source is retained as same-process-benchmark.source.txt.

## Correctness / compatibility

- Network plus selected Steam binary/worker/byte-window regression:230/230 before final closing-follower hardening. Final focused suite after that hardening:23/23. This is NOT the full Steam pressure suite; previously documented pressure failures are not declared fixed.
- Actual10-player room using real compressed WebSockets and createLanServer:9 guests reconstruct the validated complete frame exactly, all9 original state-consumed credits clear;1 compression job serves9 peers. Setup still validates real room capacity, fleet size and state structure; no production validator weakened.
- Real9-peer PMD test covers differing negotiated window sizes, control messages, a closing owner and healthy followers. Deterministic tests cover fragments, context takeover, wrong extension shape/options, metadata separation, count/byte caps and fallback retry.
- Headless Edge153.0.4234.46 native WebSocket PMD + production browser LanDeltaReceiver:3 guests ×12 recorded frames=36 exact SHA256 matches,12 native jobs/24 shared requests,zero page errors or remaining active jobs. No desktop window/input and no game-rendering claim.
- Typecheck and scoped lint passed. Browser/benchmark/failure logs and source/graph audit live in artifacts/relay-fanout-20260920. Existing network CI now includes the new fanout regression.

No campaign changed, no commit/push/package/release, no running service restarted or deployed. Other tasks' authority/codec work was preserved. Remaining: n2n/remote server routing and bandwidth, large-battle client decode/apply/physics, adverse WAN/long-duration multi-room testing; this optimization only removes duplicate server fanout work.
