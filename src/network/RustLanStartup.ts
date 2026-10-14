/** LAN constructors run once at this cold boundary, then their graph is released. */
import type { Match, Seat } from './protocol';
import { createLanWorld } from './LanWorld';
import { applyPlayerControls } from '../engine/runtime/PlayerControls';
import { manualWeaponShip } from '../engine/runtime/ModuleFireControl';
import { DEFAULT_MOUSE_STEERING } from '../engine/runtime/CombatControlSettings';
import { Vector2 } from '../engine/math/Vector2';
import type { Ship } from '../engine/simulation/Ship';
import type { CapitalShipAI } from '../engine/ai/CapitalShipAI';
import { captureCombatAudio } from '../engine/audio/CombatAudioEvents';
import { deploymentCost } from '../engine/simulation/CombatDeployment';
import { compileRustContent, type RustCompiledContent } from '../engine/runtime/rust/RustContentCompiler';
import type { RustSceneAdmission } from '../engine/runtime/rust/RustSceneProtocol';
import type { RustBodyHandle } from '../engine/runtime/rust/RustCoreProtocol';
import type { RadioMessage } from '../engine/simulation/CombatTypes';
export interface RustLanSeat { readonly seat: Seat; readonly id:number; readonly handle:RustBodyHandle; readonly manual:RustBodyHandle; readonly stableId:string; readonly teamId:number }
export interface RustLanStartup {
 readonly content:RustCompiledContent; readonly scene:RustSceneAdmission;
 readonly playerId:number; readonly enemyId:number; readonly radio:RadioMessage; readonly seats:readonly RustLanSeat[];
}
export function compileRustLanStartup(match:Match):RustLanStartup {
 const release=captureCombatAudio(()=>{});
 try {
  const {engine,controlled}=createLanWorld(match), roots=engine.allCapitalShips;
  for(const ship of controlled.values()) {
   engine.externallyControlledShipIds.add(ship.id);
   applyPlayerControls(ship,{},new Vector2(),false,DEFAULT_MOUSE_STEERING,false);
  }
  const ais=(engine as unknown as {reinforcementAI:Map<string,CapitalShipAI>}).reinforcementAI;
  const aiTargets=new Map<Ship,Ship|null>(roots.map(ship=>[ship,ship.currentTargetShip]));
  for(const ai of ais.values())aiTargets.set(ai.ship,ai.targetShip);
  const content=compileRustContent({seed:match.seed,ships:roots.map(ship=>({stableId:ship.id,spec:ship.spec,team:ship.teamId,player:ship.isPlayer,
   position:[ship.pos.x,ship.pos.y],facing:ship.facingRad,velocity:[ship.vel.x,ship.vel.y],shipName:ship.shipName,
   transient:engine.isTransientCombatShip(ship),deployment:engine.deployment.isReserve(ship.id)?'reserve':'deployed',fireControlMode:ship.fireControlMode}))},
   {roots,flight:engine.fighterSystem,random:engine.random,visual:engine.visualRandom,active:new Set(engine.ships),aiTargets});
  const identity=(ship:Ship)=>{const e=content.entities.find(e=>e.stableId===ship.id);if(!e)throw Error('Missing Rust LAN cold identity');return e;};
  const player=identity(engine.playerShip),enemy=identity(engine.enemyShip);
  const deployment=engine.deployment as unknown as {automaticTeams:Set<number>};
  const scene:RustSceneAdmission={enemy:enemy.handle,enabled:engine.deployment.enabled,limit:engine.deployment.limit,simulation:false,
   simulationLimit:engine.simulationPointLimit,primaryEnemyDeployed:true,multiTeam:true,open:true,autopilot:false,
   commandRate:engine.playerShip.hullStats.commandPointRateFlat,manualWeapon:identity(manualWeaponShip(engine.playerShip,engine.playerShip.assemblyShips)).handle,aiProfile:engine.aiDecisionProfile,multirate:engine.usesMultirateCombat,
   roots:roots.map(ship=>({handle:identity(ship).handle,cost:deploymentCost(ship.spec),pending:engine.deployment.isReserve(ship.id),station:ship.isStation,radius:ship.deploymentRadius})),
   automaticTeams:[...deployment.automaticTeams],externallyControlled:[...controlled.values()].map(ship=>identity(ship).handle),
   fullRate:roots.flatMap(ship=>ship.assemblyShips.filter(part=>engine.fullRateAIShipIds.has(part.id))).map(part=>identity(part).handle)};
  if(engine.radioMessages.length!==1)throw Error('Unsupported Rust LAN cold radio sequence');
  return {content,scene,playerId:player.id,enemyId:enemy.id,radio:structuredClone(engine.radioMessages[0]),
   seats:[...controlled].map(([seat,ship])=>({seat,id:identity(ship).id,handle:identity(ship).handle,manual:identity(manualWeaponShip(ship,ship.assemblyShips)).handle,stableId:ship.id,teamId:ship.teamId}))};
 } finally {release();}
}
