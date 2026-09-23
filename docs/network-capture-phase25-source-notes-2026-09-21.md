# Phase25 source notes — reduce actual repeated capture work

Phase24's helper added authority tape extraction, helper graph reconstruction and a scheduling hop, regressing full publication and failing heavy-load acceptance. Keep it opt-in; no repeat of that architecture.

Scope: custom Steam/LAN shared networking only; not original mechanics or UI. Original-game parity evidence is unchanged: no simulation, damage, AI decisions, input, rendering content, float precision or battle density may be changed. No agents, desktop interaction, campaign, release, OS/network settings. Preserve concurrent engine WIP.

Evidence to inspect before edits: `CombatSnapshot.ts` native `pack`, `SnapshotLayouts.record`, `ProjectileColumns.ts`; real 22-ship captured-world profiling. Native authority opts in explicitly to a trusted graph; generic/custom getters and Proxy paths must retain their existing observable behavior.

Candidate boundary: reuse field/child-projection/layout plans, NOT stale captured values. Every current field value and Ship reference must still be read/projected; added/deleted/reordered fields, prototype changes and function-to-value transitions must invalidate plans. Weak object identity caches must not retain worlds. Every output frame stays independent, with original field dictionary order and exact final SWF2 bytes. No new Worker, async handoff, transport, ACK policy or reduced Hz target.

Acceptance: paired old/new captures on the same actual engine, exact SWF2 bytes and non-mutated world; adversarial shape mutation/fallback tests; matched frozen 5-player rendered browser runs measuring physics/full/motion Hz and input confirmation P95 (not only capture microbench); stress/reconnect with original assertions. Do not claim microbench percentages as whole-game gains or hide failed runs.

## Selected implementation and observed acceptance

Actual paired 22-ship/225-projectile capture fell from 3.312 to 2.819 ms mean with exact SWF2 bytes. Frozen rendered five-player A/B/B/A runs improved complete receive Hz from 32–33 to 40–43 and from 37 to 40–41. Input confirmation improved in the first guest group, not consistently in the reverse group or on host. Keep precise boundaries: positive complete throughput, not universal lower RTT or stable 60Hz.

Native field plans are selected default-on; every value and current key sequence remains read. `capturePlans` telemetry shows actual hits. Final 3/4 passed; first5 failed the unchanged5-publications/450ms threshold with4, despite input progress/reconnect succeeding; one identical repeat passed with8. Both retained. No claim that heavy-load risk disappeared.
