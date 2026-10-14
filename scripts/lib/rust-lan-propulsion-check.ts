import type { Match } from '../../src/network/protocol';
import { createLanWorld } from '../../src/network/LanWorld';
import { compileRustLanStartup } from '../../src/network/RustLanStartup';
import { compileRustContent } from '../../src/engine/runtime/rust/RustContentCompiler';
import { RustCombatCore } from '../../src/engine/runtime/rust/RustCombatCore';
import { installRustCombat } from '../../src/engine/runtime/rust/RustCombatInstall';
import { rustLanRow, decodeRustLanReads } from '../../src/network/RustLanProtocol';
import { modulePropulsionState } from '../../src/engine/simulation/systems/ModulePropulsion';
import { shipMotionStats } from '../../src/engine/simulation/systems/ShipMotion';
import { applyPlayerControls } from '../../src/engine/runtime/PlayerControls';
import { applyModuleWeaponInput, manualWeaponShip } from '../../src/engine/runtime/ModuleFireControl';
import { Vector2 } from '../../src/engine/math/Vector2';
import { CombatAuthority } from '../../src/engine/runtime/CombatAuthority';
import { FireControlQueryRoster } from '../../src/engine/ai/FireControlQueryBatch';
import { enableWorkerOwnedPhaseReads } from '../../src/engine/simulation/Ship';
import { configureHostCosmetics } from '../../src/network/HostSnapshot';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import type { CapitalShipAI } from '../../src/engine/ai/CapitalShipAI';
import type { Ship } from '../../src/engine/simulation/Ship';

/** Actual authored Gloriana tree and production installer/step, including
 * damaged source controller state. No diagnostic exports or invented hull rules. */
