# Guest receive-Hz / shared wire reduction — 2026-09-20

## Scope and evidence before editing

User confirmed the intended priority: raise actual guest receipt/application Hz first, then reduce latency; do NOT lower Hz. Networking/serialization only, not native gameplay or UI restoration. Existing campaign, authority, host-capture/codec and other tasks' changes are preserved. No service restart, desktop interaction, commit/push/release or installed-game update.

The user's older 0.2.5 guest session (02:43:07 UTC recording) contains more than one bottleneck. Visible LAN guest battle 27 has median receive/apply 12/12 Hz, RTT351.9ms, input acknowledgment379ms, parse1.6ms/apply3.4ms, rendering60FPS. Battle28 has 7/7Hz, RTT642.9ms, acknowledgment781.1ms, parse2.6ms/apply5.1ms and60FPS. These samples support transmission/queue pressure rather than simply a10FPS renderer. They predate subsequent network changes and do NOT describe the current source's actual n2n performance. Newer fixed-workload source tests already show separate host/capture/render ceilings in large battles; this patch does not remove those ceilings.

Previous fanout optimization removed repeated server compression work but did not reduce wire bytes. This round targets the shared lossless LAN delta matcher, also used by negotiated Steam SSB1 (including the preparation Worker). Legacy non-binary Steam paths are unchanged.

## Change

`createLanBytePatch` previously tried only two hash-indexed candidates, sampled every four bytes. Repeated layouts can collide in that table; an unchanged run displaced to an unindexed offset can also be missed. The new matcher additionally tests the displacement of the last successful copy (initially zero). It still compares every byte before copying, selects the longest match, and prefers the continuity offset only on ties.

The extra candidate does not mean predicting game state. No floats are rounded, fields removed, precision reduced or frames duplicated. Word-at-a-time equality comparisons avoid some of the added comparison cost, with bounded byte comparisons for tails. Displacement is local to one function call, not a cross-frame cache. No additional retained frame or queue.

Unchanged: SLD1 flags/opcodes/decoder, SWB1/SWF2/SSB1 contracts, v1 motion-reference math, CRC and Steam canonical SHA validation,16-byte minimum match,64K two-entry index,2MiB input and half-target output limits, existing2-build/4ms broadcast admission budget, credit/queue ceilings, timeouts,60Hz target and physics. At most three candidates are examined per target position, with no chain search; the comparison work remains linear with a fixed candidate factor. Old receivers accept the new packets.

Exploration compared byte-wide indexing, stronger hash, shorter copies, continuity-only early exit and continuity plus word comparison. Denser indexing cost more CPU; shorter copies did not improve compressed bytes enough. Only the bounded continuity/word variant was retained. Exploration files are not production code.

## Frozen-recording results

Recording: released0.2.5 commit `ef043ecef4547321929dd0ffb0eee47074d08b13`,22 ships,241 original consecutive complete states (`phase5/frames22`). Both versions use the same CURRENT relay/codec graph; the before bundle substitutes only the saved original LanBinaryDelta module. No dirty simulation is used. First30 frames warm up,211 measured.

| Measurement,211 states | Before | After | Reduction |
|---|---:|---:|---:|
| Actual loopback PMD WebSocket bytes written |4,648,681|4,356,510|6.29%|
| Production Steam codec framed bytes (in-memory delivery) |4,682,502|4,394,826|6.14%|
| Raw LAN packet bytes |6,184,059|5,695,095|7.91%|

Actual WS sender socket byte counters exactly match the compressed-byte calculation for both versions;241 complete states per version are restored by the PRE-CHANGE receiver. There is no claim of native Steam routing or n2n testing. Wire counters include WS/Steam framing, not IP/TCP/UDP/n2n overhead.

Four ABBA codec trials each verify482 complete states (241 LAN +241 Steam), totaling1,928 byte-exact full-state restorations. Steam checks both original SWB1 bytes and canonical JSON/SHA validation. Byte totals are identical within each variant across repeat trials. LAN prepare+deflate mean times across final ABBA runs:3.519 /3.072 /3.066 /3.227ms; Steam prepare+deflate7.424 /6.948 /6.799 /6.932ms. Timing is machine-load/JIT sensitive and is not proof of game Hz. The principal result is fewer bytes with no material preparation-cost regression in this workload.

## Ideal constrained-link model — NOT real WAN measurements

Same original4-second recording offered at60Hz, production LanStateCredits,68ms fixed idle RTT, exact FIFO bandwidth and2ms modeled consumer. CPU cost, loss, jitter, TCP behavior, GPU and competing traffic are NOT simulated. Unsent packets obey existing credit admission, and all delivered states are verified exactly. Report Hz during1–4s; arrivals are counted, not interpolated ticks. All modeled in-flight credits drain at the end.

| Link | Before received Hz | After received Hz | Mean generation-to-arrival age, before → after |
|---|---:|---:|---:|
|4Mbps|18.67|19.67|261.0 →247.0ms|
|8Mbps|42.00|45.67|92.0 →81.8ms|
|16Mbps|60.00|60.00|45.0 →44.3ms|
|32Mbps|60.00|60.00|39.4 →39.1ms|

This short deterministic model indicates the expected direction under bandwidth pressure. It does NOT prove sustainable real guest60Hz, reduced n2n RTT, lower input-to-photon latency or a fix for the old7–12Hz cases. In particular,4/8Mbps remain below60Hz. More substantial transport/representation work and fresh two-PC logs are still required before claiming that target achieved.

## Validation

-4 new regression tests:400 seeded mutation/insertion/deletion comparisons against an independent scalar candidate oracle; unaligned views/word tails/ownership; repetitive/colliding inputs through2MiB; empty, oversize and incompressible fallbacks. Independent patch interpreter verifies all emitted bytes and operation bounds.
-146 focused network, LAN delta/worker/credits/congestion/fanout, motion-reference and Steam binary/Worker/byte-window tests passed.
-Actual headless Edge153 native WebSocket PMD:3 receivers ×12 recorded states,36 exact SHA comparisons, zero page errors and no retained compression jobs/bytes. No visible windows or injected desktop input.
-Source typecheck and scoped lint: see logs below.
-Existing Steam pressure failures are NOT declared fixed. This focused suite is not the full Steam pressure suite; no assertions or timeouts were weakened.

Artifacts: `artifacts/guest-wire-20260920/` contains frozen before source, exploration, regression/browser/typecheck/lint logs, and final before/after bundles plus `final/comparison.json`. Reproduce with:

```
node --test scripts/check-lan-delta-continuity.mjs
node scripts/benchmark-lan-delta-continuity.mjs artifacts/network-latency-phase5-20260920/frames22 artifacts/guest-wire-20260920/LanBinaryDelta.before.txt artifacts/guest-wire-20260920/repeated
```

Changed production file: `src/network/LanBinaryDelta.mjs`. Added focused test and reproducible benchmark, appended focused test to the existing network CI command, and added this document. Other tasks' files and campaign remain untouched by this round.
