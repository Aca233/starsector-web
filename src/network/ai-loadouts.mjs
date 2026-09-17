import { wireDesign } from './design-wire.mjs';
/** Identity/name/time/profile are presentation, not combat configuration. */
export function aiDesignSignature(input) {
  const d = wireDesign(input);
  return JSON.stringify({hullId:d.hullId, sourceVariantId:d.sourceVariantId ?? null,
    weapons:Object.entries(d.weapons).filter(([,id])=>id!==null).sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0),
    hullMods:[...d.hullMods].sort(),sMods:[...d.sMods].sort(),
    captainSkills:Object.entries(d.captainSkills).sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0),
    wings:d.wings ?? null,capacitors:d.capacitors,vents:d.vents,
    groups:d.groups.map(g=>({...g,weaponSlotIds:[...g.weaponSlotIds].sort()})).sort((a,b)=>a.index-b.index)});
}
export const aiLoadout = (options, key) => Object.hasOwn(options.aiLoadouts ?? {}, key) ? options.aiLoadouts[key] : undefined;
/** Raw hull IDs are retained only for legacy/default fleet entries. */
export const aiHullId = (options, key) => aiLoadout(options,key)?.hullId ?? key;
export function pruneAiLoadouts(options) {
  const used = new Set(options.aiHulls.flat());
  return {...options,aiLoadouts:Object.fromEntries(Object.entries(options.aiLoadouts ?? {}).filter(([key])=>used.has(key)))};
}
/** Compare actual contents, never names or a collision-prone hash. IDs are monotonic within a room. */
export function registerAiLoadout(options, input) {
  const design=wireDesign(input), signature=aiDesignSignature(design);
  for(const [key,existing] of Object.entries(options.aiLoadouts ?? {})) if(aiDesignSignature(existing)===signature) return {options,key};
  const id=options.aiNextId ?? 1;
  if(!Number.isSafeInteger(id)||id<1||id>=Number.MAX_SAFE_INTEGER)throw Error('AI 方案编号已用尽，请重新建房');
  const key='fit:'+id;
  if(Object.hasOwn(options.aiLoadouts ?? {},key))throw Error('AI 方案编号冲突');
  return {options:{...options,aiNextId:id+1,aiLoadouts:{...options.aiLoadouts,[key]:design}},key};
}
