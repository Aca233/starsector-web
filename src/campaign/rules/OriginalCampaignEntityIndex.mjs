/** CampaignEngine/BaseLocation transient ID maps. These caches must never enter a checkpoint. */
import {requireThat} from '../core/Values.mjs';
import {originalWorldLocationObjects} from './OriginalFleetWorld.mjs';
import {isOriginalCargoPods} from './OriginalCargoPods.mjs';
import {isOriginalCampaignPlanet} from './OriginalCampaignPlanet.mjs';
const TOKEN='com.fs.starfarer.api.campaign.SectorEntityToken',check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_ENTITY_INDEX',m);
function entityState(object){
 const entity=object?.campaign?.scope==='native-constructed-campaign-fleet'?object.campaign.entity:isOriginalCargoPods(object)||isOriginalCampaignPlanet(object)?object.entity:null;
 check(entity&&(entity.id===null||typeof entity.id==='string'),'Actual supported SectorEntityToken required');return entity;
}
/** References only this Runtime's live graph; lazy maps reproduce native stale-cache/fallback behavior. */
export class OriginalCampaignEntityIndex {
 #engine; #engineMap=null; #locationMaps=new WeakMap(); #readLocationFrame;
 constructor(engine,readLocationFrame=()=>null){check(engine?.scope==='native-campaign-engine-frame-state','Actual engine required');this.#engine=engine;this.#readLocationFrame=readLocationFrame;}
 #objects(location){check(this.#engine.world.locations.includes(location),'Location must be the actual registered object');return originalWorldLocationObjects(location,TOKEN);}
 #live(object){if(!object)return false;const location=entityState(object).containingLocation;return location!==null&&this.#objects(location).includes(object);}
 #id(id){check(typeof id==='string','Actual entity lookup ID required');return id;}
 readdChangeListeners(){
  const engine=this.#engine;check((engine.objectRef===undefined||engine.objectRef===engine.world.sectorRef)&&(engine.kind===undefined||engine.kind==='campaign-engine'),'Split engine repository-listener identity');
  // Historical engine identity is known from the Sector, not guessed from a display name.
  engine.objectRef=engine.world.sectorRef;engine.kind='campaign-engine';
  for(const location of [engine.hyperspace,...engine.starSystems])location.repository.listener=engine;
  if(this.#engineMap===null)engine.idMapDirty=true;
 }
 rebuildEngine(){const engine=this.#engine,map=new Map();for(const location of [engine.hyperspace,...engine.starSystems])for(const object of this.#objects(location))map.set(entityState(object).id,object);this.#engineMap=map;engine.idMapDirty=false;}
 #engineCache(){if(this.#engineMap===null||this.#engine.idMapDirty)this.rebuildEngine();return this.#engineMap;}
 #locationCache(location){const frame=this.#readLocationFrame(location);let map=this.#locationMaps.get(location);if(!map||frame?.idMapDirty){map=new Map();for(const object of this.#objects(location))map.set(entityState(object).id,object);this.#locationMaps.set(location,map);if(frame)frame.idMapDirty=false;}return map;}
 getInLocation(location,id){this.#id(id);const cached=this.#locationCache(location).get(id);if(this.#live(cached))return cached;const lower=id.toLowerCase();for(const object of this.#objects(location)){const candidate=entityState(object).id;if(candidate!==null&&candidate.toLowerCase()===lower)return object;}return null;}
 get(id){this.#id(id);const cached=this.#engineCache().get(id);if(this.#live(cached))return cached;for(const location of [this.#engine.hyperspace,...this.#engine.starSystems]){const object=this.getInLocation(location,id);if(object!==null)return object;}return null;}
 objectAdded(listener,object){check(listener===this.#engine,'Actual engine listener required');this.#engineCache().set(entityState(object).id,object);}
 objectRemoved(listener,object){check(listener===this.#engine,'Actual engine listener required');this.#engineCache().delete(entityState(object).id);}
 removeStarSystem(location){const engine=this.#engine;check(engine.world.locations.includes(location)&&location!==engine.hyperspace&&!location.hyperspaceMode,'Actual star system required');location.repository.listener=null;const i=engine.starSystems.indexOf(location);if(i>=0)engine.starSystems.splice(i,1);
  // Native removal neither destroys this location nor invalidates ID caches/currentLocation.
 }
}
