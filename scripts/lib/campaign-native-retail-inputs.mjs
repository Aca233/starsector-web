/** Data-only submarket/cargo capture. References to non-resource objects are retained, not instantiated. */
import { restoreOriginalStoredMember } from '../../src/campaign/rules/OriginalStorage.mjs';
import { ORIGINAL_MARKET_REFERENCE as R } from '../../src/campaign/rules/OriginalMarketPricing.mjs';
const check = (ok, message) => { if (!ok) throw Error('NATIVE_SAVE_INPUT: ' + message); };
const float = (text, label) => { check(typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text), 'Invalid ' + label); const n = Math.fround(Number(text)); check(Number.isFinite(n), 'Invalid ' + label); return n; };
const bool = (text, label) => { check(text === 'true' || text === 'false', 'Missing/invalid ' + label); return text === 'true'; };
// Keep inline values, but represent nested object definitions by their source identities, never traverse backlinks.
function retained(node, top = true) {
 if (!top && node.attributes.z) return { name: node.name, attributes: { ref: node.attributes.z }, children: [], text: '' };
 return { name: node.name, attributes: { ...node.attributes }, children: node.children.map(n => retained(n, false)), text: node.text };
}
export function captureNativeResourceCargo(g, r, node) {
 if (!node) return null;
 check(!node.attributes.cl || node.attributes.cl === 'CargoData', 'Unsupported submarket cargo class');
 const unresolved = [], list = g.child(node, 's'); if (!list) unresolved.push('missing-cargo-slots');
 const ref = key => { const child = g.child(node, key); return child ? r.ref(child) : null; };
 const slots = r.members(list).map(stack => {
  if (stack.name === 'null') return null;
  check(!stack.attributes.cl || stack.attributes.cl === 'CIStack', 'Unsupported cargo stack class');
  const type = stack.attributes.t, objectRef = r.ref(stack), size = float(stack.attributes.s, 'cargo stack size');
  check(['RESOURCES','WEAPONS','FIGHTER_CHIP','SPECIAL','NULL'].includes(type), 'Unknown stack type');
  if (type !== 'RESOURCES') {
   let item={};if(['WEAPONS','FIGHTER_CHIP'].includes(type))item={itemId:r.value(stack,'d',true)};
   if(type==='SPECIAL'){const data=g.child(stack,'d',true);check(!data.attributes.cl||data.attributes.cl==='SpID','Unsupported special item data');item={itemId:r.attr(data,'i'),itemData:r.attr(data,'d')};check(typeof item.itemId==='string'&&item.itemId.length>0,'Missing special item ID');}
   return {objectRef,type,size,...item,source:retained(stack)};
  }
  const commodityId = r.value(stack, 'd', true), spec = Object.hasOwn(R.commodities, commodityId) && R.commodities[commodityId];
  check(spec && !spec.plugin, 'Resource stack needs a supported commodity definition');
  const savedMax = float(stack.attributes.mS, 'stack capacity'), owner = g.child(stack, 'c');
  check(!owner || owner === node || owner === g.child(node, 'origSource'), 'Cargo stack points to another owner');
  return { objectRef, type, commodityId, size, maxSize: savedMax < 100000 ? spec.stackSize : savedMax,
   roundSize: bool(stack.attributes.rS, 'stack rounding'), cargoSpacePerUnit: spec.cargoSpace, source: retained(stack) };
 });
 const partialsNode = g.child(node, 'partials'), partials = partialsNode ? {} : null;
 for (const entry of r.members(partialsNode)) {
  check(entry.name === 'e' && entry.children.length === 2, 'Invalid cargo partial map');
  const key = g.resolve(entry.children[0]).text.trim(); check(key.startsWith('RESOURCES') && !Object.hasOwn(partials, key), 'Invalid/duplicate resource partial');
  partials[key] = float(g.resolve(entry.children[1]).text.trim(), 'cargo partial');
 }
 const carryingFleetRef = ref('cF'), origSourceRef = ref('origSource');
 if (carryingFleetRef) unresolved.push('carrying-fleet-sync-not-restored');
 if (origSourceRef) unresolved.push('original-cargo-source-not-restored');
 return { objectRef: r.ref(node), unlimitedStacks: bool(node.attributes.uS, 'unlimited stacks'), slots, partials,
  spaceUsed: float(node.attributes.sU, 'saved cargo space'), extraCargoUsed: 0,
  creditsRef: ref('c'), mothballedShipsRef: ref('mS'), carryingFleetRef, origSourceRef,
  nonResourceLifecycle: 'retained-source-references-only', source: retained(node), unresolved };
}
export function captureNativeStoredMember(g,r,node){
   if(node.name==='null')return null;
   check(!node.attributes.cl||node.attributes.cl==='FMmbr','Unsupported stored member class');
   const saved=g.child(node,'savedVariant');let savedVariant=null;
   if(saved){
    const weapons=r.members(g.child(saved,'wpn',true)).map(e=>{check(e.name==='e'&&e.children.length===2,'Invalid stored weapon map');return e.children.map(x=>g.resolve(x).text.trim());});
    const wings=r.members(g.child(saved,'wng')).map(w=>w.name==='null'?null:w.text.trim());
    const strings=key=>r.members(g.child(saved,key,key==='hM')).map(n=>g.resolve(n).text);
    const flux=key=>{const text=r.attr(saved,key),n=text===null?0:Number(text);check(Number.isInteger(n)&&n>=0&&n<=2147483647,'Invalid saved flux allocation');return n;};
    const stationModules=r.members(g.child(saved,'sM')).map(e=>{check(e.name==='e'&&e.children.length===2,'Invalid module map');return e.children.map(x=>g.resolve(x).text);});
    const effects={hullMods:strings('hM'),permaMods:strings('pM'),sMods:strings('sMods'),sModdedBuiltIns:strings('sModdedBuiltIns'),suppressedMods:strings('suM'),tags:strings('tags'),fluxVents:flux('v'),fluxCapacitors:flux('c'),stationModules};
    savedVariant={objectRef:r.ref(saved),hullId:r.attr(saved,'hId'),weapons,wings,effects,source:retained(saved)};
   }
   const member={objectRef:r.ref(node),type:r.attr(node,'t'),specId:r.attr(node,'sid'),savedVariant,source:retained(node)};
   return restoreOriginalStoredMember(member);
}
function captureStorage(g,r,submarket,plugin,market){
 const unresolved=[],classAlias=plugin?(plugin.attributes.cl??plugin.name):null,pluginRef=plugin?r.ref(plugin):null;
 if(classAlias!=='StoragePlugin')unresolved.push('unsupported-storage-plugin');
 if(plugin)check(g.child(plugin,'m',true)===market&&g.child(plugin,'s',true)===submarket,'Storage plugin owner mismatch');
 const faction=g.child(submarket,'f'),factionId=faction?r.value(faction,'id',true):null;
 if(!factionId)unresolved.push('missing-storage-faction');
 const paid=plugin?r.attr(plugin,'paid'):null;
 if(paid===null)unresolved.push('missing-storage-paid');
 const cargo=plugin?captureNativeResourceCargo(g,r,g.child(plugin,'c')):null;
 const fleetNode=plugin&&g.child(g.child(plugin,'c'),'mS');let mothballed=null;
 if(fleetNode){
  const pending=[],list=g.child(fleetNode,'m');if(!list)pending.push('missing-stored-member-roster');
  const members=r.members(list).map(node=>{try{return captureNativeStoredMember(g,r,node);}catch(e){pending.push('member-valuation:'+r.ref(node)+':'+e.message);return {objectRef:r.ref(node),type:r.attr(node,'t'),specId:r.attr(node,'sid'),savedVariant:null,source:retained(node),variant:null,valuationLifecycle:'unresolved'};}});
  mothballed={objectRef:r.ref(fleetNode),factionId,members,unresolved:pending};
 }
 return {scope:'native-storage-current-objects',pluginRef,classAlias,playerPaidToUnlock:paid===null?null:bool(paid,'storage paid'),factionId,factionRef:faction?r.ref(faction):null,cargo,mothballed,unresolved};
}
export function captureNativeOpenRetail(g, r, market) {
 const list = g.child(market, 'submarkets'), unresolved = [], submarkets = [], otherSubmarkets = [];
 if (!list) unresolved.push('missing-submarket-roster');
 const seen = new Set();
 for (const submarket of r.members(list)) {
  const specId = submarket.attributes.s;
  check(typeof specId === 'string' && specId.length > 0 && !seen.has(specId), 'Invalid/duplicate submarket id'); seen.add(specId);
  check(g.child(submarket, 'm', true) === market, 'Submarket belongs to another market');
  const plugin = g.child(submarket, 'p'), objectRef = r.ref(submarket);
  if (specId !== 'open_market') { otherSubmarkets.push({ objectRef, specId, pluginRef: plugin ? r.ref(plugin) : null, source: retained(submarket), ...(specId==='storage'?{storage:captureStorage(g,r,submarket,plugin,market)}:{}) }); continue; }
  const pending = [], timers = { minSWUpdateInterval: null, sinceSWUpdate: null, sinceLastCargoUpdate: null };
  if (!plugin || (plugin.attributes.cl ?? plugin.name) !== 'OpenMarketPlugin') pending.push('unsupported-open-market-plugin');
  if (plugin) {
   check(g.child(plugin, 'm', true) === market && g.child(plugin, 's', true) === submarket, 'Open market plugin owner mismatch');
   for (const [field, alias] of Object.entries({ minSWUpdateInterval:'mSWUI', sinceSWUpdate:'msSWU', sinceLastCargoUpdate:'sLCU' })) {
    const text = r.attr(plugin, alias); timers[field] = text === null ? null : float(text, field); if (text === null) pending.push('missing-' + field);
   }
  }
  const cargo = plugin ? captureNativeResourceCargo(g, r, g.child(plugin, 'c')) : null;
  if (!cargo) pending.push('lazy-cargo-and-mothballed-fleet-not-created');
  const faction = g.child(submarket, 'f');
  submarkets.push({ objectRef, specId, pluginRef: plugin ? r.ref(plugin) : null, factionRef: faction ? r.ref(faction) : null,
   timers, cargo, source: retained(submarket), pluginSource: plugin ? retained(plugin) : null, unresolved: pending });
 }
 return { scope:'native-saved-open-resource-cargo', submarkets, otherSubmarkets, unresolved };
}
