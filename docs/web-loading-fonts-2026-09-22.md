# Web font loading — 2026-09-22

Scope: delivery/encoding only, no career, gameplay, layout, glyph or image-quality changes. No release requested this turn.

Native evidence: local Starsector 0.98a-RC8 `../starsector-core/graphics/fonts/dyn_font/cache/s1.00-688f35f416ad1cd2/` matches the four Web menu PNG atlases byte-for-byte. Preserve dimensions, metrics, filtered scanlines and private fdEC metadata; replace IDAT compression only. No native desktop interaction performed.

Production home requests include 6.9MB button PNG, unnecessary 5.9MB caption PNG, 7.68MB decoded body TTF (~4.5MB transfer), 1.39MB decoded heading TTF (~0.82MB transfer). NativeBitmapText already loads mounted fonts; App preloads unused caption.

Change: remove redundant App preloading; lossless PNG deflate; home-only WOFF2 subsets from existing fonts with unchanged outlines/hinting/metrics and full original fonts as fallback. Verify scanlines and font data equality, same-view screenshots, requests and cold production builds on the same local throttled link. Keep all original UI and navigation. No runtime dependencies added.

## Retained results

- Removed unconditional App preload; NativeBitmapText still loads every mounted font and retains its existing DOM fallback. Caption is not downloaded on home anymore.
- Four PNG atlases: 27426593 → 9332887 bytes (about 66% smaller). Exact decompressed scanline bytes and all non-IDAT chunks verified unchanged, including hidden RGB.
- Home-only body/heading WOFF2: 14,056 / 9,804 bytes. Compiled using FontTools 4.63.0 and Brotli 1.2.0; every included glyph's outlines, advances, hinting bytecode and global vertical metrics compared to original TTF. Original full fonts stay in fallback chain; no runtime dependency added. Regenerate with scripts/optimize-web-fonts.py after menu label changes (unknown text still renders through original fallback).
- Clean production base: v0.2.10, static Pages configuration and /starsector-web/ subpath; no career code or new career fonts copied into the fixture. Typecheck, scoped lint, production build and paired headless browser scenario passed.
- Cold ABBA, two runs per arm, 1,048,576 bytes/s (~8 Mbps), 40ms latency, gzip text/TTF, fresh isolated profiles: home transfer 18431895 → 2742635 bytes; native-font-ready 18031.8 → 2947.2ms. Menu visibility 336.8 → 333.9ms is approximately unchanged; do not label font-ready time as first paint or input latency. WAN timing remains connection dependent.
- Fully loaded 1280×800 home screenshots are byte-identical; no console runtime/HTTP errors. Settings/graphics tab, Escape close and refit navigation passed; a character outside the subset still loads the full original font.
- Evidence: artifacts/web-loading-20260922/{fonts.json,browser-results.json,result.json,before.png,after.png}. Browser check: node scripts/check-web-loading-browser.mjs --before <baseline-dist> --after <candidate-dist>.
- Existing home-navigation check could not start without its optional Playwright resolution/server environment; the isolated production browser scenario above covers the changed path instead. No original desktop UI operation or combat/balance modification. No commit/push/release in this turn.
