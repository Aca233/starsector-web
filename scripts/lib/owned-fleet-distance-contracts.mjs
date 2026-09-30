import assert from 'node:assert/strict';

/** Existing fleet-focus suite; pure test instrumentation, never shipped to Workers. */
export function checkOwnedFleetDistances(lab) {
  const { Ship, Vector2, CombatEngine, modManager, planFleetTactics: plan } = lab;
  const before = lab.BeforePlanFleetTactics ?? ((ships, orders, manual) => plan(ships, orders, manual));
  let comparisons = 0, reduced = 0, fallbacks = 0;
  const examples = [];
  const make = (count = 100) => {
    const engine = new CombatEngine('onslaught', 'onslaught', 917);
    for (let i = 2; i < count; i++) engine.addShip('onslaught', i % 2 === 0, new Vector2(), 0);
    const ships = engine.ships;
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i]; s.pos.set((i % 13) * 160 - 900, Math.floor(i / 13) * 170 - 600);
      s.visibilityMask = 7; s.fireControlMode = 'AI'; s.currentTargetShip = null;
    }
    return { engine, ships, orders: new Map(), manual: new Set() };
  };
  const state = f => [f.engine.random.checkpointWitness(), f.engine.visualRandom.checkpointWitness(),
    f.ships.map(s => [s.id, s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.hullHp, s.flux.totalFlux,
      s.currentTargetShip?.id, s.throttle, s.strafeInput, s.brakeInput, s.fireControlMode])];
  const trace = (fn, f, owned) => {
    const original = Vector2.prototype.distanceTo; let reads = 0;
    Vector2.prototype.distanceTo = function(v) { reads++; return original.call(this, v); };
    try { return { result: fn(f.ships, f.orders, f.manual, owned), reads }; }
    finally { Vector2.prototype.distanceTo = original; }
  };
  const compare = (f, label, expectCache = true) => {
    const initial = state(f), old = trace(before, f, false), generic = trace(plan, f, false), owned = trace(plan, f, true);
    assert.deepEqual(generic.result, old.result, 'generic/' + label);
    assert.equal(generic.reads, old.reads, 'generic observable read count/' + label);
    assert.deepEqual(owned.result, old.result, 'owned/' + label);
    assert.deepEqual(state(f), initial, 'planner cannot change world/RNG/' + label);
    if (expectCache) { assert.ok(owned.reads < old.reads, 'cache must actually avoid distance work/' + label); reduced++; }
    else { assert.equal(owned.reads, old.reads, 'must fall back/' + label); fallbacks++; }
    comparisons++;
    if (examples.length < 8) examples.push({ label, before: old.reads, owned: owned.reads });
    return owned.result;
  };

  const f = make();
  assert.ok(f.ships.every(lab.hasOwnedFireControlReadHooks));
  compare(f, 'native100');
  f.manual = new Set(f.ships.filter((_, i) => i % 7 === 0).map(s => s.id));
  for (let i = 0; i < f.ships.length; i++) {
    const s = f.ships[i], target = f.ships[(i + 1) % f.ships.length];
    if (i % 11 === 0) f.orders.set(s.id, { type: 'ENGAGE', targetShipId: target.id });
    if (i % 11 === 1) f.orders.set(s.id, { type: 'AVOID', targetShipId: target.id });
    if (i % 11 === 2) f.orders.set(s.id, { type: 'DEFEND', targetPos: new Vector2(120, -80) });
    if (i % 11 === 3) f.orders.set(s.id, { type: 'ESCORT', targetShipId: f.ships[(i + 2) % f.ships.length].id });
    if (i % 3 === 0) s.currentTargetShip = target;
  }
  compare(f, 'manual+orders+commitments');
  for (let i = 0; i < f.ships.length; i++) {
    const s = f.ships[i]; s.teamId = i % 3;
    s.visibilityMask = i % 5 ? 7 : 1;
    if (i % 13 === 0) s.flux.softFlux = s.flux.maxFlux * .8;
    if (i % 17 === 0) s.hullHp *= .2;
    if (i % 19 === 0) s.retreating = true;
  }
  compare(f, 'three-teams+hidden+flux+hull+retreat');
  for (const s of f.ships) s.pos.set(0, -0);
  compare(f, 'exact-ties+signed-zero');
  f.ships[10].pos.set(Number.MAX_VALUE, -Number.MAX_VALUE);
  f.ships[11].pos.set(Number.MIN_VALUE, -Number.MIN_VALUE);
  f.ships[12].pos.set(Infinity, Infinity); f.ships[13].pos.set(NaN, 0);
  compare(f, 'overflow+subnormal+infinity+NaN');
  f.ships.reverse(); compare(f, 'reordered');
  f.ships.push(f.ships[20]); compare(f, 'duplicate-identity'); f.ships.pop();
  const id = f.ships[30].id; f.ships[30].id = f.ships[31].id;
  compare(f, 'duplicate-id'); f.ships[30].id = id;
  for (let i = 0; i < 8; i++) { f.ships[i].hullHp = 0; f.ships[i + 8].isDocked = true; }
  compare(f, 'dead+docked');
  compare(make(), 'different-fleet-same-buffer');

  const g = make(513);
  for (const count of [63, 64, 512, 513, 64]) compare({ ...g, ships: g.ships.slice(0, count) }, 'size-' + count, count >= 64 && count <= 512);
  // Gate every input, not just active rows: a dead entry with foreign readers is
  // deliberately a conservative rejection, even though no distance reaches it.
  const s = g.ships.at(-1); s.hullHp = 0; s.runtimeModifiers.set('test', { collisionDisabled: 1 });
  compare(g, 'dead-input-with-foreign-effects', false); s.runtimeModifiers.delete('test');
  compare(g, 'eligible-active-count512');

  const h = make(), last = h.ships.at(-1);
  const replace = (o, key, value) => () => { const previous = o[key]; o[key] = value; return () => { o[key] = previous; }; };
  const reject = (label, install) => {
    const undo = install();
    try { assert.equal(lab.hasOwnedFireControlReadHooks(last), false, label); compare(h, label, false); }
    finally { undo(); }
    compare(h, label + '-restored');
  };
  reject('external-phase', () => { last.externalPhaseEffects.set(h, () => undefined); return () => last.externalPhaseEffects.delete(h); });
  reject('external-damage', () => { last.damageTakenModifiers.set('test', () => 1); return () => last.damageTakenModifiers.delete('test'); });
  reject('runtime-modifier', () => { last.runtimeModifiers.set('test', { collisionDisabled: 1 }); return () => last.runtimeModifiers.delete('test'); });
  reject('foreign-system', replace(last.system, 'definition', { ...last.system.definition }));
  reject('foreign-defense', replace(last.defenseSystem, 'definition', { ...last.defenseSystem.definition }));
  reject('broken-auxiliary', replace(last.system, 'auxiliary', undefined));
  reject('metadata', replace(last, 'spec', { ...last.spec }));
  reject('armor-reader', replace(last.armor, 'damageTakenModifiers', () => ({ armor: 1, hull: 1 })));
  reject('parent', replace(last, 'parentShip', h.ships[0]));
  reject('carrier', replace(last, 'sourceCarrier', h.ships[0]));
  reject('extra-system', () => { last.systems.push(last.defenseSystem); return () => last.systems.pop(); });

  // Same generic observable read sequence, including mutation and getter reads.
  const observable = fn => {
    const events = [], ships = Array.from({ length: 4 }, (_, i) => new Ship('obs-' + i,
      modManager.requireShip('hammerhead'), i % 2 === 0, new Vector2(i * 140, i * -10), 0));
    const positions = ships.map(s => s.pos), native = Vector2.prototype.distanceTo;
    ships.forEach((s, i) => {
      const pos = positions[i]; s.visibilityMask = 3;
      pos.distanceTo = function(v) { events.push(['distance', i, positions.indexOf(v)]); this.x += .125; return native.call(this, v); };
      Object.defineProperty(s, 'pos', { configurable: true, get() { events.push(['pos', i]); return pos; } });
    });
    return { result: fn(ships), events, positions: positions.map(p => [p.x, p.y]) };
  };
  assert.deepEqual(observable(plan), observable(before), 'default API keeps callbacks and read order');

  const outer = make(), inner = make(64), original = Vector2.prototype.distanceTo;
  const expectedOuter = before(outer.ships), expectedInner = before(inner.ships); let nested = false, innerResult;
  Vector2.prototype.distanceTo = function(v) {
    if (!nested) { nested = true; innerResult = plan(inner.ships, inner.orders, inner.manual, true); }
    return original.call(this, v);
  };
  try { assert.deepEqual(plan(outer.ships, outer.orders, outer.manual, true), expectedOuter); }
  finally { Vector2.prototype.distanceTo = original; }
  assert.ok(nested); assert.deepEqual(innerResult, expectedInner, 'nested borrow falls back without clobbering outer cells');
  Vector2.prototype.distanceTo = function() { throw Error('test-distance-throw'); };
  try { assert.throws(() => plan(outer.ships, outer.orders, outer.manual, true), /test-distance-throw/); }
  finally { Vector2.prototype.distanceTo = original; }
  compare(outer, 'lease-returned-after-throw');

  // Verify the engine entry point grants no ambient optimization to generic engines.
  const ordinary = trace(() => h.engine.planFleetAI(), h, false);
  lab.FireControlQueryRoster.ownForWorker(h.engine);
  const owned = trace(() => h.engine.planFleetAI(), h, true);
  assert.deepEqual(owned.result, ordinary.result); assert.ok(owned.reads < ordinary.reads);
  return { comparisons, reduced, fallbacks, examples, frozenReference: !!lab.BeforePlanFleetTactics,
    genericReadOrder: true, nestedBorrow: true, exceptionRelease: true, engineOwnership: true };
}
