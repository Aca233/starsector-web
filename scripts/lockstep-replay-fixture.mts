// Preflight ONLY: no networking or production mode switch. Every isolate runs
// the identical world; never apply a seat-specific perspective to simulation.
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureHostCombat,configureHostCosmetics} from '../src/network/HostSnapshot';
import {encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {applyPlayerControls} from '../src/engine/runtime/PlayerControls';
import {DEFAULT_MOUSE_STEERING} from '../src/engine/runtime/CombatControlSettings';
import {dispatchShipCommand} from '../src/engine/runtime/CombatCommands';
import {Vector2} from '../src/engine/math/Vector2';
import {KEY_CODES} from '../src/network/protocol';

export async function replay({ticks=1200, ships=32, batch=1, delay=0, seed=1511506142}={}, checkpoint:(tick:number, bytes:Uint8Array, summary:any)=>Promise<void>) {
 await assetManager.ensureManifestLoaded();
 const match:any={id:'lockstep-preflight',seed,hostId:'a',snapshotHz:60,
  players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],
  options:{assignment:'teams',battleSize:3200,aiHulls:[Array(ships/2-1).fill('hammerhead'),Array(ships/2-1).fill('hammerhead')]}};
 const {engine,controlled}=createLanWorld(match), muzzle=configureHostCosmetics(engine);
 for(const ship of controlled.values()){
  engine.externallyControlledShipIds.add(ship.id);
  applyPlayerControls(ship,{},new Vector2(),false,DEFAULT_MOUSE_STEERING,false);
 }
 for(let tick=0;tick<=ticks;tick++){
  if(tick){
   // Input tape depends only on logical tick and stable seat, never wall time,
   // local camera/world state, packet arrival order or a receiver's frame rate.
   for(const [seat,ship] of controlled){
    const keyBits=tick<=180?1:tick>300&&tick<=360?8:0;
    const keys:Record<string,boolean>={};KEY_CODES.forEach((key,bit)=>keys[key]=!!(keyBits&(1<<bit)));
    applyPlayerControls(ship,keys,new Vector2(seat===0?120:-120,seat===0?-1200:1200),tick%120<90,DEFAULT_MOUSE_STEERING,true);
    if(tick===120||tick===480)dispatchShipCommand(ship,{kind:'shield'},undefined,engine.ships);
    if(tick===720)dispatchShipCommand(ship,{kind:'vent'},undefined,engine.ships);
   }
   engine.fixedUpdate(1/60); // No wall-clock catch-up, expiry, dropped ticks or adaptive AI path.
  }
  if(tick%60===0){
   const frame=captureHostCombat(engine,tick,{0:tick,1:tick},0,muzzle,true,true);
   const record={frame,combatRng:{...engine.random},visualRng:{...engine.visualRandom}};
   const bytes=encodeProjectedBinaryFrame(record as any);if(!bytes)throw Error('Unexpected JSON fallback');
   await checkpoint(tick,bytes,{combatTime:engine.combatTime,ships:engine.allCapitalShips.length,projectiles:engine.projectiles.length,muzzleEvents:frame.muzzleEvents?.events.length??0});
  }
  if(tick&&tick%batch===0)await new Promise(resolve=>setTimeout(resolve,delay));
 }
 return {ticks,ships,seed,scope:'Presentation projection plus both RNG states. Not an exhaustive internal-state checkpoint or proof of cross-platform determinism.'};
}
