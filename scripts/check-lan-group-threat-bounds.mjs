import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.GROUP_THREAT_BOUNDS_OUT??('artifacts/lan-group-threat-bounds-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.GROUP_THREAT_BOUNDS_FROZEN??path.resolve('artifacts/lan-group-threat-bounds-20260927/candidate-v2-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
const mode=process.env.GROUP_BOUNDS_MODE??'contracts', selected=process.env.GROUP_BOUNDS_CASE;
const proofRows=[], required=[];
const test=(name,body)=>{
 const signature=sha(body.toString()); required.push({name,signature});
 if(mode==='bench'||selected&&!name.includes(selected))return;
 nodeTest(name,async()=>{await body();proofRows.push({name,signature,frozenSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)});fs.writeFileSync(path.join(out,'proofs.json'),JSON.stringify(proofRows,null,2));});
};
const contents=`
export {handleMessage,testEngine} from './src/network/host.worker';
export {Ship} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {assessThreats} from './src/engine/ai/ThreatAssessment';
export {WeaponThreatEnvelope} from './src/engine/ai/WeaponThreatEnvelope';
export {FireControlQueryRoster} from './src/engine/ai/FireControlQueryBatch';
export {hullModDefinitions} from './src/engine/extensions/HullMods';
export {AutofireController} from './src/engine/ai/AutofireController';
export {ShipWeaponControlSystem} from './src/engine/simulation/systems/ShipWeaponControlSystem';
export {Vector2} from './src/engine/math/Vector2';
export {RuntimeCombatModifiers} from './src/engine/extensions/RuntimeCombatModifiers';
export {FluxTracker} from './src/engine/simulation/FluxTracker';
export {Shield} from './src/engine/simulation/Shield';
export {InFlightFireBudget} from './src/engine/ai/InFlightFireBudget';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const baselineFiles=JSON.parse(fs.readFileSync(path.resolve('artifacts/lan-group-threat-bounds-20260927/before.json'))).filter(r=>r.exists).map(r=>r.file);
const baseline=new Map(baselineFiles.map(file=>[file,fs.readFileSync(path.resolve('artifacts/lan-group-threat-bounds-20260927/before',file),'utf8')]));
const code={};
function instrument(file,text){
 text=text.replaceAll('\r\n','\n');
 if(file==='src/engine/ai/ThreatAssessment.ts'){
  text=text.replace(/for \(const enemy of (world.ships|weaponSources)\) \{/g,'for (const enemy of $1) { globalThis.__groupProbe?.source?.(weaponEnvelopes);');
 }
 if(file==='src/engine/ai/WeaponThreatEnvelope.ts'){
  text=text.replaceAll('    return result;','    globalThis.__groupProbe?.scope?.(result);\n    return result;');
  text=text.replace('  private buildGroupBound(group: ThreatGroup): GroupBound | null {','  private buildGroupBound(group: ThreatGroup): GroupBound | null { globalThis.__groupProbe?.build?.();');
 }
 return text;
}
for(const key of ['false','true','default','false-probe','true-probe','default-probe']){
 const enabled=key.startsWith('false')?false:key.startsWith('true')?true:'default',probe=key.endsWith('-probe');
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('interleaved-bounds-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_LAN_OWNED_MOTION_READS:'true',VITE_LAN_EARLY_PREAIM_RANGE:'true',VITE_AI_INTERLEAVED_THREATS:'true',...(enabled==='default'?{}:{VITE_AI_GROUP_THREAT_BOUNDS:String(enabled)})})},
  plugins:[{name:'same-frozen-source',setup(build){build.onResolve({filter:/^\./},args=>{const base=path.resolve(args.resolveDir,args.path);for(const suffix of['','.ts','.tsx','.json','.mts','.mjs']){const file=base+suffix;if(!fs.existsSync(file)&&sources.has(file.toLowerCase()))return{path:file};}});build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:(probe?instrument(row.file,!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code):(!enabled&&baseline.has(row.file)?baseline.get(row.file):row.code))+(row.file==='src/network/host.worker.ts'?'\nexport {handleMessage}; export function testEngine(){ return engine; }':''),loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[key]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){globalThis.self={postMessage(){}};const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)],{flag:'wx'});return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api){const messages=[];globalThis.self={postMessage(m){messages.push(m);}};api.handleMessage(structuredClone({type:'init',match}));assert.ok(messages.some(m=>m.type==='ready'),JSON.stringify(messages.filter(m=>m.type==='error')));assert.ok(messages.some(m=>m.type==='snapshot'&&m.tick===0));assert.ok(!messages.some(m=>m.type==='error'));const engine=api.testEngine();assert.equal(engine.ships.length,176);return engine;}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}







function tactical(engine,envelope){return{ships:engine.ships,projectiles:engine.projectiles,beams:engine.beams,asteroids:engine.asteroids,exactWeaponThreatEnvelope:envelope};}
function owned(api,engine){const scope=api.WeaponThreatEnvelope.forOwnedInterleavedPhase(engine.ships);assert.ok(scope);return scope;}

function query(scope,engine,ship=engine.playerShip,horizon=3){return scope.queryWeaponSources?.(engine.ships,ship,ship.getShieldCenter(),Math.max(ship.spec.collisionRadius,ship.shield.radius),horizon);}

test('real Worker init/reinit/default: 176 ships, 734 mounts and active group scope',async()=>{
 const rows=[];let expected;
 for(const enabled of[false,true,'default']){
  const api=await load(enabled+'-probe','init-'+enabled);
  for(let attempt=0;attempt<2;attempt++){
   const engine=world(api);assert.equal(engine.ships.reduce((n,s)=>n+s.weapons.length,0),734);let scopes=[],sources=0;
   globalThis.__groupProbe={scope(e){if(e?.threatGroups)scopes.push(e);},source(){sources++;}};
   try{engine.fixedUpdate(1/60);}finally{delete globalThis.__groupProbe;}
   assert.equal(scopes.length,enabled===true?1:0);for(const scope of scopes)assert.equal(query(scope,engine),undefined);
   const state=sha(JSON.stringify(witness(api,engine,1)));expected??=state;assert.equal(state,expected);rows.push({enabled,attempt,sources,state});
  }
 }
 assert.ok(rows[2].sources<rows[0].sources);assert.equal(rows[4].sources,rows[0].sources);fs.writeFileSync(path.join(out,'init.json'),JSON.stringify(rows,null,2));
});

test('group reuse, original order, module/carrier invalidation, team and roster changes',async()=>{
 const api=await load('true-probe','groups'),engine=world(api),scope=owned(api,engine);assert.ok(scope.threatGroups?.length>0);const groups=scope.threatGroups;
 let builds=0;globalThis.__groupProbe={build(){builds++;}};
 try{
  const first=query(scope,engine);assert.ok(first);assert.ok(first.length<engine.ships.length);assert.ok(builds>0);const count=builds;
  assert.deepEqual(query(scope,engine),first);assert.equal(builds,count,'must share across observer queries');
  const friend=engine.ships.find(s=>s!==engine.playerShip&&s.teamId===engine.playerShip.teamId);query(scope,engine,friend);assert.equal(builds,count);
  const family=groups.find(g=>g.members.some(s=>s.parentShip&&s.teamId!==engine.playerShip.teamId));assert.ok(family.members.length>1);
  const child=family.members.find(s=>s.parentShip);assert.ok(child);child.pos.set(engine.playerShip.pos.x,engine.playerShip.pos.y);scope.invalidate(child);
  const candidates=query(scope,engine);assert.ok(candidates.includes(child));assert.equal(builds,count+1);assert.deepEqual(candidates,engine.ships.filter(s=>candidates.includes(s)));
  const carrierFamily=groups.find(g=>g.members.some(s=>s.sourceCarrier));assert.ok(carrierFamily);const fighter=carrierFamily.members.find(s=>s.sourceCarrier);scope.invalidate(fighter);assert.equal(carrierFamily.bound,undefined);
  for(const s of family.members)s.teamId=engine.playerShip.teamId;scope.invalidate(child);assert.ok(!query(scope,engine).includes(child));
  child.teamId=1-engine.playerShip.teamId;scope.invalidate(child);assert.ok(query(scope,engine).includes(child),'mixed group not classified friendly');
  const roster=engine.ships;assert.equal(scope.queryWeaponSources(roster.slice(1),engine.playerShip,engine.playerShip.pos,100,3),undefined);
  assert.equal(scope.queryWeaponSources(roster.toReversed(),engine.playerShip,engine.playerShip.pos,100,3),undefined);
  assert.equal(scope.queryWeaponSources([...roster,roster[0]],engine.playerShip,engine.playerShip.pos,100,3),undefined);
  for(const change of ['range-speed','shield','visibility','retreat']){
   if(change==='range-speed'){child.vel.set(-4000,2000);for(const m of child.weapons)m.spec={...m.spec,range:m.spec.range*4};child.system.activate();}
   if(change==='shield')engine.playerShip.shield.radius=30000;
   if(change==='visibility'){child.visibilityMask=0;child.visibilityOverflow='';}
   if(change==='retreat')child.retreatFromCombat();
   scope.invalidate(child);
   assert.deepEqual(api.assessThreats(engine.playerShip,tactical(engine,scope),3,.5),api.assessThreats(engine.playerShip,tactical(engine),3,.5),change);
  }
  child.isDead=true;scope.invalidate(child);assert.deepEqual(api.assessThreats(engine.playerShip,tactical(engine,scope),3,.5),api.assessThreats(engine.playerShip,tactical(engine),3,.5));
  scope.close();assert.equal(query(scope,engine),undefined);
  const exact=api.WeaponThreatEnvelope.forExactPhase(engine.ships);assert.ok(exact);assert.equal(query(exact,engine),undefined);exact.close();
  fs.writeFileSync(path.join(out,'groups.json'),JSON.stringify({groups:groups.length,initialBuilds:count,builds,module:child.id,fighter:fighter.id},null,2));
 }finally{scope.close();delete globalThis.__groupProbe;}
});

test('native reader guard rejects replacement getters, prototypes and dynamic effects without evaluating them',async()=>{
 const api=await load(true,'guard'),engine=world(api),ship=engine.enemyShip;
 const replacements=[
  [ship.engineController,'disabledFraction',{value(){throw Error('admission engine fraction');}}],
  [ship,'weapons',{get(){throw Error('admission weapon getter');}}],
  [ship,'isPhased',{get(){throw Error('admission getter');}}],
  [ship,'isVisibleTo',{value(){throw Error('admission visibility');}}],
  [ship,'getMotionStats',{value(){throw Error('admission motion');}}],
  [ship,'getShieldCenter',{value(){throw Error('admission center');}}],
  [ship.flux,'getTimeToVent',{value(){throw Error('admission vent');}}],
  [ship.flux,'totalFlux',{get(){throw Error('admission flux');}}],
  [ship.flux,'isVenting',{get(){throw Error('admission data');}}],
  [ship.system,'modifiers',{value(){throw Error('admission stats');}}],
  [ship.system,'blocksWeapons',{get(){throw Error('admission system');}}],
  [ship.system,'getWeaponRangePercent',{value(){throw Error('admission range');}}],
  [ship.runtimeModifiers,'value',{get(){throw Error('admission runtime');}}],
  [ship.pos,'x',{get(){throw Error('admission coordinate');}}],
 ];
 for(const[object,key,value]of replacements){const prior=Object.getOwnPropertyDescriptor(object,key);Object.defineProperty(object,key,{...value,configurable:true});try{const scope=owned(api,engine);assert.equal(query(scope,engine),undefined,key);scope.close();}finally{if(prior)Object.defineProperty(object,key,prior);else delete object[key];}}
 const prior=Object.getOwnPropertyDescriptor(api.FluxTracker.prototype,'totalFlux');Object.defineProperty(api.FluxTracker.prototype,'totalFlux',{get(){throw Error('admission proto');},configurable:true});try{const scope=owned(api,engine);assert.equal(query(scope,engine),undefined);scope.close();}finally{Object.defineProperty(api.FluxTracker.prototype,'totalFlux',prior);}
 let calls=0;const runtime={};Object.defineProperty(runtime,'disableWeapons',{get(){calls++;throw Error('must not evaluate');},enumerable:true});
 const child=engine.ships.find(s=>s.parentShip);for(const s of[child,child.parentShip]){const scope=owned(api,engine);assert.ok(query(scope,engine));s.runtimeModifiers.set('unknown',runtime);scope.invalidate(s);assert.equal(query(scope,engine),undefined);assert.equal(calls,0);scope.close();const rejected=owned(api,engine);assert.equal(query(rejected,engine),undefined);rejected.close();s.runtimeModifiers.delete('unknown');}
 const scope=owned(api,engine);child.externalPhaseEffects.set('unknown',()=>{throw Error('not during invalidate');});scope.invalidate(child);assert.equal(query(scope,engine),undefined);child.externalPhaseEffects.clear();scope.close();
 fs.writeFileSync(path.join(out,'guard.json'),JSON.stringify({replacementCases:replacements.length,prototype:true,dynamicFamilyInvalidation:true},null,2));
});

test('group exclusion implies original scalar bound, including extreme floats and exceptional inputs',async()=>{
 const api=await load(true,'bounds'),engine=world(api),observer=engine.playerShip,scope=owned(api,engine);let exclusions=0,kept=0;
 for(let iteration=0;iteration<48;iteration++){
  const scale=[1,1e-6,1e6,1e150][iteration%4];
  for(const[i,s]of engine.ships.entries()){
   s.pos.set(((i*917+iteration*701)%30001-15000)*scale,((i*311+iteration*107)%13001-6500)*scale);
   s.vel.set((i%7-3)*100*scale,(i%11-5)*73*scale);scope.invalidate(s);
  }
  const h=[0,.1,1,3,20,1e-12][iteration%6],radius=Math.max(observer.spec.collisionRadius,observer.shield.radius),center=observer.getShieldCenter(),sources=query(scope,engine,observer,h);assert.ok(sources);
  for(const enemy of engine.ships){if(enemy.teamId===observer.teamId||enemy.isDead)continue;if(sources.includes(enemy)){kept++;continue;}
   const e=scope.get(enemy);assert.ok(e);if(e.maxRangeAndMuzzle===-Infinity)continue;
   const distance=Math.max(Math.abs(center.x-enemy.pos.x),Math.abs(center.y-enemy.pos.y)),approach=radius+h*Math.max(1,e.maxSpeed+Math.abs(enemy.vel.x-observer.vel.x)+Math.abs(enemy.vel.y-observer.vel.y)),reach=approach+e.maxRangeAndMuzzle;
   const pad=1e-6*Math.max(1,Math.abs(center.x),Math.abs(center.y),Math.abs(enemy.pos.x),Math.abs(enemy.pos.y),Math.abs(radius),Math.abs(approach),Math.abs(e.maxRangeAndMuzzle),Math.abs(reach));
   assert.ok(Number.isFinite(reach)&&distance>reach+pad,'not implied '+iteration+' '+enemy.id);exclusions++;
  }
 }
 assert.ok(exclusions>0&&kept>0);
 const enemy=engine.enemyShip;for(const value of[NaN,Infinity,-Infinity]){enemy.pos.x=value;scope.invalidate(enemy);const candidates=query(scope,engine);assert.ok(candidates.includes(enemy));}
 for(const value of[-1,NaN,Infinity])assert.equal(query(scope,engine,observer,value),undefined);
 assert.equal(scope.queryWeaponSources(engine.ships,observer,observer.pos,-1,3),undefined);
 enemy.pos.set(observer.pos.x+1e9,observer.pos.y);for(const m of enemy.weapons)m.spec={...m.spec,range:Infinity};scope.invalidate(enemy);assert.ok(query(scope,engine).includes(enemy));
 scope.close();fs.writeFileSync(path.join(out,'bounds.json'),JSON.stringify({iterations:48,exclusions,kept},null,2));
});
test('forecast values retain order and exact numbers across horizons, distances, recovery and active systems',async()=>{
 const aApi=await load(false,'forecast-reference'),bApi=await load(true,'forecast-candidate'),a=world(aApi),b=world(bApi);const rows=[];
 for(const state of['initial','near','active','vent','overload','dead-module','nonfinite']){
  for(const engine of[a,b]){
   for(const[i,s]of engine.capitalShips.entries()){
    s.pos.set(state==='initial'?(s.teamId===0?-6500:6500):(s.teamId===0?-300:300),i*100-1000);
    s.flux.isVenting=state==='vent';s.flux.isOverloaded=state==='overload';s.flux.overloadTimer=state==='overload'?8:0;s.flux.softFlux=s.flux.maxFlux*.2;
    if(state==='active')for(const system of s.allSystems)system.activate();
   }
   const child=engine.ships.find(s=>s.parentShip);child.hullHp=state==='dead-module'?0:child.maxHullHp;
   if(state==='nonfinite'){const s=engine.enemyShip;s.pos.x=NaN;s.flux.isOverloaded=true;s.flux.overloadTimer=NaN;}
  }
  for(const horizon of[-1,0,.5,3,Infinity,NaN]){
   const scopes=[owned(aApi,a),owned(bApi,b)];try{
    for(const index of[0,1,7,20,40,77]){
     const left=aApi.assessThreats(a.combatShips[index],tactical(a,scopes[0]),horizon,.5,horizon),right=bApi.assessThreats(b.combatShips[index],tactical(b,scopes[1]),horizon,.5,horizon);
     assert.deepEqual(right,left,state+' '+horizon+' '+index);rows.push({state,horizon:String(horizon),index,threats:left.threats.length});
    }
   }finally{scopes.forEach(s=>s.close());}
  }
 }
 assert.ok(rows.some(r=>r.threats>0));assert.deepEqual(witness(bApi,b,0),witness(aApi,a,0));fs.writeFileSync(path.join(out,'forecasts.json'),JSON.stringify({comparisons:rows.length,rows},null,2));
});

test('unknown recovery/stat callbacks preserve scalar order, exceptions and reentrancy',async()=>{
 const apis=[await load(false,'unknown-reference'),await load(true,'unknown-candidate')],rows=[];
 for(const kind of['phase','throw-phase','vent','throw-vent','unneeded-motion','throw-motion','system','throw-system','runtime','throw-runtime','nested-phase']){
  const results=[];
  for(const api of apis){
   const engine=world(api),ship=engine.playerShip,enemy=engine.enemyShip,trace=[];for(const[i,s]of engine.capitalShips.entries())s.pos.set(s.teamId===0?-250:250,i*55-500);
   const callback=name=>{trace.push(name);if(kind==='throw-'+name)throw Error(name+' failure');};
   if(kind.includes('phase')){let nested=false;Object.defineProperty(enemy,'isPhased',{configurable:true,get(){callback('phase');if(kind==='nested-phase'&&!nested){nested=true;trace.push(api.assessThreats(ship,{ships:[ship],projectiles:[],beams:[],asteroids:[]},1,.5).threats.length);nested=false;}return false;}});}
   if(kind.includes('vent')){enemy.flux.isVenting=true;enemy.flux.getTimeToVent=()=>{callback('vent');return 1;};}
   if(kind.includes('motion')){const original=enemy.getMotionStats;enemy.getMotionStats=function(){callback('motion');return original.call(this);};if(kind==='unneeded-motion'){enemy.flux.isOverloaded=true;enemy.flux.overloadTimer=50;}}
   if(kind.includes('system'))Object.defineProperty(enemy.system,'blocksWeapons',{configurable:true,get(){callback('system');return false;}});
   const scope=owned(api,engine);
   if(kind.includes('runtime')){const data={};Object.defineProperty(data,'disableWeapons',{get(){callback('runtime');return 0;},enumerable:true});enemy.runtimeModifiers.set('unknown',data);scope.invalidate(enemy);}
   let value,error;try{value=api.assessThreats(ship,tactical(engine,scope),3,.5);}catch(e){error=e.message;}finally{scope.close();}
   results.push({value,error,trace});
  }
  assert.deepEqual(results[1],results[0],kind);if(kind.startsWith('throw-'))assert.ok(results[0].error,kind);else if(kind==='unneeded-motion')assert.equal(results[0].trace.includes('motion'),false);else assert.ok(results[0].trace.length,kind);
  rows.push({kind,trace:results[0].trace,error:results[0].error});
 }
 fs.writeFileSync(path.join(out,'unknown.json'),JSON.stringify(rows,null,2));
});
test('60 full fixed steps preserve complete authority and hidden fire-control/RNG state',async()=>{
 const aApi=await load(false,'engine-reference'),bApi=await load(true,'engine-candidate'),a=world(aApi),b=world(bApi),hashes=[];
 for(let tick=1;tick<=60;tick++){
  for(const engine of[a,b]){
   if(tick===8)for(const s of engine.capitalShips){s.aimTargetWorld.set(s.pos.x+1000,s.pos.y+500);s.flux.softFlux=s.flux.maxFlux*.2;for(const system of s.systems)system.activate();}
   if(tick===20)for(const[i,s]of engine.capitalShips.entries()){s.pos.set(s.teamId===0?-500:500,(i%6)*240-600);s.aimTargetWorld.set(s.teamId===0?500:-500,s.pos.y);s.isFiringMain=true;}
   if(tick===30)for(const s of engine.capitalShips)s.startVenting();
   if(tick===38){const child=engine.combatShips.find(s=>s.parentShip);child.hullHp=child.maxHullHp*.35;child.flux.isVenting=false;child.flux.isOverloaded=false;child.flux.softFlux=child.flux.hardFlux=0;}
  }
  a.fixedUpdate(1/60);b.fixedUpdate(1/60);const left=witness(aApi,a,tick),right=witness(bApi,b,tick);assert.deepEqual(right,left,'state tick '+tick);hashes.push(sha(JSON.stringify(right)));
 }fs.writeFileSync(path.join(out,'whole-state-hashes.json'),JSON.stringify(hashes,null,2));
});



test('real projectile and beam threats remain live outside speculative weapon filtering; exceptional finally closes',async()=>{
 const api=await load('true-probe','live'),engine=world(api),observer=engine.playerShip,scope=owned(api,engine);
 for(const beam of[false,true]){
  const source=engine.ships.find(s=>!s.isRetreated&&s.teamId!==observer.teamId&&s.weapons.some(m=>!!m.spec.isBeam===beam)),mount=source?.weapons.find(m=>!!m.spec.isBeam===beam);assert.ok(source&&mount);
  source.flux.isVenting=false;source.flux.isOverloaded=false;source.flux.softFlux=source.flux.hardFlux=0;mount.ammo=Infinity;mount.reloadDelayRemaining=0;mount.currentAngleRad=0;
  assert.equal(source.weaponControl.fireWeapon(mount,source,p=>{p.pos.set(observer.pos.x-300,observer.pos.y);p.vel.set(1000,0);engine.projectiles.push(p);},b=>{b.startPos.set(observer.pos.x-300,observer.pos.y);b.endPos.set(observer.pos.x+300,observer.pos.y);engine.beams.push(b);}),true);scope.invalidate(source);
 }
 const expected=api.assessThreats(observer,tactical(engine),8,1),actual=api.assessThreats(observer,tactical(engine,scope),8,1);assert.deepEqual(actual,expected);assert.ok(actual.threats.some(t=>t.kind==='PROJECTILE'));assert.ok(actual.threats.some(t=>t.kind==='BEAM'));
 engine.beams.at(-1).damagePerSec*=2;assert.deepEqual(api.assessThreats(observer,tactical(engine,scope),8,1),api.assessThreats(observer,tactical(engine),8,1));scope.close();
 const fresh=world(api),scopes=[];globalThis.__groupProbe={scope(e){if(e?.threatGroups)scopes.push(e);}};
 // Throw only after the real engine has entered its native ship.update span.
 const original=api.FluxTracker.prototype.update;assert.equal(typeof original,'function');api.FluxTracker.prototype.update=function(){throw Error('controlled flux update failure');};
 try{assert.throws(()=>fresh.fixedUpdate(1/60),/controlled flux update failure/);}finally{api.FluxTracker.prototype.update=original;delete globalThis.__groupProbe;}
 assert.equal(scopes.length,1);assert.equal(scopes[0].active,false);assert.equal(query(scopes[0],fresh),undefined);
 fs.writeFileSync(path.join(out,'live.json'),JSON.stringify({projectiles:engine.projectiles.length,beams:engine.beams.length,threatKinds:actual.threats.map(t=>t.kind),finallyClosed:true},null,2));
});

test('270-step state equivalence and warm source-loop reduction with real path activation',async()=>{
 const rows=[];
 for(const enabled of[false,true]){
  const api=await load(enabled+'-probe','count-'+enabled),engine=world(api);let sources=0,warmSources=0,scopes=0,builds=0,tick=0,initial;
  globalThis.__groupProbe={source(){sources++;if(tick>150)warmSources++;},scope(e){if(tick>150&&e?.threatGroups)scopes++;},build(){if(tick>150)builds++;}};
  try{for(tick=1;tick<=270;tick++){engine.fixedUpdate(1/60);if(tick===20)initial=sha(JSON.stringify(witness(api,engine,tick)));}}finally{delete globalThis.__groupProbe;}
  rows.push({enabled,initial,final:sha(JSON.stringify(witness(api,engine,270))),entities:engine.ships.length,sources,warmSources,scopes,builds});
 }
 assert.equal(rows[1].initial,rows[0].initial);assert.equal(rows[1].final,rows[0].final);assert.equal(rows[1].entities,rows[0].entities);assert.equal(rows[1].scopes,120);assert.ok(rows[1].warmSources<rows[0].warmSources);assert.ok(rows[1].builds>0);
 const api=await load(false,'uninstrumented-initial'),engine=world(api);for(let tick=1;tick<=20;tick++)engine.fixedUpdate(1/60);assert.equal(sha(JSON.stringify(witness(api,engine,20))),rows[0].initial);
 fs.writeFileSync(path.join(out,'counts.json'),JSON.stringify({rows,warmSourceReduction:1-rows[1].warmSources/rows[0].warmSources},null,2));
});
if(mode==='bench')nodeTest('one isolated-process ABBA: 150 warmup + 120 full steps, 5% gate in each pair',async()=>{
 const evidence=JSON.parse(process.env.GROUP_BOUNDS_EVIDENCE??'[]').flatMap(file=>JSON.parse(fs.readFileSync(file)));
 for(const r of required)assert.ok(evidence.some(e=>e.name===r.name&&e.signature===r.signature&&e.frozenSha256===sha(fs.readFileSync(frozen))&&e.beforeBundle===sha(code.false)&&e.afterBundle===sha(code.true)),'missing matching contract evidence '+r.name);const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const bundle=path.join(out,'bench-'+index+'.mjs'),runner=path.join(out,'bench-'+index+'-runner.mjs');fs.writeFileSync(bundle,code[String(enabled)],{flag:'wx'});
  const body=`import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';\nglobalThis.self={postMessage(){}};const api=await import(${JSON.stringify(pathToFileURL(bundle).href)});\nconst match=${JSON.stringify(match)};const sha=${sha.toString()};\n${world.toString()}\n${hidden.toString()}\n${witness.toString()}\nconst engine=world(api);for(let tick=0;tick<150;tick++)engine.fixedUpdate(1/60);const heapBefore=process.memoryUsage().heapUsed;const started=performance.now();for(let tick=0;tick<120;tick++)engine.fixedUpdate(1/60);const elapsedMs=performance.now()-started;console.log(JSON.stringify({elapsedMs,perStepMs:elapsedMs/120,heapBefore,heapAfter:process.memoryUsage().heapUsed,entities:engine.ships.length,stateSha256:sha(JSON.stringify(witness(api,engine,270)))}));`;
  fs.writeFileSync(runner,body,{flag:'wx'});const run=spawnSync(process.execPath,[runner],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,'bench-'+index+'.stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(out,'bench-'+index+'.stderr.log'),run.stderr??'',{flag:'wx'});assert.equal(run.status,0,(run.stderr??'').slice(0,1000));const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));rows.push({index,enabled,steps:120,...result});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; original host init and fixedUpdate, NOT browser timing',rows},null,2));
 }
 assert.ok(rows.every(r=>r.entities===rows[0].entities));assert.ok(rows.every(r=>r.stateSha256===rows[0].stateSha256));const gains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs],pass=gains.every(g=>g>=.05);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Sequential isolated Node processes; 150 warmup + 120 measured steps per arm; excludes spawn/import/warmup/final witness',rows,gains,passesPrescribedGate:pass},null,2));console.log(JSON.stringify({gains,passesPrescribedGate:pass}));
});



