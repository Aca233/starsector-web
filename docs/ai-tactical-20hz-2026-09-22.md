# 20 Hz tactical decisions, 60 Hz immediate control

User explicitly approved reduced tactical AI frequency on 2026-09-22. This is an intentional Web policy change, NOT a claim of native timing equivalence. No physics, player-input, weapon, collision, network-rate or rendering-rate reduction.

## Source before implementation
- Local Starsector 0.98a-RC8, decompiled/starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java:289–385: advance maintains target validity, order/AI flags, threat response, maneuver execution, interval-triggered collision checks and immediate ongoing avoidance; vent/defense/engine modules remain in the advance path. Obfuscated calls are evidence of separation, not a basis for copying exact constants.
- starsector-core/data/shipsystems/scripts/ai/FastMissileRacksAI.java:20–23 explicitly says unused sample; its 0.5–1s tracker is NOT evidence of production frequency.
- Web currently computes target/profile/tactical positioning/route/fire-lane choice every CapitalShipAI.update. Preserve per-step threat assessment, defense timers/actions, immediate avoidance/steering and system AI callbacks. Hold only tactical intent for up to 50ms, refresh immediately for orders/invalid targets/control and safety transitions. Ship-ID phase offsets do not consume RNG.
- Existing Publisher/Owner serializes every primitive AI field, including new cadence/intent scalars. No opaque per-owner cache or protocol changes.
- Shared fleet assignment generation remains current every step; individual target/range/route decisions use the 20Hz budget.

## Verification plan
Extend existing combat-AI checks with cadence, staggering, immediate defense/obstacle/order/target invalidation, manual handoff and worker-state synchronization. Compare existing headless navigation scenario with preserved 60Hz source, report CPU timings separately from behavior differences. No native UI change; native desktop verification not performed.

## Implemented and retained

- CapitalShipAI samples individual target/range/profile, desired route/heading and fire-lane repositioning at nominal 20Hz in simulation time. First evaluation is immediate; steady-state decisions are distributed across three stable ship-ID phases without consuming RNG.
- Threat assessment, shield/vent observation and actions, current-world collision avoidance, steering and all ship-system AI callbacks still execute each physics step. Shared fleet assignment calculation also stays per-step; this change does not claim all AI work is at 20Hz.
- New/in-place orders, invalid or removed targets, withdrawal/flux/engine/system/role transitions and manual/pilot handoff invalidate the held intent immediately. Retreat/death/docking clear controls immediately. The actual pilot edge command sets AI mode before update and clears diagnostics; that path is explicitly covered.
- Cached values are primitive AI fields handled by the existing generic Publisher/Owner schema. No opaque cross-realm cache, network protocol bump, guest simulation, RNG scheduling or physics step change.
- Default enabled; build with VITE_AI_TACTICAL_20HZ=false to restore per-update tactical decisions. The dedicated-server builder forwards the same flag. No game UI, release build or deployment was launched.

## Validation

- TypeScript build and scoped lint passed during implementation; final typecheck status is recorded in artifacts/ai-tactical-20hz-20260922/typecheck.log.
- Existing scripts/check-combat-ai.mjs: 30 cases passed, including all three cadence offsets, 60Hz defense, immediate projectile/obstacle response, command/target invalidation, manual handoff, lifecycle re-entry and 12-step serial/Owner agreement under three conditions.
- Existing 22-ship navigation scenario: 3/5 controlled seats, 600 fixed 1/60 steps each (240 warmup + 360 timed), alternating control/candidate order. At each of 1,200 steps, candidate replay bytes/RNG match candidate; rollback bytes/RNG match the preserved original source. Both modes advance exactly 10 simulated seconds per case.
- 20Hz and original 60Hz tactical trajectories intentionally differ (599/600 frames per case); this is NOT an exact-behavior optimization. Entity counts also differ, so whole-step comparisons include those consequences, not just identical-state instruction savings.

### Final-source paired timing

| Controlled seats | Full-step P50 ms | P50 reduction | P95 ms | Fleet-AI mean reduction |
|---|---|---|---|---|
| 3 | 9.3803 → 7.7999 | 16.85% | 22.8351 → 21.8396 | 23.24% |
| 5 | 8.8189 → 7.8813 | 10.63% | 13.2782 → 10.8910 | 24.80% |

Full-step mean reduction: 3 seats 11.77%; 5 seats 11.57%. Earlier pre-pilot-edge-fix run was also positive (P50 reductions about 13% / 12%); absolute timings vary with host load. Do not treat these two bounded runs as a statistical guarantee.

Evidence and hashes: artifacts/ai-tactical-20hz-20260922/result.json, simulation.json, simulation-first.json, contracts.log and exact pre-change source copies. No actual room Hz, WAN RTT, guest FPS, visual feel or long-match balance measurement was performed. No UI changes or desktop interaction.

Only this accepted AI-frequency change was implemented. Prior unrelated optimization and career-mode work was preserved; no staging, commit, push or release.
