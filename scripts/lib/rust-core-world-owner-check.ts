import { RustCoreCommandError } from '../../src/engine/runtime/rust/RustCombatCore';
import { RustFiringState, type RustCoreSnapshot } from '../../src/engine/runtime/rust/RustCoreProtocol';
import type { RustWorldRecord } from '../../src/engine/runtime/rust/RustWorldProtocol';
import type { Projectile } from '../../src/engine/simulation/Weapon';
import type { Ship } from '../../src/engine/simulation/Ship';
import { worldFixture, assertWorld, lifecycleWords, worldExplosionSpec, worldOutgoingModId, type WorldFixture, type WorldActor } from './rust-core-world-owner-fixture';
const statsKeys = ['totalDamageDealt', 'kineticDamage', 'heDamage', 'energyDamage', 'fragDamage', 'shieldDamageAbsorbed', 'armorDamageSoaked',
  'hullDamageDealt', 'hullDamageTaken', 'shotsFired', 'shotsHit', 'empDamageDealt', 'missilesIntercepted', 'fightersDestroyed', 'fightersLost', 'fightersRebuilt',
  'overloadsInflicted', 'overloadsSuffered'] as const;
const damageTypes = ['ENERGY', 'KINETIC', 'HIGH_EXPLOSIVE', 'FRAGMENTATION'];
interface SourceExplosion { projectile: Projectile; spec: NonNullable<Projectile['projectileExplosionSpec']>; pos: { x: number; y: number }; life: number;
  voidScreens: Map<string, { center: { x: number; y: number }; radius: number; teamId: number; fraction: number }>;
  ships: Set<string>; asteroids: Set<number>; missiles: Set<number>; }
