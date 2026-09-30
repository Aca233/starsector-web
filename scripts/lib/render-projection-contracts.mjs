import {checkDecoderWorklist} from './presentation-decoder-worklist-contracts.mjs';
import {checkPresentationHudReads} from './presentation-hud-read-contracts.mjs';
import {checkPackedVisualSlots} from './packed-visual-slot-contracts.mjs';
import {checkPresentationOwnedScalars} from './presentation-owned-scalar-contracts.mjs';
import {checkPresentationDecoderPlans} from './presentation-decoder-plan-contracts.mjs';
import {checkPresentationIdentities} from './presentation-identity-contracts.mjs';
import {checkPresentationRows} from './presentation-row-contracts.mjs';
import {checkPresentationShapes} from './presentation-shape-contracts.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function checkRenderProjection(api, output) {
const fields={"shipFields":["id","spec","pos","prevPos","vel","facingRad","prevFacingRad","angularVelRad","hullHp","isDead","isDocked","isRetreated","isAttachedModule","teamId","playerTargetId","visibilityMask","visibilityOverflow","phaseGhosts","phaseVisualAlpha","engineBoostLevel","prevEngineBoostLevel","scorchMarks","scorchMarkVersion","selectedGroupIndex"],"shield":["facingAngleRad","hitSegmentLevels","isPhaseEngaged","isVisuallyDeployed","phaseCooldownLevel","phaseEffectLevel","phaseState","radius","renderArcRad","type","visualAlpha"],"system":["activationSerial","available","disabled","effectLevel","fortressVisualLevel","isActive","state","teleportVisual","type"],"flux":["fluxPercent","hardFlux","hullSize","isOverloaded","isVenting","maxFlux","overloadTimer"],"weapons":["arcDeg","baseAngleDeg","currentAngleRad","currentSpreadDeg","glowAlpha","isDisabled","mountType","recoil","relativePos","slotId","spec"]};
const {LocalCombatKernel,CombatPresentationEncoder,CombatPresentationDecoder,ProjectedRenderShip,renderWeaponRange,renderPulseOffset,collectCombatTextureUrls,activeSystemVisuals,systemTeleportCopies,systemEngineVisual,getDamageGlowRevision,hasHotDamageGlow,Vector2,setShipPresentationPose}=api;
const renderFields={"specFields":["id","spawnType","isRocket","isBeam","hardpointUsesHullSprite","turretSpriteUrl","hardpointSpriteUrl","hardpointGunSpriteUrl","turretGunSpriteUrl","glowSpriteUrl","hardpointGlowSpriteUrl","mountSize","visualRecoil","renderBarrelBelow","weaponType","glowColor","animationType","projSpeed","projSpriteUrl","beamEffect","onHitEffect","everyFrameEffect"],"childFields":["onHitEffect","turretSpriteUrl","turretGunSpriteUrl","hardpointSpriteUrl","hardpointGunSpriteUrl","glowSpriteUrl","hardpointGlowSpriteUrl","projSpriteUrl"],"engineFields":["prevThrust","currentThrust","prevSpread","spread"]};
const specRead=s=>({...pick(s,renderFields.specFields),mirv:s.mirv?{childProjectile:s.mirv.childProjectile?pick(s.mirv.childProjectile,renderFields.childFields):s.mirv.childProjectile}:s.mirv});
const pick=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o[k]]));
function normalize(o,seen=new Set()) {
 if(typeof o!=='object'||o===null)return o;
 if(seen.has(o))throw Error('Unexpected read cycle');seen.add(o);let v;
 if(ArrayBuffer.isView(o))v=Array.from(o);
 else if(Array.isArray(o))v=o.map(x=>normalize(x,seen));
 else if(o instanceof Map)v=[...o].map(([k,v])=>[normalize(k,seen),normalize(v,seen)]);
 else if(o instanceof Set)v=[...o].map(x=>normalize(x,seen));
 else v=Object.fromEntries(Object.keys(o).sort().map(k=>[k,normalize(o[k],seen)]));
 seen.delete(o);return v;
}
function shipRead(s){return normalize({
 ...pick(s,fields.shipFields),shield:pick(s.shield,fields.shield),flux:pick(s.flux,fields.flux),armor:s.armor.cellWidth,
 engineController:s.engineController.flameAccelerating,engineStatuses:s.engineStatuses.map(e=>pick(e,renderFields.engineFields)),weapons:s.weapons.map(m=>({...pick(m,fields.weapons),spec:specRead(m.spec),range:renderWeaponRange(s,m),angle:api.renderWeaponAngle(m,s.facingRad)})),
 weaponGroups:s.weaponGroups,systems:s.allSystems.map(x=>({...pick(x,fields.system),visuals:x.definition.visuals,pulse:renderPulseOffset(x)})),
 carrier:s.sourceCarrier?.id,poses:[0,.3,1].map(a=>[s.interpolatedPos(a),s.interpolatedFacing(a),s.getShieldCenter(s.interpolatedPos(a),s.interpolatedFacing(a))]),
 visible:[true,false,0,1,2,30,31,40,77].map(t=>s.isVisibleTo(t)),
 active:activeSystemVisuals(s).map(x=>[x.system.type,x.profile,x.level]),teleports:systemTeleportCopies(s),engines:systemEngineVisual(s),damage:getDamageGlowRevision(s),hot:hasHotDamageGlow(s)
 });}
