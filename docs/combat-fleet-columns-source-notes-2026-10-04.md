# Fleet numerical columns — implementation boundary

Original target0.98a-RC8. C:/starsector-core and C:/decompiled remain absent; native-source/real-game/UI equivalence pending. No UI or desktop operation. Preserve current Web behavior only.

Evidence -> expectation -> difference -> check: existing FleetTactics native producer first computes all readiness, then captures all unit fields and visibility, then NumericalFleetPlanner solves and returns FleetPlan for CombatEngine's original ordered AI/effect pipeline. Current solver accepts hydrated FleetUnit objects with per-unit Sets and creates numerical scratch every pass. Replace that entire fleet numerical input/solve domain with producer-owned Float64 columns, row handles and resident private scratch; maintain exact capture/read, contribution, claim, tie and floating-point sum order; materialize FleetAssignment only at the authority boundary. Complete270 heavy-scene raw/dual RNG/AI-defense/tracker witnesses, focused fleet existing comparisons, then exclusive complete-step ABBA.

Scope limit: these columns own ONE fleet planning input epoch and scratch, not ship physics/lifecycle/world authority. There is still numerical scalar publication from existing Ship writers, not an end-to-end SoA battle engine. This3ms-class domain alone cannot support the50% target. It is an actual executable ownership slice for later broader replacement, not a standalone DTO or a half-performance completion. No field qualifications are cached permanently; unknown existing producer reads remain live. No Worker, whole-world serialization, getter cache, frequency/dt/LOD/precision change.

This note precedes source changes. Failed/regressing code must be restored from this block's exact source-before only; no unrelated source reset.
