import { Vector2 } from '../../src/engine/math/Vector2';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { effectState } from '../../src/engine/extensions/EffectState';
import { advanceTachyonInterval, advanceTachyonLance, isWithinEmpShieldArc, pickEmpShipTarget } from '../../src/engine/simulation/systems/weapon/TachyonLanceEffect';
import { advanceGravitonBeam, GravitonBeamDamageTakenMod } from '../../src/engine/simulation/systems/weapon/GravitonBeamEffect';
import { sabotHit } from '../../src/engine/extensions/weapon-effects/SabotHit';
import { moteHit } from '../../src/engine/extensions/weapon-effects/MoteHit';
import { hyperionYamatoHit } from '../../src/engine/extensions/weapon-effects/HyperionYamatoHit';
import { glorianaSiegeHit } from '../../src/engine/extensions/weapon-effects/GlorianaSiegeHit';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import type { Ship } from '../../src/engine/simulation/Ship';
import type { Beam, Projectile, WeaponMount } from '../../src/engine/simulation/Weapon';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';

interface TestExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory; test_input(n: number): number; test_reset(): number;
  test_run(): number; test_output_words(): number;
}
interface TachyonState { interval: number; elapsed: number; intervalElapsed: boolean; wasZero: boolean }
interface GravitonState { wasZero: boolean }
const emptyTachyon = (): TachyonState => ({ interval: 0, elapsed: 0, intervalElapsed: false, wasZero: true });

/** Actual effect hooks are the oracle; recording damage services isolates this
 * module's amounts, order and RNG. Root must additionally integrate real damage. */
