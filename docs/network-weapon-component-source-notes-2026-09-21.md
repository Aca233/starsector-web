# Weapon presentation component — source notes (2026-09-21)

Scope: transport/replica of existing stored weapon presentation state, not rule changes or a new HUD. Continues the optional LAN critical-combat path; no Steam capability is implied. No campaign changes. Native desktop UI verification remains pending permission; no visible window or injected input.

## Native evidence → expected behavior
- Local 0.98a API source tree: `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/WeaponAPI.java:158,165,169,173-174,187,198-200`: current angle, charge, ammo, remaining cooldown, firing and weapon damage/disable state are distinct weapon properties. Sending only ship position/HP cannot refresh these.
- `ShipSystemAPI.java:19,24,28,48-53,70-72`: system phase/effect/charges are separate; they are explicitly NOT covered by a weapon-only component.
- Web `Weapon.ts:271-320`: per-mount stored angle, cooldown, burst stage/timers, firing cycle, ammo/recharge, recoil/glow/barrel/spread, health/disable fields. Ordinary unlimited ammo is positive Infinity, which must be preserved exactly rather than causing whole-component fallback.
- `WebGLShipPass.ts:287-288,360-387`: recoil, aim and charge glow are read from the mount. Replica writes must not fire a shot or invoke weapon/system updates.
- `WeaponGroupConsole.tsx:35-36`: ammo summary depends on current per-mount ammo. Do not alter text, layout or rules.

## Current difference → intended fix → verification
- Weak-link whole worlds remain seconds old. Critical HP/flux can be fresh while turret aim, recoil, ammo and disable state stay stale.
- Add a bounded exact weapon section to the independently clocked critical component. Use slot AND spec identity, not array index. Reject corruption before application; never create entities/mounts or execute fire/repair toggles. Keep fixed-layout float64, -0, unlimited-ammo Infinity and sustained-beam stage Infinity. The initial positive-zero elision was rejected after compression measurement; no quantization is used.
- Keep a separate retained weapon clock: an HP-only fallback must not forget a newer weapon section; stale full restores must reapply that newer section, whereas same/newer full worlds win.
- Retain all current transport caps. Oversized/unrepresentable weapon rosters fall back to HP-only, not dropping the HP update. Initially separate build-time opt-in, never silently enable this incomplete architecture for production.
- Verify codec adversaries and ordered exact deltas; compare real native Web authority capture vs replica weapon fields across combat; check no RNG/event/weapon-array/health-side-effect mutation, no cross-spec writes, no stale overwrite, and bootstrap/sync teardown. Record actual payload sizes and 3–5-player replay impact, not just displayed Hz.

## Explicitly still outside this change
Armor grids, system lifecycle/custom visuals, engines, beams/mines, fighter state, roster/deployment, explosion/audio and complete-world safety still need their own treatment. Weapon state freshness is not guest render FPS or proof of original native UI equivalence. Do not claim this alone completes the latency objective.

Native capture exposed another legitimate nonfinite sentinel: `ShipWeaponControlSystem.ts:621-633 activateBeam()` sets sustained (non-burst) beam `firingStateTimer` to positive Infinity. The component must preserve this field too; rejecting it froze the entire weapon section as soon as a PD laser fired. Only ammo and firingStateTimer allow positive Infinity; all other fields remain bounded finite, NaN/negative Infinity rejected. The source implementation is not changed.

## Fixed layout and exact wire references (implementation update)
- The initial positive-zero elision was rejected: changing row offsets made ordered XOR deltas larger. WPC2 now keeps fixed float64 rows (including -0 and the two legal +Infinity sentinels). Compression handles zero runs; no quantization.
- SCL's temporal reference extrapolates selected finite numbers from two admitted components solely to form XOR compression bytes. The receiver must reconstruct the ORIGINAL bytes and validate CRC/schema before publishing; it never applies the reference to a world. This is not local gameplay prediction.
- Implemented lossless transport change: same-ship angle residuals are correlated. A bounded list of per-ship float64 median angle corrections can improve the temporal byte reference. Send those corrections with the residual, never as gameplay state; retain original authoritative tick/CRC and limits. The correction list is limited to 128 unique increasing ship indices. Any malformed/truncated list or failed CRC must leave the receiver's bases unchanged.
- Whole-world safety, HP fallback, consumption receipt ownership and the off-by-default weapon flag remain unchanged. Required verification: exact bytes with skips/rescope/CRC errors and infinity/-0, live native capture, Node-to-headless-Chromium, plus paired 3/4/5-player weak/healthy shared-uplink replay. Offline compression size alone does NOT prove latency or movement improvements.
