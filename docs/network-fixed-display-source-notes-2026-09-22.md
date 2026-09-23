# Fixed-layout ship display lane — first vertical slice

## Evidence before implementation
- Native 0.98a-RC8: inspected `../decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1185-1200` and `combat/systems/G.java:499-518`. Spatial simulation and shield-hit segmentation remain authority-owned; this work changes neither rules nor time steps.
- Native interactive UI remains unverified; do not operate the user's desktop. The existing audited `ShipRenderState` and `RenderShipProjection` contracts define this slice's display reads, including texture closure, shield segments, weapon ranges, phase/teleport poses and source-carrier links.
- Released LAN still restores general presentation graphs into Ship instances. Existing local render projection removes simulation fields but still encodes/decodes a general graph.

## Scope and gate
Build a bounded experimental ship + weapon display stream whose fixed numeric fields are read directly from a Float64 buffer. Reuse display-only query facades, never Ship/CombatEngine simulation prototypes. Stream definitions use explicit lifetimes and acknowledged delivery, with a cold/reset packet available; hot frames do not recreate a general ship graph. Unsupported custom query behavior must refuse the entire candidate, not silently mix authority/display objects.

This first slice is not yet the full LAN HUD/input/world migration. It cannot become the default based only on a codec microbenchmark. The overall target remains >=40% paired synchronization-pipeline CPU reduction, no wire-byte regression, correct simulation/display/reconnect, plus actual 3/5-client Web latency and long-task checks. Unpassed gates remain explicit; no cadence, visual-quality, precision or protection reductions.

## Validation
Use the existing native battle and render contracts, supplemented only with focused buffer/lifetime/malformed-packet cases. Compare the same render read set and same authority states, retain old baseline. Report partial-stage CPU figures separately from end-to-end networking/FPS. Do not publish or modify career work.

## LAN integration boundary (user approved 2026-09-22)
The user retained the measured partial benefit and approved integration; the old 40% target is not a discard gate. The complete renderer packet is NOT duplicated alongside the old whole-world snapshot. Instead its audited weapon/engine hot layouts and DisplayBufferRecord are reused inside existing captureAuthorityCombat / CombatSnapshot: those numeric fields disappear from recursive records and are transported once in a self-contained Float64 column. HUD, ship motion, firing/critical lanes, world effects, static local definitions and existing receipt/backpressure remain intact. Client-only numeric setters form a prediction overlay; rebinding a received frame clears it without writing the received buffer. Authority never gets accessors. New wire markers require protocol 28; decoding old complete snapshots remains supported. No gameplay/UI layout, frequency, precision or RNG changes. The full renderer-only ShipDisplayLane remains retained separately; it is not advertised as complete thin-client integration.

Validation: extend the existing 22-ship check with actual capture/binary codec/apply equality, skipped-frame/cold-join/JSON and encoding-tape paths, prediction writes and fresh-authority reset, malformed fixed records, and a short ABBA full snapshot CPU comparison. Native desktop/UI and real multi-machine latency remain unverified.

## Continuous implementation/planning round
Same native presentation-only boundary. Next receiver patch shares fixed-schema accessor functions instead of creating unique closures for every mount, and validates/binds whole homogeneous record groups while retaining target identity checks. This must preserve read-only default views, local prediction overlays, cold targets and malformed flag/range rejection. No snapshot content/cadence/rules are changed. The planning sidecar independently investigates eliminating authority residual traversal while this patch is implemented.
