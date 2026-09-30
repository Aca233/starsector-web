// Historical, retired candidate replay: requires its frozen source graph, NOT current production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {test as nodeTest} from 'node:test';
import {build} from 'esbuild';
const out=path.resolve(process.env.AUTHORED_QUERY_OUT??('artifacts/lan-authored-fire-query-20260927/check-'+Date.now()));
fs.mkdirSync(out,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=process.env.AUTHORED_QUERY_FROZEN??path.resolve('artifacts/lan-authored-fire-query-20260927/candidate-browser.json');
const snapshot=JSON.parse(fs.readFileSync(frozen)),sources=new Map(snapshot.files.map(row=>{
 assert.equal(sha(row.code),row.sha256);return [path.resolve(row.file).toLowerCase(),row];
}));
let passed=0;
const test=(name,body)=>nodeTest(name,async()=>{await body();passed++;});
const contents=`
export {createLanWorld} from './src/network/LanWorld';
export {FireControlQueryRoster,FireControlQueryBatch} from './src/engine/ai/FireControlQueryBatch';
export {AutofireController} from './src/engine/ai/AutofireController';
export {OwnedFireControlReadGuard} from './src/engine/simulation/Ship';
export {captureCombat} from './src/network/AuthorityCombatSnapshot';
`;
const code={};
for(const enabled of [false,true]){
 const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  define:{__LAN_BUILD_ID__:JSON.stringify('authored-fire-query-contract'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:true,PROD:false,MODE:'development',SSR:false,VITE_AI_EXACT_AUTHORED_THREATS:'true',VITE_AI_AUTHORED_FIRE_QUERIES:String(enabled)})},
  plugins:[{name:'same-frozen-source',setup(build){build.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const row=sources.get(args.path.toLowerCase());if(row)return{contents:row.code,loader:path.extname(row.file).slice(1).replace(/^[cm]([jt]s)$/, '$1')};if(args.path.startsWith(path.resolve('src')+path.sep))throw Error('Unfrozen source: '+args.path);});}}]});
 code[String(enabled)]=result.outputFiles[0].text;
}
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({frozen,sourceSha256:sha(fs.readFileSync(frozen)),beforeBundle:sha(code.false),afterBundle:sha(code.true)},null,2));
async function load(enabled,name){const file=path.join(out,name+'.mjs');fs.writeFileSync(file,code[String(enabled)]);return import(pathToFileURL(file).href);}
const hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'],ai=Array.from({length:20},(_,i)=>hulls[i%3]);
const match={id:'authored-query-check',hostId:'host',seed:917,snapshotHz:60,players:[{id:'host',name:'Host',seat:0,team:0,hull:hulls[0]},{id:'guest',name:'Guest',seat:1,team:1,hull:hulls[0]}],options:{assignment:'teams',battleSize:3200,deploymentLimit:1600,aiHulls:[ai.slice(0,10),ai.slice(10)]}};
function world(api,owned=true){const{engine,controlled}=api.createLanWorld(match);if(owned)api.FireControlQueryRoster.ownForWorker(engine);for(const ship of controlled.values()){engine.externallyControlledShipIds.add(ship.id);ship.fireControlMode='MANUAL';}assert.equal(engine.ships.length,176);return engine;}
function queryWorld(engine,ships=engine.ships){return{ships,missiles:engine.projectiles,asteroids:engine.asteroids};}
function hidden(engine){return {random:engine.random.checkpointWitness(),visualRandom:engine.visualRandom.checkpointWitness(),ships:engine.ships.map(ship=>({id:ship.id,random:ship.random.checkpointWitness(),controlRandom:ship.weaponControl.random.checkpointWitness(),trackers:ship.weapons.map(mount=>{const t=ship.weaponControl.autofire.trackers.get(mount);return [mount.slotId,t?{target:t.target&&[t.target.kind,t.target.entity.id],scanIn:t.scanIn,firingTime:t.firingTime,idleFireTime:t.idleFireTime,ammoAllowed:t.ammoAllowed,random:t.random.checkpointWitness()}:null];})}))};}
function witness(api,engine,tick){return{combat:api.captureCombat(engine,tick,{},0),hidden:hidden(engine)};}
function normalized(value){return JSON.parse(JSON.stringify(value));}
const api=await load(true,'contracts');

