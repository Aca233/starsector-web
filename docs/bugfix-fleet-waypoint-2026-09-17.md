# Bug fix: carrier fleet-waypoint completion (2026-09-17)

## Scope

The user asked to finish the current bug and stop. This change fixes only fleet-waypoint completion; it does not continue AI, threading or performance work.

## Confirmed reproduction

Using the actual browser-loaded `CombatEngine`, issue a fleet waypoint at the flagship's current position while an Astral recalls its 23 wing craft. Advance 120 fixed simulation ticks (2 seconds).

Before the fix, the carrier remains exactly at the destination but `orders.has('fleet')` stays true. The completion predicate includes every friendly entity from `ships`; recalled craft remain outside the 90-unit arrival radius. Mora's initial nine craft reproduce the same membership problem. Non-carrier control hulls complete normally.

## Fix

`src/engine/simulation/CombatEngine.ts`, `updateOrderCompletion`: evaluate fleet arrival over deployed main ships (`capitalShips`), not the combined main-ship / fighter / bomber / system-drone roster. Retain the existing 90-unit arrival boundary, dead-ship exclusion and independent-order exclusion. Reserve and retreated main ships are already excluded by the live main-ship getter.

This does not change craft AI, weapon behavior, speed, collision avoidance, command-point costs or the arrival radius. It does not solve crowded multi-main-ship formation arrival; that broader navigation behavior was not changed or certified here.

## Verification

Ignored diagnostic artifacts: `artifacts/bugfix-fleet-waypoint-2026-09-17/`.

- `before.json`, `retreat-before.json`: pre-fix observations; the latter also contains an unrelated unshipped diagnostic. No retreat code was changed.
- `verification.json`: 21 assertions passed using actual engine modules in a browser.
- Astral, Mora and Onslaught: 120 fixed ticks each; waypoint clears on tick 1 after arrival, command points remain 4, carrier craft remain present (23 / 9).
- A carrier not yet at the destination retains the order.
- The existing 90 / 90.01 unit boundary is preserved.
- A distant active main ship still prevents completion. Dead, retreated, reserve and independently tasked ships do not block it; independent orders remain intact.
- A system-drone roster entry does not block main-ship arrival.
- DEFEND, ENGAGE and ASSAULT orders are not mistaken for waypoints.

These are targeted browser-engine diagnostics, not an end-to-end UI or LAN certification. No project test files or test runner were recreated. No asset hash/size audit or performance benchmark was performed.

TypeScript typecheck, lint and production build all passed serially on the current working tree. Build emitted the existing large-chunk warning only; logs are saved alongside the diagnostic results.
