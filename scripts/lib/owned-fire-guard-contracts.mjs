import assert from 'node:assert/strict';

/** The frozen old predicate is injected by loadCombatLab when the environment
 * supplies OWNED_ADMISSION_BASELINE. Also runnable against the unoptimized path. */
export function checkOwnedFireGuards(lab, fixture) {
  const f = fixture(), Roster = lab.FireControlQueryRoster;
  const oracle = lab.BeforeHasOwnedFireControlReadHooks ?? lab.hasOwnedFireControlReadHooks;
  Roster.ownForWorker(f.engine);
  const roster = Roster.create(f.ships, f.engine), s = f.ships.at(-1);
  assert.ok(roster);
  let comparisons = 0, rejected = 0, accepted = 0;
  const check = (label, expected) => {
    const admitted = f.ships.every(oracle);
    if (expected !== undefined) assert.equal(admitted, expected, 'oracle/' + label);
    const batch = roster.begin(f.ship, f.world);
    assert.equal(!!batch, admitted, label);
    batch?.close(); comparisons++; if (admitted) accepted++; else rejected++;
  };
  const mutate = (install, label, expected = false) => {
    const undo = install();
    try { check(label, expected); check(label + ' repeated', expected); }
    finally { undo(); }
    check(label + ' restored', true);
  };
  const replace = (obj, key, value) => () => {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    Object.defineProperty(obj, key, { configurable: true, writable: true, enumerable: true, value });
    return () => { if (descriptor) Object.defineProperty(obj, key, descriptor); else delete obj[key]; };
  };
  const clone = object => Object.assign(Object.create(Object.getPrototypeOf(object)), object);
  for (let i = 0; i < 5; i++) check('primed/' + i, true);
  const initialGuard = roster.ownedRows?.at(-1);
  if (initialGuard) {
    assert.equal(initialGuard.ship, s);
    assert.equal(initialGuard.spec, s.spec);
    assert.equal(initialGuard.systemDefinition, s.system.definition);
    assert.equal(initialGuard.defenseDefinition, s.defenseSystem.definition);
  }
  // All mutable gates must still reject after positive certificates were cached.
  mutate(() => { s.damageTakenModifiers.set('guard-test', () => 1); return () => s.damageTakenModifiers.delete('guard-test'); }, 'damage map');
  mutate(() => { s.externalPhaseEffects.set(f, () => undefined); return () => s.externalPhaseEffects.delete(f); }, 'phase map');
  mutate(() => { s.runtimeModifiers.set('guard-test', { collisionDisabled: 1 }); return () => s.runtimeModifiers.delete('guard-test'); }, 'runtime modifiers');
  mutate(replace(s, 'externalDamageTakenMultiplier', 1), 'own ship damage property');
  mutate(replace(s.shield, 'damageTakenMultiplier', 1), 'own shield damage property');
  mutate(replace(s.shield, 'damageTakenMultiplierFor', () => 1), 'shield method');
  mutate(replace(s.shield, 'externalDamageTakenMultiplier', () => 1), 'shield callback');
  mutate(replace(s.armor, 'damageTakenModifiers', () => ({armor: 1, hull: 1})), 'armor callback');
  mutate(replace(s.armor, 'dynamicEffectiveArmorMultiplier', () => 1), 'effective armor callback');
  mutate(replace(s.armor, 'onCellDamage', () => {}), 'cell callback');
  mutate(replace(s.flux, 'onOverloadStarted', () => {}), 'overload callback');
  mutate(replace(s, 'parentShip', f.ship), 'parent ship');
  mutate(replace(s, 'sourceCarrier', f.ship), 'source carrier');
  mutate(() => { const hook = () => false; s.hullDamageInterceptors.add(hook); return () => s.hullDamageInterceptors.delete(hook); }, 'interceptor');
  mutate(() => { s.systems.push(s.defenseSystem); return () => s.systems.pop(); }, 'extra system');
  mutate(replace(s.system, 'auxiliary', undefined), 'broken auxiliary');
  mutate(replace(s.defenseSystem, 'auxiliary', s.system), 'cyclic auxiliary');
  for (const value of [null, undefined, {...s.spec}, Object.freeze({...s.spec})]) mutate(replace(s, 'spec', value), 'uncertified spec');
  for (const system of [s.system, s.defenseSystem]) {
    for (const value of [null, undefined, {...system.definition}, Object.freeze({...system.definition})]) {
      mutate(replace(system, 'definition', value), 'uncertified definition');
    }
  }
  // A newly registered immutable spec must be requalified, not permanently rejected.
  const certified = lab.immutableCopy({...s.spec});
  mutate(replace(s, 'spec', certified), 'new immutable spec', true);
  const nativeDefinitions = lab.shipSystemDefinitions.all().filter(lab.hasNativeThreatPhaseAI);
  for (const definition of nativeDefinitions) {
    mutate(replace(s.system, 'definition', definition), 'new native main/' + definition.id, true);
    mutate(replace(s.defenseSystem, 'definition', definition), 'new native defense/' + definition.id, true);
  }
  // Component identity itself is not a cached permission. Same native callbacks
  // may remain admitted, whereas callbacks belonging to another Ship must not.
  for (const key of ['armor', 'shield', 'flux', 'system']) {
    mutate(replace(s, key, clone(s[key])), 'equivalent component/' + key, true);
    mutate(replace(s, key, f.ship[key]), 'foreign component/' + key);
  }
  const defense = clone(s.defenseSystem);
  mutate(() => { const previous = s.defenseSystem; s.defenseSystem = defense; s.system.auxiliary = defense;
    return () => { s.defenseSystem = previous; s.system.auxiliary = previous; }; }, 'equivalent defense chain', true);
  mutate(() => { const previous = s.defenseSystem; s.defenseSystem = f.ship.defenseSystem; s.system.auxiliary = f.ship.defenseSystem;
    return () => { s.defenseSystem = previous; s.system.auxiliary = previous; }; }, 'new native defense chain', true);
  const fresh = new lab.Ship('guard-replacement', s.spec, false, new lab.Vector2(), 0);
  mutate(() => { f.ships[f.ships.length - 1] = fresh; return () => { f.ships[f.ships.length - 1] = s; }; }, 'same-length roster replacement', true);
  mutate(() => { f.ships.reverse(); return () => f.ships.reverse(); }, 'roster reorder', true);
  mutate(() => { f.ships[f.ships.length - 1] = f.ship; return () => { f.ships[f.ships.length - 1] = s; }; }, 'duplicate native member', true);
  if (initialGuard) assert.notEqual(roster.ownedRows.at(-1), initialGuard, 'replaced membership earns a new certificate');
  roster.close();
  assert.equal(roster.begin(f.ship, f.world), undefined, 'closed roster');
  const next = Roster.create(f.ships, f.engine);
  if (initialGuard) assert.notEqual(next.ownedRows.at(-1), initialGuard, 'no cross-frame certificates');
  const nextBatch = next.begin(f.ship, f.world); assert.ok(nextBatch); nextBatch.close(); next.close();
  return { comparisons, accepted, rejected, frozenOracle: !!lab.BeforeHasOwnedFireControlReadHooks, guarded: !!initialGuard };
}
