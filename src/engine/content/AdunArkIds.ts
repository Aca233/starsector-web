export const ADUN_ARK_ID='web_spear_of_adun_ark';
export const ADUN_ARK_FORGE='WEB_ADUN_ARK_FORGE';
export const ADUN_ARK_BARRIER='WEB_ADUN_ARK_BARRIER';
export const ADUN_ARK_REPAIR='WEB_ADUN_ARK_REPAIR';
export const ADUN_ARK_PARTS=['FORE','PORT','STARBOARD','AFT'] as const;
export type AdunArkOwner='CORE'|typeof ADUN_ARK_PARTS[number];
export const arkHullId=(owner:AdunArkOwner)=>owner==='CORE'?ADUN_ARK_ID:ADUN_ARK_ID+'_'+owner.toLowerCase();
export const arkOwner=(id:string):AdunArkOwner|undefined=>id===ADUN_ARK_ID?'CORE':ADUN_ARK_PARTS.find(part=>arkHullId(part)===id);
export const ADUN_ARK_ART='/game-assets/graphics/ships/web_adun_ark/';

/** Separate IDs keep hull specs and stat registration free of import cycles. */
export const ARK_HULLMODS = {
 reactor: 'web_ark_solar_core', coupler: 'web_ark_corona_coupler',
 matrix: 'web_ark_fast_matrix', hangar: 'web_ark_phase_recovery',
} as const;
