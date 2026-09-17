import { contentRegistry } from './ContentRegistry';
import { hullModDefinitions } from '../extensions/HullMods';
import type { ShipSpec } from './ShipSpec';
export interface NativeVariant {
  hullId: string; variantId: string; fluxCapacitors: number; fluxVents: number;
  hullMods?: readonly string[]; permaMods?: readonly string[]; sMods?: readonly string[];
  weaponGroups: readonly {mode: string; autofire?: boolean; weapons: Readonly<Record<string,string>>}[];
}
/** Source-authored runtime entity loadout; shared by launchers, mirrors and spawned ships. */
export function nativeVariantSpec(variant: NativeVariant): ShipSpec {
  const base = contentRegistry.getShip(variant.hullId);
  if (!base) throw new Error('Missing variant hull: '+variant.hullId);
  const weapons = Object.assign({}, ...variant.weaponGroups.map(g=>g.weapons)) as Record<string,string>;
  for (const [slot,id] of Object.entries(weapons)) if (!base.weaponSlots.some(s=>s.slotId===slot) || !contentRegistry.getWeapon(id)) throw new Error('Invalid variant mount: '+variant.variantId+'/'+slot+'/'+id);
  const mods = [...new Set([...(variant.hullMods??[]),...(variant.permaMods??[])])];
  const internal = mods.filter(id=>hullModDefinitions.require(id).refit?.builtInOnly);
  const builtIn = [...new Set([...(base.builtInHullMods??[]),...internal])];
  return { ...base, sourceVariantId:variant.variantId, hullMods:mods.filter(id=>!builtIn.includes(id)), builtInHullMods:builtIn,
    sourceHullTraits:[...new Set([...(base.sourceHullTraits??[]),...internal])], sMods:[...(variant.sMods??[])], captainSkills:{},
    maxFlux:base.maxFlux+variant.fluxCapacitors*200, fluxDissipation:base.fluxDissipation+variant.fluxVents*10,
    shieldUpkeepBaseDissipation:base.shieldUpkeepBaseDissipation??base.fluxDissipation,
    weaponSlots:base.weaponSlots.map(slot=>({...slot,defaultWeaponId:slot.builtIn?slot.defaultWeaponId:weapons[slot.slotId]})),
    defaultWeaponGroups:variant.weaponGroups.map((g,index)=>({index,mode:g.mode==='ALTERNATING'?'ALTERNATING':'LINKED',isAutofire:g.autofire??true,weaponSlotIds:Object.keys(g.weapons)})) };
}
