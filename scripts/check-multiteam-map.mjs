/** Real LAN world, snapshot, radar and tactical-map regression; isolated browser, no user saves.
 * Run with Vite at COMBAT_TEST_URL (default :5173), Playwright on NODE_PATH and optional BROWSER_PATH. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/__multiteam_map_check.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body><div id="radar"></div><canvas id="map" width="1200" height="400"></canvas>
<script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></body>` }));
  await page.goto(`${process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173'}/__multiteam_map_check.html`);
  const results = await page.evaluate(async () => {
    window.__LAN_BUILD_ID__ = 'multiteam-map-check';
    const { createLanWorld, setLanPerspective } = await import('/src/network/LanWorld.ts');
    const { captureCombat, applyCombatSnapshot } = await import('/src/network/CombatSnapshot.ts');
    const { combatTeamColor } = await import('/src/engine/simulation/CombatTeams.ts');
    const { updateCombatVisibility, contactVisible } = await import('/src/engine/simulation/systems/CombatVisibility.ts');
    const { tacticalContactVisible } = await import('/src/ui/tactical/TacticalVisibility.ts');
    const { fitTacticalView, mapPoint, pickMapShip, TacticalMapPainter } = await import('/src/ui/tactical/TacticalMapPainter.ts');
    const { assetManager } = await import('/src/engine/assets/AssetResolver.ts');
    const { contentManifestManager } = await import('/src/engine/content/ContentManifest.ts');
    await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
    const results = [];
    const check = (ok, name, details) => results.push({ name, passed: !!ok, ...(!ok ? { details } : {}) });
    const player = (seat, team) => ({ id: `p${seat}`, name: `p${seat}`, seat, team, hull: 'wolf', design: null });
    const matchFor = (teams, aiHulls = Array.from({ length: Math.max(...teams) + 1 }, () => [])) => ({
      id: 'map-check', seed: 917, hostId: 'p0', snapshotHz: 10,
      players: teams.map((team, seat) => player(seat, team)),
      options: { aiHulls, assignment: 'teams', battleSize: 2000, initialDeploymentLimit: 60 },
    });
    const match = matchFor([0, 1, 2, 3, 4]);
    const authority = createLanWorld(match);
    updateCombatVisibility(authority.engine.ships, authority.engine.openBattlefield);
    const world = createLanWorld(match), engine = world.engine;
    // Exercise the real authority loop, not just a display-only reveal switch.
    for (let i = 0; i < 6; i++) authority.engine.fixedUpdate(1 / 60);
    check(authority.engine.capitalShips.every(s => authority.engine.capitalShips.every(t => t.isVisibleTo(s.teamId))), 'public vision survives real authority ticks');
    const spectatorTarget = authority.engine.enemyShip;
    check(spectatorTarget.isVisibleTo(32), 'public vision includes an observer team absent from the active roster');
    applyCombatSnapshot(engine, captureCombat(authority.engine, 1, {}, 0), true);
    for (let seat = 0; seat < 5; seat++) {
      setLanPerspective(engine, world.controlled, seat);
      const visible = engine.capitalShips.filter(s => s.isVisibleTo(engine.playerShip.teamId)).map(s => s.teamId);
      check(visible.length === 5, `five-team natural spawn: every team visible from seat ${seat} after snapshot`, visible);
    }
    for (const n of [2, 3, 4, 5, 8, 10, 33]) {
      const e = createLanWorld(matchFor(Array.from({length: n}, (_, i) => i))).engine;
      check(e.openBattlefield === (n >= 3), `${n} teams: correct public/sensor battlefield policy`);
      if (n >= 3) check(e.capitalShips.every(s => e.capitalShips.every(t => t.isVisibleTo(s.teamId))), `${n} teams: first frame reveals all active teams`);
      // The sensor path remains available to ordinary combat, including numerical edge cases.
      updateCombatVisibility(e.ships);
      const ships = e.capitalShips;
      check(ships.every((s, i) => ships[(i + 1) % n].isVisibleTo(s.teamId) && ships[(i + n - 1) % n].isVisibleTo(s.teamId)), `${n} teams: sensor mode: boundary neighbours visible symmetrically`);
      if (n > 3) check(!ships[Math.floor(n / 2)].isVisibleTo(ships[0].teamId), `${n} teams: sensor mode: genuinely distant opponent stays hidden`);
    }
    const reused = createLanWorld(match).engine;
    reused.switchPlayerShip('wolf');
    check(!reused.openBattlefield && !reused.multiTeamBattle, 'switching to ordinary combat clears LAN presentation policy');
    // Empty observer list must not silently switch an eliminated guest to the host's vision.
    const hostShip = engine.allCapitalShips.find(s => s.teamId === 0);
    check(!tacticalContactVisible(hostShip, [], 2), 'no living observers: team 2 does not inherit team 0 map contacts');
    setLanPerspective(engine, world.controlled, 0);
    const target = engine.enemyShip;
    target.pos.copy(engine.playerShip.pos); target.pos.x += engine.playerShip.sightRadius + 0.01;
    check(!contactVisible(target, [engine.playerShip], 0), 'sensor tolerance does not reveal genuinely out-of-range contacts');
    // Roster allocation cannot depend on whether a human-only team has an AI row.
    const sparse = createLanWorld(matchFor([0, 2, 32], [[]])).engine;
    check(sparse.allCapitalShips.every(s => Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y)), 'human-only/sparse teams get finite spawn positions');
    const reserves = createLanWorld(matchFor([0, 1, 2], [['paragon'], [], []])).engine;
    const reserve = reserves.allCapitalShips.find(s => reserves.deployment.isReserve(s.id));
    check(reserve && !reserves.ships.includes(reserve), 'public arena excludes reserve hulls from active/render roster');
    if (reserve) {
      const v = fitTacticalView(reserves, 1200, 400);
      check(pickMapShip(reserves, mapPoint(reserve.pos, v, 1200, 400), v, 1200, 400) !== reserve, 'public arena cannot pick an undeployed reserve');
      reserves.deployment.deploy([reserve.id], reserve.teamId);
      reserves.fixedUpdate(1 / 60);
      check(reserves.ships.includes(reserve) && reserve.isVisibleTo(2), 'public arena reveals newly deployed far-edge reinforcement on next authority tick');
      for (const flag of ['isDead', 'isDocked', 'isRetreated']) {
        reserve[flag] = true;
        check(!contactVisible(reserve, [], 2, true), `public contact policy excludes ${flag} hulls`);
        reserve[flag] = false;
      }
    }
    // All display colors must use stable allegiance, not local/host ownership.
    applyCombatSnapshot(engine, captureCombat(authority.engine, 2, {}, 0), true);
    check(engine.capitalShips.some(s => s.pos.distanceTo(engine.playerShip.pos) > 4000), 'five-team fixture really extends beyond old radar range');
    const reactModule = await import('/node_modules/.vite/deps/react.js'); const React = reactModule.default ?? reactModule;
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js'); const { createRoot } = domModule.default ?? domModule;
    const { CombatRadar } = await import('/src/ui/hud/CombatRadar.tsx');
    const root = createRoot(document.getElementById('radar'));
    const fills = [], strokes = [];
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fill, stroke = proto.stroke, strokeRect = proto.strokeRect;
    proto.fill = function(...args) { fills.push({ canvas: this.canvas, color: this.fillStyle, transform: this.getTransform() }); return fill.apply(this, args); };
    proto.stroke = function(...args) { strokes.push({ canvas: this.canvas, color: this.strokeStyle }); return stroke.apply(this, args); };
    proto.strokeRect = function(...args) { strokes.push({ canvas: this.canvas, color: this.strokeStyle }); return strokeRect.apply(this, args); };
    try {
      const map = document.getElementById('map'), ctx = map.getContext('2d'), painter = new TacticalMapPainter();
      // Exercise the production fallback glyphs deterministically, independent of image load timing.
      painter.image = () => undefined;
      for (let seat = 0; seat < 5; seat++) {
        setLanPerspective(engine, world.controlled, seat); fills.length = 0; strokes.length = 0;
        root.render(React.createElement(CombatRadar, { engine }));
        await new Promise(resolve => setTimeout(resolve, 100));
        const radar = document.querySelector('#radar canvas');
        const own = fills.filter(f => f.canvas === radar && f.transform.e === radar.width / 2 && f.transform.f === radar.height / 2);
        check(own.length && own.every(f => f.color === combatTeamColor(engine.playerShip.teamId)), `radar flagship color matches team from seat ${seat}`, own.map(f => f.color));
        check(engine.capitalShips.every(s => fills.some(f => f.canvas === radar && f.color === combatTeamColor(s.teamId))), `radar shows all five team colors at natural spawn positions from seat ${seat}`);
        painter.draw(ctx, map.width, fitTacticalView(engine, map.width, map.height), engine, { pos: engine.playerShip.pos, width: 1280, height: 720, zoom: 1 }, null, map.height);
        check(engine.capitalShips.every(s => strokes.some(f => f.canvas === map && f.color === combatTeamColor(s.teamId))), `tactical map distinguishes all five team colors at natural spawn positions from seat ${seat}`);
      }
      const radar = document.querySelector('#radar canvas');
      const me = engine.playerShip;
      for (const flag of ['isDead', 'isDocked', 'isRetreated']) {
        me[flag] = true; fills.length = 0;
        await new Promise(resolve => setTimeout(resolve, 50));
        check(!fills.some(f => f.canvas === radar && f.transform.e === radar.width / 2 && f.transform.f === radar.height / 2), `radar removes ${flag} flagship arrow`);
        me[flag] = false;
      }
      engine.openBattlefield = false; engine.multiTeamBattle = false; fills.length = 0;
      await new Promise(resolve => setTimeout(resolve, 50));
      check(fills.some(f => f.canvas === radar && f.transform.e === radar.width / 2 && f.color === '#22c55e'), 'ordinary combat retains green flagship color');
      engine.openBattlefield = true; engine.multiTeamBattle = true;
      // Exercise real WebGL hull rendering without moving the five-team formation closer.
      const { WebGLCombatRenderer } = await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
      const { VisualRandom } = await import('/src/engine/runtime/VisualRandom.ts');
      const battle = document.createElement('canvas'); battle.width = 640; battle.height = 480;
      document.body.append(battle);
      const gl = battle.getContext('webgl2', {alpha: false, antialias: false});
      if (!gl) throw Error('WebGL2 unavailable');
      const renderer = new WebGLCombatRenderer(battle, gl);
      try {
        await renderer.prepareAssets(engine);
        const frame = {visualTime: 1, random: new VisualRandom(917), layers: new Set(['hull']), damageEnabled: true};
        for (let seat = 0; seat < 5; seat++) {
          setLanPerspective(engine, world.controlled, seat);
          for (const ship of engine.capitalShips) {
            let draws = 0;
            const draw = renderer.batcher.drawSprite, texture = renderer.textures.getTexture(ship.spec.spriteUrl);
            renderer.batcher.drawSprite = function(...args) {
              if (args[0] === texture && args[1] === ship.pos.x && args[2] === ship.pos.y && args[3] === ship.spec.spriteWidth && args[4] === ship.spec.spriteHeight && args[11] > 0) draws++;
              return draw.apply(this, args);
            };
            try { renderer.render(engine, 1, ship.pos, 1, frame); }
            finally { renderer.batcher.drawSprite = draw; }
            check(draws > 0, `real WebGL: seat ${seat} renders team ${ship.teamId} hull at natural spawn`, draws);
          }
        }
        check(gl.getError() === 0, 'five-team renderer has no WebGL errors');
      } finally { renderer.dispose(); battle.remove(); }
      // Known friendlies are shared even beyond local sensors; Home must fit both map dimensions.
      const ships = engine.capitalShips;
      for (const [i, s] of ships.entries()) { s.teamId = engine.playerShip.teamId; s.pos.set(0, (i - 1) * 10000); }
      updateCombatVisibility(engine.ships);
      for (const [width, height] of [[1200, 400], [400, 1200], [800, 800], [2000, 250]]) {
        const view = fitTacticalView(engine, width, height);
        check(ships.every(s => { const p = mapPoint(s.pos, view, width, height); return p.x > 10 && p.x < width - 10 && p.y > 10 && p.y < height - 10; }), `map overview fits visible ships at ${width}x${height}`);
        check(ships.every(s => pickMapShip(engine, mapPoint(s.pos, view, width, height), view, width, height) === s), `map picking matches projection at ${width}x${height}`);
      }
    } finally { root.unmount(); proto.fill = fill; proto.stroke = stroke; proto.strokeRect = strokeRect; }
    return results;
  });
  console.log(JSON.stringify({ results, pageErrors: errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(results.every(r => r.passed), 'multiteam map regressions failed');
} finally { await browser.close(); }


