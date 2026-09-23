# Phase 13 source audit: exact particle motion residuals (2026-09-21)

Scope: network representation only, not a new FX rule, visibility filter, physics prediction or precision projection. LAN and Steam share authority snapshot capture/restore. Campaign and UI are untouched. Native desktop verification is pending permission; no desktop operation is permitted.

Evidence checked before implementation:
- Local native 0.98a `../decompiled/fs.common_obf/com/fs/graphics/particle/BaseParticle.java:66-70`: lifetime, linear position and rotation advance.
- `SmoothParticle.java:24-50`: color/size and smooth-particle texture. This does not prove private rasterization equivalence.
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/EmitterFactory.java:263-276`: armor smooth particles, independent random angle/radius/component speeds and one-second lifetime. Cross-check current `ArmorImpactVisuals.ts:6-22`.
- Current `DynamicParticleRecipe.ts` / `ParticleRecipeKernel.ts`: the already validated cosmetic replay, unchanged source RNG, count, density, ordering, life/alpha/size/rotation. Phase 9 found Node/Chromium sin/cos last-bit differences and therefore transmitted four authoritative doubles.

Expected -> difference -> verification:
- Preserve all four authority motion doubles bit-for-bit. A new versioned fixed-arithmetic reference (only +,-,*,/, fixed constants and deterministic range comparisons) replaces implementation-dependent transcendental functions ONLY inside a private compression replay. Signed integer bit-pattern residuals correct the reference; unsupported/large residuals retain literal doubles. Never render or acknowledge the uncorrected reference.
- Actual source emitters, updates, RNG consumption, physics, collision, damage and saves are unchanged. Existing native recipe eligibility checks still require exact full-object equality. Keep old motion-row decoding and bounded recipe caches/cold work budgets. No network timeout/credit changes or default layered-channel enablement.
- Validate bit-exact correction including -0, extreme values, malformed/over-budget data; all four particle kinds and cold/rewound decoders; actual Node-generated full snapshots restored in headless Chromium; actual WebGL FX pixels and restoration timing; same-recording LAN/Steam roundtrips and paired network replay.

Diagnostic-only rejected experiments (not production): lowering byte-matcher minimum/index stride saved under 2% compressed bytes; naive XOR literal encoding increased traffic. Artifacts are under phase13. Whole-world 5-player staleness remains an unresolved acceptance criterion.

## Implemented wire contract and safety boundaries

- `$dynamicParticles: [2, recipes, rows]` is the new same-build capture envelope. Version 1 / four-value absolute motion still decodes. Version 2 additionally accepts five-value `[mask,x,y,vx,vy]` residual rows; the envelope version freezes reference arithmetic version 1. Unknown envelope versions and residuals disguised as v1 are rejected.
- A residual is a **signed difference of IEEE-754 bit patterns**, limited to +/-65535 and a high-word difference of at most one. Decoder does exact integer carry/borrow and checks finite/range validity. Larger differences are literal authority doubles. No tolerance is used in the restored motion.
- Literal-mask low bits select raw doubles. Upper bits retain literal negative zero in the primitive codec. Snapshot capture conservatively keeps a WHOLE birth group on the legacy four-scalar representation if its recipe or any generated motion contains -0. This preserves the existing distinction between direct in-memory snapshot -0 and JSON/MessagePack's normalized zero; it avoids changing unrelated snapshot numeric semantics.
- The real source generators and simulation still use their original math. Portable polynomials are private compression references ONLY. Alpha/life/size/rotation retain the existing frozen recipe arithmetic; correction applies to position/velocity before publishing decoded objects.
- The portable drag coefficient is cached per private birth group (<=128 coefficients), avoiding a polynomial evaluation per particle-step. Group cache remains <=128 / <=4096 members; cold work <=262144, steps <=256. Receiver touches cache entries in LRU order so a mode from a previous frame cannot evict a group already reused in the current cold-bounded frame. Partially updated groups still fall back to ordinary rows.
- Capture uses an additional private reference group; this is extra CPU/memory, not a free optimization. Browser restoration/capture timings and actual Worker throughput must be reported, separately from network-only replay.
- The existing same-build gate is enforced by LAN `server/lan-server.mjs` hello validation and Steam `server/steam/gateway.mjs` lobby/join checks. New captures are not claimed readable by an old pre-v2 game build. No transport capability/credit/ACK or timeout was weakened.
