import type {OriginalLocationOrbitServices} from './OriginalLocationOrbits.mjs';
import type {OriginalLocationFrame} from './OriginalLocationFrame.mjs';
import type {OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
import type {OriginalConstructedCampaignFleet,OriginalFleetConstructionFaction} from './OriginalCampaignFleet.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
type Fleet=OriginalConstructedCampaignFleet;
type AI=NonNullable<Fleet['campaign']['ai']>;
export const ORIGINAL_LOCATION_ENCOUNTERS:Readonly<{schemaVersion:1;version:string;sources:readonly string[];settings:Readonly<{battleJoinRange:number}>;classes:Readonly<{fleet:string;station:string;entity:string}>}>;
/** Required when default encounter dispatch examines a fleet pair; not isFastForwardIteration. */
export interface OriginalLocationEncounterContext {fastAdvance?:boolean}
export interface OriginalLocationEncounterServices extends OriginalLocationOrbitServices {
 memoryServices?:OriginalCampaignMemoryServices;
 readLocationObjects?(location:OriginalFleetLocationRegistry,className:string):(object|null)[];
 readEncounterPlayerFleet?():Fleet|null;readEncounterListener?():object|null;
 resolveEncounterEntity?(ref:string):object|null;
 readVisibilityToPlayer?(fleet:Fleet):'NONE'|'SENSOR_CONTACT'|'COMPOSITION_DETAILS'|'COMPOSITION_AND_FACTION_DETAILS';
 readFleetRadius?(fleet:Fleet):number;
 readEncounterEntityRadius?(entity:object):number;readEncounterEntitySelectionSize?(entity:object):number;
 readEncounterBattleJoinRange?():number;isEncounterMarket?(object:object):boolean;readEncounterMarketPrimaryEntity?(market:object):object;
 isEncounterStationInSupportRange?(fleet:Fleet,station:Fleet):boolean;
 /** These must use the actual Battle, never the member-strength capture as a working battle. */
 readEncounterClosestBattleFleet?(battle:object,joining:Fleet):Fleet|null;
 canJoinEncounterBattle?(battle:object,joining:Fleet):boolean;joinEncounterBattle?(battle:object,joining:Fleet):boolean;
 encounterAIWantsToJoin?(ai:AI,battle:object,allowPlayer:boolean,fleet:Fleet):boolean;
 isEncounterAIHostileTo?(ai:AI,target:Fleet,fleet:Fleet):boolean;
 notifyEncounterAIInteracted?(ai:AI,other:Fleet,fleet:Fleet):void;
 areEncounterFactionsHostile?(first:OriginalFleetConstructionFaction,second:OriginalFleetConstructionFaction):boolean;
 createEncounterBattle?(first:Fleet,second:Fleet,location:OriginalFleetLocationRegistry):unknown;
 startEncounterInvolvingPlayerFleet?(listener:object,player:Fleet,entity:object,phase:'fleet-pair'|'orbital-station'|'player-entity'):void;
}
export interface OriginalLocationEncounterResult {scope:'native-location-encounter-phase';pairsChecked:number;joinAttempts:number;battleCreationCalls:number;playerEncounterCalls:number;playerEncounterStarted:boolean;readyForAuthority:false}
export function originalFleetCanBeEngaged(fleet:Fleet,services?:OriginalLocationEncounterServices):boolean;
export function originalStationInSupportRange(fleet:Fleet,station:Fleet,services?:OriginalLocationEncounterServices):boolean;
export function advanceOriginalLocationEncounters(state:OriginalLocationFrame,context:OriginalLocationEncounterContext,services?:OriginalLocationEncounterServices):OriginalLocationEncounterResult;
