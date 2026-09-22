# Single-call motion modifier reuse

Scope authorized: implement this one subagent proposal, validate, then stop. Main agent only; no new delegation.

Native source re-read: local Starsector 0.98a-RC8 starsector-core/data/shipsystems/scripts/ManeuveringJetsStats.java:12-24. OUT removes speed/max-turn bonuses but retains acceleration/deceleration/turn-acceleration; Web ManeuveringJets uses retainedEffectLevel. Preserve existing formulas/ordering, no change to AI/physics rate. No UI or native desktop interaction.

Proposal: one transient modifiers result within shipMotionStats, never held across calls/ticks. Start with explicitly native, owner-independent modifier definitions and unmodified reader/data surfaces. Custom accessors/prototypes, nonempty runtime effects, phase-specific path and unsupported definitions retain original path. No final speed, phase, hull/CR/engine state or PulseDrive WeakMap data is cached.

Before retaining: native evaluation count, OUT/disabled/PulseDrive same-tick changes/custom fallbacks, full-frame/RNG differential and whole-step timing.

## Result — rejected, original production sources restored

The proposed optimization was implemented and measured, but NOT retained. Only this block's changes in ShipSystem.ts and systems/ShipMotion.ts were restored from their exact pre-block copies. Earlier retained weapon-range/network optimizations were not reverted. No commit, push or release was performed.

- TypeScript build and scoped lint: passed on the candidate.
- Contract: 647 comparisons/checks passed; native root modifiers evaluations fell from 10 to 1 per qualified motion query.
- Whole simulation: 22 ships, 3/5 controlled seats, 600 steps each (240 warmup + 360 measured); all 1,200 full-frame byte snapshots and RNG states matched.
- 3 seats P50: 8.1757 → 9.7742 ms (+19.55%); P95: 11.6784 → 13.8410 ms.
- 5 seats P50: 8.6194 → 10.2617 ms (+19.05%); P95: 12.2766 → 13.6406 ms.
- The conservative call-local native/purity audit cost more than the repeated modifier calculations it removed in this scenario. Call-count reduction was not accepted as a performance gain.

Evidence: artifacts/motion-modifier-20260922/result.json contains measured results and SHA-256 hashes. *.rejected.txt preserves the measured implementation; *.control.txt is the exact restored implementation. Generated candidate/control bundles retain the tested graphs. The builder scripts target working-tree candidate sources; they must not be interpreted as reproducing the rejected candidate after rollback without restoring its recorded sources.

Limitations: this is a scoped Node full-step comparison, not proof about WAN RTT, actual room Hz, client Hz or rendering. Typecheck and simulation were initially launched concurrently, so absolute timing is not an isolated-machine benchmark. PulseDrive lifecycle comparisons passed; explicit real onAdvance same-tick coverage was not completed because the candidate was rejected. No cross-call cache is enabled.

Work stopped after rejecting and restoring this single proposal. No follow-on optimization or delegation.
