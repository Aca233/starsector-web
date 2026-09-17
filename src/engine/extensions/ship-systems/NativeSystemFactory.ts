import metadata from './native-system-metadata.json';
import type { ShipSystemDefinition } from './Types';

/** Source CSV timing/cost/controls, independent of behavior. Metadata alone never registers an implementation. */
export function nativeSystem(sourceId: keyof typeof metadata, behavior: Partial<ShipSystemDefinition>): ShipSystemDefinition {
  const { row, spec } = metadata[sourceId];
  const number = (key: keyof typeof row) => Number(row[key] || 0);
  const yes = (key: keyof typeof row) => String(row[key]).toLowerCase() === 'true';
  const active = number('active'), toggle = yes('toggle');
  return {
    id: sourceId.toUpperCase(), sourceIds: [sourceId], name: row.name,
    chargeUp: number('charge up'), active: toggle && !active ? Infinity : active,
    chargeDown: number('down'), cooldown: number('cooldown'), toggle,
    ...(number('max uses') ? { charges: number('max uses'), chargeRegen: number('regen') } : {}),
    fluxPerUseFraction: number('f/u (base cap)'), fluxPerUseFlat:number('flux/use'), fluxPerUseDissipationFraction:number('f/u (base rate)'), hardFlux: yes('hardFlux'),
    controls: { blockWeapons: yes('noFiring'), blockShields: yes('noShield'), blockVenting: yes('noVent'),
      blockAcceleration: yes('noAccel'), blockStrafing: yes('noStrafing'),
      lockTurning: yes('noTurning'), blockFluxDissipation: yes('noDissipation'),
      forceForward: 'alwaysAccelerate' in spec && spec.alwaysAccelerate === true },
    implementationDetails: '原版脚本战斗效果、CSV 时序/幅能/次数与控制限制；使用 Web 战术 AI，不伪造未接入的专用音效或视觉资产。',
    ...behavior,
    modifiers: (system, capacity, owner) => ({ softFluxPerSecond: number('flux/second'), ...behavior.modifiers?.(system, capacity, owner) }),
  };
}
