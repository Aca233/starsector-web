/** One-time metadata compilation for ai_resident. No per-step solver or resource writes. */
import type { RustBodyHandle } from './RustCoreProtocol';
import type { Ship } from '../../simulation/Ship';
import { hasNativeMotionBoundary } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { WeaponMount } from '../../simulation/Weapon';
import { installedHullMods } from '../../extensions/HullMods';
import { shipSystemDefinitions, hyperionYamato, hyperionJump } from '../../extensions/ship-systems/Registry';
import { eclipseProtocol } from '../../extensions/ship-systems/EclipseProtocol';
import { glorianaEdict } from '../../extensions/ship-systems/GlorianaEdict';
import { adunArkSystems } from '../../extensions/ship-systems/AdunArkSystems';
import { rocinanteSystems } from '../../extensions/ship-systems/RocinanteSystems';
import { zhefengSystem } from '../../extensions/ship-systems/ZhefengSystem';
import { gravitySystems, gravityDirectionalPush, gravityVectorTurn, gravityCollapse } from '../../extensions/ship-systems/GravitySystems';
import { weaponDps } from '../../ai/ShipCombatProfile';
import { isPointDefense } from '../../ai/AutofireController';
import { WeaponFlag as W } from '../../ai/batch/StageProtocol';

export type RustResidentSystemAI = 'NONE' | 'ECLIPSE' | 'ADUN_FORGE' | 'ADUN_BARRIER' | 'ADUN_REPAIR'
  | 'GLORIANA_EDICT' | 'HYPERION_YAMATO' | 'HYPERION_JUMP' | 'ROCINANTE_ATTITUDE' | 'ROCINANTE_FIRE'
  | 'ZHEFENG' | 'GRAVITY_MANEUVER' | 'GRAVITY_FIELD' | 'GRAVITY_COLLAPSE';
export interface RustResidentMountMeta {
  component: number; localeRank: number; dps: number; authoredMaxSpeed: number;
  positionTurnRate: number; forecastTurnRate: number; fixed: boolean; beamDuration?: number;
  role: 'NONE' | 'POINT_DEFENSE' | 'AXIAL'; originalPointDefense: boolean; stageFlags: number; stageHints: number;
}
export interface RustResidentSystemMeta { id: number; ai: RustResidentSystemAI; defense: boolean; activeSpeedFlat: number }
export interface RustResidentActorMeta {
  handle: RustBodyHandle; stableId: string; localeRank: number; specSpeed: number; specArmor: number; specHp: number;
  attachment: { parent?: RustBodyHandle; slot?: string; x?: number; y?: number; angleDeg?: number };
  attachedMotion: boolean; tacticalPresent: boolean; nativeForecast: boolean; doNotBackOff: number;
  systemDrone: boolean; preventsAIVenting: boolean; trainingAction: -1; systemMode?: string;
  fighterBays: number; wings: { count: number; range?: number }[]; wingRangeMultiplier: number;
  mounts: RustResidentMountMeta[]; systems: RustResidentSystemMeta[];
  memory: boolean; initialTarget?: RustBodyHandle;
}
const audited = new Map<object, RustResidentSystemAI>();
function certify(id: string, ai: RustResidentSystemAI): void { audited.set(shipSystemDefinitions.require(id), ai); }
certify('NONE', 'NONE'); certify(eclipseProtocol.id, 'ECLIPSE'); certify(glorianaEdict.id, 'GLORIANA_EDICT');
certify(hyperionYamato.id, 'HYPERION_YAMATO'); certify(hyperionJump.id, 'HYPERION_JUMP');
adunArkSystems.forEach((d, i) => certify(d.id, (['ADUN_FORGE', 'ADUN_BARRIER', 'ADUN_REPAIR'] as const)[i]));
rocinanteSystems.forEach((d, i) => certify(d.id, (['ROCINANTE_ATTITUDE', 'ROCINANTE_FIRE'] as const)[i]));
certify(zhefengSystem.id, 'ZHEFENG');
for (const d of gravitySystems) certify(d.id, d.id === gravityDirectionalPush.id ? 'NONE'
  : d.id === gravityVectorTurn.id ? 'GRAVITY_MANEUVER' : d.id === gravityCollapse.id ? 'GRAVITY_COLLAPSE' : 'GRAVITY_FIELD');
