# starsector-web

A self-contained React + TypeScript + Vite ship-design studio and combat sandbox inspired by Starsector. The browser runtime is independent from a Starsector installation: all runtime images, audio and packaged content are served from this repository.

Current fidelity and verification status: [Visual Fidelity Audit](docs/visual-fidelity-audit.md).
Historical M3/M4 completion records do not establish original-game visual parity.
Project test files and the test runner were removed at the user's request. Do not recreate them or perform manual asset hash/size audits unless explicitly requested.

AI/fire-control foundation and offline learning (experimental, learned policy disabled by default): [architecture, checks and training](docs/ai-learning-foundation-2026-09-18.md).

Rule-based AI improvements: [in-flight fire budget, positioning and verification](docs/ai-fire-budget-and-positioning-2026-09-18.md).

Residual learning on the existing rule AI: [fleet training, held-out evaluation and model status](docs/ai-residual-fleet-learning-2026-09-18.md).

Fixed-mode diagnostics: [paired ablation against the original AI](docs/ai-fixed-mode-ablation-2026-09-18.md).

Component diagnostics: [isolate engagement distance, target utility and observation context](docs/ai-component-ablation-2026-09-18.md).

Distance-only learning: [matched range-feature control, multi-seed training and new holdout](docs/ai-distance-learning-2026-09-18.md).

Fleet target-commitment experiment (rejected; not deployed): [development evidence, counterexamples and frozen validation](docs/ai-fleet-focus-2026-09-18.md).

Shield-budget experiment (rejected; not deployed): [mechanism, counterexamples and frozen evaluation](docs/ai-shield-budget-certainty-2026-09-18.md).

Combined focus/shield experiment (rejected, not deployed): [current-engine factorial controls and independent gates](docs/ai-focus-shield-coordination-2026-09-18.md).
Multiship recovery diagnosis: [observed failures, rejected explanations](docs/ai-recovery-diagnosis-2026-09-18.md).
Regroup/recovery priority experiment (rejected, not deployed): [one-expression candidate and causal branch](docs/ai-regroup-recovery-priority-2026-09-18.md).
Predictive projectile evasion experiment (not deployed): [native motion rollout and real-hit diagnosis](docs/ai-predictive-evasion-2026-09-18.md). Core validation and replay audit pass (576 matches, 65.89% score including timeout half-points). The separate 128-match broad holdout and audit also pass (55.47% score). Current-source replay audit passes, but deployment is withheld: on the updated engine mean frame CPU cost is 3.01x baseline, above the sealed 2.5x limit. Evasion remains disabled pending behavior-preserving optimization.

Navigation/system ownership [contract repair](docs/ai-decision-contracts-2026-09-18.md) is independently integrated: prevent attack drives overriding withdrawal/AVOID/ESCORT/waypoint intent while preserving manual activation and retreat-assisting jets. All 84 AI checks (including 12 permanent regressions), lint/build, exact current-source overlay parity and two neutral full replays pass. This is a command-correctness repair, not a measured win-rate gain, and is not mixed into the evasion results.

## 在线试玩 / GitHub Pages

