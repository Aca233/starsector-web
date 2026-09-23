import {createOriginalPingScript,advanceOriginalPingScript,originalPingScriptIsDone,advanceOriginalActionIndicator,originalActionIndicatorCanCleanUp} from '../../../src/campaign/rules/OriginalCampaignPings.mjs';
import {renderOriginalActionIndicator} from '../../../src/campaign/rules/OriginalCampaignPingDraw.mjs';
import {isOriginalCampaignPlanet} from '../../../src/campaign/rules/OriginalCampaignPlanet.mjs';
import {renderOriginalCampaignPlanetLayers} from '../../../src/campaign/rules/OriginalCampaignPlanetDraw.mjs';
import {createOriginalCampaignBackgroundView,renderOriginalCampaignBackground} from '../../../src/campaign/rules/OriginalCampaignBackground.mjs';
/** Authenticated, host-owned VISUAL state. Never a world tick or saved world mutation. */
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {requireThat,immutableJSON,isRecord} from '../../../src/campaign/core/Values.mjs';
import {createOriginalCampaignMemory} from '../../../src/campaign/rules/OriginalCampaignMemory.mjs';
import {isOriginalCargoPods} from '../../../src/campaign/rules/OriginalCargoPods.mjs';
import {originalFleetSensorRadius} from '../../../src/campaign/rules/OriginalSensors.mjs';
import {createOriginalObserverRebindReferences,rebindOriginalFleetObserverPresentation} from '../../../src/campaign/rules/OriginalFleetPresentation.mjs';
import {rebindOriginalCargoPodsObserverPresentation} from '../../../src/campaign/rules/OriginalCargoPodsPresentation.mjs';
import {authorizeNativeDevelopmentPrincipal} from './DevelopmentWorld.mjs';
const check=(value,message)=>requireThat(value,'NATIVE_SCENE_UNAVAILABLE',message),f=Math.fround;
const rgba=value=>{check(Array.isArray(value)&&value.length===4&&value.every(v=>Number.isInteger(v)&&v>=0&&v<=255),'Actual faction specification UI color required');return value;};
const visibleFrame=frame=>frame.commands.some(c=>c.kind==='planet-sphere'||c.kind==='quads'&&c.vertices.length>0);
export function validateNativeSceneRequest(input){
 requireThat(isRecord(input)&&Object.keys(input).every(k=>['worldId','epoch','observerDataRef','viewId','width','height'].includes(k)),'INVALID_REQUEST','Only native scene fields are accepted');
 requireThat(typeof input.observerDataRef==='string'&&input.observerDataRef.length>0&&input.observerDataRef.length<=1024&&typeof input.viewId==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(input.viewId),'INVALID_REQUEST','Actual controlled observer and page-view identity required');
 requireThat([input.width,input.height].every(n=>Number.isInteger(n)&&n>=1&&n<=8192),'INVALID_REQUEST','Scene dimensions must be between 1 and 8192');return input;
}
/** Owns observer-local visuals across revisions, rebinding only to the same world identities.
 * No raw native references or per-entity wrappers cross this boundary, even for anonymous contacts. */
