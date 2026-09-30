/** Focused pack regression; uses the existing simulation, not a mock game. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const directory = resolve('artifacts/zhuyuan');
await mkdir(directory, { recursive: true });
const outfile = resolve(directory, 'pack-check.mjs');
await build({ stdin: { contents: `
export * from './src/engine/content/ZhuYuanPack';
export { Ship } from './src/engine/simulation/Ship';
export { CombatEngine } from './src/engine/simulation/CombatEngine';
export { Vector2 } from './src/engine/math/Vector2';
export { SimulationRandom } from './src/engine/simulation/SimulationRandom';
export { modManager } from './src/engine/modding/ModManager';
export { assetManager } from './src/engine/assets/AssetResolver';
export { i18n } from './src/engine/i18n/LocalizationManager';
export { createDesign, decodeDesign, evaluate, registerPrototype, budget, hulls, weapons, isBuiltIn } from './src/studio/DesignModel';
export { isPointInPolygon, segmentPolygonEntry } from './src/engine/math/Geometry';
export { hasNativeSystemStats } from './src/engine/extensions/ship-systems/Registry';
export { RenderShipProjection } from './src/engine/runtime/local/RenderShipProjection';
`, resolveDir: process.cwd(), loader: 'ts' }, outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  define: { 'import.meta.env.BASE_URL': JSON.stringify('/') }, logLevel: 'warning' });
const m = await import(pathToFileURL(outfile).href);
let passed = 0;
function test(name, fn) { fn(); console.log(`ok ${++passed} - ${name}`); }
const manifest = JSON.parse(await readFile('public/game-assets/asset-manifest.json', 'utf8'));
await m.assetManager.loadManifest('data:application/json;base64,' + Buffer.from(JSON.stringify(manifest)).toString('base64'));
for (const asset of manifest.filter(row => row.path.includes('web_zhuyuan'))) {
  const bytes = await readFile(resolve('public/game-assets', asset.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash);
  assert.equal(bytes.byteLength, asset.bytes);
}
const hull = m.modManager.requireShip(m.ZHUYUAN_HULL_ID);
const standard = m.createDesign(hull.id);
const evaluated = m.evaluate(standard);
test('registered pack, asset closure and removable default fit', () => {
  m.modManager.validateShipDefinition(hull, { allowExistingId: true, requireBundledAssets: true });
  assert(m.hulls.some(s => s.id === hull.id)); assert(m.weapons.some(w => w.id === m.STAR_NEEDLE_ID));
  assert.equal(m.i18n.t(m.starNeedle.nameKey), '缝星针');
  assert.deepEqual(evaluated.errors, []); assert(m.budget(standard).remaining >= 0);
  assert.equal(Object.values(standard.weapons).filter(id => id === m.STAR_NEEDLE_ID).length, 3);
  assert(hull.weaponSlots.every(slot => !m.isBuiltIn(hull.id, slot.slotId)));
  assert(Object.values(m.createDesign(hull.id, 'empty').weapons).every(id => id === null));
  assert.deepEqual(m.evaluate(m.decodeDesign(JSON.parse(JSON.stringify(standard)))).errors, []);
  const prototype = m.modManager.requireShip(m.registerPrototype(standard));
  assert.equal(prototype.sourceHullId, hull.id);
});
test('fork remains concave; mounts/nozzles match new geometry; native hull untouched', () => {
  assert.equal(m.isPointInPolygon(new m.Vector2(150, 0), hull.bounds), false);
  assert.equal(m.isPointInPolygon(new m.Vector2(0, 0), hull.bounds), true);
  assert.equal(m.segmentPolygonEntry(new m.Vector2(230, 0), new m.Vector2(125, 0), hull.bounds), null);
  for (const slot of hull.weaponSlots) assert(m.isPointInPolygon(slot, hull.bounds), slot.slotId);
  assert.equal(hull.engineSlots.length, 5);
  assert(hull.bounds.every(([x,y]) => Math.hypot(x,y) <= hull.collisionRadius));
  assert.equal(m.modManager.requireShip('aurora').hitpoints, 8000);
  assert(!m.modManager.requireShip('aurora').spriteUrl.includes('web_zhuyuan'));
});
const ship = new m.Ship('zhuyuan-check', evaluated.spec, true, new m.Vector2(), 0, new m.SimulationRandom(911));
test('Eclipse flux scaling and lifecycle remove every buff/debuff', () => {
  const s = ship.system;
  assert.equal(m.hasNativeSystemStats(s.definition), true);
  assert.equal(s.hasNativeThreatPhaseAI, false);
  assert.equal(s.enableOwnedNativeModifiers(), false, 'flux-dependent modifiers must not enter the lifecycle-only cache');
  const projection = new m.RenderShipProjection();
  assert.equal(projection.supports([ship]), true);
  assert.equal(projection.project(ship).spec.id, ship.spec.id);
  assert.equal(s.fluxCostPerUse, 900); assert.equal(s.generatesHardFlux, true);
  assert.equal(s.activate(), true); assert.equal(s.activate(), false); s.update(.4);
  assert.equal(s.state, 'ACTIVE');
  ship.flux.softFlux = 0; assert.equal(s.getWeaponDamageMultiplier('ENERGY'), 1.25);
  ship.flux.softFlux = 11250; assert.equal(s.getWeaponDamageMultiplier('ENERGY'), 2);
  assert.equal(s.getWeaponDamageMultiplier('BALLISTIC'), 1); assert.equal(s.getWeaponDamageMultiplier('MISSILE'), 1);
  assert.equal(s.getProjectileSpeedPercent('ENERGY'), 60); assert.equal(s.getWeaponRangePercent('ENERGY'), 20);
  assert.equal(s.getDissipationMultiplier(), .5); assert.equal(s.getShieldDamageMultiplier(), 1.3); assert.equal(s.getSpeedPercentBonus(), -35);
  assert.equal(s.consumePendingActivationFlux(), 900); assert.equal(s.consumePendingActivationFlux(), 0);
  s.update(5.6); assert.equal(s.state, 'COOLDOWN');
  assert.equal(s.getWeaponDamageMultiplier('ENERGY'), 1); assert.equal(s.getShieldDamageMultiplier(), 1);
  assert.equal(s.getDissipationMultiplier(), 1); assert.equal(s.getSpeedPercentBonus(), 0);
  assert.equal(s.getWeaponRangePercent('ENERGY'), 0); assert.equal(s.getProjectileSpeedPercent('ENERGY'), 0);
  s.update(16); assert.equal(s.state, 'IDLE'); s.reset();
});
test('skill cannot install on unrelated hulls; unusable weapons and overload reject activation', () => {
  const other = m.createDesign('hammerhead'); other.systemTypes = [m.ECLIPSE_PROTOCOL_ID];
  assert(m.evaluate(other).errors.some(e => e.includes('烛渊')));
  ship.flux.softFlux = 0; ship.flux.isOverloaded = true; assert.equal(ship.system.activate(), false); ship.flux.isOverloaded = false;
  ship.flux.isVenting = true; assert.equal(ship.system.activate(), false); ship.flux.isVenting = false;
  for (const w of ship.weapons) w.isDisabled = true;
  assert.equal(ship.system.activate(), false);
});
test('actual combat dispatch spends hard flux and spawns three-barrel projectiles', () => {
  const engine = new m.CombatEngine(hull.id, 'hammerhead', 30119);
  engine.asteroids.length = 0; engine.nebulae.length = 0;
  const own = engine.playerShip, enemy = engine.enemyShip;
  own.pos.set(0,0); own.facingRad = 0; enemy.pos.set(600,0); enemy.facingRad = Math.PI;
  own.shield.setActive(false); own.flux.softFlux = 4000;
  assert.equal(own.system.activate(), true); engine.fixedUpdate(1/60);
  assert(own.flux.hardFlux > 880 && own.flux.hardFlux <= 900);
  const projectiles = new Map();
  for (let tick=0; tick<180; tick++) {
    own.isFiringMain = true; own.aimTargetWorld.set(enemy.pos.x,enemy.pos.y);
    engine.fixedUpdate(1/60);
    for (const p of engine.projectiles) if (p.sourceShipId === own.id && p.specId === m.STAR_NEEDLE_ID) projectiles.set(p.id,Math.max(projectiles.get(p.id) ?? 0,p.damage));
  }
  assert(projectiles.size >= 9, `only ${projectiles.size} projectiles`);
  assert([...projectiles.values()].some(damage => damage > 220));
  assert.equal(own.system.type, m.ECLIPSE_PROTOCOL_ID);
  assert(!own.isDead);
});
console.log(`Zhu Yuan: ${passed} focused checks passed.`);


