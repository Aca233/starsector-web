#!/usr/bin/env node
/** Reviewed, intentionally partial native Corvus blueprint. No Java execution or random sampling. */
import { readFile, realpath, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFactionText, sha256 } from './import-campaign-factions.mjs';
import { validateOriginalCorvusData } from '../src/campaign/content/OriginalCorvus.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(project, 'src/campaign/data/reference-corvus.json');
const need = (v, message) => { if (!v) throw new Error(`Corvus import: ${message}`); };
const own = (v, k) => Object.hasOwn(v, k);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const corvusPath = 'data/scripts/world/corvus/Corvus.java';
const java = 'starfarer.api/com/fs/starfarer/api/';
const obf = 'starfarer_obf/com/fs/starfarer/';
// Reviewed code snapshots. Never silently apply these interpretations to changed Java.
const reviewed = [
 ['core', corvusPath, 'a41192c4a9a473f6a641fb074822792ae557a7cb6ffc45cba7270c71c416ad2c'],
 ['core', 'data/scripts/world/SectorGen.java', '0a70fe5fb1339a63939ca474acae9ca628c0ff31f2bf8667ec9e27b6a4840f75'],
 ['decompiled', obf+'campaign/StarSystem.java', '5046b7505286cf6454e0a29a538890ae2b3922d018a58220c4b382b8707756bd'],
 ['decompiled', obf+'campaign/BaseLocation.java', '117ab6012c0a62d2f1f16de7578779d02436625f3d0f0352736ace8d09ff210e'],
 ['decompiled', obf+'campaign/CustomCampaignEntity.java', '4f21bf20ad994452c7424725cf1c642af82663b226ec324a415774c1255dcc9a'],
 ['decompiled', obf+'campaign/BaseCampaignEntity.java', '865edfbe067e2c522c3eb889a92b9c8e1c8dfe4fe2fb75432ea137b21a277670'],
 ['decompiled', obf+'campaign/RingBand.java', '551185f726b6b9e1bd69df1b5c333d5da358f8471007547436f1aed5e9837ad2'],
 ['decompiled', obf+'campaign/JumpPoint.java', '8084775033db72c81cfbf8df42a30ccd499c447f701df9c09aca47a2113722b4'],
 ['decompiled', obf+'loading/SpecStore.java', '23151e3c6f2e01762982baa962d16349db1dd320f9050bf66ee53b51fed9d003'],
 ['decompiled', obf+'loading/specs/int.java', '1f25a417f940314be2bf9b2b1b90f52a0a6614174085ab9dab503aa0dc8627c8'],
 ['decompiled', obf+'loading/S.java', '064806d509c314ddfeed6cfbfb0a9d52f4a4cd69f06277d688ad09e9ffe01dc6'],
 ['decompiled', obf+'campaign/econ/Market.java', '8ca0c019abc8543a80fa63c3826b3ac1f766af3dbc35875161842306378aa945'],
 ['decompiled', obf+'campaign/econ/super.java', '12a88d7488041c240f5264b92005fa08340668a61a02c7542df2b9b738c6ef39'],
 ['decompiled', java+'util/Misc.java', '067e4d2664eca98929e9e46ba8ada8468769c19dcd12cce8c8a3c730e14d2ffb'],
 ['decompiled', java+'impl/campaign/procgen/StarSystemGenerator.java', '5777d6b6888cd08ebdd95a4c9a9569be0af507aefaaa03a5a437a3e3711e3606'],
 ['decompiled', java+'impl/campaign/CoreLifecyclePluginImpl.java', 'ca7384b9f6a8ff9b82faf4df9e1e896ce0e3222c721bd68712146c1130070898'],
];

