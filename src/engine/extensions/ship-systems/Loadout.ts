import type { ShipSpec } from '../../content/ShipSpec';
import { resolveSystemId, shipSystemDefinitions } from './Registry';

/** An absent list inherits the native fit; an empty list never restores a default skill. */
export function tacticalSystemIds(spec: Pick<ShipSpec, 'systemType' | 'systemTypes'>): string[] {
  return (spec.systemTypes ?? (spec.systemType === 'NONE' ? [] : [spec.systemType])).map(resolveSystemId);
}
/** Keep native source data intact so restoring defaults never reconstructs a hull. */
export function defenseSystemId(spec: Pick<ShipSpec, 'defenseSystemType' | 'rightClickSystemType'>): string {
  return resolveSystemId(spec.rightClickSystemType ?? spec.defenseSystemType ?? 'NONE');
}
export function systemLoadoutErrors(spec: ShipSpec): string[] {
  if (spec.systemTypes === undefined && spec.rightClickSystemType === undefined) return []; // Preserve native/legacy fits.
  if (spec.systemTypes !== undefined && (!Array.isArray(spec.systemTypes) || spec.systemTypes.length > 64 || spec.systemTypes.some(id => typeof id !== 'string' || id.length > 160))) return ['技能列表格式无效（最多 64 项）'];
  if (spec.rightClickSystemType !== undefined && (typeof spec.rightClickSystemType !== 'string' || spec.rightClickSystemType.length > 160)) return ['右键技能格式无效'];
  const ids = tacticalSystemIds(spec), defense = defenseSystemId(spec), errors: string[] = [];
  if (new Set(ids).size !== ids.length) errors.push('同一种技能不能重复装配');
  if (defense !== 'NONE' && ids.includes(defense)) errors.push('右键与技能槽不能重复装配同一种技能');
  const edited = [...(spec.systemTypes === undefined ? [] : ids), ...(spec.rightClickSystemType === undefined || defense === 'NONE' ? [] : [defense])];
  for (const id of edited) {
    const definition = shipSystemDefinitions.get(id);
    if (!definition || definition.unavailable || id === 'NONE') { errors.push('技能不可装配：' + id); continue; }
    const reason = definition.installReason?.(spec);
    if (reason) errors.push(definition.name + '：' + reason);
  }
  return errors;
}
