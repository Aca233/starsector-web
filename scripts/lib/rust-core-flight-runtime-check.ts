import '../../src/engine/simulation/CombatEngine';
import {Ship} from '../../src/engine/simulation/Ship';
import {FighterSystem,type FighterFXCallbacks} from '../../src/engine/simulation/systems/FighterSystem';
import {ShipStepBatch} from '../../src/engine/simulation/ShipStepBatch';
import {SimulationRandom} from '../../src/engine/simulation/SimulationRandom';
import {originalCraft,originalWeapon} from '../../src/engine/content/OriginalDefaults';
import {modManager,type ShipSpec} from '../../src/engine/modding/ModManager';
import {Vector2} from '../../src/engine/math/Vector2';
import {captureCombatAudio} from '../../src/engine/audio/CombatAudioEvents';
import {findCombatHostile} from '../../src/engine/runtime/CombatHostileQuery';
import type {FireControlWorld} from '../../src/engine/ai/AutofireController';
import type {Projectile,WeaponMount} from '../../src/engine/simulation/Weapon';
type Exports=WebAssembly.Exports&{memory:WebAssembly.Memory;test_input(n:number):number;test_reset():number;test_step():number;test_queue():number;test_output_words():number;test_contracts():number;test_source_scope():number;test_missile():number};
const roles=['','web_ark_interceptor','web_ark_striker','web_gloriana_fury','web_gloriana_starhawk','web_gloriana_thunderhawk',''];
const modes=['ESCORT','ATTACK','INTERCEPT','DOGFIGHT','ATTACK_RUN','RETURN_TO_REARM','DOCKED'];
const flag=(s:Ship)=>2+Number(s.isDead)*16+Number(s.isRetreated)*32+Number(s.isDocked)*64;
function spec(role:number,carrier=false):ShipSpec{return {...originalCraft(),id:carrier?'carrier':`flight-owner-${role}`,nameKey:'flight-owner-spec',sourceHullId:carrier?undefined:roles[role]||undefined,
  spriteUrl:'/fixtures/flight-owner.png',hullSize:carrier?'FRIGATE':'FIGHTER',collisionRadius:carrier?90:30,bounds:[[-20,-20],[20,-20],[20,20],[-20,20]],maxFlux:!carrier&&role===8?0:500,
  weaponSlots:carrier?[]:[{slotId:'W1',x:-1,y:-8,baseAngleDeg:0,arcDeg:360,mountType:'TURRET',slotSize:'SMALL',defaultWeaponId:'flight-owner-pd'},{slotId:'W2',x:2,y:9,baseAngleDeg:0,arcDeg:360,mountType:'TURRET',slotSize:'SMALL',defaultWeaponId:'flight-owner-strike'}],
  defaultWeaponGroups:[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:carrier?[]:['W1','W2']}],
  engineSlots:carrier?[]:[{x:-20,y:-8,width:25,length:30,angleDeg:0,style:'LOW_TECH'},{x:-20,y:8,width:25,length:30,angleDeg:0,style:'LOW_TECH'}],
  ...(carrier?{fighterBays:2,fighterWings:[{specId:`flight-owner-${role}`,role:'FIGHTER',count:1,rebuildSeconds:.8,range:1800,tags:[]},{specId:`flight-owner-${role}`,role:'BOMBER',count:1,rebuildSeconds:.8,range:1800,tags:[]}]}:role===7?{moduleSlots:[{slotId:'CHILD',x:21,y:-9,angleDeg:.4*180/Math.PI}],modules:[{slotId:'CHILD',x:21,y:-9,angleDeg:.4*180/Math.PI,spec:{...spec(0),id:'flight-owner-child',moduleSlots:[{slotId:'GRANDCHILD',x:-8,y:2,angleDeg:.3*180/Math.PI}],modules:[{slotId:'GRANDCHILD',x:-8,y:2,angleDeg:.3*180/Math.PI,spec:{...spec(0),id:'flight-owner-grandchild',sourceHullTraits:['INDEPENDENT_ROTATION']}}]}}]}:{})};}