/** Remove Java comments while preserving newlines/offsets and strings. Not a Java interpreter. */
export function stripJavaComments(text) {
 let out = '', i = 0;
 while (i < text.length) {
  if (text[i] === '"') {
   const start = i++;
   while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
   need(i < text.length, 'unterminated Java string'); out += text.slice(start, ++i); continue;
  }
  if (text.slice(i,i+2) === '//') { while (i < text.length && text[i] !== '\n') { out += ' '; i++; } continue; }
  if (text.slice(i,i+2) === '/*') {
   const end = text.indexOf('*/',i+2); need(end >= 0, 'unterminated Java comment');
   out += text.slice(i,end+2).replace(/[^\n\r]/g,' '); i = end+2; continue;
  }
  out += text[i++];
 }
 return out;
}
export function splitJavaArguments(text) {
 const out = []; let start = 0, depth = 0, quote = false;
 for (let i=0; i<text.length; i++) {
  const c=text[i];
  if (quote) { if(c==='\\') i++; else if(c==='"') quote=false; continue; }
  if(c==='"') quote=true;
  else if(c==='(') depth++;
  else if(c===')') { depth--; need(depth>=0, 'unbalanced arguments'); }
  else if(c===',' && !depth) { out.push(text.slice(start,i).trim()); start=i+1; }
 }
 need(!quote && depth===0, 'unbalanced arguments');
 if(text.trim()) out.push(text.slice(start).trim());
 return out;
}
// Only reviewed constants: arithmetic is intentionally NOT arbitrary JavaScript/eval.
export function readConstant(expression, bindings = {}) {
 const text=expression.trim();
 if(text==='null') return null;
 if(text==='true' || text==='false') return text==='true';
 if(/^"(?:[^"\\]|\\.)*"$/s.test(text)) return JSON.parse(text);
 if(text==='Color.white') return [255,255,255,255];
 if(text.startsWith('new Color(') && text.endsWith(')')) {
  const a=splitJavaArguments(text.slice(10,-1)).map(x=>readConstant(x,bindings));
  need((a.length===3 || a.length===4) && a.every(x=>Number.isInteger(x)&&x>=0&&x<=255),'invalid color');
  return a.length===3 ? [...a,255] : a;
 }
 if(own(bindings,text)) return bindings[text];
 let cursor=0;
 const space=()=>{ while(/\s/.test(text[cursor]??'') && cursor<text.length)cursor++; };
 const atom=()=>{
  space(); const c=text[cursor];
  if(c==='+'||c==='-') {cursor++; const v=atom(); return c==='-'?-v:v;}
  if(c==='('){cursor++;const v=sum();space();need(text[cursor++ ]===')',`unsupported constant ${text}`);return v;}
  const number=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?/.exec(text.slice(cursor));
  if(number){cursor+=number[0].length;return Number(number[0].replace(/[fFdD]$/,''));}
  const name=/^[A-Za-z_]\w*(?:\.getRadius\(\))?/.exec(text.slice(cursor));
  need(name && own(bindings,name[0]) && typeof bindings[name[0]]==='number',`unsupported constant ${text}`);
  cursor+=name[0].length;return bindings[name[0]];
 };
 const product=()=>{let v=atom();space();while(text[cursor]==='*'||text[cursor]==='/'){const op=text[cursor++],b=atom();v=op==='*'?v*b:v/b;space();}return v;};
 const sum=()=>{let v=product();space();while(text[cursor]==='+'||text[cursor]==='-'){const op=text[cursor++],b=product();v=op==='+'?v+b:v-b;space();}return v;};
 const value=sum(); need(cursor===text.length && Number.isFinite(value),`unsupported constant ${text}`);return value;
}
function statements(source) {
 const text=stripJavaComments(source); const begin=text.indexOf('public void generate(SectorAPI sector) {');
 need(begin>=0,'missing generate method'); const start=text.indexOf('{',begin)+1, end=text.indexOf('}',start);
 need(end>start && !text.slice(start,end).includes('{'),'unsupported generate control flow');
 const result=[]; let offset=start, quote=false, depth=0;
 for(let i=start;i<end;i++) {
  const c=text[i];if(quote){if(c==='\\')i++;else if(c==='"')quote=false;continue;}
  if(c==='"')quote=true;else if(c==='(')depth++;else if(c===')')depth--;
  else if(c===';' && depth===0){const raw=text.slice(offset,i);const first=offset+raw.search(/\S/);result.push({sequence:result.length,source:{id:'core:'+corvusPath,line:text.slice(0,first).split('\n').length},statement:raw.trim().replace(/\s*\n\s*/g,' ')});offset=i+1;}
 }
 need(!text.slice(offset,end).trim(),'unparsed generate suffix');return result;
}
const customFields=['defaultName','defaultRadius','customDescriptionId','interactionImage','icon','iconWidth','iconHeight','sprite','spriteWidth','spriteHeight','pluginClass','tags','layers'];
export function resolveCustomEntitySpec(id, all) {
 const chain=[];const visit=(key,seen=[])=>{
  need(!seen.includes(key),`custom entity inheritance cycle ${key}`);need(seen.length<10,'custom inheritance exceeds native pass limit');
  need(plain(all[key]),`missing custom spec ${key}`);if(own(all[key],'baseId'))visit(all[key].baseId,[...seen,key]);chain.push({id:key,declared:all[key]});
 };visit(id);
 const fields={};for(const field of customFields){const entry=[...chain].reverse().find(x=>own(x.declared,field));fields[field]=entry?{status:entry.id===id?'declared':'inherited',from:entry.id,value:entry.declared[field]}:{status:'absent-in-chain'};}
 return {id,source:{id:'core:data/config/custom_entities.json',key:id},chain,fields,
  semantics:'Reviewed clone-and-load; selected scalar fields override when present; tags/layers replace. Engine defaults for absent fields are not synthesized.',
  unimplementedDeclaredFields:[...new Set(chain.flatMap(x=>Object.keys(x.declared)))].filter(x=>x!=='baseId'&&!customFields.includes(x)).sort()};
}