function state(v, seen=new Map()) {
 if(typeof v==='function')return '[fn]';if(v===undefined)return '[undefined]';
 if(typeof v==='number')return Object.is(v,-0)?'[-0]':Number.isFinite(v)?v:'['+v+']';
 if(!v||typeof v!=='object')return v;if(seen.has(v))return ['ref',seen.get(v)];seen.set(v,seen.size);
 if(ArrayBuffer.isView(v))return [v.constructor.name,...v].map(x=>state(x,seen));
 if(v instanceof Map)return ['Map',[...v].map(([k,x])=>[state(k,seen),state(x,seen)])];
 if(v instanceof Set)return ['Set',[...v].map(x=>state(x,seen))];if(Array.isArray(v))return v.map(x=>state(x,seen));
 return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,state(x,seen)]));
}
let checks=0;const reports=[];
const sample=t=>({autopilot:t%30<15,blocked:t%60>=50,keys:{KeyW:true,KeyD:t%20<10},aim:[300,-600],firing:true,mouseSteering:true,pointerActive:true});
for(const [playerHull,enemyHull] of [['onslaught','onslaught'],['odyssey','paragon'],['doom','harbinger'],['astral','sunder'],['retribution','paragon'],['station1','paragon']]){
 const k=new LocalCombatKernel({playerHull,enemyHull,seed:3534,multicore:false}),a=new CombatPresentationEncoder(1),b=new CombatPresentationEncoder(1,'render'),da=new CombatPresentationDecoder(1),db=new CombatPresentationDecoder(1);
 let stable,stats={scenario:playerHull,full:0,render:0};
 for(let t=0;t<=120;t++){
  if(t===0||t===30||t===60){k.command({kind:'ship',command:{kind:'shield'}});k.command({kind:'ship',command:{kind:'system'}});}
  if(t)k.step(sample(t));
  if(t%10)continue;
  const p=a.capture(k.engine,k.tick);
  const prior=JSON.stringify(state(k));
  const q=b.capture(k.engine,k.tick),v=da.apply(structuredClone(p)),w=db.apply(structuredClone(q));
  const now=JSON.stringify(state(k));if(now!==prior){fs.writeFileSync(output+'.before.json',prior);fs.writeFileSync(output+'.after.json',now);throw Error('Authority drift: '+output);}checks++;
  stats.full+=p.length*8+p.visuals.length*8;stats.render+=q.length*8+q.visuals.length*8;
  assert.equal(v.view.ships.length,w.view.ships.length);checks++;
  const projected=w.view.playerShip instanceof ProjectedRenderShip;
  assert(projected,'Display-only projection required');checks++;
  for(let i=0;i<w.view.ships.length;i++){
   assert(w.view.ships[i] instanceof ProjectedRenderShip);assert.equal('applyHullDamage' in w.view.ships[i],false);
   assert.deepEqual(shipRead(w.view.ships[i]),shipRead(k.engine.ships[i]),`${playerHull}/${t}/${i}`);checks+=3;
  }
  assert.deepEqual(collectCombatTextureUrls(w.view),collectCombatTextureUrls(v.view));checks++;
  assert.deepEqual(normalize(w.hud),normalize(v.hud));checks++;
  if(stable && Object.getPrototypeOf(stable)===Object.getPrototypeOf(w.view.playerShip))assert.equal(stable,w.view.playerShip);stable=w.view.playerShip;checks++;
 }
 reports.push(stats);k.dispose();
}
// Strict presentation is an explicitly negotiated contract, never a native graph fallback.
{
 const same=(a,b)=>{assert.equal(a,b);checks++;};
 const rejects=(fn,pattern)=>{assert.throws(fn,pattern);checks++;};
 rejects(()=>new CombatPresentationDecoder(0,'render-strict'),/epoch/);
 const k=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:994,multicore:false,presentation:'render-strict'});
 const encoder=new CombatPresentationEncoder(901,'render-strict'),decoder=new CombatPresentationDecoder(901,'render-strict');
 const baseline=encoder.capture(k.engine,0),first=decoder.apply(structuredClone(baseline)),ship=first.view.playerShip;
 same(ship instanceof ProjectedRenderShip,true);same(first.view.enemyShip instanceof ProjectedRenderShip,true);
 assert.deepEqual(shipRead(ship),shipRead(k.engine.playerShip));checks++;
 const compatibility=new CombatPresentationDecoder(902).apply(new CombatPresentationEncoder(902).capture(k.engine,0));
 assert.deepEqual(normalize(first.hud),normalize(compatibility.hud));checks++;
 rejects(()=>decoder.apply(structuredClone(baseline)),/stale/);
 k.step(sample(1));k.engine.playerShip.hullHp-=7;
 const next=encoder.capture(k.engine,k.tick),before=state(first);
 // All native simulation prototype IDs are forbidden, including unused shapes.
 for(let type=1;type<=9;type++){
  const bad=structuredClone(next);bad.shapes.push({type,keys:[]});
  rejects(()=>decoder.apply(bad),/Simulation class/);
  assert.deepEqual(state(first),before);checks++;
 }
 const executable=structuredClone(next),data=new Float64Array(executable.buffer,0,executable.length);
 same(data[0],6);same(data[2],data[1]);same(data[3],0);
 same(executable.shapes[data[4]].type,0);same(executable.shapes[data[4]].keys[0],'view');
 data[5]=8;data[6]=executable.strings.push(k.engine.playerShip.system.type)-1;
 rejects(()=>decoder.apply(executable),/Executable system definition/);
 assert.deepEqual(state(first),before);checks++;
 for(const bad of [{...next,revision:next.revision+1},{...next,epoch:903}]){
  rejects(()=>decoder.apply(bad),/stale/);assert.deepEqual(state(first),before);checks++;
 }
 const second=decoder.apply(structuredClone(next));same(second.view.playerShip,ship);
 same(ship.hullHp,k.engine.playerShip.hullHp);
 assert.deepEqual(shipRead(ship),shipRead(k.engine.playerShip));checks++;
 // A fresh full epoch is required after losing a revision; no history is reused.
 const fresh=new CombatPresentationEncoder(903,'render-strict').capture(k.engine,k.tick);
 const recovered=new CombatPresentationDecoder(903,'render-strict').apply(structuredClone(fresh));
 assert.deepEqual(shipRead(recovered.view.playerShip),shipRead(ship));checks++;
 same(recovered.view.playerShip===ship,false);
 const plainRoots=structuredClone(fresh);let projectedShapes=0;
 for(const shape of plainRoots.shapes)if(shape.type===11){shape.type=0;projectedShapes++;}
 assert(projectedShapes>0);checks++;
 rejects(()=>new CombatPresentationDecoder(903,'render-strict').apply(plainRoots),/Missing strict projected ship root/);
 // Unsupported hooks must not be invoked, or change a strict epoch to compatibility.
 const source=k.engine.playerShip,original=source.system.getWeaponRangePercent;let calls=0;
 source.system.getWeaponRangePercent=()=>{calls++;return 42;};
 const unsupported=new CombatPresentationEncoder(904,'render-strict');
 rejects(()=>unsupported.capture(k.engine,k.tick),/authority-side presentation adapter/);same(calls,0);
 source.system.getWeaponRangePercent=original;
 rejects(()=>unsupported.capture(k.engine,k.tick),/encoder failed/);same(calls,0);
 same(new CombatPresentationDecoder(905,'render-strict').apply(new CombatPresentationEncoder(905,'render-strict').capture(k.engine,k.tick)).view.playerShip instanceof ProjectedRenderShip,true);
 // The former non-strict name is now a display-only alias, never a fallback.
 source.externalPhaseEffects.set({},()=>.5);
 rejects(()=>new CombatPresentationEncoder(906,'render').capture(k.engine,k.tick),/authority-side presentation adapter/);
 k.dispose();reports.push({scenario:'render-strict',contract:'no-simulation-prototypes-or-executable-system-definitions'});
}
// Tactical map data is standalone, observing-team filtered, immutable and optional when closed.
{
 const same=(a,b)=>{assert.equal(a,b);checks++;};
 const k=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:90,multicore:false,additionalShips:[
  {hull:'wolf',isPlayer:true,position:[150,0],facing:0},{hull:'wolf',isPlayer:false,position:[300,0],facing:0},
 ]});
 const e=k.engine,[reserve,other]=e.reinforcements;
 e.deployment.configure(e.allCapitalShips,new Set([e.playerShip.id,e.enemyShip.id,other.id]),100);
 const projector=new api.TacticalMapViewProjector();
 Object.defineProperty(e,'ships',{get(){throw Error('Closed map must not scan combat');},configurable:true});
 same(projector.capture(e,1).map,null);delete e.ships;
 e.isTacticalMap=true;e.playerShip.pos.set(0,0);e.enemyShip.pos.set(200,0);
 e.orders.set(e.playerShip.id,{id:'map-order',type:'ENGAGE',targetShipId:e.enemyShip.id,issuedTime:2.5});
 const before=JSON.stringify(state(e)),initial=projector.capture(e,1),map=initial.map;
 same(projector.capture(e,1),initial);same(map.playerShip instanceof api.Ship,false);same('getCell' in map.playerShip.armor,false);
 same(Object.isFrozen(map.playerShip.armor.cells),true);same(Object.isFrozen(map.playerShip.pos),true);
 same(Reflect.set(map.playerShip.pos,'x',999),false);same(Reflect.set(map.playerShip.armor.cells,'0',-100),false);same(JSON.stringify(state(e)),before);
 same(map.capitalShips.some(ship=>ship.id===reserve.id),false);same(map.deployedCount,e.deployment.used(e.playerShip.teamId));
 same(map.targetPositions[e.enemyShip.id].x,200);same(map.orders[e.playerShip.id].issuedTime,2.5);
 same(map.observers.length,api.combatObservers(e.ships,e.playerShip.teamId).length);
 const compare=()=>{
  const view=projector.capture(e,1).map,observers=api.combatObservers(e.ships,e.playerShip.teamId);
  assert.deepEqual(view.capitalShips.map(s=>s.id),e.capitalShips.filter(s=>api.contactVisible(s,observers,e.playerShip.teamId,e.openBattlefield)).map(s=>s.id));checks++;
  assert.deepEqual(view.fighters.map(s=>s.id),[...e.fighters,...e.bombers].filter(s=>api.contactVisible(s,observers,e.playerShip.teamId,e.openBattlefield)).map(s=>s.id));checks++;
  return view;
 };
 compare();e.enemyShip.pos.set(100000,100000);same(compare().targetPositions[e.enemyShip.id],undefined);
 for(const flag of ['isDocked','isRetreated','isDead']){other[flag]=true;same(compare().capitalShips.some(s=>s.id===other.id),false);other[flag]=false;}
 e.openBattlefield=true;same(compare().targetPositions[e.enemyShip.id].x,100000);
 e.playerShip.teamId=4;other.teamId=7;e.multiTeamBattle=true;same(compare().playerShip.teamId,4);
 e.openBattlefield=false;
 for(const ship of e.ships.filter(s=>s.teamId===4))ship.isDead=true;
 same(compare().observers.length,0);same(compare().capitalShips.some(s=>s.teamId!==4),false);
 e.playerShip.isDead=false;e.playerShip.currentCR=.23;e.playerShip.armor.cells[0]=12.5;e.playerShip.flux.hardFlux=123;
 const changed=compare();same(changed.playerShip.currentCR,.23);same(changed.playerShip.armor.cells[0],12.5);same(changed.playerShip.flux.hardFlux,123);
 same(map.playerShip.armor.cells[0]===12.5,false);
 const encoder=new CombatPresentationEncoder(1,'render'),decoder=new CombatPresentationDecoder(1);
 const published=api.copyTacticalMapSnapshot(decoder.apply(structuredClone(encoder.capture(e,k.tick))).hud.map);
 assert.deepEqual(published.map,changed);checks++;
 e.playerShip.armor.cells[0]=6;e.commandPoints=2;
 const updated=api.copyTacticalMapSnapshot(decoder.apply(structuredClone(encoder.capture(e,k.tick))).hud.map,published);
 same(updated.map.playerShip.armor.cells[0],6);same(published.map.playerShip.armor.cells[0],12.5);same(updated.map.commandPoints,2);
 same(api.copyTacticalMapSnapshot(decoder.apply(structuredClone(encoder.capture(e,k.tick))).hud.map,updated),updated);
 same(projector.capture(e,2).generation,initial.generation+1);
 e.isTacticalMap=false;same(projector.capture(e,2).map,null);same(projector.capture(e,2,false).available,false);k.dispose();
 const session=new api.CombatSession('onslaught','paragon',91);same(session.tacticalMapView.read().map,null);
 session.dispatchControl({kind:'toggle-map'});same(session.tacticalMapView.read().map.playerShip.id,session.engine.playerShip.id);
 session.dispatchControl({kind:'tactical',command:{action:'close'}});same(session.tacticalMapView.read().map,null);session.dispose();same(session.tacticalMapView.read().available,false);
}
// Deployment reads are detached, share immutable fitted definitions, and survive graph deltas.
{
 const same=(a,b)=>{assert.equal(a,b);checks++;};
 const k=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:84,multicore:false,additionalShips:[
  {hull:'wolf',isPlayer:true,position:[0,0],facing:0},{hull:'wolf',isPlayer:false,position:[0,0],facing:0},
 ]});
 const e=k.engine,[ally,enemy]=e.reinforcements;
 e.deployment.configure(e.allCapitalShips,new Set([e.playerShip.id,e.enemyShip.id]),60);
 const projector=new api.DeploymentViewProjector(),first=projector.capture(e,1),initial=JSON.stringify(state(e));
 same(projector.capture(e,1),first);same(first.members.length,4);same(first.fleetEnabled,true);same(first.playerTeam,e.playerShip.teamId);
 same(first.members.find(row=>row.id===ally.id).spec,ally.spec);
 const capital=e.allCapitalShips;
 Object.defineProperty(e,'allCapitalShips',{get:()=>capital.filter(ship=>ship!==e.enemyShip),configurable:true});
 const missing=new api.DeploymentViewProjector().capture(e);same(missing.members.length,3);same(api.deploymentViewUsed(missing,1),e.deployment.used(1));
 delete e.allCapitalShips;
 same(api.deploymentViewUsed(first,0),e.deployment.used(0));same(api.deploymentViewUsed(first,1),e.deployment.used(1));
 for(const ids of [[],[ally.id],[enemy.id],[e.playerShip.id],[ally.id,ally.id],['missing']]){
  same(api.deploymentViewReason(first,ids,0),e.deployment.reason(ids,0));
 }
 const row=first.members.find(item=>item.id===ally.id);
 same(row instanceof api.Ship,false);same('applyHullDamage' in row,false);same('weaponSystem' in row,false);
 same(Object.isFrozen(first),true);same(Object.isFrozen(first.members),true);same(Object.isFrozen(row),true);same(Object.isFrozen(row.spec.weaponSlots),true);
 same(Reflect.set(row,'hullHp',0),false);same(Reflect.set(row.spec,'maxHull',0),false);same(JSON.stringify(state(e)),initial);
 ally.hullHp=ally.maxHullHp*.45;ally.currentCR=.37;
 const changed=projector.capture(e,1),newRow=changed.members.find(item=>item.id===ally.id);
 same(newRow.hullHp,ally.hullHp);same(newRow.currentCR,.37);same(row.hullHp===newRow.hullHp,false);
 same(changed.members.find(item=>item.id===enemy.id),first.members.find(item=>item.id===enemy.id));
 const encoder=new CombatPresentationEncoder(1,'render'),decoder=new CombatPresentationDecoder(1);
 const receive=()=>decoder.apply(structuredClone(encoder.capture(e,k.tick))).hud.deployment;
 const decoded=receive(),published=api.copyDeploymentView(decoded);
 same(published.members.find(item=>item.id===ally.id).currentCR,.37);same(api.copyDeploymentView(receive(),published),published);
 e.deployment.deploy([ally.id],0);
 const after=api.copyDeploymentView(receive(),published);
 same(published.members.find(item=>item.id===ally.id).status,'reserve');same(after.members.find(item=>item.id===ally.id).status,'deployed');
 for(const status of ['deployed','retreating','retreated','destroyed']){
  ally.retreating=status==='retreating';ally.isRetreated=status==='retreated';ally.isDead=status==='destroyed';
  const view=projector.capture(e,1);same(view.members.find(item=>item.id===ally.id).status,status);
  same(api.deploymentViewUsed(view,0),e.deployment.used(0));same(api.deploymentViewReason(view,[ally.id],0),e.deployment.reason([ally.id],0));
 }
 const mutable=structuredClone(enemy.spec);enemy.spec=mutable;
 const a=projector.capture(e,1).members.find(item=>item.id===enemy.id);same(a.spec===mutable,false);same(Object.isFrozen(mutable),false);
 mutable.weaponSlots[0].defaultWeaponId='fixture-new-weapon';
 const b=projector.capture(e,1).members.find(item=>item.id===enemy.id);
 same(projector.capture(e,1).members.find(item=>item.id===enemy.id),b);
 const afterMutable=api.copyDeploymentView(receive());const stableMutablePacket=encoder.capture(e,k.tick);
 same(stableMutablePacket.metadata.length,0);same(api.copyDeploymentView(decoder.apply(structuredClone(stableMutablePacket)).hud.deployment,afterMutable),afterMutable);
 same(b.spec.weaponSlots[0].defaultWeaponId,'fixture-new-weapon');same(a.spec.weaponSlots[0].defaultWeaponId==='fixture-new-weapon',false);
 same(projector.capture(e,2).generation,first.generation+1);same(projector.capture(e,2,false).available,false);
 k.dispose();
 const empty=new api.CombatEngine('onslaught','paragon',88);
 Object.defineProperty(empty,'allCapitalShips',{get(){throw Error('Unnecessary roster scan for an ordinary non-deployment view');},configurable:true});
 const emptyView=new api.DeploymentViewProjector().capture(empty);same(emptyView.members.length,0);same(emptyView.allyUsed,0);same(emptyView.enemyUsed,0);
 delete empty.allCapitalShips;
 const session=new api.CombatSession('onslaught','paragon',85);
 session.engine.beginSimulationDeployment(40,60);
 const before=session.deploymentView.read();same(before.simulation,true);same(before.allyUsed,40);same(before.enemyUsed,0);same(before.simulationLimit,60);
 same((await session.dispatchDeployment({kind:'simulation-wave',ally:['wolf_CS'],enemy:['hammerhead_Balanced']})).accepted,true);
 const active=session.deploymentView.read();same(active.generation,before.generation);same(active.allyUsed,45);same(active.enemyUsed,10);same(before.allyUsed,40);
 session.beginEncounter('onslaught','paragon',86);same(session.deploymentView.read().generation,before.generation+1);
 session.dispose();same(session.deploymentView.read().available,false);
}
// Deployment resolves catalogue IDs on authority without global hull registration.
{
 const same=(a,b)=>{assert.equal(a,b);checks++;};
 const k=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:69,multicore:false,simulationPointLimit:40});
 const e=k.engine,signature=api.localCombatContentSignature(),revision=api.contentRegistry.revision;
 const before=JSON.stringify(state(e));
 for(const request of [
  {kind:'simulation-wave',ally:['wolf_CS'],enemy:['hammerhead_Balanced']},
  {kind:'simulation-wave',ally:[],enemy:['wolf_CS','missing-fixture-variant']},
  {kind:'simulation-wave',ally:[],enemy:['wolf_CS','wolf_CS']},
  {kind:'simulation-limit',limit:1},
 ]){same((await k.dispatchDeployment(request)).accepted,false);same(JSON.stringify(state(e)),before);}
 same((await k.dispatchDeployment({kind:'simulation-limit',limit:60})).accepted,true);same(e.simulationPointLimit,60);
 const request={kind:'simulation-wave',ally:['wolf_CS'],enemy:['hammerhead_Balanced']};
 const queued=k.dispatchDeployment(request);request.ally[0]='missing-after-enqueue';
 same((await k.dispatchDeployment({kind:'simulation-limit',limit:80})).accepted,false);
 same((await queued).accepted,true);same(k.tick,0);same(e.allCapitalShips.length,3);
 same(e.simulationDeployedPoints(true),45);same(e.simulationDeployedPoints(false),10);
 for(const ship of e.allCapitalShips.filter(s=>s.spec.id.startsWith('sim-'))){same(api.modManager.getShip(ship.spec.id),undefined);same(ship.shipName.startsWith('sim.'),false);same(Object.isFrozen(ship.spec),true);}
 same(api.contentRegistry.revision,revision);same(api.localCombatContentSignature(),signature);
 // Late compilation cannot populate a replaced/closed encounter.
 const session=new api.CombatSession('onslaught','paragon',70);session.engine.beginSimulationDeployment(40,60);
 const late=session.dispatchDeployment({kind:'simulation-wave',ally:[],enemy:['wolf_CS']});
 session.beginEncounter('onslaught','paragon',71);same((await late).accepted,false);same(session.engine.allCapitalShips.length,2);same(session.engine.isSimulation,false);session.dispose();
 const closed=k.dispatchDeployment({kind:'simulation-wave',ally:[],enemy:['wolf_CS']});k.dispose();same((await closed).accepted,false);same(e.allCapitalShips.length,3);
 // Personal fit snapshots work on worker authority without browser storage.
 {
  const customKernel=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:73,multicore:false,simulationPointLimit:1000});
  const customEngine=customKernel.engine,contentRevision=api.contentRegistry.revision;
  let design=api.createDesign('wolf');design.id='simulation-refresh-fixture';design.name='Saved fit before';design.vents=1;design.capacitors=0;
  const original=structuredClone(design),id=api.savedSimulationId(design);
  const roster=api.simulationRoster([design]),option=roster.find(o=>o.id===id);
  same(new Set(roster.map(o=>o.id)).size,roster.length);same(option.origin,'saved');same(option.preset,false);
  same(roster.filter(o=>o.preset).length,api.simulationRoster().filter(o=>o.preset).length);
  design.name='Caller changed after listing';same(api.prepareSimulationOption(option).design.name,original.name);
  const snapshots=api.selectedSimulationDesigns([option,option]);same(snapshots.length,1);
  const firstExpected=api.evaluate(original).spec;
  const promise=customKernel.dispatchDeployment({kind:'simulation-wave',ally:[id],enemy:[id],designs:snapshots});
  snapshots[0].vents=999;snapshots[0].name='Caller changed after submit';
  same((await promise).accepted,true);
  const firstShips=customEngine.allCapitalShips.filter(s=>s.spec.id==='sim-'+id);same(firstShips.length,2);
  same(firstShips[0].shipName,original.name);same(firstShips[0].spec.fluxDissipation,firstExpected.fluxDissipation);
  same(Object.isFrozen(firstShips[0].spec),true);
  const removable=Object.keys(original.weapons).find(slot=>original.weapons[slot]&&!api.isBuiltIn(original.hullId,slot));
  assert.ok(removable);checks++;
  design=api.withWeapon(original,removable,null);design.name='Saved fit after';design.vents=2;design.updatedAt++;
  const updatedOption=api.simulationRoster([design]).find(o=>o.id===id),updated=api.prepareSimulationOption(updatedOption);
  same(updatedOption.revision===option.revision,false);same(updated.design.name,design.name);
  same((await customKernel.dispatchDeployment({kind:'simulation-wave',ally:[],enemy:[id],designs:[design]})).accepted,true);
  const nextShip=customEngine.allCapitalShips.filter(s=>s.spec.id==='sim-'+id).at(-1);
  same(nextShip.shipName,design.name);same(nextShip.spec.fluxDissipation,updated.spec.fluxDissipation);
  assert.deepEqual(nextShip.spec.weaponSlots,updated.spec.weaponSlots);checks++;
  same(firstShips[0].spec.fluxDissipation,firstExpected.fluxDissipation);same(firstShips[0].shipName,original.name);
  same(api.simulationRoster().some(o=>o.id===id),false);
  const invalid=structuredClone(design);invalid.weapons[removable]='missing-weapon';
  const count=customEngine.allCapitalShips.length;
  for(const request of [
   {kind:'simulation-wave',ally:['wolf_CS'],enemy:[id]},
   {kind:'simulation-wave',ally:['wolf_CS'],enemy:[id],designs:[invalid]},
   {kind:'simulation-wave',ally:[],enemy:[id],designs:[design,design]},
   {kind:'simulation-wave',ally:[],enemy:['wolf_CS'],designs:[design]},
   {kind:'simulation-wave',ally:[],enemy:[id],designs:Array(101).fill(design)},
  ]){same((await customKernel.dispatchDeployment(request)).accepted,false);same(customEngine.allCapitalShips.length,count);}
  const extension=api.simulationRoster().find(o=>o.id==='web-gloriana-arsenal');
  same(extension.origin,'extension');same(extension.preset,false);
  const extensionFit=api.prepareSimulationOption(extension);same(extensionFit.errors.length,0);
  same((await customKernel.dispatchDeployment({kind:'simulation-wave',ally:[],enemy:[extension.id]})).accepted,true);
  const extensionShip=customEngine.allCapitalShips.find(s=>s.spec.id==='sim-'+extension.id);
  assert.ok(extensionShip);assert.deepEqual(extensionShip.spec.weaponSlots,extensionFit.spec.weaponSlots);checks+=2;
  same(api.contentRegistry.revision,contentRevision);same(api.modManager.getShip('sim-'+id),undefined);
  customKernel.dispose();
 }
 // The fleet path cannot impersonate a different team and revalidates current reserve status.
 const f=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:72,multicore:false,additionalShips:[
  {hull:'wolf',isPlayer:true,position:[0,0],facing:0},{hull:'wolf',isPlayer:false,position:[0,0],facing:0},
 ]});
 const [ally,enemy]=f.engine.reinforcements;f.engine.deployment.configure(f.engine.allCapitalShips,new Set([f.engine.playerShip.id,f.engine.enemyShip.id]),60);
 same((await f.dispatchDeployment({kind:'fleet',ids:[enemy.id],team:enemy.teamId})).accepted,false);same(f.engine.deployment.isReserve(enemy.id),true);
 const input={kind:'fleet',ids:[ally.id]},deployment=f.dispatchDeployment(input);input.ids[0]=enemy.id;
 same((await deployment).accepted,true);same(f.engine.deployment.isReserve(ally.id),false);same(f.engine.deployment.isReserve(enemy.id),true);
 same((await f.dispatchDeployment({kind:'fleet',ids:[ally.id]})).accepted,false);same(f.tick,0);f.dispose();
}
// Tactical UI intent travels as data through the SAME inline/Worker kernel command entry.
{
 const k=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'paragon',seed:68,multicore:false,additionalShips:[
  {hull:'hammerhead',isPlayer:true,position:[500,0],facing:0},{hull:'sunder',isPlayer:true,position:[-500,0],facing:0},
 ]});
 const e=k.engine,[player,enemy]=[e.playerShip,e.enemyShip],friends=e.capitalShips.filter(s=>s.isPlayer&&s!==player);
 const same=(a,b)=>{assert.equal(a,b);checks++;};
 const command=c=>k.command(structuredClone({kind:'tactical',command:c}));
 const encoder=new CombatPresentationEncoder(1,'render'),decoder=new CombatPresentationDecoder(1);
 const hud=()=>decoder.apply(structuredClone(encoder.capture(e,k.tick))).hud.tactical;
 e.combatTime=12.25;e.commandPoints=5;e.isTacticalMap=true;
 same(command({action:'select',unitId:player.id}).accepted,true);same(hud().selectedUnitId,player.id);
 same(command({action:'select',unitId:enemy.id}).accepted,false);same(e.selectedUnitId,player.id);
 const input={action:'order',unitId:player.id,order:{type:'WAYPOINT',position:[700,800]}};
 same(command(input).accepted,true);input.order.position[0]=999;
 const assignment=e.orders.get(player.id);same(assignment.targetPos instanceof Vector2,true);same(assignment.targetPos.x,700);same(assignment.issuedTime,12.25);same(e.commandPoints,4);same(k.tick,0);
 const projected=hud();same(projected.orders.get(player.id).targetPos instanceof Vector2,true);same(projected.orders.get(player.id).targetPos.x,700);same(projected.commandPoints,4);
 same(command({action:'order',unitId:player.id,order:{type:'WAYPOINT',position:[NaN,1]}}).accepted,false);same(e.commandPoints,4);
 same(command({action:'order',unitId:player.id,order:{type:'UNKNOWN'}}).accepted,false);same(command({action:'order',unitId:player.id,order:{type:'WAYPOINT'}}).accepted,false);
 enemy.isRetreated=true;same(command({action:'order',unitId:player.id,order:{type:'ENGAGE',targetShipId:enemy.id}}).accepted,false);same(e.commandPoints,4);enemy.isRetreated=false;
 enemy.visibilityMask=0;same(command({action:'target',targetId:enemy.id}).accepted,false);enemy.visibilityMask=3;
 same(command({action:'target',targetId:enemy.id}).accepted,true);same(e.playerShip.playerTargetId,enemy.id);
 same(command({action:'cancel',unitId:player.id}).accepted,true);same(e.orders.has(player.id),false);same(e.commandPoints,4);
 same(command({action:'escort',unitIds:friends.map(s=>s.id),targetId:player.id}).accepted,true);same(e.commandPoints,3);
 same(e.orders.get(friends[0].id).id,e.orders.get(friends[1].id).id);same(e.orders.get(friends[0].id).issuedTime,12.25);
 e.orders.set(enemy.id,{...e.orders.get(friends[0].id)});
 same(command({action:'cancel-target',targetId:player.id}).accepted,true);same(e.orders.has(friends[0].id),false);same(e.orders.has(friends[1].id),false);same(e.orders.has(enemy.id),true);
 same(command({action:'cancel',unitId:enemy.id}).accepted,false);e.orders.delete(enemy.id);
 same(command({action:'order',unitId:'fleet',order:{type:'ASSAULT'}}).accepted,true);same(e.commandPoints,2);
 same(command({action:'cancel',unitId:player.id}).accepted,false);same(e.orders.has('fleet'),true);
 same(command({action:'cancel',unitId:'fleet'}).accepted,true);same(e.commandPoints,2);
 e.commandPoints=0;same(command({action:'order',unitId:player.id,order:{type:'ASSAULT'}}).accepted,false);same(e.commandPoints,0);same(e.orders.has(player.id),false);
 same(command({action:'close'}).accepted,true);same(hud().isTacticalMap,false);same(command({action:'close'}).accepted,true);same(e.isTacticalMap,false);
 same(api.applyTacticalViewCommand(e,{action:'order',unitId:'fleet',order:{type:'ASSAULT'}}).accepted,false);same(e.commandPoints,0);
 // Native Vec2 methods remain callable after wire input; the next actual tick can consume a waypoint.
 e.commandPoints=5;command({action:'order',unitId:player.id,order:{type:'WAYPOINT',position:[2000,3000]}});k.step(sample(1));same(k.tick,1);
 // Deployment owns retreat eligibility and validates the full request before any mutation.
 e.combatTime=0; // Prepare the existing roster as a separate pre-battle deployment fixture.
 e.deployment.configure(e.capitalShips,new Set([player.id,enemy.id,friends[0].id]),240);
 same(command({action:'retreat',unitIds:[player.id,enemy.id],full:true}).accepted,false);same(player.retreating,false);same(friends[1].isRetreated,false);
 same(command({action:'retreat',unitIds:[player.id,player.id],full:false}).accepted,false);same(player.retreating,false);
 same(command({action:'retreat',unitIds:[player.id],full:true}).accepted,true);same(player.retreating,true);same(friends[1].isRetreated,true);same(enemy.retreating,false);
 e.battleResult={};same(command({action:'order',unitId:'fleet',order:{type:'ASSAULT'}}).accepted,false);same(command({action:'close'}).accepted,true);
 k.dispose();
}
// Shared copied display dictionary: sample mutable authority fields, never intern by id alone.
{
 const dictionary=new api.RenderWeaponDictionary();
 const same=(a,b)=>{assert.equal(a,b);checks++;};
 const different=(a,b)=>{assert.notEqual(a,b);checks++;};
 const deep=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const make=()=>({id:'shared',projSpeed:500,glowColor:[1,2,3,4],mirv:{childProjectile:{projSpriteUrl:'/child.png'}}});
 const a=make(),b=make();dictionary.begin();
 const old=dictionary.project(a);same(dictionary.project(b),old);same(dictionary.project(a),old);
 for(const v of [old,old.glowColor,old.mirv,old.mirv.childProjectile]){
  same(Object.isFrozen(v),true);same(api.isImmutableMetadata(v),true);
 }
 for(const v of [a,a.glowColor,a.mirv,a.mirv.childProjectile])same(Object.isFrozen(v),false);
 a.glowColor[1]=77;a.mirv.childProjectile.projSpriteUrl='/changed.png';
 const changed=dictionary.project(a);different(changed,old);same(dictionary.project(b),old);
 deep(changed.glowColor,[1,77,3,4]);deep(old.glowColor,[1,2,3,4]);
 same(changed.mirv.childProjectile.projSpriteUrl,'/changed.png');same(old.mirv.childProjectile.projSpriteUrl,'/child.png');
 dictionary.finish();same(dictionary.size,2);
 // Every audited scalar and child field participates in both change detection and equality.
 for(const field of renderFields.specFields.filter(f=>f!=='glowColor')){
  const source=make(),first=dictionary.project(source);source[field]='changed-'+field;
  const next=dictionary.project(source);different(next,first);same(next[field],source[field]);same(dictionary.project(source),next);
 }
 for(const field of renderFields.childFields){
  const source=make(),first=dictionary.project(source);source.mirv.childProjectile[field]='changed-'+field;
  const next=dictionary.project(source);different(next,first);same(next.mirv.childProjectile[field],source.mirv.childProjectile[field]);
 }
 // JSON's ordinary coercions must not conflate undefined/null, -0/0 or nonfinite numbers.
 const numeric=[undefined,null,0,-0,NaN,Infinity,-Infinity,'NaN',JSON.stringify(['undefined'])];
 const numbers=numeric.map(projSpeed=>dictionary.project({id:'numbers',projSpeed}));
 same(new Set(numbers).size,numeric.length);
 for(let i=0;i<numeric.length;i++){same(Object.is(numbers[i].projSpeed,numeric[i]),true);same(dictionary.project({id:'numbers',projSpeed:numeric[i]}),numbers[i]);}
 const colors=[undefined,null,[],[1],[1,undefined],[1,2,3],[1,2,3,undefined],[1,2,3,null],[1,2,3,-0],[1,2,3,0]];
 const colorSpecs=colors.map(glowColor=>dictionary.project({id:'colors',glowColor}));same(new Set(colorSpecs).size,colors.length);
 for(let i=0;i<colors.length;i++)deep(colorSpecs[i].glowColor,colors[i]);
 const mirvs=[undefined,null,{}, {childProjectile:null},{childProjectile:{}},{childProjectile:{onHitEffect:'fixture'}}];
 const children=mirvs.map(mirv=>dictionary.project({id:'children',mirv}));same(new Set(children).size,mirvs.length);
 for(let i=0;i<mirvs.length;i++)deep(specRead(children[i]),specRead({id:'children',mirv:mirvs[i]}));
 for(const source of [{projSpeed:{}},{glowColor:'invalid'},{glowColor:[1,2,3,4,5]}]){
  assert.throws(()=>dictionary.project(source),/Unsupported/);checks++;
 }
 dictionary.finish();dictionary.begin();dictionary.project(b);dictionary.finish();same(dictionary.size,1);
 dictionary.begin();dictionary.finish();same(dictionary.size,0);
 // A weakly cached source can return after pruning, and merges with new equal sources.
 dictionary.begin();same(dictionary.project(b),old);same(dictionary.project(make()),old);dictionary.finish();same(dictionary.size,1);
 dictionary.begin();const returning=dictionary.project(make());same(dictionary.project(b),returning);dictionary.finish();same(dictionary.size,1);
}
// Shared display specs must not collapse distinct mount ranges across the actual wire codec.
{
 const k=new LocalCombatKernel({playerHull:'odyssey',enemyHull:'paragon',seed:67});
 const source=k.engine.playerShip,[a,b]=source.weapons;
 const base={...a.spec,glowColor:[1,2,3,4],mirv:{childProjectile:{projSpriteUrl:'/shared-child.png'}}};
 a.spec={...base,range:321};b.spec={...base,range:987};
 const encoder=new CombatPresentationEncoder(1,'render'),decoder=new CombatPresentationDecoder(1);
 const capture=()=>decoder.apply(structuredClone(encoder.capture(k.engine,0))).view.playerShip;
 const before=JSON.stringify(state(k)),ship=capture(),[ma,mb]=ship.weapons;
 assert.equal(JSON.stringify(state(k)),before);checks++;
 assert.equal(ma.spec,mb.spec);assert.notEqual(ma,mb);checks+=2;
 assert.equal(Object.isFrozen(ma.spec),true);assert.equal(Object.isFrozen(a.spec),false);checks+=2;
 assert.equal(renderWeaponRange(ship,ma),renderWeaponRange(source,a));assert.equal(renderWeaponRange(ship,mb),renderWeaponRange(source,b));
 assert.notEqual(renderWeaponRange(ship,ma),renderWeaponRange(ship,mb));checks+=3;
 const shared=ma.spec;a.spec.range=654;capture();
 assert.equal(ma.spec,shared);assert.equal(mb.spec,shared);assert.equal(renderWeaponRange(ship,ma),renderWeaponRange(source,a));checks+=3;
 a.spec.glowColor=[9,8,7,6];a.spec.mirv={childProjectile:{projSpriteUrl:'/new-child.png'}};capture();
 assert.notEqual(ma.spec,mb.spec);assert.equal(mb.spec,shared);assert.deepEqual(mb.spec.glowColor,[1,2,3,4]);checks+=3;
 assert.deepEqual(ma.spec.glowColor,[9,8,7,6]);assert.equal(ma.spec.mirv.childProjectile.projSpriteUrl,'/new-child.png');checks+=2;
 a.spec={...b.spec,range:432};capture();assert.equal(ma.spec,mb.spec);assert.equal(renderWeaponRange(ship,ma),renderWeaponRange(source,a));checks+=2;
 // Removal/reinsertion must refresh the range map and restore the mount reference.
 source.weapons.splice(0,1);capture();assert.equal(ship.weaponRanges.has(ma),false);checks++;
 source.weapons.unshift(a);capture();assert.equal(renderWeaponRange(ship,ship.weapons[0]),renderWeaponRange(source,a));checks++;
 k.dispose();
}
// Query sidecars, signed/nonfinite numbers, mutable specs, references, removals and malformed packets.
{
 const k=new LocalCombatKernel({playerHull:'odyssey',enemyHull:'paragon',seed:44}),a=new CombatPresentationEncoder(1,'render'),d=new CombatPresentationDecoder(1),s=k.engine.playerShip;
 let w=d.apply(a.capture(k.engine,0)),ship=w.view.playerShip,mount=ship.weapons[0];
 s.prevPos.set(-0,Infinity);s.phaseGhosts=[];s.facingRad=NaN;s.visibilityMask=3;s.visibilityOverflow='|40|';s.weapons[0].spec.range+=77;s.weapons[0].spec.extraTestField='changed';
 api.setWeaponPresentationAngle(s.weapons[0],.7);
 setShipPresentationPose(s,{pos:new Vector2(321,123),facing:2});
 w=d.apply(structuredClone(a.capture(k.engine,0)));assert.equal(ship,w.view.playerShip);assert.equal(mount,ship.weapons[0]);assert.deepEqual(shipRead(ship),shipRead(s));checks+=3;
 const before=ship.hullHp;s.hullHp=123;const bad=a.capture(k.engine,0);bad.shapes[0].keys[0]='__proto__';assert.throws(()=>d.apply(bad));assert.equal(ship.hullHp,before);checks+=2;
 k.dispose();
}
{
 const k=new LocalCombatKernel({playerHull:'odyssey',enemyHull:'paragon',seed:66}),encoder=new CombatPresentationEncoder(1,'render'),decoder=new CombatPresentationDecoder(1);
 const source=k.engine.playerShip;
 const first=decoder.apply(encoder.capture(k.engine,0)),stable=first.view.playerShip,removed=stable.weapons.at(-1);
 // One source identity referenced by roster, flagship, carrier and wreck stays one display identity.
 k.engine.hulkFragments.push({id:99,sourceShip:source,age:1,pos:source.pos,vel:source.vel,facingRad:source.facingRad,angularVel:0,localOffset:new Vector2(),breakup:null,bounds:[],visualBounds:null,mountSlotIds:[],collisionRadius:source.spec.collisionRadius});
 source.weapons[0].spec.mirv={childProjectile:{projSpriteUrl:'/fixture-child.png'}};
 source.weapons.pop();source.visibilityMask=0;source.visibilityOverflow='|40|';
 const next=decoder.apply(structuredClone(encoder.capture(k.engine,0)));
 assert(collectCombatTextureUrls(next.view).includes('/fixture-child.png'));assert.equal('damagePerShot' in stable.weapons[0].spec,false);assert.equal('healthTracker' in stable.engineStatuses[0],false);checks+=3;
 source.weapons[0].spec.mirv={};const missingChild=decoder.apply(encoder.capture(k.engine,0));assert.doesNotThrow(()=>collectCombatTextureUrls(missingChild.view));checks++;
 assert.equal(next.view.playerShip,stable);assert.equal(next.view.hulkFragments[0].sourceShip,stable);assert(!stable.weapons.includes(removed));checks+=3;
 for(const name of ['update','applyDamage','takeDamage','advance','reset']){assert.equal(typeof stable[name],'undefined');assert.equal(typeof stable.shield[name],'undefined');assert.equal(typeof stable.system[name],'undefined');checks+=3;}
 const bad=encoder.capture(k.engine,0);const shape=bad.shapes.find(x=>x.keys.includes('kind'))??bad.shapes[0];shape.keys.push('constructor');assert.throws(()=>decoder.apply(bad));checks++;
 // Projection must neither invoke custom query hooks nor masquerade them as native.
 const projection=new api.RenderShipProjection(),original=source.system.getWeaponRangePercent;let calls=0;
 source.system.getWeaponRangePercent=()=>{calls++;return 42;};assert.throws(()=>projection.project(source),/authority-side presentation adapter/);assert.equal(calls,0);checks+=2;
 source.system.getWeaponRangePercent=original;projection.begin();assert(projection.project(source) instanceof ProjectedRenderShip);checks++;
 for(const radius of [0,1,45,1234]){
  source.shield.radius=radius;const before=JSON.stringify(state(source.shield));const levels=source.shield.presentationHitSegmentLevels();assert.equal(JSON.stringify(state(source.shield)),before);assert.deepEqual(levels,source.shield.hitSegmentLevels);checks+=2;
 }
 source.externalPhaseEffects.set({},()=>{calls++;return .5;});projection.begin();const count=calls;
 assert.throws(()=>projection.project(source),/authority-side presentation adapter/);assert.equal(calls,count);checks+=2;
 assert.throws(()=>new CombatPresentationEncoder(2,'render').capture(k.engine,0),/authority-side presentation adapter/);checks++;
 const driftEncoder=new CombatPresentationEncoder(3,'render');source.externalPhaseEffects.clear();driftEncoder.capture(k.engine,0);
 source.externalPhaseEffects.set({},()=>.5);assert.throws(()=>driftEncoder.capture(k.engine,0),/authority-side presentation adapter/);checks++;
 k.dispose();
}
{
 const same=(a,b)=>{assert.equal(a,b);checks++;},deep=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const k=new LocalCombatKernel({playerHull:'onslaught',enemyHull:'wolf',seed:821,multicore:false});
 const e=k.engine,p=e.playerShip,t=e.enemyShip;p.playerTargetId=t.id;t.pos.copy(p.pos);t.pos.x+=100;
 const encoder=new CombatPresentationEncoder(811,'render'),decoder=new CombatPresentationDecoder(811);
 const frame=()=>decoder.apply(structuredClone(encoder.capture(e,k.tick))).hud.read;
 let hud=frame();same(hud.playerShip instanceof api.Ship,false);same(hud.playerShip instanceof api.HudContactRecord,true);
 same('fixedUpdate' in hud.playerShip,false);same('activate' in hud.playerShip.system,false);same('applyDamage' in hud.playerShip.armor,false);
 same(hud.playerShip.phaseSpeedMultiplier,p.shield.getPhaseSpeedMultiplier(p.flux.hardFlux/p.flux.maxFlux));same(hud.playerShip.timeToVent,p.flux.getTimeToVent());
 same(hud.playerShip.significantEnemiesInRange,p.areSignificantEnemiesInRange(2500,e.findHostile(p)));same(hud.playerShip.flameoutRatio,p.getFlameoutRatio());
 deep(Array.from(hud.playerShip.armor.cells),Array.from(p.armor.cells));same(hud.playerShip.weapons.length,p.weapons.length);
 same(hud.targetShip.id,t.id);same(hud.targetShip.weapons.length,t.weapons.length);same(hud.playerShip.interpolatedPos(.5).x,p.interpolatedPos(.5).x);
 for(let i=0;i<p.systems.length;i++)same(hud.playerShip.systems[i].activationFailureReason,p.systems[i].activationFailureReason);
 const ordinary=e.addShip('wolf',false,new Vector2(100,100),0);hud=frame();const contact=hud.ships.find(ship=>ship.id===ordinary.id);
 same('armor' in contact,false);same('weapons' in contact,false);same('tacticalAI' in contact,false);
 const old=hud.playerShip;p.armor.cells[0]*=.4;p.currentCR=.37;p.weapons[0].ammo=0;hud=frame();same(hud.playerShip,old);same(hud.playerShip.armor.cells[0],p.armor.cells[0]);same(hud.playerShip.currentCR,.37);same(hud.playerShip.weapons[0].ammo,0);
 p.playerTargetId=null;same(frame().targetShip,null);
 e.isTacticalMap=true;same(frame().isTacticalMap,true);k.dispose();
 const game=new api.GameSession(null,'wolf',false);game.activate();const report={isVictory:true,combatDuration:12};game.combat.engine.battleResult=report;
 const before=game.getSnapshot();const outcome=game.combat.collectOutcome(game['handoff']);same(outcome.encounterId,before.pendingCombat.id);game.dispose();
 const snapshot={ships:api.contentRegistry.getAllShips(),weapons:api.contentRegistry.getAllWeapons()},signature=api.localCombatContentSignature();
 api.contentRegistry.installSnapshot(snapshot.ships,snapshot.weapons);same(api.localCombatContentSignature(),signature);
 assert.throws(()=>api.contentRegistry.installSnapshot([...snapshot.ships,snapshot.ships[0]],snapshot.weapons),/Duplicate/);checks++;
 same(api.localCombatContentSignature(),signature);
}
{
 const same=(a,b)=>{assert.equal(a,b);checks++;};
 const e=new api.CombatEngine('wolf','wolf',0x8821),revision=e.playerShip.armor.cellMutationRevision;
 const projector=new api.CombatHudProjector();projector.capture(e);
 same(e.playerShip.armor.cellMutationRevision,revision);
 e.isTacticalMap=true;new api.TacticalMapViewProjector().capture(e);same(e.playerShip.armor.cellMutationRevision,revision);
 const session=new api.CombatSession('wolf','wolf',321);session.enableWorker();session.state='running';session.presentationState={status:'ready'};
 const commands=[],samples=[];let resolveStep;
 const host={status:'ready',pendingTransactions:1,commands: items=>new Promise(resolve=>commands.push({items,resolve})),step: sample=>{samples.push(sample);return new Promise(resolve=>{resolveStep=resolve;});},dispose:()=>{host.status='disposed';}};
 session.workerHost=host;
 const pilot=session.dispatchControl({kind:'pilot',autopilot:false});
 const step=session.fixedUpdateControlled(1/60,{autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false});
 same(samples[0].autopilot,false); // Earlier ownership intent cannot be overwritten by a stale UI sample.
 const release=session.dispatchControl({kind:'clear-input'}),duplicate=session.dispatchControl({kind:'clear-input'});
 same(release,duplicate);same(commands.length,2);
 assert.throws(()=>session.fixedUpdate(1/60),/Inline editor/);checks++;
 assert.throws(()=>session.fixedUpdateControlled(1,{autopilot:false}),/60 Hz/);checks++;
 session.dispose();
 for(const command of commands)command.resolve({results:[{accepted:true}]});resolveStep({});
 same((await pilot).accepted,false);same((await release).accepted,false);same(await step,false);same(host.status,'disposed');
}
const packedSlotContract=checkPackedVisualSlots(api);checks+=packedSlotContract.checks;reports.push(...packedSlotContract.reports);
const hudReadContract=checkPresentationHudReads(api);checks+=hudReadContract.checks;reports.push(...hudReadContract.reports);
const ownedScalarContract=checkPresentationOwnedScalars(api);checks+=ownedScalarContract.checks;reports.push(...ownedScalarContract.reports);
const indexContract=checkPresentationIndex(api);checks+=indexContract.checks;reports.push(...indexContract.reports);
const decoderContract=checkPresentationDecoderIndex(api);checks+=decoderContract.checks;reports.push(...decoderContract.reports);
const worklistContract=checkDecoderWorklist(api);checks+=worklistContract.checks;reports.push(...worklistContract.reports);
const shapeContract=checkPresentationShapes(api);checks+=shapeContract.checks;reports.push(...shapeContract.reports);
const rowContract=checkPresentationRows(api);checks+=rowContract.checks;reports.push(...rowContract.reports);
fs.writeFileSync(output,JSON.stringify({checks,reports},null,2));console.log(JSON.stringify({checks,reports}));

}

