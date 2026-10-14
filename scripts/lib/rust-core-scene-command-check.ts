import { worldFixture, lifecycleWords, type WorldFixture, type WorldActor } from './rust-core-ai-resident-fixture';
import { encodeRustSceneShipCommand, compileRustSceneSystemMetadata, encodeRustSceneSystemMetadata, type RustSceneShipCommand } from '../../src/engine/runtime/rust/RustSceneShipCommandProtocol';
import { decodeRustSceneSystemPublication } from '../../src/engine/runtime/rust/RustSceneSystemPublication';
import { compileRustFlightMeta } from '../../src/engine/runtime/rust/RustContentCompilerFlight';
import { compileRustResidentAI } from '../../src/engine/runtime/rust/RustAIAdmission';
import { emptyCombatPolicy } from '../../src/engine/ai/learning/CombatPolicy';
import { applyCombatControlCommand } from '../../src/engine/runtime/CombatControl';
import { captureCombatAudio, type CombatAudioEvent } from '../../src/engine/audio/CombatAudioEvents';
import { Vector2 } from '../../src/engine/math/Vector2';
import { GRAVITY_SYSTEM_IDS as GID, GRAVITY_HULL_ID } from '../../src/engine/content/GravityIds';
import { HYPERION_HULL_ID } from '../../src/engine/content/HyperionIds';
import { RustShipFlag } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { encodeRustSceneAdmission, encodeRustSceneControl, type RustSceneControl } from '../../src/engine/runtime/rust/RustSceneProtocol';
import { applyTacticalCommand, type TacticalCommand } from '../../src/engine/runtime/TacticalControl';
import { applyPreparedDeployment, type PreparedDeployment } from '../../src/engine/runtime/DeploymentControl';
import { FleetCommandSystem } from '../../src/engine/simulation/systems/FleetCommandSystem';
import { FighterSystem } from '../../src/engine/simulation/systems/FighterSystem';
import { DroneSystem } from '../../src/engine/simulation/systems/DroneSystem';
import { CombatDeployment, deploymentCost } from '../../src/engine/simulation/CombatDeployment';