export async function checkRustLanPropulsion(module:WebAssembly.Module,base:Match){
 const player=base.players.find(p=>p.seat===7)!;
 const match:Match={...base,id:base.id+'-propulsion',players:[{...player,id:'host',seat:0,team:0},{...player,id:'guest',seat:5,team:1}],options:{...base.options,aiHulls:[[],[]]}};
 const configurations=['intact','partial-engine','flaming-module','dead-module','hp-zero','retreated-module','docked-module','missing-slot','parent-disabled','pre-clamp','post-clamp-turn']as const;
 const cases:unknown[]=[];let geometry=0,strict=0;
 const geo=(a:number,b:number,label:string)=>{geometry++;if(Math.abs(a-b)>Math.max(1e-9,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))))throw Error('Propulsion '+label+': '+a+' / '+b);};
 const equal=(a:unknown,b:unknown,label:string)=>{strict++;if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Propulsion '+label+': '+JSON.stringify(a)+' / '+JSON.stringify(b));};
 for(const name of configurations){const release=captureCombatAudio(()=>{});let core:RustCombatCore|undefined;
  try{
   const startup=compileRustLanStartup(match),source=createLanWorld(match),{engine,controlled}=source;
   FireControlQueryRoster.ownForWorker(engine);enableWorkerOwnedPhaseReads();configureHostCosmetics(engine,true,false,false);
   for(const ship of controlled.values()){engine.externallyControlledShipIds.add(ship.id);applyPlayerControls(ship,{},new Vector2(),false,false,false);}
   const root=controlled.get(0)!,config=root.spec.modulePropulsion;if(!config)throw Error('Actual acceptance pack lacks module propulsion');
   const part=root.childModules.find(s=>s.moduleMount?.slotId===config.slotIds[0])!;if(!part?.engineController.engines.length)throw Error('Actual propulsion module lacks engines');
   if(name==='partial-engine')part.engineController.disable(0,{extendedGlow:part.isEngineGlowExtended,systemActive:false},true);
   if(name==='flaming-module')part.engineController.state='FLAMING_OUT';
   if(name==='dead-module')part.isDead=true;
   if(name==='hp-zero')part.hullHp=0;
   if(name==='retreated-module')part.isRetreated=true;
   if(name==='docked-module')part.isDocked=true;
   if(name==='missing-slot')root.spec={...root.spec,modulePropulsion:{...config,slotIds:[...config.slotIds,'UNBUILT_ACTUAL_SLOT']}};
   if(name==='parent-disabled')root.engineController.state='DISABLED';
   if(name==='pre-clamp'||name==='post-clamp-turn'){
    root.spec={...root.spec,modulePropulsion:{...config,reserveSpeed:0,reserveAcceleration:0,reserveTurn:0},
     ...(name==='post-clamp-turn'?{turnAccelerationDeg:0}:{})};
    for(const id of config.slotIds){const child=root.childModules.find(s=>s.moduleMount?.slotId===id)!;child.engineController.state='DISABLED';}
   }
   const roots=engine.allCapitalShips,ais=(engine as unknown as {reinforcementAI:Map<string,CapitalShipAI>}).reinforcementAI,aiTargets=new Map<Ship,Ship|null>(roots.map(s=>[s,s.currentTargetShip]));
   for(const ai of ais.values())aiTargets.set(ai.ship,ai.targetShip);
   const content=compileRustContent({seed:match.seed,ships:roots.map(s=>({stableId:s.id,spec:s.spec,team:s.teamId,player:s.isPlayer,position:[s.pos.x,s.pos.y],facing:s.facingRad,velocity:[s.vel.x,s.vel.y],shipName:s.shipName,
    transient:engine.isTransientCombatShip(s),deployment:engine.deployment.isReserve(s.id)?'reserve':'deployed',fireControlMode:s.fireControlMode}))},{roots,flight:engine.fighterSystem,random:engine.random,visual:engine.visualRandom,active:new Set(engine.ships),aiTargets});
   const identity=(s:Ship)=>{const i=content.entities.find(i=>i.stableId===s.id);if(!i)throw Error('Actual propulsion identity absent');return i;};
   const seats=[...controlled].map(([seat,s])=>({seat,id:identity(s).id,handle:identity(s).handle,manual:identity(manualWeaponShip(s,engine.ships)).handle,stableId:s.id,teamId:s.teamId}));
   core=await RustCombatCore.create(module,match.seed);installRustCombat(core,content,{playerId:identity(engine.playerShip).id,enemyId:identity(engine.enemyShip).id,asteroids:true,scene:startup.scene,startupRadio:startup.radio});
   core.applyPacked(Float64Array.from(seats.flatMap(s=>rustLanRow(201,s,[s.seat,s.manual.slot,s.manual.generation]))));
   const before=core.snapshot(),state=modulePropulsionState(root)!,expected=shipMotionStats(root),native=decodeRustLanReads(core.scenePublication().network!).ships.find(s=>s.id===identity(root).id)!.motionStats;
   for(const key of ['acceleration','deceleration','maxSpeed','maxTurnRate','turnAcceleration','turnDeceleration','driftAcceleration','strafeMultiplier']as const)geo(native[key],expected[key],name+'.'+key);
   core.scenePublication();equal(core.snapshot().random,before.random,name+'.readonly-rules-rng');equal(core.snapshot().visualRandom,before.visualRandom,name+'.readonly-visual-rng');
   // Broken roots with active-death/retreat transitions are read cases; intact
   // and engine-only damage also cross the actual complete physical barrier.
   let physical=false;
   if(['intact','partial-engine','flaming-module','parent-disabled','pre-clamp','post-clamp-turn','missing-slot'].includes(name)){
    const input=(seat:number)=>({seat,fresh:true,input:{seq:1,keys:seat===0?9:0,aim:[0,0]as[number,number],firing:false,pointerActive:false,actions:[]},actions:[]});
    for(const s of seats){const ship=controlled.get(s.seat)!;applyPlayerControls(ship,s.seat===0?{KeyW:true,KeyD:true}:{},new Vector2(),false,false,false);applyModuleWeaponInput(ship,new Vector2(),false,false);}
    const rows=seats.map(s=>{const sample=input(s.seat).input;return rustLanRow(203,s,[s.seat,sample.keys,...sample.aim,0,0,0,0,0]);});core.applyPacked(Float64Array.from(rows.flat()));new CombatAuthority(engine).advance(1/60);core.step(1/60);
    const after=core.snapshot(),body=after.bodies.find(b=>b.id===identity(root).id)!;
    for(const [i,value]of [root.pos.x,root.pos.y,root.vel.x,root.vel.y,root.facingRad,root.angularVelRad].entries())geo(body.motion[i],value,name+'.physical'+i);
    equal(after.random,engine.random.checkpointWitness(),name+'.physical-rules-rng');physical=true;
   }
   cases.push({name,online:state.online,total:state.total,level:state.level,actualPhysicalBarrier:physical});
  }finally{core?.dispose();release();}
 }
 return {passed:true,cases,geometry,strict,actualSource:true,productionInstaller:true};
}
