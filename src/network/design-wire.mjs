import captainPortraits from '../shared/captain-portraits.json' with { type: 'json' };
// Shared transport boundary only: no simulation, registry or browser storage on the relay.
export const MAX_DESIGN_BYTES = 64000;
const bad = () => { throw Error('联机方案格式无效或超过限制'); };
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : bad();
const text = (v, max = 160) => typeof v === 'string' && v.length > 0 && v.length <= max && !['__proto__','prototype','constructor'].includes(v) ? v : bad();
const list = (v, max, map) => Array.isArray(v) && v.length <= max ? v.map(map) : bad();
const integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max ? v : bad();
const portraitIds = new Set(captainPortraits.map(p => p.id));
const captainProfile = input => {
  const p = object(input);
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 24 || !portraitIds.has(p.portrait)) bad();
  return { name: p.name, portrait: p.portrait };
};
/** Only declarative equipment IDs and bounded cosmetic profile data cross this boundary. */
export function wireDesign(input) {
  if (JSON.stringify(input)?.length > MAX_DESIGN_BYTES) bad();
  return wireModule(input, {count: 0}, 0);
}
function wireModule(input, state, depth) {
  if (depth > 8 || ++state.count > 128) bad();
  const d = object(input);
  if (d.version !== 1) bad();
  const weapons = object(d.weapons), skills = object(d.captainSkills ?? {});
  if (Object.keys(weapons).length > 256 || Object.keys(skills).length > 64) bad();
  return {
    version: 1, id: text(d.id,80), name: text(d.name,48), hullId: text(d.hullId),
    ...(d.sourceVariantId === undefined ? {} : {sourceVariantId:text(d.sourceVariantId)}),
    ...(d.modules === undefined ? {} : {modules: Object.fromEntries(
      list(Object.entries(object(d.modules)), 127, ([slot, child]) => [text(slot), wireModule(child, state, depth + 1)])
    )}),
    weapons: Object.fromEntries(Object.entries(weapons).map(([slot,id])=>[text(slot),id === null ? null : text(id)])),
    hullMods:list(d.hullMods,64,id=>text(id)), sMods:list(d.sMods ?? [],64,id=>text(id)),
    captainSkills:Object.fromEntries(Object.entries(skills).map(([id,level])=>[text(id),level === 1 || level === 2 ? level : bad()])),
    ...(d.captainProfile === undefined ? {} : {captainProfile:captainProfile(d.captainProfile)}),
    ...(d.wings === undefined ? {} : {wings:list(d.wings,32,id=>id === null ? null : text(id))}),
    capacitors:integer(d.capacitors,1000), vents:integer(d.vents,1000),
    groups:list(d.groups,7,(value)=>{const g=object(value);return {index:integer(g.index,6),mode:['LINKED','ALTERNATING'].includes(g.mode)?g.mode:bad(),isAutofire:typeof g.isAutofire==='boolean'?g.isAutofire:bad(),weaponSlotIds:list(g.weaponSlotIds,256,id=>text(id))};}),
    updatedAt:integer(d.updatedAt,Number.MAX_SAFE_INTEGER),
  };
}