function health(m:WeaponMount,id:number){const t=m.healthTracker;return [id,0,0,m.relativePos.x,m.relativePos.y,m.health,m.maxHealth,+m.isDisabled,+m.isPermanentlyDisabled,m.disabledDuration,m.disabledTimer,+!!t,t?.repairDuration??0,t?.hitAgo??0,t?.interval??0,t?.elapsed??0,+!!t?.intervalElapsed,1,1,0];}
function mount(m:WeaponMount,id:number){const s=m.spec;return [id,1,0,0,s.refireDelay,s.chargeTime??0,s.burstDelay??0,0,0,+(s.maxAmmo!==undefined),s.maxAmmo??0,s.ammoRegenPerSec??0,s.minSpread||0,s.spreadDecay||5,0,
  m.currentAngleRad,m.cooldownTimer,m.ammo,m.ammoRechargeProgress,m.lifecycleDt??0,m.burstRemaining,m.burstTimer,+!!m.burstFluxReserved,['IDLE','CHARGING','ACTIVE','CHARGEDOWN'].indexOf(m.firingState),m.firingStateTimer,+m.triggerHeld,m.firingCycleId,m.reloadDelayRemaining??0,m.recoil,m.glowAlpha,m.barrelIndex,m.currentSpreadDeg,0,0,0,+(m.ammo===Infinity)];}
