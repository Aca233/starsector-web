# Motion display precision — source audit (2026-09-21)

Scope: optional layered guest DISPLAY kinematics, never host simulation, full CombatSnapshot, collision/damage, saved state or input ACK timing. No campaign edits or visible windows.

## Evidence → expected behavior
- Local 0.98a `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:5,8-13`: location/velocity use LWJGL Vector2f, facing/angular velocity are float. This proves exposed API precision, not the private integrator or pixel equivalence.
- `src/network/MotionReplica.ts:7-57`: independent motion writes only weakly-held presentation poses; capped display dead reckoning holds after 100ms and invalidates after 250ms. Its `motionAuthority` is a detached local input-replay view, not host authority.
- `src/engine/visual/ShipPresentation.ts`: WeakMap poses cannot enter full snapshots. `WebGLShipPass.ts:99-144,245-247` uses the display position/facing for hull and mount placement. A position error and a radius-scaled angle error bound screen-space geometry error.
- `src/engine/runtime/PlayerControls.ts:47-50`: supported combat zoom is 0.3–1.5. No camera/zoom behavior is changed. Original desktop visual verification is still pending user permission.
- Existing `ProjectileVisualColumns.mjs` already documents display-only bounded kinematic quantization; full authoritative state remains separate. The new motion projection must be equally explicit rather than claim losslessness.

## Current difference → proposed implementation
SWM1 captures six double-valued kinematic channels although they drive a presentation view. Five-person replay movement alone is ~3MB/20s before all control-envelope overhead. Preserve the SWM1 codec's exact contract, but add an explicit projection BEFORE encoding in `captureMotion`:
- position/velocity: choose Math.fround(value) only if absolute error <= 1/1024 world units (or units/second);
- facing/angular velocity: choose float32 only if absolute error <= 2^-22 radians (or radians/second);
- otherwise retain that original double exactly. Never clamp, wrap, omit a ship, or saturate. Invalid inputs remain rejected by SWM1.
- original -0, IDs/order, ACK values, authority tick/time, teleport sequence and death/retreat flags stay exact.
- Do not round host objects or full-world snapshots. Clock/CRC/receipt/byte caps and bootstrap/safety rules stay unchanged.

At 1.5 zoom, linear position error <= .001465 pixels per axis; velocity error adds <= .000147 pixels per axis during the existing .1s extrapolation cap. Angular edge displacement is bounded by radius*(2^-22 + .1*2^-22)*zoom. Large coordinates/angles which cannot meet the error budget fall back to double rather than silently losing precision. These are geometric bounds, not a claim of bit-identical rasterization or original native UI validation.

## Verification required
- Adversarial finite/invalid values, very large coordinates/angles, subnormal/-0, exact metadata, nonmutation, full-double fallback.
- Real Web authority: capture through firing/movement/deployment/destruction, no authority mutations, bounded pose error; compare raw vs projected through the SAME existing ordered wire codec.
- Real headless Chromium replica/interpolation tests at near/far zoom, teleport and stale-world restore; quantify screen-geometry error and verify untouched simulation fields. Do not treat byte equality or screenshots alone as gameplay equivalence.
- Paired 3/4/5-player weak/healthy loopback shared-uplink replays, weapons ON in BOTH sides, movement/bulk/visual/combat ages and CPU. Include continuous observed age rather than only successful-packet age when possible. No FPS/real Steam/n2n claim.

## Related transport experiment: shared combat/visual admission
The existing visual and combat components each allow 32KiB independently, while the adaptive whole-world scheduler reacts to critical-lane delay by shrinking only bulk. That can penalize the wrong producer. Test a shared 32KiB admission ceiling for combat+visual (motion and whole-world remain independently paced); reserve one existing maximum 16KiB combat envelope worth of credit against visual borrowing while combat is negotiated. Existing per-peer caps, canonical visual application credit, exact receipt ledgers, retired-scope debt and full-world safety remain intact. No credit may be returned by cancellation/timers. This is NOT the rejected Phase7 visual+bulk shared pool; bulk is not made to compete for this reservation. Production integration is conditional on paired replay evidence and retired-owner/sync/teardown tests.

Experiment outcome: shared combat/visual admission was REJECTED after the corrected five-player replay starved visual updates (3.88–5.65Hz, observed age up to ~1.84s). All production hooks/module were reverted; only rejected-* artifacts remain. The first prototype's missing final core-fallback admission check is explicitly marked invalid in its JSON. Bounded motion display projection is the retained change. See the Phase12 report for full paired matrix and remaining world-age failures.
