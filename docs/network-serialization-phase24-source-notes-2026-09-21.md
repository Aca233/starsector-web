# Phase24 source notes — serialization worker boundary

User authorizes actual worker separation, not a cosmetic Hz change. Follow AGENTS: no agents/desktop/campaign/release, preserve other WIP.

Evidence: Phase23 source/report and five-player probes show physics and full capture/encoding share the authority thread. A local receipt optimization raised motion throughput but input P95 did not reliably improve. Copying a decoded full graph between workers previously failed to yield stable benefit.

Boundary: this is custom networking, not original gameplay/UI; no native mechanic, rendering or input behavior changes are authorized here. Preserve fixed 1/60 authority updates, exact SWF2/JSON semantics, receiver ACK budgets, sound/event retention and terminal ordering.

First measure native JSON+transferable UTF-8 of the existing compact P1 projection versus SWF2 encoding. If it is substantially cheaper on authority, use it as an immutable worker job (not structuredClone(engine/full object graph)). Capture must still read a completed authority tick consistently; do not falsely claim all extraction is off-thread. Heavy encoding can run independently. One job, bounded buffers, stale-epoch checks, polling of actual completed bytes, synchronous fallback and terminal cancellation with retained sounds are mandatory. Never read a concurrently mutable engine from a helper.

Also audit real guest decode/apply scheduling. No blind latest-frame dropping: sounds, damage/deployment state and remote ACKs must remain correct. Changes only after evidence/testing.

## Measured architecture decision (2026-09-21)
- JSON intermediate rejected: 377,261 bytes and stringify+UTF8 ~2.40 ms vs SWF2 159,322 bytes / ~1.28 ms.
- Private numeric tape: one transferable buffer (4 MiB cap), bounded string table; real SWF2 encoding on one helper; one pending job and 4 MiB shared output mailbox. Large/unsupported frames return to the original protocol path (16 MiB network budget unchanged).
- Both immutable lane variants may be prepared once, but each publication still needs its actual returned credit. Events retire only from lanes that were dispatched. Terminal/rebind/recovery invalidates jobs; no stale tick can become authoritative.
- **Candidate v1/v2 failed default-on performance acceptance.** 5-player/22-ship paired tests show a host full-frame Hz regression (31 to 22/24), with no stable overall motion/input improvement. V2 joins a newly credited second lane and recovers guest full throughput, but not host throughput. Leave helper explicitly opt-in (`VITE_LAN_SERIALIZER_WORKER=true`); Phase23 stays the default. Do not call this a proven latency optimization.
- Capture/extraction still runs on authority. Moving just encoding added a tape traversal, helper reconstruction and scheduling hop; cheap local tape microbench does not prove lower game latency.
- Guest audit: `LanBattle.tsx` already acknowledges input from motion; `SnapshotPlayback.ts` already bounds worlds to 8 and restores the last 2 endpoints only; discrete sound/muzzle ingestion precedes coalescing. Existing typed/vector target reuse and record scalar paths remain. No unsafe drop/early remote-ACK or duplicate decode worker introduced.

Final additional five-player runs failed sustained-overload acceptance in BOTH default and helper modes (`verified-default-5p`, `verified-optin-5p`). Preserve these failures; no stable-60Hz or fully-fixed claim. Exact details and baseline/changed-source boundaries are in the Phase24 report.
