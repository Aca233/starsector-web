import type { ShipSpec } from '../../content/ShipSpec';
import { resolveSystemId, shipSystemDefinitions } from './Registry';

/** An absent list inherits the native fit; an empty list never restores a default skill. */
export function tacticalSystemIds(spec: Pick<ShipSpec, 'systemType' | 'systemTypes'>): string[] {
  return (spec.systemTypes ?? (spec.systemType === 'NONE' ? [] : [spec.systemType])).map(resolveSystemId);
}
export function systemLoadoutErrors(spec: ShipSpec): string[] {
  if (spec.systemTypes === undefined) return []; // Preserve all native/legacy default fits.
  if (!Array.isArray(spec.systemTypes) || spec.systemTypes.length > 64 || spec.systemTypes.some(id => typeof id !== 'string')) return ['技能列表格式无效（最多 64 项）'];
  const ids = tacticalSystemIds(spec), errors: string[] = [];
  if (new Set(ids).size !== ids.length) errors.push('同一种技能不能重复装配');
  if (spec.defenseSystemType && ids.includes(resolveSystemId(spec.defenseSystemType))) errors.push('不能重复装配独立防御槽中的技能');
  for (const id of ids) {
    const definition = shipSystemDefinitions.get(id);
    if (!definition || definition.unavailable || id === 'NONE') { errors.push('技能不可装配：' + id); continue; }
    const reason = definition.installReason?.(spec);
    if (reason) errors.push(definition.name + '：' + reason);
  }
  return errors;
}
