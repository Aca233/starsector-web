# Web performance optimization — 2026-09-16

## Scope

Preserve existing rendering, simulation frequency, content availability and design persistence. Do not recreate the removed test suite. Existing unrelated working-tree changes were retained.

### Lightweight home entry

- Move NativeHome out of NativeRefit and lazily load StudioApp only on entry (click or R). Developer combat, visual-lab and catalog routes remain supported.
- Keep StudioApp mounted after the first entry so returning home does not discard the draft, undo state, filter or roster scroll state.
- Generate the homepage's two content counts in the Vite studio-content-summary plugin from the same bundled ship/weapon/refit data and exclusions as DesignModel. No hardcoded totals and no browser import of the content registries for the homepage. Current counts remain 175 hulls / 118 weapons.
- Defer editor-only CSS along with StudioApp; retain existing shared/home styling.

### Combat hot paths

- WeaponLoopAudio performs one weapon traversal and reuses two sets. It replaces allocating flatMap/map/filter arrays and rescanning the fleet for each unique loop key: O(weapons × loop keys) worst case becomes O(weapons + loop keys).
- Stop previously active loops when their last firing mount disappears, is disabled, dies, phases, vents, overloads, or presentation pauses/becomes unavailable. Continue retrying active loops so pending sample decoding and mute/unmute still work.
- SpriteBatcher uses the WebGL2 bufferSubData source-range overload; uploaded data, ordering and draw calls are unchanged, without allocating a Float32Array view on every flush.

## Measurements

Local production Vite preview, headless Chromium, 1440 × 900, five fresh browser contexts on each side. No artificial network/CPU throttling. JS figures are decoded response bytes for all initial .js requests, not on-wire gzip sizes and not asset-library sizes.

| Metric | Before | After |
| --- | ---: | ---: |
| Initial JS, including vendor | 1,733,708 B | 237,755 B |
| FCP samples | 160, 160, 152, 152, 152 ms | 264, 100, 88, 84, 88 ms |
| Median FCP | 152 ms | 88 ms |

Initial JS decreased **86.3%**. The measured application entry chunk was approximately 8.07 kB (8.13 kB in the final verification build after preserving the homepage title); the shared vendor chunk is approximately 229.69 kB. Loading the editor still fetches its required content. The local FCP sample is indicative only, includes an after-run outlier, and is not a production Core Web Vitals or FPS claim. Other work/builds were active in the shared checkout; timing is environment-sensitive.

An in-memory microbenchmark of the old/new weapon-loop scans used 100 ships × 20 idle weapons, 20 distinct loop keys, 200 warmup iterations, then seven samples of 1,000 frames. Median scan cost: **0.2811 ms → 0.00814 ms**. This is a synthetic scan benchmark, not a claim of equivalent whole-game speedup.

## Verification

- npm run build (including TypeScript project checks): passed.
- npm run lint: passed without warnings after removing the now-unused homepage weapon import.
- Production browser: homepage counts, entry click, search, returning home, R re-entry, retained search, trial launch, actual combat canvas rendering, pause menu and returning to refit checked.
- Direct ?view=catalog, ?view=combat and ?view=visual-lab routes checked without page errors on the current build.
- Development-mode homepage and virtual content summary checked.
- Ephemeral behavior checks (no committed test files): duplicate loop keys, charging, disabled mounts, dead/phased/venting/overloaded ships, removed ships, unavailable presentation and pending-sample retries passed.
- During verification, a separate build replaced dist chunks while an old page remained open. Reloading the page against the current build resolved the stale dynamic-import failure; do not mix chunks from different builds when deploying.

## Remaining work after the first pass

The on-demand full NativeCatalog chunk remains approximately 12.53 MB (2.04 MB gzip), and the shared refit/game-content chunk remains approximately 1.34 MB. These do not load on the homepage. Category-level catalog data loading is a separate follow-up; no warnings were hidden and no assets or gameplay features were removed to reduce these figures.

The catalog follow-up is now implemented and measured in [Native catalog performance](catalog-performance-2026-09-16.md).
