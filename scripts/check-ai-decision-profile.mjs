/** Run after artifacts/lan-ai-decision-profile-20260929/build.mjs. No live UI or user server. */
import assert from 'node:assert/strict';import fs from 'node:fs';
import {root,world,match,sha,witness,perturb} from '../artifacts/lan-ai-decision-profile-20260929/common.mjs';
import {replicaDigest} from '../artifacts/lan-ai-decision-profile-20260929/replica.mjs';
import {validAIDecisionProfile} from '../src/shared/ai-decision-profile.mjs';
const api=await import('../artifacts/lan-ai-decision-profile-20260929/observed-after.mjs');globalThis.__decisions=[];
const passed=[];function check(name,fn){fn();passed.push(name);console.log('ok '+name);}
function sampler(id='test'){
 const target={id:'enemy',teamId:1,isVisibleTo:()=>true};const ship={id,teamId:0,fireControlMode:'AI',tacticalAI:{},system:{tacticalMode:null},flux:{isVenting:false,isOverloaded:false},currentTargetShip:target};
 const ai=new api.CapitalShipAI(ship,target);return {ship,target,ai,roster:[ship,target],call:(dt=1/60,order=null)=>ai.sampleDecision(dt,order,[ship,target])};
}
check('profile enum fail-closed; undefined alone preserves legacy',()=>{for(const x of [undefined,'standard','large-battle-v1','large-battle-v3'])assert.ok(validAIDecisionProfile(x));for(const x of [null,0,false,{},[],'20hz','large-battle-v2'])assert.ok(!validAIDecisionProfile(x));});
check('20Hz stagger, elapsed-time conservation, deterministic phases, no catch-up burst',()=>{
 const totals=[];for(let n=0;n<9;n++){const f=sampler('ship-'+n),g=sampler('ship-'+n);let count=0,total=0;const schedule=[];
 for(let i=0;i<600;i++){const dt=f.call();assert.equal(dt,g.call());if(dt!==null){count++;total+=dt;schedule.push(i);}}
 assert.ok(count>=200&&count<=202, String(count));assert.ok(Math.abs(total+f.ai.decisionElapsed-10)<1e-10);totals.push(schedule[1]);}
 assert.equal(new Set(totals).size,3);
 const f=sampler();let total=0,elapsed=0;for(const dt of [1/120,1/120,1/30,.3,1/60,.7,1/60]){elapsed+=dt;const out=f.call(dt);if(out!==null)total+=out;}assert.ok(Math.abs(total+f.ai.decisionElapsed-elapsed)<1e-12);assert.ok(f.ai.decisionRemaining>0&&f.ai.decisionRemaining<=.05);
});
check('mutable orders, invalid targets, ownership and defense-state changes are immediate',()=>{
 for(const mutate of [f=>f.target.isDead=true,f=>f.target.isRetreated=true,f=>f.target.isDocked=true,f=>f.target.teamId=0,f=>f.target.isVisibleTo=()=>false,f=>f.ship.currentTargetShip={...f.target,id:'new'},f=>f.ship.flux.isVenting=true,f=>f.ship.flux.isOverloaded=true,f=>f.ship.system.tacticalMode='EXTRACT',f=>f.ship.fireControlMode='MANUAL',f=>f.ship.tacticalAI=undefined,f=>f.ship.isDocked=true]){const f=sampler();f.call();f.ai.decisionRemaining=.05;mutate(f);assert.notEqual(f.call(),null);}
 const f=sampler(),order={id:'x',type:'WAYPOINT',targetPos:{x:1,y:2},issuedTime:0};f.call(1/60,order);f.ai.decisionRemaining=.05;order.targetPos.x=20;assert.notEqual(f.call(1/60,order),null);f.ai.decisionRemaining=.05;assert.notEqual(f.ai.sampleDecision(1/60,order,[f.ship]),null);
 for(const dt of [0,-1,NaN,Infinity]){const q=sampler();assert.ok(Object.is(q.call(dt),dt));assert.equal(q.ai.decisionElapsed,0);}
});
await api.assetManager.ensureManifestLoaded();const engine=world(api,'large-battle-v1');
check('host freezes rule; human seat identity includes both teams, not isPlayer',()=>{
 assert.equal(engine.aiDecisionProfile,'large-battle-v1');assert.equal(engine.fullRateAIShipIds.size,2);assert.equal(engine.canPreviewNativeAI,false);
 assert.throws(()=>api.createLanWorld({...match,options:{...match.options,aiDecisionProfile:'bad'}}),/未知/);
});
const ordinary=engine.getNativeAIs().find(a=>!engine.fullRateAIShipIds.has(a.ship.assemblyRoot.id));assert.ok(ordinary);
const physical=[],systemSteps=[],oldUpdate=ordinary.ship.update,oldSystem=ordinary.ship.system.update;
ordinary.ship.update=function(dt,...args){physical.push(dt);return oldUpdate.call(this,dt,...args);};ordinary.ship.system.update=function(dt){systemSteps.push(dt);return oldSystem.call(this,dt);};
globalThis.__decisions=[];for(let i=0;i<60;i++)engine.fixedUpdate(1/60);const counts=new Map();for(const row of __decisions)counts.set(row.id,(counts.get(row.id)??0)+1);
check('actual 2-player/20-AI host: decisions reduced, physics/skill timers still 60 steps',()=>{
 assert.equal(physical.length,60);assert.ok(physical.every(dt=>Math.abs(dt-1/60)<1e-12));assert.equal(systemSteps.length,60);
 assert.ok(counts.get(ordinary.ship.id)>=20&&counts.get(ordinary.ship.id)<35,JSON.stringify([...counts]));
 for(const ship of engine.combatShips.filter(s=>s.parentShip&&engine.fullRateAIShipIds.has(s.assemblyRoot.id)))assert.equal(counts.get(ship.id),60,ship.id);
});ordinary.ship.update=oldUpdate;ordinary.ship.system.update=oldSystem;
check('human autopilot and unknown AI callbacks never throttled; dead ship clears held input',()=>{
 for(const id of engine.fullRateAIShipIds){const ship=engine.allCapitalShips.find(s=>s.id===id),ai=new api.CapitalShipAI(ship,engine.enemyShip);globalThis.__decisions=[];for(let i=0;i<6;i++)engine.updateShipAI(ai,1/60);assert.equal(__decisions.length,6);}
 const custom=new api.CapitalShipAI(ordinary.ship,engine.enemyShip);let n=0;custom.update=dt=>{assert.equal(dt,1/60);n++;};for(let i=0;i<6;i++)engine.updateShipAI(custom,1/60);assert.equal(n,6);
 ordinary.ship.isDead=true;ordinary.ship.throttle=1;engine.updateShipAI(ordinary,1/60);assert.equal(ordinary.ship.throttle,0);assert.equal(ordinary.ship.tacticalAI,undefined);
});
const observedCounts={ordinary:counts.get(ordinary.ship.id),physics:physical.length,skillTicks:systemSteps.length,allDecisions:[...counts.values()].reduce((a,b)=>a+b,0)};
// Fresh independent bundles: default remains exact; simplified rules remain deterministic.
const apis=await Promise.all(['before.mjs','after.mjs?default','after.mjs?reduced-1','after.mjs?reduced-2'].map(f=>import('../artifacts/lan-ai-decision-profile-20260929/'+f)));
const engines=[];for(let i=0;i<apis.length;i++){await apis[i].assetManager.ensureManifestLoaded();engines.push(world(apis[i],i>=2?'large-battle-v1':undefined));}
const replicas=[],hashes=[],bytes=[0,0,0,0];
for(let tick=1;tick<=60;tick++){
 const wires=[],states=[],receivers=[];
 for(let i=0;i<apis.length;i++){const a=apis[i],e=engines[i];perturb(e,tick);e.fixedUpdate(1/60);const wire=a.encodeProjectedBinaryFrame(a.pipelineFrame(tick),true);wires.push(Buffer.from(wire));bytes[i]+=wire.length;const decoded=a.decodeBinaryFrame(wire);
 if(replicas[i])a.applyLanDisplaySnapshot(replicas[i],decoded);else replicas[i]=a.createLanDisplayWorld(match,0,decoded).world;
 states.push(sha(JSON.stringify(witness(a,e,tick))));receivers.push(replicaDigest(a,replicas[i]));
 }
 for(const [a,b] of [[0,1],[2,3]]){assert.ok(wires[a].equals(wires[b]),'wire tick '+tick+' pair '+a);assert.equal(states[a],states[b],'authority/hidden tick '+tick);assert.deepEqual(receivers[a],receivers[b],'receiver tick '+tick);}
 hashes.push({tick,states,receivers});if(tick%20===0)console.log('five stages '+tick+'/60');
}
passed.push('60 perturbed steps: default exact wire/authority/hidden/receiver; simplified deterministic across independent worlds');
check('reinit resets rule, seat roster and decision clocks',()=>{const e=world(apis[1]);assert.equal(e.aiDecisionProfile,'standard');assert.equal(e.fullRateAIShipIds.size,2);for(const ai of e.getNativeAIs()){assert.equal(ai.decisionRemaining,-1);assert.equal(ai.decisionElapsed,0);}});
fs.writeFileSync(root+'/correctness.json',JSON.stringify({passed,observedCounts,bytes,hashes},null,2));console.log({passed:passed.length,observedCounts,bytes});