function rank(values: readonly string[]): Map<string, number> {
  return new Map([...new Set(values)].sort((a, b) => a.localeCompare(b)).map((s, i) => [s, i]));
}
function systemMeta(system: ShipSystem, id: number, defense: boolean): RustResidentSystemMeta {
  const ai = audited.get(system.definition);
  if (ai === undefined) throw Error(`${system.type}: unaudited resident AI callback`);
  // This is the exact source active-speed probe, including the absent owner argument.
  const activeSpeedFlat = system.definition.modifiers?.({ ...system, state: 'ACTIVE', effectLevel: 1 } as ShipSystem,
    system.owner!.flux.maxFlux)?.speedFlat ?? 0;
  return { id, ai, defense, activeSpeedFlat };
}
function mountRole(ship: Ship, mount: WeaponMount): RustResidentMountMeta['role'] {
  const slot = ship.spec.weaponSlots.find(s => s.slotId === mount.slotId), w = mount.spec;
  if (!slot?.builtIn || slot.defaultWeaponId !== w.id || w.weaponType !== 'BALLISTIC' || w.spawnType !== 'BALLISTIC'
    || w.isBeam || w.isRocket) return 'NONE';
  if (slot.controlRole === 'AXIAL' && mount.mountType === 'HARDPOINT') return 'AXIAL';
  return slot.controlRole === 'POINT_DEFENSE' && isPointDefense(mount) && !w.aiHints?.includes('PD_ONLY') ? 'POINT_DEFENSE' : 'NONE';
}
/** The caller supplies the actual Core component IDs, never a guessed string hash. */
export function compileRustResidentAI(ships: readonly Ship[], handles: ReadonlyMap<Ship, RustBodyHandle>,
  components: ReadonlyMap<WeaponMount, number>, memoryOwners: ReadonlyMap<Ship, Ship | null>): RustResidentActorMeta[] {
  if (new Set(ships).size !== ships.length || new Set(ships.map(s => s.id)).size !== ships.length) throw Error('duplicate resident AI roster');
  const shipRanks = rank(ships.map(s => s.id)), mountRanks = rank(ships.flatMap(s => s.weapons.map(m => m.slotId)));
  const handle = (ship: Ship): RustBodyHandle => {
    const h = handles.get(ship);
    if (!h || !Number.isInteger(h.slot) || h.slot < 0 || h.slot >= 0xffffffff || !Number.isInteger(h.generation)
      || h.generation <= 0 || h.generation > 0xffffffff) throw Error(`${ship.id}: invalid resident Core handle`);
    return { slot: h.slot, generation: h.generation };
  };
  return ships.map(ship => {
    const module = ship.moduleMount, target = memoryOwners.get(ship), attachment = {
      parent: ship.parentShip ? handle(ship.parentShip) : undefined, slot: module?.slotId,
      x: module?.x, y: module?.y, angleDeg: module?.angleDeg,
    };
    return { handle: handle(ship), stableId: ship.id, localeRank: shipRanks.get(ship.id)!, specSpeed: ship.spec.maxSpeed,
      specArmor: ship.spec.armorRating, specHp: ship.spec.hitpoints, attachment,
      attachedMotion: !!ship.parentShip && !!module && handles.has(ship.parentShip) && !ship.isStation
        && !ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION') && ship.hasOwnedLocalThreatUpdate
        && hasNativeMotionBoundary(ship) && installedHullMods(ship.spec).every(mod => !mod.advanceCombat)
        && ship.allSystems.every(system => system.type === 'NONE'),
      tacticalPresent: !!ship.tacticalAI, nativeForecast: ship.hasNativeThreatPhaseHooks, doNotBackOff: Number(ship.hullStats.doNotBackOff),
      systemDrone: ship.isSystemDrone, preventsAIVenting: ship.system.preventsAIVenting, trainingAction: -1,
      systemMode: ship.system.tacticalMode, fighterBays: Math.max(0, ship.hullStats.fighterBays),
      wings: (ship.spec.fighterWings ?? []).map(w => ({ count: w.count, range: Number.isFinite(w.range) ? w.range : undefined })),
      wingRangeMultiplier: ship.hullStats.fighterWingRangeMultiplier,
      mounts: ship.weapons.map(m => {
        const w = m.spec, hints = w.aiHints ?? [], component = components.get(m);
        if (component === undefined || !Number.isInteger(component) || component < 0 || component > 0xffffffff) throw Error(`${ship.id}/${m.slotId}: missing component identity`);
        return { component, localeRank: mountRanks.get(m.slotId)!, dps: weaponDps(m), authoredMaxSpeed: w.maxSpeed ?? w.projSpeed,
          positionTurnRate: (w.turnRateDegPerSec ?? 0) * Math.PI / 180, forecastTurnRate: (w.turnRateDegPerSec ?? 30) * Math.PI / 180,
          fixed: m.mountType === 'HARDPOINT' || (w.turnRateDegPerSec ?? 1) <= 0,
          beamDuration: Number.isFinite(w.beamDuration) ? w.beamDuration : undefined, role: mountRole(ship, m), originalPointDefense: !!w.isPointDefense,
          stageFlags: (w.isPointDefense || hints.includes('PD') || hints.includes('PD_ONLY') ? W.PD : 0)
            | (hints.includes('PD_ONLY') ? W.PD_ONLY : 0) | (w.isBeam ? W.BEAM : 0) | (w.isGuided ? W.GUIDED : 0)
            | (w.weaponType === 'MISSILE' || w.spawnType === 'MISSILE' ? W.MISSILE : 0) | (m.mountType === 'HARDPOINT' ? W.HARDPOINT : 0)
            | (w.alwaysFire ? W.ALWAYS_FIRE : 0) | (w.systemOnly ? W.SYSTEM_ONLY : 0),
          stageHints: ['PD', 'PD_ONLY', 'ANTI_FTR', 'STRIKE', 'USE_LESS_VS_SHIELDS', 'USE_LESS_VS_HULL', 'CONSERVE_AMMO', 'DO_NOT_AIM', 'GUIDED_POOR']
            .reduce((mask, h, i) => mask | (hints.includes(h) ? 1 << i : 0), 0),
        };
      }),
      systems: ship.allSystems.map((s, i) => systemMeta(s, i + 1, s === ship.defenseSystem)),
      memory: memoryOwners.has(ship), initialTarget: target ? handle(target) : undefined,
    };
  });
}
