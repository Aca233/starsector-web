// Actual Core + actual StageProducer/AIBatch/CombatAIPhase joint differential.
import { worldFixture, assertWorld, type WorldActor } from './rust-core-ai-resident-fixture';
import { compileRustResidentAI, type RustResidentActorMeta } from '../../src/engine/runtime/rust/RustAIAdmission';
import type { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';
import { RustShipFlag, type RustCommand, type RustBodyHandle } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { CapitalShipAI } from '../../src/engine/ai/CapitalShipAI';
import { CombatAIPhase } from '../../src/engine/ai/CombatAIPhase';
import { FireControlQueryRoster } from '../../src/engine/ai/FireControlQueryBatch';
import { beginStage } from '../../src/engine/ai/batch/StageProducer';
import { tacticalPolicy } from '../../src/engine/ai/TacticalWorld';
import type { Ship } from '../../src/engine/simulation/Ship';
import type { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import type { TacticalOrder } from '../../src/engine/simulation/CombatTypes';
import { Vector2 } from '../../src/engine/math/Vector2';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { HYPERION_HULL_ID, HYPERION_HULLMODS } from '../../src/engine/content/HyperionIds';
import { ADUN_ARK_ID } from '../../src/engine/content/AdunArkIds';
import { GLORIANA_HULL_ID } from '../../src/engine/content/GlorianaPack';
import { ZHEFENG_ID, ZHEFENG_MODS } from '../../src/engine/content/ZhefengIds';
import { GRAVITY_HULL_ID, GRAVITY_SYSTEM_IDS as GID } from '../../src/engine/content/GravityIds';
import { worldSystemIds } from './rust-core-ai-resident-fixture';
import { POLICY_TUNING, shipPolicyAction } from '../../src/engine/ai/learning/CombatPolicy';
import { validateCombatPolicy, emptyCombatPolicy } from '../../src/engine/ai/learning/CombatPolicy';
import bundledPolicy from '../../src/engine/ai/learning/combat-policy.json';
import { encodeRustAIAdmission } from '../../src/engine/runtime/rust/RustAIProtocol';
import { lockedCombatTarget } from '../../src/engine/runtime/CombatTargeting';
import { cursorTurnCommand } from '../../src/engine/runtime/PlayerControls';
import { compareAIGravity } from './rust-core-ai-gravity-observation';
interface TestExports { memory: WebAssembly.Memory; test_ai_input(id: number, n: number): number;
  test_ai_install(id: number): number; test_ai_phase(id: number): number; test_ai_publish(id: number): number; test_ai_words(id: number): number;
  test_ai_defense(id: number, slot: number): number; test_ai_save(id: number): number; test_ai_restore(id: number): number;
  core_publish(id: number): number; core_output_words(id: number): number }
const roles = ['LINE', 'BRAWLER', 'ARTILLERY', 'SKIRMISHER', 'CARRIER', 'UNARMED'];
const tasks = ['PRESSURE', 'FINISH', 'SCREEN', 'SUPPORT', 'REGROUP', 'DISENGAGE', 'SEARCH'];
const modes = ['IDLE', 'ENGAGE', 'WITHDRAW', 'ESCORT', 'AVOID', 'DEFEND', 'WAYPOINT'];
const positions = ['BASELINE', 'FIRE_LANE', 'COVER'], defenseModes = ['UP', 'DOWN', 'PHASE', 'VENTING'];
function utf(s: string): number[] { return [s.length, ...Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))]; }
const maybeHandle = (v: RustBodyHandle | undefined): number[] => v === undefined ? [0] : [1, v.slot, v.generation];
function salt(value: string) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function fixtureABI(core: RustCombatCore) {
  const binding = core as unknown as { id: number; exports: TestExports }, ex = binding.exports, id = binding.id;
  const write = (packet: number[]) => { const p = ex.test_ai_input(id, packet.length); new Float64Array(ex.memory.buffer, p, packet.length).set(packet); };
  const encode = (meta: RustResidentActorMeta[], anchor: RustBodyHandle) =>
    encodeRustAIAdmission({ actors: meta, policy: validateCombatPolicy(bundledPolicy) ? bundledPolicy : emptyCombatPolicy() }, 1, anchor).flat();
  const installWords = (packet: number[]) => { write(packet); return ex.test_ai_install(id); };
  return { encode, installWords, install: (meta: RustResidentActorMeta[], anchor: RustBodyHandle) => installWords(encode(meta, anchor)),
    phase: (packet: number[]) => { write(packet); return ex.test_ai_phase(id); },
    save: () => ex.test_ai_save(id), restore: () => ex.test_ai_restore(id),
    replayStep: (dt: number, tick: number) => (ex as unknown as { core_step(id: number, tick: number, dt: number): number }).core_step(id, tick, dt),
    coreWords: () => { const p = ex.core_publish(id); return Array.from(new Float64Array(ex.memory.buffer, p, ex.core_output_words(id))); },
    defense: (slot: number) => { const p = ex.test_ai_defense(id, slot); return Array.from(new Float64Array(ex.memory.buffer, p, ex.test_ai_words(id))); },
    read: () => { const p = ex.test_ai_publish(id); return new Float64Array(ex.memory.buffer, p, ex.test_ai_words(id)).slice(); } };
}
export async function checkRustAIResident(wasm: BufferSource) {
  let strictFields = 0, geometryFields = 0, steps = 0, liveStages = 0, rollbackChecks = 0, cloneContinuations = 0, startupRollbackChecks = 0, lazyPhases = 0, reservePhases = 0, manualPhases = 0, gravityFields = 0;
  const coverage: Record<string, number> = {}, activationCoverage: Record<string, number> = {}, actualActivationCounts: Record<string, number> = {}, geometryLog: { label: string; actual: number; expected: number }[] = [];
  const compare = (a: number, b: number, label: string, geometry = false, angular = false) => {
    if (!geometry) { strictFields++; if (!Object.is(a, b)) throw Error(`${label}: Rust ${a} vs actual TS ${b}`); return; }
    geometryFields++; if (Object.is(a, b)) return;
    const delta = angular ? Math.atan2(Math.sin(a - b), Math.cos(a - b)) : a - b;
    assertWorld(Number.isFinite(a) && Number.isFinite(b) && Math.abs(delta) <= Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b))),
      `${label}: geometry Rust ${a} vs actual TS ${b}`); geometryLog.push({ label, actual: a, expected: b });
  };
  const quiet = captureCombatAudio(() => {});
  try { for (let scenario = 0; scenario < 29; scenario++) {
    const gun = { damagePerShot: 140, damagePerSecond: 0, range: 750, projSpeed: 480, spawnType: 'BALLISTIC' as const };
    let configs: WorldActor[] = [{ position: [-140, -90], team: 0, shield: scenario === 4 ? 'PHASE' : 'OMNI', gun,
      system: scenario === 2 ? 1 : scenario === 3 ? 10 : scenario === 5 ? 8 : scenario === 6 ? 9 : 0 },
    { position: [-220, 140], team: 0, shield: 'FRONT', gun: { ...gun, range: 950, damagePerShot: 110 } },
    { position: [680, -70], team: 1, gun: { ...gun, range: 650, damagePerShot: 190 } },
    { position: [910, 200], team: 1, gun: { ...gun, range: 1100, damagePerShot: 90 } }];
    if (scenario === 8) configs.forEach((c, i) => { c.motion = true; c.velocity = [27 + i * 11, -36 + i * 13]; c.facing = .17 + i * .41; });
    if (scenario >= 9) {
      const ballistic = { ...gun, weaponType: 'BALLISTIC' as const };
      configs = [{ position: [0, 0], team: 0, shield: 'OMNI', motion: true, gun },
        { position: [-250, 280], team: 0, motion: true, gun },
        { position: [680, 0], team: 1, motion: true, gun }, { position: [980, 200], team: 1, motion: true, gun }];
      if (scenario === 9 || scenario === 10) {
        Object.assign(configs[0], { hull: HYPERION_HULL_ID, size: 'CAPITAL_SHIP', builtins: [HYPERION_HULLMODS.reactor], traits: 6,
          systemTypes: [worldSystemIds[3], worldSystemIds[4]] });
        if (scenario === 10) { configs[2].position = [2800, 0]; configs[3].position = [3100, 200]; }
      } else if (scenario >= 11 && scenario <= 13) {
        Object.assign(configs[0], { hull: ADUN_ARK_ID, size: 'CAPITAL_SHIP', systemTypes: scenario === 11 ? [worldSystemIds[5], worldSystemIds[6], worldSystemIds[7]]
          : scenario === 12 ? [worldSystemIds[6], worldSystemIds[5], worldSystemIds[7]] : [worldSystemIds[7], worldSystemIds[5], worldSystemIds[6]] });
        Object.assign(configs[1], { parent: 0, slot: 'AFT', traits: 32, hp: scenario === 13 ? 600 : 1000, position: [-160, 0] });
      } else if (scenario === 14) {
        Object.assign(configs[0], { hull: GLORIANA_HULL_ID, size: 'CAPITAL_SHIP', system: 2, traits: 1 });
        Object.assign(configs[1], { parent: 0, slot: 'P1', side: -1, facing: -Math.PI / 2, position: [0, -130], gun: ballistic });
        configs[2].position = [40, -650]; configs[3].position = [450, -980];
      } else if (scenario === 15) {
        Object.assign(configs[0], { system: 8, role: 'AXIAL', hardpoint: true, gun: ballistic }); configs[2].position = [600, 430];
      } else if (scenario === 16) Object.assign(configs[0], { system: 9, role: 'POINT_DEFENSE', gun: { ...ballistic, isPointDefense: true } });
      else if (scenario === 17) Object.assign(configs[0], { hull: ZHEFENG_ID, system: 10, builtins: [ZHEFENG_MODS.capacitor], shield: 'FRONT', dissipation: 200, gun: ballistic });
      else if (scenario >= 18 && scenario < 23) {
        Object.assign(configs[0], { hull: GRAVITY_HULL_ID, systemTypes: [scenario === 18 ? GID.well : scenario === 19 ? GID.battleWell
          : scenario === 20 ? GID.repulsor : scenario === 21 ? GID.battleRepulsor : GID.maneuver] });
        if (scenario === 20) { configs[2].position = [280, 0]; configs[3].position = [0, 350]; }
        if (scenario === 21) configs[2].position = [150, 0];
        // With no usable battery the real policy withdraws below .6 flux,
        // admitting the committed vector-turn callback without a fake flag.
        if (scenario === 22) { configs[0].gun = { ...gun, maxAmmo: 0 }; configs[0].velocity = [0, 100]; }
      }
      if (scenario === 24) Object.assign(configs[1], { parent: 0, position: [80, 60], independent: true });
      if (scenario >= 25) {
        configs.forEach(c => { c.maxHp = 100000; c.hp = 100000; });
        Object.assign(configs[0], { hull: GRAVITY_HULL_ID, systemTypes: scenario === 25 ? [GID.well, GID.release]
          : scenario === 26 ? [GID.well, GID.collapse] : scenario === 27 ? [GID.polarity] : [GID.well] });
      }
    }
    const f = await worldFixture(wasm, 'ai-resident-' + scenario, configs, 9411 + scenario, scenario === 7),
      abi = fixtureABI(f.core), ships = f.ships, handles = new Map(ships.map((s, i) => [s, f.handles[i]])),
      active = scenario === 23 ? ships.filter((_, i) => i !== 1) : ships,
      entries = scenario === 24 ? ships.slice(1) : active,
      ais = ships.map((s, i) => new CapitalShipAI(s, ships[scenario >= 23 ? 1 : i < 2 ? 2 : 0]));
    ships.forEach(s => { s.fireControlMode = scenario === 24 && (s === ships[0] || s === ships[1]) ? 'MANUAL' : 'AI'; s.combatShips = active; });
    if (scenario === 24) { ships[0].playerTargetId = ships[2].id; ships[1].playerTargetId = ships[2].id; ships[1].isFiringMain = true; ships[1].aimTargetWorld.set(700, 80); }
    const orders = new Map<string, TacticalOrder>(), owner = { ships: active, playerShip: ships[0], orders, externallyControlledShipIds: new Set(),
      projectiles: f.weapon.projectiles, beams: f.weapon.beams, asteroids: f.asteroids.asteroids, hulkFragments: f.fx.hulkFragments } as unknown as CombatEngine;
    FireControlQueryRoster.ownForWorker(owner);
    const metadata = compileRustResidentAI(ships, handles, new Map(ships.flatMap(s => s.weapons.map((m, i) => [m, i + 1] as const))),
      scenario >= 23 ? new Map() : new Map(ais.map(ai => [ai.ship, ai.targetShip])));
    const queryCommands: RustCommand[] = ships.flatMap((s, i) => [{ kind: 'initialize-fire-query', id: i + 1, handle: f.handles[i],
      ship: { visibility: [0, 1].map(team => ({ team, visible: s.isVisibleTo(team) })), scope: active.map(other => ({ id: ships.indexOf(other) + 1, handle: handles.get(other)! })),
        player: s.isPlayer, vast: s.hasVastBulk, nativeThreat: s.hasNativeThreatPhaseHooks,
        noFireThrough: s.spec.sourceHullTraits?.includes('do_not_fire_through'), pdIgnoresFlares: s.hullStats.pdIgnoresFlares,
        accuracy: s.hullStats.autofireAimAccuracy, finish: POLICY_TUNING[shipPolicyAction(s)].finish,
        pressure: POLICY_TUNING[shipPolicyAction(s)].pressure, tieRank: metadata[i].localeRank },
      mounts: s.weapons.map((m, j) => ({ flags: metadata[i].mounts[j].stageFlags, hints: metadata[i].mounts[j].stageHints, baseAngleDeg: m.baseAngleDeg,
        arcDeg: m.arcDeg, turnRateDeg: m.spec.turnRateDegPerSec ?? 30,
        sizeScale: m.spec.isPointDefense || m.spec.aiHints?.some(h => h === 'PD' || h === 'PD_ONLY') || m.spec.mountSize === 'SMALL' ? .25 : m.spec.mountSize === 'MEDIUM' ? .5 : 1,
        accuracyBonus: m.spec.autofireAccuracyBonus, passFighters: !!m.spec.passThroughFighters && !m.spec.passThroughFightersOnlyWhenDestroyed,
        proximity: m.spec.proximityFuse?.range, schedulingSalt: salt(s.id + '/' + m.slotId), initialIdle: m.aimIdleSeconds ?? 15.1 })) },
    { kind: 'fire-controls', id: i + 1, handle: f.handles[i], aim: [s.aimTargetWorld.x, s.aimTargetWorld.y], trigger: s.isFiringMain, ai: s.fireControlMode === 'AI' }] as RustCommand[]);
    f.core.apply(queryCommands);
    const wire = abi.encode(metadata, f.handles[0]);
    if (scenario === 0) {
      // Allocate the empty test input buffer before observing sidecar publication.
      // Real Core authority remains untouched until complete actual admission.
      assertWorld(abi.installWords([]) !== 0, 'empty startup must fail');
      const firstActor = wire.findIndex((value, index) => index % 26 === 0 && value === 122), firstChunk = wire.findIndex((value, index) => index % 26 === 0 && value === 123),
        secondActor = wire.findIndex((value, index) => index > firstActor && index % 26 === 0 && value === 122), firstMount = wire.findIndex((value, index) => index % 26 === 0 && value === 126),
        firstSystem = wire.findIndex((value, index) => index % 26 === 0 && value === 127), secondInitial = wire.findIndex((value, index) => index % 26 === 0 && value === 128 && wire[index + 4] === 1),
        altered = (index: number, value: number) => { const copy = wire.slice(); copy[index] = value; return copy; },
        duplicateActor = wire.slice(); duplicateActor[secondActor + 4] = wire[firstActor + 4]; duplicateActor[secondActor + 5] = wire[firstActor + 5];
      const failures = [wire.slice(0, -26), altered(firstActor + 5, wire[firstActor + 5] + 1), altered(firstChunk + 6, 1), duplicateActor,
        altered(firstChunk + 8, 88), altered(firstMount + 6, 999), altered(firstSystem + 7, 99), altered(secondInitial + 7, 0), [...wire, ...wire.slice(-26)],
        altered(firstMount + 25, 1)];
      for (const words of failures) {
        const before = abi.coreWords(), memory = Array.from(abi.read()); assertWorld(abi.installWords(words) !== 0, 'invalid actual startup must fail');
        const after = abi.coreWords(); compare(after.length, before.length, 'startup full authority length'); before.forEach((v, i) => compare(after[i], v, 'startup full authority rollback'));
        const afterMemory = abi.read(); compare(afterMemory.length, memory.length, 'startup memory length'); memory.forEach((v, i) => compare(afterMemory[i], v, 'startup memory rollback')); startupRollbackChecks++;
      }
    }
    compare(abi.installWords(wire), 0, 'actual startup wire installation');
    if (scenario === 0) { const before = abi.coreWords(), memory = Array.from(abi.read()); assertWorld(abi.installWords(wire) !== 0, 'repeated startup rejected');
      const after = abi.coreWords(); before.forEach((v, i) => compare(after[i], v, 'repeat startup full rollback')); memory.forEach((v, i) => compare(abi.read()[i], v, 'repeat startup memory rollback')); startupRollbackChecks++; }
    if ([12, 17].includes(scenario)) f.shield(0, true);
    if (scenario === 27) f.activate(0);
    if (scenario === 12) { ships[0].flux.increaseFluxClamped(5500, false); f.core.apply([{ kind: 'flux', id: 1, handle: f.handles[0], operation: 'increase-clamped', amount: 5500 }]); }
    const orderPacket = (order: TacticalOrder | undefined) => order ? [1, ...utf(order.id), ['ENGAGE', 'AVOID', 'DEFEND', 'ESCORT', 'WAYPOINT'].indexOf(order.type),
      ...maybeHandle(order.targetShipId ? handles.get(ships.find(s => s.id === order.targetShipId)!) : undefined),
      ...(order.targetPos ? [1, order.targetPos.x, order.targetPos.y] : [0]), order.issuedTime] : [0];
    const identity = (s: Ship | undefined | null) => s ? maybeHandle(handles.get(s)) : [0, 0, 0];
    function verify(tick: number) {
      const actual = abi.read(), snap = f.core.snapshot(); let cursor = 0;
      compare(actual[cursor++], ships.length, 'resident count');
      ships.forEach((ship, row) => {
        const ai = ais[row] as unknown as Record<string, unknown>, d = ship.tacticalAI,
          def = ai['defense'] as { quietFor: number; safeVentFor: number }, ident = (v: string | undefined) => identity(ships.find(s => s.id === v));
        if (!entries.includes(ship)) {
          [f.handles[row].slot, f.handles[row].generation, 0, NaN, 0].forEach((v, k) => compare(actual[cursor++], v, `inactive memory${k}`));
          const body = snap.bodies[row]; [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.facingRad, ship.angularVelRad]
            .forEach((v, k) => compare(body.motion[k], v, `inactive actor${row} pose${k}`, true, k === 4)); return;
        }
        const expected = [f.handles[row].slot, f.handles[row].generation, 1, ...identity(ais[row].targetShip), def.quietFor, def.safeVentFor,
          ai['forecastRemaining'], +!!ai['forecastFarThreat'], ai['forecastEarliest'], ai['forecastDefenseWindow'], Math.max(0, ai['forecastRosterSize'] as number),
          +!!ai['withdrawing'], +!!ai['attachedMotionLast'], ai['tacticalRemaining'], +!!ai['multiratePlanningLast'], ai['multirateRemaining'],
          ...ident(ai['tacticalTargetId'] as string | undefined), ai['tacticalRange'], ai['tacticalBearing'], ai['tacticalFirepower'], ai['tacticalWeapons'],
          ai['tacticalX'], ai['tacticalY'], ai['tacticalFacing'], +!!ai['tacticalYielding'], positions.indexOf(ai['tacticalPositioning'] as string),
          ai['tacticalScoreGain'] ?? NaN, ai['tacticalClearFire'] ?? NaN, ai['decisionRemaining'], ai['decisionElapsed'], ...ident(ai['decisionTargetId'] as string | undefined),
          ai['tacticalPhase'], ai['multiratePhase'], ship.defenseFacingRad ?? NaN, +!!d];
        // Arrival forecasts are pure geometry outputs, not advancing clocks.
        const geometric = new Set([10, 21, 22, 25, 26, 27, 30, 31, 39]);
        expected.forEach((v, k) => compare(actual[cursor++], v as number, `scene${scenario} tick${tick} ship${row} memory${k}`, geometric.has(k), [22, 27, 39].includes(k)));
        if (d) {
          const expected = [roles.indexOf(d.fleetRole!), tasks.indexOf(d.fleetTask!), d.targetScore ?? NaN, d.pressureRatio ?? NaN, d.assignedPower ?? NaN,
            modes.indexOf(d.mode), d.desiredRange, (ai['tacticalBearing'] as number), d.availableFirepower, ai['tacticalWeapons'], d.desiredFacing,
            positions.indexOf(d.positioning!), d.positionScoreGain ?? NaN, d.clearFireFraction ?? NaN, +(d.motionRole === 'ATTACHED'), +d.avoidingCollision,
            +d.yieldingFireLane, d.incomingDamage, d.incomingShieldFlux, d.earliestThreat ?? NaN, +d.ventSafe, defenseModes.indexOf(d.defense)];
          // Fleet score/pressure are distance-derived diagnostics; target, task,
          // committed power and every actual decision remain strict fields.
          expected.forEach((v, k) => compare(actual[cursor++], v as number, `scene${scenario} tick${tick} ship${row} diagnostics${k}`, [2, 3, 6, 7, 10, 12, 13, 19].includes(k), k === 7 || k === 10));
          coverage[d.mode] = (coverage[d.mode] ?? 0) + 1;
        }
        const rs = snap.bodies[row].ship!, r = snap.bodies[row];
        compare(rs.armor!.values[14], ship.hullHp, `scene${scenario} tick${tick} ship${row} live hull`);
        ship.armor.copyCells().forEach((v, k) => compare(rs.armor!.cells[k], v, `scene${scenario} tick${tick} ship${row} armor${k}`));
        [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.facingRad, ship.angularVelRad]
          .forEach((v, k) => compare(r.motion[k], v, `scene${scenario} tick${tick} ship${row} pose${k}`, true, k === 4));
        [ship.turnInput, +ship.brakeInput, ship.throttle, ship.strafeInput].forEach((v, k) => compare(r.motion[7 + k], v, `ship${row} live control${k}`, k !== 1));
        compare(rs.flux[8], ship.flux.softFlux, 'live soft flux'); compare(rs.flux[9], ship.flux.hardFlux, 'live hard flux');
        compare(rs.shield![6], +ship.shield.isActive, 'live shield'); compare(rs.shield![14], ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'].indexOf(ship.shield.phaseState), 'live phase');
        compare(rs.shield![7], ship.shield.currentArcDeg, 'live shield deployment'); compare(rs.shield![8], ship.shield.facingAngleRad, 'live shield facing', true, true);
        compare(rs.shield![31], ship.aimTargetWorld.x, 'live shield aim x', true); compare(rs.shield![32], ship.aimTargetWorld.y, 'live shield aim y', true);
        ship.allSystems.forEach((sys, j) => { const r = rs.systems[j].values, p = sys as unknown as Record<string, number>, states = ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'];
          [states.indexOf(sys.state), sys.effectLevel, +sys.isActive, +sys.isCoolingDown, sys.activeTimer, sys.cooldownTimer, sys.charges, sys.activationSerial,
            p['pendingActivationFlux'], p['pendingActivationEvents'], p['pendingActiveEvents'], p['chargeRegenTimer'], p['stageTimer'], p['outEntryEffectLevel'], +sys.disabled]
            .forEach((v, k) => compare(r[k + 2], v, `ship${row} system${j} field${k}`));
          if (row === 0 && sys.activationSerial > 0) { activationCoverage[sys.type] = (activationCoverage[sys.type] ?? 0) + 1;
            actualActivationCounts[sys.type] = Math.max(actualActivationCounts[sys.type] ?? 0, sys.activationSerial); }
          const w = rs.systemWorld!, offset = 98 + w[20] * 2 + j * 28;
          // Gravity accepted input is published by its actual owner instead.
          if (!(Object.values(GID) as string[]).includes(sys.type)) {
            compare(w[offset + 3], +!!sys.activationInput, `scene${scenario} ship${row} system${j} accepted input`);
            if (sys.activationInput) {
              const input = sys.activationInput;
              [input.point.x, input.point.y, input.origin.x, input.origin.y, input.velocity.x, input.velocity.y, input.facing]
                .forEach((v, k) => compare(w[offset + 4 + k], v, `scene${scenario} ship${row} system${j} input${k}`, true));
            }
          }
        });
      }); compare(cursor, actual.length, 'exact resident publication length');
      gravityFields += compareAIGravity(snap.world, ships, f.handles, f.serials, compare, `scene${scenario} tick${tick}`);
      f.random.checkpointWitness().forEach((v, i) => compare(snap.random[i], v, 'combat RNG')); f.visual.checkpointWitness().forEach((v, i) => compare(snap.visualRandom[i], v, 'visual RNG'));
    }
    for (let tick = 0; tick < (scenario === 25 ? 64 : 32); tick++) {
      if (scenario === 28 && (tick === 8 || tick === 16)) { ships[0].isDead = tick === 8;
        f.core.apply([{ kind: 'ship-flags', id: 1, handle: f.handles[0], flags: ships[0].isDead ? RustShipFlag.Dead : 0,
          hardFluxDissipationFraction: ships[0].hullStats.hardFluxDissipationFraction, zeroFluxMinimum: ships[0].hullStats.zeroFluxMinimumFluxLevel,
          allowZeroFluxAtAnyLevel: ships[0].hullStats.allowZeroFluxAtAnyLevel }]); }
      if (scenario === 1) orders.set(ships[0].id, { id: 'order', type: tick < 8 ? 'DEFEND' : tick < 16 ? 'AVOID' : tick < 24 ? 'ESCORT' : 'WAYPOINT',
        targetShipId: tick < 24 ? ships[tick < 16 ? 2 : 1].id : undefined, targetPos: new Vector2(100, 300), issuedTime: 0 });
      if (scenario === 4 && tick === 2) { ships[0].flux.increaseFluxClamped(9300, false); f.core.apply([{ kind: 'flux', id: 1, handle: f.handles[0], operation: 'increase-clamped', amount: 9300 }]); }
      const world = { ships: active, projectiles: f.weapon.projectiles, beams: f.weapon.beams, asteroids: f.asteroids.asteroids, multiratePlanning: scenario === 7,
        compactThreatForecastEligible: scenario === 7, weaponThreatFrameEligible: scenario === 7 };
      const stage = beginStage(owner, 'AI_PLAN', world); assertWorld(stage, 'real stage admission'); const phase = new CombatAIPhase(owner, active); assertWorld(phase.numericEnabled, 'real numeric phase'); liveStages++;

      const packet = [1, entries.length];
      ais.filter(ai => entries.includes(ai.ship)).forEach(ai => { const order = orders.get(ai.ship.id), sample = scenario === 0, dt = tick === 19 ? .083 : scenario === 16 ? .05 : 1 / 60,
        elapsed = sample ? ai.sampleDecision(dt, order ?? null, active, true) : dt;
        packet.push(handles.get(ai.ship)!.slot, handles.get(ai.ship)!.generation, dt, +sample, +(scenario === 7), +(scenario === 7), +(scenario === 7), .05, .05, ...orderPacket(order));
        if (elapsed !== null) phase.plan(ai, elapsed, order ?? null, world); });
      if (scenario >= 23) packet.push(active.length, ...active.flatMap(s => [handles.get(s)!.slot, handles.get(s)!.generation]), scenario === 24 ? 1 : 0,
        ...(scenario === 24 ? [handles.get(ships[1])!.slot, handles.get(ships[1])!.generation, ...maybeHandle(handles.get(ships[2]))] : []));
      if (scenario === 24 && phase.has(ships[1])) { const s = ships[1], trigger = s.isFiringMain, aim = s.aimTargetWorld.clone();
        phase.afterShip(s, () => { s.fireControlMode = 'MANUAL'; s.isFiringMain = trigger; s.aimTargetWorld.copy(aim); s.playerTargetId = s.assemblyRoot.playerTargetId;
          s.currentTargetShip = lockedCombatTarget(active, s); s.aiHoldOffensiveFire = false;
          s.turnInput = s.system.locksTurning || s.flux.isOverloaded ? 0 : cursorTurnCommand(s.facingRad, s.angularVelRad, Math.atan2(aim.y - s.pos.y, aim.x - s.pos.x), s.getMotionStats().turnDeceleration); }); }
      phase.execute(); const replay = scenario === 9 && tick === 21;
      if (replay) compare(abi.save(), 0, 'actual Core authority checkpoint clone');
      compare(abi.phase(packet), 0, `scene${scenario} tick${tick} resident phase`); verify(tick); steps++;
      if (scenario >= 23) lazyPhases++; if (scenario === 23) reservePhases++; if (scenario === 24) manualPhases++;
      if (scenario >= 9 && scenario !== 23 && scenario !== 24) { await f.step(.1, [], true);
        const snap = f.core.snapshot(); ships.forEach((s, row) => s.weapons.forEach((m, j) => {
          compare(snap.bodies[row].ship!.weapons!.mounts[j][15], m.currentAngleRad, `scene${scenario} tick${tick} physical ship${row} mount${j} angle`, true, true);
          compare(snap.bodies[row].ship!.weapons!.mounts[j][16], m.cooldownTimer, `scene${scenario} tick${tick} physical ship${row} mount${j} cooldown`);
        }));
        compare(snap.projectiles.length, f.weapon.projectiles.length, 'physical projectile count');
        f.weapon.projectiles.forEach((p, j) => {
          const r = snap.projectiles[j]; compare(r[0], f.serials.get(p.id)!, `physical projectile${j} identity`);
          [p.pos.x, p.pos.y, p.prevPos.x, p.prevPos.y, p.vel.x, p.vel.y, p.facingRad ?? 0]
            .forEach((v, k) => compare(r[12 + k], v, `physical projectile${j} geometry${k}`, true, k === 6));
          compare(r[19], p.damage, `physical projectile${j} damage`);
          compare(r[24], p.elapsedTime, `physical projectile${j} clock`);
        }); verify(tick);
        if (replay) {
          const before = Array.from(abi.read()), coreBefore = abi.coreWords();
          compare(abi.restore(), 0, 'restore cloned full Core + AI authorities'); compare(abi.phase(packet), 0, 'replayed AI phase'); compare(abi.replayStep(.1, f.tick - 1), 0, 'replayed actual physical Core step');
          const replayAI = abi.read(), replayCore = abi.coreWords(); compare(replayAI.length, before.length, 'AI continuation publication length');
          before.forEach((v, i) => compare(replayAI[i], v, `AI clone continuation field${i}`)); compare(replayCore.length, coreBefore.length, 'Core continuation publication length');
          coreBefore.forEach((v, i) => compare(replayCore[i], v, `full Core clone continuation field${i}`)); cloneContinuations++;
        }
      }
      if (tick === 15) { const before = Array.from(abi.read()), snap = Array.from(f.core.snapshot().random), bad = packet.slice(); bad[3]++;
        compare(abi.phase(bad), 4, 'stale generation rejection'); before.forEach((v, i) => compare(abi.read()[i], v, 'memory rollback'));
        snap.forEach((v, i) => compare(f.core.snapshot().random[i], v, 'RNG rollback')); rollbackChecks++; }
    }
    f.core.dispose();
  } } finally { quiet(); }
  assertWorld(actualActivationCounts[GID.maneuver] > 0, 'real withdrawal vector turn activation');
  assertWorld(actualActivationCounts[GID.release] > 0, 'real aged well remote release activation');
  assertWorld(actualActivationCounts[GID.collapse] > 0, 'real well collapse activation');
  assertWorld(actualActivationCounts[GID.polarity] >= 2, 'real polarity AI return activation');
  return { passed: true, steps, strictFields, geometryFields, gravityFields, liveStages, rollbackChecks, cloneContinuations, startupRollbackChecks, lazyPhases, reservePhases, manualPhases, coverage, activationCoverage, actualActivationCounts, geometryLog, actualStageProducer: true,
    actualCombatAIPhase: true, actualCoreAuthorities: true, productionIntegrated: false, fullBattleReady: false, policy: tacticalPolicy };
}
