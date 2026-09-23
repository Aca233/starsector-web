import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
export interface OriginalFleetInflaterParams {objectRef:string;seed:string|null;timestamp:string|null;persistent:boolean|null;quality:number;averageSMods:number|null;allWeapons:boolean|null;rProb:number|null;mode:'ALL'|'PRIORITY_ONLY'|'PRIORITY_THEN_ALL'|'IMPORTED'|null;factionId:string|null;blockHullmodsWithItemReqs:boolean|null}
export interface OriginalTypedFleetInflaterParams extends OriginalFleetInflaterParams {className:'com.fs.starfarer.api.impl.campaign.fleets.DefaultFleetInflaterParams'}
export function createOriginalFleetInflaterParams(objectRef:string,overrides?:Partial<OriginalFleetInflaterParams>):OriginalTypedFleetInflaterParams;
export function createOriginalFleetInflaterForParams(objectRef:string,params:OriginalFleetInflaterParams):OriginalFleetInflater;
export interface OriginalFleetInflater {scope:'native-default-fleet-inflater';objectRef:string;className:'com.fs.starfarer.api.impl.campaign.fleets.DefaultFleetInflater';parameters:OriginalFleetInflaterParams}
export interface OriginalInflaterWeaponSpec {size:'SMALL'|'MEDIUM'|'LARGE';tier:number;autofitCategory:string|null}
export interface OriginalInflaterFighterSpec {autofitCategory:string|null}
export interface OriginalInflaterAvailable<T> {kind:'weapon'|'fighter';id:string;spec:T;quantity:number;price:0;source:null;submarket:null;savedCostStats?:object|null;cachedOPCost?:number}
export interface OriginalCoreAutofitCategory {base:string;tags:string[];fallback:string[]}
export interface OriginalCoreAutofitClassState {scope:'native-core-autofit-class-state';categories:OriginalCoreAutofitCategory[]|null;categoryEntries?:[string,OriginalCoreAutofitCategory][]|null;tagLevels?:[string|null,number][];randomizeChance?:number}
export interface OriginalCoreAutofitSession {scope:'native-core-autofit-session';classState:OriginalCoreAutofitClassState;commander:OriginalPayrollPerson|null;stats:OriginalPayrollPerson['stats']|null;random:OriginalJavaRandomState;options:[string,boolean][];categories:{base:string;tags:string[];fallback:string[]}[];randomize:boolean;weaponFilterSeed:string;emptyWingTarget:string|null;altWeaponCats:[OriginalInflaterWeaponSpec,string[]][];altFighterCats:[OriginalInflaterFighterSpec,string[]][];debug:boolean;availableMods:string[]|null;slotsToSkip:string[];baysToSkip:number[];fittingModule:boolean;missilesWithAmmoOnCurrent:number;fittedWeaponMapCapacity:number;fittedFighterMapCapacity:number;fittedWeapons:unknown[];fittedFighters:unknown[]}
export interface OriginalInflaterDelegate {scope:'native-fleet-inflater-delegate';fleet:OriginalConstructedCampaignFleet;faction:object;member:OriginalNativeFleetMember;variant:OriginalStorageVariant;hullmods:string[];weapons:OriginalInflaterAvailable<OriginalInflaterWeaponSpec>[];fighters:OriginalInflaterAvailable<OriginalInflaterFighterSpec>[]}
export interface OriginalFleetInflaterServices {
 readInflaterAutofitClassState?():OriginalCoreAutofitClassState;
 createInflaterRandom?():OriginalJavaRandomState;readInflaterMiscRandom?():OriginalJavaRandomState;
 readInflaterCommander?(fleet:OriginalConstructedCampaignFleet):OriginalPayrollPerson|null;
 readInflaterFaction?(fleet:OriginalConstructedCampaignFleet,overrideId:string|null):object;
 readInflaterKnownHullmods?(faction:object):string[];readInflaterKnownWeapons?(faction:object):string[];readInflaterKnownFighters?(faction:object):string[];
 readInflaterHullmodRequiredItem?(id:string):import('./OriginalNativeCargo.mjs').OriginalNativeCargoItem|null;
 isInflaterWeaponKnownAt?(faction:object,id:string,timestamp:string|null):boolean;isInflaterFighterKnownAt?(faction:object,id:string,timestamp:string|null):boolean;
 readInflaterWeaponSpec?(id:string):OriginalInflaterWeaponSpec;readInflaterFighterSpec?(id:string):OriginalInflaterFighterSpec;
 isInflaterWeaponPriority?(faction:object,id:string):boolean;isInflaterFighterPriority?(faction:object,id:string):boolean;
 readInflaterQualityPerDMod?():number;readInflaterForceAutofit?(fleet:OriginalConstructedCampaignFleet):boolean;
 readInflaterMembers?(fleet:OriginalConstructedCampaignFleet):OriginalNativeFleetMember[];readInflaterHullTags?(member:OriginalNativeFleetMember):string[];
 isInflaterPlayerFaction?(faction:object):boolean;readInflaterStockVariant?(id:string):OriginalStorageVariant;
 readInflaterTargetVariants?(member:OriginalNativeFleetMember):OriginalStorageVariant[];
 createInflaterEmptyVariant?(id:string,hullId:string):OriginalStorageVariant;
 readInflaterRandomizeProbability?(faction:object):number;
 isInflaterMemberStation?(member:OriginalNativeFleetMember):boolean;isInflaterMemberCivilian?(member:OriginalNativeFleetMember):boolean;
 fitInflaterVariant?(session:OriginalCoreAutofitSession,current:OriginalStorageVariant,target:OriginalStorageVariant,maxSmods:number,delegate:OriginalInflaterDelegate):void;
 readInflaterDModCount?(variant:OriginalStorageVariant):number;setInflaterDHull?(variant:OriginalStorageVariant):void;addInflaterDMods?(member:OriginalNativeFleetMember,canAddDestroyedMods:boolean,count:number,random:OriginalJavaRandomState):void;
 markInflaterFleetSyncNeeded?(fleet:OriginalConstructedCampaignFleet):void;syncInflaterFleet?(fleet:OriginalConstructedCampaignFleet):void;
}
export interface OriginalCampaignInflationServices {isInflaterFleetNeutral(fleet:OriginalConstructedCampaignFleet):boolean;inflateCampaignFleetWith(fleet:OriginalConstructedCampaignFleet,inflater:object):void;reportCampaignFleetInflated(fleet:OriginalConstructedCampaignFleet,inflater:object|null):void;removeCampaignInflaterAfterUse(inflater:object|null):boolean}
export function createOriginalFleetInflater(objectRef:string,overrides?:Partial<Omit<OriginalFleetInflaterParams,'objectRef'>>):OriginalFleetInflater;
export function validateOriginalFleetInflater(item:OriginalFleetInflater):OriginalFleetInflater;
export function originalInflaterRemovesAfterInflating(item:OriginalFleetInflater):boolean;
export function setOriginalInflaterRemovesAfterInflating(item:OriginalFleetInflater,value:boolean):void;
export function originalInflaterTierProbability(tier:number,quality:number):number;
export function originalInflaterMakePicks(count:number,max:number,random:OriginalJavaRandomState):number[];
export function originalInflaterMaxSMods(average:number,random:OriginalJavaRandomState):number;
export function originalInflaterNumDMods(average:number,existing:number,random:OriginalJavaRandomState):number;
export function createOriginalCoreAutofitClassState():OriginalCoreAutofitClassState;
export function validateOriginalCoreAutofitClassState(state:OriginalCoreAutofitClassState):OriginalCoreAutofitClassState;
export function createOriginalCoreAutofitSession(commander:OriginalPayrollPerson|null,random:OriginalJavaRandomState,classState:OriginalCoreAutofitClassState):OriginalCoreAutofitSession;
export function executeOriginalFleetInflation(item:OriginalFleetInflater,fleet:OriginalConstructedCampaignFleet,services:OriginalFleetInflaterServices):{scope:'native-default-fleet-inflation-result';processedMembers:number};
export function inflateOriginalCampaignFleet(fleet:OriginalConstructedCampaignFleet,services:OriginalCampaignInflationServices):boolean;
