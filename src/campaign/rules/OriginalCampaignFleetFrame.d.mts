import type {OriginalFleetViewportServices} from './OriginalCampaignViewport.mjs';
import type {OriginalAbilityServices,OriginalAbilityEffect} from './OriginalCampaignAbilities.mjs';
import type {OriginalFleetViewServices} from './OriginalCampaignFleetView.mjs';
import type {OriginalFleetContactServices,OriginalFleetContactEffect} from './OriginalFleetContact.mjs';
import type {OriginalConstructedCampaignFleet,OriginalFleetConstructionFaction,OriginalCampaignFleetConstruction} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetRosterBinding} from './OriginalFleetRoster.mjs';
import type {OriginalNativeFleet} from './OriginalFleetData.mjs';
import type {OriginalFleetWorld,OriginalFleetLocationRegistry} from './OriginalFleetWorld.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
import type {advanceOriginalFleetAfterBase} from './OriginalCampaignFleetAdvance.mjs';
/** Context can expose live getters; plugins may change the actual world during a frame. */
export interface OriginalFleetFrameContext {playerFleet:OriginalNativeFleet|null;currentLocation:OriginalFleetLocationRegistry|null;paused:boolean;isFastForwardIteration:boolean}
export interface OriginalFleetFrameServices extends OriginalFleetContactServices,OriginalFleetViewServices,OriginalAbilityServices,OriginalFleetViewportServices {
 memoryServices?:OriginalCampaignMemoryServices;
 readFleetIndicatorFaction?(fleet:OriginalConstructedCampaignFleet):OriginalFleetConstructionFaction|null;
 invalidateIndicatorList?(list:unknown):void;
 readVisibilityToPlayer?(fleet:OriginalConstructedCampaignFleet):'NONE'|'SENSOR_CONTACT'|'COMPOSITION_DETAILS'|'COMPOSITION_AND_FACTION_DETAILS';
 advanceFleetAI?(ai:NonNullable<OriginalCampaignFleetConstruction['ai']>,seconds:number,fleet:OriginalConstructedCampaignFleet):void;
 readFleetCommander?(fleet:OriginalConstructedCampaignFleet):OriginalPayrollPerson|null;
 advancePerson?(person:OriginalPayrollPerson,seconds:number,days:number,context:OriginalFleetFrameContext):void;
 advanceContactIndicator?(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalFleetFrameContext):void|{effects:OriginalFleetContactEffect[]};
 isPlanetConditionMarketOnly?(market:unknown):boolean;
 advancePlanetConditionMarket?(market:unknown,seconds:number):void;
 isFloatingTextDone?(text:unknown):boolean;
 advanceFloatingText?(text:unknown,seconds:number):void;
 isEntityScriptDone?(script:unknown):boolean;
 entityScriptRunsWhilePaused?(script:unknown):boolean;
 advanceEntityScript?(script:unknown,seconds:number):void;
 readInteractionTarget?(ref:string):{containingLocation:OriginalFleetLocationRegistry|null;alive:boolean};
 isFleetVisible?(fleet:OriginalConstructedCampaignFleet,margin:number):boolean;
 willFleetBeVisible?(fleet:OriginalConstructedCampaignFleet):boolean;
 advanceFleetView?(fleet:OriginalConstructedCampaignFleet,seconds:number):void;
 clearFleetView?(fleet:OriginalConstructedCampaignFleet):void;
}
export function advanceOriginalFleetRangeIndicator(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalFleetFrameContext,services?:OriginalFleetFrameServices):void;
export function advanceOriginalFleetBase(fleet:OriginalConstructedCampaignFleet,seconds:number,days:number,context:OriginalFleetFrameContext,services?:OriginalFleetFrameServices,globalRandom?:OriginalJavaRandomState):{contactEffects:OriginalFleetContactEffect[];abilityEffects:OriginalAbilityEffect[]};
export function advanceOriginalFleetEvenIfPaused(fleet:OriginalConstructedCampaignFleet,seconds:number,context:OriginalFleetFrameContext,services?:OriginalFleetFrameServices):void;
export function clearOriginalFleetView(fleet:OriginalConstructedCampaignFleet):void;
export function advanceOriginalFleetFrame(binding:OriginalFleetRosterBinding,seconds:number,days:number,globalRandom:OriginalJavaRandomState,world:OriginalFleetWorld,context:OriginalFleetFrameContext,services?:OriginalFleetFrameServices):{scope:'native-campaign-fleet-frame';effects:(OriginalFleetContactEffect|OriginalAbilityEffect|import('./OriginalCampaignFleetAdvance.mjs').OriginalFleetPresentationEffect)[];afterBase:ReturnType<typeof advanceOriginalFleetAfterBase>;advancedView:boolean;retirement:{aborted:boolean}|null;readyForAuthority:false};