test('176 authored entities enter only the owned, per-ship query domain',()=>{
 const generic=world(api,false);assert.equal(api.FireControlQueryRoster.createAuthored(generic.ships,generic),undefined);
 const engine=world(api),q=queryWorld(engine),roster=api.FireControlQueryRoster.createAuthored(q.ships,engine);assert.ok(roster);
 assert.equal(engine.capitalShips.length,22);assert.equal(engine.combatShips.length,78);assert.equal(engine.fighters.length,70);assert.equal(engine.bombers.length,28);
 assert.equal(api.FireControlQueryRoster.create(q.ships,engine).begin(engine.playerShip,q),undefined,'legacy gate stays closed');
 for(const ship of q.ships){assert.ok(new api.OwnedFireControlReadGuard(ship,true).allows(),ship.id);const batch=roster.begin(ship,q);assert.ok(batch,ship.id);assert.equal(batch.targets(),batch.targets());assert.deepEqual(batch.targets(),q.ships.filter(other=>other.teamId!==ship.teamId&&!other.hasVastBulk&&!other.isDead&&other.isVisibleTo(ship.teamId)&&!other.isCollisionless));batch.close();assert.equal(batch.forShip(ship,q.ships),undefined);}
 roster.close();assert.equal(roster.begin(engine.playerShip,q),undefined);
});

test('fresh transactions see dependency, phase, visibility, team, geometry and roster changes',()=>{
 const engine=world(api),q=queryWorld(engine),roster=api.FireControlQueryRoster.createAuthored(q.ships,engine),ship=engine.playerShip;
 const child=q.ships.find(s=>s.parentShip&&s.teamId!==ship.teamId),parent=child.parentShip,carrier=engine.fighters[0].sourceCarrier;
 const check=()=>{const b=roster.begin(ship,q);assert.ok(b);assert.deepEqual(b.targets(),q.ships.filter(s=>s.teamId!==ship.teamId&&!s.hasVastBulk&&!s.isDead&&s.isVisibleTo(ship.teamId)&&!s.isCollisionless));const result=b.targets();b.close();return result;};
 check();parent.isDocked=true;assert.ok(!check().includes(child));parent.isDocked=false;
 child.isDead=true;assert.ok(!check().includes(child));child.isDead=false;
 child.visibilityMask=0;assert.ok(!check().includes(child));child.visibilityMask=3;
 child.teamId=ship.teamId;assert.ok(!check().includes(child));child.teamId=1;
 parent.system.isActive=true;parent.system.effectLevel=.7;parent.flux.isVenting=true;carrier.flux.softFlux+=50;check();
 child.parentShip=null;check();child.parentShip=parent;
 q.ships.reverse();check();const old=q.ships[0];q.ships[0]=world(api).ships[0];check();q.ships[0]=old;
 const batch=roster.begin(ship,q);assert.ok(batch);batch.close();child.pos.x+=500;child.facingRad+=.8;child.shield.radius+=17;check();
 assert.equal(roster.begin(ship,{...q,ships:[...q.ships]}),undefined);roster.close();
});

test('live invalidators reject unknown readers, runtime effects, topology and unobserved dependencies',()=>{
 const engine=world(api),q=queryWorld(engine),roster=api.FireControlQueryRoster.createAuthored(q.ships,engine),ship=engine.playerShip;
 const secondaryOwner=q.ships.find(s=>s.systems.length>1),secondary=secondaryOwner.systems[1],craft=engine.fighters[0],child=q.ships.find(s=>s.parentShip);
 const attempt=(change,undo)=>{let b=roster.begin(ship,q);assert.ok(b);b.close();change();assert.equal(roster.begin(ship,q),undefined);undo();b=roster.begin(ship,q);assert.ok(b);b.close();};
 attempt(()=>ship.damageTakenModifiers.set('external',()=>1),()=>ship.damageTakenModifiers.clear());
 attempt(()=>ship.externalPhaseEffects.set('external',()=>1),()=>ship.externalPhaseEffects.clear());
 attempt(()=>ship.runtimeModifiers.set('seal',{collisionDisabled:1}),()=>ship.runtimeModifiers.clear());
 attempt(()=>ship.hullDamageInterceptors.add(()=>0),()=>ship.hullDamageInterceptors.clear());
 const definition=secondary.definition;attempt(()=>secondary.definition={...definition},()=>secondary.definition=definition);
 const next=secondary.auxiliary;attempt(()=>secondary.auxiliary=secondary,()=>secondary.auxiliary=next);
 const carrier=craft.sourceCarrier;attempt(()=>craft.sourceCarrier=world(api).capitalShips[0],()=>craft.sourceCarrier=carrier);
 const parent=child.parentShip;attempt(()=>child.parentShip=world(api).capitalShips[0],()=>child.parentShip=parent);
 const damage=ship.armor.damageTakenModifiers;attempt(()=>ship.armor.damageTakenModifiers=()=>({armor:1,hull:1}),()=>ship.armor.damageTakenModifiers=damage);
 const spec=ship.spec;attempt(()=>ship.spec={...spec},()=>ship.spec=spec);
 attempt(()=>Object.defineProperty(ship,'externalDamageTakenMultiplier',{value:1,configurable:true}),()=>delete ship.externalDamageTakenMultiplier);
 roster.close();
});

