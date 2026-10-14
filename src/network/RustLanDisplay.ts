/** Pure completed Rust facts -> the existing self-contained LAN display packet. */
import { Vector2 } from '../engine/math/Vector2';
import type { RustPresentationShipRecords } from '../engine/runtime/rust/RustCombatPresentationShip';
import type { RustCompiledContent } from '../engine/runtime/rust/RustContentCompiler';
import type { RustCoreSnapshot } from '../engine/runtime/rust/RustCoreProtocol';
import type { RustPresentationFacts } from '../engine/runtime/rust/RustCombatPresentationFacts';
import type { RustCombatPresentationFrame } from '../engine/runtime/rust/RustCombatPresentation';
import type { RustLanReads } from './RustLanProtocol';
import type { RustLanSeat } from './RustLanStartup';
import type { CombatSnapshot } from './CombatSnapshot';
import { CapturedDisplayDefinition, DisplayDefinitionCapture } from './display/DisplayDefinitionCapture';
const excluded=new Set(['spec','phaseVisualAlpha','isPhased','hullPortrait','phaseSpeedMultiplier','significantEnemiesInRange','timeToVent','weaponRanges','sourceCarrier']);
const shieldExcluded=new Set(['isPhaseEngaged','isVisuallyDeployed','phaseCooldownLevel','renderArcRad','visualAlpha','isRaiseRequested']);
function append(target:Record<string,unknown>,source:object,skip:ReadonlySet<string>=excluded):Record<string,unknown>{const fields=source as Record<string,unknown>;for(const key of Object.keys(source))if(!skip.has(key))target[key]=fields[key];return target;}
function pick(source:object,skip:ReadonlySet<string>=excluded):Record<string,unknown>{return append({},source,skip);}
class DisplayPacker {
 readonly layouts:string[][]=[];
 private readonly indices=new Map<string,number[]>();
 private readonly records=new WeakMap<object,unknown>();
 private readonly plain=new WeakMap<object,unknown>();
 constructor(private readonly refs:ReadonlyMap<object,string>){}
 private layout(keys:string[]):number|undefined {
 const bucket=keys.length+':'+(keys[0]??''),candidates=this.indices.get(bucket);
 if(candidates)for(const index of candidates){const previous=this.layouts[index];let equal=true;for(let i=0;i<keys.length;i++)if(keys[i]!==previous[i]){equal=false;break;}if(equal)return index;}
 if(this.layouts.length>=1024)return undefined;
 const index=this.layouts.length;this.layouts.push(keys);if(candidates)candidates.push(index);else this.indices.set(bucket,[index]);return index;
 }
/** The codec is data only: no simulation-component envelopes or prototype reads. */
 pack(value:unknown,depth=0,plain=false):any {
 if(depth>64)throw Error('Rust LAN nesting exceeds display budget');
 if(value===undefined)return {$undefined:1};
 if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
 if(value===null||typeof value!=='object'){if(typeof value==='function')throw Error('Executable Rust LAN display value');return value;}
 if(value instanceof CapturedDisplayDefinition)return {$displayDefinition:value.index};
 const reference=this.refs.get(value);if(reference)return {$ship:reference};
 const cache=plain?this.plain:this.records,cached=cache.get(value);if(cached!==undefined)return cached;
 const result=this.object(value,depth,plain);cache.set(value,result);return result;
 }
 private object(value:object,depth:number,plain:boolean):unknown {
 if(value instanceof Vector2)return {$vector:[value.x,value.y]};
 if(ArrayBuffer.isView(value)&&!(value instanceof DataView))return {$typed:value.constructor.name,values:Array.from(value as unknown as ArrayLike<number>)};
 if(value instanceof Map)return {$map:[...value].map(([k,v])=>[this.pack(k,depth+1),this.pack(v,depth+1)])};
 if(value instanceof Set)return {$set:[...value].map(v=>this.pack(v,depth+1))};
 if(Array.isArray(value))return value.map(v=>this.pack(v,depth+1));
 const keys=Object.keys(value),values:unknown[]=new Array(keys.length),fields=value as Record<string,unknown>;
 for(let i=0;i<keys.length;i++){const key=keys[i];if(key==='__proto__'||key==='prototype'||key==='constructor')throw Error('Invalid Rust LAN display key');values[i]=this.pack(fields[key],depth+1);}
 if(!plain){const index=this.layout(keys);if(index!==undefined)return {$record:index,values};}
 return Object.fromEntries(keys.map((key,i)=>[key,values[i]]));
 }
}
export class RustLanDisplay {
 private readonly weapons:Map<string,RustCompiledContent['dictionary']['weapons'][number]['spec']>;
 constructor(content:RustCompiledContent,private readonly seats:readonly RustLanSeat[]){this.weapons=new Map(content.dictionary.weapons.map(w=>[w.key,w.spec]));}
 capture(snapshot:RustCoreSnapshot,facts:RustPresentationFacts,frame:RustCombatPresentationFrame,reads:RustLanReads,acknowledged:Record<number,number>,simulationMs:number):CombatSnapshot {
  const bodies=new Map(snapshot.bodies.map(b=>[b.id,b])),definitions=new DisplayDefinitionCapture(),weaponDefinitions=new Map<string,unknown>();
  const getWeapon=(key:string)=>{const spec=this.weapons.get(key);if(!spec)throw Error('Unknown Rust LAN weapon definition');return spec;};
  const weaponDefinition=(key:string)=>{if(weaponDefinitions.has(key))return weaponDefinitions.get(key);const definition=definitions.reference(getWeapon(key));weaponDefinitions.set(key,definition);return definition;};
  const byId=new Map<number,RustPresentationShipRecords>(),byHandle=new Map<string,RustPresentationShipRecords>(),records=new Map<string,RustPresentationShipRecords>();
  if(frame.shipRecords.size!==facts.ships.length)throw Error('Incomplete Rust LAN projected records');
  for(const fact of facts.ships){const body=bodies.get(fact.id),record=frame.shipRecords.get(fact.id),projected=record?.fact;
   if(!body||!record||!projected||projected.id!==fact.id||projected.stableId!==fact.stableId||projected.specKey!==fact.specKey
    ||projected.handle.slot!==fact.handle.slot||projected.handle.generation!==fact.handle.generation
    ||body.handle.slot!==fact.handle.slot||body.handle.generation!==fact.handle.generation||byId.has(fact.id)||records.has(fact.stableId))throw Error('Missing or rebound Rust LAN display binding');
   byId.set(fact.id,record);byHandle.set(fact.handle.slot+':'+fact.handle.generation,record);records.set(fact.stableId,record);}
  const handle=(h:{slot:number;generation:number})=>{const r=byHandle.get(h.slot+':'+h.generation);if(!r)throw Error('Unknown Rust LAN display reference');return r;};
  const children=new Map<RustPresentationShipRecords,RustPresentationShipRecords[]>(),assemblies=new Map<RustPresentationShipRecords,RustPresentationShipRecords[]>();
  for(const record of byId.values())if(record.fact.parent){const parent=handle(record.fact.parent),list=children.get(parent)??[];list.push(record);children.set(parent,list);}
  const tree=(record:RustPresentationShipRecords):RustPresentationShipRecords[]=>[record,...(children.get(record)??[]).flatMap(tree)];
  const assembly=(record:RustPresentationShipRecords)=>{let root=record;while(root.fact.parent)root=handle(root.fact.parent);let members=assemblies.get(root);if(!members){members=tree(root);assemblies.set(root,members);}return members;};
  const shipReads=new Map(reads.ships.map(s=>[s.id,s])),systemReads=new Map(reads.systems.map(s=>[s.id+':'+s.systemId,s])),mountReads=new Map(reads.mounts.map(m=>[m.id+':'+m.componentId,m]));
  if(shipReads.size!==facts.ships.length)throw Error('Incomplete Rust LAN body reads');
  const host=this.seats.find(seat=>seat.seat===0);if(!host)throw Error('Missing Rust LAN host perspective');
  const hostTeam=handle(host.handle).fact.team,rows=new Map<string,Record<string,unknown>>();
  for(const record of byId.values()){
   const {render,hud,fact}=record,s=bodies.get(fact.id)!.ship!,q=s.shield!,f=s.flux,extra=shipReads.get(fact.id)!;
   const lives=new Map(s.systems.map(system=>[system.id,system.values])),states=new Map(s.weapons!.mounts.map(mount=>[mount[0],mount])),components=new Map(s.components.map(component=>[component.id,component.values]));
   const slots=new Map(fact.mounts.map(mount=>[mount.componentId,mount.slotId])),systemIndices=new Map(fact.systems.map((system,i)=>[system.systemId,i]));
   const systems=fact.systems.map((system,i)=>{
    const life=lives.get(system.systemId),n=systemReads.get(fact.id+':'+system.systemId);if(!life||!n)throw Error('Missing Rust LAN system reads');
    const display={...render.allSystems[i],...hud.allSystems[i],activationSerial:life[9],gravityManeuver:system.gravityManeuver,
     definitionData:definitions.reference(system.definition),forcesAutofire:!!(n.bits&8),blocksWeapons:!!(n.bits&16),forcesForward:!!(n.bits&128),locksTurning:!!(n.bits&64),
     forcesBraking:n.forcesBraking,blocksAcceleration:!!(n.bits&2),blocksStrafing:!!(n.bits&4),isPhased:n.isPhased,fluxCosts:n.fluxCosts,fireRates:n.fireRates,
     fireSlots:n.fireComponents.map(id=>{const slot=slots.get(id);if(slot===undefined)throw Error('Unknown Rust LAN fire slot');return slot;})};
    delete (display as {definition?:unknown}).definition;return display;
   });
   const si=(id:number)=>{const index=systemIndices.get(id);if(index===undefined)throw Error('Unknown Rust LAN system slot');return index;};
   const mounts=fact.mounts.map((mount,i)=>{const display=render.weapons[i],state=states.get(mount.componentId),health=components.get(mount.componentId),n=mountReads.get(fact.id+':'+mount.componentId);if(!state||!health||!n)throw Error('Missing Rust LAN weapon speed');
    return Object.assign(pick(display),hud.weapons[i],{spec:undefined,weaponSpec:weaponDefinition(mount.weaponKey),displayRange:mount.range,displaySpeed:n.speed,
     ammo:state[17],barrelIndex:state[30],burstRemaining:state[20],reloadDelayRemaining:s.weapons!.values[21]>0||state[27]>0?state[27]:undefined,isPermanentlyDisabled:health[8]===1,presentationRelativeAngle:mount.presentationRelativeAngle});});
   for(const mount of mounts)delete (mount as {spec?:unknown}).spec;
   const shield=Object.assign(pick(render.shield,shieldExcluded),{
    maxArcDeg:q[1],currentArcDeg:q[7],targetFacingAngleRad:q[9],toggleLocked:q[5]===1,pendingRaise:q[11]===1,closeTimeRemaining:q[10],unfoldRateMultiplier:q[12],phaseStageTimer:q[23],phaseCooldownDuration:q[19],phaseMinSpeedFluxThresholdMultiplier:q[16]});
   rows.set(fact.stableId,Object.assign(append(pick(render),hud),{isPlayer:fact.team===hostTeam,
    sourceCarrier:fact.sourceCarrier?handle(fact.sourceCarrier).render:undefined,parentShip:fact.parent?handle(fact.parent).render:undefined,
    childModules:(children.get(record)??[]).map(c=>c.render),assemblyShips:assembly(record).map(c=>c.render),shield,
    flux:{softFlux:f[8],hardFlux:f[9],maxFlux:f[0],isOverloaded:f[11]===1,isVenting:f[14]===1,overloadTimer:f[12],overloadDuration:f[13],ventProgress:f[15],isEngineBoostActive:f[18]===1,hullSize:render.spec.hullSize,ventTime:hud.timeToVent},
    armor:hud.armor,engineController:{...render.engineController,isFlamedOut:s.engines!.values[4]!==0},
    systems:fact.tacticalSystemIds.map(id=>systems[si(id)]),allSystems:systems,system:systems[si(fact.primarySystemId)],defenseSystem:fact.defenseSystemId===undefined?undefined:systems[si(fact.defenseSystemId)],weapons:mounts,
    teleportSequence:extra.teleportSequence,subjectiveTimeMultiplier:extra.subjectiveTimeMultiplier,aimTargetWorld:new Vector2(...extra.aim),defenseFacingRad:extra.defenseFacingRad,aiHoldOffensiveFire:extra.aiHoldOffensiveFire,
    flightDeckWingId:fact.flightDeckWingId,isSystemDrone:fact.isSystemDrone,sightRadius:fact.sightRadius,flameoutRatio:fact.flameoutRatio,significantEnemies:fact.significantEnemiesInRange,
    externalPhased:extra.externalPhased,externalPhaseAlpha:extra.externalPhaseAlpha,phaseAlphaMultiplier:extra.phaseAlphaMultiplier,motionStats:extra.motionStats,motionFlags:{forcedRightTurn:extra.forcedRightTurn}}));
  }
  const refs=new Map<object,string>();for(const r of byId.values()){refs.set(r.render,r.fact.stableId);refs.set(rows.get(r.fact.stableId)!,r.fact.stableId);}
  // The shared render view references its own data facades; identify those too.
  const view=frame.presentation.view;for(const ship of [...view.ships,...view.allCapitalShips])refs.set(ship,ship.id);
  const packer=new DisplayPacker(refs),pack=(value:unknown,plain=false)=>packer.pack(value,0,plain);
  const craftSpecs:unknown[]=[],specIndexes=new Map<string,number>();
  const emit=(id:string)=>{const row=rows.get(id),r=records.get(id);if(!row||!r)throw Error('Unknown Rust LAN roster identity');let index=specIndexes.get(r.fact.specKey);
   if(index===undefined){index=craftSpecs.length;craftSpecs.push(r.render.spec);specIndexes.set(r.fact.specKey,index);}const state:Record<string,unknown>={};for(const key of Object.keys(row))state[key]=pack(row[key]);return {id,spec:index,state};};
  const capitals=new Set(facts.rosters.allCapitalShips),fighters=new Set(facts.rosters.fighters),bombers=new Set(facts.rosters.bombers);
  const crafts=[...rows.keys()].filter(id=>!capitals.has(id)).map(id=>({...emit(id),kind:fighters.has(id)?'fighter' as const:bombers.has(id)?'bomber' as const:records.get(id)!.fact.isSystemDrone?'drone' as const:'detached' as const}));
  const wings=(side:number)=>reads.wings.filter(w=>w.side===side).map(wing=>{const {carrier,...display}=wing;delete (display as {side?:number}).side;return {...display,carrierId:handle(carrier).fact.stableId};});
  return {displayVersion:2,displayDefinitions:definitions.entries,tick:snapshot.tick,acknowledged:{...acknowledged},simulationMs,ships:facts.rosters.allCapitalShips.map(emit),crafts,craftSpecs,layouts:packer.layouts,
   controlled:Object.fromEntries(this.seats.map(s=>[s.seat,s.stableId])),deployment:{limit:facts.deployment.limit,rows:facts.deployment.rows.map(r=>({...r}))},
   displayWings:{player:pack(wings(0)),enemy:pack(wings(1))},displayWorld:pack({multiTeamBattle:facts.multiTeamBattle,openBattlefield:facts.openBattlefield,simulationPointLimit:facts.deployment.simulationLimit,
    commandPoints:facts.tactical.commandPoints,orders:facts.tactical.orders,shipLossNotifications:facts.shipLossNotifications},true),
   world:pack({combatTime:view.combatTime,cameraShakeIntensity:view.cameraShakeIntensity,battleResult:facts.battleResult,environment:view.environment,projectiles:view.projectiles,beams:view.beams,
    fxSystem:{particles:view.particles,contrails:view.contrails,debris:view.debris,explosions:view.explosions,hitGlows:view.hitGlows,movingRayFades:view.movingRayFades,empArcs:view.empArcs,muzzleFlashes:view.muzzleFlashes,muzzleParticles:view.muzzleParticles,
     shieldRipples:view.shieldRipples,hulkFragments:view.hulkFragments,floatingTexts:frame.presentation.hud.floatingTexts},asteroidSystem:{asteroids:view.asteroids},nebulaSystem:{nebulae:view.nebulae},mineSystem:{mines:view.mines}},true)};
 }
}
