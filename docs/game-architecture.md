# Game-level ownership and combat handoff

## Current scope

The application now owns a `GameSession`, which owns a retained `CombatSession`.
The existing combat simulation, renderer, input loop and Visual Lab remain in place.
This is a foundation for a larger game, **not** an implementation of the campaign,
economy, world map, refit screen, salvage, or original-game save compatibility.

```
React App / fleet-save panel
    GameSession (game flow, active encounter, durable-state ownership)
        GameState + pure beginCombat / settleCombat
        GameSaveStore (injected storage; browser localStorage at the app boundary)
        CombatHandoff (DTO <-> live battle adapter)
            CombatSession -> CombatEngine -> existing domain systems
```

`GameState` and its codec depend on neither browser APIs nor live combat objects.
The handoff is the only module translating live `Ship` objects into persistent
fleet records. The simulation never imports the game-state or storage modules.
React's existing result polling remains presentation-only; game settlement is
triggered once from the fixed-step boundary when the combat result is ready.

## Contracts

- Fleet records have stable member IDs separate from hull IDs and combat entity IDs.
- Records contain hull condition, CR, normalized armor cells, and slot/weapon/ammo
  loadouts. Unlimited ammunition is JSON `null`, never non-serializable Infinity.
- A combat request contains an encounter ID, mode, seed and copied enemy/player
  rosters. The first member on each side is the existing flagship; additional
  members use the existing reinforcement path. The panel currently deploys one
  owned ship at a time; this is not a fleet deployment or formation editor.
- A combat outcome returns those same identities with final condition/ammunition,
  victory and duration. It can settle only the currently pending encounter.
- The game checks roster identity and loadout consistency. Unknown, stale, or
  already-settled encounter IDs cannot apply another result. Game snapshots are
  deeply frozen; the adapter makes fresh live entities/copies for combat.
- Inventory has a versioned data shape for credits, supplies, fuel and cargo.
  No rewards, deployment charges, repairs, or recovery rules are invented here.

## Sandbox versus fleet sorties

Normal startup keeps the existing free-combat experience. Its switch/restart
commands create fresh **sandbox** combatants, record sandbox outcomes, and never
repair, replace, or damage the durable fleet. The HUD's **舰队 / 存档** panel provides
an explicit **舰队出击** route whose outcome actually updates owned ships.

An unfinished fleet sortie cannot be replaced with a sandbox battle or a second
sortie. Explicit restart reuses its original deployment snapshot and encounter ID,
not a repaired template. Once settled, restart cannot silently repair/revive it:
start another sortie from the saved condition, or return to sandbox. A destroyed
member cannot deploy. New game is an explicitly confirmed replacement, not a
repair mechanic. Fleet growth, recovery and resupply still need campaign rules.

Transient component malfunctions, fighter inventories, ship-system charges,
flux, cooling timers, positions, projectiles, AI and cosmetic state are not durable
fleet fields yet. This is intentionally not a complete simulation snapshot.

## Save boundary and failure behavior

Version 1 saves are namespaced by the deployed app base path. Writes happen on
deployment and settlement, not on every frame. JSON import/export is exposed in
the panel; import and new game require an explicit replacement confirmation.
Version dispatch lives in `GameStateCodec`; future versions are rejected until an
explicit migration is authored, not silently treated as v1.

Reloading an unfinished battle restarts its **pre-battle checkpoint**, including
seed, hull, CR, armor and ammunition. Completed battles are not re-applied. Latest
20 outcomes are retained; correctness does not rely on keeping all historical IDs.

Malformed/future saves and unavailable or incompatible active ship content disable
auto-save and preserve the original bytes. The current game can run in memory and
shows a warning. Blocked storage/quota failures are also visible. Observed changes
by another tab prevent that tab's next overwrite; this is not a transactional or
multi-tab co-op save service, and simultaneous cross-tab writes are not supported.

The Visual Lab uses an ephemeral owner and does not read or write gameplay saves.
Original-game resources remain read-only; no content importers were run for this
change and no project test files were restored.

## Checks performed

Checks are run in memory and in an isolated browser context, not saved as test
files. Covered structural validation, old/future/corrupt input rejection, readonly
snapshots, duplicate settlement, sandbox isolation, damaged-ship redeployment,
checkpoint reload, and storage errors/conflicts. These checks do not establish
original-game visual/behavioral parity.

## UI presentation boundary (2026-09-16)

Shared controls, notices, confirmation dialogs and modal input/focus management
live in `src/ui/core/UI.tsx`; theme rules live in `src/ui/core/theme.css`.
Fleet/save actions still go through `GameSession`. UI components must not repair
ships, settle a battle, or overwrite saves as a side effect of opening a panel.
Nested dialogs isolate background input, close only the top layer with Escape,
and restore focus/inert state when dismissed. Fleet results return to the fleet;
the sandbox restart shortcut is not offered as free fleet repair.

The initial card-heavy styling was rejected. Fleet and refit now use the original
refit layout: a left ship roster, a central ship/grid view, right-hand readouts,
and a small command footer. Reference: the actual image at
https://starsector.wiki.gg/wiki/File:FS_screenshot_refit.jpg and read-only native
`settings.json` / UI textures. Blue/cyan menu chrome and yellow numeric readouts
are distinct from the retained yellow-green tactical HUD. Segoe UI / Microsoft
YaHei typography is intentional; no bitmap-font restoration. This is a layout
reference implementation, not a pixel-perfect or complete native refit screen.

`ShipPreview` uses bundled hull sprites and real mount coordinates, preserving
aspect ratio at constrained viewport heights so markers do not drift. Mounts
select weapon details only: equipment replacement is not implemented. JSON
blueprint tooling remains on a separate tab. Results and help use compact shared
readouts instead of large statistic cards. Loading/context-loss/error states use
the same modal shell. Combat simulation and native game files are unchanged by
this UI pass.

Checks: TypeScript, lint and production build; isolated-browser modal nesting,
keyboard focus, save-import cancellation/success/failure preservation, refit
mount-to-weapon data, fleet-result return/disabled restart, and responsive panels
at 1440x900, 800x600 and 390x844. Result appearance used seeded statistics in an
isolated browser, not a claim of authentic battle balance. Lab initialization
also refreshes its timestamp after seeking so the UI shows the selected frame.
No test files, resource hashes, asset importers or user-save mutations were used.

## Content extension boundary (2026-09-16)

Content identity no longer selects ship-system behavior, beam/hit plugins, targeting
range modifiers, or ship/weapon presentation. See [content-extension-contract.md](content-extension-contract.md)
for the public composition API, immutable definitions, atomic pack installation,
revision-derived runtime manifest, asset dependencies and explicit unsupported
source capabilities. This supersedes earlier descriptions of the hardcoded content
selection path; it does not supersede the audit of missing native gameplay.
