import '../../src/engine/simulation/CombatEngine';
import { bundledShipPacks } from '../../src/engine/modding/BundledShipPacks';
import { createLanWorld } from '../../src/network/LanWorld';
import { RustLanKernel, type RustLanTickInput } from '../../src/network/RustLanKernel';
import { initializeLanDisplayWorld, applyLanDisplaySnapshot } from '../../src/network/LanDisplaySnapshot';
import { encodeProjectedBinaryFrame, decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { captureLanDisplayCombat, configureHostCosmetics } from '../../src/network/HostSnapshot';
import { captureBattleReport } from '../../src/network/CaptureBattleReport';
import { applyPlayerControls } from '../../src/engine/runtime/PlayerControls';
import { applyModuleWeaponInput, stopModuleFiring } from '../../src/engine/runtime/ModuleFireControl';
import { dispatchShipCommand } from '../../src/engine/runtime/CombatCommands';
import { applyGravityControlHold, applyGravityPushHold } from '../../src/engine/simulation/systems/GravityControlInput';
import { DEFAULT_MOUSE_STEERING } from '../../src/engine/runtime/CombatControlSettings';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { Vector2 } from '../../src/engine/math/Vector2';
import { KEY_CODES, type Match, type Action } from '../../src/network/protocol';
import { decodeRustLanReads, rustLanRow } from '../../src/network/RustLanProtocol';
import { assetManager } from '../../src/engine/assets/AssetResolver';
import assetManifest from '../../public/game-assets/asset-manifest.json';
import { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';
import { CombatAuthority } from '../../src/engine/runtime/CombatAuthority';
import { FireControlQueryRoster } from '../../src/engine/ai/FireControlQueryBatch';
import { enableWorkerOwnedPhaseReads } from '../../src/engine/simulation/Ship';
import { checkRustLanPropulsion } from './rust-lan-propulsion-check';

export function rustLanAcceptanceMatches():Match[]{
 const hull=(id:string)=>{const pack=bundledShipPacks.find(p=>p.id==='foundry.'+id);if(!pack)throw Error('Unknown acceptance pack');return pack.mainHull;};
 const make=(name:string,ships:string[],seats:number[]):Match=>({id:'rust-lan-'+name,seed:831,snapshotHz:20,hostId:'host',
  players:ships.map((id,i)=>({id:seats[i]===0?'host':'peer'+seats[i],name:'Seat '+seats[i],seat:seats[i],team:i*2,hull:hull(id),design:null})),
  options:{assignment:'teams',battleSize:2400,initialDeploymentLimit:1,aiDecisionProfile:'standard',aiHulls:ships.flatMap((id,i)=>[i===0?[hull(id)]:[hull(id)],[]]).slice(0,-1)}});
 return [make('sparse',['zhuyuan','hyperion','zhefeng'],[3,0,9]),make('assembly-flight-gravity',['adun-ark','gloriana','gravity'],[0,7,11]),make('rocinante',['rocinante','hyperion'],[0,5])];
}
export async function checkRustLanAuthority(wasm:BufferSource,sha256:string){
 await assetManager.loadManifest('data:application/json,'+encodeURIComponent(JSON.stringify(assetManifest)));
 const original=RustCombatCore.prototype.scenePublication;RustCombatCore.prototype.scenePublication=function(){try{return original.call(this);}catch(error){const c=this as unknown as {id:number;exports:{core_diagnostic_scene?:(id:number,network:number)=>number}};if(c.exports.core_diagnostic_scene)throw Error(String(error)+'; diagnostic network='+c.exports.core_diagnostic_scene(c.id,1)+' base='+c.exports.core_diagnostic_scene(c.id,0));throw error;}};
 const module=await WebAssembly.compile(wasm),cases:unknown[]=[],failures:unknown[]=[];let strict=0,geometry=0,receivers=0,captures=0;
 const equal=(a:unknown,b:unknown,path:string)=>{strict++;if(JSON.stringify(a)!==JSON.stringify(b))throw Error(path+': '+JSON.stringify(a)+' / '+JSON.stringify(b));};
 const geo=(a:number,b:number,path:string)=>{geometry++;const d=Math.abs(a-b);if(d>Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))))throw Error(path+': '+a+' / '+b);};
 for(const match of rustLanAcceptanceMatches()){
  let native:RustLanKernel|undefined,stage='cold';const audio:unknown[]=[];const release=captureCombatAudio(e=>audio.push(structuredClone(e)));
  const source=createLanWorld(match),engine=source.engine,sourceAuthority=new CombatAuthority(engine);
  FireControlQueryRoster.ownForWorker(engine);enableWorkerOwnedPhaseReads();configureHostCosmetics(engine,true,false,false);
  for(const ship of source.controlled.values()){engine.externallyControlledShipIds.add(ship.id);applyPlayerControls(ship,{},new Vector2(),false,DEFAULT_MOUSE_STEERING,false);}
  const compare=(view:ReturnType<typeof initializeLanDisplayWorld>['world'])=>{
   for(const ship of engine.combatShips){const got=view.combatShips.find(s=>s.id===ship.id);if(!got)throw Error('Missing live source ship '+ship.id);
    equal([got.teamId,got.isPlayer,got.isDead,got.isDocked,got.isRetreated,got.retreating,got.playerTargetId,got.fireControlMode,got.selectedGroupIndex,got.fighterRecall,got.isFiringMain,got.brakeInput,got.throttle,got.strafeInput,got.turnInput],
     [ship.teamId,ship.isPlayer,ship.isDead,ship.isDocked,ship.isRetreated,ship.retreating,ship.playerTargetId,ship.fireControlMode,ship.selectedGroupIndex,ship.fighterRecall,ship.isFiringMain,ship.brakeInput,ship.throttle,ship.strafeInput,ship.turnInput],ship.id+'.controls');
    equal([got.hullHp,got.currentCR,got.flux.softFlux,got.flux.hardFlux,got.flux.isVenting,got.flux.isOverloaded],[ship.hullHp,ship.currentCR,ship.flux.softFlux,ship.flux.hardFlux,ship.flux.isVenting,ship.flux.isOverloaded],ship.id+'.resources');
    for(const [i,value]of [ship.pos.x,ship.pos.y,ship.vel.x,ship.vel.y,ship.facingRad,ship.angularVelRad].entries())geo([got.pos.x,got.pos.y,got.vel.x,got.vel.y,got.facingRad,got.angularVelRad][i],value,ship.id+'.pose'+i);
    for(const k of ['acceleration','deceleration','maxSpeed','maxTurnRate','turnAcceleration','turnDeceleration','driftAcceleration','strafeMultiplier']as const)geo(got.motionStats[k],ship.getMotionStats()[k],ship.id+'.motionStats.'+k);
    for(let i=0;i<ship.allSystems.length;i++){const s=ship.allSystems[i],r=got.allSystems[i];
     equal([r.type,r.available,r.isActive,r.state,r.charges,r.disabled,r.isPhased,r.forcesBraking,r.blocksWeapons,r.forcesAutofire,r.forcesForward,r.locksTurning,r.blocksAcceleration,r.blocksStrafing],
      [s.type,s.available,s.isActive,s.state,s.charges,s.disabled,s.isPhased,s.forcesBraking,s.blocksWeapons,s.forcesAutofire,s.forcesForward,s.locksTurning,s.blocksAcceleration,s.blocksStrafing],ship.id+'.system'+i);
     for(const t of ['BALLISTIC','ENERGY','MISSILE']as const)equal([r.getWeaponFluxCostMultiplier(t),r.getWeaponRateOfFireMultiplier(t)],[s.getWeaponFluxCostMultiplier(t),s.getWeaponRateOfFireMultiplier(t)],ship.id+'.modifier'+i+t);
    }
    for(let i=0;i<ship.weapons.length;i++){const m=ship.weapons[i],r=got.weapons[i];equal([r.slotId,r.ammo,r.isDisabled,r.isPermanentlyDisabled,r.barrelIndex,r.burstRemaining,r.reloadDelayRemaining],[m.slotId,m.ammo,m.isDisabled,m.isPermanentlyDisabled,m.barrelIndex,m.burstRemaining,m.reloadDelayRemaining],ship.id+'.mount'+i);geo(r.displaySpeed,ship.getWeaponDisplaySpeed(m.spec),ship.id+'.speed'+i);}
   }
  };
  try{
   native=await RustLanKernel.create(match,1,{module,sha256});
   stage='initial-capture';const before=JSON.stringify(native.witness()),cold=native.capture({},0);captures++;equal(JSON.stringify(native.witness()),before,'read-only cold');native.capture({},0);captures++;equal(JSON.stringify(native.witness()),before,'read-only repeat');
   const json=JSON.parse(JSON.stringify(cold)),binary=encodeProjectedBinaryFrame(cold,true);if(!binary)throw Error('Binary capture absent');
   const decoded=decodeBinaryFrame(binary),views=match.players.map(p=>initializeLanDisplayWorld(p.seat,p.seat===0?decoded:json));receivers+=views.length;compare(views[0].world);
   const sourceFrame=captureLanDisplayCombat(engine,0,{},0,null);equal(cold.controlled,sourceFrame.controlled,'cold controlled');equal(cold.deployment,sourceFrame.deployment,'cold deployment');equal(native.report(),captureBattleReport(engine,source.controlled,0),'cold settlement');
   native.drainAudio();equal(native.drainAudio(),[],'audio drained once');
   const input=(seat:number,tick:number):RustLanTickInput=>{const ship=source.controlled.get(seat)!,target=engine.capitalShips.find(s=>s.teamId!==ship.teamId)!;
    const actions:Action[]=tick===0?[{id:1,kind:'target',aim:[target.pos.x,target.pos.y]},{id:2,kind:'shield'}]:tick===2?[{id:3,kind:'system',value:0,aim:[ship.pos.x-500,ship.pos.y-500]}]:tick===4?[{id:4,kind:'recall'},{id:5,kind:'module',value:ship.childModules.length?1:0}]:[];
    return {seat,fresh:tick!==7,input:{seq:tick+1,keys:tick%2?1:seat===0?32:16,aim:[target.pos.x,target.pos.y],firing:tick>=5,pointerActive:true,actions:[]},actions};};
   const sourceInput=({seat,input,fresh,actions}:RustLanTickInput)=>{const ship=source.controlled.get(seat)!,keys=Object.fromEntries(KEY_CODES.map((key,i)=>[key,fresh&&!!(input.keys&(1<<i))]));
    applyPlayerControls(ship,keys,new Vector2(...input.aim),fresh&&input.firing,DEFAULT_MOUSE_STEERING,fresh&&input.pointerActive);applyModuleWeaponInput(ship,new Vector2(...input.aim),fresh&&input.firing,fresh&&input.pointerActive);
    for(const a of actions)dispatchShipCommand(ship,{kind:a.kind,value:a.value??0},a.aim?new Vector2(...a.aim):undefined,engine.ships);
    applyGravityControlHold(ship,fresh&&input.pointerActive&&!!keys.GravityField);applyGravityPushHold(ship,fresh&&input.pointerActive&&!!keys.GravityPush);
   };
   for(let tick=0;tick<10;tick++){
    stage='tick'+(tick+1);const inputs=[...native.controlled.keys()].map(seat=>input(seat,tick));inputs.forEach(sourceInput);sourceAuthority.advance(1/60);native.step(inputs);
    const before=JSON.stringify(native.witness()),frame=native.capture(Object.fromEntries(inputs.map(i=>[i.seat,i.input.seq])),0);captures++;equal(JSON.stringify(native.witness()),before,'read-only tick');
    for(const {world}of views)applyLanDisplaySnapshot(world,frame);compare(views[0].world);
    native.drainAudio();equal(native.drainAudio(),[],'audio no replay tick');
   }
   stage='seat-presence';const guest=[...native.controlled.keys()].find(s=>s!==0)!;
   for(const disconnectedSeat of [guest,0]){
    const ship=source.controlled.get(disconnectedSeat)!;native.presence(disconnectedSeat,false);engine.externallyControlledShipIds.delete(ship.id);ship.clearInput();stopModuleFiring(ship);
    equal(decodeRustLanReads(native.witness().scene.network!).seats.find(s=>s.seat===disconnectedSeat)!.connected,false,'disconnect external exclusion');
    for(let j=0;j<6;j++){stage='disconnected-seat'+disconnectedSeat+'-tick'+j;const samples=[...native.controlled.keys()].filter(s=>s!==disconnectedSeat).map(seat=>({...input(seat,8),fresh:false,actions:[]}));samples.forEach(sourceInput);sourceAuthority.advance(1/60);native.step(samples);
     const frame=native.capture({},0);captures++;for(const v of views)applyLanDisplaySnapshot(v.world,frame);compare(views[0].world);equal(native.witness().snapshot.random,engine.random.checkpointWitness(),'disconnected rules RNG');native.drainAudio();}
    native.presence(disconnectedSeat,true);engine.externallyControlledShipIds.add(ship.id);ship.clearInput();stopModuleFiring(ship);applyPlayerControls(ship,{},new Vector2(),false,DEFAULT_MOUSE_STEERING,false);
    const samples=[...native.controlled.keys()].map(seat=>({...input(seat,8),fresh:false,actions:[]}));samples.forEach(sourceInput);sourceAuthority.advance(1/60);native.step(samples);const recovered=native.capture({},0);captures++;for(const v of views)applyLanDisplaySnapshot(v.world,recovered);compare(views[0].world);
    const recoveredShip=views[0].controlled.get(disconnectedSeat)!;equal([recoveredShip.throttle,recoveredShip.strafeInput,recoveredShip.turnInput,recoveredShip.isFiringMain],[0,0,0,false],'connected neutral');native.drainAudio();
   }
   stage='seat-authority-rollback';const core=(native as unknown as {core:RustCombatCore}).core,owner=native.controlled.get(0)!;
   for(const bad of ['seat-spoof','stale-handle','padding']as const){const before=JSON.stringify({snapshot:core.snapshot(),scene:core.scenePublication()}),row=rustLanRow(203,owner,[owner.seat,0,0,0,0,1,0,0,0]);
    if(bad==='seat-spoof')row[4]=guest;else if(bad==='stale-handle')row[3]++;else row[25]=1;let rejected=false;try{core.applyPacked(Float64Array.from(row));}catch{rejected=true;}equal(rejected,true,bad+' rejected');equal(JSON.stringify({snapshot:core.snapshot(),scene:core.scenePublication()}),before,bad+' whole-world rollback');}
   stage='deployment';const reserve=native.capture({},0).deployment!.rows.find(r=>r.teamId===owner.teamId&&r.status==='reserve')!;captures++;
   equal(native.deployment(0,'deploy',[]),{accepted:false,reason:'请选择不重复的待命舰船。'},'empty deployment');
   const wrong=[...native.controlled.values()].find(s=>s.seat!==0)!;equal(native.deployment(0,'retreat',[wrong.stableId]),{accepted:false,reason:'不能替其他真人玩家下达撤退。'},'human ownership');
   if(!reserve)throw Error('Actual reserve absent');equal(native.deployment(0,'deploy',[reserve.id]),{accepted:true},'reserve admission');
   equal(native.deployment(0,'deploy',[reserve.id]),{accepted:false,reason:'所选舰船已部署、撤退或损失，请更新选择。'},'repeat deployment');
   const deployed=native.capture({},0);captures++;for(const v of views)applyLanDisplaySnapshot(v.world,deployed);equal(deployed.deployment!.rows.find(r=>r.id===reserve.id)!.status,'deployed','deployed snapshot');
   equal(native.deployment(0,'withdraw',[reserve.id]),{accepted:true},'withdraw');
   cases.push({match:match.id,seats:[...native.controlled.keys()],ticks:native.tick,capitalShips:deployed.ships.length,crafts:deployed.crafts.length,receivers:views.length,independentControls:true,deployment:true});
  }catch(error){failures.push({match:match.id,stage,error:String(error),stack:(error as Error).stack});}
  finally{release();native?.dispose();}
 }
 let propulsion:unknown;try{propulsion=await checkRustLanPropulsion(module,rustLanAcceptanceMatches()[1]);}catch(error){failures.push({stage:'module-propulsion',error:String(error),stack:(error as Error).stack});}
 return {passed:failures.length===0,cases,propulsion,failures,strict,geometry,receivers,captures,actualProductionRustLanKernel:true,actualSourceOracle:true};
}
