import '../../src/engine/simulation/CombatEngine';
import { bundledShipPacks } from '../../src/engine/modding/BundledShipPacks';
import { validateShipPack } from '../../src/engine/modding/ShipPackValidation';
import { compileRustContent } from '../../src/engine/runtime/rust/RustContentCompiler';
import { encodeRustVisualAdmission } from '../../src/engine/runtime/rust/RustVisualAdmission';
import { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';
import { decodeRustVisualFrame } from '../../src/engine/runtime/rust/RustVisualProtocol';
import { decodeRustWorld } from '../../src/engine/runtime/rust/RustWorldProtocol';
import { rustPresentationFloating } from '../../src/engine/runtime/rust/RustCombatPresentationTerrain';
import { Ship } from '../../src/engine/simulation/Ship';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { CombatShipStatusSystem } from '../../src/engine/simulation/systems/CombatShipStatusSystem';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { FleetCommandSystem } from '../../src/engine/simulation/systems/FleetCommandSystem';
import { captureCombatAudio, type CombatAudioEvent } from '../../src/engine/audio/CombatAudioEvents';
interface Oracle extends WebAssembly.Exports { memory: WebAssembly.Memory; core_input(id: number, n: number): number; test_status(id: number, mode: number): number; test_status_output(id: number): number; test_status_words(id: number): number }
export async function checkRustNativeStatus(wasm: BufferSource) {
  let strict = 0, geometry = 0, maximumDifference = 0, publications = 0, guards = 0;
  const compare = (a: unknown, b: unknown, path: string): void => {
    if (typeof a === 'number' && typeof b === 'number') { if (/\.(x|y|diameter|radius|rotation|facingRad|size)$/.test(path)) { geometry++; const difference = Math.abs(a - b); if (difference > Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)))) throw Error(path + ': geometry differs'); maximumDifference = Math.max(maximumDifference, difference); } else { strict++; if (!Object.is(a, b)) throw Error(`${path}: ${a} / ${b}`); } return; }
    if (Array.isArray(a) || ArrayBuffer.isView(a)) { if (!Array.isArray(b) && !ArrayBuffer.isView(b)) throw Error(path + ': array type differs'); const aa = Array.from(a as ArrayLike<unknown>), bb = Array.from(b as ArrayLike<unknown>); compare(aa.length, bb.length, path + '.count'); aa.forEach((v, i) => compare(v, bb[i], `${path}[${i}]`)); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { const aa = Object.keys(a), bb = Object.keys(b); if (aa.length !== bb.length || aa.some(k => !bb.includes(k))) throw Error(`${path}: keys ${aa} / ${bb}`); strict++; for (const k of aa) compare((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k); return; }
    strict++; if (a !== b) throw Error(path + ': value differs');
  };
  const cases: { pack: string; actors: number; publications: number }[] = [];
  for (const pack of bundledShipPacks) {
    const spec = validateShipPack(pack, false, bundledShipPacks).compiled[0], seed = 733, visualSeed = (seed ^ 0x9e3779b9) >>> 0;
    const content = compileRustContent({ ships: [{ stableId: 'player', spec, team: 0, player: true, position: [12, 51], facing: .17, velocity: [3, -2] }, { stableId: 'enemy', spec, team: 1, player: false, position: [1012, 51], facing: 2.17, velocity: [-2, 3] }], seed, initializeWings: false });
    const random = new SimulationRandom(seed), visualRandom = new SimulationRandom(visualSeed);
    const player = new Ship('player', spec, true, new Vector2(12, 51), .17, random, visualRandom), enemy = new Ship('enemy', spec, false, new Vector2(1012, 51), 2.17, random, visualRandom); player.vel.set(3, -2); enemy.vel.set(-2, 3); enemy.teamId = 1;
    const all = [...player.assemblyShips, ...enemy.assemblyShips], caps = all;
    const status = new CombatShipStatusSystem(), fx = new CombatFXSystem(visualRandom), command = new FleetCommandSystem(visualRandom);
    const core = await RustCombatCore.create(wasm, seed), internals = core as unknown as { exports: Oracle; id: number }, native = internals.exports;
    const p = content.entities[0], e = content.entities.find(s => s.stableId === 'enemy')!;
    try {
      for (const batch of content.batches) core.apply(batch.commands.filter(c => c.kind !== 'initialize-gravity-ship'));
      core.apply([{ kind: 'initialize-battle-world', id: p.id, handle: p.handle, enemy: { id: e.id, handle: e.handle }, asteroids: false }]);
      core.applyPacked(new Float64Array(encodeRustVisualAdmission(content, p.id, p.handle).flat()));
      core.apply(content.finalize);
      const audio: CombatAudioEvent[] = []; let audioSequence = 0;
      for (const mode of [0, 3, 1, 3, 2]) {
        if (mode < 3) {
          for (let i = 0; i < all.length; i++) { const ship = all[i]; ship.isDead = false; ship.isDocked = false; ship.flux.isOverloaded = false; ship.flux.isVenting = false; ship.justShieldMalfunction = false;
            if (mode === 0) { if (i === 0) ship.flux.isOverloaded = true; if (content.entities[i].id === 2) ship.flux.isVenting = true; }
            if (mode === 1 && i === 0) { ship.justShieldMalfunction = true; ship.flux.isOverloaded = true; }
            if (ship.weapons[0]) { ship.weapons[0].isPermanentlyDisabled = mode === 1; ship.justDisabledMounts.push(ship.weapons[0]); } if (ship.weapons[1]) ship.justRepairedMounts.push(ship.weapons[1]);
            if (ship.engineStatuses.length) ship.engineController.justDisabledEngines.push(0); ship.engineController.justFlamedOut = true; ship.engineController.justRestarted = true;
            if (mode === 2) { if (i === 0) ship.isDead = true; if (content.entities[i].id === 2) ship.isDocked = true; }
          }
          if (mode <= 1) player.justCriticalDamage.push({ local: new Vector2(9, 13), armorDamage: 17, hullDamage: 5 });
        } else audio.length = 0;
        const newRadio: typeof command.radioMessages = [];
        const stop = captureCombatAudio(event => { audio.push(event); audioSequence++; });
        try { status.update(0, { fx, playerShip: player, enemyShip: enemy, ships: caps, componentShips: all, combatRandom: random, visualRandom,
          addRadioMessage: (sender, faction, text, color) => { command.addRadioMessage(sender, faction, text, color, .5); newRadio.push(command.radioMessages.at(-1)!); }, deployMine: () => { throw Error('Unexpected source mine dispatch'); } }); } finally { stop(); }
        const handles = caps.flatMap(s => { const h = content.entities.find(e => e.stableId === s.id)!.handle; return [h.slot, h.generation]; });
        const pointer = native.core_input(internals.id, handles.length); new Float64Array(native.memory.buffer, pointer, handles.length).set(handles);
        const code = native.test_status(internals.id, mode); if (code) throw Error(pack.id + ' native status rejected ' + code);
        const data = Array.from(new Float64Array(native.memory.buffer, native.test_status_output(internals.id), native.test_status_words(internals.id))); let at = 0;
        const text = () => { const n = data[at++]; let out = ''; for (let j = 0; j < n; j++) out += String.fromCharCode(data[at++]); return out; };
        const radio = Array.from({ length: data[at++] }, () => ({ id: data[at++], sender: text(), senderFaction: text(), text: text(), color: [data[at++], data[at++], data[at++]], time: data[at++] }));
        const worldSize = data[at++], world = decodeRustWorld(new Float64Array(data.slice(at, at += worldSize))); const fxSize = data[at++], frame = decodeRustVisualFrame(data.slice(at, at += fxSize));
        compare(radio, newRadio, pack.id + '.radio');
        compare(frame.audio.events, audio, pack.id + '.audio'); compare(frame.audio.sequence, audioSequence, pack.id + '.sequence');
        compare(frame.visuals.particles, fx.particles, pack.id + '.particles'); compare(frame.visuals.hitGlows, fx.hitGlows, pack.id + '.glows'); compare(rustPresentationFloating(world), fx.floatingTexts, pack.id + '.texts');
        compare(data.slice(at), visualRandom.checkpointWitness(), pack.id + '.rng'); publications++;
        const snap = core.snapshot(); for (const [i, b] of snap.bodies.entries()) { const ship = all[i]; compare(b.ship!.weapons!.justDisabled, ship.justDisabledMounts.map(m => ship.weapons.indexOf(m) + 1), pack.id + '.disabledClear'); compare(b.ship!.weapons!.justRepaired, ship.justRepairedMounts.map(m => ship.weapons.indexOf(m) + 1), pack.id + '.repairedClear'); compare(b.ship!.engines!.justDisabled, ship.engineController.justDisabledEngines, pack.id + '.engineClear'); }
      }
      cases.push({ pack: pack.id, actors: all.length, publications: 5 });
    } finally { core.dispose(); }
  }
  for (const bad of [[], [1, 1, 1, 15, ...Array(15).fill(1)]]) { try { decodeRustVisualFrame(bad); } catch { guards++; continue; } throw Error('Accepted malformed status FX'); }
  return { passed: true, cases, publications, strict, geometry, maximumDifference, guards, actualSourceStatus: true, productionIntegrated: false, fullBattleReady: false };
}
