import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.SCALAR_WEAPON_OUT??('artifacts/lan-scalar-weapon-modifiers-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.SCALAR_WEAPON_FROZEN??path.resolve('artifacts/lan-scalar-weapon-modifiers-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {Vector2} from './src/engine/math/Vector2';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-scalar-weapon-modifiers-20260927/before.json'))).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-scalar-weapon-modifiers-20260927/before',file),'utf8')]));
const code={};
for(const enabled of [false,true,'default']){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('scalar-weapon-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',...(enabled==='default'?{}:{VITE_LAN_SCALAR_WEAPON_MODIFIERS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code)+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name,instrument=false){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');let bytes=code[String(enabled)];if(instrument){const marker='function combineSystemModifiers(a, b) {';assert.equal(bytes.split(marker).length,2);bytes=bytes.replace(marker,marker+' globalThis.__fullCompositions = (globalThis.__fullCompositions ?? 0) + 1;');}fs.writeFileSync(file,bytes);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}




const types=['BALLISTIC','ENERGY','MISSILE'];
const stats=[['getWeaponRangePercent','rangePercent',0],['getProjectileSpeedPercent','projectileSpeedPercent',0],['getAmmoRegenMultiplier','ammoRegenMultiplier',1],['getWeaponDamageMultiplier','damageMultiplier',1],['getWeaponRateOfFireMultiplier','rateOfFireMultiplier',1],['getWeaponFluxCostMultiplier','fluxCostMultiplier',1]];
function read(engine){return engine.ships.map(s=>types.map(t=>stats.map(([method])=>s.system[method](t))));}
test('host init/reinit/default preserves 176 entities/734 mounts and actually avoids full compositions',async()=>{
 const rows=[];for(const enabled of[false,true,'default']){const api=await load(enabled,'init-'+enabled,true);for(let attempt=0;attempt<2;attempt++){const engine=world(api);globalThis.__fullCompositions=0;const values=read(engine),compositions=globalThis.__fullCompositions;assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);rows.push({enabled,attempt,values,compositions});}}
 for(const row of rows)assert.deepEqual(row.values,rows[0].values);assert.ok(rows[0].compositions>0);assert.equal(rows[2].compositions,0);assert.equal(rows[3].compositions,0);assert.equal(rows[4].compositions,rows[0].compositions);fs.writeFileSync(path.join(out,'init-default-probe.json'),JSON.stringify(rows.map(({values,...r})=>({...r,valuesHash:sha(JSON.stringify(values))})),null,2));
});
test('all six weapon stats stay live across activation, multiple slots, runtime and parent/module states',async()=>{
 const aa=await load(false,'values-before'),ba=await load(true,'values-after'),a=world(aa),b=world(ba),rows=[];let comparisons=0;
 for(let step=0;step<10;step++){
  for(const engine of[a,b])for(const[i,s]of engine.ships.entries()){
   for(const system of s.allSystems){system.isActive=step!==0&&step!==5;system.state=step===2?'IN':step===3?'OUT':step===5?'COOLDOWN':'ACTIVE';system.effectLevel=step===6?NaN:step===7?-0:step===8?Infinity:step/10;system.disabled=step===4;}
   s.flux.softFlux=s.flux.maxFlux*(i%4)/5;s.flux.isOverloaded=step===4;s.flux.isVenting=step===5;s.aimTargetWorld.set(s.pos.x+100,s.pos.y+1000);
   for(const system of s.systems)system.activationInput={point:s.aimTargetWorld.clone(),origin:s.pos.clone(),velocity:s.vel.clone(),facing:s.facingRad,target:null};
   if(step===8)s.runtimeModifiers.set('contract',{weapons:{BALLISTIC:{rangePercent:11,damageMultiplier:1.2,rateOfFireMultiplier:1.3},ENERGY:{projectileSpeedPercent:25,fluxCostMultiplier:.7},MISSILE:{ammoRegenMultiplier:1.4}}});
   if(step===9){s.runtimeModifiers.delete('contract');if(s.parentShip){s.hullHp=0;s.isRetreated=true;}}
  }
  const left=read(a),right=read(b);assert.deepEqual(right,left,'state '+step);comparisons+=176*3*6;rows.push({step,hash:sha(JSON.stringify(right))});
 }
 fs.writeFileSync(path.join(out,'stat-comparison.json'),JSON.stringify({comparisons,rows},null,2));
});
test('selective fold exactly matches full composition: undefined, signed zero, IEEE edges, association and capacity',async()=>{
 const api=await load(true,'fold-math'),engine=world(api),list=[undefined,0,-0,.1,1e16,-1e16,Infinity,-Infinity,NaN,-3];let comparisons=0;
 const slots=[new api.ShipSystem('NONE',37),new api.ShipSystem('NONE',111),new api.ShipSystem('NONE',222)];for(const s of slots){s.type='TEST';s.isActive=true;}slots[0].auxiliary=slots[1];slots[1].auxiliary=slots[2];const values=[0,0,0];let capacities=[];
 for(const type of types)for(const[,key,neutral]of stats){for(const[i,s]of slots.entries())s.definition={id:'TEST',modifiers:(_s,c)=>{capacities.push(c);return{weapons:{[type]:values[i]===undefined?{}:{[key]:values[i]}}};}};
  for(const a of list)for(const b of list)for(const c of list){values[0]=a;values[1]=b;values[2]=c;capacities=[];const expected=slots[0].modifiers().weapons?.[type]?.[key]??neutral;assert.deepEqual(capacities,[37,37,37]);capacities=[];const actual=slots[0].nativeWeaponStat(type,key,neutral===1)??neutral;assert.deepEqual(capacities,[37,37,37]);assert.ok(Object.is(actual,expected),type+'/'+key);comparisons++;}
 }
 const child=engine.combatShips.find(s=>s.parentShip),parent=child.parentShip;child.system.isActive=true;child.system.definition={id:'TEST',modifiers:()=>({weapons:{BALLISTIC:{rangePercent:1e16,damageMultiplier:-0}}})};for(const s of parent.allSystems){s.type='TEST';s.isActive=true;s.disabled=false;s.definition={id:'TEST',moduleModifiers:()=>({weapons:{BALLISTIC:{rangePercent:-1e16,damageMultiplier:2}}})};}
 for(const disabled of[false,true]){parent.defenseSystem.disabled=disabled;for(const[,key,neutral]of stats){assert.ok(Object.is(child.system.nativeWeaponStat('BALLISTIC',key,neutral===1)??neutral,child.system.modifiers().weapons?.BALLISTIC?.[key]??neutral));comparisons++;}}
 fs.writeFileSync(path.join(out,'fold-math.json'),JSON.stringify({comparisons,capacityInherited:true,rightAssociativeAuxiliary:true,orderedParentFold:true},null,2));
});
test('unknown definitions, accessors, exceptions and runtime preserve original callback sequence',async()=>{
 const aa=await load(false,'fallback-before'),ba=await load(true,'fallback-after'),rows=[];
 function run(api,kind){const engine=world(api),ship=kind.startsWith('parent')?engine.combatShips.find(s=>s.parentShip):engine.playerShip,system=ship.system,trace=[];
  const install=s=>{s.isActive=true;s.definition={...s.definition,modifiers(){trace.push('own');if(kind==='throws')throw Error('stat callback');return{weapons:{BALLISTIC:{rangePercent:trace.length,damageMultiplier:trace.length}}};},moduleModifiers(){trace.push('parent');return{weapons:{BALLISTIC:{rangePercent:trace.length,damageMultiplier:trace.length}}};}};};
  if(['unknown','throws'].includes(kind))install(system);if(kind==='aux'){system.auxiliary.type='TEST';install(system.auxiliary);}if(kind==='parent-unknown')install(ship.parentShip.system);
  if(kind==='runtime')ship.runtimeModifiers.set('contract',{weapons:{BALLISTIC:{rangePercent:37,damageMultiplier:2}}});
  if(kind==='parent-runtime')ship.parentShip.runtimeModifiers.set('contract',{weapons:{BALLISTIC:{rangePercent:31}}});
  if(kind==='method'){const get=system.modifiers;system.modifiers=function(...args){trace.push('method');return get.apply(this,args);};}
  if(kind==='method-accessor'){const get=system.modifiers;Object.defineProperty(system,'modifiers',{get(){trace.push('access');return function(...args){trace.push('method');return get.apply(this,args);};}});}
  if(kind==='available'){Object.defineProperty(system,'available',{get(){trace.push('available');return true;}});}
  if(kind==='parent-roster'){const p=ship.parentShip,roster=p.allSystems;Object.defineProperty(p,'allSystems',{get(){trace.push('roster');return roster;}});}
  if(kind==='undefined'){Object.defineProperty(system,'modifiers',{get(){throw Error('must not read');}});}
  const values=stats.map(([method])=>{try{return system[method](kind==='undefined'?undefined:'BALLISTIC');}catch(e){return{error:e.message};}});return{values,trace};
 }
 for(const kind of['unknown','throws','aux','parent-unknown','runtime','parent-runtime','method','method-accessor','available','parent-roster','undefined']){const a=run(aa,kind),b=run(ba,kind);assert.deepEqual(b,a,kind);rows.push({kind,...b});}fs.writeFileSync(path.join(out,'fallback-order.json'),JSON.stringify(rows,null,2));
});
test('60 fixed steps preserve complete authority and hidden fire-control/RNG state',async()=>{
 const aApi=await load(false,'engine-reference'),bApi=await load(true,'engine-candidate'),a=world(aApi),b=world(bApi),hashes=[];
 for(let tick=1;tick<=60;tick++){
  for(const engine of[a,b]){
   if(tick===8)for(const s of engine.capitalShips){s.aimTargetWorld.set(s.pos.x+1000,s.pos.y+500);s.flux.softFlux=s.flux.maxFlux*.2;for(const system of s.systems)system.activate();}
   if(tick===20)for(const[i,s]of engine.capitalShips.entries()){s.pos.set(s.teamId===0?-500:500,(i%6)*240-600);s.aimTargetWorld.set(s.teamId===0?500:-500,s.pos.y);s.isFiringMain=true;}
   if(tick===30)for(const s of engine.capitalShips)s.startVenting();
   if(tick===38){const child=engine.combatShips.find(s=>s.parentShip);child.hullHp=child.maxHullHp*.35;child.flux.isVenting=false;child.flux.isOverloaded=false;child.flux.softFlux=child.flux.hardFlux=0;}
  }
  a.fixedUpdate(1/60);b.fixedUpdate(1/60);
  const left=witness(aApi,a,tick),right=witness(bApi,b,tick);assert.deepEqual(right,left,'state tick '+tick);hashes.push(sha(JSON.stringify(right)));
 }
 fs.writeFileSync(path.join(out,'whole-state-hashes.json'),JSON.stringify(hashes,null,2));
});


test('one isolated-process ABBA: 150 warmup + 120 full steps, 3% gate in each pair',async()=>{
 assert.equal(passed,5,'do not time invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.03);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});
