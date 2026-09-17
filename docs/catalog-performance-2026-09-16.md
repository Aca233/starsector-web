# Native catalog performance follow-up — 2026-09-16

## Changes

- Replace the monolithic native-catalog raw import with a compact list/reference index, plus seven content-hashed JSON category files. Only the category being inspected is fetched; its full records remain lossless.
- Keep names, search terms, duplicate/source ordering, support status inputs, cross-category references (including reverse links and slot labels), sprite references and all 736 description rows available in the index.
- Load the complete import report only when expanded. Preserve its initial issue counts without downloading the full report.
- Exclude unused configuration and precomputed-index sections from the browser payload; no generated source data or game assets were deleted.
- Reuse the runtime's existing refit-source JSON module rather than embedding and parsing another raw copy.
- Share in-flight category requests and successful data. Failed requests are not cached; the detail panel offers retry. Ignore old async completions after category/navigation changes.
- Support both ordinary and prefixed development URLs, and relative production deployment URLs. The Vite plugin rebuilds its projection after source-catalog changes.

## Measurements

Two isolated production builds were stored under artifacts/catalog-performance-before and artifacts/catalog-performance-after so unrelated builds in dist could not invalidate a live page's chunks. Measurements used headless Chromium at 1440 × 900, five fresh browser contexts per build in alternating order, on local Vite preview with no throttling.

Byte figures are **decoded response body sizes** (not gzip transfer sizes). Initial totals include scripts and catalog JSON, but exclude images/styles/fonts. Detail readiness is measured after the first complete detail heading appears, not the initial loading placeholder/FCP.

| Metric | Before | After |
| --- | ---: | ---: |
| NativeCatalog JS chunk (build output) | 12,529.11 kB | 948.10 kB |
| Initial route JS | 14,287,645 B | 2,706,641 B |
| Initial category JSON | 0 B (inside JS) | 877,484 B |
| Initial scripts + catalog data | 14,287,645 B | 3,584,125 B |
| Median first full detail readiness | 1,016.5 ms | 512.2 ms |

The catalog JS chunk decreased **92.4%**, while total initial scripts + JSON decreased **74.9%**. Local detail readiness improved about **49.6%**; this is a local browser measurement, not a production Core Web Vitals or gameplay FPS claim.

Readiness samples (ms):
- Before: 1023.7, 1017.7, 1016.5, 1015.7, 1011.6.
- After: 475.4, 519.4, 529.2, 512.2, 472.9.

Raw measurement output: artifacts/catalog-performance-after/measurements.json (ignored local artifact).

## Verification

No test suite or committed test files were recreated. Validation used ephemeral Node checks and isolated browser contexts.

- npm run build (including TypeScript): passed.
- npm run lint: passed without warnings.
- Projection parity: all **1,212 entries**, **862 outgoing-reference sources**, **751 incoming-reference targets**, and **720 description IDs** matched the original index, including reference order and sprite resolution. Support-status logic was retained; source/runtime inputs remain shared.
- Every raw row in all seven emitted category payloads and the complete report matched the original parsed source data.
- Production browser: initial screen text identical to baseline; first-page lists and complete first-record JSON matched for every category.
- Report contents, description search, relationship contents, cross-category navigation and return-history/search state matched baseline.
- A simulated HTTP 503 displayed a recoverable error; retry succeeded. Returning to the same category made no extra request. A delayed systems response did not replace the currently displayed variant detail.
- Catalog-to-refit navigation succeeded. Importing the full paragon_Elite variant displayed the existing adaptation confirmation and entered refit successfully.
- Both development and production previews loaded details under /nested/ without page errors.
- The homepage still avoids loading the catalog; its approximately 8.13 kB app entry and 229.69 kB vendor chunk are unchanged.

## Remaining opportunities

The eager catalog index is approximately 911 kB of JSON, including complete descriptions and cross-reference metadata; it could be split further if needed. The shared refit/game-content chunk remains approximately 1.34 MB. Vite still reports its normal large-chunk warning; the threshold was not raised to conceal it. This pass does not change combat rendering or simulation.
