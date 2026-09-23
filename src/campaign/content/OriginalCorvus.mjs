/** Read-only authored content, not a world constructor or an orbital/market simulator. */
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const text = x => typeof x === 'string' && x.length > 0;
const strings = x => Array.isArray(x) && x.every(text);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
function copyJSON(value, ancestors = new Set(), depth = 0) {
 if(value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) return value;
 if(depth > 80 || !value || typeof value !== 'object' || ancestors.has(value)) throw new TypeError('Expected acyclic bounded JSON data');
 if(!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError('Expected plain JSON objects');
 ancestors.add(value);const result=Array.isArray(value)?[]:{};
 if(Array.isArray(value) && Object.keys(value).length !== value.length) throw new TypeError('Sparse/non-JSON array');
 for(const key of Object.keys(value)){
  if(['__proto__','constructor','prototype'].includes(key)) throw new TypeError('Unsafe JSON key');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!Object.hasOwn(descriptor,'value')) throw new TypeError('JSON accessors are not allowed');
  result[key]=copyJSON(descriptor.value,ancestors,depth+1);
 }
 ancestors.delete(value);return result;
}
function freeze(x) { if(x && typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x; }

/** Structural/semantic validation. Native SHA authenticity is checked by the importer --check,
 * not asserted merely because a client supplies a syntactically valid hash. */
export function validateOriginalCorvusData(input) {
 const errors=[];const check=(v,message)=>{if(!v)errors.push(message);};
 let d;
 try{d=copyJSON(input);}catch(error){return freeze({valid:false,errors:[error.message]});}
 try{
  check(object(d),'data must be an object');if(!object(d))return freeze({valid:false,errors});
  check(d.schemaVersion===1 && d.id==='original-corvus','unsupported schema/id');
  check(d.scope==='authored-blueprint-not-complete-generated-system','incorrect completeness claim');
  for(const key of ['sources','entities','markets','operations','stages','postprocessing','limitations'])check(Array.isArray(d[key]),`${key} must be an array`);
  check(object(d.system)&&object(d.specs)&&object(d.constants),'missing system/specs/constants');
  if(errors.length)return freeze({valid:false,errors});
  const sourceIds=new Set();
  for(const s of d.sources){
   check(object(s)&&text(s.id)&&['core','decompiled'].includes(s.root)&&text(s.path)&&hash(s.sha256)&&Number.isInteger(s.bytes)&&s.bytes>0,'invalid source');
   check(!sourceIds.has(s.id),'duplicate source '+s.id);sourceIds.add(s.id);
   check(s.id===s.root+':'+s.path && !s.path.startsWith('/')&&!s.path.includes('\\')&&!s.path.includes(':')&&!s.path.split('/').some(x=>x==='..'||x==='.'||x===''),'unsafe/inconsistent source path');
   check(['hash-pinned-code','data-or-asset'].includes(s.review),'invalid source review');
  }
  const evidence=(s,label)=>check(object(s)&&sourceIds.has(s.id)&&(s.line===undefined||Number.isInteger(s.line)&&s.line>0),`invalid source reference ${label}`);
  const asset=(path,label)=>check(text(path)&&sourceIds.has('core:'+path),`missing asset evidence ${label}`);
  check(d.system.id==='corvus'&&d.system.name==='Corvus','invalid system');
  check(d.system.entryPoint==='data.scripts.world.SectorGen','unsupported entry point');
  asset(d.system.background?.path,'background');
  check(finite(d.system.hyperspaceLocation?.x)&&finite(d.system.hyperspaceLocation?.y),'invalid hyperspace location');evidence(d.system.hyperspaceLocation?.source,'hyperspace');
  check(d.system.respawn?.coordinateSpace==='system'&&finite(d.system.respawn.x)&&finite(d.system.respawn.y),'invalid respawn space');evidence(d.system.respawn?.source,'respawn');
  const handles=new Map(),ids=new Map(),kinds=['star','planet','custom','jump-point','terrain','asteroid-belt','ring-band'];
  for(const e of d.entities){
   check(object(e)&&text(e.handle)&&kinds.includes(e.kind),'invalid entity');
   check(!handles.has(e.handle),'duplicate entity handle '+e.handle);handles.set(e.handle,e);
   if(e.nativeId!==null){check(text(e.nativeId)&&!ids.has(e.nativeId),'duplicate/invalid native id');ids.set(e.nativeId,e);}
   check(e.nativeIdStatus===(e.nativeId===null?'generated-by-engine':'explicit'),'invalid native identity status');
   check(e.name===null||text(e.name),'invalid name');
   check(['runtime-unimplemented','declared','system-name-derived','custom-spec'].includes(e.nameStatus),'invalid name status');
   check(['runtime-unimplemented','declared','custom-spec','native-JumpPoint-default'].includes(e.radiusStatus),'invalid radius status');
   check(e.radius===null?e.radiusStatus==='runtime-unimplemented':finite(e.radius)&&e.radius>0,'invalid radius');
   check(object(e.properties),'invalid properties');evidence(e.source,e.handle);
   check(Number.isInteger(e.creation?.sequence)&&Array.isArray(e.creation.arguments)&&e.creation.arguments.every(x=>typeof x==='string'),'invalid creation');
   check(d.operations[e.creation.sequence]?.result?.handle===e.handle && d.operations[e.creation.sequence]?.result?.kind==='entity','creation not linked to operation');
   if(e.kind==='star'||e.kind==='planet'){
    check(object(d.specs.planets?.[e.planetType]),'unknown planet spec '+e.planetType);
    check(e.radiusStatus==='declared'&&e.name!==null,'incomplete authored planet');
    if(e.kind==='planet')check(e.conditionMarket?.status==='helper-template'&&e.conditionMarket?.id==='market_'+e.nativeId,'missing condition-market phase');
   }
   if(e.kind==='star')check(e.orbit===null&&e.localPosition?.x===0&&e.localPosition?.y===0,'invalid star origin');
   if(e.kind==='custom'){
    const spec=d.specs.customEntities?.[e.customType];check(object(spec),'unknown custom spec');
    check(e.radius===spec?.fields?.defaultRadius?.value,'custom radius contradicts spec');
    check(e.name===(e.nameArgument??spec?.fields?.defaultName?.value),'custom name contradicts source');
    check(e.faction===(e.factionArgument??'neutral'),'custom faction contradicts source');
   }
   if(e.kind==='jump-point')check(e.radius===50&&e.destinationStatus==='requires-autogeneration','unsupported jump materialization');
   if(e.kind==='terrain'){
    check(object(e.parameters)&&text(e.terrainType)&&text(e.generationStatus),'invalid terrain');
    if(e.terrainType==='nebula')check(typeof e.parameters.tiles==='string'&&e.parameters.tiles.length===e.parameters.width*e.parameters.height,'invalid nebula tile count');
    if(e.terrainType==='asteroid_field')check(e.parameters.minRadius<=e.parameters.maxRadius&&e.parameters.minCount<=e.parameters.maxCount,'invalid asteroid range');
   }
   if(['ring-band','asteroid-belt'].includes(e.kind))check(object(e.parameters)&&text(e.focusHandle)&&text(e.generationStatus),'invalid belt/ring');
  }
  check(d.entities.filter(e=>e.kind==='star').length===1,'expected single authored star');
  for(const e of d.entities){
   if(e.orbit!==null){const o=e.orbit;check(object(o)&&['circular','point-down'].includes(o.mode)&&handles.has(o.focusHandle)&&o.focusHandle!==e.handle,'invalid orbit focus/mode '+e.handle);check(finite(o.angleDegrees)&&finite(o.radius)&&o.radius>=0&&finite(o.periodDays)&&o.periodDays>0,'invalid orbit numbers '+e.handle);check(strings(o.sourceExpressions)&&o.sourceExpressions.length===4,'missing original orbit arguments');}
   if(e.focusHandle)check(handles.has(e.focusHandle),'missing ring focus');
   if(e.properties.relatedPlanetHandle)check(handles.get(e.properties.relatedPlanetHandle)?.kind==='planet','invalid related planet');
   const chain=new Set([e.handle]);let current=e;
   while(current?.orbit){const focus=current.orbit.focusHandle;if(chain.has(focus)){check(false,'orbit cycle '+e.handle);break;}chain.add(focus);current=handles.get(focus);}
  }
  for(const [id,spec]of Object.entries(d.specs.planets??{})){check(spec.id===id&&object(spec.declared),'invalid planet spec');evidence(spec.source,id);asset(spec.declared.texture,id+' texture');}
  for(const [id,spec]of Object.entries(d.specs.customEntities??{})){
   check(spec.id===id&&Array.isArray(spec.chain)&&spec.chain.length>0&&object(spec.fields)&&strings(spec.unimplementedDeclaredFields),'invalid custom spec');evidence(spec.source,id);
   for(const [name,field]of Object.entries(spec.fields)){
    const last=[...spec.chain].reverse().find(x=>Object.hasOwn(x.declared,name));
    check(last?field.from===last.id&&JSON.stringify(field.value)===JSON.stringify(last.declared[name])&&field.status===(last.id===id?'declared':'inherited'):field.status==='absent-in-chain'&&!Object.hasOwn(field,'value'),'custom projection mismatch '+id+'.'+name);
   }
  }
  const marketIds=new Set();
  for(const m of d.markets){
   check(text(m.id)&&!marketIds.has(m.id),'duplicate/invalid market id');marketIds.add(m.id);evidence(m.source,m.id);
   check(['economy','abandoned-helper'].includes(m.kind),'invalid market kind');
   check(text(m.name)&&text(m.faction)&&Number.isInteger(m.size)&&m.size>=0,'invalid market identity/size');
   check(ids.has(m.primaryEntityId)&&strings(m.connectedEntityIds)&&m.connectedEntityIds.includes(m.primaryEntityId)&&m.connectedEntityIds.every(id=>ids.has(id)),'missing market entity');
   check(strings(m.conditions)&&strings(m.industries)&&strings(m.submarkets),'invalid market lists');
   for(const id of m.connectedEntityIds)check(ids.get(id)?.marketId===m.id,'market/entity link mismatch');
   if(m.kind==='economy'){
    check(object(m.declared)&&m.id===m.declared.entities?.[0]&&m.faction===m.declared.faction&&m.size===m.declared.size,'market source mismatch');
    check(JSON.stringify(m.conditions)===JSON.stringify(m.declared.startingConditions)&&JSON.stringify(m.industries)===JSON.stringify(m.declared.industries),'market config projection mismatch');
    const expected=m.declared.submarkets??['open_market','black_market','storage',...((m.industries.includes('militarybase')||m.industries.includes('highcommand'))?['generic_military']:[])];
    check(JSON.stringify(expected)===JSON.stringify(m.submarkets),'submarket defaults mismatch');
    check(m.freePort===(m.declared.freePort??false),'free port mismatch');
    check(m.tariff?.status==='runtime-unimplemented'&&!Object.hasOwn(m.tariff,'value'),'fabricated runtime tariff');
   }
  }
  for(const e of d.entities)if(e.marketId)check(marketIds.has(e.marketId),'unknown linked market');
  const stageIds=new Set();for(const s of [...d.stages,...d.postprocessing]){
   check(text(s.id)&&!stageIds.has(s.id)&&s.status==='required-not-executed','invalid stage');stageIds.add(s.id);evidence(s.source,s.id);check(strings(s.requires)&&s.requires.length>0,'missing generator requirements');
   if(s.requiredSources!==undefined)check(strings(s.requiredSources)&&s.requiredSources.every(id=>sourceIds.has(id)),'missing generator dependency source');
   if(s.sequence!==undefined)check(d.operations[s.sequence]?.result?.id===s.id,'stage operation mismatch');
  }
  const done=new Set();for(const s of d.stages){check(Array.isArray(s.dependsOn)&&s.dependsOn.every(id=>done.has(id)),'unresolved/out-of-order stage dependency');done.add(s.id);}
  for(const id of ['abandoned-market','abandoned-cargo','outer-orbits','systemwide-nebula','hyperspace-jumps'])check(stageIds.has(id),'missing required stage '+id);
  const jumps=d.stages.find(s=>s.id==='hyperspace-jumps');check(jumps?.arguments?.generatePlanetConditions===true,'missing implicit condition generation');
  for(const [i,op]of d.operations.entries()){check(op.sequence===i&&text(op.statement)&&object(op.result),'unhandled/out-of-order source operation');evidence(op.source,'operation '+i);}
  check(d.limitations.length>0&&strings(d.limitations),'missing limitations');
 }catch(error){errors.push('Malformed blueprint: '+error.message);}
 return freeze({valid:errors.length===0,errors});
}

/** Returns an isolated deeply frozen blueprint. No fs, JSON-module imports, RNG, or side effects. */
export function buildOriginalCorvusBlueprint(reference) {
 const result=validateOriginalCorvusData(reference);
 if(!result.valid)throw new TypeError('Invalid original Corvus blueprint: '+result.errors.join('; '));
 return freeze(copyJSON(reference));
}
export function createOriginalCorvusProvider(reference) {
 const blueprint=buildOriginalCorvusBlueprint(reference);
 const handles=new Map(blueprint.entities.map(e=>[e.handle,e]));
 const nativeIds=new Map(blueprint.entities.filter(e=>e.nativeId!==null).map(e=>[e.nativeId,e]));
 const markets=new Map(blueprint.markets.map(m=>[m.id,m]));
 return Object.freeze({
  getBlueprint:()=>blueprint,
  listEntities:()=>blueprint.entities,
  getEntity:handle=>handles.get(handle)??null,
  getEntityByNativeId:id=>nativeIds.get(id)??null,
  listMarkets:()=>blueprint.markets,
  getMarket:id=>markets.get(id)??null,
  listRequiredStages:()=>Object.freeze([...blueprint.stages,...blueprint.postprocessing]),
 });
}
