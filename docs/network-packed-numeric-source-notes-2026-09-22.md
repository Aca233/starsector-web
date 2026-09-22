# Native numeric snapshot boundary — source notes (2026-09-22)

## Current decision — retained at the user’s explicit request

The user asked to keep this improvement after reviewing its measured 2.7–3.8% offline gain. Restore the verified candidate into active source, including binary-enabled authority capture, bounded codecs, restore, numeric-block checks and protocol 26. Do not replace dist or the running application, publish, touch campaign content, reduce frequency/precision, or relax credits. Check the archived baseline against current files first so unrelated WIP is preserved. One consolidated typecheck, changed-file lint, focused codec/restore checks and one existing compiled five-player scenario; no repeat performance benchmark.

## Earlier decision (superseded)

Not activated. The candidate and all checks are archived under artifacts/network-packed-numeric-20260922/candidate. All 11 pre-existing source/test files were restored byte-for-byte to their pre-experiment state; the two new candidate-only modules were removed from src after verified archival. Runtime remains protocol 25. No build, installed app, release or campaign content was changed. See network-packed-numeric-result-2026-09-22.md.

## Scope and evidence

Pure networking representation change; no original gameplay, AI, damage, RNG, timing, UI or render field removal. Original in-game UI verification is not performed and is not a claim of this work. Simulation and full-state target remain 60 Hz; receipt/consumption ACK and bounded queues remain untouched.

- CombatSnapshot.ts pack currently expands native typed arrays with Array.from; unpack constructs or fills typed arrays from scalar arrays.
- ArmorGrid.ts already stores cells as Float32Array. Preserve all existing element widths, not Float32 quantization of ordinary JS numbers. Capture must own bytes: cells may be written directly and dirtyVersion is not a sufficient cache invalidator.
- Phase42 retained legacy scalar wire encoding; this change instead removes scalar arrays on both binary endpoints. Prior rejected cache/worker/recipe experiments are not enabled.

## Contract

Protocol revision 26; SWF3 extends the unchanged SWF2 dictionary with bounded MessagePack bin values containing explicitly typed little-endian numeric blocks. SWF2 and legacy inputs still reject binary/ext tags. Binary-enabled host captures in the candidate use independent packed storage; generic captures remain unchanged. JSON fallback uses the old numeric-array shape, including legacy nonfinite handling. No temporal baseline is introduced. The optional private tape path retains numeric arrays and remains opt-in.

All type/size/alignment/finite checks must apply to ordinary decode, relay projection, and rare UTF8 fallback. Decoded data must not alias received or transferable buffers. Motion-reference scanning may skip only bounded, validated blocks; reference math stays unchanged. Consumers validate marker type agreement before writing a target.

## Validation plan

After coherent implementation: one concentrated typecheck and changed-file lint; extend existing codec and native-capture correctness checks; paired native capture/encode/decode/restore measurements using existing fixture; one compiled five-player existing scenario if correctness and the pipeline comparison justify retaining the change. Isolated artifacts only, no dist/install replacement, no campaign/release, commit or push. Report endpoint timing separately from actual input latency and full-state rate.

## Reintegration verification result

Active source retained at user request. Typecheck/lint and 29 focused checks pass; isolated battle build passes. Compiled five-player startup timed out before battle, and the existing shared-authority scenario hit the sustained-overload guard. Neither failure is claimed resolved or attributed to a specific cause. No more whole-scene retries or lower thresholds; full multiplayer acceptance remains pending. Existing installed client/dist unchanged. See the result report and retained/retention-result.json.