type PrivateShip={crShieldMalfunctionTimer:number;crShieldMalfunctionInterval:number;crShieldMalfunctionIntervalElapsed:boolean};
type PrivateFlight={carriers:Map<string,Ship>;reserveDeckUsed:Set<Ship>;reserveCraft:Map<Ship,number>;dockedReserve:Set<Ship>;recoveredCraft:Map<string,{timer:number;reserveRemaining?:number}[]>};
export async function checkRustFlightRuntime(bytes:BufferSource){
 const {instance}=await WebAssembly.instantiate(bytes,{}),e=instance.exports as Exports;let strict=0,geometry=0,maxDifference=0,steps=0,constructors=0,realShots=0,scenes=0,queueComparisons=0,restorationChecks=0,contractChecks=0;
 let random:SimulationRandom,visual:SimulationRandom,flights:FighterSystem,bodies:Ship[]=[],projectiles:Projectile[]=[],records:number[][]=[],handles=new Map<Ship,number>(),next=1,drones:Ship[]=[],expectedQueue:number[]=[],geometryMask:boolean[]=[],fieldLabels:string[]=[];
 const write=(row:number[])=>{const p=e.test_input(row.length);new Float64Array(e.memory.buffer,p,row.length).set(row);};
 const read=(p:number)=>Array.from(new Float64Array(e.memory.buffer,p,e.test_output_words()));
 const handle=(s:Ship|undefined|null)=>s?handles.get(s)??0:0;
 const track=()=>{const register=(s:Ship,tree:number[])=>{handles.set(s,next++);bodies.push(s);tree.push(handle(s));constructors++;for(const c of s.childModules)register(c,tree);};for(const s of [...flights.fighters,...flights.bombers])if(!handles.has(s)){const tree:number[]=[];register(s,tree);records.push([0,tree.length,...tree]);}};
 const cmp=(a:number,b:number,label:string,geo=false)=>{if(geo){geometry++;const d=Math.abs(a-b);if(!Object.is(a,b)&&(!Number.isFinite(a)||!Number.isFinite(b)||d>Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)))))throw Error(`${label}: ${a} differs from ${b}`);maxDifference=Math.max(maxDifference,d||0);}else{strict++;if(!Object.is(a,b))throw Error(`${label}: ${a} differs from ${b}`);}};
 const snapshot=()=>{const out:number[]=[];geometryMask=[];fieldLabels=[];let domain='world';const add=(row:number[],geo:number[]=[],part='')=>(row.forEach((n,i)=>{out.push(n);geometryMask.push(geo.includes(i));fieldLabels.push(`${domain}${part?'/'+part:''}[${i}]`);}));
  add([0,random.checkpointWitness()[1],random.checkpointWitness()[2],visual.checkpointWitness()[1],bodies.length,projectiles.length,next]);
  for(const s of bodies){domain=s.id;const privateShip=s as unknown as PrivateShip;add([handle(s),1,flag(s),s.hullHp,s.flux.softFlux,s.flux.hardFlux,handle(s.sourceCarrier),+s.fighterRecall],[],'resources');
   add([s.pos.x,s.pos.y,s.vel.x,s.vel.y,s.facingRad,s.angularVelRad,s.prevPos.x,s.prevPos.y],[0,1,2,3,4,5,6,7]);add([s.turnInput,+s.brakeInput,s.throttle,s.strafeInput,s.aimTargetWorld.x,s.aimTargetWorld.y,+s.isFiringMain,+!!s.aiHoldOffensiveFire,handle(s.currentTargetShip),+(s.fireControlMode==='AI'),+s.shield.isActive],[0,2,3,4,5]);
   add([s.currentCR,s.crAtDeployment??-1,s.peakPerformanceRemaining,privateShip.crShieldMalfunctionTimer,privateShip.crShieldMalfunctionInterval,+privateShip.crShieldMalfunctionIntervalElapsed,+s.justShieldMalfunction,+!!s.lowCRDamageSequence]);
   add([s.weapons.length]);s.weapons.forEach((m,i)=>add(health(m,i+1),[],`${m.slotId}/health`));s.weapons.forEach((m,i)=>add(mount(m,i+1),[15],`${m.slotId}/mount`));add([s.weaponGroups.length]);for(const g of s.weaponGroups)add([g.index,+(g.mode==='ALTERNATING'),+g.isAutofire,g.alternatingIndex,+(g.alternatingElapsed!==undefined),g.alternatingElapsed??0,+(g.alternatingWasFiring!==undefined),+!!g.alternatingWasFiring,+(g.alternatingJustSwitched!==undefined),+!!g.alternatingJustSwitched,g.weaponSlotIds.length]);
   add([s.engineStatuses.length]);s.engineStatuses.forEach((eng,i)=>{const slot=s.spec.engineSlots[i],t=eng.healthTracker;add([i,slot.x,slot.y,slot.width,slot.length,+!!slot.systemActivated,+!!slot.maneuver,...(slot.maneuver??[0,0,0]),eng.health,eng.maxHealth,+eng.isDisabled,+eng.isPermanentlyDisabled,t.repairDuration,t.hitAgo,t.interval,t.elapsed,+t.intervalElapsed,eng.contribution,eng.driftContribution,+eng.temporaryMalfunction,+eng.glowDisabled,eng.currentThrust,eng.prevThrust,eng.spread,eng.prevSpread],[20,23,24,25,26]);});add([s.armor.cells.length,...s.armor.cells]);
  }
  for(const p of projectiles)add([handle(bodies.find(s=>s.id===p.sourceShipId)),Number(p.slotId?.slice(1)),(p as Projectile&{firingCycleId?:number}).firingCycleId??0,p.id,p.damage,p.empDamage??0,p.pos.x,p.pos.y,p.vel.x,p.vel.y,p.facingRad??0,p.rangeRemaining],[6,7,8,9,10]);
  for(const list of [flights.fighters,flights.bombers])add([list.length,...list.map(handle)]);for(const list of [flights.fighterAIModes,flights.bomberAIModes]){add([list.size]);for(const [name,m]of list)add([handle(bodies.find(s=>s.id===name)),modes.indexOf(m.state),m.timer,handle(bodies.find(s=>s.id===('targetUnitId'in m?m.targetUnitId:undefined))),'hasTorpedo'in m?+m.hasTorpedo:1]);}
  add([records.length]);for(const r of records)add(r,r[0]===3?[2,3,4,5]:[]);
  domain='flight';const privateFlight=flights as unknown as PrivateFlight;const string=(s:string)=>add([s.length,...s.split('').map(c=>c.charCodeAt(0))]);
  for(const wings of [flights.playerWings,flights.enemyWings]){add([wings.length]);for(const w of wings){string(w.wingId);string(w.name);string(w.specId);add([handle(bodies.find(s=>s.id===w.carrierId)),+(w.role==='BOMBER'),+w.isPlayer,w.teamId??(w.isPlayer?0:1),w.maxCrafts,w.crr,+(w.rebuildSeconds!==undefined),w.rebuildSeconds??0,+(w.range!==undefined),w.range??0,(w.tags??[]).length]);for(const tag of w.tags??[])string(tag);add([w.rebuildQueue.length]);for(const item of w.rebuildQueue){string(item.craftId);add([item.timer,item.maxTimer]);}const recovered=privateFlight.recoveredCraft.get(w.wingId)??[];add([recovered.length]);for(const item of recovered)add([item.timer,+(item.reserveRemaining!==undefined),item.reserveRemaining??0]);}}
  for(const list of [[...privateFlight.carriers.values()],[...privateFlight.reserveDeckUsed],[...privateFlight.dockedReserve]])add([list.length,...list.map(handle)]);add([privateFlight.reserveCraft.size]);for(const [craft,left]of privateFlight.reserveCraft)add([handle(craft),left]);
  for(const s of bodies){string(s.flightDeckWingId??'');add([s.deployedWingCraft.size,...[...s.deployedWingCraft].map(handle)]);}return out;
 };
 const compare=(p:number,label:string)=>{track();const actual=read(p),expected=snapshot();cmp(actual.length,expected.length,label+' width');actual.forEach((n,i)=>cmp(n,expected[i],`${label} field ${i} ${fieldLabels[i]}`,geometryMask[i]));steps++;};
 const fx:FighterFXCallbacks={spawnContrail:c=>{const s=bodies.find(s=>s.engineStatuses.length&&s.spec.engineSlots.some(slot=>s.pos.clone().add(new Vector2(slot.x,slot.y).rotate(s.facingRad)).distanceTo(c.pos)<1e-8));records.push([3,handle(s),c.pos.x,c.pos.y,c.vel.x,c.vel.y,c.life,c.maxLife,c.size,c.maxSize,c.alpha,c.rotation]);},spawnAuthenticExplosion:()=>{},spawnDebris:()=>{},addCameraShake:()=>{},addFloatingText:(p,text)=>{const s=bodies.find(s=>s.pos===p);if(text==='PAYLOAD AWAY - RETURNING')records.push([2,handle(s),2]);if(text==='REARMED & LAUNCHING')records.push([2,handle(s),1]);},addRadioMessage:()=>{},getOrder:()=>undefined,cancelOrder:()=>{},getPlayerPos:()=>bodies[0].pos,
  findHostile:(s,target)=>findCombatHostile(s,target,[...bodies.slice(0,2),...flights.fighters,...flights.bombers,...drones]),recordFighterRebuilt:()=>{track();records.push([2,next-1,0]);},destructionSideEffectsEnabled:()=>true,handleShipDestruction:()=>{throw Error('Unexpected lethal source oracle fixture');}};
 const physical=(dt:number,execute=true,missiles:Projectile[]=[])=>{const batch=new ShipStepBatch(),initial=[...bodies.slice(0,2),...flights.fighters,...flights.bombers,...drones];const spawn=(p:Projectile)=>{projectiles.push(p);realShots++;};const world={ships:initial,missiles,asteroids:[],shipStepBatch:batch}as FireControlWorld;
  for(const ship of bodies.slice(0,2))ship.update(dt,null,spawn,()=>{throw Error('Unexpected beam');},()=>{},world);
  flights.updateDecks(dt,bodies[0],bodies[1],fx);track();const wingShips=[...bodies.slice(0,2),...flights.fighters,...flights.bombers,...drones];const wingWorld={ships:wingShips,missiles,asteroids:[],shipStepBatch:batch}as FireControlWorld;
  flights.updateFighters(dt,bodies[0],bodies[1],missiles,spawn,()=>{},()=>{},fx,wingWorld);flights.updateBombers(dt,bodies[0],bodies[1],spawn,()=>{},()=>{},fx,wingWorld);
  const entries=(batch as unknown as {entries:{ship:Ship;args:Parameters<Ship['update']>}[]}).entries;
  expectedQueue=[execute?0:1,entries.length];for(const {ship,args}of entries){const scope=args[5]!;expectedQueue.push(handle(ship),args[0],handle(args[1]),scope.ships.length,...scope.ships.map(handle),scope===wingWorld||scope===world?0:1,scope===wingWorld||scope===world?0:scope.missiles[0]?1:0);}
  if(execute)batch.execute(()=>{});
 };
 const checkQueue=()=>{write([]);const q=read(e.test_queue());cmp(q.length,expectedQueue.length,'source queue width');q.forEach((n,i)=>cmp(n,expectedQueue[i],'ordered source queue '+i));queueComparisons++;};
 const reset=(role:number,seed:number)=>{scenes++;records=[];bodies=[];drones=[];projectiles=[];handles=new Map();next=1;random=new SimulationRandom(seed);visual=new SimulationRandom(1757);flights=new FighterSystem(random,visual);
  const template=spec(role);if(role!==8)modManager.registerShip(template,{allowExistingId:true,requireBundledAssets:false});const carrier=spec(role,true);for(const [name,player,pos,facing]of [['carrier',true,new Vector2(),.17],['enemy',false,new Vector2(650,80),Math.PI]]as const){const s=new Ship(name,carrier,player,pos,facing,random,visual);s.fireControlMode='MANUAL';handles.set(s,next++);bodies.push(s);records.push([0,1,handle(s)]);constructors++;}
  if(role===8){const s=new Ship('zero-flux',template,true,new Vector2(),.17,random,visual);handles.set(s,next++);bodies.push(s);records.push([0,1,handle(s)]);constructors++;}else{flights.init(bodies[0]);track();}write([role,seed]);compare(e.test_reset(),`constructor ${role}`);
 };
 const stop=captureCombatAudio(()=>{});try{
  for(const pd of [true,false])modManager.registerWeapon({...originalWeapon(),id:pd?'flight-owner-pd':'flight-owner-strike',nameKey:'flight-owner-spec',isPointDefense:pd,aiHints:pd?[]:['STRIKE'],damagePerShot:3,fluxPerShot:7,range:1500,refireDelay:.3,chargeTime:.07,maxAmmo:pd?undefined:4});
  for(let role=0;role<7;role++){reset(role,821+role);if(role>=3&&role<=5){records=[];physical(1/60,false);write([9,1/60]);compare(e.test_step(),'actual special role scoped queue '+role);checkQueue();continue;}for(let tick=0;tick<36;tick++){records=[];physical(1/60);write([0,1/60]);compare(e.test_step(),'production flight runtime '+role+'/'+tick);checkQueue();}
   records=[];flights.toggleRecall(bodies[0]);write([3]);compare(e.test_step(),'paused recall command');
   const recovered=flights.fighters[0];records=[];flights.recoverWingCraft(bodies[0],recovered);records.push([1,handle(recovered),0]);write([4,handle(recovered)]);compare(e.test_step(),'recover keeps actual generation witness');
   records=[];physical(.8,false);write([9,.8]);compare(e.test_step(),'replacement born after ordinary capture enters wing queue');checkQueue();
   records=[];flights.deployReserveWing(bodies[0]);track();write([6]);compare(e.test_step(),'paused reserve deployment uses actual admission');
   // A fresh scenario executes physical reserve receipts without recovered
   // witnesses; the current shared planner still needs root's queued-owner API.
   reset(role,9821+role);records=[];flights.deployReserveWing(bodies[0]);track();write([6]);compare(e.test_step(),'fresh real reserve deployment');
   records=[];physical(1/120);write([0,1/120]);compare(e.test_step(),'all reserve craft actual next queue');checkQueue();
   const detached=flights.fighters[0];records=[];if(!flights.detachWingCraft(bodies[0],detached))throw Error('actual detach unexpectedly rejected');drones.push(detached);records.push([1,handle(detached),1]);write([8,handle(detached)]);compare(e.test_step(),'detach transfers to ordinary drone roster');
  }
  reset(0,77182);const capture=snapshot();write([10]);compare(e.test_step(),'complete resident clone capture');
  records=[];physical(1/60);write([0,1/60]);compare(e.test_step(),'continuation before restore');const continuation=snapshot();
  write([11]);const restored=read(e.test_step());restored.forEach((n,i)=>cmp(n,capture[i],'whole snapshot restore '+i,geometryMask[i]));
  write([0,1/60]);const repeated=read(e.test_step());repeated.forEach((n,i)=>cmp(n,continuation[i],'clone continuation '+i,geometryMask[i]));restorationChecks++;
  reset(0,91823);write([]);contractChecks=read(e.test_contracts())[0];if(contractChecks!==13)throw Error('flight contract count');
  reset(3,19921);const missile={id:.777,pos:new Vector2(300,0),prevPos:new Vector2(300,0),vel:new Vector2(-200,0),damage:10,damageType:'ENERGY',sourceShipId:'enemy',isPlayer:false,teamId:1,rangeRemaining:2000,projectileLength:0,fadeTime:.3,width:5,color:[100,100,100],spawnType:'MISSILE',isRocket:true,isGuided:false,radius:5,hitpoints:100,isFlare:false,isFighterDecoy:false,collisionDisabled:false,didDamage:false}as unknown as Projectile;
  write([]);e.test_missile();records=[];physical(1/60,false,[missile]);write([9,1/60]);e.test_step();checkQueue();
  if(!expectedQueue.includes(1))throw Error('selected missile was not captured');
 }finally{stop();}
 return {passed:true,scenes,steps,constructors,realShots,queueComparisons,restorationChecks,contractChecks,strictFields:strict,geometryFields:geometry,maxGeometryDifference:maxDifference,productionIntegrated:false,fullBattleReady:false,limitations:['Actual full physical/fire/receipt comparison covers ordinary and Ark roles; special Gloriana roles, selected missile and recovered replacements are compared through their real queued decision barrier.','Readiness consumes each actual queue entry ship scope. Shared query/commit still requires queued owners and exact per-owner missile permissions; the previous all-Bodies planner incorrectly advances docked witnesses.','Core must consume actual terrain, complete authored metadata admission, source drone rules and complete UI/ABI snapshot.']};
}
