# AI plan/effect program: source notes — 2026-10-04

Original target 0.98a-RC8. C:/starsector-core and C:/decompiled still unavailable; original source/runtime/UI unverified. No UI/rule/cadence/dt/entity/timer change, desktop operation or release. Previous accepted optimizations retained; native fire-object migration was fully reverted after +192.23% regression.

Evidence -> expected -> current difference -> verification:
- CapitalShipAI.decide plans own AI/defense memory, then closes over scene/target/threat/profile and navigation results to run system/defense writes. CombatAIPhase plans ALL roots/modules before controls then ordered effects. Preserve every live callback, original closure-capture identity and phase boundary, including live vent reassessment AFTER system AI, selected manual module restoration, ownership/sequence checks and every RNG.
- Existing multicore Owner.plan runs legacy ai.update with speculative mutation and dependency replay; it cannot replace the native plan/controls/effects graph. Full fire DTO experiment establishes that per-step whole graph cloning/reification is not viable.
- Replace the private effect closure with an explicit authority-bound effect program and one executor shared by legacy update and staged commitEffects. This does not by itself create a transferable world or claim worker speedup. It is the necessary planning/authority write boundary for later resident pure planning; no new generic transfer permission is added.
- Zero-input stopped plans carry no effect program. Effects keep the original scene/target/profile/fleet-assignment references; custom callbacks and changes between controls/effects must observe the same live objects. Diagnostic fields currently read from controller at effect time continue to do so.

Validation once whole block implemented: app typecheck, changed-file lint, existing heavy270 strict raw/dual RNG/all AI/defense/tracker/per-mount RNG replay; focused legacy/staged/custom system/vent/stop/stale intent boundaries. Exclusive whole-step ABBA if retained. No claim of -50% until the complete same-scene step meets it.
