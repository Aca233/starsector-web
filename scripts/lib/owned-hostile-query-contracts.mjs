import assert from 'node:assert/strict';

export function checkOwnedHostileQueries(lab, fixture) {
  const { createOwnedHostileQueries: create, FireControlQueryRoster: Roster } = lab;
  let queries = 0, batches = 0, publisherStates = 0;
  const f = fixture();
  assert.equal(create(f.engine, f.ships), undefined, 'no ambient optimization for a public engine');
  Roster.ownForWorker(f.engine);
  for (const s of f.ships) { s.visibilityMask = 0x7fffffff; s.visibilityOverflow = '*'; s.currentTargetShip = null; }
  const state = () => [f.engine.random.checkpointWitness(), f.engine.visualRandom.checkpointWitness(),
    f.ships.map(s => [s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.currentTargetShip?.id, s.hullHp, s.flux.totalFlux])];
  const checkBatch = label => {
    const batch = create(f.engine, f.ships); assert.ok(batch, label); batches++;
    const initial = state();
    try {
      for (const ship of f.ships) for (const id of [undefined, f.target.id, f.ship.id, 'absent', '']) {
        assert.equal(batch.forShip(ship, f.ships), batch);
        assert.equal(batch.find(ship, id), f.engine.findHostile(ship, id, f.ships), label); queries++;
      }
      assert.ok(batch.teams.size <= new Set(f.ships.map(s => s.teamId)).size);
      // The memberships are shared, but both motion and preferred-target changes
      // inside this read phase must still be observed on the very next query.
      const x = f.target.pos.x; f.target.pos.x = -20000;
      assert.equal(batch.find(f.ship), f.engine.findHostile(f.ship, undefined, f.ships)); queries++;
      f.target.pos.x = x;
      f.ship.currentTargetShip = f.target;
      assert.equal(batch.find(f.ship), f.engine.findHostile(f.ship, undefined, f.ships)); queries++;
      f.ship.currentTargetShip = null;
      assert.equal(batch.forShip(f.ship, [...f.ships]), undefined);
      assert.equal(batch.find({ ...f.ship }), undefined, 'foreign shooter never inherits this qualification');
    } finally { batch.close(); }
    assert.equal(batch.ships, undefined); assert.equal(batch.members.size, 0); assert.equal(batch.teams.size, 0);
    assert.equal(batch.forShip(f.ship, f.ships), undefined); assert.equal(batch.find(f.ship), undefined);
    assert.deepEqual(state(), initial, 'query transaction must not change authoritative state or RNG/' + label);
  };
  checkBatch('native');
  for (let i = 0; i < f.ships.length; i++) {
    const s = f.ships[i]; s.teamId = i % 3 === 2 ? 40 : i % 3;
    s.visibilityMask = i % 7 ? 3 : 0; s.visibilityOverflow = i % 5 ? '*' : '';
  }
  checkBatch('multiteam+overflow+fog');
  for (const s of f.ships) s.pos.set(0, -0);
  checkBatch('exact ties');
  f.target.pos.set(Infinity, Infinity); f.ships[2].pos.set(NaN, 0); f.ships[3].pos.set(Number.MAX_VALUE, -Number.MAX_VALUE);
  checkBatch('nonfinite+overflow');
  f.target.isDead = true; checkBatch('fresh death'); f.target.isDead = false;
  const specs = f.ships.map(s => s.spec);
  try {
    for (let i = 0; i < f.ships.length; i++) f.ships[i].spec = lab.immutableCopy({ ...specs[i], hullSize: 'FIGHTER' });
    checkBatch('fighter-only fallback');
    f.target.spec = specs[1]; checkBatch('major ship priority');
    f.target.spec = lab.immutableCopy({ ...specs[1], builtInHullMods: ['vastbulk'] });
    checkBatch('vast bulk excluded');
  } finally { for (let i = 0; i < f.ships.length; i++) f.ships[i].spec = specs[i]; }
  const batch = create(f.engine, f.ships); assert.ok(batch);
  f.ships.push(f.ship); assert.equal(batch.forShip(f.ship, f.ships), undefined); assert.equal(batch.find(f.ship), undefined); f.ships.pop(); batch.close();
  assert.equal(create(f.engine, [...f.ships].reverse()), undefined, 'stale roster order must fall back');
  const replace = (o, key, value) => { const previous = o[key]; o[key] = value; return () => { o[key] = previous; }; };
  for (const [object, key, value] of [[f.target, 'teamId', NaN], [f.target, 'spec', { ...f.target.spec }],
    [f.target.system, 'definition', { ...f.target.system.definition }], [f.target, 'sourceCarrier', f.ship]]) {
    const undo = replace(object, key, value);
    try { assert.equal(create(f.engine, f.ships), undefined, key); } finally { undo(); }
  }
  f.target.externalPhaseEffects.set(f, () => undefined);
  assert.equal(create(f.engine, f.ships), undefined); f.target.externalPhaseEffects.delete(f);
  f.target.runtimeModifiers.set('test', { collisionDisabled: 1 });
  assert.equal(create(f.engine, f.ships), undefined); f.target.runtimeModifiers.delete('test');
  f.engine.findHostile = function() { throw Error('custom method must not be called by admission'); };
  assert.equal(create(f.engine, f.ships), undefined); delete f.engine.findHostile;
  Object.defineProperty(f.engine, 'ships', { configurable: true, get() { throw Error('custom roster getter must not be called by admission'); } });
  assert.equal(create(f.engine, f.ships), undefined); delete f.engine.ships;
  for (const count of [63, 64]) {
    const g = fixture(); g.engine.reinforcements.splice(count - 2); Roster.ownForWorker(g.engine);
    const b = create(g.engine); assert.equal(!!b, count === 64); b?.close();
  }

  const g = fixture(); g.ships.forEach(s => { s.visibilityMask = 3; s.currentTargetShip = null; });
  const ais = [new lab.CapitalShipAI(g.ship, g.target), ...g.engine.getNativeAIs()];
  const Reference = lab.BeforePublisher ?? lab.Publisher;
  const old = new Reference(g.ships, ais), next = new lab.Publisher(g.ships, ais, create);
  const normalize = frame => {
    const packet = p => ({ count: p.count, dictionary: [...p.dictionary], values: Array.from(new Float64Array(p.values, 0, p.count)), tags: Array.from(new Uint8Array(p.tags, 0, p.count)) });
    return { ...frame, control: Array.from(new Int32Array(frame.control)), own: packet(frame.own), world: packet(frame.world), projectiles: packet(frame.projectiles) };
  };
  const publish = label => {
    const a = normalize(old.publish(g.engine, ais, 1 / 60)), b = normalize(next.publish(g.engine, ais, 1 / 60));
    assert.deepEqual(b, a, 'all valid packet values and metadata/' + label);
    assert.equal(next.matches(g.engine, ais, 1 / 60), old.matches(g.engine, ais, 1 / 60));
    publisherStates++;
  };
  publish('generic'); Roster.ownForWorker(g.engine); publish('owned');
  const invalidations = [
    () => replace(g.target.pos, 'x', g.target.pos.x + 37),
    () => replace(g.target, 'teamId', g.ship.teamId),
    () => replace(g.target, 'visibilityMask', 0),
    () => replace(g.target, 'currentTargetShip', g.ship),
    () => replace(g.target, 'isDead', true),
    () => { g.engine.findHostile = () => g.ship; return () => { delete g.engine.findHostile; }; },
  ];
  for (let i = 0; i < invalidations.length; i++) {
    publish('before-change-' + i); const undo = invalidations[i]();
    try { assert.equal(old.matches(g.engine, ais, 1 / 60), false); assert.equal(next.matches(g.engine, ais, 1 / 60), false, 'do not weaken after-await validation'); }
    finally { undo(); }
    publish('restored-' + i);
  }
  // Custom paths are still fully observable, including default-argument roster reads.
  const nativeFind = g.engine.findHostile; let calls = [];
  g.engine.findHostile = function(...args) { calls.push([args[0].id, args.length]); return nativeFind.apply(this, args); };
  const a = normalize(old.publish(g.engine, ais, 1 / 60)), oldCalls = calls; calls = [];
  const b = normalize(next.publish(g.engine, ais, 1 / 60)); assert.deepEqual(b, a); assert.deepEqual(calls, oldCalls);
  assert.equal(calls.length, g.ships.length); delete g.engine.findHostile;
  const getter = Object.getOwnPropertyDescriptor(lab.CombatEngine.prototype, 'ships').get;
  let reads = 0;
  Object.defineProperty(g.engine, 'ships', { configurable: true, get() { reads++; return getter.call(this); } });
  normalize(old.publish(g.engine, ais, 1 / 60)); const oldReads = reads; reads = 0;
  normalize(next.publish(g.engine, ais, 1 / 60)); assert.equal(reads, oldReads); delete g.engine.ships;

  const h = fixture(); Roster.ownForWorker(h.engine);
  const captured = [], createBatch = lab.HostileQueryBatch.create;
  lab.HostileQueryBatch.create = function(...args) { const b = createBatch.apply(this, args); if (b) captured.push(b); return b; };
  try { h.engine.fixedUpdate(1 / 60); } finally { lab.HostileQueryBatch.create = createBatch; }
  assert.equal(captured.length, 1, 'real native AI phase actually builds one shared transaction');
  for (const b of captured) { assert.equal(b.ships, undefined); assert.equal(b.members.size, 0); assert.equal(b.teams.size, 0); }
  return { queries, batches, publisherStates, frozenPublisher: !!lab.BeforePublisher, livePositionsAndPreference: true,
    fullValidation: true, genericReadOrder: true, nativePhaseClosed: true };
}
