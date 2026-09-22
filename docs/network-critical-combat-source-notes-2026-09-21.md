# Critical combat-state stream: source notes (2026-09-21)

Scope: optional LAN layered transport only; no combat-rule/UI redesign, no campaign changes. Dedicated authority remains the only producer. Actual native desktop UI comparison is pending permission; no desktop interaction performed.

## Local native evidence
- Starsector local API sources under `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/` (the local 0.98a source/resource tree used by existing combat audits; no newly asserted native executable verification).
- `CombatEntityAPI.java:49,54,59`: shield, hull level, hitpoints are separate from location/velocity.
- `ShipAPI.java:87,109,281,336`: hulk/alive, flux tracker and phase state.
- `FluxTrackerAPI.java:8-12,20-21`: overload remaining, overload/vent flags, current and hard flux.
- `ShieldAPI.java:20,30,33`: facing, active arc and on/off.
- Web `FluxTracker.ts:22-35`: soft/hard flux, overload timer/duration, vent state/progress, boost state.
- Web `Shield.ts:45-51,65-68,116-134`: active arc alone is insufficient: fade-out and phase timers drive visual getters. Mirror those stored values exactly, do not call toggles or advance timers on the replica.
- Web `LanBattle.tsx:818+`: complete-world restoration currently writes these fields; motion only affects presentation poses. A fresh position cannot make an old HP/flux value fresh.

## Expected behavior / current difference / verification
- Display authoritative HP/flux/shield/death values without waiting for a complete world. Keep original calculations, fonts, HUD layout, controls and effects; do not synthesize damage or execute death/overload side effects on guests.
- Current weak-link 5-player replay still has multi-second complete-world age despite >50Hz motion. Critical state needs its own small, bounded stream; making its number 60 does not solve world application or render cost.
- Use standalone complete critical rows (not deltas requiring a world baseline), negotiated only for dedicated LAN authority. Separate exact application consumption credits; one coalesced Worker mailbox, no historical state queue, bounded immutable bytes. Legacy/helper/Steam paths must retain whole-world fallback.
- A newer critical tick must be re-applied after any older full restore; a same/newer full world wins. Match/sync changes retire old state, unknown IDs never create ships. Freshness statistics do not remove the existing world safety/resync gate.
- Tests: finite/size/UTF8/schema validation, exact float64 bits, consumption ownership, producer IPC gating, real helper routing/lane failure, stale full-world overwrite prevention, resurrection/retreat/fade-out/phase field fidelity against native Web capture. Headless tests do not prove original-game UI or real n2n/Steam latency.
- Not covered by this component: armor cells, weapon/system state, fighters, beams/mines, wreck/effect/audio events, targeting roster and deployment. Those still require full-world progress. Do not claim this alone fixes all latency or enable the experimental path by default.

## Phase 8 transport refinement
The browser still consumes complete standalone critical rows. SCL1 may use an exact XOR byte delta against the last admitted ordered helper frame (bounded one-base retention, shared maximum two variants per publication). This is not a delta against an old world snapshot; CRC and SCC1 validation reconstruct the exact complete component before browser receipt. Both layered and critical-combat opt-ins are required; neither is default.