export function checkPresentationIndex(api) {
 const {LocalCombatKernel,CombatPresentationEncoder,CombatPresentationDecoder,Vector2}=api;let checks=0;const reports=[];
// Persistent encoder indexes may reuse bookkeeping, never a prior field read.
{
 const k=new LocalCombatKernel({playerHull:'wolf',enemyHull:'lasher',seed:971,multicore:false});
 const encoder=new CombatPresentationEncoder(41,'render'),decoder=new CombatPresentationDecoder(41);
 const old=api.BeforeCombatPresentationEncoder?new api.BeforeCombatPresentationEncoder(41,'render'):null;
 const snapshots=encoder.snapshots,snapshotRows=()=>encoder.liveEntries?new Map(encoder.liveEntries.map(row=>[row.id,row.snapshot])):encoder.snapshots,liveIds=()=>encoder.liveEntries?encoder.liveEntries.map(row=>row.id):encoder.liveIds,first={label:'first',amount:1},second={label:'second',amount:2},shared={value:3},cycle={};cycle.self=cycle;
 let reads=[];const graph={items:[first,second,first],map:new Map([[first,second],['shared',shared]]),set:new Set([first,second]),left:shared,right:shared,cycle,
  typed:new Float64Array([-0,Infinity,NaN]),vector:new Vector2(5,6),meta:api.immutableCopy({name:'immutable',values:[1,2,3]})};
 Object.defineProperty(graph,'observed',{enumerable:true,configurable:true,get(){reads.push('observed');return shared.value;}});
 k.engine.orders.set('display-index-probe',graph);
 let packets=0,exactPackets=0,recycle,recycleVisuals,oldRecycle,oldVisuals,lastPacket;
 const effective=p=>({...p,buffer:new Uint8Array(p.buffer,0,p.length*8),visuals:{...p.visuals,buffer:new Uint8Array(p.visuals.buffer,0,p.visuals.length*8)}});
 const capture=()=>{
  let prior,priorReads;if(old){reads=[];prior=old.capture(k.engine,0,oldRecycle,oldVisuals);priorReads=reads;}
  reads=[];const packet=encoder.capture(k.engine,0,recycle,recycleVisuals);lastPacket=packet;packets++;
  assert.deepEqual(reads,['observed']);assert.equal(encoder.snapshots,snapshots);assert.equal(snapshotRows().size,packet.liveNodeCount);assert.equal(liveIds().length,packet.liveNodeCount);assert.equal(new Set(liveIds()).size,packet.liveNodeCount);checks+=5;
  if(prior){assert.deepEqual(effective(packet),effective(prior));assert.deepEqual(reads,priorReads);checks+=2;exactPackets++;oldRecycle=prior.buffer;oldVisuals=prior.visuals.buffer;}
  const detached=decoder.apply(structuredClone(packet));recycle=packet.buffer;recycleVisuals=packet.visuals.buffer;
  return detached.hud.tactical.orders.get('display-index-probe');
 };
 let visible=capture();const oldVisibleFirst=visible.items[0];
 assert.equal(visible.items[0],visible.items[2]);assert.equal(visible.map.get(visible.items[0]),visible.items[1]);assert.equal(visible.left,visible.right);assert.equal(visible.cycle.self,visible.cycle);assert(visible.set.has(visible.items[1]));checks+=5;
 const firstId=encoder.identities.get(first).id,secondId=encoder.identities.get(second).id;
 const metadataId=encoder.identities.get(graph.meta).id;
 // Reorder the old identities before removing both. A reused Map alone would
 // still report original insertion order instead of the previous frame's BFS.
 graph.items.splice(0,3,second,first);graph.map.clear();graph.map.set(second,first);graph.set.clear();graph.set.add(second);graph.set.add(first);visible=capture();
 assert.equal(visible.items[1],oldVisibleFirst);checks++;
 graph.items=[];graph.map.clear();graph.set.clear();visible=capture();
 assert(lastPacket.removed.indexOf(secondId)>=0);assert(lastPacket.removed.indexOf(secondId)<lastPacket.removed.indexOf(firstId));assert(!snapshotRows().has(firstId));assert(!snapshotRows().has(secondId));checks+=4;
 first.amount=99;delete first.label;first.extra='new';graph.items=[first,second,first];shared.value=42;graph.typed[0]=0;graph.typed[1]=-Infinity;graph.vector.set(-0,NaN);visible=capture();
 assert.equal(encoder.identities.get(first).id,firstId);assert.equal(visible.items[0],visible.items[2]);assert.notEqual(visible.items[0],oldVisibleFirst);assert.equal(Object.getPrototypeOf(visible.items[0]),null);assert.deepEqual({...visible.items[0]},{amount:99,extra:'new'});assert.equal(visible.observed,42);checks+=6;
 // Metadata isn't a queued node; retirement/reintroduction must still follow
 // the old independent dictionary rules, even when ordinary nodes keep IDs.
 const metadata=graph.meta;graph.meta=null;capture();graph.meta=metadata;capture();assert.equal(encoder.identities.get(metadata).id,metadataId);assert(lastPacket.metadata.some(m=>m.id===metadataId));checks+=2;
 for(let i=0;i<12;i++){graph.ephemeral=Array.from({length:40},(_,j)=>({sample:i,index:j}));capture();graph.ephemeral=[];capture();}
 assert(![...snapshotRows().values()].some(row=>row.keys?.includes('sample')));checks++;
 graph.invalid=()=>{};assert.throws(()=>encoder.capture(k.engine,0),/Unsupported presentation value/);delete graph.invalid;
 assert.throws(()=>encoder.capture(k.engine,0),/Presentation encoder failed/);checks+=2;
 const fresh=new CombatPresentationEncoder(42,'render'),freshDecoder=new CombatPresentationDecoder(42);assert.doesNotThrow(()=>freshDecoder.apply(fresh.capture(k.engine,0)));checks++;
 reports.push({scenario:'presentation-index-liveness',packets,exactPackets,sameTick:0,reusedSnapshotIndex:!!snapshots,identitySnapshots:!!encoder.liveEntries,retirementOrderPreserved:true,temporaryNodes:12*40,poisonedEpochRejected:true});k.dispose();
}
 const identities=checkPresentationIdentities(api);checks+=identities.checks;reports.push(...identities.reports);
 return {checks,reports};
}