import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import type { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';


interface Ex { memory: WebAssembly.Memory; test_command_input(id: number, words: number): number; test_command_install(id: number): number;
  test_command_run(id: number): number; test_command_state(id: number): number; test_command_publish(id: number, observation: number): number;
  test_command_scene_install(id: number): number; test_command_scene_state(id: number): number;
  test_command_words(id: number): number; test_command_save(id: number): number; test_command_restore(id: number): number }
function abi(core: RustCombatCore) { const { id, exports: ex } = core as unknown as { id: number; exports: Ex };
  return { input(v: readonly number[]) { new Float64Array(ex.memory.buffer, ex.test_command_input(id, v.length), v.length).set(v); },
    install() { return ex.test_command_install(id); }, run() { return ex.test_command_run(id); }, state() { return ex.test_command_state(id); },
    sceneInstall() { return ex.test_command_scene_install(id); }, sceneState() { return ex.test_command_scene_state(id); },
    publish(observation = 0) { const pointer = ex.test_command_publish(id, observation), count = ex.test_command_words(id); if (!count) throw Error('Native read failed'); return new Float64Array(ex.memory.buffer, pointer, count).slice(); },
    save() { return ex.test_command_save(id); }, restore() { return ex.test_command_restore(id); } };
}
function packet(tag: number, id: number, h: { slot: number; generation: number }, values: number[]): number[] {
  const row = [tag, id, h.slot, h.generation, ...values]; while (row.length < 26) row.push(0); return row;
}
function flightAdmission(f: WorldFixture): number[] {
  const ships = f.ships, handles = new Map(ships.map((s, i) => [s, f.handles[i]]));
  const meta = ships.map((s, i) => compileRustFlightMeta(s, i + 1, f.handles[i], s => handles.get(s)!, () => { throw Error('Unexpected fixture craft template'); }, s.spec.id));
  const names = ships.map(s => s.id).sort((a, b) => a.localeCompare(b)), slots = [...new Set(ships.flatMap(s => s.weapons.map(m => m.slotId)))].sort((a, b) => a.localeCompare(b));
  const data = { version: 1, initializeWings: false, templates: [], drone: { launchers: [] },
    collation: { namespaces: names.map((prefix, rank) => ({ prefix, rank, dynamic: false })), alphabet: Array.from(':0123456789abcdefghijklmnopqrstuvwxyz').sort((a, b) => a.localeCompare(b)).map((c, rank) => ({ code: c.charCodeAt(0), rank })), mounts: slots.map((slot, rank) => ({ slot, rank })) },
    ships: meta, roots: meta.filter(m => !m.module && !m.sourceCarrier).map(m => m.handle), carrierOrder: [], wings: [], craftModes: [], formation: { slots: [], footprints: [] } };
  const text = JSON.stringify(data), rows = [packet(133, 1, f.handles[0], [1, text.length, ships.length])];
  for (let offset = 0; offset < text.length; offset += 20) { const count = Math.min(20, text.length - offset); rows.push(packet(134, 1, f.handles[0], [offset, count, ...Array.from({ length: count }, (_, i) => text.charCodeAt(offset + i))])); }
  rows.push(packet(135, 1, f.handles[0], []));
  rows.push(...encodeRustSceneSystemMetadata(compileRustSceneSystemMetadata(ships, handles, new Map(ships.map((s, i) => [s, i + 1]))), 1, f.handles[0])); return rows.flat();
}
class Observe { private at = 0; constructor(private readonly v: Float64Array) {} n() { const n = this.v[this.at++]; if (!Number.isFinite(n)) throw Error('Observation truncated'); return n; } flag() { return this.n() === 1; }
  string() { const n = this.n(); return String.fromCharCode(...Array.from({ length: n }, () => this.n())); } optional() { return this.flag() ? this.string() : undefined; } point() { return [this.n(), this.n()]; }
  finish() { if (this.at !== this.v.length) throw Error('Observation trailing'); } }
function observation(v: Float64Array) { const r = new Observe(v), result = r.flag() ? { accepted: r.flag(), reason: r.optional() } : undefined;
  const manual = r.point(), target = r.flag() ? r.point() : undefined, ships = Array.from({ length: r.n() }, () => {
    const id = r.n(), aim = r.point(), systems = Array.from({ length: r.n() }, () => ({ id: r.n(), input: r.flag() ? { point: r.point(), origin: r.point(), velocity: r.point(), facing: r.n() } : undefined })); return { id, aim, systems, recall: r.flag() }; });
  const texts = Array.from({ length: r.n() }, () => ({ id: r.n(), position: r.point(), text: r.string(), color: [r.n(), r.n(), r.n()], size: r.n(), life: r.n(), maxLife: r.n() }));
  const audio = Array.from({ length: r.n() }, (): CombatAudioEvent => { const kind = r.n(); if (kind === 0) { const key = r.string(), volume = r.n(), rate = r.n(), position = r.flag() ? r.point() as [number, number] : undefined, listener = r.flag() ? r.point() as [number, number] : undefined, maxDistance = r.flag() ? r.n() : undefined; return { kind: 'play', key, volume, rate, ...(position ? { position } : {}), ...(listener ? { listener } : {}), ...(maxDistance !== undefined ? { maxDistance } : {}) }; }
    if (kind === 1) return { kind: 'loop', key: r.string(), volume: r.n(), active: r.flag() }; if (kind === 2) return { kind: 'muffled', value: r.flag() }; throw Error('Unknown audio'); });
  const cp = r.n(), sequence = r.n(), map = r.flag(), simulationLimit = r.n(), unit = () => r.n() === 0 ? 'fleet' as const : r.point();
  const selected = r.flag() ? unit() : undefined, orders = Array.from({ length: r.n() }, () => { const owner = unit(), id = r.string(), kind = r.n(), target = r.flag() ? r.point() : undefined, point = r.flag() ? r.point() : undefined, time = r.n(); return { owner, id, kind, target, point, time }; });
  const roots = Array.from({ length: r.n() }, () => ({ handle: r.point(), cost: r.n(), status: r.n() }));
  const radio = Array.from({ length: r.n() }, () => ({ id: r.n(), sender: r.string(), senderFaction: r.string(), text: r.string(), color: [r.n(), r.n(), r.n()], time: r.n() }));
  r.finish(); return { result, manual, target, ships, texts, audio, tactical: { cp, sequence, map, simulationLimit, selected, orders, roots, radio } }; }

function installContext(f: WorldFixture): ReturnType<typeof abi> {
  const a = abi(f.core), ships = f.ships, handles = new Map(ships.map((s, i) => [s, f.handles[i]])); ships.forEach(s => { s.combatShips = ships; });
  const ai = compileRustResidentAI(ships, handles, new Map(ships.flatMap(s => s.weapons.map((m, i) => [m, i + 1] as const))), new Map());
  f.core.apply(ships.flatMap((s, i) => [{ kind: 'initialize-fire-query', id: i + 1, handle: f.handles[i],
    ship: { visibility: [0, 1].map(team => ({ team, visible: s.isVisibleTo(team) })), scope: ships.map((_, j) => ({ id: j + 1, handle: f.handles[j] })), player: s.isPlayer, vast: s.hasVastBulk, nativeThreat: s.hasNativeThreatPhaseHooks,
      accuracy: s.hullStats.autofireAimAccuracy, finish: 1, pressure: 1, tieRank: ai[i].localeRank },
    mounts: s.weapons.map((m, j) => ({ flags: ai[i].mounts[j].stageFlags, hints: ai[i].mounts[j].stageHints, baseAngleDeg: m.baseAngleDeg, arcDeg: m.arcDeg, turnRateDeg: m.spec.turnRateDegPerSec ?? 30, sizeScale: .25, schedulingSalt: 1, initialIdle: m.aimIdleSeconds ?? 15.1 })) },
    { kind: 'fire-controls', id: i + 1, handle: f.handles[i], aim: [s.aimTargetWorld.x, s.aimTargetWorld.y], trigger: s.isFiringMain, ai: false }] as import('../../src/engine/runtime/rust/RustCoreProtocol').RustCommand[]));
  f.core.apply([{ kind: 'initialize-ai-world', id: 1, handle: f.handles[0], data: { actors: ai, policy: emptyCombatPolicy() } }]);
  a.input(flightAdmission(f)); if (a.install()) throw Error('Actual command metadata installation failed'); return a;
}

export async function checkRustSceneCommands(wasm: BufferSource) {
  let strictFields = 0, geometricFields = 0, commands = 0, statusReads = 0, rollback = 0, readOnly = 0, exactClones = 0;
  function equal(a: unknown, b: unknown, label: string, geometry = false): void { if (typeof a === 'number' && typeof b === 'number' && geometry) {
      geometricFields++; const tolerance = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b))); if (Math.abs(a - b) > tolerance) throw Error(label + ': ' + a + ' != ' + b); return; }
    if (Array.isArray(a) && Array.isArray(b)) { equal(a.length, b.length, label + '.length'); a.forEach((v, i) => equal(v, b[i], label + '[' + i + ']', geometry)); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { const x = a as Record<string, unknown>, y = b as Record<string, unknown>; equal(Object.keys(x).filter(k => x[k] !== undefined).sort(), Object.keys(y).filter(k => y[k] !== undefined).sort(), label + '.keys'); for (const k of Object.keys(x)) equal(x[k], y[k], label + '.' + k, geometry || /^(x|y|position|facing|destinationFacing|originFacing|targetAngle|turnRemaining)$/.test(k)); return; }
    strictFields++; if (a !== b) throw Error(label + ': ' + String(a) + ' != ' + String(b)); }
  const scenarios: WorldActor[][] = [
    [{ system: 1, gun: {}, shield: 'OMNI' }, { gun: {} }],
    [{ hull: HYPERION_HULL_ID, systemTypes: ['WEB_SC2_HYPERION_YAMATO', 'WEB_SC2_HYPERION_JUMP'], builtins: ['web_sc2_hyperion_reactor'], traits: 6, gun: {}, shield: 'OMNI' }, { gun: {} }],
    [{ systemTypes: ['WEB_ADUN_ARK_FORGE', 'WEB_ADUN_ARK_BARRIER', 'WEB_ADUN_ARK_REPAIR'], gun: {}, shield: 'FRONT' }, { gun: {} }],
    [{ systemTypes: ['WEB_ROCINANTE_ATTITUDE', 'WEB_ROCINANTE_FIRE_CONTROL'], gun: {}, shield: 'OMNI', motion: true }, { gun: {} }],
    [{ system: 10, gun: {}, shield: 'FRONT' }, { gun: {} }],
    [{ shield: 'PHASE', gun: {} }, { gun: {} }],
    [{ system: 2, hull: 'web_gloriana', traits: 1, gun: {}, shield: 'FRONT' }, { gun: {} }],
    ...Object.values(GID).map(id => [{ hull: GRAVITY_HULL_ID, systemTypes: [id], gun: {}, shield: 'OMNI', motion: true, velocity: [80, 0] }, { gun: {} }] as WorldActor[]),
  ].map((rows, i) => rows.map((a, j) => ({ ...a, position: j === 0 ? [0, 0] : [700, 100], team: j, facing: 0, hp: i === 2 && j === 0 ? 800 : undefined })) as WorldActor[]);
  for (const [scenario, actors] of scenarios.entries()) {
    const f = await worldFixture(wasm, 'scene-commands-' + scenario, actors, 28391 + scenario), a = installContext(f), ships = f.ships, root = ships[0];
    const texts: { id: number; position: number[]; text: string; color: number[]; size: number; life: number; maxLife: number }[] = [], audio: CombatAudioEvent[] = [];
    const engine = { playerShip: root, ships, asteroidSystem: f.asteroids, get asteroids() { return f.asteroids.asteroids; },
      addFloatingText(position: Vector2, text: string, color: [number, number, number], size: number, life: number) { texts.push({ id: f.visual.next(), position: [position.x, position.y], text, color: [...color], size, life, maxLife: life }); } } as unknown as CombatEngine;
    const stop = captureCombatAudio(e => audio.push(e));
    function hud(label: string) { const before = f.core.snapshot(), facts = decodeRustSceneSystemPublication(a.publish());
      for (const [i, s] of ships.entries()) { for (const [j, sys] of s.allSystems.entries()) { const actual = facts.systems.find(v => v.id === i + 1 && v.systemId === j + 1); if (!actual) throw Error('Missing system fact');
          const expected = { id: i + 1, systemId: j + 1, isActive: sys.isActive, available: sys.available, activationFailureReason: sys.activationFailureReason, statusText: sys.statusText, passiveStatusText: sys.passiveStatusText,
            fortressVisualLevel: sys.fortressVisualLevel, pulseOffset: 0, gravityControlHeld: sys.gravityControlHeld, gravityPolarity: sys.gravityPolarity, gravityField: sys.gravityField, gravityPush: sys.gravityPush, gravityManeuver: sys.gravityManeuver, teleportVisual: sys.teleportVisual };
          equal(actual, expected, label + '/ship' + i + '/sys' + j); statusReads++; }
        for (const [j, mount] of s.weapons.entries()) equal(facts.mounts.find(v => v.id === i + 1 && v.componentId === j + 1), { id: i + 1, componentId: j + 1, presentationRelativeAngle: undefined, gravityTractor: mount.gravityTractor, gravityDeflection: mount.gravityDeflection }, label + '/mount');
        equal(facts.ships.find(v => v.id === i + 1), { id: i + 1, presentationPose: undefined, teleportCameraOffset: s.teleportCameraOffset }, label + '/pose'); }
      const first = a.publish(), second = a.publish(); equal(Array.from(first), Array.from(second), label + '/repeat'); const after = f.core.snapshot(); equal(before.random, after.random, label + '/read RNG'); equal(before.visualRandom, after.visualRandom, label + '/read visual RNG'); equal(before.bodies.map(b => Array.from(b.motion)), after.bodies.map(b => Array.from(b.motion)), label + '/read authority'); readOnly++; }
    function command(c: RustSceneShipCommand, label: string) { label = 'scenario' + scenario + '/' + label; a.input(encodeRustSceneShipCommand(c, 1, f.handles[0]).flat()); equal(a.run(), 0, label + '/native admitted');
      const expected = applyCombatControlCommand(engine, { kind: 'ship', ...c }), actual = observation(a.publish(1)); equal(actual.result, expected, label + '/result');
      equal(actual.texts, texts, label + '/text'); equal(actual.audio, audio, label + '/audio'); const snapshot = f.core.snapshot();
      ships.forEach((s, i) => { equal(actual.ships[i].aim, [s.aimTargetWorld.x, s.aimTargetWorld.y], label + '/aim', true); equal(actual.ships[i].recall, s.fighterRecall, label + '/recall');
        equal(snapshot.bodies[i].ship!.systems.map(sys => Array.from(sys.values.slice(2))), s.allSystems.map(lifecycleWords), label + '/lifecycle');
        equal(snapshot.bodies[i].ship!.flux[8], s.flux.softFlux, label + '/soft'); equal(snapshot.bodies[i].ship!.flux[9], s.flux.hardFlux, label + '/hard');
        equal(!!snapshot.bodies[i].ship!.flux[14], s.flux.isVenting, label + '/venting');
        const sh = snapshot.bodies[i].ship!.shield!; equal(!!sh[6], s.shield.isActive, label + '/shield'); equal(!!sh[11], (s.shield as unknown as { pendingRaise: boolean }).pendingRaise, label + '/requested');
        equal(snapshot.bodies[i].ship!.weapons!.groups.map(g => Array.from(g.values.slice(0, 3))), s.weaponGroups.map(g => [g.index, +(g.mode === 'ALTERNATING'), +g.isAutofire]), label + '/groups');
        s.allSystems.forEach((sys, j) => { const input = sys.activationInput; equal(actual.ships[i].systems[j].input, input ? { point: [input.point.x, input.point.y], origin: [input.origin.x, input.origin.y], velocity: [input.velocity.x, input.velocity.y], facing: input.facing } : undefined, label + '/input', true); }); });
      equal(snapshot.random, f.random.checkpointWitness(), label + '/random'); equal(snapshot.visualRandom, f.visual.checkpointWitness(), label + '/visual'); equal(snapshot.tick, 0, label + '/paused tick'); equal(snapshot.combatTime, 0, label + '/paused time'); commands++; hud(label); }
    function state(sid: number, field: number, n: number) { a.input([0, sid, field, n]); equal(a.state(), 0, 'state setup'); const sys = sid ? root.allSystems[sid - 1] : undefined;
      if (sys) { const p = sys as unknown as { outEntryEffectLevel: number }; switch (field) { case 0: sys.state = (['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'] as const)[n]; sys.isActive = n > 0 && n < 4; sys.isCoolingDown = n === 4; break; case 1: sys.effectLevel = n; break; case 2: sys.activeTimer = n; break; case 3: sys.cooldownTimer = n; break; case 4: sys.charges = n; break; case 5: (sys as unknown as { pendingActivationFlux: number }).pendingActivationFlux = n; break; case 6: sys.disabled = n === 1; break; case 7: p.outEntryEffectLevel = n; break; } }
      else { switch (field) { case 0: root.isDead = !!(n & RustShipFlag.Dead); root.isRetreated = !!(n & RustShipFlag.Retreated); root.isDocked = !!(n & RustShipFlag.Docked); root.retreating = !!(n & RustShipFlag.Retreating); break; case 1: root.hullHp = n; break; case 2: root.flux.softFlux = n; break; case 3: root.flux.hardFlux = n; break; case 4: root.flux.isOverloaded = n === 1; break; case 5: root.flux.isVenting = n === 1; break; case 6: root.hullStats.ventRateMultiplier = n; break; case 7: root.crEffects.defenseDisabled = n === 1; break; case 8: root.runtimeModifiers.set('oracle-current', { disableDefense: n, disableVenting: n, disableWeapons: n, disableSystems: n }); break; case 9: root.shield.phaseState = (['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'] as const)[n]; break; } } }
    try {
      hud('initial' + scenario);
      command({ command: { kind: 'system', value: 127 }, aim: [812, 34] }, 'missing system');
      command({ command: { kind: 'target' } }, 'target no aim'); command({ command: { kind: 'target' }, aim: [700, 100] }, 'target acquire'); command({ command: { kind: 'target' }, aim: [700, 100] }, 'target clear');
      command({ command: { kind: 'recall' } }, 'recall unavailable');
      command({ command: { kind: 'group', value: 0 } }, 'select group'); command({ command: { kind: 'mode', value: 0 } }, 'toggle mode'); command({ command: { kind: 'autofire', value: 0 } }, 'toggle autofire');
      command({ command: { kind: 'hullShield' }, facing: NaN, aim: [300, 40] }, 'invalid facing precheck');
      command({ command: { kind: 'hullShield' } }, 'shield edge'); command({ command: { kind: 'hullShield' } }, 'shield second edge');
      if (scenario === 1) { command({ command: { kind: 'system', value: 1 } }, 'jump missing'); command({ command: { kind: 'system', value: 1 }, aim: [1, 0] }, 'jump near'); command({ command: { kind: 'system', value: 1 }, aim: [700, 100] }, 'jump collision'); }
      command({ command: { kind: 'system', value: 0 }, aim: scenario === 6 ? [0, 800] : [800, 0] }, 'actual system');
      if (scenario !== 5) for (const [j, sys] of root.allSystems.entries()) if (sys.available) {
        for (const phase of [0, 1, 2, 3, 4]) { state(j + 1, 0, phase); state(j + 1, 1, .5); state(j + 1, 2, 2.675); state(j + 1, 3, 1.25); hud('lifecycle phase' + phase); }
        state(j + 1, 0, 0); state(j + 1, 1, 0); state(j + 1, 5, 0); }
      if (scenario === 1) { command({ command: { kind: 'system', value: 1 }, aim: [1200, -700], facing: 9.3 }, 'jump valid facing'); command({ command: { kind: 'system', value: 0 }, aim: [800, 0] }, 'shared reactor busy'); state(2, 0, 0); state(2, 5, 0); }
      if (scenario === 2) { command({ command: { kind: 'system', value: 1 } }, 'shared barrier actual'); command({ command: { kind: 'system', value: 2 } }, 'shared reconstruction qualification'); }
      state(0, 8, 1); command({ command: { kind: 'hullShield' } }, 'current runtime defense'); command({ command: { kind: 'system', value: 0 }, aim: [900, 0] }, 'current runtime system'); state(0, 8, 0);
      state(0, 2, 100); command({ command: { kind: 'vent' } }, 'vent actual'); command({ command: { kind: 'vent' } }, 'vent already'); state(0, 5, 0);
      const before = a.publish(1), snapshot = f.core.snapshot(); const invalid = encodeRustSceneShipCommand({ command: { kind: 'group', value: 0 } }, 1, f.handles[0]).flat(); invalid[3]++;
      a.input(invalid); equal(a.run(), 4, 'stale transaction'); equal(Array.from(a.publish(1)), Array.from(before), 'stale observe rollback'); equal(f.core.snapshot().random, snapshot.random, 'stale random rollback'); rollback++;
      const malformed = encodeRustSceneShipCommand({ command: { kind: 'group', value: 0 } }, 1, f.handles[0]).flat(); malformed[25] = 1; a.input(malformed); equal(a.run(), 2, 'padding transaction'); equal(Array.from(a.publish(1)), Array.from(before), 'padding observe rollback'); rollback++;
      equal(a.save(), 0, 'complete save'); const saved = a.publish(); state(0, 1, 0); equal(a.restore(), 0, 'complete restore'); equal(Array.from(a.publish()), Array.from(saved), 'complete cloned dynamic read'); exactClones++;
    } finally { stop(); f.core.dispose(); }
  }
  let runtimeCommands = 0;
  const runtimeActors: WorldActor[] = [0, 1, 0, 0].map((team, i) => ({ team, position: [i * 700, i * 80], facing: 0, gun: {}, shield: 'OMNI', motion: true }));
  runtimeActors.push({ team: 0, parent: 0, position: [0, 200], facing: 0, gun: {}, shield: 'OMNI', motion: true });
  const f = await worldFixture(wasm, 'actual tactical/deployment control', runtimeActors, 993171), a = installContext(f), ships = f.ships;
  ships.forEach(s => Object.assign(s.spec, { deploymentPoints: 20 }));
  const e = Object.create(CombatEngine.prototype) as CombatEngine;
  Object.assign(e, { playerShip: ships[0], enemyShip: ships[1], reinforcements: ships.slice(2).filter(s => !s.parentShip), primaryEnemyDeployed: true, combatTime: 0,
    commandSystem: new FleetCommandSystem(f.visual), fighterSystem: new FighterSystem(f.random, f.visual), droneSystem: new DroneSystem(f.random, f.visual), fxSystem: f.fx,
    isSimulation: true, simulationPointLimit: 240, simulationCosts: new Map(ships.map(s => [s.id, deploymentCost(s.spec)])) });
  Object.assign(e, { deployment: new CombatDeployment(e) }); e.deployment.configure(ships.filter(s => !s.parentShip), new Set(ships.slice(0, 3).map(s => s.id)), 40);
  const admission = { enemy: f.handles[1], enabled: true, limit: 40, simulation: true, simulationLimit: 240, primaryEnemyDeployed: true, multiTeam: false, open: true,
    autopilot: false, commandRate: 0, manualWeapon: f.handles[0], aiProfile: 'standard' as const, multirate: true,
    roots: ships.flatMap((s, i) => s.parentShip ? [] : [{ handle: f.handles[i], cost: deploymentCost(s.spec), pending: i === 3, station: s.isStation, radius: s.deploymentRadius }]), automaticTeams: [], externallyControlled: [], fullRate: [] };
  a.input(encodeRustSceneAdmission(admission, 1, f.handles[0]).flat()); equal(a.sceneInstall(), 0, 'actual scene installation');
  const sourceAudio: CombatAudioEvent[] = [], stop = captureCombatAudio(v => sourceAudio.push(v));
  const handleId = (id: string) => { const i = ships.findIndex(s => s.id === id); if (i < 0) throw Error('Unknown source identity'); return [f.handles[i].slot, f.handles[i].generation]; };
  const sourceUnit = (id: string) => id === 'fleet' ? 'fleet' as const : handleId(id);
  function runtime(c: RustSceneControl | number, source: () => { accepted: boolean; reason?: string }, label: string) {
    a.input(typeof c === 'number' ? packet(197, 1, f.handles[0], [c]) : encodeRustSceneControl(c, 1, f.handles[0]).flat()); equal(a.run(), 0, label + '/native transaction');
    let expected; try { expected = source(); } catch (error) { expected = { accepted: false, reason: error instanceof Error ? error.message : String(error) }; }
    const actual = observation(a.publish(1)); equal(actual.result, expected, label + '/receipt'); equal(actual.audio, sourceAudio, label + '/audio');
    equal(actual.texts, f.fx.floatingTexts.map(t => ({ id: t.id, position: [t.pos.x, t.pos.y], text: t.text, color: t.color, size: t.size, life: t.life, maxLife: t.maxLife })), label + '/floating');
    equal(actual.tactical, { cp: e.commandPoints, sequence: (e.commandSystem as unknown as { orderSequence: number }).orderSequence, map: e.isTacticalMap, simulationLimit: e.simulationPointLimit,
      selected: e.selectedUnitId === null ? undefined : sourceUnit(e.selectedUnitId),
      orders: [...e.orders].map(([owner, o]) => ({ owner: sourceUnit(owner), id: o.id, kind: ['ASSAULT', 'ENGAGE', 'AVOID', 'DEFEND', 'ESCORT', 'WAYPOINT'].indexOf(o.type), target: o.targetShipId ? handleId(o.targetShipId) : undefined, point: o.targetPos ? [o.targetPos.x, o.targetPos.y] : undefined, time: o.issuedTime })),
      roots: e.deployment.snapshot().rows.map(r => ({ handle: handleId(r.id), cost: r.cost, status: ['reserve', 'deployed', 'retreating', 'retreated', 'destroyed'].indexOf(r.status) })), radio: e.radioMessages }, label + '/tactical');
    const snap = f.core.snapshot(); equal(snap.random, f.random.checkpointWitness(), label + '/RNG'); equal(snap.visualRandom, f.visual.checkpointWitness(), label + '/visual RNG'); equal(snap.tick, 0, label + '/paused tick');
    ships.forEach((s, i) => { equal(Array.from(snap.bodies[i].motion.slice(0, 6)), [s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.facingRad, s.angularVelRad], label + '/pose' + i, true); equal(!!(snap.bodies[i].ship!.flags & RustShipFlag.Retreating), s.retreating, label + '/retreat' + i); equal(!!(snap.bodies[i].ship!.flags & RustShipFlag.Retreated), s.isRetreated, label + '/retreated' + i); }); runtimeCommands++;
  }
  const friendly = (i: number) => ({ handle: f.handles[i] }), fleet = { fleet: true } as const;
  const tactical = (c: RustSceneControl, source: TacticalCommand, label: string) => runtime(c, () => applyTacticalCommand(e, source), label);
  const deploy = (c: RustSceneControl | number, source: PreparedDeployment, label: string) => runtime(c, () => applyPreparedDeployment(e, source), label);
  function sceneState(field: number, n: number, index = 0) { a.input([field, index, n]); equal(a.sceneState(), 0, 'controlled scene state'); }
  function shipState(i: number, field: number, n: number) { a.input([i, 0, field, n]); equal(a.state(), 0, 'controlled ship state'); if (field === 0) { ships[i].isDead = !!(n & RustShipFlag.Dead); ships[i].isRetreated = !!(n & RustShipFlag.Retreated); ships[i].isDocked = !!(n & RustShipFlag.Docked); ships[i].retreating = !!(n & RustShipFlag.Retreating); } else if (field === 1) ships[i].hullHp = n; }
  try {
    runtime({ kind: 'toggle-map' }, () => applyCombatControlCommand(e, { kind: 'toggle-map' }), 'map edge');
    runtime({ kind: 'pilot', autopilot: true }, () => applyCombatControlCommand(e, { kind: 'pilot', autopilot: true }), 'actual autopilot');
    runtime({ kind: 'pilot', autopilot: false }, () => applyCombatControlCommand(e, { kind: 'pilot', autopilot: false }), 'actual manual pilot');
    tactical({ kind: 'select', unit: fleet }, { action: 'select', unitId: 'fleet' }, 'select fleet');
    tactical({ kind: 'select', unit: friendly(0) }, { action: 'select', unitId: ships[0].id }, 'select root');
    tactical({ kind: 'select', unit: friendly(0) }, { action: 'select', unitId: ships[0].id }, 'select no-op');
    tactical({ kind: 'select', unit: friendly(1) }, { action: 'select', unitId: ships[1].id }, 'select enemy');
    tactical({ kind: 'target', target: f.handles[1] }, { action: 'target', targetId: ships[1].id }, 'target source enemy');
    tactical({ kind: 'target', target: f.handles[2] }, { action: 'target', targetId: ships[2].id }, 'target source friend');
    shipState(2, 1, 0); tactical({ kind: 'select', unit: friendly(2) }, { action: 'select', unitId: ships[2].id }, 'select HP0 view');
    tactical({ kind: 'order', unit: friendly(2), type: 'ASSAULT' }, { action: 'order', unitId: ships[2].id, order: { type: 'ASSAULT' } }, 'order HP0 reject'); shipState(2, 1, 1000);
    tactical({ kind: 'order', unit: friendly(1), type: 'ASSAULT' }, { action: 'order', unitId: ships[1].id, order: { type: 'ASSAULT' } }, 'order enemy reject');
    tactical({ kind: 'order', unit: friendly(0), type: 'ESCORT', target: f.handles[4] }, { action: 'order', unitId: ships[0].id, order: { type: 'ESCORT', targetShipId: ships[4].id } }, 'escort actual attached component target');
    tactical({ kind: 'order', unit: fleet, type: 'ASSAULT' }, { action: 'order', unitId: 'fleet', order: { type: 'ASSAULT' } }, 'fleet assault');
    tactical({ kind: 'cancel', unit: friendly(2) }, { action: 'cancel', unitId: ships[2].id }, 'cancel implicit fleet');
    tactical({ kind: 'order', unit: friendly(0), type: 'WAYPOINT', position: [450, 230] }, { action: 'order', unitId: ships[0].id, order: { type: 'WAYPOINT', position: [450, 230] } }, 'waypoint actual');
    tactical({ kind: 'order', unit: friendly(2), type: 'ENGAGE', target: f.handles[1] }, { action: 'order', unitId: ships[2].id, order: { type: 'ENGAGE', targetShipId: ships[1].id } }, 'engage actual');
    tactical({ kind: 'order', unit: friendly(0), type: 'AVOID', target: f.handles[1] }, { action: 'order', unitId: ships[0].id, order: { type: 'AVOID', targetShipId: ships[1].id } }, 'avoid actual');
    tactical({ kind: 'cancel-target', target: f.handles[1] }, { action: 'cancel-target', targetId: ships[1].id }, 'cancel all owned target');
    sceneState(0, 0); e.commandPoints = 0;
    tactical({ kind: 'order', unit: friendly(0), type: 'DEFEND', position: [80, 0] }, { action: 'order', unitId: ships[0].id, order: { type: 'DEFEND', position: [80, 0] } }, 'CP exhausted actual');
    tactical({ kind: 'order', unit: friendly(0), type: 'ESCORT', target: f.handles[0] }, { action: 'order', unitId: ships[0].id, order: { type: 'ESCORT', targetShipId: ships[0].id } }, 'self escort order sequence');
    sceneState(0, 5); e.commandPoints = 5;
    tactical({ kind: 'escort', ships: [f.handles[0], f.handles[2]], team: 0, target: f.handles[2] }, { action: 'escort', unitIds: [ships[0].id, ships[2].id], targetId: ships[2].id }, 'group self escort sequence');
    tactical({ kind: 'escort', ships: [f.handles[2]], team: 0, target: f.handles[0] }, { action: 'escort', unitIds: [ships[2].id], targetId: ships[0].id }, 'escort actual');
    tactical({ kind: 'order', unit: friendly(0), type: 'ASSAULT', target: f.handles[2] }, { action: 'order', unitId: ships[0].id, order: { type: 'ASSAULT', targetShipId: ships[2].id } }, 'supplied irrelevant target validation');
    deploy({ kind: 'deploy', ships: [f.handles[3]], team: 0 }, { kind: 'fleet', ids: [ships[3].id] }, 'DP limit rejection');
    deploy({ kind: 'deploy', ships: [f.handles[1]], team: 0 }, { kind: 'fleet', ids: [ships[1].id] }, 'wrong team deployment');
    deploy({ kind: 'deploy', ships: [f.handles[0]], team: 0 }, { kind: 'fleet', ids: [ships[0].id] }, 'already deployed rejection');
    deploy(20, { kind: 'simulation-limit', limit: 20 }, 'simulation below occupancy');
    deploy(40, { kind: 'simulation-limit', limit: 40 }, 'simulation occupancy equality');
    sceneState(2, 0); e.isSimulation = false; deploy(100, { kind: 'simulation-limit', limit: 100 }, 'non simulation rejection'); sceneState(2, 1); e.isSimulation = true;
    shipState(2, 1, 0); deploy(20, { kind: 'simulation-limit', limit: 20 }, 'HP0 still simulation occupancy'); shipState(2, 1, 1000);
    sceneState(3, 60); e.deployment.limit = 60; deploy({ kind: 'deploy', ships: [f.handles[3]], team: 0 }, { kind: 'fleet', ids: [ships[3].id] }, 'reserve admission position');
    tactical({ kind: 'escort', ships: [f.handles[2], f.handles[3]], team: 0, target: f.handles[0] }, { action: 'escort', unitIds: [ships[2].id, ships[3].id], targetId: ships[0].id }, 'actual one CP escort group');
    tactical({ kind: 'retreat', ships: [], team: 0, withdraw: false }, { action: 'retreat', unitIds: [], full: false }, 'empty retreat rejection');
    sceneState(6, 1, 2); Object.assign(ships[2], { spec: { ...ships[2].spec, sourceHullTraits: ['STATION'] } });
    tactical({ kind: 'retreat', ships: [f.handles[2]], team: 0, withdraw: false }, { action: 'retreat', unitIds: [ships[2].id], full: false }, 'station retreat rejection');
    sceneState(6, 0, 2); Object.assign(ships[2], { spec: { ...ships[2].spec, sourceHullTraits: [] } });
    tactical({ kind: 'retreat', ships: [f.handles[1]], team: 0, withdraw: false }, { action: 'retreat', unitIds: [ships[1].id], full: false }, 'hostile retreat rejection');
    tactical({ kind: 'retreat', ships: [f.handles[3]], team: 0, withdraw: false }, { action: 'retreat', unitIds: [ships[3].id], full: false }, 'actual retreat');
    tactical({ kind: 'retreat', ships: [f.handles[3]], team: 0, withdraw: false }, { action: 'retreat', unitIds: [ships[3].id], full: false }, 'duplicate retreat state');
    sceneState(4, 1); e.battleResult = {} as NonNullable<CombatEngine['battleResult']>;
    tactical({ kind: 'select', unit: friendly(0) }, { action: 'select', unitId: ships[0].id }, 'post result select allowed');
    tactical({ kind: 'close-map' }, { action: 'close' }, 'post result close allowed');
    tactical({ kind: 'order', unit: fleet, type: 'ASSAULT' }, { action: 'order', unitId: 'fleet', order: { type: 'ASSAULT' } }, 'post result order reject');
    deploy(200, { kind: 'simulation-limit', limit: 200 }, 'post result deployment reject');
    runtime({ kind: 'pilot', autopilot: true }, () => applyCombatControlCommand(e, { kind: 'pilot', autopilot: true }), 'post result pilot reject');
    const before = a.publish(1), invalid = encodeRustSceneControl({ kind: 'order', unit: fleet, type: 'ASSAULT' }, 1, f.handles[0]).flat(); invalid[3]++;
    a.input(invalid); equal(a.run(), 4, 'runtime stale rollback'); equal(Array.from(a.publish(1)), Array.from(before), 'runtime stale exact'); rollback++;
    const malformed = encodeRustSceneControl({ kind: 'retreat', ships: [f.handles[0]], team: 0, withdraw: false }, 1, f.handles[0]).flat(); malformed[malformed.length - 1] = 1;
    a.input(malformed); equal(a.run(), 2, 'runtime multilist rollback'); equal(Array.from(a.publish(1)), Array.from(before), 'runtime list exact'); rollback++;
  } finally { stop(); f.core.dispose(); }
  return { passed: true, scenarios: scenarios.length, commands, runtimeCommands, statusReads, strictFields, geometricFields, rollback, readOnly, exactClones, actualSourceCommands: true, actualSourceGetters: true, actualTacticalDeployment: true, productionIntegrated: false, fullBattleReady: false };
}
