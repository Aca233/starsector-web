import type {OriginalRelationshipFaction} from './OriginalRelationships.mjs';
import type {OriginalFleetInflaterServices} from './OriginalFleetInflater.mjs';
export type OriginalFactionEquipmentKind='weapon'|'fighter'|'hullmod';
export type OriginalTimedFactionEquipmentKind=Exclude<OriginalFactionEquipmentKind,'hullmod'>;
export interface OriginalFactionEquipmentInputs {
 knownWeapons:string[];knownFighters:string[];knownHullMods:string[];
 priorityWeapons:string[];priorityFighters:string[];priorityHullMods:string[];
 weaponTimestamps:[string,string|null][];fighterTimestamps:[string,string|null][];
 autoEnableKnownWeapons:boolean;autoEnableKnownFighters:boolean;updatingDoctrineInReadResolve:boolean;
}
export interface OriginalFactionEquipment extends OriginalFactionEquipmentInputs {scope:'native-current-faction-equipment';faction:OriginalRelationshipFaction}
export interface OriginalFactionEquipmentServices {
 /** Actual final Faction.getKnownHullMods HashSet order from the player CampaignUI/CharacterData union. Not the NPC private set. */
 readPlayerKnownHullmods?():string[];
 readFactionEquipmentTimestamp?():string;
 readFactionEquipmentSpec?(kind:OriginalTimedFactionEquipmentKind,id:string):{tags:string[]}|null;
 reportPlayerAwareOfEquipment?(kind:OriginalTimedFactionEquipmentKind,id:string,learned:true):void;
}
export function validateOriginalFactionEquipment(value:OriginalFactionEquipment,faction?:OriginalRelationshipFaction):OriginalFactionEquipment;
export function restoreOriginalFactionEquipment(faction:OriginalRelationshipFaction,inputs:OriginalFactionEquipmentInputs):OriginalFactionEquipment;
export function originalFactionKnownEquipment(faction:OriginalRelationshipFaction,kind:OriginalFactionEquipmentKind,services?:OriginalFactionEquipmentServices):string[];
export function originalFactionEquipmentPriority(faction:OriginalRelationshipFaction,kind:OriginalFactionEquipmentKind,id:string):boolean;
export function originalFactionEquipmentKnownAt(faction:OriginalRelationshipFaction,kind:OriginalTimedFactionEquipmentKind,id:string,timestamp:string|null):boolean;
export function setOriginalFactionEquipmentPriority(faction:OriginalRelationshipFaction,kind:OriginalFactionEquipmentKind,id:string,enabled:boolean):void;
export function addOriginalFactionKnownEquipment(faction:OriginalRelationshipFaction,kind:OriginalTimedFactionEquipmentKind,id:string,recordTimestamp:boolean,services?:OriginalFactionEquipmentServices):void;
export function removeOriginalFactionKnownEquipment(faction:OriginalRelationshipFaction,kind:OriginalTimedFactionEquipmentKind,id:string):void;
export function createOriginalFactionEquipmentServices(services?:OriginalFactionEquipmentServices):Required<Pick<OriginalFleetInflaterServices,'readInflaterKnownHullmods'|'readInflaterKnownWeapons'|'readInflaterKnownFighters'|'isInflaterWeaponKnownAt'|'isInflaterFighterKnownAt'|'isInflaterWeaponPriority'|'isInflaterFighterPriority'>>;
