import {isOriginalCampaignPlanet,validateOriginalCampaignPlanet,ORIGINAL_CAMPAIGN_PLANET_CLASSES} from './OriginalCampaignPlanet.mjs';
import {validateOriginalCampaignListenerTimeouts} from './OriginalCampaignListenerTimeouts.mjs';
/** BaseLocation fleet registration and CampaignFleet retirement on actual shared objects.
 * This is the registration/lifetime surface, not StarSystem generation, GPU rendering or Location.advance.
 * New registries start genuinely empty. Imported locations/listener rosters must be bound, never inferred. */
import {isOriginalCargoPods,validateOriginalCargoPods} from './OriginalCargoPods.mjs';
import R from '../data/reference-fleet-construction.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {clearOriginalFleetRoster} from './OriginalFleetRoster.mjs';
import {synchronizeOriginalFleet} from './OriginalFleetData.mjs';
import {fadeOriginalFader,originalFaderIsOut} from './OriginalFader.mjs';
import {reportOriginalRouteFleetDespawned} from './OriginalRouteFleets.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_WORLD',m),LAYERS=R.worldRegistration.layers,CLASSES=R.worldRegistration.fleetClasses;
const rowList=(rows,key)=>{let row=rows.find(r=>r.key===key);if(!row){row={key,values:[]};rows.push(row);}return row.values;};
const remove=(list,object)=>{const at=list.indexOf(object);if(at>=0)list.splice(at,1);return at>=0;};
const current=fleet=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed CampaignFleet required');return fleet.campaign;};
function invoke(services,name,...args){check(typeof services[name]==='function','Actual world lifecycle callback required: '+name);const result=services[name](...args);check(!result||typeof result.then!=='function','World lifecycle callbacks must be synchronous');return result;}
/** Only a new runtime with these listener collections known empty may use this constructor. */
export function createOriginalFleetWorld(sectorRef){check(typeof sectorRef==='string','Actual Sector identity required');return {scope:'native-current-fleet-world-registration',sectorRef,planetSerial:0,hullmodItemSerial:0,locations:[],campaignListeners:{saved:[],transient:[],timed:[]},managedFleetListeners:{saved:[],transient:[]},detectedEntityListeners:{saved:[],transient:[]},cargoScreenListeners:{saved:[],transient:[]},fleetInflationListeners:{saved:[],transient:[]},refitScreenListeners:{saved:[],transient:[]}};}
/** Registration part of a newly created location; not a complete BaseLocation/StarSystem constructor. */
export function createOriginalFleetLocationRegistry(objectRef,hyperspaceMode){check(typeof objectRef==='string'&&typeof hyperspaceMode==='boolean','Actual new location identity/mode required');return {scope:'native-location-fleet-registry',objectRef,hyperspaceMode,repository:{contains:[],lists:[],listener:null},renderer:{layers:[]}};}
export function addOriginalFleetWorldLocation(world,location){check(world?.scope==='native-current-fleet-world-registration'&&location?.scope==='native-location-fleet-registry','Actual registration graph required');const existing=world.locations.find(l=>l.objectRef===location.objectRef);check(!existing||existing===location,'Split location identity');if(!existing)world.locations.push(location);return location;}
export function originalFleetWorldLocation(world,ref){check(world?.scope==='native-current-fleet-world-registration','Current world registration missing');const location=world.locations.find(l=>l.objectRef===ref);check(location,'Actual registered location required');return location;}
export function originalWorldLocationObjects(location,className='java.lang.Object'){return rowList(location.repository.lists,className);}
export function originalFleetAbilityRenderer(fleet){const c=current(fleet);if(c.abilityRenderer===null)c.abilityRenderer={scope:'native-fleet-ability-renderer',objectRef:fleet.objectRef+':ability-renderer',fleet,layers:null};check(c.abilityRenderer.fleet===fleet,'Lost ability-renderer owner');return c.abilityRenderer;}
function activeLayers(object){if(isOriginalCargoPods(object)||isOriginalCampaignPlanet(object))return object.layers;if(object?.scope==='native-fleet-ability-renderer')return object.layers;return current(object).layers;}
function addRenderable(renderer,object){const layers=activeLayers(object);if(layers===null)return;for(const layer of layers){check(LAYERS.includes(layer),'Unknown campaign render layer');const list=rowList(renderer.layers,layer);if(!list.includes(object))list.push(object);}}
function removeRenderable(renderer,object){for(const layer of LAYERS)remove(rowList(renderer.layers,layer),object);}
function ensureRenderer(location){
 if(location.renderer!==null)return location.renderer;
 location.renderer={layers:[]};for(const object of originalWorldLocationObjects(location)){check(activeLayers(object)!==null,'Renderable has no active layers during native renderer rebuild');addRenderable(location.renderer,object);if(object?.campaign)addRenderable(location.renderer,originalFleetAbilityRenderer(object));}return location.renderer;
}
export function recompileOriginalFleetRenderable(location,object){const renderer=ensureRenderer(location);removeRenderable(renderer,object);addRenderable(renderer,object);}
/** FleetAbilityRenderer.updateLayers: the caller supplies the real current ability plugin getter. */
export function updateOriginalFleetAbilityLayers(fleet,services={}){
 const c=current(fleet),renderer=originalFleetAbilityRenderer(fleet),old=renderer.layers,abilities=invoke(services,'readFleetAbilities',fleet),layers=new Set();check(Array.isArray(abilities),'Actual ordered ability plugins required');
 for(const ability of abilities){const active=invoke(services,'readAbilityLayers',ability);check(active===null||Array.isArray(active),'Actual active ability layers required');for(const layer of active??[]){check(LAYERS.includes(layer),'Unknown ability layer');layers.add(layer);}}
 renderer.layers=layers.size?LAYERS.filter(layer=>layers.has(layer)):null;
 const changed=old===null?renderer.layers!==null:renderer.layers===null||old.length!==renderer.layers.length||old.some((layer,i)=>layer!==renderer.layers[i]);
 if(changed){check(c.entity.containingLocation!==null,'Native ability layer update needs a containing location');if(c.entity.containingLocation.renderer!==null)recompileOriginalFleetRenderable(c.entity.containingLocation,renderer);}return changed;
}
function setLocation(fleet,location){const c=current(fleet);c.entity.containingLocation=location;fleet.logisticsEnvironment.inHyperspace=location.hyperspaceMode;}
function registered(world,fleet){return world.locations.some(l=>l.repository.contains.includes(fleet));}
function managedListeners(world){const l=world.managedFleetListeners;check(l&&Array.isArray(l.saved)&&Array.isArray(l.transient),'Actual managed FleetEventListener roster required');return [...l.saved,...l.transient];}
function detectedListeners(world){const listeners=world.detectedEntityListeners;check(listeners&&Array.isArray(listeners.saved)&&Array.isArray(listeners.transient),'Actual DetectedEntityListener roster required; older world history is unknown');return [...listeners.saved,...listeners.transient];}
export function reportOriginalDetectedEntity(world,fleet,level,services={}){for(const listener of detectedListeners(world))invoke(services,'reportDetectedEntityToListener',listener,fleet,level);}
function legacyListeners(world){const l=world.campaignListeners;check(l&&Array.isArray(l.saved)&&Array.isArray(l.transient)&&Array.isArray(l.timed),'Actual CampaignEngine listener roster required');if(Object.hasOwn(l,'timeouts'))validateOriginalCampaignListenerTimeouts(l.timeouts,l);return [...l.saved,...l.transient,...l.timed];}
export function addOriginalFleetToLocation(world,location,fleet,services={}){
 if(fleet===null)return;check(world.locations.includes(location),'Location must belong to this actual world graph');const c=current(fleet),repo=location.repository;
 if(!repo.contains.includes(fleet)){repo.contains.push(fleet);for(const cls of CLASSES)rowList(repo.lists,cls).push(fleet);if(repo.listener!==null)invoke(services,'objectAdded',repo.listener,fleet);}
 // BaseLocation ignores ObjectRepository.add's Boolean result: these steps repeat even on duplicate add.
 setLocation(fleet,location);c.worldRegistered=true;const renderer=ensureRenderer(location);addRenderable(renderer,fleet);addRenderable(renderer,originalFleetAbilityRenderer(fleet));
 // Native isReportedSpawned() is reportedSpawned == null, NOT Boolean.TRUE.
 if(c.flags.reportedSpawned!==null){c.flags.reportedSpawned=null;for(const listener of legacyListeners(world))invoke(services,'reportFleetSpawned',listener,fleet);}
}
export function removeOriginalFleetFromLocation(world,location,fleet,services={}){
 if(fleet===null)return;check(world.locations.includes(location),'Location must belong to this actual world graph');const c=current(fleet),repo=location.repository;
 if(remove(repo.contains,fleet)){for(const list of repo.lists)remove(list.values,fleet);if(repo.listener!==null)invoke(services,'objectRemoved',repo.listener,fleet);}
 const renderer=ensureRenderer(location);removeRenderable(renderer,fleet);removeRenderable(renderer,originalFleetAbilityRenderer(fleet));c.worldRegistered=registered(world,fleet);
 // Native removeObject deliberately leaves containingLocation, isInHyperspace and expired unchanged.
}
/** BaseLocation custom entities use the SAME repository, but never fleet-only class lists. */
export function addOriginalCustomEntityToLocation(world,location,entity,services={}){
 validateOriginalCargoPods(entity);check(world.locations.includes(location),'Location must belong to this actual world graph');const repo=location.repository;
 if(!repo.contains.includes(entity)){repo.contains.push(entity);for(const cls of R.worldRegistration.customEntityClasses)rowList(repo.lists,cls).push(entity);if(repo.listener!==null)invoke(services,'objectAdded',repo.listener,entity);}
 entity.entity.containingLocation=location;entity.worldRegistered=true;addRenderable(ensureRenderer(location),entity);
}
export function removeOriginalCustomEntityFromLocation(world,location,entity,services={}){
 validateOriginalCargoPods(entity);check(world.locations.includes(location),'Location must belong to this actual world graph');const repo=location.repository;
 if(remove(repo.contains,entity)){for(const list of repo.lists)remove(list.values,entity);if(repo.listener!==null)invoke(services,'objectRemoved',repo.listener,entity);}
 removeRenderable(ensureRenderer(location),entity);entity.worldRegistered=registered(world,entity);
 // Native removeObject retains containingLocation and expired; no FleetDespawn notification.
}
function inflationListeners(world){const l=world.fleetInflationListeners;check(l&&Array.isArray(l.saved)&&Array.isArray(l.transient),'Actual FleetInflationListener roster required; old uncaptured listeners are unknown');return [...l.saved,...l.transient];}
export function reportOriginalFleetInflated(world,fleet,inflater,services={}){for(const listener of inflationListeners(world))invoke(services,'reportFleetInflatedToListener',listener,fleet,inflater);}
function refitListeners(world){const list=world.refitScreenListeners;check(Array.isArray(list?.saved)&&Array.isArray(list.transient),'Actual RefitScreenListener repositories required; old listener history is unknown');return [...list.saved,...list.transient];}
export function reportOriginalRefitVariantSaved(world,member,market,services){for(const listener of refitListeners(world))invoke(services,'reportRefitVariantSavedToListener',listener,member,market);}
function cargoScreenListeners(world){const l=world.cargoScreenListeners;check(l&&Array.isArray(l.saved)&&Array.isArray(l.transient),'Actual CargoScreenListener roster required; old uncaptured listeners are unknown');return [...l.saved,...l.transient];}
export function reportOriginalPlayerLeftCargoPods(world,entity,services={}){for(const listener of cargoScreenListeners(world))invoke(services,'reportPlayerLeftCargoPodsToListener',listener,entity);}
export function reportOriginalNonMarketTransaction(world,transaction,dialog,services={}){for(const listener of cargoScreenListeners(world))invoke(services,'reportNonMarketTransactionToListener',listener,transaction,dialog);}
export function reportOriginalPlayerDidNotTakeCargo(world,cargo,services={}){for(const listener of legacyListeners(world)){if(listener.kind==='core-script')invoke(services,'reportCoreScriptUnclaimedCargo',listener,cargo);else invoke(services,'reportPlayerDidNotTakeCargoToListener',listener,cargo);}}
export function addOriginalFleetEventListener(fleet,listener){const c=current(fleet);check(typeof listener?.objectRef==='string','Actual FleetEventListener required');(c.despawnListeners??=[]).push(listener);}
function reportFleetListener(listener,fleet,reason,param,services){
 if(listener.kind==='route-manager'){check(listener.state?.objectRef===listener.objectRef,'Actual shared RouteManager required');reportOriginalRouteFleetDespawned(listener.state,fleet.objectRef,reason);return;}
 invoke(services,'reportFleetDespawnedToListener',listener,fleet,reason,param);
}
export function despawnOriginalWorldFleet(world,binding,reason='NO_REASON_PROVIDED',param=null,services={}){
 check(world?.scope==='native-current-fleet-world-registration','Actual world/listener state required');const fleet=binding.fleet,c=current(fleet);check(typeof reason==='string','Actual despawn reason required');c.flags.fadeAndExpire=true;fleet.despawning=true;
 for(const listener of legacyListeners(world))invoke(services,'reportFleetDespawned',listener,fleet,reason,param);
 if(c.despawnListeners!==null)for(const listener of [...c.despawnListeners])reportFleetListener(listener,fleet,reason,param,services);
 for(const listener of managedListeners(world))reportFleetListener(listener,fleet,reason,param,services);
 if(c.flags.abortDespawn===true){c.flags.fadeAndExpire=null;c.flags.abortDespawn=null;fleet.despawning=false;return {aborted:true};}
 clearOriginalFleetRoster(binding);c.entity.sensorFader.durationOut=1;fadeOriginalFader(c.entity.sensorFader,'OUT');return {aborted:false};
}
export function setOriginalWorldFleetExpired(fleet,expired){const c=current(fleet);check(typeof expired==='boolean','Actual expired flag required');if(!expired){c.flags.fadeAndExpire=null;fleet.despawning=false;}c.entity.expired=expired;}
/** CampaignFleet:843–849, ONLY after its view/clear phase; does not advance that missing phase for the caller. */
export function finishOriginalFleetAfterView(world,binding,services={}){
 const fleet=binding.fleet,c=current(fleet);if(c.flags.fadeAndExpire!==null&&originalFaderIsOut(c.entity.sensorFader))setOriginalWorldFleetExpired(fleet,true);
 synchronizeOriginalFleet(fleet,services);if(fleet.membersWithoutNull.length===0&&c.flags.fadeAndExpire===null)return despawnOriginalWorldFleet(world,binding,'NO_MEMBERS',null,services);return null;
}
/** Expired-removal branch of BaseLocation's entity traversal, not a complete location advance. */
export function removeExpiredOriginalWorldFleets(world,location,services={}){const removed=[];for(const fleet of [...originalWorldLocationObjects(location,'com.fs.starfarer.campaign.CampaignEntity')])if(fleet?.campaign&&current(fleet).entity.expired){removeOriginalFleetFromLocation(world,location,fleet,services);removed.push(fleet);}return removed;}
export function validateOriginalFleetWorld(world,knownFleets=[]){
 check(world?.scope==='native-current-fleet-world-registration'&&typeof world.sectorRef==='string'&&Array.isArray(world.locations),'Invalid current world registration graph');legacyListeners(world);managedListeners(world);
 check(Object.hasOwn(world,'detectedEntityListeners')&&Object.hasOwn(world,'cargoScreenListeners'),'Missing managed listener ownership field');if(world.detectedEntityListeners!==null)detectedListeners(world);if(world.cargoScreenListeners!==null)cargoScreenListeners(world);
 if(Object.hasOwn(world,'fleetInflationListeners')&&world.fleetInflationListeners!==null)inflationListeners(world);if(Object.hasOwn(world,'refitScreenListeners')&&world.refitScreenListeners!==null)refitListeners(world);
 if(Object.hasOwn(world,'planetSerial'))check(Number.isSafeInteger(world.planetSerial)&&world.planetSerial>=0,'Invalid Web planet identity allocator');
 if(Object.hasOwn(world,'hullmodItemSerial'))check(Number.isSafeInteger(world.hullmodItemSerial)&&world.hullmodItemSerial>=0,'Invalid Web hullmod-item identity allocator');
 const listenerObjects=new Map(),bindListener=listener=>{check(typeof listener?.objectRef==='string','Actual listener identity required');const old=listenerObjects.get(listener.objectRef);check(!old||old===listener,'Split actual world listener identity');listenerObjects.set(listener.objectRef,listener);if(listener.kind==='route-manager')check(listener.state?.objectRef===listener.objectRef,'Lost actual RouteManager listener state');};
 for(const listener of [...legacyListeners(world),...managedListeners(world),...(world.detectedEntityListeners===null?[]:detectedListeners(world)),...(world.cargoScreenListeners===null?[]:cargoScreenListeners(world)),...(world.fleetInflationListeners==null?[]:inflationListeners(world)),...(world.refitScreenListeners==null?[]:refitListeners(world))])bindListener(listener);
 for(const list of [...Object.values(world.managedFleetListeners),...Object.values(world.detectedEntityListeners??{}),...Object.values(world.cargoScreenListeners??{}),...Object.values(world.fleetInflationListeners??{}),...Object.values(world.refitScreenListeners??{})])check(new Set(list).size===list.length,'Duplicate managed listener repository member');
 const fleets=new Map(),customs=new Map(),identities=new Map(),locations=new Map(),classes=object=>isOriginalCargoPods(object)?R.worldRegistration.customEntityClasses:isOriginalCampaignPlanet(object)?ORIGINAL_CAMPAIGN_PLANET_CLASSES:CLASSES;
 const bind=object=>{if(isOriginalCargoPods(object)){validateOriginalCargoPods(object);customs.set(object.objectRef,object);}else if(isOriginalCampaignPlanet(object)){validateOriginalCampaignPlanet(object);customs.set(object.objectRef,object);}else{current(object);fleets.set(object.objectRef,object);}const old=identities.get(object.objectRef);check(!old||old===object,'Split registered world identity');identities.set(object.objectRef,object);};for(const fleet of knownFleets)if(fleet.campaign)bind(fleet);
 for(const location of world.locations){
  check(location.scope==='native-location-fleet-registry'&&typeof location.objectRef==='string'&&typeof location.hyperspaceMode==='boolean'&&!locations.has(location.objectRef),'Invalid/duplicate location registry');locations.set(location.objectRef,location);
  const repo=location.repository;check(Array.isArray(repo?.contains)&&Array.isArray(repo.lists)&&new Set(repo.contains).size===repo.contains.length,'Invalid native object repository');if(repo.listener!==null)bindListener(repo.listener);for(const object of repo.contains)bind(object);
  const keys=new Set();for(const list of repo.lists){check(typeof list.key==='string'&&!keys.has(list.key)&&Array.isArray(list.values),'Invalid repository class list');keys.add(list.key);const expected=repo.contains.filter(object=>classes(object).includes(list.key));check(list.values.length===expected.length&&list.values.every((value,i)=>value===expected[i]),'Lost native class-list order or identity');}
  for(const object of repo.contains)for(const cls of classes(object))check(keys.has(cls),'Missing actual world class registration');
  if(location.renderer!==null){check(Array.isArray(location.renderer?.layers),'Invalid native layered renderer');const layerKeys=new Set();for(const row of location.renderer.layers){check(LAYERS.includes(row.key)&&!layerKeys.has(row.key)&&Array.isArray(row.values)&&new Set(row.values).size===row.values.length,'Invalid render layer');layerKeys.add(row.key);for(const object of row.values){const owner=object?.scope==='native-fleet-ability-renderer'?object.fleet:object;bind(owner);if(object!==owner)check(owner.campaign.abilityRenderer===object,'Split ability-renderer identity');}}}
 }
 for(const object of customs.values())if(isOriginalCampaignPlanet(object)){
  const e=object.entity;for(const ref of [e.lightSource,e.orbit?.scope==='native-current-location-orbit'?e.orbit.focus:null])if(ref!==null&&ref!==undefined)check(!identities.has(ref.objectRef)||identities.get(ref.objectRef)===ref,'Split planet spatial reference');
  if(e.orbit?.scope==='native-current-location-orbit')check(e.orbit.entity===object,'Lost planet orbit owner');
 }
 for(const object of [...fleets.values(),...customs.values()]){const c=object.campaign??object,location=c.entity.containingLocation;check(typeof c.worldRegistered==='boolean'&&c.worldRegistered===registered(world,object),'Lost world registration flag');if(location!==null)check(locations.get(location.objectRef)===location,'Lost actual containing-location identity');
  if(isOriginalCargoPods(object)||isOriginalCampaignPlanet(object))continue;
  if(c.abilityRenderer!==null){const r=c.abilityRenderer;check(r.scope==='native-fleet-ability-renderer'&&typeof r.objectRef==='string'&&r.fleet===object,'Lost ability-renderer owner');check(r.layers===null||Array.isArray(r.layers)&&r.layers.every((layer,i)=>LAYERS.includes(layer)&&(i===0||LAYERS.indexOf(r.layers[i-1])<LAYERS.indexOf(layer))),'Invalid ability render layers');}
  check(c.despawnListeners===null||Array.isArray(c.despawnListeners),'Invalid local fleet listener roster');for(const listener of c.despawnListeners??[])bindListener(listener);
 }
 return world;
}

/** BaseLocation planet registration uses its real class list and PLANETS/ABOVE only. */
export function addOriginalPlanetToLocation(world,location,planet,services={}){
 validateOriginalCampaignPlanet(planet);check(world.locations.includes(location),'Location must belong to this actual world graph');const repo=location.repository;
 if(!repo.contains.includes(planet)){repo.contains.push(planet);for(const cls of ORIGINAL_CAMPAIGN_PLANET_CLASSES)rowList(repo.lists,cls).push(planet);if(repo.listener!==null)invoke(services,'objectAdded',repo.listener,planet);}
 planet.entity.containingLocation=location;planet.worldRegistered=true;addRenderable(ensureRenderer(location),planet);
}
export function removeOriginalPlanetFromLocation(world,location,planet,services={}){
 validateOriginalCampaignPlanet(planet);check(world.locations.includes(location),'Location must belong to this actual world graph');const repo=location.repository;
 if(remove(repo.contains,planet)){for(const row of repo.lists)remove(row.values,planet);if(repo.listener!==null)invoke(services,'objectRemoved',repo.listener,planet);}
 removeRenderable(ensureRenderer(location),planet);planet.worldRegistered=registered(world,planet);
 // Native retains containingLocation and expired and never reports fleet despawn.
}
