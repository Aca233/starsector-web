import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_MARKET_PLANETS as R, readOriginalMarketPlanet as readback, projectOriginalPlanetGasDiff as projectDiff } from '../src/campaign/rules/OriginalMarketPlanet.mjs';
import { reapplyOriginalIndustryAccessibility as access } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
import { extractNativeSaveEconomy as extract } from './lib/campaign-native-save.mjs';
import { prepareNativeIndustryStorage as prepare } from './lib/campaign-native-industry-storage.mjs';
import { nativeSaveFixture } from './campaign-native-save-fixtures.mjs';
import { nativeMarketPlanetSnapshots } from './campaign-market-planet-native-oracle.mjs';
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
const planet=(objectRef='90001',type='terran',diff=null)=>({objectRef,classAlias:'Plnt',type,diff});
const station=(objectRef='90000')=>({objectRef,classAlias:'CCEnt'});
const scenario=(extra={})=>({primaryEntityRef:'90000',entities:[station(),planet(),planet('90002','gas_giant')],connectedRefs:['90000','90001','90002'],...extra});
const project=c=>({primaryEntityRef:c.primaryEntityRef,connectedEntities:[...new Set(c.connectedRefs.filter(x=>x!==null))].map(ref=>{const e=c.entities.find(n=>n.objectRef===ref);return {objectRef:ref,classAlias:e.classAlias,planet:e.classAlias==='Plnt'?{type:e.type,...projectDiff(e.diff??{})}:null};})});
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function fixture(c=scenario()) {
 const f=nativeSaveFixture();
 const entities=c.entities.map(e=>'<'+e.classAlias+' z="'+e.objectRef+'">'+(e.classAlias==='Plnt'?'<type>'+esc(e.type)+'</type><tags><st>gas_giant</st></tags>'+(e.diff===null?'':'<diff><j>'+esc(JSON.stringify(e.diff))+'</j></diff>'):'')+'</'+e.classAlias+'>').join('');
 const fields=(c.primaryEntityRef===null?'':'<primaryEntity ref="'+c.primaryEntityRef+'"/>')+'<connectedEntities>'+c.connectedRefs.map(ref=>ref===null?'<null/>':'<entity ref="'+ref+'"/>').join('')+'</connectedEntities>';
 f.campaign=f.campaign.replace('<Market z="10">','<Market z="10">'+fields).replace('<pool>','<pool>'+entities);
 return f;
}
const capture=f=>extract(f.campaign,f.descriptor);
const target=c=>c.markets.find(m=>m.marketId==='a');

