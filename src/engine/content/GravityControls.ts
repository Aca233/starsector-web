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
  return {...gravityControlSpec(),systemType:ID.battleWell,systemTypes:[ID.battleWell,ID.collapse],rightClickSystemType:ID.battleRepulsor};
}
