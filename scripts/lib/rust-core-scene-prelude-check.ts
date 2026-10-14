// Real stage functions and verbatim inline source from CombatEngine, operating
// on actual Ship instances and the same resident Core used by production.
import { worldFixture, assertWorld, type WorldActor } from './rust-core-ai-resident-fixture';
import { compileRustScenePrelude, encodeRustScenePrelude } from '../../src/engine/runtime/rust/RustScenePreludeProtocol';
import { updateCombatVisibility } from '../../src/engine/simulation/systems/CombatVisibility';
import { updateElectronicWarfare } from '../../src/engine/simulation/systems/ElectronicWarfareSystem';
import { actualSharedFlux, actualDoomed } from 'rust-actual-scene-prelude-stages';
import { RustShipFlag, type RustCommand } from '../../src/engine/runtime/rust/RustCoreProtocol';
import type { Ship } from '../../src/engine/simulation/Ship';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
interface Exports { memory: WebAssembly.Memory; test_prelude_input(id: number, words: number): number;
  test_prelude_install(id: number): number; test_prelude_run(id: number): number; test_prelude_publish(id: number): number;
  test_prelude_words(id: number): number; test_prelude_save(id: number): number; test_prelude_restore(id: number): number; }
export async function checkRustScenePrelude(wasm: BufferSource) {
  let strictFields = 0, stages = 0, rollbackChecks = 0, startupRollbackChecks = 0, cloneChecks = 0;
  const compare = (a: unknown, b: unknown, label: string) => { strictFields++; assertWorld(Object.is(a, b), `${label}: Rust ${String(a)} vs actual TS ${String(b)}`); };
  const configs: WorldActor[] = [
    { position: [0, 0], team: 0, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'], sourceTraits: ['STATION', 'shared_flux_sink'] },
    { position: [80, 0], team: 0, parent: 0, dissipation: 101, moduleCombat: true, mods: ['ecm', 'nav_relay', 'eccm'] },
    { position: [-80, 0], team: 0, parent: 0, dissipation: 53, moduleCombat: true, mods: ['ecm', 'nav_relay'] },
    { position: [0, 80], team: 0, parent: 0, dissipation: 17, moduleCombat: true, builtins: ['vastbulk'] },
    { position: [0, -80], team: 0, parent: 0, dissipation: 29, moduleCombat: false },
    { position: [4000, 0], team: 1, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'] },
    { position: [5000, 0], team: 65, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'] },
    { position: [6000, 0], team: 65, mods: ['ecm', 'nav_relay'], sourceTraits: ['STATION_MODULE'] },
    { position: [7000, 0], team: 1, size: 'FIGHTER', builtins: ['ecm', 'nav_relay'] },
    { position: [8000, 0], team: 200, mods: ['ecm', 'nav_relay'] },
    { position: [9000, 0], team: 0, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'] },
    { position: [10000, 0], team: 0, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'] },
    { position: [11000, 0], team: 0, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'] },
    { position: [12000, 0], team: 0, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'] },
    { position: [13000, 0], team: 0, size: 'CAPITAL_SHIP', mods: ['ecm', 'nav_relay'] },
    { position: [14000, 0], team: 1, sourceTraits: ['STATION', 'shared_flux_sink'] },
    { position: [14080, 0], team: 1, parent: 15, dissipation: 0, moduleCombat: true },
    { position: [13920, 0], team: 1, parent: 15, dissipation: 47, moduleCombat: true },
    { position: [15000, 0], team: 200, sourceTraits: ['STATION'] },
    { position: [15080, 0], team: 200, parent: 18, dissipation: 100, moduleCombat: false },
    { position: [16000, 0], team: 200, sourceTraits: ['STATION'] },
    { position: [16080, 0], team: 200, parent: 20, dissipation: 13, moduleCombat: true, builtins: ['vastbulk'] },
  ];
  const quiet = captureCombatAudio(() => {});
  const f = await worldFixture(wasm, 'scene-prelude-actual', configs, 33179), ships = f.ships,
    handles = new Map(ships.map((s, i) => [s, f.handles[i]])), ids = new Map(ships.map((s, i) => [s, i + 1])),
    binding = f.core as unknown as { id: number; exports: Exports }, ex = binding.exports, coreId = binding.id;
  const write = (words: number[]) => { const p = ex.test_prelude_input(coreId, words.length); new Float64Array(ex.memory.buffer, p, words.length).set(words); };
  const run = (kind: number, members: readonly Ship[]) => { write([kind, members.length, ...members.flatMap(s => {
    const h = handles.get(s)!; return kind === 4 ? [h.slot, h.generation, s.hullHp] : [h.slot, h.generation]; })]); return ex.test_prelude_run(coreId); };
  const read = () => { const p = ex.test_prelude_publish(coreId); return Array.from(new Float64Array(ex.memory.buffer, p, ex.test_prelude_words(coreId))); };
  const install = (words: number[]) => { write(words); return ex.test_prelude_install(coreId); };
  const flagShip = (s: Ship, flags: number) => {
    s.isDead = !!(flags & RustShipFlag.Dead); s.isRetreated = !!(flags & RustShipFlag.Retreated); s.isDocked = !!(flags & RustShipFlag.Docked);
    f.core.apply([{ kind: 'ship-flags', id: ids.get(s)!, handle: handles.get(s)!, flags,
      hardFluxDissipationFraction: s.hullStats.hardFluxDissipationFraction, zeroFluxMinimum: s.hullStats.zeroFluxMinimumFluxLevel,
      allowZeroFluxAtAnyLevel: +s.hullStats.allowZeroFluxAtAnyLevel }]);
  };
  const target = (s: Ship, t: Ship | undefined) => { s.currentTargetShip = t ?? null; f.core.apply([{ kind: 'fire-controls', id: ids.get(s)!, handle: handles.get(s)!,
    aim: [s.aimTargetWorld.x, s.aimTargetWorld.y], trigger: false, ai: false, target: t ? { id: ids.get(t)!, handle: handles.get(t)! } : undefined }]); };
  const teams = [0, 1, 65, 200, 4096], active = ships.filter(s => s !== ships[9]), capital = active.filter(s => !s.parentShip);
  try {
    f.core.apply(ships.map((s, i): RustCommand => ({ kind: 'initialize-fire-query', id: i + 1, handle: handles.get(s)!, ship: {
      visibility: teams.map(team => ({ team, visible: s.isVisibleTo(team) })), scope: ships.map(other => ({ id: ids.get(other)!, handle: handles.get(other)! })),
      player: s.isPlayer, vast: s.hasVastBulk, finish: 1, pressure: 1, tieRank: i }, mounts: [] })));
    ships[1].moduleFluxBonus = 7; ships[1].moduleHardFluxFraction = .03;
    const admission = compileRustScenePrelude(ships, handles, ids), packet = encodeRustScenePrelude(admission, 1, f.handles[0]).flat();
    for (const mutate of [(v: number[]) => { v[4] = 2; }, (v: number[]) => { v[26 + 10] = -1; },
      (v: number[]) => { v[26 + 14] = 2; }, (v: number[]) => { v.splice(v.length - 26, 26); },
      (v: number[]) => { v[52 + 2] = v[26 + 2]; v[52 + 3] = v[26 + 3]; v[52 + 1] = v[26 + 1]; },
      (v: number[]) => { v[26 + 3]++; }]) {
      const broken = [...packet], before = f.core.snapshot().random; mutate(broken);
      assertWorld(install(broken) !== 0, 'invalid prelude rejected'); f.core.snapshot().random.forEach((v, i) => compare(v, before[i], 'startup rollback RNG')); startupRollbackChecks++;
    }
    compare(install(packet), 0, 'actual prelude installation'); assertWorld(install(packet) !== 0, 'duplicate prelude rejected'); startupRollbackChecks++;
    const check = (label: string) => {
      const words = read(); let p = 0; compare(words[p++], ships.length, label + ' actor count');
      ships.forEach(s => {
        const h = handles.get(s)!; compare(words[p++], h.slot, label + ' slot'); compare(words[p++], h.generation, label + ' generation');
        compare(words[p++], !s.isDead && !s.isRetreated && !s.isDocked ? 1 : 0, label + ' public visibility');
        compare(words[p++], s.moduleFluxBonus, label + ' module bonus'); compare(words[p++], s.moduleHardFluxFraction, label + ' module hard');
        compare(words[p++], s.fleetSpeedBonusPercent, label + ' fleet speed'); compare(words[p++], s.ecmRangePenalty, label + ' ECM');
        compare(words[p++], s.hullStats.speedPercent + s.fleetSpeedBonusPercent, label + ' actual motion percent'); compare(words[p++], s.ecmRangePenalty, label + ' actual range attr');
        compare(words[p++], s.flux.baseDissipation, label + ' actual base dissipation'); compare(words[p++], expectedHard.get(s), label + ' actual hard fraction');
        const t = s.currentTargetShip; compare(words[p++], +!!t, label + ' target present'); compare(words[p++], t ? handles.get(t)!.slot : 0, label + ' target slot'); compare(words[p++], t ? handles.get(t)!.generation : 0, label + ' target generation');
        const n = words[p++]; for (let i = 0; i < n; i++) { const team = words[p++], value = words[p++]; compare(value, +s.isVisibleTo(team), label + ' visible team' + team); }
        compare(words[p++], s.parentShip ? -1 : +actualDoomed(s), label + ' vital collapse');
      }); compare(p, words.length, label + ' exact publication width'); stages++;
    };
    const expectedHard = new Map(ships.map(s => [s, s.hullStats.hardFluxDissipationFraction]));
    for (let phase = 0; phase < 7; phase++) {
      if (phase === 0) { flagShip(ships[5], RustShipFlag.Docked); ships[6].hullHp = 0; }
      if (phase === 1) { ships[2].hullHp = 0; ships[17].hullHp = 0; }
      if (phase === 2) { flagShip(ships[6], RustShipFlag.Dead); flagShip(ships[7], RustShipFlag.Retreated); target(ships[0], ships[5]); target(ships[1], ships[6]); target(ships[10], ships[2]); }
      if (phase === 3) { ships[1].hullHp = 0; flagShip(ships[16], RustShipFlag.Dead); }
      if (phase === 4) { flagShip(ships[5], 0); flagShip(ships[6], 0); ships[6].hullHp = 1000; ships[1].hullHp = 1000; ships[2].hullHp = 1000; }
      if (phase === 5) { flagShip(ships[0], RustShipFlag.Dead); flagShip(ships[10], RustShipFlag.Retreated); }
      if (phase === 6) { flagShip(ships[0], 0); flagShip(ships[10], 0); ships[16].hullHp = 1000; flagShip(ships[16], 0); }
      compare(run(4, ships), 0, 'controlled actual HP setup'); updateCombatVisibility(active); updateElectronicWarfare(active);
      compare(run(0, active), 0, 'real visibility/EW stage'); check('observe' + phase);
      actualSharedFlux(capital); compare(run(1, capital), 0, 'verbatim source shared flux stage'); check('shared' + phase);
      for (const s of active) { s.prepareStep(0, s.currentTargetShip); if (!s.isDead && !s.isRetreated && s.hullHp > 0) expectedHard.set(s, s.hullStats.hardFluxDissipationFraction + s.moduleHardFluxFraction); }
      compare(run(2, active), 0, 'real per-ship prepare writes'); check('prepare' + phase);
      const before = read(); write([0, 2, f.handles[0].slot, f.handles[0].generation, f.handles[0].slot, f.handles[0].generation]);
      assertWorld(ex.test_prelude_run(coreId) !== 0, 'duplicate active rejected'); read().forEach((v, i) => compare(v, before[i], 'failed stage atomic rollback')); rollbackChecks++;
      if (phase === 1) { compare(ex.test_prelude_save(coreId), 0, 'complete Core plus prelude clone'); const saved = read();
        compare(run(0, ships), 0, 'alter roster after clone'); compare(ex.test_prelude_restore(coreId), 0, 'restore complete Core plus prelude'); read().forEach((v, i) => compare(v, saved[i], 'clone exact continuation')); cloneChecks++; }
    }
    assertWorld(ships[0].fleetSpeedBonusPercent === 20, 'navigation cap actual positive witness');
    return { passed: true, actors: ships.length, phases: 7, stages, strictFields, rollbackChecks, startupRollbackChecks, cloneChecks,
      actualShips: true, actualVisibilityAndEW: true, verbatimCombatEngineSharedAndVital: true, playerFlowReady: false };
  } finally { f.core.dispose(); quiet(); }
}