test('every mount keeps aim/preAim/fire decision and hidden tracker/RNG identical',async()=>{
 const aApi=await load(false,'mount-reference'),bApi=await load(true,'mount-candidate'),a=world(aApi),b=world(bApi);
 let compared=0;
 for(let step=0;step<3;step++){
  for(const engine of[a,b])if(step){for(const s of engine.capitalShips){s.aimTargetWorld.set(s.pos.x+1000,s.pos.y+500);s.flux.softFlux=s.flux.maxFlux*.2;for(const system of s.systems)system.activate();}if(step===2)engine.capitalShips.find(s=>s.childModules.length).flux.isVenting=true;}
  const aq=queryWorld(a),bq=queryWorld(b),roster=bApi.FireControlQueryRoster.createAuthored(bq.ships,b);
  for(let i=0;i<aq.ships.length;i++){
   const as=aq.ships[i],bs=bq.ships[i],batch=roster.begin(bs,bq);assert.ok(batch);const withBatch={...bq,queryBatch:batch};
   for(let m=0;m<as.weapons.length;m++){
    const ac=as.weaponControl.autofire,bc=bs.weaponControl.autofire,am=as.weapons[m],bm=bs.weapons[m];
    const aa=ac.aim(1/60,as,am,aq),ba=bc.aim(1/60,bs,bm,withBatch);
    const compact=x=>x?{target:[x.target.kind,x.target.entity.id],point:[x.point.x,x.point.y],delay:x.delay,speed:x.speed,range:x.range}:null;
    assert.deepEqual(compact(ba),compact(aa),as.id+'/'+am.slotId);
    assert.deepEqual(normalized(bc.preAim(bs,bm,withBatch)),normalized(ac.preAim(as,am,aq)));
    assert.equal(bc.decide(bs,bm,ba,withBatch,1/60),ac.decide(as,am,aa,aq,1/60));compared++;
   }
   batch.close();
  }
  roster.close();assert.deepEqual(hidden(b),hidden(a));assert.deepEqual(bApi.captureCombat(b,step,{},0),aApi.captureCombat(a,step,{},0));
 }
 fs.writeFileSync(path.join(out,'mount-comparison.json'),JSON.stringify({compared},null,2));
});

test('60 complete fixed steps match through activation, venting, close combat and bulkhead fallback',async()=>{
 const aApi=await load(false,'engine-reference'),bApi=await load(true,'engine-candidate'),a=world(aApi),b=world(bApi),hashes=[];
 let admitted=0,rejected=0,closed=0;
 const create=bApi.FireControlQueryBatch.create;bApi.FireControlQueryBatch.create=function(...args){const result=create.apply(this,args);if(result){admitted++;const close=result.close;result.close=function(){closed++;return close.call(this);};}else rejected++;return result;};
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
 assert.ok(admitted>0);assert.equal(closed,admitted);assert.ok(rejected>0,'bulkhead runtime fallback exercised');
 fs.writeFileSync(path.join(out,'whole-state-hashes.json'),JSON.stringify({steps:60,admitted,rejected,closed,hashes},null,2));
});

test('single pre-registered ABBA, 30 warmup + 60 measured fixed steps, no performance retries',async()=>{
 assert.equal(passed,5,'do not time an invalid candidate');const rows=[];
 for(const[index,enabled]of[false,true,true,false].entries()){
  const loaded=await load(enabled,'bench-'+index),engine=world(loaded);
  for(let tick=0;tick<30;tick++)engine.fixedUpdate(1/60);
  const phases={},trace={mark(phase){const now=performance.now();if(this.previous)phases[this.previous]=(phases[this.previous]??0)+now-this.at;this.previous=phase;this.at=now;}};
  const started=performance.now();for(let tick=0;tick<60;tick++){trace.previous=null;engine.fixedUpdate(1/60,{trace});}const elapsedMs=performance.now()-started;
  rows.push({index,enabled,elapsedMs,shipsWeaponsMs:phases.shipsWeapons,phases,stateSha256:sha(JSON.stringify(witness(loaded,engine,90)))});
  fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node fixed-step phases, NOT browser latency',rows},null,2));
 }
 assert.ok(rows.every(row=>row.stateSha256===rows[0].stateSha256));
 const gains=[1-rows[1].shipsWeaponsMs/rows[0].shipsWeaponsMs,1-rows[2].shipsWeaponsMs/rows[3].shipsWeaponsMs];
 const totalGains=[1-rows[1].elapsedMs/rows[0].elapsedMs,1-rows[2].elapsedMs/rows[3].elapsedMs];
 const pass=gains.every(g=>g>=.1)&&totalGains.every(g=>g>=-.05);
 fs.writeFileSync(path.join(out,'abba.json'),JSON.stringify({scope:'Node fixed-step phases, NOT browser latency',rows,gains,totalGains,passesPrescribedGate:pass},null,2));
 console.log(JSON.stringify({gains,totalGains,passesPrescribedGate:pass}));
});