test('source importer captures all 45 native types and exact default/getter/class evidence',()=>{
 const r=spawnSync(process.execPath,['scripts/import-campaign-market-planets.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(Object.keys(R.types).length,45);assert.equal(Object.keys(R.sources).length,8);
 assert.equal(R.types.terran.isGasGiant,false);assert.equal(R.types.gas_giant.isGasGiant,true);assert.equal(Object.values(R.types).filter(p=>p.isGasGiant).length,2);
 assert.equal(R.entityClasses.Plnt.planet,true);assert.equal(R.entityClasses.CCEnt.planet,false);assert.ok(R.specFields.includes('isGasGiant'));
});
test('first PlanetAPI in connected set wins, not primary entity, tags, conditions or last planet',()=>{
 for(const [order,ref,gas]of [[['90000','90001','90002'],'90001',false],[['90000','90002','90001'],'90002',true],[['90000'],null,null],[[],null,null]]) {
  const p=project(scenario({connectedRefs:order,primaryEntityRef:'90002'})),before=structuredClone(p),r=readback(p);
  assert.equal(r.planetEntityRef,ref);assert.equal(r.planetIsGasGiant,gas);assert.deepEqual(p,before);assert.ok(Object.isFrozen(r));
 }
});
test('diff boolean overrides both ways; unknown type/field and non-boolean override never coerce',()=>{
 for(const [type,gas]of [['terran',true],['gas_giant',false]]) {
  const p=project(scenario({entities:[planet('90001',type,{isGasGiant:gas,tilt:1,planetColor:[2,3,4,255]})],primaryEntityRef:null,connectedRefs:['90001']}));
  const r=readback(p);assert.equal(r.planetIsGasGiant,gas);assert.equal(r.gasSource,'saved-diff');assert.deepEqual(r.unrestoredPlanetDiffs,[{entityRef:'90001',fields:['tilt','planetColor']}]);
 }
 for(const v of [null,'true','false','null',0,1,[],{}])rejects(()=>projectDiff({isGasGiant:v}));
 for(const v of [null,[],1,{unknownField:true},{constructor:true}])rejects(()=>projectDiff(v));
 rejects(()=>readback(project(scenario({entities:[planet('90001','not_a_native_type')],primaryEntityRef:null,connectedRefs:['90001']}))));
 const p=project(scenario());p.connectedEntities[1].planet.gasGiantOverride='true';rejects(()=>readback(p));
 p.connectedEntities[1].planet.gasGiantOverride=null;p.connectedEntities[1].planet.otherDiffKeys=['isGasGiant'];rejects(()=>readback(p));
});
test('XML follows actual forward references/identity order, deduplicates LinkedHashSet and ignores null',()=>{
 const c=scenario({connectedRefs:[null,'90000','90002','90002','90001']});const r=target(capture(fixture(c)));
 assert.deepEqual(r.planetInput,project(c));assert.equal(readback(r.planetInput).planetIsGasGiant,true);
 const missing=nativeSaveFixture();missing.campaign=missing.campaign.replace('<Market z="10">','<Market z="10"><primaryEntity z="90001" cl="Plnt"><type>gas_giant</type></primaryEntity>');
 assert.deepEqual(target(capture(missing)).planetInput,{primaryEntityRef:'90001',connectedEntities:[]});
 assert.equal(readback(target(capture(missing)).planetInput).planetIsGasGiant,null);
});
test('XML diff.j is parsed as saved JSON, while stale spec/graphics/data and unknown class/type reject',()=>{
 const c=scenario({entities:[station(),planet('90001','gas_giant',{isGasGiant:false,glowTexture:'PRIVATE_VISUAL_VALUE'})],connectedRefs:['90000','90001']});
 const f=fixture(c),r=target(capture(f));assert.deepEqual(r.planetInput,project(c));assert.ok(!JSON.stringify(r.planetInput).includes('PRIVATE_VISUAL_VALUE'));
 assert.equal(readback(r.planetInput).planetIsGasGiant,false);
 for(const [from,to]of [['<type>gas_giant</type>','<type>unknown</type>'],['<Plnt z="90001">','<Plnt z="90001"><spec/>'],['<Plnt z="90001">','<Plnt z="90001"><graphics/>'],['<diff>','<diff><data/>'],['<diff>','<diff cl="Unreviewed">'],['<CCEnt z="90000">','<CCEnt z="90000" cl="ModdedPlanet">']])assert.throws(()=>capture({...f,campaign:f.campaign.replace(from,to)}));
 for(const raw of ['{"isGasGiant":"true"}','{"isGasGiant":null}','{"isGasGiant":1}','{"isGasGiant":true,"isGasGiant":false}','{"notAField":true}'])assert.throws(()=>capture({...f,campaign:f.campaign.replace(/<j>.*?<\/j>/,'<j>'+esc(raw)+'</j>')}));
});
test('storage draft carries real planet/condition context into installed spool without claiming industry reapplication',()=>{
 for(const diff of [null,{isGasGiant:false}]) {
  const f=fixture(scenario({entities:[station(),planet('90001','gas_giant',diff)],connectedRefs:['90000','90001']}));
  f.campaign=f.campaign.replace(/(<PopulationAndInfrastructure[^>]+>)/,'$1<special z="90009" i="fullerene_spool"/>').replaceAll('PopulationAndInfrastructure','Spaceport').replaceAll('id="population"','id="spaceport"');
  const c=capture(f),draft=prepare(c),m=target(draft),i=m.industries[0];
  assert.deepEqual(m.portItemContext,{planetIsGasGiant:diff===null,conditionIds:['habitable']});
  const r=access({accessibility:c.markets[1].accessibility,hasSpaceport:false,marketSize:4,firstQueuedIndustryHasSpaceportTag:false,portItemContext:m.portItemContext,industries:[{industryId:i.industryId,operating:i.runtimeReadback.operating,aiCoreId:null,improved:i.improvedGetter,specialItemId:i.specialItem.id}]});
  assert.equal(r.accessibility.flat.find(v=>v.id==='fullerene_spool')?.value,diff===null?undefined:Math.fround(0.3));
  assert.ok(i.unresolved.includes('condition-and-industry-live-reapply'));assert.ok(i.unresolved.includes('installed-item-runtime'));assert.equal(draft.readyForAuthority,false);
  const old=structuredClone(c);delete target(old).planetInput;const legacy=target(prepare(old));assert.equal(legacy.planetReadback,null);assert.equal(legacy.portItemContext,null);assert.ok(legacy.unresolved.includes('market-planet-getter'));
 }
});
test('getter dependency boundary rejects duplicate IDs, contradictory classes and missing explicit fields',()=>{
 for(const mutate of [p=>delete p.primaryEntityRef,p=>p.primaryEntityRef=false,p=>p.connectedEntities.push(p.connectedEntities[0]),p=>p.connectedEntities[0].classAlias='UnknownEntity',p=>p.connectedEntities[0].planet=p.connectedEntities[1].planet,p=>p.connectedEntities[1].planet=null,p=>delete p.connectedEntities[1].planet.gasGiantOverride]){const p=project(scenario());mutate(p);rejects(()=>readback(p));}
 rejects(()=>readback(null));
});
test('native differential: 540 restored getter/ordered entity cases plus six invalid reflection values',()=>{
 const cases=[];
 for(const type of Object.keys(R.types))for(const override of [null,false,true])for(const order of [[],['90000'],['90000','90001','90002'],[null,'90002','90002','90000','90001']])cases.push(scenario({entities:[station(),planet('90001',type,override===null?null:{isGasGiant:override,tilt:20,planetColor:[3,4,5,255]}),planet('90002','gas_giant',{isGasGiant:false})],connectedRefs:order,primaryEntityRef:'90002'}));
 assert.equal(cases.length,540);
 const invalid=['null','true','false',1,[],2.5].map(value=>scenario({entities:[planet('90001','terran',{isGasGiant:value})],primaryEntityRef:null,connectedRefs:['90001']}));
 const native=nativeMarketPlanetSnapshots([...cases,...invalid]);assert.equal(native.length,546);
 cases.forEach((c,i)=>{const r=readback(project(c));assert.deepEqual({planetEntityRef:r.planetEntityRef,planetType:r.planetType,planetIsGasGiant:r.planetIsGasGiant},native[i],'native planet '+i);});
 for(let i=0;i<invalid.length;i++){assert.ok(native[cases.length+i].error,'invalid reflected boolean '+i);rejects(()=>project(invalid[i]));}
});