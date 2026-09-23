import {projectOriginalNativeLogisticsHud} from '../../../src/campaign/rules/OriginalNativeLogisticsHud.mjs';
import {captureNativeFrameEffects} from './FrameEffects.mjs';
import {projectNativeColonyManagement} from './ColonyManagement.mjs';
import {createOriginalAbilitySlots,validateOriginalAbilitySlots,populateOriginalNewAbilitySlots,changeOriginalAbilityBar,originalAbilityForSlot,projectOriginalAbilityBar} from '../../../src/campaign/rules/OriginalCampaignAbilityBar.mjs';
import {isOriginalCampaignAbility,originalAbilityUsable} from '../../../src/campaign/rules/OriginalCampaignAbilities.mjs';
import {isOriginalCampaignPlanet} from '../../../src/campaign/rules/OriginalCampaignPlanet.mjs';
import {isOriginalCargoPods} from '../../../src/campaign/rules/OriginalCargoPods.mjs';
import {createHash} from 'node:crypto';
import {NativeCampaignRuntime} from './NativeCampaignRuntime.mjs';
import {identifier,integer,finite,isRecord,immutableJSON,requireThat} from '../../../src/campaign/core/Values.mjs';
const check=(value,code,message)=>requireThat(value,code,message);
export const NATIVE_DEVELOPMENT_SCOPE='native-campaign-development-world';
const exact=(value,keys,label)=>check(isRecord(value)&&Object.keys(value).every(k=>keys.includes(k)),'INVALID_NATIVE_WORLD','Unexpected '+label+' fields');
const reference=value=>check(typeof value==='string'&&value.length>0&&value.length<=1024,'INVALID_NATIVE_WORLD','Actual native object reference required');
function fleetFor(runtime,dataRef){reference(dataRef);const fleet=runtime.fleetDataFactoryState().fleets.find(f=>f.dataRef===dataRef);check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','NATIVE_FLEET_NOT_FOUND','Actual constructed fleet required');return fleet;}
// Native removal can retain containingLocation; actual repository membership proves liveness.
const contactIdFor=(state,playerId,observerDataRef,targetRef)=>createHash('sha256').update(JSON.stringify([state.id,playerId,observerDataRef,targetRef])).digest('hex');
const activeFleet=fleet=>fleet.campaign.entity.containingLocation?.repository.contains.includes(fleet)===true&&!fleet.campaign.entity.expired;
/** Only trusted server creation may install ownership bindings. They are not a player command. */
function controllersFor(runtime,value){
 check(Array.isArray(value)&&value.length>0&&value.length<=128,'INVALID_NATIVE_WORLD','Native controller bindings required');const players=new Set(),fleets=new Set();
 const bindings=immutableJSON(value);for(const binding of bindings){exact(binding,['playerId','fleetDataRefs'],'controller');identifier(binding.playerId);check(!players.has(binding.playerId),'INVALID_NATIVE_WORLD','Duplicate native controller');players.add(binding.playerId);check(Array.isArray(binding.fleetDataRefs)&&binding.fleetDataRefs.length>0,'INVALID_NATIVE_WORLD','Owned native fleets required');
  for(const ref of binding.fleetDataRefs){fleetFor(runtime,ref);check(!fleets.has(ref),'INVALID_NATIVE_WORLD','Native fleet has more than one owner binding');fleets.add(ref);}
 }return bindings;
}
function colonyControllersFor(runtime,controllers,value){
 if(value===null)return null;
 check(Array.isArray(value)&&value.length<=4096,'INVALID_NATIVE_WORLD','Explicit native colony ownership bindings required');const seen=new Set();
 const bindings=immutableJSON(value);for(const binding of bindings){exact(binding,['marketId','playerId','financeDataRef'],'colony controller');identifier(binding.marketId);identifier(binding.playerId);reference(binding.financeDataRef);
  const controller=controllers.find(c=>c.playerId===binding.playerId);check(controller?.fleetDataRefs.includes(binding.financeDataRef),'INVALID_NATIVE_WORLD','Colony treasury fleet must belong to its owner');
  check(!seen.has(binding.marketId),'INVALID_NATIVE_WORLD','Colony cannot have two independent owners');seen.add(binding.marketId);
  check(runtime.market(binding.marketId).playerOwned===true,'INVALID_NATIVE_WORLD','Colony owner binding requires an actually player-owned market');fleetFor(runtime,binding.financeDataRef);
 }return bindings;
}
function colonyFinanceReason(state,binding){
 const fleet=fleetFor(state.runtime,binding.financeDataRef);
 if(fleet!==state.runtime.playerEconomyState().fleet)return 'NATIVE_COLONY_FINANCE_CONTEXT_UNAVAILABLE';
 if(!activeFleet(fleet))return 'NATIVE_FLEET_INACTIVE';
 if(state.runtime.nativeRetainedEncounterState().entries.some(e=>e.ownerFleet===fleet&&e.aftermath?.phase!=='finished'))return 'NATIVE_INTERACTION_OPEN';
 return null;
}
function colonyViewFor(state,playerId){
 if(state.colonyControllers===null)return null;
 const owned=state.colonyControllers.filter(row=>row.playerId===playerId);
 return projectNativeColonyManagement(state.runtime,{marketIds:owned.map(row=>row.marketId),canConstruct:marketId=>{const binding=owned.find(row=>row.marketId===marketId);return binding?colonyFinanceReason(state,binding):'FORBIDDEN';}});
}
export function isNativeDevelopmentWorld(value){return value?.scope===NATIVE_DEVELOPMENT_SCOPE;}
export function restoreNativeDevelopmentWorld(value){
 exact(value,['scope','schemaVersion','id','revision','controllers','checkpoint','abilityBars','colonyControllers'],'native world');check(isNativeDevelopmentWorld(value)&&[1,2,3].includes(value.schemaVersion),'SAVE_VERSION','Unsupported native development world');identifier(value.id);integer(value.revision,'native world revision');
 check(value.schemaVersion===3||!Object.hasOwn(value,'colonyControllers'),'SAVE_VERSION','Older world cannot contain colony ownership bindings');
 const runtime=NativeCampaignRuntime.fromCheckpoint(value.checkpoint),controllers=controllersFor(runtime,value.controllers),abilityBars=value.schemaVersion===1?null:restoreAbilityBars(value.abilityBars,controllers),colonyControllers=colonyControllersFor(runtime,controllers,value.schemaVersion<3?null:value.colonyControllers);return {id:value.id,revision:value.revision,controllers,runtime,abilityBars,colonyControllers};
}
export function createNativeDevelopmentWorld(input){
 exact(input,['id','controllers','checkpoint','colonyControllers'],'native creation');const state=restoreNativeDevelopmentWorld({...input,colonyControllers:input.colonyControllers??null,abilityBars:null,scope:NATIVE_DEVELOPMENT_SCOPE,schemaVersion:3,revision:0});state.abilityBars=state.controllers.flatMap(c=>c.fleetDataRefs.map(dataRef=>({playerId:c.playerId,dataRef,slots:populateOriginalNewAbilitySlots(createOriginalAbilitySlots(),fleetFor(state.runtime,dataRef))})));return {state,envelope:nativeDevelopmentEnvelope(state)};
}
export function nativeDevelopmentEnvelope(state){return {scope:NATIVE_DEVELOPMENT_SCOPE,schemaVersion:3,id:state.id,revision:state.revision,controllers:state.controllers,colonyControllers:state.colonyControllers,abilityBars:state.abilityBars,checkpoint:state.runtime.checkpoint()};}
function restoreAbilityBars(value,controllers){
 if(value===null)return null;check(Array.isArray(value),'INVALID_NATIVE_WORLD','Actual saved per-controller UI state required');const rows=structuredClone(value),seen=new Set();
 for(const row of rows){exact(row,['playerId','dataRef','slots'],'ability bar');const key=JSON.stringify([row.playerId,row.dataRef]);check(!seen.has(key)&&controllers.some(c=>c.playerId===row.playerId&&c.fleetDataRefs.includes(row.dataRef)),'INVALID_NATIVE_WORLD','Ability bar ownership mismatch');seen.add(key);validateOriginalAbilitySlots(row.slots);}
 check(rows.length===controllers.reduce((n,c)=>n+c.fleetDataRefs.length,0),'INVALID_NATIVE_WORLD','Missing saved controlled ability bar');return rows;
}
function abilityBarFor(state,playerId,dataRef){return state.abilityBars?.find(b=>b.playerId===playerId&&b.dataRef===dataRef)??null;}
function abilityBlockReason(state,fleet){
 if(!activeFleet(fleet))return 'NATIVE_FLEET_INACTIVE';if(state.runtime.nativeRetainedEncounterState().entries.some(e=>e.ownerFleet===fleet&&e.aftermath?.phase!=='finished'))return 'NATIVE_INTERACTION_OPEN';
 if(fleet!==state.runtime.playerEconomyState().fleet||fleet.isPlayerFleet!==true||fleet.aiMode!==false)return 'NATIVE_PLAYER_ABILITY_CONTEXT_UNAVAILABLE';
 if(fleet.campaign.flags.isInJumpTransition!==null)return 'IN_TRANSITION';
 const listeners=state.runtime.fleetWorldState()?.campaignListeners;if(!listeners||['saved','transient','timed'].some(k=>!Array.isArray(listeners[k])||listeners[k].length>0))return 'NATIVE_ABILITY_LISTENERS_UNAVAILABLE';return null;
}
export function nativeDevelopmentSummary(state){return immutableJSON({scope:NATIVE_DEVELOPMENT_SCOPE,worldId:state.id,revision:state.revision,readyForAuthority:false,status:'development-incomplete',capabilities:['native-fleet-navigation-inputs','native-fleet-graphics-transaction','native-loot-cargo-transactions','native-owned-ability-inputs'],fleetCount:state.runtime.fleetDataFactoryState().fleets.filter(f=>f.campaign).length});}
export function authorizeNativeDevelopmentPrincipal(state,principal){
 exact(principal,['kind','id'],'principal');check(['system','player'].includes(principal.kind),'FORBIDDEN','Unknown principal');identifier(principal.id);if(principal.kind==='player')check(state.controllers.some(c=>c.playerId===principal.id),'FORBIDDEN','Player is not in this native world');return principal;
}
export function validateNativeDevelopmentCommand(input){
 exact(input,['worldId','epoch','requestId','type','payload','expectedRevision'],'native command');const c=immutableJSON(input);for(const k of ['worldId','epoch','requestId','type'])identifier(c[k],k);integer(c.expectedRevision,'expected native revision');check(isRecord(c.payload),'INVALID_COMMAND','Native payload required');return c;
}
export function projectNativeDevelopmentPlayer(state,playerId){
 authorizeNativeDevelopmentPrincipal(state,{kind:'player',id:playerId});const binding=state.controllers.find(c=>c.playerId===playerId);
 return immutableJSON({...nativeDevelopmentSummary(state),fleetCount:binding.fleetDataRefs.length,capabilities:['native-fleet-navigation-inputs','native-loot-cargo-transactions','native-owned-ability-inputs','native-owned-colony-management','native-owned-logistics-hud'],playerId,disclosure:'controlled-fleet-state-and-open-loot',colonyManagement:colonyViewFor(state,playerId),colonyControls:state.colonyControllers===null?null:state.colonyControllers.filter(row=>row.playerId===playerId).map(row=>({marketId:row.marketId,dataRef:row.financeDataRef})),lootWindows:state.runtime.nativeRetainedEncounterState().entries.filter(entry=>binding.fleetDataRefs.includes(entry.ownerFleet.dataRef)&&entry.aftermath?.phase==='loot-open').map(entry=>({encounterId:entry.encounterId,dataRef:entry.ownerFleet.dataRef,cargo:state.runtime.nativeFleetLootCargoView(entry.encounterId)})),fleets:binding.fleetDataRefs.map(ref=>{const f=fleetFor(state.runtime,ref),c=f.campaign;const bar=abilityBarFor(state,playerId,ref);return {dataRef:ref,name:f.name,logisticsHud:projectOriginalNativeLogisticsHud(f,{playerObserver:true,difficulty:state.runtime.sensorState()?.difficulty??null}),abilityBar:bar===null?null:projectOriginalAbilityBar(bar.slots,f,{commandBlockReason:abilityBlockReason(state,f)}),position:[...f.position],locationRef:c.entity.containingLocation?.objectRef??null,expired:c.entity.expired,navigation:{destination:c.moveDestination,override:c.moveOverride,goSlow:c.flags.goSlowOneFrame,stop:c.flags.goSlowStop,targetContactId:c.interactionTarget===null?null:contactIdFor(state,playerId,ref,c.interactionTarget)}};})});
}
/** Runs on the resident graph; Repository restores the committed graph on any failed transaction. */
export function applyNativeDevelopmentCommand(state,principal,command){
 const actor=authorizeNativeDevelopmentPrincipal(state,principal),c=validateNativeDevelopmentCommand(command);check(c.worldId===state.id,'WRONG_WORLD','Native command is for another world');check(c.expectedRevision===state.revision,'VERSION_CONFLICT','Native world changed');
 const p=c.payload,runtime=state.runtime;
 if(actor.kind==='player')check(state.controllers.find(row=>row.playerId===actor.id).fleetDataRefs.includes(p.dataRef),'FORBIDDEN','Fleet is not controlled by this player');
 const fleet=fleetFor(runtime,p.dataRef);let result;
 switch(c.type){
   case 'native.colony.construction': {
    exact(p,['dataRef','marketId','action'],'colony construction');identifier(p.marketId);check(actor.kind==='player','FORBIDDEN','Colony management requires an authenticated owner');
    const binding=state.colonyControllers?.find(row=>row.marketId===p.marketId&&row.playerId===actor.id);
    check(binding&&binding.financeDataRef===p.dataRef,'FORBIDDEN','Colony and treasury must belong to this authenticated player');
    const reason=colonyFinanceReason(state,binding);check(reason===null,reason??'INVALID_COMMAND','Actual colony treasury context is unavailable');
    const construction=runtime.applyNativeColonyConstruction(p.marketId,p.action);
    result={dataRef:p.dataRef,marketId:p.marketId,construction,colonyManagement:colonyViewFor(state,actor.id)};break;
   }
   case 'native.ability.press': {
    exact(p,['dataRef','slotIndex','abilityId'],'ability press');check(actor.kind==='player','FORBIDDEN','Ability press requires an authenticated player');
    const bar=abilityBarFor(state,actor.id,p.dataRef);check(bar,'NATIVE_ABILITY_UI_UNAVAILABLE','No saved ability layout');const reason=abilityBlockReason(state,fleet);check(reason===null,reason??'INVALID_COMMAND','Native player ability context unavailable');
    const ability=originalAbilityForSlot(bar.slots,fleet,p.slotIndex);check(isOriginalCampaignAbility(ability)&&ability.id===p.abilityId,'NATIVE_ABILITY_SLOT_CHANGED','The displayed ability is no longer assigned to this slot');check(originalAbilityUsable(ability),'NATIVE_ABILITY_UNUSABLE','Native button is disabled');
    const changed=runtime.changeNativeFleetAbility(p.dataRef,p.abilityId,'press',{currentLocation:fleet.campaign.entity.containingLocation});
    result={dataRef:p.dataRef,abilityBar:projectOriginalAbilityBar(bar.slots,fleet),effects:changed.effects.filter(e=>e.type==='ui-sound').map(e=>({kind:'ability-ui-sound',id:e.soundId,pitch:e.pitch,volume:e.volume}))};break;
   }
   case 'native.ability-bar.change': {
    exact(p,['dataRef','action'],'ability bar gesture');check(actor.kind==='player','FORBIDDEN','Ability UI requires an authenticated player');const bar=abilityBarFor(state,actor.id,p.dataRef);check(bar,'NATIVE_ABILITY_UI_UNAVAILABLE','No saved ability layout');check(activeFleet(fleet),'NATIVE_FLEET_INACTIVE','Actual fleet required');check(!runtime.nativeRetainedEncounterState().entries.some(e=>e.ownerFleet===fleet&&e.aftermath?.phase!=='finished'),'NATIVE_INTERACTION_OPEN','Ability bar hidden during interaction');changeOriginalAbilityBar(bar.slots,p.action);result={dataRef:p.dataRef,abilityBar:projectOriginalAbilityBar(bar.slots,fleet,{commandBlockReason:abilityBlockReason(state,fleet)})};break;
   }
  case 'native.loot.actions': {
   exact(p,['dataRef','encounterId','actions'],'loot actions');reference(p.encounterId);
   const entry=runtime.nativeRetainedEncounterState().entries.find(row=>row.encounterId===p.encounterId);
   check(entry?.ownerFleet===fleet,'FORBIDDEN','Encounter is not held by this controlled fleet');check(entry.aftermath?.phase==='loot-open','NATIVE_LOOT_CLOSED','The actual loot window is not open');
   result={dataRef:p.dataRef,encounterId:p.encounterId,cargo:runtime.applyNativeFleetLootCargoActions(p.encounterId,p.actions)};break;
  }
  case 'native.fleet.navigate': {
   check(actor.kind==='player','FORBIDDEN','Map selection requires an authenticated player observer');exact(p,['dataRef','x','y'],'map selection');finite(p.x,'map x');finite(p.y,'map y');check(activeFleet(fleet),'NATIVE_FLEET_INACTIVE','Observer is not in a live location');
   check(!runtime.nativeRetainedEncounterState().entries.some(e=>e.ownerFleet===fleet&&e.aftermath?.phase!=='finished'),'NATIVE_INTERACTION_OPEN','Finish the actual interaction before navigating');
   const target=runtime.findNativePlayerNavigationTarget(p.dataRef,p.x,p.y);let effects=[];
   if(target!==null){check(fleet.campaign.noCombat===null,'NATIVE_NAVIGATION_CONTEXT_UNAVAILABLE','Player battle timestamp required before changing active disengagement protection');const followed=runtime.followNativePlayerNavigationTarget(p.dataRef,target);effects=followed.effects.map(e=>({kind:e.kind,contactId:contactIdFor(state,actor.id,p.dataRef,e.entity.objectRef)}));}
   else runtime.setNativePlayerMovementDestination(p.dataRef,p.x,p.y);
   result={dataRef:p.dataRef,mode:target?'follow':'move',targetContactId:target?contactIdFor(state,actor.id,p.dataRef,target.objectRef):null,destination:fleet.campaign.moveDestination,override:fleet.campaign.moveOverride,effects};break;
  }
  case 'native.fleet.set-destination':
   exact(p,['dataRef','x','y'],'destination');finite(p.x,'destination x');finite(p.y,'destination y');check(activeFleet(fleet),'NATIVE_FLEET_INACTIVE','Fleet is not in a live location');
   // A player never gets the native moveOverride bypass.
   runtime.setNativePlayerMovementDestination(p.dataRef,p.x,p.y);result={dataRef:p.dataRef,destination:fleet.campaign.moveDestination,override:fleet.campaign.moveOverride};break;
  case 'native.fleet.go-slow':
   exact(p,['dataRef','stop'],'slow request');check(!Object.hasOwn(p,'stop')||typeof p.stop==='boolean','INVALID_COMMAND','Slow stop flag must be boolean');check(activeFleet(fleet),'NATIVE_FLEET_INACTIVE','Fleet is not in a live location');runtime.requestNativeFleetGoSlow(p.dataRef,p.stop);result={dataRef:p.dataRef,goSlow:fleet.campaign.flags.goSlowOneFrame,stop:fleet.campaign.flags.goSlowStop};break;
  case 'native.fleet.capture-graphics':
   check(actor.kind==='system','FORBIDDEN','Low-level fleet graphics are internal; scene visibility projection is not yet connected');exact(p,['dataRef','alpha'],'graphics capture');finite(p.alpha,'sensor-adjusted graphics alpha',0,1);
   result={scope:'native-fleet-graphics-layer-only',dataRef:p.dataRef,graphics:runtime.renderNativeFleetGraphics(p.dataRef,p.alpha,{readFleetViewLightPosition:light=>{const position=light.position??light.campaign?.entity?.position;check(Array.isArray(position)&&position.length===2&&position.every(Number.isFinite),'NATIVE_LIGHT_UNAVAILABLE','Actual light-source position required');return position;}})};break;
  default:check(false,'UNSUPPORTED_COMMAND','Native development command is not implemented');
 }
 return {result:immutableJSON(result),events:[{type:c.type,data:{dataRef:p.dataRef}}]};
}

/** Instantaneous sensor data only. No observer faders, raw GPU frames or private graph escape here. */
export function projectNativeDevelopmentObservations(state,playerId,observerDataRef){
 authorizeNativeDevelopmentPrincipal(state,{kind:'player',id:playerId});const controller=state.controllers.find(c=>c.playerId===playerId);check(controller.fleetDataRefs.includes(observerDataRef),'FORBIDDEN','Observer must be controlled by the authenticated player');
 const observer=fleetFor(state.runtime,observerDataRef);check(activeFleet(observer),'NATIVE_FLEET_INACTIVE','Observer is not in a live location');const location=observer.campaign.entity.containingLocation,contacts=[];
 for(const target of location.repository.contains){
  const pod=isOriginalCargoPods(target),planet=isOriginalCampaignPlanet(target),nonFleet=pod||planet,entity=nonFleet?target.entity:target.campaign?.entity;
  check(entity,'UNSUPPORTED_NATIVE_OBSERVATION','Actual registered campaign entity required');
  if(entity.containingLocation!==location||entity.expired||nonFleet&&!target.worldRegistered||!nonFleet&&target.campaign.flags.hidden!==null)continue;
  const visibility=target===observer?'COMPOSITION_AND_FACTION_DETAILS':planet?state.runtime.planetVisibilityForPlayerObserver(target,observerDataRef):pod?state.runtime.cargoPodsVisibilityForPlayerObserver(target,observerDataRef):state.runtime.fleetVisibilityForPlayerObserver(target.dataRef,observerDataRef);if(visibility==='NONE')continue;
  // Same shape for every contact: no entity type, inventory or internal reference leaks at range.
  // Opaque per-player/per-observer IDs are navigation handles, never authorization tokens.
  const contactId=contactIdFor(state,playerId,observerDataRef,target.objectRef);
  contacts.push({contactId,position:[...target.position],visibility,controlledDataRef:!nonFleet&&controller.fleetDataRefs.includes(target.dataRef)?target.dataRef:null,identity:visibility==='COMPOSITION_AND_FACTION_DETAILS'?{name:nonFleet?entity.name:target.name,factionId:planet?state.runtime.planetFactionId(target):pod?target.faction.factionId:target.factionId}:null});
 }
 return immutableJSON({scope:'native-current-fleet-sensor-observations',worldId:state.id,revision:state.revision,readyForAuthority:false,presentation:'not-an-animated-scene',observer:{dataRef:observerDataRef,locationRef:location.objectRef,position:[...observer.position]},contacts});
}

/** Trusted input/control subphase, before the owner's real world dispatch. Never an HTTP tick. */
export function advanceNativeDevelopmentNavigation(state,context){
 check(typeof context?.paused==='boolean','INVALID_NATIVE_CONTROL','Actual world pause state required');const result=[];
 for(const controller of state.controllers)for(const dataRef of controller.fleetDataRefs){const fleet=fleetFor(state.runtime,dataRef);if(!activeFleet(fleet))continue;
  const interacting=state.runtime.nativeRetainedEncounterState().entries.some(e=>e.ownerFleet===fleet&&e.aftermath?.phase!=='finished');
  result.push({playerId:controller.playerId,dataRef,updated:state.runtime.advanceNativePlayerTargetNavigation(dataRef,{paused:context.paused||interacting})});
 }
 return {scope:'native-controlled-target-navigation-only',fleets:result,readyForAuthority:false};
}

/** Host-only frame input; deliberately NOT a native player command or an HTTP route. */
export function validateNativeDevelopmentFrame(input){
 const value=immutableJSON(input);
 exact(value,['worldId','epoch','requestId','expectedRevision','fromFrame','seconds','paused','fastAdvance','isFastForwardIteration','skipMarketAdvance'],'host frame');
 for(const key of ['worldId','epoch','requestId'])identifier(value[key]);integer(value.expectedRevision,'native frame revision');
 check(typeof value.fromFrame==='string'&&/^-?(0|[1-9][0-9]*)$/.test(value.fromFrame)&&value.fromFrame.length<=20,'INVALID_NATIVE_FRAME','Actual signed native frame required');
 const frame=BigInt(value.fromFrame);check(String(BigInt.asIntN(64,frame))===value.fromFrame,'INVALID_NATIVE_FRAME','Native frame outside signed long range');
 // A host safety bound, not a change to original internal 60-slot background stepping.
 finite(value.seconds,'native host frame seconds',0,1);
 for(const key of ['paused','fastAdvance','isFastForwardIteration','skipMarketAdvance'])check(typeof value[key]==='boolean','INVALID_NATIVE_FRAME','Explicit host frame flag required: '+key);
 return value;
}
export function requireNativeDevelopmentFrame(state,frame){
 check(frame.worldId===state.id,'INVALID_NATIVE_FRAME','Wrong frame world');
 const engine=state.runtime.nativeEngineFrameState();check(engine!==null,'NATIVE_WORLD_FRAME_UNAVAILABLE','Actual engine history is not bound');
 check(engine.frame===frame.fromFrame,'NATIVE_FRAME_CONFLICT','Native engine frame changed');
 return engine;
}
/** Mutates the resident graph: caller MUST supply rollback and exclusive persistence. */
export function advanceNativeDevelopmentFrame(state,frame,prepare){
 const engine=requireNativeDevelopmentFrame(state,frame),runtime=state.runtime;
 check(typeof prepare==='function','NATIVE_WORLD_FRAME_UNAVAILABLE','Actual host frame dependency factory required');
 const context={paused:frame.paused,fastAdvance:frame.fastAdvance,isFastForwardIteration:frame.isFastForwardIteration,skipMarketAdvance:frame.skipMarketAdvance,
  get playerFleet(){return runtime.playerEconomyState().fleet;},input:null,campaignHelp:null};
 const before=String(runtime.nativeClockSnapshot().timestamp),options=prepare(runtime,context);
 check(options&&typeof options.then!=='function','INVALID_NATIVE_FRAME','Host frame dependencies must be synchronous');
 check(runtime.nativeEngineFrameState()===engine&&engine.frame===frame.fromFrame,'NATIVE_FRAME_CONFLICT','Dependency binding cannot advance or replace the engine');
 const navigation=advanceNativeDevelopmentNavigation(state,context);
 const dispatch=runtime.advanceNativeEngineFrame(frame.seconds,context,options),effects=captureNativeFrameEffects(dispatch.effects,state.controllers,{readPlayerBaseColor:()=>runtime.nativeFactionRelationsState()?.factions.find(faction=>faction.factionId==='player')?.specBaseUIColor});
 return {result:{scope:'native-authority-frame-transaction',fromFrame:frame.fromFrame,frame:dispatch.frame,fromTimestamp:before,timestamp:String(runtime.nativeClockSnapshot().timestamp),navigation,effects,readyForAuthority:false},
  events:[{type:'native.world.frame',data:{fromFrame:frame.fromFrame,frame:dispatch.frame,effects}}]};
}