export async function checkRustWeaponEffects(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {});
  const wasm = instance.exports as TestExports;
  let strict = 0, geometry = 0, maximumDifference = 0, scenarios = 0, events = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  function compare(a: number, b: number, label: string, geometric = false) {
    if (!geometric) { strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return; }
    geometry++; if (Object.is(a, b)) return;
    const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: geometry ${a} differs from ${b}`);
    maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  }
  for (let scene = 0; scene < 18; scene++) {
    scenarios++; wasm.test_reset();
    const random = new SimulationRandom(7127), visualRandom = new SimulationRandom(9181);
    const beam = {} as Beam, statuses = new Map<string, unknown>(), mounts = new Map<string, WeaponMount>();
    const listenerOracle = new GravitonBeamDamageTakenMod(); let notified = false;
    const nativeNotify = listenerOracle.notifyHit.bind(listenerOracle);
    listenerOracle.notifyHit = weapon => { notified = true; nativeNotify(weapon); };
    statuses.set('graviton', listenerOracle);
    let tachyonInitialized = false, gravitonInitialized = false;
    for (let tick = 0; tick < 90; tick++) {
      const d = Array<number>(44).fill(0), rows: number[][] = [];
      const op = scene < 2 ? 0 : scene < 4 ? 1 : scene < 6 ? 2 : scene < 8 ? (tick % 3 === 2 ? 6 : 3)
        : scene < 10 ? 5 : scene < 15 ? 4 : scene < 17 ? (tick % 3 === 0 ? 4 : 7) : 8;
      d[0] = op; d[1] = tick % 13 === 0 ? .7 : 1; d[2] = Number(tick % 19 !== 0);
      d[3] = tick % 4 === 0 ? 0 : tick % 4 === 1 ? .13 : tick % 4 === 2 ? .21 : .21;
      d[4] = Number(tick % 11 !== 0); d[5] = Number(tick % 9 !== 0); d[6] = Number(tick % 7 !== 0);
      d[7] = tick % 17 === 0 ? 3 : tick % 23 === 0 ? 0 : scene === 4 ? 1 : 2; d[8] = 102; d[9] = -47;
      d[10] = tick % 2 ? .37 : 3.1; d[11] = tick % 5 === 0 ? 0 : tick % 6 === 0 ? 360 : 70;
      d[12] = 102 + Math.cos(tick / 13) * 46; d[13] = -47 + Math.sin(tick / 13) * 46;
      d[14] = 102 + Math.cos(tick / 9) * 43; d[15] = -47 + Math.sin(tick / 9) * 43;
      d[16] = 100; d[17] = -50; d[18] = .27;
      if (d[7] === 1) d[10] = d[18];
      d[19] = Number(scene === 12 || scene === 13); d[20] = Number(tick % 29 === 0);
      d[21] = tick % 4 === 0 ? 20 : tick % 4 === 1 ? 350 : tick % 4 === 2 ? 1000 : 1150;
      d[22] = 1000; d[23] = tick % 5 === 0 ? 0 : tick % 7 === 0 ? 2.3 : .81;
      d[24] = 1.13; d[25] = 1; d[26] = Number(scene % 2 === 1); d[27] = Number(tick % 2 === 0);
      d[28] = scene === 10 || scene === 11 ? 2 : scene === 12 || scene === 13 || scene === 14 ? 3 : scene === 15 ? 4 : 5;
      d[29] = scene === 3 && tick % 4 === 0 ? 0 : 7; d[30] = scene === 3 && tick % 4 === 0 ? 0 : tick % 6 === 0 ? 2 : 7;
      d[31] = tick % 5 === 0 ? .75 : .13; d[32] = 71; d[33] = 2; d[34] = tick > 55 ? 2 : 1;
      d[35] = tick % 4 + 1; d[36] = 197; d[37] = 43; d[38] = .83;
      d[39] = 7; d[40] = -3; d[41] = .37; d[42] = Number(tick % 2); d[43] = Number(tick % 3 === 0);
      if (op === 7) d[27] = 0;
      const engineSlots = [{ x: -12, y: 7 }, { x: 18, y: -11 }, { x: 100001, y: 0 }].filter((_, i) => (d[29] & 1 << i) !== 0);
      const weapons = [{ relativePos: new Vector2(3, -4), mountType: 'TURRET' }, { relativePos: new Vector2(-7, 6), mountType: 'HIDDEN' }, { relativePos: new Vector2(21, 9), mountType: 'TURRET' }].filter((_, i) => (d[30] & 1 << i) !== 0);
      const armorDamage = (point: Vector2, amount: number) => { rows.push([1, 47, point.x, point.y, amount]); return { armorDamage: amount * .7, hullDamage: amount * .3 }; };
      const target = { id: '47', isDead: !!d[20], spec: { hullSize: d[19] ? 'FIGHTER' : 'FRIGATE', engineSlots },
        pos: new Vector2(d[16], d[17]), facingRad: d[18], weapons, statusEffects: statuses,
        shield: { isActive: !!d[6], type: ['NONE', 'FRONT', 'OMNI', 'PHASE'][d[7]], facingAngleRad: d[10], currentArcDeg: d[11], efficiency: .83,
          damageTakenModifiers: new Map<string, number>(), damageTakenMultiplierFor: () => 1.17 },
        getShieldCenter: () => new Vector2(d[8], d[9]), flux: { hardFlux: d[21], maxFlux: d[22], increaseShieldFlux: (a: number, h: boolean) => rows.push([4, 47, a, Number(h)]) },
        system: { getShieldDamageMultiplier: () => 1.11 }, shieldPiercedMultiplier: d[23], crDamageTakenMultiplier: d[24],
        effectiveEmpDamageTakenMultiplier: 0, weaponDamageTakenMultiplier: 0, engineDamageTakenMultiplier: 0,
        armor: { takeDamage: armorDamage, localToGrid: () => ({ c: 0, r: 0 }) }, hullHp: 0,
        applyHullDamage: (amount: number) => rows.push([2, 47, amount]), damageEngineComponent: () => {},
        weaponControl: { damageComponent: () => {} }, vel: new Vector2(d[39], d[40]),
      } as unknown as Ship;
      // Record the ComponentDamage call at its original place by using a getter
      // accessed exactly once before its nonpositive-total early return.
      Object.defineProperty(target, 'effectiveEmpDamageTakenMultiplier', { get() {
        const lastArmor = [...rows].reverse().find(row => row[0] === 1), point = lastArmor ? [lastArmor[2], lastArmor[3]] : null;
        const callPoint = op === 4 && d[28] === 2 ? pickPointForRecording! : point;
        const result = lastArmor ? [lastArmor[4] * .7, lastArmor[4] * .3] : [0, 0];
        rows.push([3, 47, callPoint?.[0] ?? 0, callPoint?.[1] ?? 0, result[0], result[1], op === 5 ? d[37] * .5 : d[19] ? 0 : d[37]]);
        return 0;
      } });
      let pickPointForRecording: [number, number] | undefined;
      const source = { id: '71', spec: { hullMods: d[26] ? ['high_frequency_attractor'] : [], builtInHullMods: [], captainSkills: { point_defense: !!d[43] } },
        hullStats: { damageToFightersPercent: 17, damageToFightersMultiplier: 1.21, damageToMissilesPercent: 13, damageToMissilesMultiplier: 1.09,
          damageToFrigatesPercent: 0, damageToDestroyersPercent: 0, damageToCruisersPercent: 0 } } as unknown as Ship;
      const projectile = { sourceShipId: '71', specId: 'mote', pos: new Vector2(d[12], d[13]), vel: new Vector2(d[39], d[40]), facingRad: d[41], damage: d[36], empDamage: d[37], sourceWeaponType: 'BALLISTIC' } as unknown as Projectile;
      // Source outgoing damage against fighter is part of actual Mote hit; feed
      // the same resident value to Rust, distinct from its missile bonus.
      if (d[19]) d[25] = (1 + (17 + (d[43] ? 50 : 0)) / 100) * 1.21;
      const effects: unknown[] = [];
      const ctx = { random, visualRandom, ships: [source, target], playerShip: target, enemyShip: target, fighters: [],
        fx: { explosions: effects, spawnNativeEmpArc: (from: Vector2, end: Vector2, ship: Ship, width: number, fringe: number[], core: number[]) => {
          rows.push([6, Number(ship.id), from.x, from.y, end.x, end.y, width, ...fringe, ...core]);
        }, spawnArmorDamageSparks: (_ship: Ship, point: Vector2, damage: number) => rows.push([5, 47, point.x, point.y, damage]) },
        statsTracker: { recordDamageDealt: (player: boolean, _type: string, amount: number, layer: string, emp = 0) => rows.push([8, Number(player), layer === 'ARMOR' ? 0 : 1, amount, emp]) },
        handleShipDestruction: () => rows.push([9, 47]),
      } as unknown as WeaponSimContext;
      Object.assign(beam, { brightness: d[1], damageActive: !!d[2], dpsDuration: d[3], damagePerSec: d[36], damageMultiplier: d[38],
        baseEmpPerSec: d[37], endPos: new Vector2(d[14], d[15]), rayEndPrevFrame: new Vector2(d[12], d[13]), width: 7,
        isPlayer: true, fringeColor: [39, 119, 209, 255], coreColor: [255, 245, 235, 255], sourceShipId: '71' });
      let value = 0;
      const dispose = captureCombatAudio(e => {
        if (e.kind !== 'play') return;
        const key = e.key.startsWith('tachyon_lance_emp_impact_0') ? Number(e.key.at(-1)) : e.key === 'mote_attractor_impact_emp_arc' ? 4 : e.key === 'mote_attractor_impact_normal' ? 5 : 6;
        rows.push([7, key, ...(e.position ?? [0, 0]), e.volume, e.rate]);
      });
      try {
        if (op === 0) { value = Number(advanceTachyonInterval(beam, !!d[4], random)); tachyonInitialized = true; }
        else if (op === 1) { const p = pickEmpShipTarget(target, new Vector2(d[12], d[13]), random); rows.push([20, p.local.x, p.local.y, p.weight, ['ENGINE', 'WEAPON', 'CENTER'].indexOf(p.kind), p.index]); }
        else if (op === 2) value = Number(isWithinEmpShieldArc(target, new Vector2(d[12], d[13])));
        else if (op === 3) {
          const key = `${d[32]}:${d[33]}:${d[34]}:${d[35]}`;
          if (!mounts.has(key)) mounts.set(key, {} as WeaponMount);
          notified = false;
          advanceGravitonBeam(beam, d[4] ? target : undefined, d[5] ? mounts.get(key) : undefined); gravitonInitialized = true;
          value = Number(notified);
        }
        else if (op === 4) {
          // Capture Sabot's selected local point without consuming an extra
          // sample: same TS picker on a cloned pre-call cursor after gate.
          if (d[28] === 2 && !d[27]) {
            const preview = SimulationRandom.fromCursor(random.checkpointWitness()[1]);
            if (preview.next() < .25) { const p = pickEmpShipTarget(target, new Vector2(d[12], d[13]), preview); pickPointForRecording = [p.local.x, p.local.y]; }
          }
          const effect = d[28] === 2 ? sabotHit : d[28] === 3 ? moteHit : d[28] === 4 ? hyperionYamatoHit : glorianaSiegeHit;
          effect.hit!(projectile, target, new Vector2(d[12], d[13]), !!d[27], source, ctx);
        }
        else if (op === 5) { advanceTachyonLance(beam, d[4] ? target : undefined, ctx); tachyonInitialized = true; }
        else if (op === 6) {
          const listener = statuses.get('graviton') as GravitonBeamDamageTakenMod | undefined;
          listener?.advance(target, d[31]); value = target.shield.damageTakenModifiers.get('graviton') ?? 0;
        }
        else if (op === 7) (d[28] === 4 ? hyperionYamatoHit : glorianaSiegeHit).hitEnvironment!(projectile, new Vector2(d[12], d[13]), new Vector2(d[39], d[40]), ctx);
        else {
          const missile = { hitpoints: 0, isFighterDecoy: !!d[42] } as Projectile;
          moteHit.hitProjectile!(projectile, missile, new Vector2(d[12], d[13]), source, ctx); value = -missile.hitpoints!;
          rows.length = 0;
        }
      } finally { dispose(); }
      for (const raw of effects) {
        const e = raw as { pos: Vector2; radius: number; maxRadius: number; life: number; rotation: number; color: number[]; hasShockwaveRing: boolean; shockwaveRadius: number; maxShockwaveRadius: number; puffDuration: number;
          puffs: { texture: number; offset: Vector2; velocity: Vector2; startSize: number; endSize: number; rotation: number }[];
          flare?: { width: number; height: number; color: number[]; velocity: Vector2 }; flash?: { diameter: number; coreDiameter: number; color: number[]; duration: number; velocity: Vector2 } };
        rows.push([10, d[28], e.pos.x, e.pos.y, e.radius, e.maxRadius, e.life, e.rotation, ...e.color, Number(e.hasShockwaveRing), e.shockwaveRadius, e.maxShockwaveRadius, e.puffDuration]);
        for (const p of e.puffs) rows.push([11, p.texture, p.offset.x, p.offset.y, p.velocity.x, p.velocity.y, p.startSize, p.endSize, p.rotation]);
        if (e.flare) rows.push([12, e.flare.width, e.flare.height, ...e.flare.color, e.flare.velocity.x, e.flare.velocity.y]);
        if (e.flash) rows.push([13, e.flash.diameter, e.flash.coreDiameter, ...e.flash.color, e.flash.duration, e.flash.velocity.x, e.flash.velocity.y]);
      }
      const ptr = wasm.test_input(d.length); new Float64Array(wasm.memory.buffer, ptr, d.length).set(d);
      const resultPtr = wasm.test_run(), actual = Array.from(new Float64Array(wasm.memory.buffer, resultPtr, wasm.test_output_words()));
      const tachyon = tachyonInitialized ? effectState<TachyonState>(beam, 'tachyon', emptyTachyon) : emptyTachyon();
      const graviton = gravitonInitialized ? effectState<GravitonState>(beam, 'graviton', () => ({ wasZero: true })) : { wasZero: true };
      const listener = statuses.get('graviton') as GravitonBeamDamageTakenMod | undefined;
      const hits = listener ? [...(listener as unknown as { recentHits: Map<WeaponMount, number> }).recentHits] : [];
      const expected = [value, random.checkpointWitness()[1], visualRandom.checkpointWitness()[1], Number(tachyonInitialized),
        tachyonInitialized ? tachyon.interval : 0, tachyonInitialized ? tachyon.elapsed : 0, Number(tachyonInitialized && tachyon.intervalElapsed), Number(tachyonInitialized && tachyon.wasZero), Number(graviton.wasZero), hits.length];
      for (const [mount, time] of hits) { const key = [...mounts].find(([, m]) => m === mount)![0]; expected.push(...key.split(':').map(Number), time); }
      expected.push(rows.length); for (const row of rows) expected.push(row.length, ...row);
      compare(actual.length, expected.length, `scene ${scene} tick ${tick} width`);
      const geometric = new Set<number>();
      let offset = 11 + hits.length * 5;
      for (const row of rows) {
        offset++;
        const indices = row[0] === 1 || row[0] === 3 || row[0] === 5 ? [2, 3] : row[0] === 6 ? [2, 3, 4, 5] : row[0] === 7 ? [2, 3]
          : row[0] === 10 ? [2, 3, 7] : row[0] === 11 ? [2, 3, 4, 5, 8] : row[0] === 12 ? [6, 7] : row[0] === 13 ? [7, 8] : row[0] === 20 ? [1, 2, 3] : [];
        for (const i of indices) geometric.add(offset + i);
        offset += row.length;
      }
      for (let i = 0; i < actual.length; i++) compare(actual[i], expected[i], `scene ${scene} tick ${tick} field ${i}`, geometric.has(i));
      events += rows.length;
    }
  }
  return { passed: true, scenarios, steps: scenarios * 90, strictFields: strict, geometryFields: geometry, maximumDifference, events, geometryLog,
    realDamageIntegrated: false, productionIntegrated: false };
}
