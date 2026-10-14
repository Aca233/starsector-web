import '../../src/engine/simulation/CombatEngine';
import { bundledShipPacks } from '../../src/engine/modding/BundledShipPacks';
import { validateShipPack } from '../../src/engine/modding/ShipPackValidation';
import { compileRustContent } from '../../src/engine/runtime/rust/RustContentCompiler';
import { encodeRustCommands, RustComponentField as C, RustEngineField as E } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import { Ship } from '../../src/engine/simulation/Ship';
import { Vector2 } from '../../src/engine/math/Vector2';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { FighterSystem } from '../../src/engine/simulation/systems/FighterSystem';
import { hullModDefinitions } from '../../src/engine/extensions/HullMods';
import { shipSystemDefinitions } from '../../src/engine/extensions/ship-systems/Registry';
import { weaponEffects } from '../../src/engine/extensions/weapon-effects/Registry';
import type { ShipSpec } from '../../src/engine/content/ShipSpec';
import { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';

export async function checkRustContentCompiler(wasm?: BufferSource) {
  let strictFields = 0, guards = 0;
  const check = (a: unknown, b: unknown, label: string) => { strictFields++; if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(label + ': differs'); };
  function data(value: unknown, path: string) {
    if (typeof value === 'function' || value instanceof Ship || value instanceof Map || value instanceof Set) throw Error(path + ': solver leaked');
    if (value && typeof value === 'object') {
      if (!Object.isFrozen(value)) throw Error(path + ': mutable output');
      for (const [key, child] of Object.entries(value)) data(child, path + '.' + key);
    }
  }
  const rows: { pack: string; fit: string; entities: number; modules: number; craft: number; mounts: number; templates: number; commands: number; capabilities: string[] }[] = [];
  const all: ShipSpec[] = [];
  for (const pack of bundledShipPacks) {
    const compiled = validateShipPack(pack, false, bundledShipPacks).compiled;
    for (const [fitIndex, spec] of compiled.entries()) {
      all.push(spec);
      const seed = 1231 + all.length, visualSeed = (seed ^ 0x9e3779b9) >>> 0;
      const entries = [{ stableId: 'root', spec, team: 0, player: true, position: [12, 51] as const, facing: .17, velocity: [3, -2] as const }];
      const result = compileRustContent({ ships: entries, seed, visualSeed }); data(result, 'compiled');
      for (const batch of result.batches) encodeRustCommands(batch.commands);
      encodeRustCommands(result.finalize);
      const random = new SimulationRandom(seed), visual = new SimulationRandom(visualSeed);
      const root = new Ship('root', spec, true, new Vector2(12, 51), .17, random, visual); root.vel.set(3, -2);
      check(result.startupRNGWitness.afterRoots.combat, random.checkpointWitness(), 'root combat witness');
      check(result.startupRNGWitness.afterRoots.visual, visual.checkpointWitness(), 'root visual witness');
      const flight = new FighterSystem(random, visual); flight.addCarrier(root);
      const ships = [...root.assemblyShips, ...flight.fighters, ...flight.bombers];
      check(result.startupRNGWitness.end.combat, random.checkpointWitness(), 'flight combat witness');
      check(result.startupRNGWitness.end.visual, visual.checkpointWitness(), 'flight visual witness');
      check(result.entities.map(entity => entity.stableId), ships.map(ship => ship.id), 'actual semantic roster');
      for (const [index, ship] of ships.entries()) {
        const state = result.pending.constructorInitial[index];
        check(result.entities[index].mounts.map(mount => mount.sourceSlotId), ship.weapons.map(mount => mount.slotId), 'actual mount order');
        check(state.components.map(component => component.tracker), ship.weapons.map(mount => mount.healthTracker), 'actual weapon tracker');
        check(state.engines.map(engine => engine.tracker), ship.engineStatuses.map(engine => engine.healthTracker), 'actual engine tracker');
        check(state.readiness.shieldInterval, (ship as unknown as { crShieldMalfunctionInterval: number }).crShieldMalfunctionInterval, 'actual readiness interval');
        check(result.commands.find(command => command.kind === 'spawn' && command.id === index + 1)?.kind, 'spawn', 'actual identity');
        const actor = result.pending.ai[index], meta = result.pending.flight.ships[index];
        check(actor.handle, result.entities[index].handle, 'complete AI identity');
        check(actor.mounts.length, ship.weapons.length, 'complete AI mount schema');
        check(actor.systems.map(system => system.defense), ship.allSystems.map(system => system === ship.defenseSystem), 'complete AI system schema');
        check(meta.deployed, [...ship.deployedWingCraft].map(craft => result.entities.find(entity => entity.stableId === craft.id)!.handle), 'actual flight deployed order');
        check(meta.wings.length, ship.spec.fighterWings?.length ?? 0, 'all authored formation wings');
      }
      for (const template of result.dictionary.templates) {
        const c = template.constructor;
        check([c.flux.length, c.armor.length, c.armorStats.length, c.shield.install.length, c.shield.damage.length,
          c.damagePolicy.length, c.weaponPolicy.length, c.engineMotion.length, c.enginePolicy.length, c.attrs.length, c.query.length, c.readiness.length],
        [17, 17, 15, 19, 3, 8, 15, 21, 5, 20, 12, 9], 'complete static constructor dimensions');
        check(c.hooksComplete, true, 'static constructor hook certificate');
        check(c.mounts.map(mount => mount.slot), template.weapons.map((_, i) => c.mounts[i].slot), 'static mount order');
        for (const source of template.generatedSources) check(result.dictionary.weapons.some(value => value.key === source.weaponKey), true, 'born template generated weapon closure');
        for (const child of c.children) check(result.dictionary.templates.some(value => value.key === child.template), true, 'recursive template closure');
      }
      rows.push({ pack: pack.id, fit: pack.variants![fitIndex].id, entities: result.entities.length,
        modules: result.entities.filter(entity => entity.role === 'module').length,
        craft: result.entities.filter(entity => entity.role === 'fighter' || entity.role === 'bomber').length,
        mounts: result.entities.reduce((sum, entity) => sum + entity.mounts.length, 0), templates: result.dictionary.templates.length,
        commands: result.commands.length, capabilities: [...result.capabilities] });
      if (wasm) {
        const core = await RustCombatCore.create(wasm, seed);
        try {
          for (const batch of result.batches) {
            // Gravity-world requires the root's world initialization boundary.
            const commands = batch.commands.filter(command => command.kind !== 'initialize-gravity-ship');
            try { core.apply(commands); } catch (error) {
              // Diagnostic only after a concrete failed batch: a private fresh
              // candidate locates the first rejected existing-domain command.
              for (const [i, command] of commands.entries()) {
                try { core.apply([command]); } catch (specific) { throw Error(pack.id + '/' + pack.variants![fitIndex].id + ' ' + batch.stage + '[' + i + '] ' + command.kind + ': ' + String(specific) + '\n' + JSON.stringify(command)); }
              }
              throw error;
            }
          }
          core.apply(result.finalize);
          const snapshot = core.snapshot();
          check(snapshot.random, result.startupRNGWitness.end.combat, 'installed final combat RNG');
          check(snapshot.visualRandom, result.startupRNGWitness.end.visual, 'installed final visual RNG');
          check(snapshot.bodies.length, result.entities.length, 'installed body count');
          snapshot.bodies.forEach((body, index) => {
            const ship = ships[index]; check(body.handle, result.entities[index].handle, 'installed exact handle');
            check(body.ship!.armor!.values[14], ship.hullHp, 'installed hp');
            check(body.ship!.weapons!.mounts.map(mount => mount[17]), ship.weapons.map(mount => mount.ammo), 'installed ammo');
            check(body.ship!.components.map(component => [component.values[C.RepairDuration], component.values[C.HitAgo], component.values[C.Interval], component.values[C.Elapsed], component.values[C.IntervalElapsed]]),
              ship.weapons.map(mount => { const tracker = mount.healthTracker; return tracker ? [tracker.repairDuration, tracker.hitAgo, tracker.interval, tracker.elapsed, Number(tracker.intervalElapsed)] : [0, 0, 0, 0, 0]; }), 'installed actual component trackers');
            check(body.ship!.engines!.engines.map(engine => [engine[E.RepairDuration], engine[E.HitAgo], engine[E.Interval], engine[E.Elapsed], engine[E.IntervalElapsed]]),
              ship.engineStatuses.map(engine => { const tracker = engine.healthTracker; return [tracker.repairDuration, tracker.hitAgo, tracker.interval, tracker.elapsed, Number(tracker.intervalElapsed)]; }), 'installed actual engine trackers');
          });
        } finally { core.dispose(); }
      }
    }
  }
  const spec = all[0];
  const compile = (next: ShipSpec) => compileRustContent({ ships: [{ stableId: 'guard', spec: next, team: 0, player: true, position: [0, 0], facing: 0 }], seed: 9 });
  const reject = (action: () => unknown, label: string) => { try { action(); } catch { guards++; return; } throw Error(label + ' admitted'); };
  reject(() => compile({ ...spec, captainSkills: { nonexistent: 1 } }), 'unknown skill');
  hullModDefinitions.register({ id: 'rust-compiler-unknown', name: 'unknown', status: 'implemented', stats: () => ({ speedBonus: 9 }) });
  reject(() => compile({ ...spec, hullMods: [...(spec.hullMods ?? []), 'rust-compiler-unknown'] }), 'unknown real hullmod');
  const get = shipSystemDefinitions.get;
  shipSystemDefinitions.get = function (id: string) { const definition = get.call(this, id); return definition ? { ...definition, onAdvance: () => {} } : undefined; };
  try { reject(() => compile(spec), 'replacement definition identity'); } finally { shipSystemDefinitions.get = get; }
  const effectGet = weaponEffects.get;
  weaponEffects.get = function (id: string) { const definition = effectGet.call(this, id); return definition ? { ...definition, hit: () => {} } : undefined; };
  try { reject(() => compile(spec), 'replacement effect reader'); } finally { weaponEffects.get = effectGet; }
  const reserve = compileRustContent({ ships: [{ stableId: 'reserve', spec, team: 1, player: false, position: [0, 0], facing: 0, deployment: 'reserve' }], seed: 18 });
  const reserveRandom = new SimulationRandom(18), reserveVisual = new SimulationRandom((18 ^ 0x9e3779b9) >>> 0);
  const reserveShip = new Ship('reserve', spec, false, new Vector2(), 0, reserveRandom, reserveVisual);
  check(reserve.entities.length, reserveShip.assemblyShips.length, 'reserve actual root/modules constructed');
  check(reserve.entities.every(entity => entity.deployment === 'reserve'), true, 'reserve explicit deployment');
  check(reserve.pending.flight.carrierOrder.length, 0, 'reserve no active carrier');
  check(reserve.startupRNGWitness.end.combat, reserveRandom.checkpointWitness(), 'reserve exact constructor RNG');
  check(reserve.startupRNGWitness.end.visual, reserveVisual.checkpointWitness(), 'reserve exact visual RNG');
  check(reserve.reserves[0].handle, reserve.entities[0].handle, 'reserve identity body');
  const mixedEntries = [{ stableId: 'reserve-first', spec, team: 0, player: true, position: [0, 0] as const, facing: 0, deployment: 'reserve' as const },
    { stableId: 'active-enemy', spec, team: 1, player: false, position: [0, -600] as const, facing: 1 },
    { stableId: 'active-player', spec, team: 0, player: true, position: [0, 600] as const, facing: -1 }];
  const mixed = compileRustContent({ ships: mixedEntries, seed: 71 }), mr = new SimulationRandom(71), mv = new SimulationRandom((71 ^ 0x9e3779b9) >>> 0);
  const mixedShips = mixedEntries.map(entry => new Ship(entry.stableId, entry.spec, entry.player, new Vector2(...entry.position), entry.facing, mr, mv));
  const mf = new FighterSystem(mr, mv); for (const root of mixedShips.slice(1)) mf.addCarrier(root);
  check(mixed.startupRNGWitness.end.combat, mr.checkpointWitness(), 'mixed reserve source ordered constructor RNG');
  check(mixed.startupRNGWitness.end.visual, mv.checkpointWitness(), 'mixed reserve visual RNG');
  check(mixed.entities.map(entity => entity.stableId), [...mixedShips.flatMap(ship => ship.assemblyShips), ...mf.fighters, ...mf.bombers].map(ship => ship.id), 'mixed actual semantic construction order');
  check(mixed.pending.flight.carrierOrder.includes(mixed.entities[0].handle), false, 'mixed reserve no wing initialization');
  const revision = contentRegistry.revision; reject(() => compileRustContent({ ships: [], seed: 1, contentRevision: revision + 1 }), 'stale content revision');
  return { passed: true, packs: bundledShipPacks.length, fits: rows.length, strictFields, guards, rows,
    actualSourceConstruction: true, immutableNoSolverReferences: true, startupRNGMatched: true,
    installedExistingDomains: !!wasm, mandatoryProductionMetadata: ['combatPolicy', 'constructorInitial', 'ai', 'flight', 'aux', 'localHooks', 'slotDictionary', 'generatedSources', 'startupRandom'],
    productionIntegrated: false, fullBattleReady: false };
}
