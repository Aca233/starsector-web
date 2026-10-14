import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import { Ship } from '../../src/engine/simulation/Ship';
import { Vector2 } from '../../src/engine/math/Vector2';
import { bundledShipPacks } from '../../src/engine/modding/BundledShipPacks';
import { validateShipPack } from '../../src/engine/modding/ShipPackValidation';
import { compileRustContent, type RustCompiledContent } from '../../src/engine/runtime/rust/RustContentCompiler';
import { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';
import { RustCombatPresentation } from '../../src/engine/runtime/rust/RustCombatPresentation';
import type { RustPresentationFacts, RustPresentationShipFact } from '../../src/engine/runtime/rust/RustCombatPresentationFacts';
import { RUST_PROJECTILE_PRESENTATION_FIELDS } from '../../src/engine/runtime/rust/RustCombatPresentationFacts';
import { rustPresentationOrdnance } from '../../src/engine/runtime/rust/RustCombatPresentationOrdnance';
import type { RustCoreSnapshot } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { CombatPresentationEncoder } from '../../src/engine/runtime/local/CombatPresentationEncoder';
import { CombatPresentationDecoder } from '../../src/engine/runtime/local/CombatPresentationDecoder';
import { combatRenderView } from '../../src/engine/render/CombatRenderView';
import { pulsePusherOffset } from '../../src/engine/extensions/ship-systems/PulseDriveState';
import { shipPresentationPose } from '../../src/engine/visual/ShipPresentation';
import { weaponPresentationAngle } from '../../src/engine/visual/WeaponPresentation';
import { combatWeaponRange } from '../../src/engine/simulation/WeaponRange';
import { manualWeaponShip } from '../../src/engine/runtime/ModuleFireControl';
import { lockedCombatTarget } from '../../src/engine/runtime/CombatTargeting';
import { updateCombatVisibility } from '../../src/engine/simulation/systems/CombatVisibility';
import { copyRustPresentationData as copy } from '../../src/engine/runtime/rust/RustCombatPresentationData';
import { renderWeaponRange, renderPulseOffset } from '../../src/engine/render/ShipRenderQueries';
import type { CombatAudioEvent } from '../../src/engine/contracts/LocalCombatWire';
import type { Projectile, Beam } from '../../src/engine/simulation/Weapon';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { createNativeEmpArc } from '../../src/engine/visual/EmpArcVisuals';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';

function sourceTerrain(engine: CombatEngine, content: RustCompiledContent, snapshot: RustCoreSnapshot, facts: RustPresentationFacts) {
  const text = (value: string) => [value.length, ...Array.from({ length: value.length }, (_, i) => value.charCodeAt(i))];
  const point = (p: { x: number; y: number }) => [p.x, p.y], sprites = [...new Set(engine.asteroids.map(a => a.spriteUrl))];
  const nebulae = engine.nebulae.map(n => ({ tag: 6, values: new Float64Array([n.id, ...text(n.spriteUrl), ...point(n.pos), n.thickness, n.atlasColumn, n.atlasRow]) }));
  const asteroids = engine.asteroids.map(a => ({ tag: 7, values: new Float64Array([a.id, 1, ...point(a.pos), ...point(a.vel), a.facingRad, a.angularVel,
    a.radius, a.mass, a.hp, a.maxHp, sprites.indexOf(a.spriteUrl), Number(a.gravityFixed ?? false)]) }));
  const hulks = engine.hulkFragments.map((h, i) => { const source = content.entities.find(e => e.stableId === h.sourceShip.id)!;
    return { tag: 8, values: new Float64Array([h.id, source.id, source.handle.generation, 1, 4, h.sourceShip.spec.spriteHeight,
      ...point(h.pos), ...point(h.vel), h.facingRad, h.angularVel, h.age, ...point(h.localOffset), h.collisionRadius,
      Number(h.breakup !== null), h.breakup ? i + 1 : 0, 0, Number(h.gravityManaged), h.bounds.length, ...h.bounds.flatMap(point),
      Number(h.visualBounds !== null), ...(h.visualBounds ? [h.visualBounds.length, ...h.visualBounds.flatMap(point)] : []),
      h.mountSlotIds.length, ...h.mountSlotIds.flatMap(slot => [h.sourceShip.spec.weaponSlots.findIndex(s => s.slotId === slot) + 1, 0, 0])]) }; });
  const sequences = engine.hulkFragments.flatMap((h, i) => h.breakup ? [{ tag: 9, values: new Float64Array([i + 1, h.breakup.remainingSplits, h.breakup.interval, h.breakup.elapsed, h.breakup.nextInterval]) }] : []);
  const floating = engine.floatingTexts.map(f => ({ tag: 16, values: new Float64Array([f.id, ...point(f.pos), ...point(f.vel), ...text(f.text), ...f.color, f.size, f.life, f.maxLife]) }));
  return { snapshot: { ...snapshot, world: { ...snapshot.world!, terrain: { ...snapshot.world!.terrain, nebulae, asteroids, hulks, sequences }, floating } },
    facts: { ...facts, asteroidSprites: sprites } };
}

/** Encode genuine source emissions to the published numeric schema to exercise
 * all rendering fields. Domain emission/advance parity has separate owner checks. */
function sourceOrdnance(engine: CombatEngine, content: RustCompiledContent, snapshot: RustCoreSnapshot, facts: RustPresentationFacts) {
  const entities = new Map(content.entities.map(e => [e.stableId, e])), types = ['ENERGY', 'KINETIC', 'HIGH_EXPLOSIVE', 'FRAGMENTATION'];
  const projects = engine.projectiles.map((p, index) => {
    const e = entities.get(p.sourceShipId)!, r = new Float64Array(65), serial = index + 1;
    r.set([serial, p.id, e.id, e.handle.slot, e.handle.generation, e.mounts.find(m => m.sourceSlotId === p.slotId)!.componentId, 1, p.teamId!,
      p.spawnType ? ['ORDINARY', 'BALLISTIC', 'BALLISTIC_AS_BEAM', 'PLASMA', 'MISSILE'].indexOf(p.spawnType) : 0, types.indexOf(p.damageType), 0, p.radius,
      p.pos.x, p.pos.y, p.prevPos.x, p.prevPos.y, p.vel.x, p.vel.y, p.facingRad!, p.damage, p.empDamage ?? 0, p.baseDamage ?? 0, p.rangeRemaining, p.totalRange, p.elapsedTime,
      p.sourceMoveSpeed ?? 0, p.sourceVelocity?.x ?? 0, p.sourceVelocity?.y ?? 0, p.spawnLocation?.x ?? 0, p.spawnLocation?.y ?? 0,
      p.ballisticTail?.x ?? 0, p.ballisticTail?.y ?? 0, p.prevBallisticTail?.x ?? 0, p.prevBallisticTail?.y ?? 0, p.fadeProgress ?? 0, p.prevFadeProgress ?? 0,
      p.unfadedDamage ?? 0, p.unfadedEmp ?? 0, Number(p.didDamage), Number(p.softFlux), Number(p.flightTimeRemaining !== undefined), p.flightTimeRemaining ?? 0,
      Number(p.armingTimeRemaining !== undefined), p.armingTimeRemaining ?? 0, Number(p.armedWhileFizzling !== undefined), Number(p.armedWhileFizzling),
      Number(p.missileFizzleTime !== undefined), p.missileFizzleTime ?? 0, Number(p.isDisarmed), Number(p.collisionDisabled), Number(p.isGuided), Number(p.gravityDeflected),
      Number(p.targetShipId !== undefined), p.targetShipId ? entities.get(p.targetShipId)!.id : 0, Number(p.targetProjectileId !== undefined), p.targetProjectileId ?? 0]);
    const g = new Float64Array(30); g.set([serial, p.turnVelocityRad ?? 0, Number(p.hitpoints !== undefined), p.hitpoints ?? 0, Number(p.stageTriggered), Number(p.mirvSplitDistance !== undefined), p.mirvSplitDistance ?? 0]);
    g[12] = Number(p.isFlare); g[13] = Number(p.flareFizzling); g[14] = p.flareLife ?? 0;
    const byPrefix = (prefix: string) => (p.damagedTargetIds ?? []).filter(id => id.startsWith(prefix)).map(id => Number(id.slice(prefix.length)));
    const damagedShips = (p.damagedTargetIds ?? []).filter(id => entities.has(id)).map(id => entities.get(id)!);
    const blocked = p.voidShieldBlockedRoot ? entities.get(p.voidShieldBlockedRoot)! : undefined, captured = p.gravityCapturedBy ? entities.get(p.gravityCapturedBy)! : undefined;
    const w = { tag: 14, values: new Float64Array([serial, Number(p.hitpoints !== undefined), p.hitpoints ?? 0, Number(!!p.voidShieldHitRecorded),
      Number(captured !== undefined), captured?.handle.slot ?? 0, captured?.handle.generation ?? 0,
      ...['projectile:', 'terrain:asteroid:', 'terrain:wreck:'].flatMap(prefix => { const ids = byPrefix(prefix); return [ids.length, ...ids]; }),
      damagedShips.length, ...damagedShips.flatMap(e => [e.id, e.handle.generation]), Number(blocked !== undefined), blocked?.id ?? 0, blocked?.handle.generation ?? 0, Number(!!p.systemFuseTriggered)]) };
    const original = p.gravityOriginalSourceShipId ? entities.get(p.gravityOriginalSourceShipId)! : undefined, wellOwner = p.gravityWellBinding ? entities.get(p.gravityWellBinding.ownerId)! : undefined;
    const gravity = { tag: 20, values: new Float64Array([serial, 1, Number(original !== undefined), ...(original ? [original.id, original.handle.slot, original.handle.generation] : []),
      Number(captured !== undefined), ...(captured ? [captured.handle.slot, captured.handle.generation] : []), Number(p.gravityCoupling === 'MASS_DRIVER'), Number(!!p.isMine), Number(!!p.isHullExplosion),
      Number(wellOwner !== undefined), ...(wellOwner ? [wellOwner.handle.slot, wellOwner.handle.generation, p.gravityWellBinding!.serial, p.gravityWellBinding!.age, p.gravityWellBinding!.turn] : [])]) };
    return { r, g, w, gravity,
      binding: { serial, weaponKey: e.mounts.find(m => m.sourceSlotId === p.slotId)!.weaponKey, sourceSlotId: p.slotId, isPlayer: p.isPlayer,
        presentFields: (Object.keys(p) as (keyof Projectile)[]).filter(k => p[k] !== undefined), presentation: copy(Object.fromEntries(RUST_PROJECTILE_PRESENTATION_FIELDS.map(k => [k, p[k]]))) } };
  });
  const beams = engine.beams.map((b, index) => {
    const e = entities.get(b.sourceShipId)!, serial = projects.length + index + 1;
    const r = new Float64Array([serial, b.id, e.id, e.handle.slot, e.handle.generation, e.mounts.find(m => m.sourceSlotId === b.slotId)!.componentId, b.firingCycleId ?? 0, b.teamId!,
      b.startPos.x, b.startPos.y, b.endPos.x, b.endPos.y, b.rayEndPrevFrame?.x ?? 0, b.rayEndPrevFrame?.y ?? 0, b.barrelOffset?.x ?? 0, b.barrelOffset?.y ?? 0,
      b.elapsedTime, b.duration, b.damagePerSec, b.empPerSec ?? 0, b.brightness ?? 0, Number(b.damageActive), Number(b.isHitting), Number(b.elapsedSinceDamage !== undefined), b.elapsedSinceDamage ?? 0,
      b.accumulatedBrightness ?? 0, b.dpsDuration ?? 0, b.damageMultiplier ?? 0, 0]);
    const w = { tag: 15, values: new Float64Array([serial, Number(b.isPlayer !== undefined), Number(b.isPlayer), b.baseDamagePerSec ?? 0, b.hitGlowRadius ?? 0, b.hitGlowBrightenDuration ?? 0,
      Number(b.hasRecordedHit), Number(b.wasShortened), b.hitGlowBrightness ?? 0, b.hitGlowSizeMult ?? 0, Number(b.contactSurface !== undefined), Number(b.contactSurface === 'SHIELD'),
      b.contactFxCooldown ?? 0, b.contactSoundCooldown ?? 0, b.baseEmpPerSec ?? 0, b.width, ...(b.fringeColor ?? [0, 0, 0, 0]), ...(b.coreColor ?? [0, 0, 0, 0])]) };
    return { r, w, binding: { serial, weaponKey: e.mounts.find(m => m.sourceSlotId === b.slotId)!.weaponKey, sourceSlotId: b.slotId, maxDuration: b.maxDuration,
      scaleGlowBasedOnDamageEffectiveness: b.scaleGlowBasedOnDamageEffectiveness,
      presentFields: (Object.keys(b) as (keyof Beam)[]).filter(k => b[k] !== undefined) } };
  });
  return { snapshot: { ...snapshot, projectiles: projects.map(p => p.r), guidance: projects.map(p => ({ values: p.g, immune: new Float64Array() })), beams: beams.map(b => b.r),
    world: { ...snapshot.world!, projectiles: projects.map(p => p.w), beams: beams.map(b => b.w),
      gravity: { header: { tag: 17, values: new Float64Array() }, systems: [], mounts: [], projectiles: projects.map(p => p.gravity) } } },
    facts: { ...facts, ordnance: { projectiles: projects.map(p => p.binding), beams: beams.map(b => b.binding) } } };
}

/** Oracle only. Production adapter never imports this Ship/engine sampler. */
function factsFor(engine: CombatEngine, content: RustCompiledContent, snapshot: RustCoreSnapshot, revision: number,
  audio: readonly CombatAudioEvent[] = [], audioSequence = 0): RustPresentationFacts {
  const identity = new Map(content.entities.map(e => [e.stableId, e]));
  const handle = (ship: Ship | undefined) => ship ? identity.get(ship.id)!.handle : undefined;
  const ships: RustPresentationShipFact[] = [...new Set([...engine.ships, ...engine.allCapitalShips])].map(ship => {
    const e = identity.get(ship.id)!; if (!e) throw Error('Missing oracle identity ' + ship.id);
    const p = shipPresentationPose(ship);
    return { id: e.id, handle: e.handle, stableId: ship.id, specKey: e.specKey, team: ship.teamId, reserveInitial: undefined,
      parent: handle(ship.parentShip), sourceCarrier: handle(ship.sourceCarrier), previousPosition: [ship.prevPos.x, ship.prevPos.y], previousFacing: ship.prevFacingRad,
      playerTargetId: ship.playerTargetId, visibilityMask: ship.visibilityMask, visibilityOverflow: ship.visibilityOverflow, isPhased: ship.isPhased,
      shipName: ship.shipName, flightDeckWingId: ship.flightDeckWingId, isSystemDrone: ship.isSystemDrone, sightRadius: ship.sightRadius,
      isFiringMain: ship.isFiringMain, fighterRecall: ship.fighterRecall, combatWeaponRepairTimeMultiplier: ship.combatWeaponRepairTimeMultiplier,
      flameoutRatio: ship.getFlameoutRatio(), significantEnemiesInRange: ship.areSignificantEnemiesInRange(2500, engine.findHostile(ship)),
      phaseVisualAlpha: ship.phaseVisualAlpha, phaseGhosts: copy(ship.phaseGhosts), engineBoostLevel: ship.engineBoostLevel, previousEngineBoostLevel: ship.prevEngineBoostLevel,
      surfaceFeedback: copy(ship.surfaceFeedback), shieldHitSegmentLevels: ship.shield.presentationHitSegmentLevels().slice(), teleportCameraOffset: copy(ship.teleportCameraOffset),
      presentationPose: p ? { position: [p.pos.x, p.pos.y], facing: p.facing } : undefined,
      primarySystemId: ship.allSystems.indexOf(ship.system) + 1, tacticalSystemIds: ship.systems.map(s => ship.allSystems.indexOf(s) + 1),
      defenseSystemId: ship.defenseSystem ? ship.allSystems.indexOf(ship.defenseSystem) + 1 : undefined,
      systems: ship.allSystems.map((s, i) => ({ systemId: i + 1, definition: { type: s.type, name: s.name, description: s.description,
        available: s.available, maxCharges: s.maxCharges, visuals: copy(s.definition.visuals), gravityField: copy(s.definition.gravityField), gravityCollapse: copy(s.definition.gravityCollapse),
        charges: s.definition.charges, audio: copy(s.definition.audio) }, isActive: s.isActive, activationFailureReason: s.activationFailureReason,
        statusText: s.statusText, passiveStatusText: s.passiveStatusText, fortressVisualLevel: s.fortressVisualLevel, pulseOffset: pulsePusherOffset(s),
        gravityControlHeld: s.gravityControlHeld, gravityPolarity: s.gravityPolarity, gravityField: copy(s.gravityField), gravityPush: copy(s.gravityPush),
        gravityManeuver: copy(s.gravityManeuver), teleportVisual: copy(s.teleportVisual) })),
      mounts: ship.weapons.map((m, i) => ({ componentId: i + 1, weaponKey: e.mounts[i].weaponKey, slotId: m.slotId, relativePos: [m.relativePos.x, m.relativePos.y],
        mountType: m.mountType, arcDeg: m.arcDeg, baseAngleDeg: m.baseAngleDeg, range: combatWeaponRange(ship, m.spec), presentationRelativeAngle: weaponPresentationAngle(m, 0),
        gravityTractor: copy(m.gravityTractor), gravityDeflection: copy(m.gravityDeflection) })) };
  });
  const v = combatRenderView(engine), deployment = engine.deployment.snapshot();
  return { version: 1, epoch: 7, revision, tick: snapshot.tick, playerId: engine.playerShip.id, enemyId: engine.enemyShip.id,
    manualWeaponId: manualWeaponShip(engine.playerShip, engine.ships).id, targetId: lockedCombatTarget(engine.ships, engine.playerShip)?.id ?? null,
    rosters: { ships: engine.ships.map(s => s.id), capitalShips: engine.capitalShips.map(s => s.id), allCapitalShips: engine.allCapitalShips.map(s => s.id),
      fighters: engine.fighters.map(s => s.id), bombers: engine.bombers.map(s => s.id) }, ships, playerWings: copy(engine.playerWings.map(({ specId, carrierId, wingId, name, maxCrafts, crr }) => ({ specId, carrierId, wingId, name, maxCrafts, crr }))),
    enemyWings: copy(engine.enemyWings.map(({ specId, carrierId, wingId, name, maxCrafts, crr }) => ({ specId, carrierId, wingId, name, maxCrafts, crr }))),
    deployment: { available: true, enabled: engine.deployment.enabled, limit: deployment.limit, rows: deployment.rows, simulation: engine.isSimulation,
      simulationLimit: engine.simulationPointLimit, allyUsed: engine.simulationDeployedPoints(true), enemyUsed: engine.simulationDeployedPoints(false) },
    tactical: { available: true, commandPoints: engine.commandPoints, selectedUnitId: engine.selectedUnitId, isTacticalMap: engine.isTacticalMap, orders: copy(engine.orders) },
    openBattlefield: engine.openBattlefield, multiTeamBattle: engine.multiTeamBattle, battleResult: copy(engine.battleResult), isBattleResultReady: engine.isBattleResultReady,
    notificationTime: engine.notificationTime, shipLossNotifications: copy(engine.shipLossNotifications), environment: copy(engine.environment), cameraShakeIntensity: engine.cameraShakeIntensity,
    sceneTexts: [], radio: copy(engine.radioMessages),
    asteroidSprites: [], visuals: { particles: copy(v.particles), contrails: copy(v.contrails), debris: copy(v.debris), explosions: copy(v.explosions), hitGlows: copy(v.hitGlows),
      empArcs: v.empArcs.map(arc => ({ ...copy({ ...arc, native: undefined }), native: arc.native ? { ...copy({ ...arc.native, anchor: undefined }), anchor: handle(arc.native.anchor as Ship)! } : undefined })),
      mines: copy(v.mines), muzzleFlashes: copy(v.muzzleFlashes), muzzleParticles: copy(v.muzzleParticles), shieldRipples: copy(v.shieldRipples), movingRayFades: copy(v.movingRayFades),
      trailStrips: copy(Array.from(v.trailStrips)), projectileVisuals: copy(v.projectileVisuals), projectileFlight: copy(v.projectileFlight), projectilePrediction: copy(v.projectilePrediction),
      localMuzzles: copy(v.localMuzzles), localParticles: copy(v.localParticles) }, ordnance: { projectiles: [], beams: [] }, audio: { sequence: audioSequence, events: copy(audio) } };
}

export async function checkRustCombatPresentation(wasm: BufferSource) {
  let strict = 0, geometry = 0, maxError = 0, guards = 0, scenes = 0;
  const compare = (actual: unknown, expected: unknown, path: string, seen = new Map<object, object>()): void => {
    if (typeof expected === 'function') return;
    if (typeof actual === 'number' && typeof expected === 'number') {
      if (Object.is(actual, expected) || Number.isNaN(actual) && Number.isNaN(expected)) { strict++; return; }
      const diff = Math.abs(actual - expected), allowed = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)));
      if (/(pos|Pos|facing|angle|Facing|Angle|local|x$|y$)/.test(path) && diff <= allowed) { geometry++; maxError = Math.max(maxError, diff); return; }
      throw Error(path + ': ' + actual + ' != ' + expected);
    }
    if (expected === null || expected === undefined || typeof expected !== 'object') { strict++; if (!Object.is(actual, expected)) throw Error(path + ': scalar differs ' + String(actual) + ' != ' + String(expected)); return; }
    if (!actual || typeof actual !== 'object') throw Error(path + ': object differs');
    if (seen.get(expected) === actual) return; seen.set(expected, actual);
    if (expected instanceof Map) { if (!(actual instanceof Map) || actual.size !== expected.size) throw Error(path + ': map differs');
      const rows = [...actual.entries()]; let index = 0;
      for (const [key, value] of expected) { if (key && typeof key === 'object') { compare(rows[index]?.[0], key, path + '.key.' + index, seen); compare(rows[index]?.[1], value, path + '.value.' + index, seen); }
        else compare(actual.get(key), value, path + '.' + key, seen); index++; } return; }
    if (Array.isArray(expected) || ArrayBuffer.isView(expected)) { if ((actual as ArrayLike<unknown>).length !== (expected as ArrayLike<unknown>).length) throw Error(path + ': length differs'); }
    for (const key of Object.keys(expected)) compare((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], path + '.' + key, seen);
  };
  const reject = (action: () => unknown, label: string) => { try { action(); } catch { guards++; return; } throw Error('Guard admitted ' + label); };
  let nonemptyProjectiles = 0, nonemptyBeams = 0, orderedAudio = 0, liveOrdnance = 0;
  for (const pack of bundledShipPacks) {
    const spec = validateShipPack(pack, false, bundledShipPacks).compiled[0], engine = new CombatEngine();
    const seed = 1831 + scenes++; engine.setSeed(seed); engine.fxSystem.clear(); engine.asteroids.length = 0; engine.nebulae.length = 0;
    const entries = [{ stableId: 'player_ship', spec, team: 0, player: true, position: [0, 600] as const, facing: -Math.PI / 2 },
      { stableId: 'enemy_ship', spec, team: 1, player: false, position: [0, -600] as const, facing: Math.PI / 2 }];
    const content = compileRustContent({ ships: entries, seed });
    engine.playerShip = new Ship('player_ship', spec, true, new Vector2(0, 600), -Math.PI / 2, engine.random, engine.visualRandom);
    engine.enemyShip = new Ship('enemy_ship', spec, false, new Vector2(0, -600), Math.PI / 2, engine.random, engine.visualRandom); engine.enemyShip.fireControlMode = 'AI';
    engine.fighterSystem.init(engine.playerShip, engine.enemyShip); updateCombatVisibility(engine.ships);
    const initialFlightRandom = engine.random.checkpointWitness(), initialFlightVisual = engine.visualRandom.checkpointWitness();
    const initialFighters = [...engine.fighters], initialBombers = [...engine.bombers];
    engine.deployment.configure(engine.allCapitalShips, new Set([engine.playerShip.id, engine.enemyShip.id]), 20000);
    engine.fighterSystem.fighters = initialFighters; engine.fighterSystem.bombers = initialBombers;
    Object.assign(engine.random, { state: initialFlightRandom[1], idCounter: initialFlightRandom[2] });
    Object.assign(engine.visualRandom, { state: initialFlightVisual[1], idCounter: initialFlightVisual[2] });
    engine.playerShip.playerTargetId = engine.enemyShip.id; engine.playerShip.currentTargetShip = engine.enemyShip; engine.isTacticalMap = true;
    engine.orders.set(engine.playerShip.id, { id: 'presentation-engage', type: 'ENGAGE', issuedTime: 0, targetShipId: engine.enemyShip.id });
    const core = await RustCombatCore.create(wasm, seed);
    try {
      for (const batch of content.batches) core.apply(batch.commands.filter(c => c.kind !== 'initialize-gravity-ship'));
      const player = content.entities.find(e => e.stableId === 'player_ship')!, enemy = content.entities.find(e => e.stableId === 'enemy_ship')!;
      core.apply([{ kind: 'initialize-battle-world', id: player.id, handle: player.handle, enemy: { id: enemy.id, handle: enemy.handle }, asteroids: false }]);
      core.apply(content.finalize);
      const projector = new RustCombatPresentation(content, 7), encoder = new CombatPresentationEncoder(7), decoder = new CombatPresentationDecoder(7);
      const legacyEncoder = new CombatPresentationEncoder(7), legacyDecoder = new CombatPresentationDecoder(7);
      for (let phase = 0; phase < 3; phase++) {
        if (phase === 1) {
          engine.playerShip.flux.increaseFlux(123, true);
          core.apply([{ kind: 'flux', id: player.id, handle: player.handle, operation: 'increase', amount: 123, hard: true }]);
          if (engine.playerShip.weapons.length) {
            engine.playerShip.weaponControl.disableComponent(engine.playerShip.weapons[0]);
            core.apply([{ kind: 'component-disable', id: player.id, handle: player.handle, componentId: 1 }]);
          }
          engine.isTacticalMap = false;
          engine.fxSystem.addFloatingText(engine.playerShip.pos, 'projection', [100, 220, 255], 12, 1);
        }
        const audio: CombatAudioEvent[] = [];
        if (phase === 2) {
          const stop = captureCombatAudio(e => audio.push(copy(e)));
          try {
            const eligible = engine.ships.flatMap(ship => ship.weapons.map(mount => ({ ship, mount }))).filter(({ mount }) => !mount.isDisabled && !mount.spec.gravityTractor && !mount.spec.gravityDeflector);
            const selected = new Set([eligible.find(e => !e.mount.spec.isBeam), eligible.find(e => e.mount.spec.isBeam),
              eligible.find(e => e.mount.spec.isRocket || e.mount.spec.spawnType === 'MISSILE')]);
            for (const { ship, mount } of [...selected].filter(e => e !== undefined)) {
              const beforeFlux = ship.flux.softFlux, beforeMount = { ...mount }, beforeVelocity = ship.vel.clone();
              ship.weaponControl.fireWeapon(mount, ship, p => engine.projectiles.push(p), b => engine.beams.push(b));
              const e = content.entities.find(e => e.stableId === ship.id)!;
              if (ship.flux.softFlux !== beforeFlux) core.apply([{ kind: 'flux', id: e.id, handle: e.handle, operation: 'increase', amount: ship.flux.softFlux - beforeFlux, hard: false }]);
              Object.assign(mount, beforeMount); ship.vel.copy(beforeVelocity); // Projection-only emission oracle; no TS rule state import.
            }
          } finally { stop(); }
          engine.fxSystem.spawnExplosion(engine.playerShip.pos, 4);
          engine.fxSystem.empArcs.push(createNativeEmpArc(engine.playerShip.pos, engine.playerShip.pos.clone().add(new Vector2(70, -30)), engine.playerShip, 4,
            [100, 160, 255, 255], [255, 255, 255, 255], engine.visualRandom));
          engine.nebulae.push({ id: 0, pos: new Vector2(30, 80), thickness: .45, atlasColumn: 2, atlasRow: 1, spriteUrl: '/game-assets/graphics/fx/nebula.png' });
          engine.asteroids.push({ id: 41, pos: new Vector2(40, 90), vel: new Vector2(1, -2), facingRad: .17, angularVel: .02, radius: 35, mass: 12, hp: 80, maxHp: 90,
            spriteUrl: '/game-assets/graphics/asteroids/asteroid1.png', gravityFixed: false });
          engine.hulkFragments.push({ id: 99, sourceShip: engine.enemyShip, pos: new Vector2(20, 35), vel: new Vector2(2, 1), facingRad: .5, angularVel: .03, age: .4,
            localOffset: new Vector2(1, 2), collisionRadius: 80, gravityManaged: false, bounds: [new Vector2(-20, -30), new Vector2(30, -20), new Vector2(30, 20)],
            visualBounds: null, mountSlotIds: engine.enemyShip.spec.weaponSlots.slice(0, 1).map(s => s.slotId), breakup: { remainingSplits: 2, interval: .2, elapsed: .1, nextInterval: .15 } });
        }
        let snapshot = core.snapshot(), facts = factsFor(engine, content, snapshot, phase + 1, audio, audio.length);
        if (phase === 2) { const converted = sourceOrdnance(engine, content, snapshot, facts); snapshot = converted.snapshot; facts = converted.facts; }
        { const converted = sourceTerrain(engine, content, snapshot, facts); snapshot = converted.snapshot; facts = converted.facts; }
        const frame = projector.capture(snapshot, facts), got = decoder.apply(encoder.captureDetached(frame.presentation, snapshot.tick));
        compare(frame.audio, audio, 'orderedAudio');
        const expected = legacyDecoder.apply(legacyEncoder.capture(engine, snapshot.tick));
        compare(got.hud.read, expected.hud.read, pack.id + '/hud'); compare(got.hud.map, expected.hud.map, pack.id + '/map'); compare(got.hud.deployment, expected.hud.deployment, pack.id + '/deploy');
        for (let i = 0; i < expected.view.ships.length; i++) {
          const a = got.view.ships[i], b = expected.view.ships[i];
          compare(a, b, pack.id + '/render.' + i);
          compare(a.interpolatedPos(.4), b.interpolatedPos(.4), 'interpolatedPos'); compare(a.interpolatedFacing(.4), b.interpolatedFacing(.4), 'interpolatedFacing');
          compare(a.getShieldCenter(), b.getShieldCenter(), 'shieldCenter');
          for (let j = 0; j < b.weapons.length; j++) compare(renderWeaponRange(a, a.weapons[j]), renderWeaponRange(b, b.weapons[j]), 'weaponRange');
          compare(renderPulseOffset(a.system), renderPulseOffset(b.system), 'pulseOffset');
        }
        if (phase === 2) {
          compare(got.view.projectiles, expected.view.projectiles, 'sourceProjectile'); compare(got.view.beams, expected.view.beams, 'sourceBeam');
          compare(got.view.particles, expected.view.particles, 'sourceParticles'); compare(got.view.empArcs, expected.view.empArcs, 'sourceEmpArcs');
          compare(got.view.nebulae, expected.view.nebulae, 'sourceNebulae'); compare(got.view.asteroids, expected.view.asteroids, 'sourceAsteroids');
          compare(got.view.hulkFragments, expected.view.hulkFragments, 'sourceHulks'); compare(got.hud.floatingTexts, expected.hud.floatingTexts, 'sourceFloating');
          nonemptyProjectiles += got.view.projectiles.length; nonemptyBeams += got.view.beams.length; orderedAudio += frame.audio.length;
          const noReplay = projector.capture(snapshot, { ...facts, revision: phase + 2 }); compare(noReplay.audio.length, 0, 'audioOnce');
          const ctx = (engine as unknown as { getWeaponSimContext(): WeaponSimContext }).getWeaponSimContext();
          engine.weaponSystem.updateProjectiles(.01, ctx);
          const live = sourceOrdnance(engine, content, snapshot, facts), keys = new Map(content.dictionary.weapons.map(w => [w.key, w.spec]));
          const identity = (id: number, generation?: number) => { const e = content.entities.find(e => e.id === id && (generation === undefined || generation === e.handle.generation)); if (!e) throw Error('Missing live oracle id'); return e.stableId; };
          const projected = rustPresentationOrdnance(live.snapshot, live.facts, key => keys.get(key)!, identity,
            h => content.entities.find(e => e.handle.slot === h.slot && e.handle.generation === h.generation)!.stableId);
          compare(projected.projectiles, engine.projectiles, 'actualLiveProjectileProjection'); liveOrdnance += engine.projectiles.length;
          reject(() => copy({ particles: Object.create(Ship.prototype) }), 'simulation prototype copied');
        }
        if (got.view.playerShip !== got.view.ships.find(s => s.id === got.view.playerShip.id) || got.hud.read.playerShip !== got.hud.read.ships.find(s => s.id === got.hud.read.playerShip.id)) throw Error('Lost roster alias');
        strict += 2;
        if (phase === 0) {
          reject(() => new RustCombatPresentation(content, 7).capture(snapshot, { ...facts, epoch: 8 }), 'wrong epoch');
          reject(() => new RustCombatPresentation(content, 7).capture(snapshot, { ...facts, ships: facts.ships.slice(1) }), 'missing body');
          const partial: { -readonly [K in keyof RustPresentationFacts['visuals']]?: RustPresentationFacts['visuals'][K] } = { ...facts.visuals }; delete partial.particles;
          reject(() => new RustCombatPresentation(content, 7).capture(snapshot, { ...facts, visuals: partial as RustPresentationFacts['visuals'] }), 'missing mandatory visual publication');
          reject(() => new CombatPresentationEncoder(7).captureDetached({ ...frame.presentation, view: { ...frame.presentation.view, playerShip: engine.playerShip } }, snapshot.tick), 'nested Ship');
        }
      }
    } finally { core.dispose(); }
  }
  {
    const spec = validateShipPack(bundledShipPacks[0], false, bundledShipPacks).compiled[0], engine = new CombatEngine(), seed = 8821;
    engine.setSeed(seed); engine.fxSystem.clear(); engine.asteroids.length = 0; engine.nebulae.length = 0;
    const entries = [{ stableId: 'player_ship', spec, team: 0, player: true, position: [0, 600] as const, facing: -.5 },
      { stableId: 'enemy_ship', spec, team: 1, player: false, position: [0, -600] as const, facing: .5 },
      { stableId: 'reserve-last', spec, team: 0, player: true, position: [20, 600] as const, facing: -.5, deployment: 'reserve' as const }];
    const content = compileRustContent({ ships: entries, seed });
    const roots = entries.map(entry => new Ship(entry.stableId, spec, entry.player, new Vector2(...entry.position), entry.facing, engine.random, engine.visualRandom));
    engine.playerShip = roots[0]; engine.enemyShip = roots[1]; roots[1].fireControlMode = 'AI'; engine.reinforcements.push(roots[2]);
    engine.fighterSystem.init(engine.playerShip, engine.enemyShip); engine.deployment.configure(roots, new Set([roots[0].id, roots[1].id]), 20000);
    engine.isTacticalMap = true; updateCombatVisibility(engine.ships);
    const core = await RustCombatCore.create(wasm, seed);
    try {
      for (const batch of content.batches) core.apply(batch.commands);
      const player = content.entities[0], enemy = content.entities[1];
      core.apply([{ kind: 'initialize-battle-world', id: player.id, handle: player.handle, enemy: { id: enemy.id, handle: enemy.handle }, asteroids: false }]); core.apply(content.finalize);
      const snapshot = core.snapshot(), facts = factsFor(engine, content, snapshot, 1), projector = new RustCombatPresentation(content, 7);
      const frame = projector.capture(snapshot, facts), expected = new CombatPresentationDecoder(7).apply(new CombatPresentationEncoder(7).capture(engine, 0));
      const got = new CombatPresentationDecoder(7).apply(new CombatPresentationEncoder(7).captureDetached(frame.presentation, 0));
      compare(got.hud.read, expected.hud.read, 'reserveHud'); compare(got.hud.deployment, expected.hud.deployment, 'reserveDeployment'); compare(got.hud.map, expected.hud.map, 'reserveMap');
      compare(got.view.ships.length, 2, 'reserveNotLive'); compare(got.hud.read.reserveIds, ['reserve-last'], 'actualReserveList');
      const reserve = content.entities.find(e => e.stableId === 'reserve-last')!, reserveBody = snapshot.bodies.find(b => b.id === reserve.id)!;
      const absentSnapshot = { ...snapshot, bodies: snapshot.bodies.filter(b => b.id !== reserve.id) };
      const reserveFacts = { ...facts, ships: facts.ships.map(f => f.id === reserve.id ? { ...f, reserveInitial: reserveBody } : f) };
      const absent = new RustCombatPresentation(content, 7).capture(absentSnapshot, reserveFacts);
      compare(absent.presentation.hud.deployment, frame.presentation.hud.deployment, 'reserveConstructorDisplay');
      reject(() => new RustCombatPresentation(content, 7).capture(absentSnapshot, facts), 'reserve missing initial state');
      reject(() => projector.capture(snapshot, facts), 'duplicate publication revision');
    } finally { core.dispose(); }
  }
  { let deep: unknown = null; for (let i = 0; i < 130; i++) deep = { child: deep }; reject(() => copy(deep), 'presentation depth budget'); }
  reject(() => copy({ particles: new Float64Array(8_000_001) }), 'presentation data budget');
  return { passed: true, scenes: scenes + 1, packScenes: scenes, publications: scenes * 4 + 2, strict, geometry, maxError, guards, sourceDetachedCompared: true,
    actualWasmBodySnapshots: true, sourceEncodedOrdnanceAndTerrainProjectionOnly: true, nonemptyProjectiles, nonemptyBeams, orderedAudio,
    realShipModuleWingRosters: true, nonemptyVisualsAndOrderedAudio: true, actualReserveDeploymentAndConstructorDisplay: true, actualLiveSourceOrdnanceProjection: liveOrdnance,
    productionIntegrated: false, fullBattleReady: false };
}