[打开浏览器版](https://aca233.github.io/starsector-web/) · [下载桌面版 / 联机版](https://github.com/Aca233/starsector-web/releases/latest)

GitHub Pages 提供舰船设计、角色技能与本地模拟，不托管 LAN 服务，也不能调用本机 Steam。静态构建会将联机入口替换为桌面版下载提示。Pages 不提供本项目的 COOP/COEP 响应头；共享内存 AI 路径不可用时沿用现有串行回退，不关闭浏览器安全机制。

推送到 `master` 后，`.github/workflows/github-pages.yml` 自动构建并部署 `dist`。子目录基路径由 GitHub Pages 配置提供；不上传源码、桌面后台、开发资料或存档。桌面版与浏览器便携包的发布流程保持独立。

## Requirements

- Node.js 22.12+ (validated on Node 24; Electron tooling requires 22.12+)
- npm
- A modern browser with WebGL2 for combat rendering. Canvas2D remains in use for HUD/offscreen texture work, but it is not a combat fallback.

A Starsector installation is **not** required to build, preview, or play the packaged project. It is only needed if a developer intentionally regenerates the native content and asset bundle with the offline import scripts.

## Install, build and run

```powershell
npm ci
npm run typecheck
npm run lint
npm run build
npm run preview
```

Development mode:

```powershell
npm run dev
```

The production build is written to `dist/`. There is no `/api/asset` endpoint and Vite is not allowed to read the parent directory.

## Electron desktop application

Run `npm run desktop` to open the game in Electron. `npm run package:electron` creates a Windows x64 NSIS installer and standalone ZIP, with isolated LAN/Steam backend processes and installer-specific updates. Browser launchers remain supported. See [desktop usage, packaging and data migration](docs/electron-desktop.md).

## Windows multiplayer portable package

Run `npm run package:windows` on Windows x64 with Node 22+ to build a shareable ZIP in `artifacts/releases/`. The package includes the game, portable Node and runtime dependencies. Its default launcher opens multiplayer; friends join the host URL and room code over the same LAN or a separately configured virtual LAN. It does not install VPN software, change firewall rules, or provide a public relay. See [packaging and connection instructions](docs/windows-portable.md).

## Automatic Windows updates

New portable packages check GitHub Releases before launch, verify the matching ZIP with SHA-256, and install updates side by side. Offline startup and rollback scripts are included; browser storage is not modified. Old packages need one manual upgrade. See [automatic updates and release publishing](docs/automatic-updates.md).

## Page navigation

The main menu, ship designer (`?view=design`), character skills (`?view=skills`), and catalog (`?view=catalog`) use URL-backed navigation. Refresh reopens the current screen, and browser Back/Forward restores studio screens without discarding the in-memory design draft. Skills opened from the designer retain their return destination across refresh. Existing draft autosave and cross-tab conflict protection still apply; transient dialogs, filters, and undo history are not restored by the URL.

A simulation launched inside the studio keeps its launching screen URL. Refresh returns to that screen instead of starting a fresh battle; live combat progress is not restored. Browser navigation out of a running simulation asks for confirmation. Explicit developer combat URLs and LAN connection/recovery behavior are unchanged.

## Modular ships and stations

Native modular assemblies are now deployable: the ancient Onslaught, the three station technology lines (tiers 1–3), the Remnant station (standard/damaged fits), the derelict survey mothership and the module test hull. The 13 parent hulls expose 15 source assemblies in the refit/simulation catalog. Module hulls are not separate fleet choices.

Each attachment retains its native anchor, facing and loadout, with independent weapons, armor, hull, shields, flux and fighter decks. Stations remain stationary, rotate axially, and lose their core when their active combat modules are destroyed. Shared Flux Sink redistributes lost combat-module dissipation. Deployment points and fleet losses count the parent once; reserve deployment and LAN presentation snapshots include the complete assembly.

The refit stage displays the complete structure. Click a module hull (polygon hit area) or choose its attachment slot from the module list to edit its weapons, groups, flux, hullmods and fighter decks with a separate OP budget **in place on the complete assembly**. Selection highlights the attachment and reveals its correctly rotated mounts without moving, rotating, resizing or replacing the parent view. Click another module or the parent to change editing context; wheel zoom and Shift-drag pan stay unchanged when switching modules. Clear/restore only the selected module, or undo normally. Edited module overrides are saved with the parent and retained by simulation, LAN and AI loadout identity; module hull replacement/free assembly is not exposed. Remaining native scripted/detachment behavior is still approximate. See [implementation and verification notes](docs/modular-ships-and-stations.md).

To regenerate only this content without refreshing unrelated historical imports:

```powershell
npm run import:content -- --modules-only
```

## Character skills

The main menu and refit header have a **角色技能 / C** entry, also reachable with the ?view=skills URL query. The full-screen page follows the native character layout: portrait and counters on the upper left, skill quotes/effects on the upper right, and combat/leadership/technology/industry icon rows below. All 40 current player skills use native ordering and artwork; only the 14 registered combat skills can be configured. Unsupported skills are darkened, explicitly marked as metadata-only, and cannot write a skill level. Source quotes, tiers, prerequisites and scopes can be regenerated with scripts/import-character-skills.ps1; the browser never reads the original installation.

Hover to preview. Left-click a skill once for normal and again for elite; further left-clicks keep elite. Right-click cancels the skill without opening the browser menu. Enter/Space follows left-click behavior; Delete/Backspace cancels the focused skill, and arrow keys navigate without changing its level. Web tools include skill search, all/supported/configured filters, **F2** skill encyclopedia, a cosmetic name/portrait editor, undo, confirmed reset (**T**), complete-design JSON import/export, and **开始模拟 / G**. Elite includes normal effects. This remains free configuration: the point counter is unlimited, story points and campaign levels are not simulated, and native prerequisite data is informational only.

Changes use the current design draft and its autosave/undo/export path. **保存方案 / Ctrl+S** saves the complete design; **Esc** returns without discarding the draft. Both skills and the optional captain profile survive save/import/reload, with validation for allowed portraits and names. Cross-tab conflicts protect existing storage and provide an export-backup action. Skills still belong to the current ship design, not a separate player profile that follows ship changes. Narrow layouts scroll each aptitude row independently; clicking does not move the page, so repeated clicks can upgrade the same icon in place.

## Battle size

**游戏设置 → 战斗规模** saves a whole-battle deployment-point (DP) budget for new simulations, fleet sorties and hosted LAN rooms. The default is 400 DP; 200–400 matches the native configuration range, while values up to 3200 are an explicitly labeled Web extension. This implementation splits DP evenly among occupied teams (not the native campaign's asymmetric allocation). Reserve AI do not count as active DP and are not removed from the roster. LAN guests use the host's frozen room rule; only the host can edit it before the next match, clearing everyone's ready state. The room sidebar shows both total and per-team DP. See [LAN rules](docs/lan-multiplayer.md) for launch validation and reserve behavior.

## AI loadout groups

LAN AI now supports full custom loadouts. Clicking a hull still adds its suggested fit immediately; **添加当前设计**, saved designs / JSON import, and **新建 AI 配装** are optional alternatives. Identical hulls are folded together with a separate quantity row per actual configuration. **整组改装** changes only that team's selected fit group; **拆出一艘改装** changes one ship. Identical configurations merge regardless of name, while solo opponents remain separate combat teams. Editing AI keeps the player's own draft intact; changes require a server receipt and clear readiness. Full designs are deduplicated in the room, frozen at match start and used by both combat worlds. Use the current protocol-v16 backend and refresh older pages.

## LAN multiplayer preview

The main menu now includes **局域网联机**. From this project’s local dev/preview service, choose **创建房间** to start the LAN backend invisibly and create the room automatically; merely entering LAN mode does not start it. Guests use **连接房主** or the host’s shared URL and do not start a server. Existing compatible backends are reused. Only a same-origin loopback request may launch a backend; arbitrary static hosting cannot launch local processes. n2n/Radmin-style virtual LANs can work when the host’s virtual IP and TCP port 3001 are reachable (not physically tested here).

For manual/dedicated hosting, run `npm run lan` (Node.js 22+) to build and start the LAN server on port 3001, or `npm run lan:serve` after building. Other players open the LAN address printed by the server, connect, and join a six-character room code. Only the room creator runs the combat simulation in a browser Worker; the Node server relays messages.

The protocol-v16 preview uses one room with dynamic teams, not separate duel/co-op lobbies. Open **编队规则** to add C and further teams (at least two slots, without a fixed team quota), or choose **每人独立一队** for free-for-all. Solo assignment keeps every human and every manually added AI in a separate team, including subsequent lobby joins; switching back to free teams permits regrouping. Empty teams do not participate. Rooms default to four player slots; the host can set capacity from 2–10. The room-member list contains only humans; AI ships are managed separately and default to empty. Guests must be connected and ready, while the host confirms their loadout by clicking Start directly. A lone host can start against AI without a second human. Each player can choose a team; the host can assign any player and batch-add AI ships without a fixed gameplay count cap across the active teams, choosing from 171 supported hulls with suggested fits (up to ten humans, AI do not consume human slots). At least two opposing teams must contain ships; capacity/team/AI changes clear readiness. Stable controller seats are independent of teams, and results name the winning team (or winning player in solo arrangement). Ship AI, projectiles, missiles, fighters, drones, shared vision and radar use stable numeric allegiance; losing the host flagship does not finish an otherwise ongoing match. The host must still keep the browser connected. It includes room passwords, invite links, chat, host kick, synchronized weapon-group controls, shared results/rematches, and a 30-second reconnect window with guest AI takeover. During an ongoing battle, a guest leaving, failing, or exhausting the reconnect window does not end everyone else's battle: their ship remains under AI control. Loading failures still cancel the start; there is no late joining. Guest page reloads within the window can resume; host reloads end the battle because the simulation Worker is lost. Full snapshots now adapt between 2/5/10/20Hz using deployed ships/craft, snapshot capture cost and observed uplink congestion; reserves no longer directly reduce the rate. The relay serializes each broadcast once and independently paces slow receivers. Validation used four full rendering clients plus six thin protocol clients and a real fourteen-ship host simulation on one computer, not ten physical devices or a sustained performance certification. It preserves single-player saves. Custom saved designs are now selectable/importable: weapons, hullmods/S-mods, flux upgrades, groups, supported combat skills and fighter wings are compiled from the same local design rules on every peer and frozen at launch. Runtime fighter/drone snapshots include creation/removal and locally validated shared craft specifications. The relay checks a bounded declarative design envelope and ownership; clients perform equipment/OP/content validation before readiness and loading. AI and dynamic craft no longer have the old 4/512 count ceilings; team names/vision remain independent beyond 32 teams. AI cards show native hull thumbnails and group identical hulls within each team; solo groups are display-only and preserve independent enemies. The single-window catalogue adds ships on click; inline quantity editing and secondary whole-group replacement/removal do not omit ships from battle. Communication safety budgets remain: 1 MiB room options (including reserved solo row overhead), 16 MiB full snapshot. Large fleets depend on CPU/GPU, memory and bandwidth; this is not a sustained hundred-ship performance certification. Protocol v16 adds bounded, render-only own-ship motion prediction, separate relay RTT / input-confirmation / simulation diagnostics, and a fresh-snapshot control barrier after reconnect. It does **not** provide rollback hit prediction, delta snapshots, or host migration. See [LAN setup, limits and verification](docs/lan-multiplayer.md) and [implementation plan](docs/multiplayer-plan.md).

The LAN room now embeds the native refit workbench: human members and their committed ship thumbnails stay on the left, while you edit your own ship in the center. **更换舰船** opens the existing hull catalogue (175 visible / 171 selectable; four unsupported core systems are disabled). Other members’ loadouts are read-only; AI remain separate, manually added ships with suggested fits. Edits stay local until **应用修改**. A correlated server receipt and design revision, not merely a room broadcast, move the status from 未应用 / 正在同步 to 已同步 and enable Ready/Start. Initial suggested fits without a committed design also require Apply. Editing cancels your readiness; applying clears all readiness. Failure or a 10-second timeout retains the draft and requires retry. Disconnect/room closure keeps the editor available for explicit Save/Export instead of losing the draft. Save appends a copy without replacing standalone designs, draft or baseline; import does not write the library. Only the selected design crosses origins in a browser fragment. The entrance now contains one player-name field and Create/Join forms only: no ship preview, statistics, or pre-room loadout editor. Creating/joining on a LAN server performs the connection handshake automatically. Local preview creation still launches the backend only on explicit Create; remote joins never launch it. Invite codes and fragment-carried designs are preserved; all ship selection/import/refit happens inside the room. Room exit requires confirmation, and normal match end returns to the integrated room.

## Tactical chart

### In-combat simulation deployment

The refit **模拟战斗 / N** action now enters the live combat scene directly, initially paused with the tactical map and native-style deployment window open. There is no outside-the-battle enemy dropdown. Q/W switch allied/enemy rosters; select silhouettes, then 部署 adds actual fitted ships and carrier wings to this same encounter. G reopens the window from the chart and pauses the encounter. Closing/deploying preserves that pause; Space resumes and Tab returns to piloting. Restarting a design trial returns to this empty deployment phase without changing its prototype or saved design. Use Esc → 重新模拟 → confirm; bare R no longer restarts piloting, while R in an enemy map context still sets the target.

The 30 stock choices come from native `data/campaign/sim_opponents.csv`, costs from `ship_data.csv` supplies/rec, and fitted loadouts from imported native variants. Rebuild this snapshot with `pwsh -File scripts/import-simulation-roster.ps1`. Native ordering is civilian-last, hull size, deployment cost, then hull name. The validated refit adapter still reports incomplete effect support; loadout import does not mean native AI/effect parity. Simulation specs use separate IDs and never overwrite the user's prototype.

Each side starts with a 240-point live-deployment budget (the flagship occupies its native cost). Selecting all may exceed it; deployment is then blocked until selection or budget is adjusted. Advanced controls provide real search, hull-size filters and 120/240/400 budgets, not the original campaign officer/unlock options. A wave is validated and constructed before entering the world, spends no command points, and refreshes combat presentation assets. Empty initialization excludes the legacy enemy placeholder and its wings from the battlefield; no phantom destruction or victory is generated.

Combat starts with allies below enemies, bows facing each other. Simulation reinforcements retain this top/bottom formation with horizontal rows and collision-safe depth spacing. Piloting, radar and tactical chart all use +X right / +Y down, including map picking, panning, heading and the camera footprint; the chart no longer rotates a sideways battle by 90 degrees.

Tab opens the full-height tactical chart. Native warroom icons and fonts form separate friendly/enemy context docks at bottom right; the flagship's fixed bow-up holographic armor silhouette and live flux/hull/CR meters stay at bottom left. Hover or keyboard-focus an icon for its action and any unavailable reason. No right-side text roster is used.

- Left-click a contact to inspect it. Selecting an enemy retains the friendly command recipient. Right-click an enemy to engage, or empty space to move. A selects the fleet; Delete cancels its assignment. Orders involving the flagship enable autopilot, including after closing the chart; U returns it to manual. One command point is spent per assignment (including an escort group); points regenerate every 120 seconds of simulation time. Fleet assignments supersede individual friendly orders.
- Friendly context: D holds that ship's current position and engages; L/M/H dispatch available nearby escorts (one frigate, one frigate/destroyer, or up to two main ships); S resumes autonomous attack; F centers the map; Delete cancels. Enemy context: R sets the flagship's target without spending CP; V sends recipient main ships away from the enemy; E issues focused engagement; the cross closes the context. F2 shows ship information and chart controls. These are Web AI policies, not a port of the native task planner. Escort follows a collision-safe station behind its moving target; defend persists until cancelled. Carrier wings retain their own behavior for the new main-ship orders.
- Drag/arrow keys pan; wheel or +/- zoom; Home fits visible contacts; C centers the flagship only outside enemy context. The rectangular chart projection, picking, camera footprint and zoom anchor share the same coordinates and never change combat-camera zoom. Space and the left play/pause controls use the existing pause owner; Esc opens the game menu with dialog input priority. Keyboard routing checks the live chart flag even between HUD renders, so rapid Tab/H/M transitions cannot open piloting panels behind the map, and rapid Tab/Tab remains reversible. Browser Ctrl/Alt/Meta chords and modified wheel events do not issue flight actions; only Ctrl+1–7 is reserved for weapon-group autofire. Shift steering is unchanged.
- Chart visibility follows combat/new/T.java's native base sight radius of 3000, live friendly main ships and one living leader per wing, the original fog_circle2 texture, feather margin and fog color. The same visibility predicate gates enemy sprites, picking, information and new chart orders. This uses continuous circles rather than the native 500-unit visibility cells, has no sight-radius modifiers, and does not change combat AI sensors, weapon targeting or the underlying combat renderer. It is chart visibility, not full combat fog-of-war parity.
- In design simulations the deployed counter reports live allied deployment points, and G opens the real simulator deployment window. Other battle modes retain the live main-ship count. Retreat settlement, flagship transfer, harassment AI and independent wing-strike tasks remain unavailable with explicit reasons.

## Ship design entry

The default page opens the native-style homepage with a single **舰船设计** entry. The full source catalog remains available through the developer URL `?view=catalog`, not a separate homepage button.

The refit roster supports ship-name/source-ID search, one-click hull-class filters, an original-faction selector, clearing/resetting, and locating the current hull. Search and scroll position survive hull changes. Weapon selection searches compatible weapons, prioritizes affordable choices, and offers faction and optional OP-budget filters. Faction membership follows native known equipment pools and explicit faction variants; shared equipment can appear under multiple factions. Unassigned equipment remains accessible under All / Unassigned.

The refit screen explicitly identifies unavailable active systems and unimplemented native built-in mods; catalog presence is not proof of gameplay support. The hullmod list searches implemented effect descriptions as well as names/IDs.
The refit shell fills the browser workspace again (no 1020 × 746 centered window cap). Carriers show a vertical flight-deck strip inside the left edge of the grid: actual fighter sprites, per-wing OP, empty slots, and click-to-replace / right-click-to-remove. Empty deck positions persist in designs, built-in wings are locked, and the evaluated loadout drives the actual trial flight decks. Phase Field is explicitly campaign-only (no campaign sensor simulation); Delicate Machinery now increases post-peak CR loss by 50%.
Equipment descriptions are hover/focus cards rather than persistent sidebars. Fitted hullmods and the install table share a black/cyan card with highlighted values and a working F2 data view. Weapon selection keeps native/effective stats and Ctrl comparison in its hover card. Fighter selection uses the compact deck-anchored original-style list (interceptor/fighter/bomber tabs, actual formations, current-wing removal and OP); its card appears only over a row. S-mod reference text is explicitly not an implemented solidification bonus, and campaign purchases remain disabled.
The workbench lets you choose a supported hull, fit weapons to its original mounts,
allocate OP/flux, set seven weapon groups, save designs, and trial the actual configuration.
This is a refit workflow, not freeform hull construction. The UI now follows the user-provided original-game refit screenshot: native fonts and border/title/icon assets, a black roster, cyan grid, central hull, right-side statistics and bottom action rows. Fresh libraries start with Paragon.

- Native hulls, skins and weapons are discovered from the local core installation rather than a five-hull allowlist. Search/filter the refit roster and weapon picker; the original Onslaught, Paragon and Doom curated fits remain available.
- The full-content browser includes ships, weapons, fighter wings, hullmods, systems, variants and projectiles, with source data, links and explicit runtime support status. Open it directly with `?view=catalog`.
- **Imported data is not a claim of original-engine parity.** Basic approximations and missing Java-driven mechanics are listed on the affected ship/weapon and before simulation. Unsupported objects remain inspectable rather than silently disappearing. Hullmods are installable only when their effects are actually implemented.
- Refit follows the native screenshot and local source UI: ship-only roster, mount-anchored weapon list with a left-side native-data tooltip, seven-group assignment table with Q/W/T confirm/cancel, left-expanded hullmod filtering/sorting while right-side stats stay live, and variant saving through 装配方案. Clear the fit to start from an empty hull. No custom sidebar tools or suggested-fit buttons. The simulation action directly opens in-combat deployment using the original 30-entry simulator roster.
- Design library, draft and its edit baseline use base-path-scoped browser storage. Untouched ships switch without confirmation; genuine edits remain protected, including after refresh. Import/export uses .design.json files.
- Design trials are ephemeral: no fleet-save reads/writes, settlement, or damage written back to the design.
- Combat has no top-right toolbar. **Esc** opens the screenshot-matched pause menu: current ship, **游戏设置**, **结束模拟**, **返回游戏**. Settings expose working mouse steering/audio controls and help. Closing preserves the pre-menu pause state; ending a trial returns to refit with the design intact.
- Explicit developer routes remain: ?view=combat for the previous sandbox and ?view=visual-lab for the Visual Lab.
- Keyboard/mouse and WebGL2 are required for combat. The original desktop layout uses scrolling on very narrow screens; there are no new touch combat controls.

See [Ship design studio](docs/ship-design-studio.md) for behavior, limitations and verification.

## Runtime architecture

For combat (including the explicit legacy route), the application-level owner is `GameSession`: it retains the combat session,
versioned persistent fleet/inventory data, and explicit combat request/outcome
boundaries. On the legacy combat route, **Esc → 游戏设置 → 舰队 / 存档** separates free sandbox battles from fleet
sorties that carry damage, CR and ammunition into the next battle. Saves restore
pre-battle checkpoints, **not** mid-combat simulation snapshots; the Visual Lab
never reads or writes them. See [Game architecture](docs/game-architecture.md) for
ownership, save failure behavior, and the intentionally unimplemented campaign layers.

The main lifecycle is owned by `CombatSession` rather than React renders. A session owns the `CombatEngine`, `FixedTimestepScheduler`, renderer, player AI, `VisualClock`, deterministic `VisualRandom`, performance counters and disposable GPU resources.

The timing boundary is deliberate:

- `requestAnimationFrame`: accumulator input, interpolation, camera presentation and drawing only.
- fixed 60 Hz simulation ticks: AI, manual steering/throttle/strafe, movement, weapons, collision and damage.
- camera presentation uses an exponential time-based follow controller, so 30/60/144 Hz render rates converge to the same camera response.
- scheduler overload preserves a bounded backlog and reports any simulation time discarded by its safety cap.
- `VisualClock`: visual animation time.
- `VisualRandom`: seed/channel/time-derived visual noise so the same scene, seed and timestamp can be reproduced.

Restart and ship changes clear battle time, settlement, statistics, projectiles/effects/contrails, tactical command state and countermeasure cooldowns before rebuilding combatants.

## Assets and content

Runtime assets live in:

- `public/game-assets/`
- `public/game-assets/asset-manifest.json`
- `public/content/manifest.json`

`AssetResolver` is the runtime URL policy and rejects bundle-root traversal. `TextureCache`, HUD image loading and `SoundManager` resolve resources through it. The WebGL texture manager separately tracks CPU image state and GPU pending/uploaded/invalidated state, keys resources by sampler configuration, prevents duplicate pending uploads and recreates resources after WebGL context restoration.

`ContentRegistry` is the authoritative ship/weapon registry. Built-in and imported weapons use the same lookup path, so a dynamically registered weapon can be equipped by a ship slot.

Original `.ship`, `.wpn`, `.proj` and CSV parsing is import tooling, not a runtime filesystem dependency. The parser preserves JSON primitives and quoted `//` text, accepts bare enum values in arrays, and supports quoted CSV fields.

Built-in hull/weapon data comes from `src/engine/data/generated/ships.json` and
`weapons.json`. The complete, lossless native catalog is in `native-catalog.json`;
`refit-source.json` and `runtime-import-report.json` describe runtime availability
and per-item limitations. Existing curated loadouts remain separate from source
hull specifications. Imported native variants are identified by provenance.

Regenerate the full local bundle (defaults to the sibling `starsector-core`):

```powershell
npm run import:all
# Or use an explicit installation:
npm run import:content -- 'C:\path\to\starsector-core'
npm run import:catalog -- 'C:\path\to\starsector-core'
npm run build
```

The native-catalog importer discovers recursive definitions and skin inheritance,
retains original source fields, and copies related graphics/audio into the local
bundle. It never runs original Java code, exposes the parent directory, or reads
saved games. See [Full content port](docs/full-content-web-port.md) and the
machine-readable import reports for coverage and unresolved dependencies.

`ModManager` validates and registers runtime content; it does not define the
built-in data. `CombatSession.addShip()` includes new ships and configured flight
decks in presentation preparation. Direct engine changes outside the session
must be followed by `refreshPresentationAssets()`.

Combat entity iteration covers registered main ships, fighters and bombers.
Ships without flight bays do not receive automatic wings. VIS-11/VIS-12 use
explicit synthetic wings solely for controlled visual scenes. Default combat
remains a configurable two-ship sandbox, not a campaign or fleet deployment UI.

### Legacy curated asset importer

Use a legally available Starsector `starsector-core` directory only as an explicit developer input:

```powershell
./scripts/import-game-assets.ps1 -StarsectorCore 'C:\path\to\starsector-core'
```

The legacy script scans only the current source for referenced graphics/audio; prefer `npm run import:catalog` for the full catalog. It copies only that closure, rejects source-root traversal and regenerates SHA-256/size/type/sampler metadata. It does **not** copy the whole game installation. Once generated, the application builds and runs without the source installation.

## Visual Lab

Open:

```text
?view=visual-lab&scene=VIS-01&seed=1337
```

The Visual Lab provides play, pause, replay, fixed-step, deterministic seek, seed, zoom, camera lock, live-AI handoff, damage, motion and layer controls. In controlled mode it owns the fixed visual tick instead of letting live combat mutate the scene. Required benchmark textures are decoded and uploaded before Play/Step is enabled; load failures are shown in the panel rather than silently benchmarking missing layers.

The M2 acceptance-scene catalog follows the project plan exactly:

| Scene | Controlled scenario |
| --- | --- |
| VIS-01 | Onslaught static, four facings |
| VIS-02 | Idle, thrust, release, strafe, burn drive |
| VIS-03 | Shield deploy/close plus one hit |
| VIS-04 | Repeated shield hits |
| VIS-05 | Single TPC shot |
| VIS-06 | Continuous ballistic firing |
| VIS-07 | Beam charge, sustain and stop |
| VIS-08 | Missile straight flight, turn and impact |
| VIS-09 | Complete vent cycle |
| VIS-10 | Small impact and ship explosion |
| VIS-11 | Frozen HUD state |
| VIS-12 | Scripted two-ship/fighter integration with live shield timing |
| VIS-13 | Phase entry, coil trails, exit and cooldown |

`VisualScenarioController` rebuilds a scenario from its seed and absolute timestamp, so seek/replay does not depend on the path taken to reach that frame. Renderer-owned evolving state such as vent particles and tactical-arc fades is advanced from `updateVisual()` and reset on restart/ship change; `render()` samples the current `VisualClock` without advancing those effects.

Ship, engine, shield, weapon-family and explosion visual profiles are centralized under `src/engine/visual/VisualProfiles.ts`. The existing shield shader remains in place; its colors/animation now consume the profile layer rather than requiring a shader rewrite.

The HUD has responsive density rules for 1280×720, 1920×1080 and 2560×1440-class viewports. The project intentionally does not claim pixel-perfect parity without a controlled reference-capture set; Visual Lab is the deterministic comparison surface for that future work.

Mark IX and Hypervelocity Driver now use native textured ballistic heads with muzzle-grown rear trails instead of stretched centered sprites. HVD carries its source 400 EMP, both use the source 3.75 collision radius, and their firing audio follows the native sound entries. Full ballistic end-of-life fading and broader weapon parity remain open.

HUD typography is intentionally a readable system font (Segoe UI / Microsoft YaHei), not the original bitmap font, by user preference. Weapon groups support declared indices 0–6: keys 1–7 select, Ctrl+1–7 toggles autofire, and the HUD mode button switches linked/alternating fire. Mixed groups show separate weapon-type rows; empty groups are hidden. Desktop groups use source-style diagonal stacking and per-mount status to the right; narrow layouts stack these sections without hiding controls.

Destroyed hulls retain their weapon and damage composition. Normal wrecks no longer fade away on a 180-second timer; fighters use the source retention chance and 10-second wait before fading. Breakup now reads the source piece-count limits (Onslaught/Paragon 2–4, Doom 2–3), cuts the actual collision outline with a shared jagged seam, and renders polygon-masked pieces with their retained mounts and damage. Armor damage now uses pivot-aligned native square cells, persistent per-cell decals and source-style cooling/electrical flicker. Breakup clears armor and retains the existing decal pattern inside each piece, without inventing a hot seam. Newly disabled large hulls also receive the source internal armor-damage sequence, including when they do not split. Armor hits emit short source-sized sparks based on actual armor loss; the generic continuous damage smoke has been removed. Full native wreck physics, independently evolving piece damage/overkill and offscreen reclamation still remain open. The Web result modal waits for the ship explosion to finish, with battle statistics frozen during this visual tail.


## Rendering lifecycle and metrics

Production combat rendering is WebGL2-only. `CombatSession` exposes a low-frequency presentation lifecycle (`loading`, `ready`, context loss/restoration, and failure); browser simulation/input only advance while presentation is `ready`. The WebGL renderer handles `webglcontextlost` / `webglcontextrestored`, invalidates GPU texture state, rebuilds GPU resources, re-prepares required textures, and only returns to `ready` after restoration succeeds. Unsupported WebGL2, initialization failures, resource failures, or failed restoration show an actionable page-level error instead of falling back to Canvas2D combat.

Performance telemetry distinguishes:

- simulation time
- visual update time
- render preparation time
- JavaScript draw-submit time
- draw calls
- projectile / particle / texture counts
- resource recreations
- JS heap usage when the browser exposes it

JavaScript draw-submit time is **not** labelled GPU time. GPU time remains `unavailable` unless a real GPU timer query is available and measured.

## Collision / bounded Wasm runtime

Run:

```powershell
npm run benchmark:collision
```

The benchmark compares the object-oriented baseline, a packed typed-array TypeScript path, the full-scan Rust/Wasm kernel, and the production-style uniform-grid + indexed Wasm path at:

- small: 10 ships / 200 projectiles
- medium: 50 ships / 2,000 projectiles
- large: 100 ships / 10,000 projectiles

The kernel uses the real Onslaught, Paragon, and Doom hull polygons plus rotated hull intersection, shield geometry, circle broadphase filtering, and nearest in-step hit selection. The runtime rebuilds a conservative uniform-grid ship index once per projectile simulation step, batches only ordinary ballistic projectiles, and passes only per-projectile candidate indices into the bundled `public/runtime/collision_core.wasm`. Missiles, proximity fuses, flares, light-MG interception, small batches, unsupported hulls, and every Wasm load/runtime failure remain on the exact TypeScript path. TypeScript continues to own damage, armor, flux, entity lifetime, effects, audio, and all authoritative combat state.

The latest measured run records `runtimeIntegrated: true` for this bounded path. Spatial pruning removed 91.3% of naive pairs at 50/2,000 and 92.0% at 100/10,000. Spatial+Wasm end-to-end measured 84.5% of the fastest TypeScript path at medium load and 74.6% at large load; large-load P95 was 63.52 ms versus 80.36 ms for the fastest TypeScript path. The 100/10,000 stress case is still outside a 16.67 ms frame budget, so this is intentionally a limited accelerator with a TypeScript fallback rather than a transfer of simulation ownership. The precompiled module is shipped with the web build, while compiling it from Rust remains optional for normal `npm` build/runtime use. See `benchmarks/wasm-pilot/README.md` for boundary details and raw measurements.

### M8 Worker decision

M8 keeps the authoritative simulation on the main fixed-step loop and does **not** move the collision kernel into a Web Worker yet. Projectile collision results are consumed synchronously inside the same fixed tick so hit order, target destruction and damage/effect application stay deterministic. Moving only the geometry query to a Worker would either require blocking the main thread for a reply or accepting delayed authoritative results; neither is an acceptable drop-in replacement for the current contract.

Instead, the production runtime now records browser-side collision telemetry per rendered frame: kernel wall time, TypeScript/Wasm batch counts, Wasm fallback count, projectile count, candidate-pair count and maximum candidates per projectile. The Visual Lab displays the current values and window P95, and `window.__combatPerformanceReport().collision` exposes the aggregate report for real-browser captures. A future full-simulation Worker remains a separate architecture task using sequenced inputs and timestamped snapshots when browser measurements show that moving simulation work off the main thread is worth the added latency and synchronization complexity.

## Final closeout status

The repository-owned engineering gaps identified during final audit are now addressed: imported ship blueprints and weapon definitions (including nested muzzle-flash/proximity-fuse structures) are structurally/reference validated before registration, asynchronous texture uploads are generation/disposal guarded, image sampler state comes from the asset manifest, runtime public URLs honor the Vite deployment base, and HUD controls are isolated from combat pointer input. Authoritative combat randomness is deterministic/resettable and is isolated from a separately seeded cosmetic stream, so particle/audio/UI sampling cannot perturb later weapon spread, failure, collision, or AI decisions. The content manifest has an explicit schema/content version and default-loadout contract that is cross-validated against the runtime registry before renderer asset preparation completes.

Production validation covers both the normal build and a nested `/starsector/` base. The nested production preview served the application, both manifests, and the bundled collision Wasm successfully. The App no longer uses a 100 ms global render tick for HUD state; mutable combat presentation refresh is contained inside the HUD subtree while battle-result state is polled separately.

Standardized native-Starsector reference captures for a paired original-vs-web comparison remain an external visual-acceptance input. Native bitmap-font parity is explicitly excluded by user preference; readable system fonts are retained. Direct projectile contacts now use independently moving, constant-size native hit-particle pairs and source shield segment reactions instead of an extra generic shield burst; beam contact brightening, the continuous-beam mesh, brightness-squared .1s damage batches and source-speed front growth from the last shortened endpoint are source-derived. Same-cycle charging/chargedown retains the ray and damage clock. Tachyon now uses the source interval/previous-endpoint shield rule, distance-weighted component targets, extra energy/EMP damage and native textured arc geometry. Graviton now tracks distinct weapon identities for its one-second 5%/8%/10% shield-vulnerability effect, using current-endpoint full-brightness DPS pulses and target-side listener timing. Weapon component health now uses source turret/hardpoint HP, delayed zero-HP checks, incremental full-health repairs and permanent disable state. Direct projectiles, beams and Tachyon arcs share the source 21-cell armor/hull/EMP transfer; mine, flak, ship-ram and asteroid hull hits now use the same component map for their actual armor/hull loss. Engine health now initializes at installation and uses weighted disable fractions, delayed cascade/repair states, permanent damage and queued nozzle flashes. Source-derived motion, damaged-nozzle drift and short flame-command interlocks are implemented for the current Web controls. Low-CR weapon/engine failures now sample per eligible component health interval, with conditional critical failures, permanent-disable limits and critical self-damage. Shield failures now require recent real shield damage and high flux, sample source-randomized intervals and force a hull-size-base overload; fighters are excluded from CR module failures and defense lockouts. The deployment-only LowCRShipDamageSequence now captures initial CR, delays and schedules permanent critical damage with dynamic target pruning, independently of later combat CR decay and phase-time scaling. Complete motion/glow/system/API integration, remaining weapon-plugin variants, time/beam-speed stat modifiers, multi-ray convergence and missile secondary explosions remain incomplete. `HudGlyphSample` is a current-HUD typography sample, not a native-glyph comparison. The current scope and remaining gaps are recorded in `docs/visual-fidelity-audit.md`; older closeout notes do not override that audit.

## Development checks

Use typechecking, lint, production builds and direct runtime inspection. There is
no automated test suite or test command. Older test results in historical project
reports describe removed checks, not current regression coverage.

## Production verification checklist

Before release:

```powershell
npm run typecheck
npm run lint
npm run build
```

Then verify:

1. `dist/` contains `game-assets/asset-manifest.json` and `content/manifest.json`.
2. source and `dist/` contain no `/api/asset` references.
3. runtime source contains no `starsector-core` dependency.
4. `src/engine/render` contains no direct `Math.random()` or `performance.now()` calls.
5. production preview serves the application and bundled assets without parent-directory access.
   Also verify a non-root base such as `vite build --base=/starsector/` serves `/starsector/`, both manifests, and `runtime/collision_core.wasm`.
6. restart / ship switch can be repeated without stale battle state.

The original-format importer and asset regeneration script are explicit developer tools; they are not invoked by normal build or runtime code.

### Motion controls

W applies forward thrust; S applies reverse thrust; A/D strafe; X brakes along the current velocity. Releasing thrust preserves below-limit momentum. Overspeed recovers gradually rather than snapping to the speed cap. Mouse steering and AI braking use the same effective motion stats as the ship.


### Latest cross-weapon fidelity sweep (2026-09-16)

All17 currently registered weapon contracts were checked against their CSV/.wpn/.proj
sources without running hash-producing importers. Source charge/autocharge and full
burst-flux semantics, adapter-free native radii, per-source sound variants/beam loops,
projectile tail/range/impact fade with damage/EMP decay, Heavy Blaster/lightMG/Sabot
textured bullet presentation, Sabot secondary behavior, swept missile contacts,
beam missile interception and source-duration Reaper/Atropos splash damage are now
implemented. Built-in adapters can no longer silently override source gameplay or
material fields. All17 existing WPN presentation scenes reached ready/GL0; build,
typecheck, lint and bounded memory-only firing/lifetime/collision checks passed.

This supersedes the earlier ordinary-ballistic end-of-life gap, but not all missile
arming/fizzle, point-defense AI, beam environment occlusion, detailed explosion
visuals, mutable weapon APIs or paired-native acceptance gaps. See the chronological
cross-weapon section in docs/visual-fidelity-audit.md for precise scope and evidence.

## Fleet tactics and loadout roles

Capital-ship AI now shares a phase-local target/allocation plan: reachable-target scoring, target retention, coarse firepower commitments, separate approach lanes, and cover-seeking for vulnerable ships. Available weapons, effective range, speed and wings select line/brawler/artillery/skirmisher/carrier roles; weak-gun carriers can stand off at wing range instead of being treated as unarmed. Explicit player orders and manual/remote ownership remain authoritative. The four-owner path consumes and validates the same plan, with unchanged simulation frequency. This is additional Web tactical policy, not a full native fleet AI or a measured win-rate improvement. See [scope, evidence, costs and limits](docs/fleet-tactics-2026-09-17.md).

The [withdrawal behavior fix](docs/ai-withdrawal-behavior-2026-09-18.md) separates retreat intent from cover availability: losing a high-flux ally as cover now falls back to disengaging rather than immediately re-engaging under the same pressure. It is active rule code with 12 new regression checks, not an RL deployment or a demonstrated win-rate gain.

The follow-up [cover-arrival velocity experiment](docs/ai-cover-navigation-experiment-2026-09-18.md) was **rejected and reverted**: eliminating reverse world-space requests did not improve mirrored old/new combat (8 wins, 10 losses, 6 timeouts; 45.83% score). The earlier withdrawal-intent fix remains active. Frozen per-team dispatch and head-to-head tooling are retained for further evaluation.

The [fixed-battery precision experiment](docs/ai-fixed-battery-precision-2026-09-18.md) found a real aiming dead-zone stall and verified extra physical hits in an identical-state replay. However, the broad steering change failed its frozen old/new gate (11 wins, 14 losses, 47 timeouts; 47.92% score over 72 matches) and was **rejected and reverted**. Local damage improvement is not treated as overall AI-strength evidence.

The subsequent [hard-flux recovery experiment](docs/ai-hard-flux-recovery-2026-09-18.md) was also **rejected and reverted** after 144 frozen old/new matches (48.26% score). The [fixed-bore targeting candidate](docs/ai-fixed-bore-targeting-2026-09-18.md) was **rejected and reverted** after its independent 288-match validation (49.48% score; interval crosses 50%). Its local firing opportunity gains did not establish overall AI strength.

## Native combat AI multicore

Normal single-player combat can automatically use four persistent AI owners for supported 50–200 default native Onslaughts on an isolated browser with at least eight logical processors. Mixed/custom ships, unsupported effects/orders, small scenes, missing browser capabilities, and owner failures keep the synchronous path. Motion, weapons and damage remain authoritative on the main thread; no AI frequency or quality reduction is used.

Vite dev/preview supplies COOP `same-origin` and COEP `require-corp`. Static hosts must supply equivalent headers to enable SharedArrayBuffer; otherwise combat falls back to serial. LAN authority remains synchronous. Diagnostic snapshots under `artifacts/` are excluded from the dev watcher.

Use `window.__combatSession.getMulticoreStatus()` to inspect activation/fallback and full-step timings, or `setMulticoreEnabled(false)` / `setMulticoreEnabled(true)` on that session to control the automatic gate. See [integration measurements and limits](docs/ship-ownership-integration-2026-09-17.md); the prototype’s earlier ~16% result is not the production integration result.

The subsequent [simulation hotspot optimization](docs/simulation-hotspots-2026-09-17.md) measured another **+15.685% complete-step throughput** against its newly frozen, already-four-worker baseline (64.774 → 55.992 ms, 100 native Onslaughts). It removes repeated shield/explosion geometry work and codec allocations without reducing simulation frequency or precision. This is not an additive total with earlier experiments, nor an FPS measurement.

The next [missile-index/ownership-codec optimization](docs/simulation-query-optimization-2026-09-17.md) measured **+9.824% complete-step throughput** against the preceding four-worker version (47.244 → 43.018 ms). A separate same-version comparison measured **+11.441%** for four Workers versus serial (46.933 → 42.115 ms). These are distinct comparisons, not additive gains or screen FPS.

The follow-up [fire-control optimization experiments](docs/simulation-firecontrol-experiments-2026-09-17.md) were **rejected and rolled back**: the final arithmetic candidate measured only +1.175% mean throughput with worse P95; spatial-grid overhead also erased most local gains. No new runtime improvement or 100-battleship/180-FPS result is claimed for that round. Earlier accepted optimizations remain.

The next [hull-boundary query optimization](docs/simulation-boundary-index-2026-09-17.md) measured **+5.918% complete-step throughput** (42.360 → 39.993 ms) and **−9.260% P95 time**. It uses an exact nearest-edge branch-and-bound query and indexed containment, without lowering simulation frequency or precision. Both versions use four Workers; this is a new frozen comparison, not cumulative gains or screen FPS.

The next [main-thread bottleneck investigation](docs/simulation-main-thread-bottleneck-2026-09-17.md) rejected and rolled back numeric-shadow and fused-ray/squared-distance candidates: gains were small or reversed on repeat. New sampling locates about 13.6 ms/step in ship weapon control and 8.5 ms/step in projectile simulation, still on the authoritative main thread. These are instrumented diagnostic costs, not a new speedup, cumulative total, or FPS result.

The [fire-control Worker prototype](docs/fire-control-worker-prototype-2026-09-17.md) now executes aim/obstruction planning in four additional Workers and matches the native 100-ship trajectory through tick 660. It is **not production enabled**: complete-step time regressed from 45.806 to 55.043 ms in its final paired extended run. Duplicate capture/validation/synchronization remain the next architecture target; this is not an accepted speedup or an FPS claim.

The [shared AI/fire-control owner experiment](docs/shared-owner-fire-prototype-2026-09-17.md) reuses four Workers, merges source snapshots, preserves projectile identity and validates seven input/failure fallbacks. It remains **disabled in production**: its compact version measured 47.468 → 49.515 ms per complete step (−4.133% throughput). Correct parallel results alone do not establish a net speedup.

The independently accepted [scalar ownership codec optimization](docs/simulation-wire-codec-2026-09-17.md) removes dynamic per-field access from the existing four-AI-worker snapshot path. Two opposite-order 600-step paired runs measured a combined **+5.214% complete-step throughput** (43.783 → 41.613 ms; individual gains +3.060% and +7.425%). Numeric semantics, unknown-schema fallback, input invalidation and tick-660 state hashes are preserved. This is an incremental frozen comparison, not cumulative gains, additional fire Workers or screen FPS.

The follow-up [main-thread experiments](docs/simulation-main-thread-experiments-2026-09-17.md) were **not accepted**. Shield broadphase, missile-grid calculation/storage reuse and live target-location hints produced no reliable complete-step gain; two extended grid-reuse runs combined to **−0.328% throughput**. A target-hint boundary failure was also caught before deployment. No runtime code from this round was enabled; earlier accepted optimizations remain unchanged.

## Steam browser launcher (protocol v17)

Steam mode keeps the game in an ordinary browser. Every player runs a small local Steamworks helper; Electron is not required. Use npm run steam to build/start, npm run steam:serve to reuse a build, or npm run package:steam to produce a Windows x64 portable ZIP with a hidden launcher. The default AppID 480 is for Spacewar development testing, not a production release identity. The existing LAN launch/package scripts are preserved.

Steam lobbies and P2P packets bridge into the same room, refit, teams, AI and battle protocol. Share the full Steam lobby ID, not localhost or the six-digit LAN code. Host computation, bounded snapshot recovery and no host migration remain unchanged. Native loading and simulated two-peer protocol checks do not establish real Steam-account or cross-network validation. See [Steam setup and limitations](docs/steam-multiplayer.md).
