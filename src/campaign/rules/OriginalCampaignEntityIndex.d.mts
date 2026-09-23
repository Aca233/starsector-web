import type {OriginalCampaignEngineState} from './OriginalCampaignEngine.mjs';
import type {OriginalFleetLocationRegistry,OriginalWorldEntity,OriginalRepositoryListener} from './OriginalFleetWorld.mjs';
import type {OriginalLocationFrame} from './OriginalLocationFrame.mjs';
/** Transient live-object lookup only; no serialization or HTTP disclosure. */
export class OriginalCampaignEntityIndex {
 constructor(engine:OriginalCampaignEngineState,readLocationFrame?:(location:OriginalFleetLocationRegistry)=>OriginalLocationFrame|null);
 readdChangeListeners():void;
 rebuildEngine():void;
 get(id:string):OriginalWorldEntity|null;
 getInLocation(location:OriginalFleetLocationRegistry,id:string):OriginalWorldEntity|null;
 objectAdded(listener:OriginalRepositoryListener,object:OriginalWorldEntity):void;
 objectRemoved(listener:OriginalRepositoryListener,object:OriginalWorldEntity):void;
 removeStarSystem(location:OriginalFleetLocationRegistry):void;
}
