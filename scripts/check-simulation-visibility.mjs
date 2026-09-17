/** Regression for simulator reinforcement "missing textures": sensor-hidden hulls must not leave HUD tags.
 * Requires a Vite server (COMBAT_TEST_URL) and Playwright on NODE_PATH; BROWSER_PATH is optional.
 * Mounts the real design-trial/deployment UI in an isolated browser, with no user save/profile. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(String(error)));
const passed = [];
try {
  await page.goto(process.env.COMBAT_TEST_URL ?? 'http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { CombatView } = await import('/src/CombatView.tsx');
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '100' });
    document.body.append(host);
    createRoot(host).render(React.createElement(CombatView, { prototypeId: 'onslaught', deploymentCost: 40 }));
  });
  await page.waitForFunction(() => window.__combatSession?.isPresentationReady(), null, { timeout: 90000 });
  await page.evaluate(() => window.__combatSession.pause());
  await page.getByRole('button', { name: /锤头/ }).click();
  await page.getByRole('button', { name: '部署', exact: true }).click();
  await page.waitForFunction(() => window.__combatSession.isPresentationReady());
  const initial = await page.evaluate(async () => {
    const s = window.__combatSession, e = s.engine;
    const { simulationRoster } = await import('/src/ui/tactical/SimulationRoster.ts');
    const { textureCache } = await import('/src/engine/render/TextureCache.ts');
    const { collectCombatTextureUrls } = await import('/src/engine/assets/CombatAssetClosure.ts');
    const roster = simulationRoster();
    const images = await Promise.all(roster.map(option => textureCache.waitForImage(option.spec.spriteUrl)));
    window.__enemyEntry = e.enemyShip.pos.clone();
    s.cameraController.follow = current => current.copy(e.enemyShip.pos);
    const hull = s.renderer.textures.getTexture(e.enemyShip.spec.spriteUrl);
    const batcher = s.renderer.batcher, draw = batcher.drawSprite.bind(batcher);
    window.__testHullDraws = 0;
    batcher.drawSprite = (...args) => { if (args[0] === hull) window.__testHullDraws++; return draw(...args); };
    return { options: roster.length, imagesValid: images.every(image => image.complete && image.naturalWidth > 0),
      state: s.state, visible: e.enemyShip.isVisibleTo(e.playerShip.teamId), distance: e.enemyShip.pos.distanceTo(e.playerShip.pos),
      inClosure: collectCombatTextureUrls(e).includes(e.enemyShip.spec.spriteUrl) };
  });
  assert.equal(initial.imagesValid, true); assert.equal(initial.options, 30); assert.equal(initial.inClosure, true);
  passed.push('all 30 simulator options have decodable hull textures; reinforcement included in asset closure');
  assert.equal(initial.state, 'paused'); assert.equal(initial.visible, true); assert.ok(initial.distance < 3000);
  passed.push('first enemy wave starts near the player, even after time spent in deployment');
  await page.locator('.hud-floating-tag[data-affiliation="enemy"]').locator('.hud-floating-content').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => window.__testHullDraws > 0);
  passed.push('opening hull and HUD are both visible with decoded textures');
  await page.locator('[data-design-trial] > canvas').focus();
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: /增援/ }).click();
  await page.getByRole('button', { name: /野狼/ }).click();
  await page.getByRole('button', { name: '部署', exact: true }).click();
  await page.waitForFunction(() => window.__combatSession.isPresentationReady());
  const reinforcement = await page.evaluate(() => {
    const s=window.__combatSession,e=s.engine;
    const ship=e.capitalShips.find(ship=>ship!==e.enemyShip&&ship.teamId!==e.playerShip.teamId);
    window.__watchShip=ship; window.__enemyEntry=ship.pos.clone();
    s.cameraController.follow=current=>current.copy(ship.pos);
    const tex=s.renderer.textures.getTexture(ship.spec.spriteUrl),batcher=s.renderer.batcher,draw=batcher.drawSprite.bind(batcher);
    window.__reinforcementDraws=0;
    batcher.drawSprite=(...args)=>{if(args[0]===tex)window.__reinforcementDraws++;return draw(...args);};
    return {id:ship.id,edge:Math.abs(ship.pos.y)>6000,visible:ship.isVisibleTo(e.playerShip.teamId)};
  });
  assert.equal(reinforcement.edge,true); assert.equal(reinforcement.visible,false);
  await page.locator('.hud-floating-tag[data-ship-id="'+reinforcement.id+'"]').locator('.hud-floating-content').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__reinforcementDraws),0);
  passed.push('later enemy reinforcements enter at the edge without ghost HUD tags');
  await page.evaluate(async()=>{
    const e=window.__combatEngine,ship=window.__watchShip;
    ship.pos.copy(e.playerShip.pos);ship.pos.y-=1000;ship.prevPos.copy(ship.pos);
    (await import('/src/engine/simulation/systems/CombatVisibility.ts')).updateCombatVisibility(e.ships);
  });
  await page.locator('.hud-floating-tag[data-ship-id="'+reinforcement.id+'"]').locator('.hud-floating-content').waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>window.__reinforcementDraws>0);
  passed.push('entering allied sensor coverage shows both loaded hull and HUD');
  await page.evaluate(async()=>{
    const e=window.__combatEngine,ship=window.__watchShip;ship.pos.copy(window.__enemyEntry);ship.prevPos.copy(ship.pos);
    (await import('/src/engine/simulation/systems/CombatVisibility.ts')).updateCombatVisibility(e.ships);
    window.__reinforcementDraws=0;
  });
  await page.locator('.hud-floating-tag[data-ship-id="'+reinforcement.id+'"]').locator('.hud-floating-content').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__reinforcementDraws),0);
  passed.push('losing contact hides the tag and hull together');
  await page.locator('[data-design-trial] > canvas').focus();
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: /增援/ }).click();
  await page.getByRole('tab', { name: /盟军/ }).click();
  await page.getByRole('button', { name: /锤头/ }).click();
  await page.getByRole('button', { name: '部署', exact: true }).click();
  await page.waitForFunction(() => window.__combatSession.isPresentationReady());
  const ally = await page.evaluate(async () => {
    const s = window.__combatSession, e = s.engine;
    const ship = e.capitalShips.find(ship => ship !== e.playerShip && ship.teamId === e.playerShip.teamId);
    s.cameraController.follow = current => current.copy(ship.pos);
    const { textureCache } = await import('/src/engine/render/TextureCache.ts');
    return { id: ship.id, visible: ship.isVisibleTo(e.playerShip.teamId), far: ship.pos.distanceTo(e.playerShip.pos) > e.playerShip.sightRadius,
      decoded: textureCache.getImageState(ship.spec.spriteUrl), gpuError: s.renderer.gl.getError() };
  });
  assert.equal(ally.visible, true); assert.equal(ally.far, true); assert.equal(ally.decoded, 'decoded'); assert.equal(ally.gpuError, 0);
  await page.locator(`.hud-floating-tag[data-ship-id="${ally.id}"]`).locator('.hud-floating-content').waitFor({ state: 'visible' });
  passed.push('actual Reinforce button deploys distant friendly ships with textures and visible tags');
  const formations=await page.evaluate(async()=>{
    const {CombatSession}=await import('/src/engine/runtime/CombatSession.ts');
    const {simulationRoster,registerSimulationOption}=await import('/src/ui/tactical/SimulationRoster.ts');
    const roster=simulationRoster(),wolf=roster.find(o=>o.id==='wolf_CS'),hammer=roster.find(o=>o.id==='hammerhead_Balanced');
    const entries=[wolf,hammer].map(o=>({specId:registerSimulationOption(o),cost:o.cost}));
    const session=new CombatSession('onslaught'),e=session.engine;e.beginSimulationDeployment(40);e.combatTime=60;
    const [friend]=e.deploySimulationShips([entries[0]],true);
    const first=e.deploySimulationShips(entries,false);
    const [later]=e.deploySimulationShips([entries[0]],false);
    const initial=[e.playerShip,friend,...first];
    const result={friendNear:friend.pos.distanceTo(e.playerShip.pos)<3000,
      firstNear:first.every(s=>s.pos.distanceTo(e.playerShip.pos)<3000),laterEdge:Math.abs(later.pos.y)>6000,
      noOverlap:initial.every((a,i)=>initial.slice(i+1).every(b=>a.pos.distanceTo(b.pos)>=a.spec.collisionRadius+b.spec.collisionRadius+180))};
    session.restart();e.beginSimulationDeployment(40);result.restartNear=e.deploySimulationShips([entries[0]],false)[0].pos.distanceTo(e.playerShip.pos)<3000;
    session.dispose();return result;
  });
  assert.ok(Object.values(formations).every(Boolean),JSON.stringify(formations));
  passed.push('allies-first setup, delayed menus, multi-ship spacing and restart preserve the initial formation');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed, pageErrors: errors }, null, 2));
 } catch(error) {
  console.error(await page.evaluate(()=>({session:window.__combatSession?.state,ready:window.__combatSession?.isPresentationReady(),map:window.__combatEngine?.isTacticalMap,
    tags:[...document.querySelectorAll('.hud-floating-tag')].map(el=>({ship:el.dataset.shipId,style:el.getAttribute('style')})),
    canvas:document.querySelector('[data-design-trial] > canvas')?.getBoundingClientRect().toJSON()})).catch(()=>null));
  throw error;
} finally { await browser.close(); }
