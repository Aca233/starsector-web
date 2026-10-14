import type { ShipSpec } from '../../content/ShipSpec';
import type { PackFit, PackWing } from '../ShipPack';
export function templateFit(spec: ShipSpec, wings: Record<string, PackWing> = {}): PackFit {
  return {hullId: spec.id, weapons: Object.fromEntries(spec.weaponSlots.map(slot => [slot.slotId, slot.defaultWeaponId ?? null])),
    ...(spec.sourceVariantId === undefined ? {} : {sourceVariantId: spec.sourceVariantId}),
    ...(spec.systemTypes === undefined ? {} : {systemTypes: [...spec.systemTypes]}),
    ...(spec.rightClickSystemType === undefined ? {} : {rightClickSystemType: spec.rightClickSystemType}),
    hullMods: [...spec.hullMods ?? []], sMods: [...spec.sMods ?? []], capacitors: 0, vents: 0,
    wings: (spec.fighterWings ?? []).map(wing => Object.entries(wings).find(([, entry]) => entry.specId === wing.specId && entry.count === wing.count)?.[0] ?? null),
    groups: Array.from({length: 7}, (_, index) => structuredClone(spec.defaultWeaponGroups?.find(group => group.index === index)
      ?? {index, weaponSlotIds: [], mode: 'LINKED' as const, isAutofire: true})),
    ...(spec.modules?.length ? {modules: Object.fromEntries(spec.modules.map(module => [module.slotId, templateFit(module.spec, wings)]))} : {})};
}
