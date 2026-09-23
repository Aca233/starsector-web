import type {OriginalStorageVariant,OriginalVariantEffects} from './OriginalStorage.mjs';
import type {OriginalCoreAutofitSession,OriginalInflaterWeaponSpec,OriginalInflaterFighterSpec} from './OriginalFleetInflater.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
export interface OriginalAutofitVariant extends OriginalStorageVariant {effects:OriginalVariantEffects;hullVariantId:string;displayName:string;variantSource:string|null;mayAutoAssignWeapons:boolean;groupSpecs:{type:string|null;autofire:boolean;slots:string[]}[];hasOpAffectingMods?:boolean|null}
export interface OriginalAutofitWeaponSpec extends OriginalInflaterWeaponSpec {id:string;type:string;usesAmmo:boolean;tags:string[];aiHints:string[];autofitCategories:string[]}
export interface OriginalAutofitFighterSpec extends OriginalInflaterFighterSpec {id:string;tags:string[];autofitCategories:string[]}
export interface OriginalAutofitAvailable<T=OriginalAutofitWeaponSpec|OriginalAutofitFighterSpec> {kind:'weapon'|'fighter';id:string;spec:T;quantity:number;price:number;submarket:object|null;source?:object|null;savedCostStats?:object|null;cachedOPCost?:number}
export interface OriginalAutofitSlot {id:string;size:'SMALL'|'MEDIUM'|'LARGE';location:[number,number];angle:number;arc:number;builtIn:boolean;decorative:boolean;hidden:boolean;system:boolean;stationModule:boolean}
export interface OriginalAutofitHull {hullSize:'DEFAULT'|'FIGHTER'|'FRIGATE'|'DESTROYER'|'CRUISER'|'CAPITAL_SHIP';phase:boolean;tags:string[];builtInMods:string[];shieldType:'NONE'|'FRONT'|'OMNI'|'PHASE'|null;shieldArc:number;fighterBays:number}
export interface OriginalAutofitEquipmentServices {
 readWeaponSpec?(id:string):OriginalAutofitWeaponSpec|null;readFighterSpec?(id:string|null):OriginalAutofitFighterSpec|null;
 readWeaponSlots?(variant:OriginalAutofitVariant):OriginalAutofitSlot[];readHull?(variant:OriginalAutofitVariant):OriginalAutofitHull;
 readVariantOPCost?(variant:OriginalAutofitVariant,stats:OriginalCoreAutofitSession['stats']):number;readOrdnancePoints?(variant:OriginalAutofitVariant,stats:OriginalCoreAutofitSession['stats']):number;
 readCostStats?(variant:OriginalAutofitVariant):object|null;
 readWeaponOPCost?(spec:OriginalAutofitWeaponSpec,stats:OriginalCoreAutofitSession['stats'],shipStats:object|null):number;readFighterOPCost?(spec:OriginalAutofitFighterSpec,shipStats:object|null):number;
 weaponFits?(slot:OriginalAutofitSlot,spec:OriginalAutofitWeaponSpec):boolean;computeNumFighterBays?(variant:OriginalAutofitVariant):number;isTutorialInProgress?():boolean;
}
export interface OriginalAutofitDelegate {
 getAvailableWeapons():OriginalAutofitAvailable<OriginalAutofitWeaponSpec>[];getAvailableFighters():OriginalAutofitAvailable<OriginalAutofitFighterSpec>[];getAvailableHullmods():string[];
 getShip():object|null;getFleetMember():object|null;getMarket():object|null;getFaction():object|null;
 isAutomatedShip():boolean;isPlayerCampaignRefit():boolean;canChangeHullmod(id:string):boolean;allowSlightRandomization():boolean;
 isPriority(kind:'weapon'|'fighter',spec:OriginalAutofitWeaponSpec|OriginalAutofitFighterSpec):boolean;isBlackMarket(submarket:object):boolean;syncUIWithVariant(variant:OriginalAutofitVariant):void;
 clearWeaponSlot(slot:OriginalAutofitSlot,variant:OriginalAutofitVariant):void;clearFighterSlot(index:number,variant:OriginalAutofitVariant):void;
 fitWeaponInSlot(slot:OriginalAutofitSlot,weapon:OriginalAutofitAvailable<OriginalAutofitWeaponSpec>,variant:OriginalAutofitVariant):void;fitFighterInSlot(index:number,fighter:OriginalAutofitAvailable<OriginalAutofitFighterSpec>,variant:OriginalAutofitVariant):void;
}
export function autofitCheck(value:unknown,message:string):asserts value;
export function autofitCall<T=unknown>(services:object,key:string,...args:unknown[]):T;
export function autofitInt(value:number):number;
export function autofitOption(session:OriginalCoreAutofitSession,id:string):boolean;
export function autofitWeaponId(variant:OriginalStorageVariant,id:string):string|null;
export function autofitWingId(variant:OriginalStorageVariant,index:number):string|null;
export function originalAutofitTagLevel(session:OriginalCoreAutofitSession,tag:string|null):number;
export function originalAutofitWeightedPick<T>(rows:[T,number][],random:OriginalJavaRandomState):T|null;
export function originalAutofitSlotScore(slot:OriginalAutofitSlot):number;
export function createOriginalAutofitEquipment(session:OriginalCoreAutofitSession,services:OriginalAutofitEquipmentServices,delegate:OriginalAutofitDelegate):{
 stripWeapons(current:OriginalAutofitVariant):void;stripFighters(current:OriginalAutofitVariant):void;clearWeapon(slot:OriginalAutofitSlot,current:OriginalAutofitVariant):void;clearFighter(index:number,current:OriginalAutofitVariant):void;
 fitWeapons(current:OriginalAutofitVariant,target:OriginalAutofitVariant,upgrade:boolean):void;fitFighters(current:OriginalAutofitVariant,target:OriginalAutofitVariant,upgrade:boolean):void;
 bestMatch<T extends OriginalAutofitWeaponSpec|OriginalAutofitFighterSpec>(kind:'weapon'|'fighter',desired:T,useBetter:boolean,category:string,used:Set<string>,possible:OriginalAutofitAvailable<T>[],slot?:OriginalAutofitSlot|null):OriginalAutofitAvailable<T>|null;
 possibleWeapons(slot:OriginalAutofitSlot,desired:OriginalAutofitWeaponSpec,current:OriginalAutofitVariant,opLeft:number,items:OriginalAutofitAvailable<OriginalAutofitWeaponSpec>[]):OriginalAutofitAvailable<OriginalAutofitWeaponSpec>[];
 possibleFighters(current:OriginalAutofitVariant,opLeft:number,items:OriginalAutofitAvailable<OriginalAutofitFighterSpec>[]):OriginalAutofitAvailable<OriginalAutofitFighterSpec>[];
};
