import { registerShipDisplayStrings } from '../engine/content/ShipDisplayStrings';
/** Display protocol receiver. No simulation constructors, system registry or
 * executable definition restoration can be reached through this module. */
import type { CombatSnapshot } from './CombatSnapshot';
import { LanDisplayWorld } from './LanDisplayWorld';
import { LanDisplayShip, DisplaySystem, DisplayArmor, DisplayShield, DisplayFlux } from './display/LanDisplayShip';
import { displayLayouts, unpackDisplay, unpackDisplayProjectiles, assertDataField } from './DisplaySnapshotCodec';
import { ExplosionPuffDecoder } from './ExplosionPuffCodec';
import { DynamicParticleDecoder } from '../engine/visual/DynamicParticleRecipe';
import { validateDisplayShipSpec, validateDisplayDefinition } from './display/DisplayDefinition';
import { validateParticleEvents } from './particle-events.mjs';
import { immutableCopy } from '../engine/extensions/Immutable';
import type { ShipSpec } from '../engine/content/ShipSpec';
import { Vector2 } from '../engine/math/Vector2';

const worldKeys = ['combatTime','cameraShakeIntensity','battleResult','environment','projectiles','beams','fxSystem','asteroidSystem','nebulaSystem','mineSystem'] as const;
const readKeys = ['multiTeamBattle','openBattlefield','simulationPointLimit','commandPoints','orders','shipLossNotifications'] as const;
interface Receiver {
 ships: Map<string,LanDisplayShip>; controlled: Map<number,string>; capitals: Set<string>;
 tick: number; projectileTick: number;
 specs: Map<string,ShipSpec>; puffs: ExplosionPuffDecoder; particles: DynamicParticleDecoder;
}
const receivers = new WeakMap<LanDisplayWorld,Receiver>();
function validate(frame:CombatSnapshot):void {
 if(!frame || frame.displayVersion!==1 || !Number.isSafeInteger(frame.tick) || frame.tick<0
  || frame.componentMode!==undefined || frame.fixedDisplay!==undefined || frame.recordDefinitions!==undefined
  || !Array.isArray(frame.ships) || frame.ships.length<2 || frame.ships.length>4096
  || !Array.isArray(frame.crafts) || frame.crafts.length>8192 || !Array.isArray(frame.craftSpecs) || frame.craftSpecs.length>12288
  || !frame.controlled || !frame.displayWings || !Array.isArray(frame.displayWings.player) || !Array.isArray(frame.displayWings.enemy)
  || !frame.displayWorld || !frame.world || !frame.deployment || !Array.isArray(frame.deployment.rows)) throw Error('Invalid LAN display protocol');
 const ids=new Set<string>();
 for(const row of [...frame.ships,...frame.crafts]) {
  if(typeof row.id!=='string'||!row.id.length||row.id.length>256||ids.has(row.id)||!Number.isInteger(row.spec)||!frame.craftSpecs[row.spec!]
    ||!row.state||typeof row.state!=='object'||Array.isArray(row.state))throw Error('Invalid display identity or definition');
  for(const key of ['id','pos','vel','facingRad','teamId','hullHp','isDead','isDocked','isRetreated','weapons','weaponGroups','shield','flux','armor','motionStats','motionFlags','system','systems','allSystems','assemblyShips','childModules','engineController'])
   if(!Object.hasOwn(row.state,key))throw Error('Incomplete display ship field: '+key);
  ids.add(row.id);
 }
 for(const row of frame.crafts)if(!['fighter','bomber','drone','detached'].includes(row.kind))throw Error('Invalid display craft kind');
 const capitals=new Set(frame.ships.map(row=>row.id));
 const seats=Object.entries(frame.controlled);
 if(!seats.length||seats.length>64||new Set(seats.map(([,id])=>id)).size!==seats.length
  ||seats.some(([seat,id])=>!/^\d+$/.test(seat)||!capitals.has(id)))throw Error('Invalid display control roster');
 const deployment=frame.deployment;
 if(!Number.isFinite(deployment.limit)||deployment.limit<0||deployment.rows.length>frame.ships.length
  ||new Set(deployment.rows.map(row=>row.id)).size!==deployment.rows.length
  ||deployment.rows.some(row=>!capitals.has(row.id)||!Number.isFinite(row.cost)||row.cost<0||!Number.isSafeInteger(row.teamId)
    ||!['reserve','deployed','retreating','retreated','destroyed'].includes(row.status)))throw Error('Invalid display deployment');
 if(frame.particleEvents!==undefined)validateParticleEvents(frame.particleEvents);
 if(frame.projectileVisuals!==undefined&&(frame.projectileVisuals!==1||!Array.isArray(frame.world.projectiles)||frame.world.projectiles.length))throw Error('Invalid separate projectile snapshot');
}
function system(value:DisplaySystem):DisplaySystem {
 if(!(value instanceof DisplaySystem)) {
  const record=new DisplaySystem();
  for(const key of Object.keys(value)){assertDataField(record,key);Reflect.set(record,key,Reflect.get(value,key));}
  value=record;
 }
 validateDisplayDefinition(value.definitionData);
 value.definition=value.definitionData;
 if(!value.definition||!value.fluxCosts||!value.fireRates||!Array.isArray(value.fireSlots))throw Error('Invalid display system');
 return value;
}
function decodeShips(frame:CombatSnapshot,state:Receiver,reset:boolean,world?:LanDisplayWorld) {
 const layouts=displayLayouts(frame.layouts,state.puffs,state.particles);
 const specs=frame.craftSpecs.map(value=>{
  const signature=JSON.stringify(value);let spec=state.specs.get(signature);
  if(!spec){validateDisplayShipSpec(value);spec=immutableCopy(value) as ShipSpec;state.specs.set(signature,spec);registerShipDisplayStrings(spec);}
  return spec;
 });
 if(state.specs.size>1024)state.specs=new Map(specs.map(spec=>[JSON.stringify(spec),spec]));
 const next=new Map<string,LanDisplayShip>();
 for(const row of [...frame.ships,...frame.crafts])next.set(row.id,state.ships.get(row.id)??new LanDisplayShip());
 // Allocate the entire identity table BEFORE decoding forward/carrier/module/FX references.
 for(const row of [...frame.ships,...frame.crafts]) {
  const ship=next.get(row.id)!,prior=state.ships.get(row.id);
  const pos=prior?.pos.clone(),facing=prior?.facingRad,teleport=prior?.teleportSequence;
  if(unpackDisplay(row.state,ship,next,layouts)!==ship || ship.id!==row.id)throw Error('Invalid display ship record');
  ship.spec=specs[row.spec!];
  if(!(ship.armor instanceof DisplayArmor)||!(ship.shield instanceof DisplayShield)||!(ship.flux instanceof DisplayFlux)
    ||!(ship.pos instanceof Vector2)||!(ship.vel instanceof Vector2)||!Number.isFinite(ship.facingRad)||!Number.isSafeInteger(ship.teamId)
    ||!Array.isArray(ship.weapons)||!ship.motionStats||!(ship.armor.cells instanceof Float32Array)
    ||ship.armor.cells.length!==ship.armor.cols*ship.armor.rows)throw Error('Incomplete display ship');
  ship.system=system(ship.system);ship.systems=ship.systems.map(system);ship.allSystems=ship.allSystems.map(system);
  if(ship.defenseSystem)ship.defenseSystem=system(ship.defenseSystem);
  for(const mount of ship.weapons){if(!mount.weaponSpec||!Number.isFinite(mount.displayRange)||!Number.isFinite(mount.displaySpeed))throw Error('Invalid display weapon');validateDisplayDefinition(mount.weaponSpec);mount.spec=mount.weaponSpec;}
  ship.weaponRanges=new Map(ship.weapons.map(mount=>[mount,mount.displayRange]));
  const snap=reset||!prior||world?.deployment.isReserve(ship.id)||teleport!==ship.teleportSequence;
  ship.prevPos=snap?ship.pos.clone():pos!;ship.prevFacingRad=snap?ship.facingRad:facing!;
 }
 // References may not contain module cycles or a second copy of a capital root.
 for(const ship of next.values()) {
  if(!Array.isArray(ship.assemblyShips)||!Array.isArray(ship.childModules)||ship.assemblyShips.some(child=>next.get(child.id)!==child))throw Error('Invalid display assembly');
  const parents=new Set<LanDisplayShip>([ship]);let parent=ship.parentShip;
  while(parent){if(parents.has(parent)||next.get(parent.id)!==parent)throw Error('Invalid display parent cycle');parents.add(parent);parent=parent.parentShip;}
 }
 state.ships=next;
 return layouts;
}
function restore(world:LanDisplayWorld,frame:CombatSnapshot,state:Receiver,reset:boolean,decoded?:ReturnType<typeof displayLayouts>):void {
 const continuous=!reset&&state.tick>=0&&frame.tick>state.tick&&frame.tick-state.tick<=60;
 const poses=new Map(continuous?world.projectiles.map(p=>[p.id,{pos:p.pos.clone(),tail:p.ballisticTail?.clone(),fade:p.fadeProgress}] as const):[]);
 const layouts=decoded??decodeShips(frame,state,!continuous,world);
 const ships=state.ships;
 world.fighters.splice(0,world.fighters.length,...frame.crafts.filter(row=>row.kind==='fighter').map(row=>ships.get(row.id)!));
 world.bombers.splice(0,world.bombers.length,...frame.crafts.filter(row=>row.kind==='bomber').map(row=>ships.get(row.id)!));
 world.droneSystem.drones.splice(0,world.droneSystem.drones.length,...frame.crafts.filter(row=>row.kind==='drone').map(row=>ships.get(row.id)!));
 for(const key of worldKeys) {
  if(!Object.hasOwn(frame.world,key))throw Error('Incomplete display world: '+key);
  Reflect.set(world,key,key==='projectiles'&&frame.world[key]?.$projectileColumns
   ?unpackDisplayProjectiles(frame.world[key],world[key],ships,layouts):unpackDisplay(frame.world[key],world[key],ships,layouts));
 }
 for(const key of readKeys) {
  if(!Object.hasOwn(frame.displayWorld,key))throw Error('Incomplete display read model: '+key);
  Reflect.set(world,key,unpackDisplay(frame.displayWorld[key],world[key],ships,layouts));
 }
 for(const p of world.projectiles){const prior=poses.get(p.id);p.prevPos=prior?.pos??p.pos.clone();if(p.ballisticTail)p.prevBallisticTail=prior?.tail??p.ballisticTail.clone();p.prevFadeProgress=prior?.fade??p.fadeProgress;}
 unpackDisplay(frame.displayWings!.player,world.playerWings,ships,layouts);unpackDisplay(frame.displayWings!.enemy,world.enemyWings,ships,layouts);
 world.deployment.applySnapshot(frame.deployment!);
 const active=world.ships;
 for(const ship of ships.values())ship.currentTargetShip=ship.fireControlMode==='MANUAL'?ships.get(ship.playerTargetId??'')??null:world.findHostile(ship,undefined,active)??null;
 state.tick=frame.tick;
 if(reset||frame.projectileVisuals!==1)state.projectileTick=frame.projectileVisuals===1?-1:frame.tick;
}
export function initializeLanDisplayWorld(seat:number,frame:CombatSnapshot):{world:LanDisplayWorld;controlled:Map<number,LanDisplayShip>} {
 validate(frame);
 const state:Receiver={ships:new Map(),controlled:new Map(Object.entries(frame.controlled!).map(([seat,id])=>[Number(seat),id])),capitals:new Set(frame.ships.map(row=>row.id)),tick:-1,projectileTick:-1,specs:new Map(),puffs:new ExplosionPuffDecoder(),particles:new DynamicParticleDecoder()};
 const layouts=decodeShips(frame,state,true);
 const world=new LanDisplayWorld(seat,frame.ships.map(row=>state.ships.get(row.id)!),state.controlled,frame.deployment!);
 restore(world,frame,state,true,layouts);receivers.set(world,state);
 return {world,controlled:new Map([...state.controlled].map(([seat,id])=>[seat,state.ships.get(id)!]))};
}
export function applyLanDisplaySnapshot(world:LanDisplayWorld,frame:CombatSnapshot,reset=false):void {
 validate(frame);const state=receivers.get(world);if(!state)throw Error('Uninitialized display receiver');
 if(frame.ships.length!==state.capitals.size||frame.ships.some(row=>!state.capitals.has(row.id))
  ||JSON.stringify(Object.entries(frame.controlled!).sort())!==JSON.stringify([...state.controlled].map(([seat,id])=>[String(seat),id]).sort()))throw Error('Display roster changed');
 restore(world,frame,state,reset);
}
/** Every endpoint and ACK is observed synchronously, including intermediate teleports. */
export function applyLanDisplaySnapshots(world:LanDisplayWorld,frames:readonly CombatSnapshot[],reset=false,afterApply?:(frame:CombatSnapshot)=>void):void {
 for(const frame of frames){applyLanDisplaySnapshot(world,frame,reset);afterApply?.(frame);}
}
export const projectileSnapshotTick=(world:LanDisplayWorld):number=>receivers.get(world)?.projectileTick??-1;
