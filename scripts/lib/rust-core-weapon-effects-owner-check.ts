import { Ship } from '../../src/engine/simulation/Ship';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { advanceTachyonLance } from '../../src/engine/simulation/systems/weapon/TachyonLanceEffect';
import { sabotHit } from '../../src/engine/extensions/weapon-effects/SabotHit';
import { moteHit } from '../../src/engine/extensions/weapon-effects/MoteHit';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import type { WeaponMount, Projectile, Beam } from '../../src/engine/simulation/Weapon';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';

interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_reset(): number; test_run(): number; test_output_words(): number }
export async function checkRustWeaponEffectsOwner(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, destroyedTotal = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  function compare(a: number, b: number, label: string, geometric = false) {
    if (!geometric) { strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return; }
    geometry++; if (Object.is(a, b)) return;
    const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: geometry ${a} differs from ${b}`);
    maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  }
  for (let scene = 0; scene < 8; scene++) {
    wasm.test_reset(); const random = new SimulationRandom(8127), visual = new SimulationRandom(15181);
    const armor = new ArmorGrid(9, 7, 10, 10, 27, -45, -35), scars = new ShipDamageState(armor, visual), flux = new FluxTracker(100000, 0, 'FRIGATE');
    armor.onCellDamage = (c, r, damage) => scars.onCellDamage(c, r, damage);
    const mounts = [{ relativePos: new Vector2(3, -4), mountType: 'TURRET' }, { relativePos: new Vector2(-7, 6), mountType: 'HIDDEN' }, { relativePos: new Vector2(21, 9), mountType: 'TURRET' }].map((p, i) => ({
      ...p, slotId: String(i + 1), spec: { mountSize: 'SMALL' }, health: 250, maxHealth: 250, isDisabled: false, isPermanentlyDisabled: false,
      disabledDuration: 0, disabledTimer: 0,
    } as WeaponMount));
    let destroyed = 0;
    const owner = Object.create(Ship.prototype) as Ship;
    Object.assign(owner, { id: '47', spec: { hullMods: [], builtInHullMods: [], hullSize: scene >= 4 && scene < 6 ? 'FIGHTER' : 'FRIGATE', engineSlots: [] },
      armor, flux, pos: new Vector2(100, -50), facingRad: .27, hullHp: 1000, hullStats: { hitpoints: 1000 }, parentShip: null,
      isDead: false, isRetreated: false, hullDamageSuppressed: false, hullDamageInterceptors: new Set(),
      shield: { isActive: false, type: 'OMNI', facingAngleRad: 0, currentArcDeg: 360, efficiency: .83, damageTakenMultiplierFor: () => 1.17 },
      getShieldCenter: () => new Vector2(102, -47), weaponDamageTakenMultiplier: 1.13, engineDamageTakenMultiplier: 1.19,
      shieldPiercedMultiplier: 1, system: { getShieldDamageMultiplier: () => 1.11 },
      weaponControl: { weapons: mounts, damageComponent: (mount: WeaponMount, damage: number) => damageWeaponComponent(mount, damage, random) },
    });
    Object.defineProperty(owner, 'effectiveEmpDamageTakenMultiplier', { value: 1.23 });
    Object.defineProperty(owner, 'crDamageTakenMultiplier', { value: 1.13 });
    const sourceOwner = { id: '71', spec: { hullMods: scene % 2 ? ['high_frequency_attractor'] : [], builtInHullMods: [] },
      damageToTargetWeaponsMultiplier: 1.17, damageToTargetEnginesMultiplier: 1.09,
      hullStats: { damageToFightersPercent: 0, damageToFightersMultiplier: 1, damageToFrigatesPercent: 0, damageToDestroyersPercent: 0, damageToCruisersPercent: 0 } } as unknown as Ship;
    const ctx = { random, visualRandom: visual, playerShip: owner, enemyShip: owner, fighters: [], ships: [sourceOwner, owner],
      fx: { spawnArmorDamageSparks: () => {}, spawnNativeEmpArc: () => {} },
      statsTracker: { recordDamageDealt: () => {} }, handleShipDestruction: () => { owner.isDead = true; destroyed++; },
    } as unknown as WeaponSimContext;
    const beam = { isPlayer: true, sourceShipId: '71', brightness: 1, damageActive: true, width: 7,
      fringeColor: [39, 119, 209, 255], coreColor: [255, 245, 235, 255] } as Beam;
    for (let tick = 0; tick < 64; tick++) {
      const effect = scene < 2 ? 0 : scene < 6 ? 1 : 2, shield = tick % 3 === 0;
      const damage = scene === 7 ? 7400 : scene >= 4 ? 197 : 127, emp = 43, duration = tick % 2 ? .21 : 0;
      const from = new Vector2(102 + Math.cos(tick / 13) * 19, -47 + Math.sin(tick / 13) * 19);
      owner.shield.isActive = shield;
      // Tachyon reads this live flux only for penetration. Keep it at the same
      // approved observation while Mote fighter commits use real FluxTracker.
      const savedHard = flux.hardFlux, savedMax = flux.maxFlux;
      if (effect === 2) { flux.hardFlux = 900; flux.maxFlux = 1000; }
      if (effect === 2) {
        Object.assign(beam, { dpsDuration: duration, damagePerSec: damage, damageMultiplier: .83, baseEmpPerSec: emp, endPos: from.clone(), rayEndPrevFrame: from.clone() });
        advanceTachyonLance(beam, owner, ctx);
      } else {
        const p = { sourceShipId: '71', specId: 'mote', damage, empDamage: emp, sourceWeaponType: 'BALLISTIC' } as Projectile;
        (effect === 0 ? sabotHit : moteHit).hit!(p, owner, from, shield, sourceOwner, ctx);
      }
      if (effect === 2) { flux.hardFlux = savedHard; flux.maxFlux = savedMax; }
      const input = [effect, Number(scene >= 4 && scene < 6), Number(shield), Number(scene % 2), damage, emp, duration, from.x, from.y];
      const inputPtr = wasm.test_input(input.length); new Float64Array(wasm.memory.buffer, inputPtr, input.length).set(input);
      const outputPtr = wasm.test_run(), a = Array.from(new Float64Array(wasm.memory.buffer, outputPtr, wasm.test_output_words()));
      const label = `damage scene ${scene} tick ${tick}`;
      compare(a[0], random.checkpointWitness()[1], label + ' gameplay RNG'); compare(a[1], visual.checkpointWitness()[1], label + ' visual RNG');
      compare(a[2], destroyed, label + ' destruction'); compare(a[3], 2 | (owner.isDead ? 16 : 0), label + ' dead flag');
      const expectedArmor = [9, 7, 10, 10, 27, -45, -35, armor.maxCellArmor, 1, 1, .85, 1, armor.dirtyVersion, 1000, owner.hullHp, 0, 0, 1, 0, scars.revision, -1, 1, 1, 1, 1, 1, 1, 1, 1];
      expectedArmor.forEach((v, i) => compare(a[4 + i], v, label + ' armor ' + i));
      armor.copyCells().forEach((v, i) => compare(a[33 + i], v, label + ' cell ' + i));
      compare(a[96], scars.marks.length, label + ' scars'); let offset = 97;
      for (const m of scars.marks) {
        const row = [m.cellIndex, m.localPos.x, m.localPos.y, m.opacity, 0, m.heat, Number(m.justHit), m.flash, m.flashElapsed, m.phase, m.pulsePeriod, m.size, m.rotationRad, ['cracks', 'burns', 'holes'].indexOf(m.kind), m.variant];
        row.forEach((v, i) => compare(a[offset + i], v, label + ' scar ' + i, i === 1 || i === 2 || i === 12)); offset += 15;
      }
      compare(a[offset + 8], flux.softFlux, label + ' soft flux'); compare(a[offset + 9], flux.hardFlux, label + ' hard flux'); offset += 19;
      for (let i = 0; i < mounts.length; i++) {
        const m = mounts[i], t = m.healthTracker;
        const expected = [i + 1, 0, i === 1 ? 2 : 0, m.relativePos.x, m.relativePos.y, m.health, m.maxHealth, Number(m.isDisabled), Number(m.isPermanentlyDisabled), m.disabledDuration, m.disabledTimer,
          Number(!!t), t?.repairDuration ?? 0, t?.hitAgo ?? 0, t?.interval ?? 0, t?.elapsed ?? 0, Number(t?.intervalElapsed ?? false), 1, 1, 0];
        expected.forEach((v, j) => compare(a[offset + j], v, label + ` component ${i}/${j}`)); offset += 20;
      }
    }
    destroyedTotal += destroyed;
  }
  return { passed: true, scenes: 8, steps: 512, strictFields: strict, geometryFields: geometry, maximumDifference, geometryLog, destroyed: destroyedTotal,
    realArmorAndComponents: true, fullWorldDestruction: false, productionIntegrated: false };
}
