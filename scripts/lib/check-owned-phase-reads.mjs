import assert from 'node:assert/strict';

// Independent copy of the pre-optimization getter, including materialization,
// short-circuit order and Map iterator semantics. This is not production code.
function referenceIsPhased() {
  if (this.parentShip?.isPhased || this.isDocked || this.isRetreated || this.shield.isPhased || this.allSystems.some(system => system.isPhased)) return true;
  for (const effect of this.externalPhaseEffects.values()) if (effect() !== undefined) return true;
  return false;
}

/** Part of the existing void/collision scene, not a separate test project.
 * Enable the same closed-realm mode only after testing its legacy boundary. */
export function checkOwnedPhaseReads(m) {
  const candidate = Object.getOwnPropertyDescriptor(m.Ship.prototype, 'isPhased').get;
  let checks = 0;
  const cases = [];
  const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
  const make = () => Object.assign(Object.create(m.Ship.prototype), {
    parentShip: null, isDocked: false, isRetreated: false, shield: { isPhased: false },
    system: { isPhased: false }, systems: [], defenseSystem: { isPhased: false }, externalPhaseEffects: new Map()
  });
  const compare = (name, setup, reads = 1) => {
    function run(reader) {
      const ship = make(), trace = [], values = [];
      setup(ship, trace);
      for (let i = 0; i < reads; i++) {
        try { values.push(reader.call(ship)); }
        catch (error) { values.push({ error: error.message }); }
      }
      return { trace, values };
    }
    eq(run(candidate), run(referenceIsPhased), name); cases.push(name);
  };
  const reader = (trace, name, read) => ({ get isPhased() { trace.push(name); return read(); } });

  compare('public fields, custom slice/iterator, snapshot and read order unchanged', (s, t) => {
    const main = reader(t, 'main.phase', () => false), defense = reader(t, 'defense.phase', () => true);
    const tail = { [Symbol.iterator]: function* () { t.push('slice.iterator'); yield* []; } };
    const systems = { slice(start) { t.push(['slice', start, this === systems]); return tail; } };
    Object.defineProperties(s, {
      system: { get() { t.push('main.field'); return main; } },
      systems: { get() { t.push('systems.field'); return systems; } },
      defenseSystem: { get() { t.push('defense.field'); return defense; } }
    });
  });
  compare('public getter may throw before any system phase read', (s, t) => {
    Object.defineProperty(s, 'systems', { get() { t.push('systems.field'); throw Error('custom list'); } });
  });
  compare('public array species and iterator remain observable', (s, t) => {
    class List extends Array { static get [Symbol.species]() { t.push('species'); return Array; } }
    s.systems = new List(s.system);
  });
  const publicChecks = checks;
  m.enableWorkerOwnedPhaseReads();

  compare('zero tactical slots still include facade and defense', (s, t) => {
    s.system = reader(t, 'facade', () => false); s.defenseSystem = reader(t, 'defense', () => true);
  });
  compare('systems[0] is not substituted for compatibility facade', (s, t) => {
    s.systems = [reader(t, 'must-not-read', () => true)];
    s.system = reader(t, 'facade', () => false); s.defenseSystem = reader(t, 'defense', () => false);
  });
  compare('truthy first system short-circuits defense phase, but snapshots its reference', (s, t) => {
    s.systems = [s.system]; s.system = reader(t, 'main', () => true);
    s.defenseSystem = reader(t, 'must-not-read', () => { throw Error('late phase'); });
  });
  compare('system reader replacing defense retains this query snapshot and next query is live', (s, t) => {
    s.system = reader(t, 'main', () => { s.defenseSystem = reader(t, 'new-defense', () => true); return false; });
    s.defenseSystem = reader(t, 'old-defense', () => false); s.systems = [s.system];
  }, 2);
  compare('sibling state is live, not a phase-value snapshot', (s, t) => {
    let phase = false;
    s.system = reader(t, 'main', () => { phase = !phase; return false; });
    s.defenseSystem = reader(t, 'defense', () => phase); s.systems = [s.system];
  }, 4);
  compare('nested phase query has independent two-member snapshot', (s, t) => {
    let nested = false;
    s.system = reader(t, 'main', () => {
      if (nested) return false;
      nested = true; s.defenseSystem = reader(t, 'inner-defense', () => true);
      t.push(['inner-result', s.isPhased]); nested = false; return false;
    });
    s.defenseSystem = reader(t, 'outer-defense', () => false); s.systems = [s.system];
  });
  compare('multiple tactical slots retain allSystems materialized membership', (s, t) => {
    const second = reader(t, 'second', () => true);
    s.system = reader(t, 'main', () => { s.systems[1] = reader(t, 'replacement', () => false); return false; });
    s.systems = [s.system, second]; s.defenseSystem = reader(t, 'defense', () => false);
  }, 2);
  compare('sparse extra-system error preserved', s => { s.systems = [s.system]; s.systems.length = 3; });
  compare('own allSystems override and own some receiver are honored', (s, t) => {
    Object.defineProperty(s, 'systems', { get() { throw Error('do-not-touch'); } });
    Object.defineProperty(s, 'allSystems', { get() {
      t.push('allSystems'); const list = [reader(t, 'custom-system', () => true)];
      list.some = function(fn) { t.push(['some', this === list]); return Array.prototype.some.call(this, fn); }; return list;
    } });
  });
  compare('subclass allSystems override is honored', (s, t) => {
    class SubShip extends m.Ship { get allSystems() { t.push('subclass-list'); return [reader(t, 'subclass-phase', () => true)]; } }
    Object.setPrototypeOf(s, SubShip.prototype);
  });
  for (const source of ['parentShip', 'isDocked', 'isRetreated', 'shield']) {
    compare('prefix short-circuit: ' + source, (s, t) => {
      if (source === 'parentShip') s.parentShip = reader(t, 'parent', () => true);
      else if (source === 'shield') s.shield = reader(t, 'shield', () => true);
      else s[source] = true;
      Object.defineProperty(s, 'allSystems', { get() { throw Error('no-list-after-prefix'); } });
    });
  }
  compare('external effects include newly inserted callbacks, skip deletions and retain zero-as-active', (s, t) => {
    const deleted = {};
    s.externalPhaseEffects.set('first', () => {
      t.push('first'); s.externalPhaseEffects.delete(deleted);
      s.externalPhaseEffects.set('inserted', () => { t.push('inserted'); return 0; }); return undefined;
    });
    s.externalPhaseEffects.set(deleted, () => { throw Error('deleted'); });
  }, 2);
  compare('external live state may replace main between queries', (s, t) => {
    s.externalPhaseEffects.set('phase', () => { t.push('external'); s.system = reader(t, 'new-main', () => true); return undefined; });
  }, 2);
  compare('external exception propagated and next read not poisoned', (s, t) => {
    let calls = 0;
    s.externalPhaseEffects.set('phase', () => { t.push(++calls); if (calls === 1) throw Error('external'); return .2; });
  }, 2);
  compare('system exception propagated without reading defense/effects', (s, t) => {
    s.system = reader(t, 'main', () => { throw Error('system'); }); s.systems = [s.system];
    s.defenseSystem = reader(t, 'defense', () => false);
  });

  const real = new m.Ship('phase-contract', m.contentRegistry.getShip('onslaught'));
  const phaseDefinitions = m.shipSystemDefinitions.all().filter(d => d.phase);
  assert(phaseDefinitions.length >= 3);
  let lifecycleReads = 0;
  for (const definition of phaseDefinitions) for (const slot of ['system', 'defenseSystem']) {
    const system = new m.ShipSystem(definition.id, real.spec.maxFlux, real);
    real.system = new m.ShipSystem('NONE', 0, real); real.defenseSystem = new m.ShipSystem('NONE', 0, real);
    real[slot] = system; real.systems = [real.system];
    for (const state of ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN']) for (const active of [false, true]) {
      system.state = state; system.isActive = active;
      const expected = active && (state === 'IN' ? !definition.phase.vulnerableChargeUp
        : state === 'OUT' ? !definition.phase.vulnerableChargeDown : state === 'ACTIVE');
      eq(candidate.call(real), expected, definition.id + '/' + slot + '/' + state + '/' + active);
      eq(candidate.call(real), referenceIsPhased.call(real)); lifecycleReads++;
    }
  }
  real.system = new m.ShipSystem('NONE', 0, real); real.defenseSystem = new m.ShipSystem('NONE', 0, real); real.systems = [real.system];
  real.shield = new m.Shield('PHASE', 360, 100, 1, 0);
  for (const state of ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN']) for (const level of [0, .49, .5, .51, 1]) {
    real.shield.phaseState = state; real.shield.phaseEffectLevel = level;
    eq(candidate.call(real), referenceIsPhased.call(real)); lifecycleReads++;
  }
  const root = make(), child = make(), grandchild = make(); child.parentShip = root; grandchild.parentShip = child;
  for (const active of [true, false, true, false]) {
    root.system.isPhased = active;
    eq(candidate.call(grandchild), active, 'parent phase remains live through module tree');
  }
  const lists = [real.allSystems, real.allSystems]; assert.notEqual(lists[0], lists[1]); checks++;
  lists[0].length = 0; eq(real.allSystems.length, 2, 'public allSystems remains a fresh mutable list, not a pool/cache');
  const result = { checks, publicChecks, lifecycleReads, phaseDefinitions: phaseDefinitions.map(d => d.id), cases, enabledForExistingScene: true };
  console.log('PASS owned phase reads: ' + checks + ' checks'); return result;
}
