import {assets} from './native-projectile-fixture.mts';import {createLanWorld} from '../../src/network/LanWorld';import {configureHostCosmetics} from '../../src/network/HostSnapshot';import {captureCombat} from '../../src/network/CombatSnapshot';import {encodeProjectedBinaryFrame} from '../../src/network/BinarySnapshot.mjs';
import {CombatStepProfiler} from '../../src/engine/diagnostics/CombatStepProfiler';
export {assets};
export function scenario(players:number){
 const count=22-players;
 const {engine,controlled}=createLanWorld({id:'navigation',seed:917,hostId:'p0',snapshotHz:60,players:Array.from({length:players},(_,seat)=>({id:'p'+seat,seat,team:seat%2,hull:'onslaught'})),options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.floor(count/2)).fill('hammerhead'),Array(Math.ceil(count/2)).fill('hammerhead')]}} as any);
 configureHostCosmetics(engine,true,true,true);
 for(const ship of engine.allCapitalShips){ship.pos.scale(.2);ship.prevPos.copy(ship.pos);ship.fireControlMode='AI';}
 // Use tick-based input in both arms. No wall-clock mouse events in differential simulation.
 const profiler=new CombatStepProfiler({sampleEvery:1,capacity:600});
 return {advance(tick:number){
  for(const [seat,ship] of controlled){ship.throttle=tick%240<100?.5:0;ship.strafeInput=Math.sin((tick+seat*17)/100)*.25;ship.turnInput=0;ship.fireControlMode='AI';}
  const span=profiler.begin(1/60),t=performance.now();
  try{engine.fixedUpdate(1/60,{trace:span});span?.finish('completed');}catch(e){span?.finish('error');throw e;}
  return performance.now()-t;
 },wire(tick:number){return encodeProjectedBinaryFrame(captureCombat(engine,tick,{},0,true,true,true,true,true),true);},rng(){return JSON.stringify([engine.random,engine.visualRandom]);},phases(){return profiler.getReport();},entities(){return {projectiles:engine.projectiles.length,beams:engine.beams.length,ships:engine.ships.length};}};
}
