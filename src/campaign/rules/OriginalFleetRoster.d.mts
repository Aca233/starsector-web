import type {OriginalNativeFleet,OriginalNativeFleetMember,OriginalFleetLifecycleServices} from './OriginalFleetData.mjs';
import type {OriginalFleetNaming,OriginalFleetMemberFactory} from './OriginalFleetMembers.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalPlayerEconomyState,OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalMemberEffectPlugins} from './OriginalMemberEffects.mjs';
import type {OriginalFleetCompositionServices} from './OriginalFleetComposition.mjs';
export interface OriginalFleetRosterBinding {fleet:OriginalNativeFleet;naming:OriginalFleetNaming;shipNameRandom:OriginalJavaRandomState|null}
export interface OriginalFleetRosterState {scope:'native-current-fleet-rosters';bindings:OriginalFleetRosterBinding[]}
export interface OriginalFleetRosterLifecycle extends OriginalFleetLifecycleServices {nameOnAdd?(member:OriginalNativeFleetMember):string;getCaptain?(member:OriginalNativeFleetMember):OriginalPayrollPerson;fleetFactionId?(fleet:OriginalNativeFleet):string}
export type OriginalFleetRosterServices=Pick<OriginalFleetCompositionServices<OriginalNativeFleetMember>,'createMember'|'pickShipName'|'setShipName'|'memberFP'|'memberCivilian'|'memberHullSize'|'memberHints'|'addMember'|'removeMember'|'membersCopy'|'numMembers'|'sortFleet'>&{
 getCaptain(member:OriginalNativeFleetMember):OriginalPayrollPerson;
 sortPreferred(size:number|null):void;sortToMatchOrder(order:{id:string}[]):void;sortedMembers():OriginalNativeFleetMember[]|null;
 sync():ReturnType<typeof import('./OriginalFleetData.mjs').synchronizeOriginalFleet>;
 getMemberAtIndex(index:number):OriginalNativeFleetMember|null;setMemberAtIndex(member:OriginalNativeFleetMember,index:number):void;insertMemberAtIndex(member:OriginalNativeFleetMember,index:number):void;removeMemberAtIndex(index:number):void;removeWithoutCollapse(member:OriginalNativeFleetMember):void;clear(detach?:boolean):void;
 insertMember(index:number,member:OriginalNativeFleetMember):void;swapMembers(a:OriginalNativeFleetMember,b:OriginalNativeFleetMember):void;collapseEmptySlots():void;
};
export function createOriginalFleetRosterState():OriginalFleetRosterState;
export function registerOriginalFleetRoster(state:OriginalFleetRosterState,fleet:OriginalNativeFleet,naming:OriginalFleetNaming,shipNameRandom?:OriginalJavaRandomState|null):OriginalFleetRosterBinding;
export function validateOriginalFleetRosterState(state:OriginalFleetRosterState,player:OriginalPlayerEconomyState|null,factory:OriginalFleetMemberFactory|null):OriginalFleetRosterState;
export function dirtyOriginalFleetRoster(binding:OriginalFleetRosterBinding):void;
export function originalFleetRosterMembers(binding:OriginalFleetRosterBinding,services?:OriginalFleetLifecycleServices):OriginalNativeFleetMember[]|null;
export function originalFleetRosterMembersCopy(binding:OriginalFleetRosterBinding,services?:OriginalFleetLifecycleServices):OriginalNativeFleetMember[];
export function originalFleetRosterSize(binding:OriginalFleetRosterBinding,services?:OriginalFleetLifecycleServices):number;
export function originalFleetRosterSortedMembers(binding:OriginalFleetRosterBinding,services?:OriginalFleetLifecycleServices):OriginalNativeFleetMember[]|null;
export function addOriginalFleetRosterMember(binding:OriginalFleetRosterBinding,member:OriginalNativeFleetMember,services:OriginalFleetRosterLifecycle):void;
export function insertOriginalFleetRosterMember(binding:OriginalFleetRosterBinding,index:number,member:OriginalNativeFleetMember):void;
export function removeOriginalFleetRosterMember(binding:OriginalFleetRosterBinding,member:OriginalNativeFleetMember):void;
export function swapOriginalFleetRosterMembers(binding:OriginalFleetRosterBinding,a:OriginalNativeFleetMember,b:OriginalNativeFleetMember):void;
export function collapseOriginalFleetRosterSlots(binding:OriginalFleetRosterBinding):void;
export function sortOriginalFleetRoster(binding:OriginalFleetRosterBinding,services:OriginalFleetRosterLifecycle,preferredHullSize?:number|null):void;
export function sortOriginalFleetRosterToMatchOrder(binding:OriginalFleetRosterBinding,order:{id:string}[],services:OriginalFleetRosterLifecycle):void;
export function originalFleetRosterServices(binding:OriginalFleetRosterBinding,factory:OriginalFleetMemberFactory,player:OriginalPlayerEconomyState,plugins?:OriginalMemberEffectPlugins,lifecycle?:OriginalFleetRosterLifecycle):OriginalFleetRosterServices;
export function insertOriginalFleetRosterAtIndex(binding:OriginalFleetRosterBinding,member:OriginalNativeFleetMember,index:number,services:OriginalFleetRosterLifecycle):void;
export function setOriginalFleetRosterAtIndex(binding:OriginalFleetRosterBinding,member:OriginalNativeFleetMember,index:number,services:OriginalFleetRosterLifecycle):void;
export function removeOriginalFleetRosterAtIndex(binding:OriginalFleetRosterBinding,index:number):void;
export function removeOriginalFleetRosterWithoutCollapse(binding:OriginalFleetRosterBinding,member:OriginalNativeFleetMember):void;
export function clearOriginalFleetRoster(binding:OriginalFleetRosterBinding,detach?:boolean):void;
export function originalFleetRosterAtIndex(binding:OriginalFleetRosterBinding,index:number):OriginalNativeFleetMember|null;
