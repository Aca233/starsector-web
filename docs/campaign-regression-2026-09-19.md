# Campaign regression — 2026-09-19

Independent regression audit in `C:\Program Files (x86)\Starsector\starsector-web`. No source edits, browser use, commits, pushes, or releases. Existing `src/studio/studio.css` change preserved byte-for-byte.

## Results

| Check | Tests | Passed | Skipped | Failed | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| All 21 `scripts/check-campaign-*.mjs` files | 329 | 326 | 3 | 0 | 0 |
| Optional native calendar probe only | 1 | 1 | 0 | 0 | 0 |
| Optional native faction-color probe only | 1 | 1 | 0 | 0 | 0 |
| Optional native orbit probe only | 1 | 1 | 0 | 0 | 0 |
| Strict `tsc -p tsconfig.campaign.json` | — | — | — | 0 diagnostics | 0 |
| Regular `tsc -b` | — | — | — | 0 diagnostics | 0 |

**Unique coverage: 329 passed, 0 failed, 0 unresolved skips.** The three default skips are precisely the separately executed native probes. No cancelled or TODO tests. Default suite already includes the market and market-economy Java oracles.

Runtime: Node v24.13.1; TypeScript 5.7.3; Java/Javac 21.0.8. First checks: 22:03:56–22:04:13 CST (UTC+08:00). Native probes: 22:08:26–22:08:32 CST.

Parent changed `BodyRenderer.ts`, `CampaignBodies.tsx`, and `CampaignHud.tsx` after the first checks. Re-ran the entire default suite and both typechecks at 22:14:00–22:14:29 CST: **same totals and clean typechecks**. All 119 sampled input hashes remained stable during this final recheck. Repeated tests are not double-counted above.

Native diagnostics: calendar verified 15 source hashes, 1,194 date vectors and 1,440 Java-float HUD positions; faction colors verified 65,557 exact RGBA vectors (21 factions plus 65,536 channel pairs); orbit oracle verified all three modes over fixed-tick sequences.

## Exact commands

Run from the workspace above; local TypeScript entrypoint avoids package downloads. The expanded file list covers every matching script present at both runs. Native test-name filters avoid rerunning unrelated tests.

```powershell
# campaign-suite
node --test --test-reporter=tap scripts/check-campaign-body-rendering.mjs scripts/check-campaign-body-visuals.mjs scripts/check-campaign-calendar-integration.mjs scripts/check-campaign-calendar.mjs scripts/check-campaign-corvus-world.mjs scripts/check-campaign-corvus.mjs scripts/check-campaign-encounters.mjs scripts/check-campaign-factions.mjs scripts/check-campaign-foundation.mjs scripts/check-campaign-gateway.mjs scripts/check-campaign-interaction.mjs scripts/check-campaign-launcher.mjs scripts/check-campaign-logistics.mjs scripts/check-campaign-market-economy.mjs scripts/check-campaign-market-gateway.mjs scripts/check-campaign-market.mjs scripts/check-campaign-orbits.mjs scripts/check-campaign-projection.mjs scripts/check-campaign-simulation.mjs scripts/check-campaign-transitions.mjs scripts/check-campaign-travel.mjs

# tsc-campaign-strict
node node_modules/typescript/bin/tsc -p tsconfig.campaign.json --pretty false

# tsc-build
node node_modules/typescript/bin/tsc -b --pretty false

# native-calendar
node --test-reporter=tap "--test-name-pattern=^native source hashes and installed Java CampaignClock/GregorianCalendar differential oracle$" scripts/check-campaign-calendar.mjs --native

# native-factions
node --test-reporter=tap "--test-name-pattern=^native O0OO initialization resolves the real bright-color field and FactionSpec calculation$" scripts/check-campaign-factions.mjs --native

# native-orbits
node --test-reporter=tap "--test-name-pattern=^Java source-arithmetic oracle agrees for all three orbit modes over fixed-tick sequences$" scripts/check-campaign-orbits.mjs --native
```

The final recheck repeated the first three commands unchanged.

## Logs

All audit artifacts: `C:\Program Files (x86)\Starsector\starsector-web\artifacts\campaign-regression-2026-09-19-2026-09-19T14-03-56-005Z`.

- `summary.log`: concise human-readable results and limitations.
- `commands.log`: every executed test/typecheck command, exit code and UTC timestamps, including reruns.
- `summary.json`: structured totals and input-change observations.
- `campaign-suite.log` / `campaign-suite-recheck.log`: complete TAP results.
- `native-calendar.log`, `native-factions.log`, `native-orbits.log`: isolated opt-in probe results.
- `tsc-*.log`: both initial and final compiler invocations, all clean.
- `baseline-sha256.json` / `recheck-baseline-sha256.json`: 119 input hashes, including the preserved studio stylesheet.

## Failures and concrete limitations

- **No test or compiler failures.** Only observed warning class: Node's experimental SQLite API warning; no other warning class in the default suite.
- Authored Corvus is intentionally a paused, unplayable fixture: nine unimplemented terrain requirements, unavailable jump topology, and no initialized market trade snapshots. Tests confirm atomic rejection of course/approach/jump/world advancement, `MARKET_UNAVAILABLE` for trading, tick/revision remaining zero, and CLI refusal of `--init-corvus --run` and subsequent `--run`. This is expected coverage, not a regression or a claim of playable Corvus.
- Browser/visual rendering appearance is outside this audit and remains parent-owned. Node geometry/projection tests and TypeScript passed; those do not establish browser rendering correctness.

Only this permitted new regression document was written under `docs`; progress and renderer documentation were left to the parent.
