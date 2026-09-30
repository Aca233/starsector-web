import { assetManager } from '../../src/engine/assets/AssetResolver';
import { contentManifestManager } from '../../src/engine/content/ContentManifest';
// Existing Offscreen/LAN fixture: no input injection, authority hooks or desktop.
import { CombatHudProjector, HudContactRecord } from '../../src/engine/runtime/CombatHudView';
import { TacticalMapViewProjector } from '../../src/engine/runtime/TacticalMapView';
import { DeploymentViewProjector } from '../../src/engine/runtime/DeploymentView';
import { Vector2 } from '../../src/engine/math/Vector2';
import { createLanPresentationViews } from '../../src/network/LanPresentationViews';
import { lanTeamPresence } from '../../src/network/LanBattleRoster';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { applyLanDisplaySnapshots } from '../../src/network/LanDisplaySnapshot';
import { decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';

function assert(value, message) { if (!value) throw Error(message); }
// Values, prototypes AND aliases, including NaN/Infinity/undefined. Not just JSON
// of a structuredClone (which would hide lost Vector2/HudContact capabilities).
function graph(value) {
  const seen = new Map();
  const visit = v => {
    if (v === undefined) return ['undefined'];
    if (typeof v === 'number') return ['number', Object.is(v, -0) ? '-0' : String(v)];
    if (typeof v === 'function') throw Error('Executable HUD field');
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return ['ref', seen.get(v)];
    const id = seen.size; seen.set(v, id);
    const type = Object.getPrototypeOf(v)?.constructor?.name ?? null;
    if (v instanceof Map) return [id, type, [...v].map(([k, x]) => [visit(k), visit(x)])];
    if (v instanceof Set) return [id, type, [...v].map(visit)];
    return [id, type, Object.keys(v).sort().map(k => [k, visit(v[k])])];
  };
  return JSON.stringify(visit(value));
}
function equal(a, b, label) { assert(graph(a) === graph(b), 'Presentation differs: ' + label); }
const unbase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const stats = rows => { const sorted = [...rows].sort((a,b) => a-b); return { mean: rows.reduce((a,b)=>a+b,0)/rows.length, p50: sorted[Math.floor(rows.length*.5)], p95: sorted[Math.floor(rows.length*.95)] }; };

export async function checkLanPresentationViews(data) {
  await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
  const first = decodeBinaryFrame(unbase64(data.cases[0].wire));
  const world = createLanDisplayWorld(data.match, 0, first).world;
  const views = createLanPresentationViews(data.match, world);
  const reference = new CombatHudProjector(), optimized = new CombatHudProjector();
  const map = new TacticalMapViewProjector(), deployment = new DeploymentViewProjector();
  let cases = 0;
  for (const c of data.cases) {
    applyLanDisplaySnapshots(world, [decodeBinaryFrame(unbase64(c.wire))], true);
    // No locked target in the neutral-input fixture; exercise the rich target
    // projection directly without sending any controls into the live battle.
    for (const target of [null, world.enemyShip.id, world.playerShip.id, 'missing']) {
      world.playerShip.playerTargetId = target;
      await Promise.resolve();
      const expected = reference.capture(world);
      equal(expected, optimized.captureReadonly(world), c.name + '/direct');
      // Materialize the live facade in one task; the public proxy itself has no keys.
      equal(expected, Object.fromEntries(Object.keys(expected).map(k => [k, views.hud[k]])), c.name + '/port');
      assert(views.hud.playerShip instanceof HudContactRecord && views.hud.playerShip.pos instanceof Vector2, 'HUD prototypes lost');
      assert(views.hud.playerShip === views.hud.ships.find(s => s.id === world.playerShip.id), 'HUD player alias lost');
      equal(map.capture(world), views.map.read(), c.name + '/map');
      equal(deployment.capture(world), views.deployment.read(), c.name + '/deployment');
      equal(lanTeamPresence(data.match, world), views.presence(), c.name + '/presence');
      cases++;
    }
  }
  // Full state changes are visible on the next microtask; no 100ms HUD clock.
  world.playerShip.playerTargetId = world.enemyShip.id;
  await Promise.resolve();
  const oldHp = views.hud.playerShip.hullHp;
  world.playerShip.hullHp = oldHp - 1;
  assert(views.hud.playerShip.hullHp === oldHp, 'Microtask lifetime changed');
  await Promise.resolve();
  assert(views.hud.playerShip.hullHp === oldHp - 1, 'HUD did not refresh next microtask');
  world.playerShip.hullHp = oldHp;
  // Mutable display definitions/geometry/weapon state are not cross-capture caches.
  const player = world.playerShip, spec = player.spec, weapons = player.weapons;
  player.spec = { ...spec, spriteUrl: spec.spriteUrl + '?view-test' };
  player.pos.x += 13; player.prevPos.y -= 7;
  player.weapons = weapons.map((mount, i) => i ? mount : { ...mount, ammo: mount.ammo + 1 });
  await Promise.resolve();
  const mutable = reference.capture(world);
  equal(mutable, optimized.captureReadonly(world), 'mutable-direct');
  equal(mutable, Object.fromEntries(Object.keys(mutable).map(k => [k, views.hud[k]])), 'mutable-port');
  player.spec = spec; player.pos.x -= 13; player.prevPos.y += 7; player.weapons = weapons;
  // Duplicated source identities keep all array slots and aliases.
  world.reinforcements.push(world.playerShip);
  equal(reference.capture(world), optimized.captureReadonly(world), 'duplicate-roster');
  world.reinforcements.pop();
  // Unknown/custom sources still use the original repeated live reads by default.
  const descriptor = Object.getOwnPropertyDescriptor(world.playerShip, 'systems');
  let reads = 0;
  Object.defineProperty(world.playerShip, 'systems', { configurable: true, get() { reads++; return descriptor.value; } });
  reference.capture(world); const referenceReads = reads;
  reads = 0; optimized.captureReadonly(world); const optimizedReads = reads;
  Object.defineProperty(world.playerShip, 'systems', descriptor);
  assert(referenceReads > 1 && optimizedReads === 1, 'Contact work not deduplicated, or generic path changed');
  // Observer commands must never be confused with authority commands.
  const orders = graph(world.orders);
  for (const command of [{action:'order',unitId:'fleet',order:{type:'RETREAT'}}, {action:'target',targetId:world.enemyShip.id}, {action:'retreat',unitIds:[world.playerShip.id],full:true}])
    assert(!views.tactical(command).accepted, 'Authority command escaped observer boundary');
  assert(!views.tactical({action:'select',unitId:world.enemyShip.id}).accepted, 'Enemy selection accepted');
  assert(views.tactical({action:'select',unitId:world.playerShip.id}).accepted && world.selectedUnitId === world.playerShip.id, 'Friendly selection lost');
  world.isTacticalMap = true;
  assert(views.tactical({action:'close'}).accepted && !world.isTacticalMap, 'Close map lost');
  assert(graph(world.orders) === orders, 'Observer changed authority orders');
  const samples = { reference: [], readonly: [] };
  // Batched captures are timing granularity only, not reduced publication rate.
  // Both paths read identical live records; alternate order, exclude warm-up.
  for (let i = 0; i < 220; i++) for (const name of i % 2 ? ['readonly','reference'] : ['reference','readonly']) {
    const start = performance.now();
    for (let n = 0; n < 8; n++) {
      const hud = name === 'reference' ? reference.capture(world) : optimized.captureReadonly(world);
      assert(hud.playerShip.hullHp === world.playerShip.hullHp, 'Stale benchmark view');
    }
    if (i >= 40) samples[name].push((performance.now() - start) / 8);
  }
  views.dispose(); views.dispose();
  assert(!views.tactical({action:'close'}).accepted, 'Disposed command accepted');
  let rejectedReads = 0;
  for (const read of [() => views.hud.playerShip, () => views.map.read(), () => views.deployment.read(), () => views.presence()]) {
    try { read(); } catch { rejectedReads++; }
  }
  assert(rejectedReads === 4, 'Disposed view remained live');
  return { cases, prototypesAndAliases: true, microtaskRefresh: true, duplicateRoster: true,
    genericReads: referenceReads, readonlyReads: optimizedReads, observerCommands: true, rejectedReads,
    ships: world.ships.length, captureMs: {reference: stats(samples.reference), readonly: stats(samples.readonly)}, samples,
    scope: 'Same-realm UI projection only, not full frame time, simulation speed, transport clone, input latency or Worker integration' };
}