export function checkPresentationDecoderIndex(api) {
 const {LocalCombatKernel,CombatPresentationEncoder,CombatPresentationDecoder,Vector2}=api;
 const k=new LocalCombatKernel({playerHull:'wolf',enemyHull:'lasher',seed:994,multicore:false}),encoder=new CombatPresentationEncoder(53,'render');
 const current=new CombatPresentationDecoder(53),old=api.BeforeCombatPresentationDecoder?new api.BeforeCombatPresentationDecoder(53):null;
 const index=current.objects,shared={amount:1,label:'same'},other={amount:2},buffer=new ArrayBuffer(16,{maxByteLength:64}),typed=new Float64Array(buffer);typed.set([-0,Infinity]);
 const cycle={};cycle.self=cycle;
 const graph={shared,alias:shared,items:[shared,other],map:new Map([[shared,other]]),set:new Set([shared,other]),cycle,typed,typedArray:[typed],typedMap:new Map([[typed,typed]]),typedSet:new Set([typed]),vector:new Vector2(2,3),meta:api.immutableCopy({kind:'constant',values:[1,2]})};
 k.engine.orders.set('decoder-index-probe',graph);
 let checks=0,packets=0,equivalent=0,rejections=0,recycle,recycleVisuals,visible,oldVisible,lastPacket;
 const next=()=>{const p=encoder.capture(k.engine,0,recycle,recycleVisuals);recycle=p.buffer;recycleVisuals=p.visuals.buffer;return p;};
 const apply=packet=>{
  const input=structuredClone(packet);visible=current.apply(input);if(old){oldVisible=old.apply(structuredClone(packet));assert.deepEqual(visible,oldVisible);checks++;equivalent++;}
  assert.equal(current.objects,index);assert.equal(current.retainedObjects,packet.liveNodeCount);assert.equal(current.revision,packet.revision);assert.deepEqual([...current.objects.keys()],old?[...old.objects.keys()]:[...current.objects.keys()]);checks+=4;
  // Incoming shape arrays cannot mutate the accepted keys used for future deltas.
  const acceptedKeys=[...current.objects].map(([id,e])=>[id,[...e.keys]]);for(const shape of input.shapes)shape.keys.push('forbidden-after-consumption');
  assert.deepEqual([...current.objects].map(([id,e])=>[id,e.keys]),acceptedKeys);checks++;packets++;lastPacket=packet;
  return visible.hud.tactical.orders.get('decoder-index-probe');
 };
 const reject=(packet,pattern)=>{
  const before=structuredClone(visible),keys=[...current.objects.keys()],metadata=current.metadata,revision=current.revision,tick=current.tick;
  const links=[...current.objects].map(([id,e])=>[id,e.kind,e.type,e.units,[...e.keys],[...e.refs],[...e.metadata]]);
  assert.throws(()=>current.apply(structuredClone(packet)),pattern);checks++;if(old){assert.throws(()=>old.apply(structuredClone(packet)),pattern);checks++;}
  assert.deepEqual(structuredClone(visible),before);assert.deepEqual([...current.objects.keys()],keys);assert.deepEqual([...current.objects].map(([id,e])=>[id,e.kind,e.type,e.units,e.keys,e.refs,e.metadata]),links);
  assert.equal(current.objects,index);assert.equal(current.metadata,metadata);assert.equal(current.revision,revision);assert.equal(current.tick,tick);checks+=7;rejections++;
 };
 // Find one object's field in a valid encoder packet, never scan arbitrary numbers
 // for a coincidental tag/id pattern when constructing malformed test packets.
 const fieldOffset=(packet,id,key)=>{
  const values=new Float64Array(packet.buffer,0,packet.length);let at=2;
  for(let i=0;i<packet.nodeCount;i++){
   const node=values[at++],kind=values[at++];
   if(kind===0){const shape=packet.shapes[values[at++]];if(node===id){const slot=shape.keys.indexOf(key);assert(slot>=0);return at+slot*2;}at+=shape.keys.length*2;}
   else if(kind===6){const count=values[at++];const slot=node===id?current.objects.get(id)?.keys.indexOf(key):-1;for(let j=0;j<count;j++){const field=values[at++];if(node===id&&field===slot)return at;at+=2;}}
   else if(kind===5)at+=2;else if(kind===4){at++;const length=values[at++];at+=length;}else {const length=values[at++];at+=length*2;}
  }throw Error('Missing fixture field');
 };
 try {
  let shown=apply(next());const stable=shown.shared,oldTyped=shown.typed,sharedId=encoder.identities.get(shared).id;
  assert.equal(shown.shared,shown.alias);assert.equal(shown.map.get(shown.shared),shown.items[1]);assert(shown.set.has(shown.shared));assert.equal(shown.cycle.self,shown.cycle);checks+=4;
  // A real length-tracking array retains its wire ID while replacing display
  // storage; unchanged array/map/set/object parents must all rebind it.
  buffer.resize(32);typed[2]=NaN;typed[3]=42;shown=apply(next());
  assert.notEqual(shown.typed,oldTyped);assert.equal(shown.typed.length,4);assert(Object.is(shown.typed[0],-0));assert(Number.isNaN(shown.typed[2]));assert.equal(shown.typedArray[0],shown.typed);assert(shown.typedMap.has(shown.typed));assert(!shown.typedMap.has(oldTyped));assert.equal(shown.typedMap.get(shown.typed),shown.typed);assert(shown.typedSet.has(shown.typed));checks+=9;
  // Rejected prospective removals cannot hide retained dangling references or
  // consume the revision; the untouched legal packet is accepted afterwards.
  k.engine.playerShip.pos.x+=13;let valid=next(),bad=structuredClone(valid);bad.removed.push(sharedId);bad.liveNodeCount--;reject(bad,/Unresolved presentation reference/);
  bad=structuredClone(valid);bad.liveNodeCount++;reject(bad,/Invalid live presentation count/);
  bad=structuredClone(valid);bad.removed.push(sharedId,sharedId);bad.liveNodeCount-=2;reject(bad,/Invalid retired presentation identity/);
  shown=apply(valid);assert.equal(shown.shared,stable);checks++;
  graph.tail={only:'unreachable probe'};valid=next();bad=structuredClone(valid);const offset=fieldOffset(bad,encoder.identities.get(graph).id,'tail');const values=new Float64Array(bad.buffer);values[offset]=1;values[offset+1]=0;reject(bad,/Unreachable presentation records/);apply(valid);
  delete graph.tail;shared.amount=8;delete shared.label;shared.newField='fresh';graph.items.reverse();graph.map.clear();graph.map.set(other,shared);shown=apply(next());assert.equal(shown.shared,stable);assert.deepEqual({...shown.shared},{amount:8,newField:'fresh'});checks+=2;
  graph.shared=null;graph.alias=null;graph.items=[];graph.map.clear();graph.set.clear();apply(next());assert(!current.objects.has(sharedId));checks++;
  graph.shared=shared;graph.alias=shared;shown=apply(next());assert.notEqual(shown.shared,stable);assert.equal(shown.shared,shown.alias);checks+=2;
  for(let i=0;i<10;i++){graph.transient=Array.from({length:32},(_,j)=>({i,j}));apply(next());graph.transient=[];apply(next());}
  assert(![...current.objects.values()].some(entry=>entry.keys.includes('j')));checks++;
  const retained=current.retainedObjects;reject(lastPacket,/Invalid or stale presentation packet/);assert.equal(current.retainedObjects,retained);checks++;
  const plans=checkPresentationDecoderPlans(api);checks+=plans.checks;
  return{checks,reports:[{scenario:'presentation-decoder-index',packets,equivalent,rejections,transientNodes:320,typedResizeRebindings:4,stableIndex:true,fullGraphAndAliasing:true},...plans.reports]};
 } finally { k.dispose(); }
}
