import { GLORIANA_HULL_ID } from '../engine/content/GlorianaPack';
import { GLORIANA_HULLMODS as H } from '../engine/content/GlorianaHullMods';
import { GLORIANA_WEAPONS as W } from '../engine/content/GlorianaArmory';
import { baseHull } from './DesignModel';
import { createBundledPresetDesign } from './BundledPresetDesign';
import type { Design, Group } from './DesignModel';
export const GLORIANA_ARSENAL_FIT = '帝国军械 · 战列齐射 II';
/** Explicitly selected fit only. Never runs during save migration or default hull creation. */
function fittedAssembly(): Design {
  function fit(hullId: string): Design {
    const d = createBundledPresetDesign(hullId), hull = baseHull(hullId)!;
    const core = hullId === GLORIANA_HULL_ID;
    d.groups = Array.from({length: 7}, (_,index): Group => ({index, weaponSlotIds:[], mode:'LINKED', isAutofire: index !== 0 && index !== 2}));
    for (const slot of hull.weaponSlots) {
      const torpedo = core && ['M12','M13'].includes(slot.slotId);
      d.weapons[slot.slotId] = torpedo ? W.torpedo : slot.slotSize === 'EXTRA_LARGE' ? core ? W.lance : W.macro
        : slot.slotSize === 'LARGE' ? W.siege : core ? W.interceptor : W.bolter;
      const index = torpedo ? 2 : slot.slotSize === 'MEDIUM' ? 3 : slot.slotSize === 'EXTRA_LARGE' ? 0 : 1;
      d.groups[index].weaponSlotIds.push(slot.slotId);
    }
    if (!core) { d.groups[0].isAutofire = true; d.groups[0].mode = 'ALTERNATING'; }
    d.vents = core || !hull.weaponSlots.some(s => s.slotSize === 'EXTRA_LARGE') ? 20 : 30;
    d.capacitors = core || !hull.weaponSlots.some(s => s.slotSize === 'EXTRA_LARGE') ? 10 : 20;
    d.modules = Object.fromEntries((hull.modules ?? []).map(module => [module.slotId, fit(module.spec.id)]));
    return d;
  }
  return fit(GLORIANA_HULL_ID);
}

/** Explicit v2 preset; old serialized designs are never migrated into it. */
export function createGlorianaArsenalDesign(current?: Pick<Design, 'wings'>): Design {
  const design = fittedAssembly();
  for (const module of Object.values(design.modules ?? {})) {
    if (/^web_gloriana_[ps][123]$/.test(module.hullId)) module.hullMods.push(H.loader);
  }
  if (current?.wings !== undefined) design.wings = [...current.wings];
  design.name = GLORIANA_ARSENAL_FIT;
  return design;
}

export const GLORIANA_AVIATION_FIT = '帝国航空 · 盾矛协同 II';
/** New explicit fit; deliberately replaces wings only when the player selects this variant. */
export function createGlorianaAviationDesign(): Design {
  const d = fittedAssembly();
  d.name = GLORIANA_AVIATION_FIT;
  d.wings = ['web_gloriana_fury_wing','web_gloriana_fury_wing','web_gloriana_thunderhawk_wing','web_gloriana_starhawk_wing','web_gloriana_starhawk_wing','web_gloriana_starhawk_wing'];
  d.hullMods.push(H.flightline);
  // Fund the third bomber wing and paid deck support without free OP or resizing slots.
  for (const slotId of ['M12', 'M13']) d.weapons[slotId] = W.siege;
  d.groups[1].weaponSlotIds.push(...d.groups[2].weaponSlotIds);
  d.groups[2].weaponSlotIds = [];
  d.capacitors = 0; // 138 weapons + 84 wings + 18 flightline + 20 vents = 260 OP.
  return d;
}
