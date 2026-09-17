// Shared transport boundary only: no simulation, registry or browser storage on the relay.
export const MAX_DESIGN_BYTES = 64000;
const bad = () => { throw Error('联机方案格式无效或超过限制'); };
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : bad();
const text = (v, max = 160) => typeof v === 'string' && v.length > 0 && v.length <= max && !['__proto__','prototype','constructor'].includes(v) ? v : bad();
const list = (v, max, map) => Array.isArray(v) && v.length <= max ? v.map(map) : bad();
const integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max ? v : bad();
/** Only declarative equipment IDs cross this boundary; never accept a ShipSpec or executable extension. */
export function wireDesign(input) {
  const d = object(input);
  if (JSON.stringify(d).length > MAX_DESIGN_BYTES || d.version !== 1) bad();
  const weapons = object(d.weapons), skills = object(d.captainSkills ?? {});
  if (Object.keys(weapons).length > 256 || Object.keys(skills).length > 64) bad();
  return {
    version: 1, id: text(d.id,80), name: text(d.name,48), hullId: text(d.hullId),
    ...(d.sourceVariantId === undefined ? {} : {sourceVariantId:text(d.sourceVariantId)}),
    weapons: Object.fromEntries(Object.entries(weapons).map(([slot,id])=>[text(slot),id === null ? null : text(id)])),
    hullMods:list(d.hullMods,64,id=>text(id)), sMods:list(d.sMods ?? [],64,id=>text(id)),
    captainSkills:Object.fromEntries(Object.entries(skills).map(([id,level])=>[text(id),level === 1 || level === 2 ? level : bad()])),
    ...(d.wings === undefined ? {} : {wings:list(d.wings,32,id=>id === null ? null : text(id))}),
    capacitors:integer(d.capacitors,1000), vents:integer(d.vents,1000),
    groups:list(d.groups,7,(value)=>{const g=object(value);return {index:integer(g.index,6),mode:['LINKED','ALTERNATING'].includes(g.mode)?g.mode:bad(),isAutofire:typeof g.isAutofire==='boolean'?g.isAutofire:bad(),weaponSlotIds:list(g.weaponSlotIds,256,id=>text(id))};}),
    updatedAt:integer(d.updatedAt,Number.MAX_SAFE_INTEGER),
  };
}