export async function importOriginalCorvus({coreRoot=resolve(project,'../starsector-core'),decompiledRoot=resolve(project,'../decompiled')}={}) {
 const roots={core:await realpath(coreRoot),decompiled:await realpath(decompiledRoot)};const sources=[],cache=new Map();
 const load=async(root,path,expected)=>{
  const id=root+':'+path;if(cache.has(id))return cache.get(id);
  need(typeof path==='string'&&!isAbsolute(path)&&!path.includes('\\')&&!path.split('/').includes('..'),`unsafe source path ${path}`);
  const actual=await realpath(resolve(roots[root],path));const rel=relative(roots[root],actual);
  need(rel && !rel.startsWith('..')&&!isAbsolute(rel),`source escapes ${root}: ${path}`);
  const bytes=await readFile(actual),hash=sha256(bytes);need(!expected||hash===expected,`unreviewed source ${id}: ${hash}`);
  sources.push({id,root,path,sha256:hash,bytes:bytes.length,review:expected?'hash-pinned-code':'data-or-asset'});cache.set(id,bytes);return bytes;
 };
 for(const [root,path,hash]of reviewed)await load(root,path,hash);
 const json=async path=>parseFactionText((await load('core',path)).toString('utf8'),path);
 const planets=await json('data/config/planets.json'),custom=await json('data/config/custom_entities.json'),settings=await json('data/config/settings.json');
 const marketFile=await json('data/campaign/econ/corvus.json'),economy=await json('data/campaign/econ/economy.json'),starmap=await json('data/campaign/starmap.json');
 need(settings.plugins?.newGameCreationEntryPoint==='data.scripts.world.SectorGen','unsupported sector entry point');
 need(economy.starSystems.filter(x=>x==='corvus.json').length===1 && economy.map==='../starmap.json','ambiguous economy manifest');
 need(marketFile.starSystem==='corvus'&&Array.isArray(marketFile.markets),'invalid Corvus markets');
 const dependencyTables=['star_gen_data.csv','age_gen_data.csv','planet_gen_data.csv','name_gen_data.csv','condition_gen_data.csv'];
 for(const name of dependencyTables)await load('core','data/campaign/procgen/'+name);
 const bindings={};
 for(const name of ['Terrain','Factions']){
  const path=java+`impl/campaign/ids/${name}.java`,text=stripJavaComments((await load('decompiled',path)).toString('utf8'));
  for(const m of text.matchAll(/public static final String (\w+) = ("(?:[^"\\]|\\.)*");/g))bindings[name+'.'+m[1]]=JSON.parse(m[2]);
 }
 const sprite=(category,key)=>{const value=settings.graphics?.[category]?.[key];need(typeof value==='string'&&value,`missing sprite ${category}/${key}`);return {category,key,path:value,source:{id:'core:data/config/settings.json',key:`graphics.${category}.${key}`}};};
 const operations=statements(cache.get('core:'+corvusPath).toString('utf8'));
 const entities=[],stages=[],constants={},planetSpecs={},customSpecs={};const byHandle=new Map();
 const val=x=>readConstant(x,bindings);
 const ref=x=>{const match=/^system\.getEntityById\((".*")\)$/.exec(x);const e=match?entities.find(e=>e.nativeId===val(match[1])):byHandle.get(x);need(e,`unresolved entity ${x}`);return e.handle;};
 const make=(handle,kind,args,op)=>{
  need(!byHandle.has(handle),`duplicate handle ${handle}`);
  const e={handle,kind,nativeId:null,nativeIdStatus:'generated-by-engine',name:null,nameStatus:'runtime-unimplemented',radius:null,radiusStatus:'runtime-unimplemented',orbit:null,source:op.source,creation:{sequence:op.sequence,arguments:args},properties:{}};
  entities.push(e);byHandle.set(handle,e);op.result={kind:'entity',handle};return e;
 };
 const orbit=(mode,args)=>{need(args.length===4,'orbit arity');return {mode,focusHandle:ref(args[0]),angleDegrees:val(args[1]),radius:val(args[2]),periodDays:val(args[3]),sourceExpressions:args};};
 const stage=(id,op,details)=>{const s={id,status:'required-not-executed',source:op.source,sequence:op.sequence,...details};stages.push(s);op.result={kind:'stage',id};return s;};
 let background;
 for(const op of operations){
  const declaration=/^(?:final )?(?:StarSystemAPI|PlanetAPI|SectorEntityToken|JumpPointAPI|float) (\w+) = (.*)$/s.exec(op.statement);
  const handle=declaration?.[1]??`@operation:${op.sequence}`,expression=declaration?.[2]??op.statement;
  if(handle==='system'){need(expression==='sector.getStarSystem("Corvus")','unexpected system');op.result={kind:'system-reference'};continue;}
  if(handle==='baradAngle'){bindings[handle]=val(expression);constants[handle]={value:bindings[handle],source:op.source};op.result={kind:'constant',name:handle};continue;}
  const call=/^(.+)\((.*)\)$/s.exec(expression);need(call,`unsupported statement ${op.statement}`);
  const method=call[1];
  // Greedy call parsing would bind to an inner invocation; these outer methods have known prefixes.
  const outer=/^(system\.(?:initStar|addPlanet|addCustomEntity|addTerrain|addAsteroidBelt|addRingBand|setBackgroundTextureFilename|autogenerateHyperspaceJumpPoints|addEntity)|Global\.getFactory\(\)\.createJumpPoint|StarSystemGenerator\.(?:addOrbitingEntities|addSystemwideNebula)|Misc\.setAbandonedStationMarket|\w+\.(?:setCircularOrbitPointingDown|setCircularOrbit|setCustomDescriptionId|setInteractionImage|setRelatedPlanet|setStandardWormholeToHyperspaceVisual|applySpecChanges)|\w+\.getSpec\(\)\.(?:setGlowTexture|setGlowColor|setUseReverseLightForGlow)|nebula\.getLocation\(\)\.set)\((.*)\)$/s.exec(expression);
  if(!outer){
   need(/^neutralStation\.getMarket\(\)\.getSubmarket\(Submarkets.SUBMARKET_STORAGE\)\.getCargo\(\)\.addMothballedShip\(FleetMemberType.SHIP, "hermes_d_Hull", null\)$/.test(expression),`unsupported call ${method}`);
   stage('abandoned-cargo',op,{kind:'runtime-fleet-member',dependsOn:['abandoned-market'],entityHandle:'neutralStation',submarket:'storage',memberType:'SHIP',variantId:'hermes_d_Hull',shipName:null,requires:['fleet member factory','variant loading','engine-generated ship identity'],note:'Only the variant request is constant; no fully generated ship is claimed.'});continue;
  }
  const methodName=outer[1],a=splitJavaArguments(outer[2]);
  if(methodName==='system.setBackgroundTextureFilename'){background=val(a[0]);op.result={kind:'system-property',property:'background'};continue;}
  if(methodName==='system.initStar'||methodName==='system.addPlanet'){
   const star=methodName==='system.initStar';need(a.length===(star?7:8),'planet arity');
   const e=make(handle,star?'star':'planet',a,op);e.nativeId=val(a[0]);e.nativeIdStatus='explicit';e.name=star?'Corvus':val(a[2]);e.nameStatus=star?'system-name-derived':'declared';
   e.planetType=val(a[star?1:3]);need(plain(planets[e.planetType]),`missing planet type ${e.planetType}`);
   need(!own(planets[e.planetType],'baseId'),'unimplemented planet baseId');planetSpecs[e.planetType]={id:e.planetType,source:{id:'core:data/config/planets.json',key:e.planetType},declared:planets[e.planetType],interpretation:'raw declarations; renderer defaults not implemented'};
   e.radius=val(a[star?2:5]);e.radiusStatus='declared';bindings[handle+'.getRadius()']=e.radius;
   if(star){e.localPosition={x:0,y:0,status:'native-initStar-constructor'};e.properties.corona={extent:val(a[3]),windBurnLevel:val(a[4]),flareProbability:val(a[5]),crLossMultiplier:val(a[6]),implementationStatus:'required-helper-terrain'};}
   else {e.orbit=orbit('circular',[a[1],a[4],a[6],a[7]]);e.conditionMarket={id:'market_'+e.nativeId,size:1,faction:'neutral',planetConditionMarketOnly:true,status:'helper-template',requires:'Misc.initConditionMarket consumes StarSystemGenerator.random.nextLong() for salvage seed'};}
   continue;
  }
  if(methodName==='system.addCustomEntity'){
   need(a.length===4,'custom arity');const e=make(handle,'custom',a,op);e.nativeId=val(a[0]);e.nativeIdStatus=e.nativeId===null?'generated-by-engine':'explicit';e.customType=val(a[2]);
   customSpecs[e.customType]??=resolveCustomEntitySpec(e.customType,custom);const fields=customSpecs[e.customType].fields;
   e.nameArgument=val(a[1]);e.name=e.nameArgument??fields.defaultName.value;e.nameStatus=e.nameArgument===null?'custom-spec':'declared';
   e.radius=fields.defaultRadius.value;e.radiusStatus='custom-spec';e.factionArgument=val(a[3]);e.faction=e.factionArgument??'neutral';e.factionStatus=e.factionArgument===null?'native-null-default':'declared';
   for(const [key,field]of [['descriptionId','customDescriptionId'],['interactionImage','interactionImage']])if(own(fields[field],'value'))e.properties[key]=fields[field].value;
   continue;
  }
  if(methodName==='Global.getFactory().createJumpPoint'){
   need(a.length===2,'jump arity');const e=make(handle,'jump-point',a,op);e.nativeId=val(a[0]);e.nativeIdStatus='explicit';e.name=val(a[1]);e.nameStatus='declared';e.radius=50;e.radiusStatus='native-JumpPoint-default';e.destinationStatus='requires-autogeneration';continue;
  }
  if(methodName==='system.addTerrain'){
   need(a.length===2,'terrain arity');const e=make(handle,'terrain',a,op);e.terrainType=val(a[0]);
   const ctor=/^new ([\w.]+)\((.*)\)$/s.exec(a[1]);need(ctor,'unknown terrain constructor');const p=splitJavaArguments(ctor[2]);
   e.parameters={constructorName:ctor[1],sourceExpressions:p};
   if(ctor[1]==='MagneticFieldParams')Object.assign(e.parameters,{bandWidth:val(p[0]),middleRadius:val(p[1]),relatedHandle:ref(p[2]),visualStart:val(p[3]),visualEnd:val(p[4]),baseColor:val(p[5]),auroraProbability:val(p[6]),auroraColors:p.slice(7).map(val)});
   else if(ctor[1]==='AsteroidFieldParams'){need(p.length===7,'asteroid field arity');Object.assign(e.parameters,Object.fromEntries(['minRadius','maxRadius','minCount','maxCount','minAsteroidRadius','maxAsteroidRadius','name'].map((k,i)=>[k,val(p[i])])));e.name=val(p[6]);e.nameStatus='declared';}
   else if(ctor[1]==='BaseTiledTerrain.TileParams'){
    need(p.length===8,'tiled terrain arity');const tiles=p[0].split(/\s*\+\s*/).map(val).join('');
    Object.assign(e.parameters,{tiles,width:val(p[1]),height:val(p[2]),sprite:sprite(val(p[3]),val(p[4])),tilesWide:val(p[5]),tilesHigh:val(p[6]),name:val(p[7])});
    need(tiles.length===e.parameters.width*e.parameters.height,'invalid nebula grid');
   }else throw new Error('Corvus import: unsupported terrain '+ctor[1]);
   e.generationStatus='parameters-only; plugin geometry/visual randomness not executed';continue;
  }
  if(methodName==='system.addAsteroidBelt'||methodName==='system.addRingBand'){
   const belt=methodName==='system.addAsteroidBelt';need(a.length===(belt?8:11),'belt/ring arity');
   const e=make(handle,belt?'asteroid-belt':'ring-band',a,op);e.focusHandle=ref(a[0]);
   e.parameters=belt?{count:val(a[1]),orbitRadius:val(a[2]),width:val(a[3]),minOrbitDays:val(a[4]),maxOrbitDays:val(a[5]),terrainType:val(a[6]),name:val(a[7])}:{sprite:sprite(val(a[1]),val(a[2])),bandWidthInTexture:val(a[3]),bandIndex:val(a[4]),color:val(a[5]),bandWidth:val(a[6]),middleRadius:val(a[7]),orbitDays:val(a[8]),terrainType:val(a[9]),name:val(a[10])};
   if(belt){e.name=val(a[7]);e.nameStatus='declared';}
   e.generationStatus='parameters-only; no sampled asteroid positions or ring initial phase';continue;
  }
  if(methodName==='Misc.setAbandonedStationMarket'){
   stage('abandoned-market',op,{kind:'helper-market',dependsOn:[],marketId:val(a[0]),entityHandle:ref(a[1]),requires:['storage plugin','market factory']});continue;
  }
  if(methodName==='StarSystemGenerator.addOrbitingEntities'){
   need(a.length===9,'outer procgen arity');stage('outer-orbits',op,{kind:'procedural',dependsOn:[],arguments:{system:'Corvus',parentHandle:ref(a[1]),age:a[2].replace('StarAge.',''),min:val(a[3]),max:val(a[4]),startingRadius:val(a[5]),nameOffset:val(a[6]),withSpecialNames:val(a[7]),allowHabitable:val(a[8])},requires:['StarSystemGenerator.random state including earlier core-system generation','star/age/planet gen specs','orbit/moon/terrain generators','NameAssigner and used-name state'],note:'min/max bound the requested orbit count, NOT the final entity count. No generated ids, names, positions, or radiusAfter are sampled.'});continue;
  }
  if(methodName==='StarSystemGenerator.addSystemwideNebula'){
   stage('systemwide-nebula',op,{kind:'procedural',dependsOn:['outer-orbits'],arguments:{system:'Corvus',age:a[1].replace('StarAge.','')},requires:['StarSystemGenerator and nebula plugin random state'],knownEffects:{age:'OLD',hasSystemwideNebula:true,nebulaType:'nebula_amber'},note:'OLD selects amber, but nebula geometry/noise is not generated. pickNebulaAndBackground consumes RNG; this helper does not assign the system background.'});continue;
  }
  if(methodName==='system.autogenerateHyperspaceJumpPoints'){
   stage('hyperspace-jumps',op,{kind:'postprocess',dependsOn:['outer-orbits','systemwide-nebula'],arguments:{generateEntrancesAtGasGiants:val(a[0]),generateFringeJumpPoint:val(a[1]),generatePlanetConditions:true},requires:['all entity orbits updated','hyperspace anchor','all generated bodies and terrains','planet-condition generator RNG'],note:'Two-argument overload forwards third=true; adds destinations, star/gas-giant entrances, fringe jump point, planet wells, then generates eligible planet conditions with AVERAGE (even after system age OLD). No final endpoints fabricated.'});continue;
  }
  if(methodName==='system.addEntity'){op.result={kind:'attach-entity',handle:ref(a[0])};continue;}
  const target=byHandle.get(methodName.split('.')[0]);need(target,`unknown mutation target ${methodName}`);
  if(methodName.endsWith('.setCircularOrbit')||methodName.endsWith('.setCircularOrbitPointingDown'))target.orbit=orbit(methodName.endsWith('PointingDown')?'point-down':'circular',a);
  else if(methodName.endsWith('.setCustomDescriptionId'))target.properties.descriptionId=val(a[0]);
  else if(methodName.endsWith('.setInteractionImage'))target.properties.interactionImage=sprite(val(a[0]),val(a[1])).path;
  else if(methodName.endsWith('.setRelatedPlanet'))target.properties.relatedPlanetHandle=ref(a[0]);
  else if(methodName.endsWith('.setStandardWormholeToHyperspaceVisual'))target.properties.destinationVisual=sprite('misc','wormhole_hyper');
  else if(methodName.endsWith('.setGlowTexture')){const m=/^Global.getSettings\(\).getSpriteName\((.*)\)$/.exec(a[0]);need(m,'unsupported glow');const p=splitJavaArguments(m[1]);target.properties.glowTexture=sprite(val(p[0]),val(p[1]));}
  else if(methodName.endsWith('.setGlowColor'))target.properties.glowColor=val(a[0]);
  else if(methodName.endsWith('.setUseReverseLightForGlow'))target.properties.useReverseLightForGlow=val(a[0]);
  else if(methodName.endsWith('.applySpecChanges'))target.properties.applySpecChanges=true;
  else if(methodName==='nebula.getLocation().set')target.properties.initialLocation={status:'expression-not-evaluated',expressions:a,note:'Ordered setup before setCircularOrbit; not a final fixed location.'};
  else throw new Error('Corvus import: unsupported mutation '+methodName);
  op.result={kind:'entity-mutation',handle:target.handle,method:methodName};
 }
 const markets=[];
 for(const [i,m]of marketFile.markets.entries()){
  const supported=['entities','faction','size','startingConditions','industries','freePort','submarkets'];need(Object.keys(m).every(k=>supported.includes(k)),`unsupported market field at ${i}`);
  need(Array.isArray(m.entities)&&m.entities.length&&m.entities.every(id=>entities.some(e=>e.nativeId===id)),`missing market entity ${i}`);
  need(Object.entries(bindings).some(([k,v])=>k.startsWith('Factions.')&&v===m.faction)&&Number.isInteger(m.size)&&m.size>0&&Array.isArray(m.startingConditions)&&m.startingConditions.every(x=>typeof x==='string')&&Array.isArray(m.industries)&&m.industries.every(x=>typeof x==='string'),`unsupported market shape ${i}`);
  need(!own(m,'freePort')||typeof m.freePort==='boolean','invalid freePort');need(!own(m,'submarkets')||Array.isArray(m.submarkets)&&m.submarkets.every(x=>typeof x==='string'),'invalid submarkets');
  const primary=entities.find(e=>e.nativeId===m.entities[0]);
  const market={id:m.entities[0],kind:'economy',name:primary.name,source:{id:'core:data/campaign/econ/corvus.json',key:`markets[${i}]`},declared:m,primaryEntityId:m.entities[0],connectedEntityIds:m.entities,faction:m.faction,size:m.size,conditions:m.startingConditions,industries:m.industries,freePort:m.freePort??false,freePortStatus:own(m,'freePort')?'declared':'loader-default',submarkets:m.submarkets??['open_market','black_market','storage',...((m.industries.includes('militarybase')||m.industries.includes('highcommand'))?['generic_military']:[])],submarketsStatus:own(m,'submarkets')?'declared':'loader-default',tariff:{status:'runtime-unimplemented',from:'owning faction getTariffFraction(), NOT economy.defaultTariff in linked campaign mode'},conditionsStatus:'authored starting list; not post-simulation final state'};
  markets.push(market);for(const id of m.entities){const e=entities.find(e=>e.nativeId===id);e.marketId=market.id;e.marketFaction=m.faction;if(e.conditionMarket)e.conditionMarket.replacedByEconomyMarket=market.id;}
 }
 const abandoned=stages.find(s=>s.id==='abandoned-market'),station=byHandle.get(abandoned.entityHandle);
 markets.push({id:abandoned.marketId,kind:'abandoned-helper',name:station.name,source:{id:'decompiled:'+java+'util/Misc.java',line:3491},primaryEntityId:station.nativeId,connectedEntityIds:[station.nativeId],faction:station.faction,size:0,conditions:['abandoned_station'],industries:[],industriesStatus:'none-added-by-helper',submarkets:['storage'],submarketsStatus:'helper-explicit',surveyLevel:'FULL',planetConditionMarketOnly:false,storagePlayerPaidToUnlock:true,economyRegistration:'helper-does-not-add-to-economy',memoryOperations:[{key:'$abandonedStation',operation:'set',value:true},{key:'$tradeMode',operation:'unset'}]});station.marketId=abandoned.marketId;
 // Hash every directly referenced sprite; missing local assets fail rather than silently downgrade.
 const paths=new Set([background]);
 for(const spec of Object.values(planetSpecs))for(const [key,value]of Object.entries(spec.declared))if(/texture|icon|sprite/i.test(key)&&typeof value==='string'&&value.startsWith('graphics/'))paths.add(value);
 for(const spec of Object.values(customSpecs))for(const field of Object.values(spec.fields))if(typeof field.value==='string'&&field.value.startsWith('graphics/'))paths.add(field.value);
 const findPaths=x=>{if(typeof x==='string'&&x.startsWith('graphics/'))paths.add(x);else if(Array.isArray(x))x.forEach(findPaths);else if(plain(x))Object.values(x).forEach(findPaths);};entities.forEach(findPaths);
 for(const path of [...paths].sort())await load('core',path);
 stages.find(s=>s.id==='outer-orbits').requiredSources=dependencyTables.slice(0,4).map(x=>'core:data/campaign/procgen/'+x);
 stages.find(s=>s.id==='hyperspace-jumps').requiredSources=['core:data/campaign/procgen/condition_gen_data.csv'];
 const location=starmap.starSystemLocations?.corvus;need(Array.isArray(location)&&location.length===2&&location.every(Number.isFinite),'missing/invalid starmap Corvus location');
 const data={schemaVersion:1,id:'original-corvus',scope:'authored-blueprint-not-complete-generated-system',sources:sources.sort((a,b)=>a.id<b.id?-1:1),system:{id:'corvus',name:'Corvus',entryPoint:settings.plugins?.newGameCreationEntryPoint,background:{path:background,status:'Corvus-script-overrides-SectorGen-background4'},hyperspaceLocation:{x:location[0],y:location[1],source:{id:'core:data/campaign/starmap.json',key:'starSystemLocations.corvus'},application:'StarSystem.initStar -> starmap lookup by star id'},respawn:{x:-2500,y:-3500,coordinateSpace:'system',source:{id:'core:data/scripts/world/SectorGen.java',line:61},note:'SectorGen respawn defaults, NOT player new-game spawn or hyperspace position.'}},constants,operations,entities,markets,specs:{planets:planetSpecs,customEntities:customSpecs},stages,
  postprocessing:[
   {id:'star-corona',status:'required-not-executed',source:{id:'decompiled:'+obf+'campaign/BaseLocation.java',line:1105},requires:['StarSystem.initStar/addCorona terrain helper','corona plugin'],note:'Star properties carry corona args; helper creates additional terrain, not an imported final entity.'},
   {id:'condition-markets',status:'required-not-executed',source:{id:'decompiled:'+java+'util/Misc.java',line:2941},requires:['native RNG stream for per-planet salvage seed'],note:'addPlanet creates neutral size-1 condition markets; later economy linking replaces populated ones.'},
   {id:'terrain-plugins',status:'required-not-executed',source:{id:'decompiled:'+obf+'campaign/BaseLocation.java',line:1031},requires:['asteroid-belt/field samplers','ring visual phase','magnetic-field aurora','tiled nebula plugin'],note:'Parameters preserved; initial random geometry and visual state absent. RingBand.angle uses Math.random(), separate from StarSystemGenerator.random. addRingBand with terrainType=ring creates additional terrain; addAsteroidBelt creates a terrain with a zero-radius focus orbit.'},
   {id:'economy-link-and-warmup',status:'required-not-executed',source:{id:'decompiled:'+obf+'campaign/econ/super.java',line:112},requires:['market/industry/submarket factories','faction tariff','economy simulation'],configuredInitialSteps:economy.initialStepsToRun,note:'Link connected entity ownership, survey authored conditions, apply industries/free-port effects and warmup. Output is input configuration, not final economic state.'},
   {id:'campaign-lifecycle',status:'required-not-executed',source:{id:'decompiled:'+java+'impl/campaign/CoreLifecyclePluginImpl.java',line:737},requires:['CoreLifecyclePluginImpl','story/campaign setup'],note:'Includes Jangala bounty/story-critical/luddic_shrine tags and survey/core-system tagging. Not exhaustively emulated or claimed complete.'},
   {id:'sector-hyperspace-cleanup',status:'required-not-executed',source:{id:'core:data/scripts/world/SectorGen.java',line:135},requires:['sector-wide hyperspace terrain','NebulaEditor','all system anchors'],note:'Clear hyperspace around systems after generation. Separate from Corvus in-system tiled nebula.'}
  ],limitations:['Native Java hash drift is a hard error requiring review. This is a local installed-content snapshot, not an English vanilla asset replacement.','Source handles (including @operation) are blueprint-local, never replacement native ids. Null ids need an explicit engine/provider identity policy.','No RNG is executed and no orbit position/facing is evaluated. Consumer owns deterministic RNG, float arithmetic, clock and topology policies.','Unsupported renderer/plugin fields are retained as raw source, not interpreted defaults. Missing required source/spec/asset or ambiguous syntax aborts import.','Blueprint not suitable as a claim of a fully generated playable system; all required stages must be considered.']};
 const validation=validateOriginalCorvusData(data);need(validation.valid,validation.errors.join('; '));return data;
}
export const serializeOriginalCorvus = data => JSON.stringify(data,null,2)+'\n';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);need(args.every(a=>a==='--check'),'only --check is supported');
 const data=await importOriginalCorvus(),text=serializeOriginalCorvus(data);
 if(args.includes('--check'))need((await readFile(destination,'utf8'))===text,'reference-corvus.json is stale');
 else {const temp=destination+'.tmp';await writeFile(temp,text);await rename(temp,destination);}
 console.log(`Corvus: ${data.entities.length} authored entity/helper records, ${data.markets.length} markets, ${data.sources.length} sources; sha256 ${sha256(text)}${args.includes('--check')?' (verified)':''}`);
}
