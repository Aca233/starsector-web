/** Multiteam "missing textures" regression: sensor-hidden hulls must not leave debug geometry.
 * Requires a Vite server (COMBAT_TEST_URL) and Playwright on NODE_PATH; BROWSER_PATH is optional.
 * Uses an isolated page/profile, the real LAN world/snapshot/renderer, and no user saves. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const base = process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173';
try {
  // Avoid mounting the actual app or connecting to any live multiplayer room.
  await page.route('**/__multiteam_render_check.html', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body style="margin:0"><canvas id="battle" width="960" height="720"></canvas></body>',
  }));
  await page.goto(`${base}/__multiteam_render_check.html`, { waitUntil: 'domcontentloaded' });
  const passed = await page.evaluate(async () => {
    // The normal Vite client supplies dev defines; this isolated harness has no client/HMR.
    window.__LAN_BUILD_ID__ = 'multiteam-render-check';
    const { createLanWorld, setLanPerspective } = await import('/src/network/LanWorld.ts');
    const { captureCombat, applyCombatSnapshot } = await import('/src/network/CombatSnapshot.ts');
    const { updateCombatVisibility } = await import('/src/engine/simulation/systems/CombatVisibility.ts');
    const { WebGLCombatRenderer } = await import('/src/engine/render/webgl/WebGLCombatRenderer.ts');
    const { textureCache } = await import('/src/engine/render/TextureCache.ts');
    const { assetManager } = await import('/src/engine/assets/AssetResolver.ts');
    const { contentManifestManager } = await import('/src/engine/content/ContentManifest.ts');
    const { VisualRandom } = await import('/src/engine/runtime/VisualRandom.ts');
    await assetManager.ensureManifestLoaded();
    await contentManifestManager.ensureLoaded();
    const passed = [];
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const player = (seat, team, hull) => ({ id: `p${seat}`, name: `p${seat}`, seat, team, hull, design: null });
    const aiHulls = Array.from({ length: 33 }, () => []);
    aiHulls[0] = ['onslaught']; // Kept in reserve by the initial DP limit.
    aiHulls[1] = ['onslaught'];
    const match = {
      id: 'render-check', seed: 917, hostId: 'p0', snapshotHz: 10,
      players: [player(0, 0, 'paragon'), player(1, 2, 'onslaught'), player(2, 32, 'paragon')],
      options: { aiHulls, assignment: 'teams', battleSize: 2000, initialDeploymentLimit: 60 },
    };
    const authority = createLanWorld(match);
    for (const [i, ship] of authority.engine.capitalShips.entries()) {
      ship.pos.set(i * 700, 0); ship.prevPos.copy(ship.pos);
    }
    updateCombatVisibility(authority.engine.ships);
    const world = createLanWorld(match), engine = world.engine;
    applyCombatSnapshot(engine, captureCombat(authority.engine, 1, {}, 0), true);
    const canvas = document.getElementById('battle');
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    check(gl, 'WebGL2 unavailable');
    const renderer = new WebGLCombatRenderer(canvas, gl);
    const frame = { visualTime: 1, random: new VisualRandom(917), layers: new Set(['hull']), damageEnabled: true };
    try {
      await renderer.prepareAssets(engine);
      const sample = (ship, markers = false) => {
        const stats = { hull: 0, markers: 0, pixels: 0 };
        const texture = renderer.textures.getTexture(ship.spec.spriteUrl);
        const draw = renderer.batcher.drawSprite;
        const debug = renderer.tacticalOverlayPass.renderDebugMarkers;
        let inDebug = false;
        renderer.batcher.drawSprite = function (...args) {
          if (args[0] === texture && args[1] === ship.pos.x && args[2] === ship.pos.y
              && args[3] === ship.spec.spriteWidth && args[4] === ship.spec.spriteHeight && args[11] > 0) stats.hull++;
          if (inDebug && Math.abs(args[1] - ship.pos.x) < 400 && Math.abs(args[2] - ship.pos.y) < 400) stats.markers++;
          return draw.apply(this, args);
        };
        renderer.tacticalOverlayPass.renderDebugMarkers = function (...args) {
          inDebug = true;
          try { return debug.apply(this, args); } finally { inDebug = false; }
        };
        try {
          renderer.render(engine, 1, ship.pos, 1, { ...frame, layers: new Set(markers ? ['hull', 'markers'] : ['hull']) });
          const pixels = new Uint8Array(400 * 400 * 4);
          gl.readPixels(280, 160, 400, 400, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 40) stats.pixels++;
          check(gl.getError() === gl.NO_ERROR, 'WebGL error while drawing ' + ship.id);
        } finally {
          renderer.batcher.drawSprite = draw;
          renderer.tacticalOverlayPass.renderDebugMarkers = debug;
        }
        return stats;
      };
      for (const seat of [0, 1, 2]) {
        setLanPerspective(engine, world.controlled, seat);
        for (const ship of engine.capitalShips) {
          check(ship.isVisibleTo(engine.playerShip.teamId), `missing contact: seat ${seat}, ${ship.id}`);
          check(textureCache.getImageState(ship.spec.spriteUrl) === 'decoded', 'hull image not decoded');
          const stats = sample(ship);
          check(stats.hull === 1 && stats.pixels > 1000, `missing rendered hull: seat ${seat}, ${ship.id}: ${JSON.stringify(stats)}`);
        }
      }
      passed.push('four teams render decoded hulls on host and two guest perspectives, including team 32, after a real snapshot');
      setLanPerspective(engine, world.controlled, 0);
      const target = engine.enemyShip;
      const near = target.pos.clone();
      target.pos.set(12000, 0); target.prevPos.copy(target.pos);
      updateCombatVisibility(engine.ships);
      check(!target.isVisibleTo(engine.playerShip.teamId), 'target should be outside allied sensor coverage');
      const hidden = sample(target, true);
      check(hidden.hull === 0 && hidden.markers === 0 && hidden.pixels === 0, 'hidden hull leaves ghost debug geometry: ' + JSON.stringify(hidden));
      passed.push('out-of-sensor enemy leaves neither hull nor colored debug markers/pixels');
      target.pos.copy(near); target.prevPos.copy(near);
      updateCombatVisibility(engine.ships);
      const visible = sample(target, true);
      check(visible.hull === 1 && visible.markers > 0 && visible.pixels > 1000, 'visible debug hull/markers must remain usable in Visual Lab');
      passed.push('entering sensor coverage restores both hull and opt-in debug geometry');
      for (const flag of ['isDead', 'isDocked', 'isRetreated']) {
        target[flag] = true;
        try { check(sample(target, true).markers === 0, `${flag} ship leaves ghost debug markers`); }
        finally { target[flag] = false; }
      }
      passed.push('dead, docked and retreated contacts have no debug geometry');
      const reserve = engine.allCapitalShips.find(ship => engine.deployment.isReserve(ship.id));
      check(reserve, 'missing reserve test fixture');
      const originalEnemy = engine.enemyShip;
      engine.enemyShip = reserve;
      try { check(sample(reserve, true).markers === 0, 'reserve has debug geometry without an active hull'); }
      finally { engine.enemyShip = originalEnemy; }
      engine.deployment.deploy([reserve.id], reserve.teamId);
      updateCombatVisibility(engine.ships);
      check(reserve.isVisibleTo(engine.playerShip.teamId), 'distant own-team reinforcement should be visible');
      const deployed = sample(reserve);
      check(deployed.hull === 1 && deployed.pixels > 1000, 'reinforcement missing hull texture');
      passed.push('reserves have no ghost geometry; deployment renders the preloaded friendly hull at the entry edge');
      return passed;
    } finally { renderer.dispose(); }
  });
  // The test probe deliberately enables markers above. The real battle must not.
  const source = await readFile(new URL('../src/network/LanBattle.tsx', import.meta.url), 'utf8');
  const layers = source.match(/const LAYERS = new Set\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(layers, 'Unable to inspect LAN presentation layers');
  assert.ok(!layers.includes('"markers"') && !layers.includes("'markers'"), 'Normal LAN combat must not enable Visual Lab debug markers');
  passed.push('normal LAN combat does not enable the debug-only markers layer');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