export async function checkRustCore(wasm: BufferSource) {
  let strictFields = 0, geometryFields = 0, maximumDifference = 0, scenarios = 0, steps = 0, sourceShips = 0, records = 0, rollbackChecks = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  const coverage = { ordinaryDeath: 0, chain: 0, parentChild: 0, nonneutral: 0, deadEmitterBinding: 0, shield: 0, phase: 0, void: 0, transient: 0, fighter: 0, breakup: 0, expiry: 0 };
  const compare = (a: number, b: number, label: string, geometry = false) => {
    if (!geometry) { strictFields++; if (!Object.is(a, b)) throw Error(`${label}: Rust ${a} differs from actual TS ${b}`); return; }
    geometryFields++; if (Object.is(a, b)) return;
    const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    assertWorld(Number.isFinite(a) && Number.isFinite(b) && difference <= limit, `${label}: geometry ${a} differs from actual TS ${b}`);
    maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  };
  function numbers(a: ArrayLike<number>, b: ArrayLike<number>, label: string, geometry: number[] = [], skip: number[] = []) {
    compare(a.length, b.length, label + ' length'); for (let i = 0; i < b.length; i++) if (!skip.includes(i)) compare(a[i], b[i], label + ' field ' + i, geometry.includes(i));
  }
  const generation = (f: WorldFixture, ship: Ship) => f.handles[f.ships.indexOf(ship)].generation;
  function verify(f: WorldFixture, snap: RustCoreSnapshot) {
    const label = f.name + ' tick ' + f.tick, world = snap.world; assertWorld(world, label + ' no resident world');
    f.ships.forEach((s, i) => {
      const a = snap.bodies[i].ship!; compare(a.armor!.values[14], s.hullHp, label + ` ship${i} HP`); compare((a.flags & 16) ? 1 : 0, +s.isDead, label + ` ship${i} dead`);
      numbers(a.armor!.cells, s.armor.copyCells(), label + ` ship${i} armor cells`); compare(a.armor!.values[12], s.armor.dirtyVersion, label + ` ship${i} armor revision`);
      compare(a.armor!.values[19], s.damageDecals.revision, label + ` ship${i} scar revision`); compare(a.armor!.scars.length, s.damageDecals.marks.length, label + ` ship${i} scars`);
      s.damageDecals.marks.forEach((m, j) => numbers(a.armor!.scars[j], [m.cellIndex, m.localPos.x, m.localPos.y, m.opacity, m.intensity, m.heat, +m.justHit, m.flash,
        m.flashElapsed, m.phase, m.pulsePeriod, m.size, m.rotationRad, ['cracks', 'burns', 'holes'].indexOf(m.kind), m.variant], label + ` ship${i} scar${j}`, [1, 2, 12]));
      compare(a.flux[8], s.flux.softFlux, label + ` ship${i} soft flux`); compare(a.flux[9], s.flux.hardFlux, label + ` ship${i} hard flux`);
      compare(a.flux[14], +s.flux.isVenting, label + ` ship${i} venting`);
      numbers(snap.bodies[i].motion.slice(0, 6), [s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.facingRad, s.angularVelRad], label + ` ship${i} pose`, [0, 1, 2, 3, 4, 5]);
      numbers(snap.bodies[i].motion.slice(7, 11), [s.turnInput, +s.brakeInput, s.throttle, s.strafeInput], label + ` ship${i} live input`);
      s.allSystems.forEach((sys, j) => numbers(a.systems[j].values.slice(2), lifecycleWords(sys), label + ` ship${i} system${j}`));
      compare(a.shield![6], +s.shield.isActive, label + ` ship${i} shield active`); compare(a.shield![28], s.shield.sinceLastDamageTaken, label + ` ship${i} contact age`);
      compare(a.shield![7], s.shield.currentArcDeg, label + ` ship${i} shield arc`, true); compare(a.shield![8], s.shield.facingAngleRad, label + ` ship${i} shield facing`, true);
      const voidState = s.shield.voidShield; if (voidState) numbers(a.shield!.slice(44, 63), [voidState.layers, voidState.integrityPerLayer, voidState.rechargePerSecond,
        voidState.hitDelay, voidState.restartDelay, voidState.integrity, voidState.rebuild, voidState.quietRemaining, voidState.restartRemaining, +voidState.armed,
        +voidState.suppressed, voidState.breaks, voidState.visualHitRemaining, voidState.visualHitAngle, voidState.visualHitStrength, voidState.visualBreakRemaining,
        voidState.visualRestartRemaining, voidState.visualShutdownRemaining, +voidState.visualCollapse], label + ` ship${i} void authority`, [13]);
      s.weapons.forEach((m, j) => numbers(a.weapons!.mounts[j].slice(16, 32), [m.cooldownTimer, m.ammo, m.ammoRechargeProgress, m.lifecycleDt ?? 0, m.burstRemaining,
        m.burstTimer, +!!m.burstFluxReserved, RustFiringState[m.firingState], m.firingStateTimer, +m.triggerHeld, m.firingCycleId,
        m.reloadDelayRemaining ?? 0, m.recoil, m.glowAlpha, m.barrelIndex, m.currentSpreadDeg], label + ` ship${i} mount${j}`));
      compare(a.components.length, s.weapons.length, label + ` ship${i} component count`);
      s.weapons.forEach((m, j) => { const t = m.healthTracker; assertWorld(t, label + ' missing actual installed tracker');
        numbers(a.components[j].values.slice(5, 17), [m.health, m.maxHealth, +m.isDisabled, +!!m.isPermanentlyDisabled, m.disabledDuration, m.disabledTimer,
          1, t.repairDuration, t.hitAgo, t.interval, t.elapsed, +t.intervalElapsed], label + ` ship${i} component${j}`); });
    });
    compare(world.player.id, Number(f.ships[0].id), label + ' player'); compare(world.enemy.id, Number(f.ships[1].id), label + ' enemy');
    compare(world.time, snap.combatTime, label + ' world time'); compare(world.losses.length, f.losses.length, label + ' losses');
    f.losses.forEach((l, i) => { const a = world.losses[i]; compare(a.identity.id, Number(l.id), label + ` loss${i} id`); compare(a.team, l.teamId, label + ` loss${i} team`);
      compare(a.time, l.time, label + ` loss${i} time`); assertWorld(a.shipName === l.shipName && a.hullName === l.hullName, label + ` loss${i} actual UTF16 name differs`); });
    for (const side of ['player', 'enemy'] as const) numbers(world.stats[side], statsKeys.map(key => f.stats[side === 'player' ? 'playerStats' : 'enemyStats'][key]), label + ' stats ' + side);
    const active = f.weapon.explosions.active as unknown as SourceExplosion[]; compare(world.explosions.length, active.length, label + ' active explosions');
    active.forEach((x, i) => {
      const p = x.projectile, a = world.explosions[i].values, v = [f.serials.get(p.id) ?? p.id, p.isHullExplosion ? generation(f, f.ships.find(s => s.id === p.sourceShipId)!) : 1, Number(p.sourceShipId),
        +!!(p.teamId !== undefined), p.teamId ?? 0, +!!(p.isPlayer !== undefined), +!!p.isPlayer, p.damage, damageTypes.indexOf(p.damageType), +!!p.softFlux,
        p.pos.x, p.pos.y, p.prevPos.x, p.prevPos.y, p.vel.x, p.vel.y, p.radius, p.rangeRemaining, +!!p.isRocket, +!!p.isFlare, +!!p.didDamage,
        +!!(p.spawnType === 'BALLISTIC_AS_BEAM'), +!!p.interceptsMissiles, +!!(p.targetProjectileId !== undefined), p.targetProjectileId === undefined ? 0 : f.serials.get(p.targetProjectileId)!,
        +(p.targetProjectileId !== undefined), +!!p.passThroughMissiles, +!!p.voidShieldBlockedRoot, Number(p.voidShieldBlockedRoot ?? 0),
        p.voidShieldBlockedRoot ? generation(f, f.ships.find(s => s.id === p.voidShieldBlockedRoot)!) : 0];
      const geometry = [10, 11, 12, 13, 14, 15], damaged = (p.damagedTargetIds ?? []).filter(id => id.startsWith('projectile:')).map(id => Number(id.slice(11)));
      v.push(damaged.length); for (const id of damaged) v.push(f.serials.get(id)!, 1);
      const binding = f.sourceBindings.get(p.id); assertWorld(p.isHullExplosion || binding, label + ' missing actual emitted source binding');
      v.push(+!!binding); if (binding) { const offset = v.length; v.push(...binding); geometry.push(offset + 3, offset + 4); }
      const spec = worldExplosionSpec(x.spec), offset = v.length;
      v.push(spec.radius, spec.core, spec.duration, spec.minimumFraction,
        ['SHIPS_AND_ASTEROIDS', 'MISSILE_FF', 'MISSILE_NO_FF', 'PROJECTILE_FF', 'PROJECTILE_NO_FF', 'OTHER'].indexOf(spec.collision),
        spec.collision === 'OTHER' ? +!!spec.noFriendlyFire : 0, x.pos.x, x.pos.y, x.life, x.voidScreens.size); geometry.push(offset + 6, offset + 7);
      for (const [id, s] of x.voidScreens) { const offset = v.length; v.push(Number(id), generation(f, f.ships.find(ship => ship.id === id)!), s.center.x, s.center.y, s.radius, 1, s.teamId, s.fraction);
        geometry.push(offset + 2, offset + 3); }
      v.push(x.ships.size); for (const id of x.ships) v.push(Number(id), generation(f, f.ships.find(s => s.id === id)!));
      v.push(x.asteroids.size); for (const id of x.asteroids) v.push(id, 1);
      v.push(x.missiles.size); for (const id of x.missiles) v.push(f.serials.get(id) ?? id, 1);
      numbers(a, v, label + ' explosion ' + i, geometry);
    });
    compare(world.terrain.hulks.length, f.fx.hulkFragments.length, label + ' hulk count');
    f.fx.hulkFragments.forEach((h, i) => {
      const v = [h.id, Number(h.sourceShip.id), generation(f, h.sourceShip), 1, { FIGHTER: 1, FRIGATE: 2, DESTROYER: 3, CRUISER: 4, CAPITAL_SHIP: 5 }[h.sourceShip.spec.hullSize!],
        h.sourceShip.spec.spriteHeight, h.pos.x, h.pos.y, h.vel.x, h.vel.y, h.facingRad, h.angularVel, h.age, h.localOffset.x, h.localOffset.y, h.collisionRadius,
        +!!h.breakup, h.breakup ? f.breakupSequences.get(h.breakup)! : 0, +!!h.gravityFixed, +!!h.gravityManaged, h.bounds.length, ...h.bounds.flatMap(p => [p.x, p.y]), +!!h.visualBounds];
      const geometry = [6, 7, 8, 9, 10, 13, 14, 15, ...h.bounds.flatMap((_, j) => [21 + j * 2, 22 + j * 2])];
      if (h.visualBounds) geometry.push(...h.visualBounds.flatMap((_, j) => [v.length + 1 + j * 2, v.length + 2 + j * 2]));
      if (h.visualBounds) v.push(h.visualBounds.length, ...h.visualBounds.flatMap(p => [p.x, p.y])); v.push(h.mountSlotIds.length);
      for (const slot of h.mountSlotIds) { const s = h.sourceShip.spec.weaponSlots.find(s => s.slotId === slot); assertWorld(s, 'unknown source hulk slot'); v.push(Number(slot), s.x, s.y); }
      numbers(world.terrain.hulks[i].values, v, label + ' hulk ' + i, geometry);
    });
    const liveSequences = [...new Set(f.fx.hulkFragments.map(h => h.breakup).filter(s => s !== null))].sort((a, b) => f.breakupSequences.get(a)! - f.breakupSequences.get(b)!);
    compare(world.nextSequence, f.breakupSequences.size, label + ' next hulk sequence'); compare(world.terrain.sequences.length, liveSequences.length, label + ' live shared sequences');
    liveSequences.forEach((s, i) => numbers(world.terrain.sequences[i].values, [f.breakupSequences.get(s)!, s.remainingSplits, s.interval, s.elapsed, s.nextInterval], label + ' shared sequence ' + i));
    const string = (value: string) => [value.length, ...Array.from({ length: value.length }, (_, i) => value.charCodeAt(i))];
    compare(world.floating.length, f.fx.floatingTexts.length, label + ' actual live floating count');
    f.fx.floatingTexts.forEach((x, i) => numbers(world.floating[i].values, [x.id, x.pos.x, x.pos.y, x.vel.x, x.vel.y, ...string(x.text), ...x.color, x.size, x.life, x.maxLife], label + ' actual floating ' + i, [1, 2, 3, 4]));
    const completedFloating = world.records.filter(r => r.tag === 605); compare(completedFloating.length, f.floatingObservations.length, label + ' completed floating factory count');
    f.floatingObservations.forEach((r, i) => { numbers(completedFloating[i].values, r.values, label + ' completed floating factory ' + i, r.geometry); records++; });
    // These are completed source factory records, captured before later FX aging.
    // Other presentation classes are independently verified by their domain oracles.
    const actual = world.records.filter(r => [100, 101, 102, 103, 104, 105, 106, 107, 108, 606].includes(r.tag));
    compare(actual.length, f.observations.length, label + ' death/armor output count');
    f.observations.forEach((r, i) => { compare(actual[i].tag, r.tag, label + ` output${i} order`); const skip = r.tag === 102 ? [10 + r.values[3]] : [];
      numbers(actual[i].values, r.values, label + ` output${i} tag${r.tag}`, r.geometry, skip); records++; });
    numbers(snap.random, f.random.checkpointWitness(), label + ' combat RNG'); numbers(snap.visualRandom, f.visual.checkpointWitness(), label + ' visual RNG');
  }
  async function step(f: WorldFixture, dt: number, fire: boolean[] = []) { const snapshot = await f.step(dt, fire); steps++; verify(f, snapshot); f.core.acknowledgeEvents(snapshot.lastEventSequence); }
  async function guard(f: WorldFixture) {
    const before = JSON.stringify(f.core.snapshot()), handle = f.handles[0];
    try { f.core.apply([{ kind: 'hull-damage', id: 1, handle, damage: 1 }, { kind: 'accepted-system', id: 1,
      handle: { slot: handle.slot, generation: handle.generation + 1 }, systemId: 1, point: [0, 0] }]); throw Error('stale owner accepted'); }
    catch (error) { assertWorld(error instanceof RustCoreCommandError && error.code === 4, f.name + ' wrong stale rejection'); }
    assertWorld(JSON.stringify(f.core.snapshot()) === before, f.name + ' world batch partly committed'); rollbackChecks++;
    const projection = f.core.snapshot().world!; projection.stats.player.fill(999); projection.shipDefinitions[0].values.fill(999);
    assertWorld(JSON.stringify(f.core.snapshot()) === before, f.name + ' nested publication mutated world'); rollbackChecks++;
  }
  const cases: { name: string; actors: WorldActor[]; mode: string }[] = [
    { name: 'ordinary real emission lethal contact', mode: 'ordinary', actors: [{ position: [0, 0], gun: { damagePerShot: 500 }, maxFlux: 1000 }, { position: [170, 0], hp: 90, maxFlux: 0 }] },
    { name: 'parent modules synchronous chain damage', mode: 'chain', actors: [{ position: [0, 0], hp: 80, maxFlux: 20000, size: 'CAPITAL_SHIP' },
      { position: [80, 0], parent: 0, hp: 120, maxFlux: 1000 }, { position: [170, 0], hp: 120, maxFlux: 1000, transient: true }, { position: [280, 0], hp: 100, maxFlux: 1000 }] },
    { name: 'eclipse live source death ordinary shield', mode: 'shield', actors: [{ hull: 'web_zhuyuan', position: [0, 0], hp: 90, maxFlux: 20000, system: 1, gun: {} },
      { position: [150, 0], hp: 800, shield: 'OMNI', maxFlux: 20000 }, { position: [295, 0], hp: 120, maxFlux: 0, transient: true }] },
    { name: 'phase protection during exterior death blast', mode: 'phase', actors: [{ position: [0, 0], hp: 80, maxFlux: 20000 },
      { position: [90, 0], hp: 100, shield: 'PHASE', maxFlux: 1000 }, { position: [500, 0], maxFlux: 0 }] },
    { name: 'void field root module screen', mode: 'void', actors: [{ position: [-240, 0], hp: 90, maxFlux: 20000, radius: 100 },
      { position: [0, 0], hp: 600, maxFlux: 0, voidShield: { layers: 2, integrityPerLayer: 4000, rechargePerSecond: 1, hitDelay: 4, restartDelay: 8 } },
      { position: [80, 0], parent: 1, hp: 100, maxFlux: 0 }] },
    { name: 'fighter death statistics no blast', mode: 'fighter', actors: [{ position: [0, 0], maxFlux: 0 }, { position: [500, 0], maxFlux: 0 },
      { position: [250, 0], hp: 100, maxFlux: 0, size: 'FIGHTER', team: 1 }] },
    { name: 'actual hulk shared breakup continuation', mode: 'breakup', actors: [{ position: [0, 0], hp: 80, maxFlux: 0, breakProbability: 1, pieces: 3 },
      { position: [500, 0], maxFlux: 0 }] },
    { name: 'actual energy weapon AoE survives emitter death', mode: 'emitter', actors: [{ position: [0, 0], hp: 90, maxFlux: 20000,
      mods: [worldOutgoingModId], gun: { damagePerShot: 200, projectileExplosionSpec: {
        duration: .15, radius: 220, coreRadius: 25, minDamageFraction: .2, collisionClass: 'PROJECTILE_NO_FF', particleCount: 0,
        particleSizeMin: 0, particleSizeRange: 0, particleDuration: 0, particleColor: [255, 255, 255, 255] } } },
      { position: [170, 0], hp: 900, maxFlux: 0 }, { position: [250, 0], hp: 900, maxFlux: 0 }] },
  ];
  for (const c of cases) {
    const f = await worldFixture(wasm, c.name, c.actors, 19521 + scenarios++); sourceShips += f.ships.length;
    try {
      if (c.mode === 'ordinary') { for (let i = 0; i < 6; i++) await step(f, .067, [i === 0]); assertWorld(f.ships[1].isDead, 'actual weapon did not kill target'); coverage.ordinaryDeath++; }
      else if (c.mode === 'fighter') { f.damage(2, 100); await step(f, .01); assertWorld(f.ships[2].isDead && f.losses.length === 0, 'actual fighter death contract not reached'); coverage.fighter++; }
      else if (c.mode === 'emitter') { await step(f, .067, [true]); f.damage(0, f.ships[0].hullHp); for (let i = 0; i < 5; i++) await step(f, .067);
        assertWorld(f.ships[0].isDead && f.ships[2].hullHp < 900, 'actual weapon explosion/dead source binding not reached'); coverage.nonneutral++; coverage.deadEmitterBinding++; }
      else {
        if (c.mode === 'shield') { f.activate(0); f.aim(1, c.actors[0].position); f.shield(1, true); await step(f, .8); coverage.shield++; }
        if (c.mode === 'phase') { f.shield(1, true); await step(f, .51); assertWorld(f.ships[1].isCollisionless, 'actual phase immunity not active'); }
        f.damage(0, f.ships[0].hullHp); await step(f, .01); assertWorld(f.ships[0].isDead, 'actual source death not dispatched');
        if (c.mode === 'shield') assertWorld(f.ships[1].flux.hardFlux > 0, 'actual death blast did not reach ordinary shield');
        if (c.mode === 'phase') { assertWorld(f.ships[1].hullHp === c.actors[1].hp && !f.ships[1].isDead, 'actual phase failed to protect target inside blast'); coverage.phase++; }
        if (c.mode === 'chain') { assertWorld(f.ships[1].isDead && f.ships[2].isDead, 'actual recursive chain not reached'); coverage.chain++; coverage.parentChild++; coverage.transient++; }
        if (c.mode === 'void') { assertWorld(f.ships[2].hullHp === c.actors[2].hp, 'actual exterior void field did not screen module'); coverage.void++; }
        if (c.mode === 'breakup') { for (let i = 0; i < 5; i++) await step(f, .15); assertWorld(f.fx.hulkFragments.length > 1, 'actual breakup not reached'); coverage.breakup++; }
      }
      await step(f, .13); await step(f, .4); assertWorld(f.weapon.explosions.active.length === 0, 'actual short blast did not expire'); await guard(f); coverage.expiry++;
    } finally { f.core.dispose(); }
  }
  return { passed: true, scenarios, steps, sourceShips, strictFields, geometryFields, maximumDifference, geometryLog, records, rollbackChecks, coverage,
    actualShipConstructor: true, actualCombatEngineDeath: true, actualProjectileExplosionSystem: true, actualCombatFXFactories: true,
    productionIntegrated: false, fullBattleReady: false,
    limitations: ['Suppressed death needs an admitted shared authority command; current snapshot publication alone cannot mutate that field.',
      'Only completed death/armor factory records are compared here; other FX and autonomous AI have separate domain checks.',
      'No original live UI, full recovery codec, networking receipt, or seven-pack playable acceptance is claimed.'] };
}

// Keep the raw completed records available to the production runner without
// coercing them into expected constants or calling a JS damage solver.
export type CompletedWorldRecord = RustWorldRecord;
