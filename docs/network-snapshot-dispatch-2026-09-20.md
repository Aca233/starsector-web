# Bottom-up snapshot dispatch optimization — 2026-09-20

## Scope / evidence before change

User requested continued optimization, including low-level work, with actual guest receive/apply Hz prioritized. This change is confined to lossless capture serialization, not combat physics, AI, phase rules, networking credits, renderer frames, or GUI layout. The previously saved host Worker profile identified recursive `pack` as a major capture cost. That profile predates this round; it is evidence for selecting a hotspot, not a new speed measurement.

Fresh complete-game baseline: both32-ship trials (one intended to profile, one unprofiled) aborted during the tick180 warmup due to the existing host overload protection. Neither produced a valid measured-Hz run or fresh CPU profile. The failures are retained in artifacts; they must not be omitted or compared to a later successful run as a speedup. A16-ship baseline subsequently completed normally. No overload threshold, warmup requirement, fixture roster, or synchronization assertion was weakened.

Native implementation was also inspected while evaluating alternatives: local launcher reports Starsector0.98a-RC8; decompiled `com/fs/starfarer/combat/entities/Ship.java:5006` returns the current `phased` field, and API `ShipAPI.isPhased()` exposes it. Web `Ship.isPhased` dynamically combines several systems. No phase/state caching optimization was made: preserving immediate transitions is more important than removing a hot getter speculatively. No native UI change or live native UI-equivalence claim is involved.

## Candidate and retained implementation

`CombatSnapshot.pack` now recognizes arrays early ONLY under the already-explicit, locally-owned native-capture contract. This avoids repeatedly testing nested arrays against Ship, Vector2, typed views, Map and Set. For ordinary native arrays with standard map/constructor/species behavior, an indexed loop retains map's captured length and hole checks, copies scalar cells directly, and invokes the original recursive packing only for structured/tagged values.

Custom array classes/mappers/constructors use the existing map traversal. Generic capture keeps its original type/read/recursive semantics. No frame schema, layout interning order, number representation, undefined/nonfinite tags, cycle rules, Ship-reference discovery, projectile columns, puff budgets or event windows change. Every frame still owns fresh arrays; there is no temporal state cache. Fast native capture continues to require the normal uninstrumented engine graph and ordinary builtins, not arbitrary accessor/Proxy graphs.

A typed-array iterator bypass was explored but NOT retained; the original Array.from path remains, including custom iterator and detached-buffer behavior. Production changes do not modify any engine simulation file.

## Validation plan and artifacts

- Frozen pre-change pack/capture functions are appended only inside a test esbuild bundle; both versions use the same engine classes and same actual world, avoiding cross-bundle instanceof artifacts.
-32-ship1200-step replay: compare full capture objects, encoded bytes, restored receiver states and RNG at21 checkpoints. Include muzzle windows, projectiles, damage and craft behavior.
-Generic/native regression also exercises primitive tags, holes, cycles, custom maps/species and typed iterators/detachment.
-ABBA fixed-world capture timing is diagnostic only, not a gameplay-Hz claim. Exploratory timing reports are retained separately.
-Complete-game16-ship ABBA uses two headless browsers on one PC, real host Worker/relay, no link limiter. Unique accepted authoritative ticks count as Hz; rendered/interpolated frames do not.32-ship warmup failures remain part of the capacity report.

Artifacts: `artifacts/guest-bottomup-20260920`. `CombatSnapshot.before.txt` is the exact start-of-turn baseline. The test-only build helper's new `--reuse-assets` option reuses an existing isolated public-asset directory while rebuilding JS; it is not an installed-game update or production package. Campaign code remains excluded by the existing combat-only build guard.

Results will be appended after final verification. No commit/push/release, cloud deployment, standing-service restart, or desktop input was performed.

## Final measured results

Final implementation is array dispatch/indexed scalar copying only. No typed-view fast path remains. Same-world frozen-before vs after microbenchmark,160 captures/block in ABBA order at tick1200 of32-ship combat:

| Variant/run | Median capture ms | p95 capture ms | Encoded bytes |
|---|---:|---:|---:|
|Before A|4.420|10.122|272,651|
|After A|3.657|5.661|272,651|
|After B|4.369|6.683|272,651|
|Before B|3.782|9.049|272,651|

Median-of-block averages4.101→4.013ms (~2.1%); p95-of-block averages9.585→6.172ms (~35.6%). Substantial run-to-run noise remains; do not advertise these as a guaranteed CPU reduction or guest-Hz increase. Every21 checkpoint's complete projection and bytes matched the frozen baseline, and both receivers restored equivalent states. Simulation RNG was unchanged;20 checkpoints contained projectiles and muzzle-event windows were retained. Earlier exploratory timings, including the rejected typed-array variant, are separate logs and not final performance results.

### Complete game, no bandwidth limiter

Two headless Edge browsers on one PC, real host Worker + loopback relay, same deterministic fleet fixture and unchanged warmup/protection logic. Source host.worker and BinarySnapshot files were checked equal to the start-of-turn copies; only the intended capture code differed in the paired frontend builds.

| Fleet / ABBA run | Before guest accepted Hz | After guest accepted Hz |
|---|---:|---:|
|16 ships, A|57.743|54.163|
|16 ships, B|57.946|58.658|
|32 ships, A|24.142|34.483|
|32 ships, B|21.582|FAIL: overload/desynchronization|

16-ship runs all retained100% synchronized callbacks, unique increasing accepted ticks and zero page errors. Mean57.844→56.411Hz: **no end-to-end Hz improvement demonstrated**.32-ship after-B failed (only~47% synchronized callbacks; its14Hz full-window average includes the failure and is NOT a sustainable throughput result). Before-B passed the unchanged>98% sync assertion, but only narrowly at~98.14%;32-ship capacity is unstable in this session. The earlier two baseline warmup failures remain recorded. Never average away the failure or cite the34.48Hz successful candidate as proof of a stable speedup.

### Actual bottleneck evidence from the successful32-ship baseline A

Host HUD sample means: simulation13.444ms/step, capture5.122ms/snapshot, encode2.809ms/snapshot. Guest average received24.142Hz while physics progressed59.912 ticks/s. In the last authority telemetry sample, simulated58.457/s but produced16.844/s; host upload15.939/s and uploadSkipped0. Relay receiver stage sample: queued20.686/s, consumed21.481/s, skippedSocket0 and skippedCredit0 (windows are sampled independently, so these are not a single synchronized conservation equation).

The source cannot capture/encode every physics tick at60Hz with ~13.4+5.1+2.8ms serial work per tick/snapshot on this machine. Catch-up coalesces publication; the guest cannot receive a snapshot that was never generated. Raising receive credits or duplicating frames would not fix that. The patch lowers some recursive dispatch/allocation overhead, but **does not solve this overall CPU budget**, and no stable32-ship60Hz claim is made. Future work should target measured authority simulation and capture/encoding costs with exact behavior/RNG equivalence, not keep tuning only relay bandwidth.

### Checks

-6 native-capture regression tests passed, including32-ship replay, carriers, reserve/death lifecycle, generic two-pass semantics and the new array/custom-iterator/detached-view cases.
-Frozen-function differential replay passed all21 complete projection/binary/receiver checkpoints through1200 physics steps.
-Typecheck and changed-file lint passed. Final combat-only Vite build passed (existing large-chunk warning remains).
-Shared authority capability and selected network regression results are in shared-authority.log/network-regression.log. This is not the full Steam pressure suite and its previously documented failures are not declared fixed.

No campaign changes, source commit, push, release, installed-game update or public-server restart were performed. The specific bottom-up capture optimization and its verification are complete; the broader low-Hz/60Hz objective remains unresolved.
