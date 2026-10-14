/** Static generated-body certificates compiled from the real constructor tree. */
import type { Ship } from '../../simulation/Ship';
import { installedHullMods, effectiveHullModWeaponSpec } from '../../extensions/HullMods';
import { nativeMinePayload } from '../../extensions/NativeMines';
import nativeHullFacts from '../../extensions/native-hull-facts.json';
import { compileRustResidentAI, type RustResidentActorMeta, type RustResidentMountMeta } from './RustAIAdmission';
import { compileRustScenePrelude, type RustScenePreludeShip } from './RustScenePreludeProtocol';
import { encodeRustCommands, RUST_COMMAND_WIDTH, type RustAuxShip, type RustBodyHandle, type RustCommand } from './RustCoreProtocol';
import { rustGravity } from './RustContentCompilerFields';
import { compileRustVisualStatic, type RustVisualStatic } from './RustVisualAdmission';
export interface RustGeneratedAdmission {
  readonly specKey: string;
  readonly phase: { readonly anchorCRCost?: number; readonly controls: readonly { readonly systemId: number; readonly flags: number; readonly phase: boolean; readonly vulnerableUp: boolean; readonly vulnerableDown: boolean }[] };
  readonly ai: Omit<RustResidentActorMeta, 'handle' | 'stableId' | 'localeRank' | 'attachment' | 'memory' | 'initialTarget' | 'mounts'> & {
    readonly moduleSlot?: string; readonly moduleX?: number; readonly moduleY?: number; readonly moduleAngleDeg?: number;
    readonly mounts: readonly (RustResidentMountMeta & { readonly slot: string })[] };
  readonly aux: Omit<RustAuxShip, 'id' | 'handle'>;
  readonly motion: { readonly station: boolean; readonly axial: boolean; readonly independent: boolean; readonly inherit: boolean; readonly turnAcceleration: number; readonly maxTurn: number };
  readonly gravityRows: readonly (readonly number[])[];
  readonly prelude: Omit<RustScenePreludeShip, 'id' | 'handle'>;
  readonly visual: RustVisualStatic;
  readonly read: { readonly sightFlat: number; readonly sightPercent: number; readonly weaponRepair: number };
  readonly systemRead: { readonly tacticalCount: number; readonly moduleSlot?: string; readonly propulsion?: { readonly slots: readonly (number | undefined)[]; readonly reserves: readonly [number, number, number] } };
}
export function compileRustGeneratedAdmission(ship: Ship, specKey: string): RustGeneratedAdmission {
  const ships = ship.parentShip ? [ship.parentShip, ship] : [ship];
  const handles = new Map<Ship, RustBodyHandle>(ships.map((s, slot) => [s, { slot, generation: 1 }]));
  const components = new Map(ships.flatMap(s => s.weapons.map((m, i) => [m, i + 1] as const)));
  const actor = compileRustResidentAI(ships, handles, components, new Map()).at(-1)!;
  const { handle: _handle, stableId: _stableId, localeRank: _rank, attachment, memory: _memory, initialTarget: _target, mounts, ...staticAI } = actor;
  const mods = installedHullMods(ship.spec), stealth = mods.filter(m => m.id === 'stealth_minefield' || m.id === 'stealth_minefield_lt');
  const facts = nativeHullFacts as Record<string, { deployCR: number }>;
  const gravity = rustGravity(ship), words = gravity.systems.length || gravity.mounts.length
    ? encodeRustCommands([{ kind: 'initialize-gravity-ship', id: 1, handle: { slot: 0, generation: 1 }, ...gravity }]) : [];
  const gravityRows = Array.from({ length: words.length / RUST_COMMAND_WIDTH }, (_, i) => Array.from(words.slice(i * RUST_COMMAND_WIDTH, (i + 1) * RUST_COMMAND_WIDTH)))
    .filter(row => [95, 96, 97, 98, 99, 100, 103].includes(row[0])).map(row => [row[0], ...row.slice(4)]);
  const prelude = compileRustScenePrelude([ship], new Map([[ship, { slot: 0, generation: 1 }]]), new Map([[ship, 1]])).ships[0];
  const { id: _id, handle: _preludeHandle, ...staticPrelude } = prelude;
  return { specKey, phase: { anchorCRCost: mods.some(m => m.id === 'phase_anchor') ? ship.spec.deploymentCRCost ?? (facts[ship.spec.sourceHullId ?? ship.spec.id]?.deployCR ?? 0) / 100 : undefined,
    controls: ship.allSystems.map((s, i) => { const c = s.definition.controls; return { systemId: i + 1,
      flags: (c?.blockFluxDissipation ? 1 : 0) | (c?.blockAcceleration ? 2 : 0) | (c?.blockStrafing ? 4 : 0) | (c?.forceAutofire ? 8 : 0)
        | (c?.blockWeapons ? 16 : 0) | (c?.blockShields ? 32 : 0) | (c?.lockTurning ? 64 : 0) | (c?.forceForward ? 128 : 0) | (c?.blockVenting ? 256 : 0) | (c?.releaseOnOut ? 512 : 0),
      phase: !!s.definition.phase, vulnerableUp: !!s.definition.phase?.vulnerableChargeUp, vulnerableDown: !!s.definition.phase?.vulnerableChargeDown }; }) },
    ai: { ...staticAI, moduleSlot: attachment.slot, moduleX: attachment.x, moduleY: attachment.y, moduleAngleDeg: attachment.angleDeg,
      mounts: mounts.map((m, i) => ({ ...m, slot: ship.weapons[i].slotId })) },
    aux: { stealth: stealth.length ? stealth[0].id === 'stealth_minefield_lt' ? 1 : 2 : undefined, stealthHooks: stealth.length,
      ineligible: ship.isAttachedModule || ship.spec.hullSize === 'FIGHTER' || !!ship.spec.sourceHullTraits?.some(t => ['STATION', 'STATION_MODULE', 'DRONE'].includes(t)),
      drone: ship.isSystemDrone, travelSystems: ship.allSystems.flatMap((s, i) => s.definition.sourceIds.includes('traveldrive') ? [i + 1] : []),
      payloads: (['minelayer1', 'minelayer2'] as const).map(id => { const p = effectiveHullModWeaponSpec(ship.spec, nativeMinePayload(id));
        return { damage: p.damagePerShot, launchSpeed: p.launchSpeed ?? p.projSpeed, hp: p.missileHp ?? 500, flight: p.flightTime ?? 20 }; }) as unknown as RustAuxShip['payloads'] },
    motion: { station: ship.isStation, axial: !!ship.spec.sourceHullTraits?.includes('axialrotation'), independent: !!ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'),
      inherit: !!ship.spec.inheritParentEngineCommands, turnAcceleration: ship.spec.turnAccelerationDeg * Math.PI / 180, maxTurn: ship.spec.maxTurnRateDeg * Math.PI / 180 },
    gravityRows, prelude: staticPrelude, visual: compileRustVisualStatic(ship),
    read: { sightFlat: ship.hullStats.sightRadiusFlat, sightPercent: ship.hullStats.sightRadiusPercent, weaponRepair: ship.combatWeaponRepairTimeMultiplier },
    systemRead: { tacticalCount: ship.systems.length, moduleSlot: ship.moduleMount?.slotId, propulsion: ship.spec.modulePropulsion ? {
      slots: ship.spec.modulePropulsion.slotIds.map(slot => { const i = ship.childModules.findIndex(child => child.parentShip === ship && child.moduleMount?.slotId === slot); return i < 0 ? undefined : i; }),
      reserves: [ship.spec.modulePropulsion.reserveSpeed, ship.spec.modulePropulsion.reserveAcceleration, ship.spec.modulePropulsion.reserveTurn] } : undefined } };
}
