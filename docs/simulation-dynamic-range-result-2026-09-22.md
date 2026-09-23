# Dynamic range cache: retained

Main implemented WeaponRange.ts; subagent audited native dependencies read-only. Previous weapon projection remains enabled. No career, protocol, Hz, candidate or gameplay change. Source audit: simulation-dynamic-range-source-notes-2026-09-22.md.

## What changed

Previously any ECM multiplier, system range percentage or carrier range flat bypassed the entire range cache. Now only the static base-flat/percentage/multiplier/flat and threshold terms are cached for registry-owned immutable ship metadata with native hullmods. All three runtime inputs are evaluated before resolution on every call; the original floating-point order and final threshold calculation remain. Neutral-runtime final results retain their old fast cache. Mutable specs and custom mod hooks keep the full path. Cache weakly owns spec/weapon identities and checks every prior mutable weapon input, including in-place PD hints.

Read-only dependency audit confirmed old keys cover built-in range hooks, skills, S-mods. Ship class, skill configuration, S-mod list and slots are covered by immutable ShipSpec identity. Keep isPointDefense and rangefinderPD as separate keys; carrier S-mod flats remain runtimeFlat, not craft-static data.

## Verification

- Typecheck (tsc -b), scoped oxlint: passed.
- 30903 range/formula comparisons: ECM changes, system on/off percentages, unchanged-key carrier S-mod transitions, all mutable key fields, in-place PD hints, SO threshold ordering, skills/S-mod, nonfinite values, mutable loadouts; custom extension callback invoked on every call (8 calls across candidate/reference).
- Existing navigation scenario, 22 ships, 3 and 5 controlled seats. 240 warmup + 360 measured steps per case, alternating A/B order. Each of 2,400 total frames compared full snapshot bytes and RNG exactly.
- ECM cases use normal createDesign captain gunnery_implants=2 on AI Hammerheads, via createLanWorld loadouts and the original ElectronicWarfareSystem. No direct penalty injection. At final checkpoint the two scenarios contain respectively 21 and 22 ships with a positive native penalty.

|Scenario|Controlled seats|Full fixed-step P50 ms (old → new)|P95 ms (old → new)|
|---|---:|---:|---:|
|Neutral|3|7.8961 → 7.8362|11.5798 → 11.4969|
|Neutral|5|8.7894 → 8.7300|12.6558 → 12.4624|
|Native ECM|3|8.8590 → 8.4599|14.6810 → 13.1157|
|Native ECM|5|9.6415 → 9.3845|13.4731 → 13.0186|

Neutral scenarios approximately flat; real ECM scenarios show ~2.7–4.5% lower median complete-simulation cost with lower P95. This is not a microbenchmark speedup re-labelled as game speed. It still does NOT establish new actual room produced/apply Hz, browser FPS, RTT or WAN latency gains. No runtime/desktop/release build was launched for this block.

Evidence and source hashes: artifacts/dynamic-range-20260922/summary.json. Reproducible contracts: node scripts/check-weapon-range.mjs. Same-source paired simulation runners and preserved baseline are in that artifact directory.
