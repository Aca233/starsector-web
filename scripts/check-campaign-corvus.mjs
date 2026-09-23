#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import data from '../src/campaign/data/reference-corvus.json' with { type: 'json' };
import { importOriginalCorvus, serializeOriginalCorvus, stripJavaComments, splitJavaArguments, readConstant, resolveCustomEntitySpec } from './import-campaign-corvus.mjs';
import { buildOriginalCorvusBlueprint, createOriginalCorvusProvider, validateOriginalCorvusData } from '../src/campaign/content/OriginalCorvus.mjs';
import { originalOrbitOrder, advanceOriginalOrbit } from '../src/campaign/rules/OriginalOrbits.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const provider=createOriginalCorvusProvider(data),entity=id=>provider.getEntityByNativeId(id);
const corrupt=change=>{const d=structuredClone(data);change(d);return d;};

test('reviewed snapshot retains all 65 active operations, 23 authored entity/helper records and 4 markets',()=>{
 assert.deepEqual(validateOriginalCorvusData(data),{valid:true,errors:[]});
 assert.equal(data.operations.length,65);assert.equal(data.entities.length,23);assert.equal(data.markets.length,4);
 assert.deepEqual(data.entities.reduce((m,e)=>(m[e.kind]=(m[e.kind]??0)+1,m),{}),{'star':1,'planet':5,'custom':8,'jump-point':1,'asteroid-belt':1,'ring-band':3,'terrain':4});
 assert.equal(entity('corvus_IV'),null);assert.equal(entity('corvus_V'),null);assert.equal(entity('test1'),null);
 assert.equal(data.operations.some(x=>x.statement.includes('Somnus')),false);
});
test('real starmap coordinate, respawn and background are separate sourced facts',()=>{
 assert.equal(data.system.hyperspaceLocation.x,400);assert.equal(data.system.hyperspaceLocation.y,-9400);
 assert.equal(data.system.respawn.x,-2500);assert.equal(data.system.respawn.y,-3500);
 assert.equal(data.system.background.path,'graphics/backgrounds/background2.jpg');
 assert.deepEqual(entity('corvus').localPosition,{x:0,y:0,status:'native-initStar-constructor'});
 assert.deepEqual(entity('corvus').properties.corona,{extent:500,windBurnLevel:10,flareProbability:1,crLossMultiplier:3,implementationStatus:'required-helper-terrain'});
});
test('authored planet names, radii and focus chains match the actual Corvus script',()=>{
 assert.deepEqual(['asharu','jangala','barad','corvus_IIIa','corvus_IIIb'].map(id=>[entity(id).name,entity(id).radius,entity(id).orbit.focusHandle,entity(id).orbit.angleDegrees,entity(id).orbit.radius,entity(id).orbit.periodDays]),[
 ['Asharu',150,'star',55,2800,100],['Jangala',200,'star',245,4500,200],['Barad',300,'star',100,7800,400],['Garnir',100,'corvusIII',135,790,20],['Warion',70,'corvusIII',235,1300,60]]);
 assert.equal(data.constants.baradAngle.value,100);assert.equal(provider.getEntity('corvus_loc3').orbit.angleDegrees,-80);
 assert.deepEqual([provider.getEntity('baradL4').orbit.angleDegrees,provider.getEntity('baradL5').orbit.angleDegrees],[40,160]);
});
test('native null IDs, Chinese installation names and gate neutral default are not invented',()=>{
 assert.equal(provider.getEntity('corvus_loc1').nativeId,null);assert.equal(provider.getEntityByNativeId('corvus_loc1'),null);
 assert.equal(provider.getEntity('corvus_loc1').name,'临时传感器阵列');assert.equal(provider.getEntity('corvus_loc3').name,'稳定点');
 assert.equal(entity('corvus_abandoned_station').name,'废弃的地貌改造平台');assert.equal(entity('corvus_relay').name,'Jangala 通讯中继站');
 assert.equal(entity('jangala_gate').factionArgument,null);assert.equal(entity('jangala_gate').faction,'neutral');
 assert.equal(provider.getEntityByNativeId(null),null);
});
test('point-down differs from circular; jump destination is deliberately ungenerated',()=>{
 assert.equal(entity('corvus_hegemony_station').orbit.mode,'point-down');assert.equal(entity('corvus_hegemony_station').orbit.angleDegrees,225);
 assert.equal(entity('corvus_relay').orbit.angleDegrees,185);assert.equal(entity('jangala_jump').orbit.angleDegrees,305);
 assert.equal(entity('jangala_jump').properties.relatedPlanetHandle,'corvusII');assert.equal(entity('jangala_jump').radius,50);
 assert.equal(entity('jangala_jump').destinationStatus,'requires-autogeneration');assert.equal(entity('jangala_jump').destinations,undefined);
 assert.equal(entity('jangala_gate').orbit.mode,'circular');
});
test('planet and custom textures/radii are real declarations with audited inheritance',()=>{
 assert.equal(data.specs.planets.star_yellow.declared.texture,'graphics/planets/star_texture_yellow.jpg');
 assert.equal(data.specs.planets.jungle.declared.texture,'graphics/planets/jungle.jpg');
 assert.equal(entity('asharu').properties.glowTexture.path,'graphics/planets/asharu_sparse_glow.png');
 assert.deepEqual(entity('jangala').properties.glowColor,[255,255,255,255]);
 const sensor=data.specs.customEntities.sensor_array_makeshift;
 assert.deepEqual(sensor.chain.map(x=>x.id),['base_campaign_objective','sensor_array','sensor_array_makeshift']);
 assert.deepEqual(sensor.fields.defaultRadius,{status:'inherited',from:'base_campaign_objective',value:75});
 assert.equal(data.specs.customEntities.stable_location.fields.sprite.status,'absent-in-chain');
 assert.ok(sensor.unimplementedDeclaredFields.includes('nameFontScale'));
});
test('terrain and ring parameters preserved without pretending radius/phase/positions are final',()=>{
 const field=provider.getEntity('barad_field');assert.equal(field.parameters.bandWidth,500);assert.equal(field.parameters.middleRadius,250);
 assert.equal(field.parameters.visualStart,350);assert.equal(field.parameters.visualEnd,600);assert.equal(field.parameters.auroraColors.length,7);
 assert.deepEqual(field.parameters.baseColor,[50,20,100,40]);assert.equal(field.orbit.radius,0);assert.equal(field.radius,null);
 const belt=data.entities.find(e=>e.kind==='asteroid-belt');assert.deepEqual(belt.parameters,{count:90,orbitRadius:5650,width:500,minOrbitDays:150,maxOrbitDays:300,terrainType:'asteroid_belt',name:'Nemo 小行星带'});
 assert.deepEqual(data.entities.filter(e=>e.kind==='ring-band').map(e=>[e.parameters.middleRadius,e.parameters.orbitDays,e.parameters.terrainType]),[[5600,305,null],[5720,295,null],[1050,45,'ring']]);
 const nebula=provider.getEntity('nebula');assert.equal(nebula.parameters.tiles.length,36);assert.equal(nebula.parameters.width,6);
 assert.equal(nebula.properties.initialLocation.status,'expression-not-evaluated');assert.equal(nebula.orbit.radius,10000);
 assert.ok(data.entities.filter(e=>e.kind!=='star').every(e=>e.position===undefined));
});
test('three economy markets have actual owners, sizes, conditions, industries and native default submarkets',()=>{
 assert.deepEqual(data.markets.filter(m=>m.kind==='economy').map(m=>[m.id,m.faction,m.size]),[['asharu','independent',4],['jangala','hegemony',6],['corvus_IIIa','pirates',3]]);
 const jangala=provider.getMarket('jangala');assert.deepEqual(jangala.connectedEntityIds,['jangala','corvus_hegemony_station']);
 assert.deepEqual(jangala.submarkets,['open_market','black_market','storage','generic_military']);assert.equal(jangala.submarketsStatus,'loader-default');
 assert.equal(jangala.declared.submarkets,undefined);assert.equal(jangala.declared.tariff,undefined);
 assert.deepEqual(jangala.industries,['population','farming','spaceport','mining','heavybatteries','militarybase','starfortress_mid']);
 assert.deepEqual(provider.getMarket('asharu').conditions,['population_4','hot','ore_moderate','farmland_poor','ruins_scattered','habitable']);
 assert.equal(provider.getMarket('corvus_IIIa').freePort,true);assert.equal(provider.getMarket('corvus_IIIa').industries.includes('orbitalstation'),false);
 assert.equal(jangala.tariff.status,'runtime-unimplemented');assert.equal(jangala.tariff.value,undefined);
 assert.equal(entity('asharu').marketFaction,'independent');assert.equal(entity('asharu').conditionMarket.replacedByEconomyMarket,'asharu');
 assert.equal(entity('barad').conditionMarket.replacedByEconomyMarket,undefined);
});
test('abandoned station storage helper is not a fourth economy colony and cargo is a pending request',()=>{
 const m=provider.getMarket('corvus_abandoned_station_market');assert.equal(m.kind,'abandoned-helper');assert.equal(m.size,0);assert.equal(m.faction,'neutral');
 assert.deepEqual(m.conditions,['abandoned_station']);assert.deepEqual(m.submarkets,['storage']);assert.equal(m.storagePlayerPaidToUnlock,true);
 assert.equal(m.economyRegistration,'helper-does-not-add-to-economy');assert.equal(m.planetConditionMarketOnly,false);
 const cargo=data.stages.find(s=>s.id==='abandoned-cargo');assert.equal(cargo.variantId,'hermes_d_Hull');assert.equal(cargo.status,'required-not-executed');assert.equal(cargo.shipName,null);
});
test('procedural entity count, random state, system age and implicit planet-condition age remain distinct',()=>{
 const outer=data.stages.find(s=>s.id==='outer-orbits');assert.deepEqual(outer.arguments,{system:'Corvus',parentHandle:'star',age:'AVERAGE',min:2,max:4,startingRadius:12500,nameOffset:3,withSpecialNames:true,allowHabitable:false});
 const nebula=data.stages.find(s=>s.id==='systemwide-nebula');assert.equal(nebula.arguments.age,'OLD');assert.equal(nebula.knownEffects.nebulaType,'nebula_amber');
 const jumps=data.stages.find(s=>s.id==='hyperspace-jumps');assert.deepEqual(jumps.arguments,{generateEntrancesAtGasGiants:true,generateFringeJumpPoint:true,generatePlanetConditions:true});assert.match(jumps.note,/AVERAGE/);
 assert.ok(provider.listRequiredStages().every(s=>s.status==='required-not-executed'));assert.equal(provider.listRequiredStages().length,11);
 assert.equal(data.postprocessing.find(s=>s.id==='economy-link-and-warmup').configuredInitialSteps,20);
 assert.ok(data.sources.some(s=>s.path.endsWith('name_gen_data.csv')));
});
test('read-only blueprint, arrays, nested specs and provider are isolated and deeply immutable',()=>{
 const mutable=structuredClone(data);const p=createOriginalCorvusProvider(mutable);mutable.entities[0].name='corrupted';
 assert.equal(p.getEntity('star').name,'Corvus');assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.getBlueprint().specs.planets.star_yellow.declared));
 assert.throws(()=>{p.getEntity('corvusI').orbit.angleDegrees=0;},TypeError);assert.throws(()=>p.listEntities().pop(),TypeError);
 assert.throws(()=>p.listRequiredStages().push({}),TypeError);assert.equal(p.getMarket('unknown'),null);assert.equal(p.getEntity('unknown'),null);
 assert.notEqual(buildOriginalCorvusBlueprint(data),data);
});
test('safe Java scanner preserves comment-like strings and rejects executable/unknown expressions',()=>{
 assert.equal(stripJavaComments('"//x /* y */" // deleted\n/*xx*/ok'), '"//x /* y */"           \n      ok');
 assert.deepEqual(splitJavaArguments('"x,y", new Color(1, 2, 3), null'),['"x,y"','new Color(1, 2, 3)','null']);
 assert.deepEqual(readConstant('new Color(1,2,3)'),[1,2,3,255]);assert.equal(readConstant('(corvusIII.getRadius() + 200f) / 2f',{'corvusIII.getRadius()':300}),250);
 assert.equal(readConstant('baradAngle - 180',{baradAngle:100}),-80);
 for(const x of ['Math.random()','process.exit()','Infinity','1/0','new Color(999,0,0)','unknown + 1'])assert.throws(()=>readConstant(x));
 assert.throws(()=>stripJavaComments('/* unterminated'));assert.throws(()=>splitJavaArguments('(1,2'));
});
test('custom spec missing bases, inheritance cycles and unimplemented fields are explicit',()=>{
 assert.throws(()=>resolveCustomEntitySpec('missing',{}),/missing custom/);
 assert.throws(()=>resolveCustomEntitySpec('a',{a:{baseId:'b'},b:{baseId:'a'}}),/cycle/);
 const s=resolveCustomEntitySpec('b',{a:{defaultRadius:4,tags:['a'],sprite:'x',other:9},b:{baseId:'a',tags:['b']}});
 assert.deepEqual(s.fields.tags.value,['b']);assert.equal(s.fields.defaultRadius.value,4);assert.deepEqual(s.unimplementedDeclaredFields,['other']);
});
test('validation rejects malformed schemas, lost generators, cycles, bad links and fabricated defaults',()=>{
 const cases=[d=>d.schemaVersion=2,d=>d.scope='complete',d=>d.sources[0].sha256='123',d=>d.sources[0].path='../escape',d=>d.entities[1].orbit.focusHandle='missing',d=>d.entities[1].orbit.focusHandle='corvusI',d=>d.entities[1].orbit.periodDays=0,d=>d.entities[1].radius=-1,d=>d.entities[2].radius=100,d=>d.markets[1].submarkets=['open_market'],d=>d.markets[1].tariff.value=0.3,d=>d.entities[5].marketId='missing',d=>d.stages.pop(),d=>d.entities[0].nativeId=d.entities[1].nativeId,d=>d.operations[0].result=null];
 for(const mutate of cases){const d=corrupt(mutate);assert.equal(validateOriginalCorvusData(d).valid,false,String(mutate));assert.throws(()=>buildOriginalCorvusBlueprint(d));}
 const cycle={};cycle.self=cycle;assert.equal(validateOriginalCorvusData(cycle).valid,false);
 const getter={get schemaVersion(){throw new Error('must not evaluate getter');}};assert.match(validateOriginalCorvusData(getter).errors[0],/accessors/);
 assert.equal(validateOriginalCorvusData(undefined).valid,false);
});
test('authored focus graph maps to the main orbit provider without changing source or assigning engine IDs',()=>{
 // Test-only ids/zero placeholders, never stored as generated system content.
 const selected=data.entities.filter(e=>e.kind==='star'||e.orbit!==null);
 const spaceEntities=Object.fromEntries(selected.map(e=>[e.handle,{id:e.handle,locationId:'test-corvus',position:[0,0],...(e.orbit?{orbit:{schemaVersion:1,kind:e.orbit.mode,focusId:e.orbit.focusHandle,radius:e.orbit.radius,periodDays:e.orbit.periodDays,angleDegrees:e.orbit.angleDegrees}}:{})}]));
 const order=originalOrbitOrder({spaceEntities});assert.ok(order.indexOf('corvusIII')<order.indexOf('corvusIIIA'));assert.ok(order.indexOf('corvusIIIA')<order.indexOf('pirateStation'));
 for(const id of order)spaceEntities[id]=advanceOriginalOrbit(spaceEntities[id],spaceEntities[spaceEntities[id].orbit.focusId],0);
 for(const e of selected.filter(e=>e.orbit)){const actual=spaceEntities[e.handle],focus=spaceEntities[e.orbit.focusHandle];assert.ok(Math.abs(Math.hypot(actual.position[0]-focus.position[0],actual.position[1]-focus.position[1])-e.orbit.radius)<0.01);}
 assert.equal(spaceEntities.hegemonyStation.facingDegrees,225);assert.deepEqual(spaceEntities.barad_field.position,spaceEntities.corvusIII.position);
 const before=spaceEntities.corvusI;const after=advanceOriginalOrbit(before,spaceEntities.star,10);assert.ok(after.orbit.angleDegrees<before.orbit.angleDegrees);
 assert.equal(provider.getEntity('corvus_loc3').orbit.angleDegrees,-80,'provider does not normalize original source');
});
test('real import is byte reproducible and every referenced input hash matches installed bytes',async()=>{
 const first=serializeOriginalCorvus(await importOriginalCorvus()),second=serializeOriginalCorvus(await importOriginalCorvus());
 assert.equal(first,second);assert.equal(first,await readFile(resolve(project,'src/campaign/data/reference-corvus.json'),'utf8'));
 assert.ok(data.sources.every(s=>!s.path.includes('C:')));assert.equal(new Set(data.sources.map(s=>s.id)).size,data.sources.length);
});
test('missing source, missing sprite, unknown field and reviewed Java drift fail rather than partially importing',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'starsector-corvus-'));
 t.after(async()=>{const target=await realpath(dir),base=await realpath(tmpdir()),rel=relative(base,target);assert.ok(rel.startsWith('starsector-corvus-')&&!rel.includes('/')&&!rel.includes('\\')&&!isAbsolute(rel));await rm(target,{recursive:true,force:true});});
 const coreRoot=join(dir,'core'),decompiledRoot=join(dir,'decompiled');
 for(const s of data.sources){const dest=join(s.root==='core'?coreRoot:decompiledRoot,s.path);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(project,s.root==='core'?'../starsector-core':'../decompiled',s.path),dest);}
 const options={coreRoot,decompiledRoot};assert.equal(serializeOriginalCorvus(await importOriginalCorvus(options)),serializeOriginalCorvus(data));
 const script=join(coreRoot,'data/scripts/world/corvus/Corvus.java'),original=await readFile(script);await writeFile(script,Buffer.concat([original,Buffer.from('\n// drift')]));await assert.rejects(importOriginalCorvus(options),/unreviewed source/);await writeFile(script,original);
 const markets=join(coreRoot,'data/campaign/econ/corvus.json'),marketBytes=await readFile(markets);await writeFile(markets,JSON.stringify({starSystem:'corvus',markets:[{...data.markets[0].declared,unknownField:0}]}));await assert.rejects(importOriginalCorvus(options),/unsupported market field/);await writeFile(markets,marketBytes);
 const settings=join(coreRoot,'data/config/settings.json'),settingsBytes=await readFile(settings);await writeFile(settings,settingsBytes.toString('utf8').replace('"asharu":"graphics/planets/asharu_sparse_glow.png"','"asharu":"graphics/missing.png"'));
 // The fixture edit is checked, so a formatting change cannot silently skip this assertion.
 assert.notEqual(await readFile(settings,'utf8'),settingsBytes.toString('utf8'));await assert.rejects(importOriginalCorvus(options),/ENOENT/);await writeFile(settings,settingsBytes);
 await rm(join(coreRoot,'data/campaign/starmap.json'));await assert.rejects(importOriginalCorvus(options),/ENOENT/);
});
test('TypeScript contract enforces nested readonly access and nullable lookup results',async()=>{
 const ts=await import('typescript'),filename=resolve(project,'scripts/__corvus_contract_in_memory__.mts').replace(/\\/g,'/');
 const source=`import {createOriginalCorvusProvider,buildOriginalCorvusBlueprint} from '../src/campaign/content/OriginalCorvus.mjs';
 const p=createOriginalCorvusProvider({});const bp=buildOriginalCorvusBlueprint({});
 const e=p.getEntity('corvusI');if(e?.orbit){const days:number=e.orbit.periodDays;void days;
 // @ts-expect-error readonly orbit
 e.orbit.angleDegrees=0;}
 // @ts-expect-error readonly entities
 bp.entities.push(e);
 // @ts-expect-error null must be handled
 const id:string=p.getMarket('missing').id;
 const stages=p.listRequiredStages();const status:'required-not-executed'=stages[0].status;void status;
 // @ts-expect-error readonly list
 stages[0].requires.push('mutation');`;
 const options={target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,types:['node'],skipLibCheck:false};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.readFile=p=>p.replace(/\\/g,'/')===filename?source:read(p);host.fileExists=p=>p.replace(/\\/g,'/')===filename||exists(p);
 const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([filename],options,host));assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>project,getNewLine:()=>'\n'}));
});
