/** Browser regression: run with a Vite dev server and Playwright available on NODE_PATH.
 * COMBAT_TEST_URL defaults to http://127.0.0.1:5173; BROWSER_PATH optionally selects Chromium.
 * Uses an isolated browser context; never touches the user's game save/browser profile. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const base = process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173';
try {
  await page.goto(`${base}/?view=combat`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__combatSession?.isPresentationReady(), null, { timeout: 90000 });
  await page.evaluate(() => window.__combatSession.pause());
  const checks = await page.evaluate(async () => {
    const { GameSession } = await import('/src/engine/game/GameSession.ts');
    const { Vector2 } = await import('/src/engine/math/Vector2.ts');
    const { Ship } = await import('/src/engine/simulation/Ship.ts');
    const { modManager } = await import('/src/engine/modding/ModManager.ts');
    const { CameraController } = await import('/src/engine/runtime/CameraController.ts');
    const { notificationOpacity } = await import('/src/engine/simulation/CombatNotifications.ts');
    const passed = [];
    const check = (value, name) => { if (!value) throw new Error(name); passed.push(name); };
    const game = new GameSession(null);
    game.activate();
    const session = game.combat, engine = session.engine;
    let completions = 0;
    session.subscribeBattleCompleted(() => completions++);
    const ally = engine.addShip(engine.playerShip.spec, true, new Vector2(30000, 30000), 0);
    const hostile = engine.addShip(engine.enemyShip.spec, false, new Vector2(-30000, -30000), 0);
    engine.playerShip.pos.set(50000, 50000);
    engine.enemyShip.pos.set(-50000, -50000);
    for (const ship of engine.capitalShips) engine.externallyControlledShipIds.add(ship.id);
    engine.playerShip.shipName = 'ISS Test Flagship';
    engine.playerShip.applyHullDamage(1e9);
    session.step();
    check(engine.playerShip.isDead && !engine.battleResult, 'flagship loss does not end a battle with surviving allies');
    check(engine.shipLossNotifications.length === 1 && engine.shipLossNotifications[0].shipName === 'ISS Test Flagship', 'flagship loss emits named event immediately');
    engine.enemyShip.applyHullDamage(1e9);
    session.step();
    check(!engine.battleResult && engine.shipLossNotifications.length === 2, 'enemy flagship loss reports without requiring battle end');
    // Craft are deliberately excluded, as in native combat/class/C.
    const fighter = new Ship('test-fighter', modManager.getAllShips().find(spec => spec.hullSize === 'FIGHTER'));
    engine.handleShipDestruction(fighter);
    check(engine.shipLossNotifications.length === 2, 'fighter losses do not flood the ship feed');
    ally.applyHullDamage(1e9);
    session.step();
    check(engine.battleResult?.isVictory === false && engine.shipLossNotifications.some(n => n.id === ally.id), 'non-flagship reinforcement loss reports and settles defeat');
    const report = JSON.stringify(engine.battleResult);
    for (let i = 0; i < 600 && !engine.isBattleResultReady; i++) session.step();
    check(engine.isBattleResultReady && completions === 1 && !game.getSnapshot().pendingCombat, 'settles once after explosion tail');
    const save = JSON.stringify(game.getSnapshot());
    const combatState = () => JSON.stringify({ time: engine.combatTime, random: engine.random,
      stats: engine.statsTracker, ships: engine.ships.map(ship => ({ id: ship.id, hp: ship.hullHp,
        armor: [...ship.armor.cells], cr: ship.currentCR, flux: [ship.flux.softFlux, ship.flux.hardFlux],
        ammo: ship.weapons.map(w => w.ammo) })) });
    const before = combatState();
    hostile.vel.set(100, 20);
    const x = hostile.pos.x;
    const asteroid = engine.asteroids[0]; asteroid.vel.set(10, 0); const asteroidX = asteroid.pos.x;
    const shot = { id: -999, pos: new Vector2(), prevPos: new Vector2(), vel: new Vector2(100, 0), rangeRemaining: 1000, elapsedTime: 0 };
    const beam = { elapsedTime: 0, duration: .2, damageActive: true, isHitting: true };
    engine.projectiles.push(shot); engine.beams.push(beam);
    session.start(); session.fixedUpdate(1 / 60);
    check(hostile.pos.x > x && hostile.prevPos.x === x && asteroid.pos.x !== asteroidX, 'observation advances ship and asteroid movement with interpolation');
    check(shot.pos.x > 0 && shot.prevPos.x === 0, 'settled projectiles move instead of freezing');
    check(!beam.damageActive && !beam.isHitting, 'settled beams are visual-only');
    for (let i = 0; i < 1200; i++) session.fixedUpdate(1 / 60);
    check(!engine.projectiles.length && !engine.beams.length, 'remaining ordnance expires');
    check(combatState() === before && JSON.stringify(engine.battleResult) === report, 'observation cannot mutate damage, ammo, CR, RNG, duration or result');
    check(completions === 1 && JSON.stringify(game.getSnapshot()) === save, 'observation never writes a second saved outcome');
    check(new Set(engine.shipLossNotifications.map(n => n.id)).size === engine.shipLossNotifications.length, 'no repeated loss messages');
    check(notificationOpacity(0, 15) === 1 && notificationOpacity(0, 17.5) === .5 && notificationOpacity(0, 20) === 0, 'native-style 15-second hold and 5-second fade');
    session.pause(); const clock = engine.notificationTime; session.fixedUpdate(1);
    check(engine.notificationTime === clock, 'pause freezes aftermath and notification age');
    const camera = new CameraController(), pos = new Vector2();
    camera.observe(pos, { KeyD: true }, .5, .1);
    check(pos.x === 120 && pos.y === 0, 'spectator camera moves at screen-relative speed');
    camera.observe(pos, { KeyW: true }, .5, .1, false);
    check(pos.y === 0, 'blocked spectator camera does not move');
    const diagonal = new Vector2(); camera.observe(diagonal, { KeyW: true, KeyD: true }, .5, .1);
    check(Math.abs(diagonal.length() - 120) < .00001, 'diagonal camera movement is normalized');
    game.restartCombat();
    check(!engine.shipLossNotifications.length && engine.aftermathTime === 0 && !engine.battleResult, 'restart clears notifications and aftermath');
    session.setDamageEnabled(false); engine.enemyShip.hullHp = 0; session.step();
    check(!engine.shipLossNotifications.length && !engine.enemyShip.isDead, 'damage-disabled visual lab emits no fake loss');
    game.dispose();
    return passed;
  });
  // Real React/input path: victory -> results -> observe -> pause -> results -> restart.
  await page.evaluate(() => {
    const session = window.__combatSession, engine = session.engine;
    session.pause(); engine.playerShip.vel.set(90, 10); engine.enemyShip.applyHullDamage(1e9); session.step();
    for (let i = 0; i < 600 && !engine.isBattleResultReady; i++) session.step();
  });
  await page.getByRole('dialog', { name: '战斗结算', exact: true }).waitFor();
  assert.match(await page.getByRole('log', { name: '战斗损失通报' }).innerText(), /摧毁/);
  const settled = await page.evaluate(() => ({ x: window.__combatEngine.playerShip.pos.x,
    report: JSON.stringify(window.__combatEngine.battleResult), save: JSON.stringify(window.__gameSession.getSnapshot()) }));
  await page.getByRole('button', { name: '观察战场' }).click();
  await page.waitForFunction(x => window.__combatEngine.playerShip.pos.x > x + 5, settled.x);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'CANVAS');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__combatSession.state === 'paused');
  assert.match(await page.locator('.combat-observation-bar').innerText(), /观察已暂停/);
  const cameraBefore = await page.evaluate(() => {
    const s = window.__combatSession;
    const render = s.render.bind(s);
    s.render = (alpha, pos, zoom) => { window.__testCamera = { x: pos.x, y: pos.y, zoom }; return render(alpha, pos, zoom); };
    return true;
  });
  assert.ok(cameraBefore);
  await page.waitForFunction(() => window.__testCamera);
  const cameraX = await page.evaluate(() => window.__testCamera.x);
  await page.keyboard.down('KeyD');
  await page.waitForFunction(x => window.__testCamera.x > x + 10, cameraX);
  await page.keyboard.up('KeyD');
  await page.getByRole('button', { name: '查看战果', exact: true }).click();
  await page.getByRole('dialog', { name: '战斗结算', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__combatSession.state === 'running');
  assert.deepEqual(await page.evaluate(() => ({ report: JSON.stringify(window.__combatEngine.battleResult), save: JSON.stringify(window.__gameSession.getSnapshot()) })), { report: settled.report, save: settled.save });
  await page.getByRole('button', { name: '查看战果', exact: true }).click();
  await page.getByRole('button', { name: '重新开始', exact: false }).click();
  await page.waitForFunction(() => !window.__combatEngine.battleResult);
  assert.equal(await page.locator('.combat-notification').count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: [...checks, 'real HUD death notification', 'Observe restores motion and canvas focus', 'Space pauses; free camera still navigates', 'reopen results and Escape resume', 'UI restart clears the feed'], pageErrors: errors }, null, 2));
} finally { await browser.close(); }
