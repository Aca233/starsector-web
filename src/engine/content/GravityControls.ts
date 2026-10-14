import type { ShipSpec } from './ShipSpec';
import { GRAVITY_SYSTEM_IDS as ID } from './GravityIds';

/** Shared by the original production hull and nonvisual rules probes.
 * Fresh arrays preserve instance loadouts. */
export function gravityControlSpec(): Pick<ShipSpec, 'systemType' | 'systemTypes' | 'defenseSystemType' | 'rightClickSystemType' | 'shieldType' | 'shieldArcDeg' | 'shieldRadius' | 'shieldEfficiency' | 'shieldUpkeep'> {
  return {
    systemType: ID.well, systemTypes: [ID.well, ID.release],
    defenseSystemType: 'NONE', rightClickSystemType: ID.repulsor,
    shieldType: 'NONE', shieldArcDeg: 0, shieldRadius: 0, shieldEfficiency: 1, shieldUpkeep: 0,
  };
}
export function gravityBattleControlSpec(): ReturnType<typeof gravityControlSpec> {
  return {...gravityControlSpec(),systemType:ID.battleWell,systemTypes:[ID.battleWell,ID.battleRepulsor],rightClickSystemType:ID.push};
}

/** Materialized-fit migration only: never rewrites a saved design or custom system choices. */
export function upgradeGravityControlSpec(spec: ShipSpec): void {
  if ((spec.sourceHullId ?? spec.id) === 'web_gravity' && spec.systemTypes?.length === 2
    && spec.systemTypes[0] === ID.battleWell && spec.systemTypes[1] === ID.collapse
    && spec.rightClickSystemType === ID.battleRepulsor) {
    spec.systemTypes = [ID.battleWell, ID.battleRepulsor]; spec.rightClickSystemType = ID.push;
  }
  if ((spec.sourceHullId ?? spec.id) === 'web_gravity' && spec.systemTypes?.join(',') === [ID.battleWell,ID.battleRepulsor].join(',')
    && spec.rightClickSystemType === ID.polarity) spec.rightClickSystemType = ID.push;
}
