import type {OriginalAutofitWeaponSpec,OriginalAutofitFighterSpec,OriginalAutofitHull,OriginalAutofitSlot,OriginalAutofitVariant} from './OriginalAutofitEquipment.mjs';
export type OriginalWeaponMountType='BALLISTIC'|'ENERGY'|'MISSILE'|'LAUNCH_BAY'|'HYBRID'|'SYNERGY'|'COMPOSITE'|'UNIVERSAL'|'BUILT_IN'|'DECORATIVE'|'SYSTEM'|'STATION_MODULE';
export interface OriginalRegisteredAutofitWeapon extends OriginalAutofitWeaponSpec {mountType:OriginalWeaponMountType;restrictToSpecifiedMountType:boolean;maxAmmo:number;baseOPCost:number;beam:boolean}
export interface OriginalRegisteredAutofitFighter extends OriginalAutofitFighterSpec {tier:number;baseOPCost:number;role:string}
export interface OriginalRegisteredAutofitSlot extends OriginalAutofitSlot {type:OriginalWeaponMountType;mount:'HARDPOINT'|'TURRET'|'HIDDEN'}
export interface OriginalRegisteredAutofitHull extends OriginalAutofitHull {hullId:string;defenseId:string|null;ordnancePoints:number;builtInWeapons:Record<string,string>;builtInWings:string[];slots:OriginalRegisteredAutofitSlot[]}
export interface OriginalAutofitSpecReference {schemaVersion:1;scope:'native-autofit-static-specs-not-op-stat-lifecycle';weapons:Record<string,OriginalRegisteredAutofitWeapon>;fighters:Record<string,OriginalRegisteredAutofitFighter>;hulls:Record<string,OriginalRegisteredAutofitHull>}
export interface OriginalAutofitSpecRegistry {
 readWeaponSpec(id:string):OriginalRegisteredAutofitWeapon;
 readFighterSpec(id:string):OriginalRegisteredAutofitFighter;readFighterSpec(id:null):null;readFighterSpec(id:string|null):OriginalRegisteredAutofitFighter|null;
 readHull(variant:OriginalAutofitVariant|{hullId:string}|string):OriginalRegisteredAutofitHull;
 readWeaponSlots(variant:OriginalAutofitVariant|{hullId:string}|string):OriginalRegisteredAutofitSlot[];
 weaponFits(slot:OriginalAutofitSlot,spec:OriginalAutofitWeaponSpec|null):boolean;
}
export function originalAutofitWeaponFits(slot:OriginalAutofitSlot,spec:OriginalAutofitWeaponSpec|null):boolean;
export function createOriginalAutofitSpecRegistry(input?:OriginalAutofitSpecReference):OriginalAutofitSpecRegistry;
export const originalAutofitSpecs:OriginalAutofitSpecRegistry;