export class NativeScenePresentation {
 #state;#revision;#views=new Map();
 constructor(state){this.#state=state;this.#revision=state.revision;}
 /** Restoring a committed checkpoint changes JS identities, not the native entities themselves. */
 replaceState(next){this.#replaceState(next,false);}
 /** Internal repository recovery ONLY, after SQL rollback. Normal replaceState still
  * rejects a different graph at the same revision. Observer RNG/faders are retained. */
 restoreCommittedState(next){check(next!==this.#state,'Recovery requires a fresh committed graph');this.#replaceState(next,true);}
 #replaceState(next,recover){
  check(next.id===this.#state.id&&Number.isSafeInteger(next.revision)&&next.revision>=this.#revision,'Scene state cannot move to another world or older revision');
  if(next===this.#state&&next.revision===this.#revision)return;
  check(recover||next.revision>this.#revision,'Different runtime graph at the same revision');
  try{
   const runtime=next.runtime,fleets=new Map(runtime.fleetDataFactoryState().fleets.map(fleet=>[fleet.dataRef,fleet])),locations=new Map();let references=null;
   for(const [key,view]of this.#views){
    const controller=next.controllers.find(c=>c.playerId===view.playerId),observer=fleets.get(view.observerDataRef),location=observer?.campaign?.entity.containingLocation;
    // Permissions and world membership are current facts, never preserved by a cached visual.
    if(!controller?.fleetDataRefs.includes(view.observerDataRef)||observer?.objectRef!==view.observerRef||!location||location.objectRef!==view.locationRef||observer.campaign.entity.expired||!location.repository.contains.includes(observer)){this.#views.delete(key);continue;}
    let entities=locations.get(location);if(!entities){entities=new Map(location.repository.contains.map(entity=>[entity.objectRef,entity]));locations.set(location,entities);}
    const entries=new Map();
    for(const [old,entry]of view.entries){
     const target=entities.get(old.objectRef);if(!target||isOriginalCargoPods(target)!==isOriginalCargoPods(old))continue;
     const pod=isOriginalCargoPods(target),entity=pod?target.entity:target.campaign?.entity;
     if(!entity||entity.expired||entity.containingLocation!==location||pod&&!target.worldRegistered||!pod&&target.campaign.flags.hidden!==null)continue;
     // A live in-place commit preserves identities; only restoration needs reference rebinding.
     if(target!==old||entry.presentation.observer!==observer){
      if(pod)rebindOriginalCargoPodsObserverPresentation(entry.presentation,target,observer);else{references??=createOriginalObserverRebindReferences(runtime.fleetMemberFactoryState());rebindOriginalFleetObserverPresentation(entry.presentation,target,observer,references);}
     }
     entries.set(target,entry);
    }
    view.entries=entries;
     // Personal ping timelines survive graph restoration, but never keep a hidden or removed source alive.
     for(const list of ['pings','pingScripts'])view[list]=view[list].filter(row=>{const target=entities.get(row.entity.objectRef);if(!entries.has(target))return false;row.entity=target;return true;});
   }
   this.#state=next;this.#revision=next.revision;
  }catch(error){this.#views.clear();throw error;}
 }
 frame(playerId,input,now=performance.now()){
  validateNativeSceneRequest(input);const state=this.#state,runtime=state.runtime;authorizeNativeDevelopmentPrincipal(state,{kind:'player',id:playerId});
  requireThat(input.worldId===state.id,'FORBIDDEN','Wrong world');const controller=state.controllers.find(c=>c.playerId===playerId);
  requireThat(controller.fleetDataRefs.includes(input.observerDataRef),'FORBIDDEN','Scene observer must be controlled by this player');
  const observer=runtime.fleetDataFactoryState().fleets.find(fleet=>fleet.dataRef===input.observerDataRef),location=observer?.campaign?.entity.containingLocation;
  requireThat(location&&location.repository.contains.includes(observer)&&!observer.campaign.entity.expired,'NATIVE_FLEET_INACTIVE','Actual observer is not in a live location');
  check(Number.isFinite(now),'Actual monotonic presentation time required');
  for(const [key,value] of this.#views)if(now-value.at>60000)this.#views.delete(key);
  const key=JSON.stringify([playerId,input.observerDataRef,input.viewId]);let view=this.#views.get(key);
  if(!view){while(this.#views.size>=16)this.#views.delete(this.#views.keys().next().value);view={id:randomUUID(),sequence:0,at:now,playerId,observerDataRef:observer.dataRef,observerRef:observer.objectRef,locationRef:location.objectRef,entries:new Map(),background:null,pings:[],pingScripts:[]};this.#views.set(key,view);}
  // Tab suspension never catches up authority or synthesizes unobserved world history.
  const seconds=f(Math.min(.25,Math.max(0,(now-view.at)/1000)));view.at=now;
  const camera={center:[...observer.position],width:input.width,height:input.height,zoom:1};
  const near=(position,margin)=>{const x=f(camera.center[0]-f(input.width/2)),y=f(camera.center[1]-f(input.height/2));return !(position[0]>f(f(x+input.width)+margin)||position[0]<f(x-margin)||position[1]>f(f(y+input.height)+margin)||position[1]<f(y-margin));};
  const factions=runtime.nativeFactionRelationsState(),playerFaction=factions?.factions.find(faction=>faction.factionId==='player'),neutral=factions?.factions.find(faction=>faction.factionId==='neutral');
  check(location.renderer,'Actual registered render layer order required');
  const context={currentLocation:location,paused:false,isFastForwardIteration:false},layers={background:[],planets:[],terrain:[],fleets:[],contacts:[],above:[],pings:[]},effects=[],bodies=new Map(),planetFrames=new Map();
  const entityState=object=>{const entity=(isOriginalCargoPods(object)||isOriginalCampaignPlanet(object))?object.entity:object.campaign?.entity;check(entity,'Actual registered light/entity required');return entity;};
  const alive=new Set(),pingServices={addPingIndicator:ping=>view.pings.push(ping)};
  try{
   // Mirrors Engine: advance existing rings before contacts, scripts after the location phase.
   for(const ping of view.pings)advanceOriginalActionIndicator(ping,seconds);view.pings=view.pings.filter(ping=>!originalActionIndicatorCanCleanUp(ping));
   const source=runtime.nativeLocationFrameState(location.objectRef)?.background;
   if(source?.visual?.scope==='native-normal-space-background-source'){
    check(!location.hyperspaceMode,'Normal-space background cannot stand in for hyperspace warp');
    if(!view.background){const seed=createHash('sha256').update(JSON.stringify([view.id,location.objectRef,'background'])).digest().readBigInt64BE().toString();view.background=createOriginalCampaignBackgroundView(source,input.width,input.height,seed);}
    layers.background.push(renderOriginalCampaignBackground(source,view.background,camera));
   }else view.background=null;
   for(const target of location.repository.contains){
     if(isOriginalCampaignPlanet(target)){
      if(target.entity.expired||!target.worldRegistered||target.entity.containingLocation!==location)continue;
      const visibility=runtime.planetVisibilityForPlayerObserver(target,observer.dataRef);
      // Unknown or anonymous bodies must never disclose texture/type via their draw commands.
      if(visibility!=='COMPOSITION_DETAILS'&&visibility!=='COMPOSITION_AND_FACTION_DETAILS')continue;
      planetFrames.set(target,renderOriginalCampaignPlanetLayers(target,{alpha:1,isNearViewport:near,lightHeightBrightness:runtime.nativeLocationFrameState(location.objectRef)?.lightHeight?.currBrightness??null},{readLightEntity:object=>{const e=entityState(object);return {position:e.position,tags:e.tags??[]};}}));continue;
     }
    const pod=isOriginalCargoPods(target),entity=entityState(target);if(entity.expired||entity.containingLocation!==location||pod&&!target.worldRegistered||!pod&&target.campaign.flags.hidden!==null)continue;
    const visibility=target===observer?'COMPOSITION_AND_FACTION_DETAILS':pod?runtime.cargoPodsVisibilityForPlayerObserver(target,observer.dataRef):runtime.fleetVisibilityForPlayerObserver(target.dataRef,observer.dataRef);
    let entry=view.entries.get(target);if(!entry&&visibility==='NONE')continue;
    const radius=pod?target.radius:originalFleetSensorRadius(target);if(!entry&&!near(target.position,radius+500))continue;
    if(!entry){const seed=createHash('sha256').update(JSON.stringify([view.id,target.objectRef])).digest().readBigInt64BE().toString();entry={presentation:pod?runtime.createNativeCargoPodsObserverPresentation(target,observer.dataRef,seed):runtime.createNativeFleetObserverPresentation(target.dataRef,observer.dataRef,seed),memory:createOriginalCampaignMemory()};view.entries.set(target,entry);}
    alive.add(target);const observed=[];
    const services={readContactMemory:()=>entity.memory??entry.memory,readNeutralIndicatorFaction:()=>{check(neutral,'Actual neutral faction required');return neutral;},readPlayerFactionColor:()=>rgba(playerFaction?.specColor),readPlayerFactionBaseUIColor:()=>rgba(playerFaction?.specBaseUIColor),
     reportDetectedEntity:(_entity,level)=>observed.push({kind:'observed-entity',visibility:level}),
     isFleetVisible:(fleet,margin)=>fleet.campaign.entity.containingLocation===location&&near(fleet.position,originalFleetSensorRadius(fleet)+margin),
     willFleetBeVisible:fleet=>{check(fleet.campaign.jumpDestination===null&&observer.campaign.jumpDestination===null,'Transition view requires actual transition presentation');return false;},
     readFleetViewLightPosition:light=>{const position=light.position??light.campaign?.entity?.position;check(Array.isArray(position)&&position.length===2&&position.every(Number.isFinite),'Actual light-source position required');return position;},
     readLocationEntityState:object=>{const e=entityState(object);return {position:e.position,tags:e.tags};}
    };
    const result=pod?runtime.advanceNativeCargoPodsObserver(entry.presentation,seconds,context,services):runtime.advanceNativeFleetObserverContact(entry.presentation,seconds,context,services);
    if(!pod)runtime.advanceNativeFleetObserverView(entry.presentation,seconds,context,services);
    const renderContext={...context,alpha:1,isNearViewport:near,course:null},rendered=pod?runtime.renderNativeCargoPodsObserverLayers(entry.presentation,renderContext,services):runtime.renderNativeFleetObserverLayers(entry.presentation,renderContext,services);
    // Drop empty wrappers: their slot/type would identify an otherwise anonymous pod or fleet.
    const body=pod?rendered.terrain:rendered.fleet;if(visibleFrame(body))bodies.set(target,body);if(visibleFrame(rendered.contacts))layers.contacts.push(rendered.contacts);
    for(const effect of result.effects)if(effect.kind==='sensor-ping'){
      const created=createOriginalPingScript(target,{pingType:effect.id,custom:null,colorOverride:[...effect.color]},context,pingServices);view.pingScripts.push(created.script);effects.push({kind:effect.kind,id:effect.id,position:[...target.position],color:[...effect.color]},...created.effects);
     }else if(effect.kind==='campaign-sound')effects.push({kind:effect.kind,id:effect.id,position:[...effect.position],velocity:[...effect.velocity],pitch:effect.pitch,volume:effect.volume});
    // Observed/discovery intents are NOT world callbacks. World detection belongs to its one real tick.
   }
   for(const [key,output]of [['PLANETS','planets'],['ABOVE','above']])for(const target of location.renderer.layers.find(layer=>layer.key===key)?.values??[]){const frame=planetFrames.get(target)?.[output];if(frame&&visibleFrame(frame))layers[output].push(frame);}
   for(const [key,output] of [['TERRAIN_7A','terrain'],['FLEETS','fleets']])for(const target of location.renderer.layers.find(layer=>layer.key===key)?.values??[]){const frame=bodies.get(target);if(frame)layers[output].push(frame);}
   for(const target of view.entries.keys())if(!alive.has(target))view.entries.delete(target);
    view.pings=view.pings.filter(ping=>alive.has(ping.entity));view.pingScripts=view.pingScripts.filter(script=>alive.has(script.entity)&&!originalPingScriptIsDone(script));
    for(const script of [...view.pingScripts])effects.push(...advanceOriginalPingScript(script,seconds,context,pingServices));view.pingScripts=view.pingScripts.filter(script=>!originalPingScriptIsDone(script));
    for(const ping of view.pings){const draw=renderOriginalActionIndicator(ping,{currentLocation:location,alpha:1,isNearViewport:near});if(visibleFrame(draw))layers.pings.push(draw);}
   return immutableJSON({scope:'native-observer-scene',worldId:state.id,revision:state.revision,sceneId:view.id,sequence:++view.sequence,observerDataRef:observer.dataRef,camera,layers,effects,readyForAuthority:false,limitations:['world-simulation-unavailable','campaign-world-audio-unavailable','campaign-music-unavailable','canonical-world-pings-unavailable',...(layers.background.length?[]:['background-unavailable']),'anonymous-body-contacts-unavailable','hud-and-selection-unavailable','location-transition-presentation-unavailable']});
  }catch(error){this.#views.delete(key);throw error;}
 }
}
