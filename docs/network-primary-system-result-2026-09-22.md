# Primary-system alias experiment: not retained

Main agent implemented and tested; subagent proposed/read only. Previous proven weapon pruning remains untouched.

Native Ship.system === systems[0] was factored before recursive capture using a frame-local marker. Decoder restored once only for a native aliased target; split/custom targets received both restores in original root order. Generic accessors preserved two writes. Local source cycles/custom arrays and prototypes fell back. Component mode and legacy capture stayed unchanged. No gameplay change, no UI change.

## Evidence

32 ships, paired ABBA at identical authority state, 160 samples/arm. Entire capture + SWF3 encode + decode + native apply, no render/RAF/WAN. Baseline already includes weapon authority pruning.

|Metric|Full|Factored|
|---|---:|---:|
|Total P50 ms|8.8402|8.6451|
|Total P95 ms|13.2272|11.4591|
|Total mean ms|9.0377|8.5153|
|Bytes P50|126664|125085|

Only ~2.2% median improvement; capture/apply medians did not improve. Different machine conditions mean do not compare absolute values with earlier weapon-projection runs. No actual room, FPS, latency or Hz improvement is established.

Three scoped cases passed including cold/skipped/JSON/binary, activationInput/teleportVisual, reversed root property order, multi/split system identities, source/RNG/wire immutability, generic setter count, invalid markers, cycle/custom/empty fallback. Typecheck (tsc -b) and scoped lint passed after fixing a script replacement quoting error.

## Decision

Rejected for default integration. Exact pre-experiment file contents restored after checking no intervening writes. Protocol remains 29; no primary-system flag or marker in production. Candidate source/fixture and raw measurements are in artifacts/primary-system-20260922 for evidence only. No commit/push/release or career modification.
