import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalResourceStack,OriginalOpaqueCargoStack} from './OriginalResourceCargo.mjs';
import type {OriginalNativeFleet} from './OriginalFleetData.mjs';
export interface OriginalNativeCargoItem {type:'RESOURCES'|'WEAPONS'|'FIGHTER_CHIP'|'NULL'|'SPECIAL';commodityId?:string;itemId?:string;itemData?:string|null}
export type OriginalNativeCargoStack=OriginalResourceStack|OriginalOpaqueCargoStack;
export interface OriginalNativeCargoServices {
 resolveEncounterFleetData?(dataRef:string):OriginalNativeFleet;
 readNativeCargoOriginalSource?(cargo:OriginalPlayerCargo):OriginalPlayerCargo|null;
 createNativeSpecialCargoStack?(cargo:OriginalPlayerCargo,itemId:string,itemData:string|null):OriginalOpaqueCargoStack;
 sortNativeCargoShips?(fleet:object):void;
}
export function originalNativeCargoItemSpec(stack:OriginalNativeCargoItem):{cargoSpace:number;stackSize:number;order?:number;tags?:string[];name?:string;size?:number;hullName?:string};
export function originalNativeCargoStackUnit(stack:OriginalNativeCargoItem):number;
export function addOriginalNativeCargoStack(cargo:OriginalPlayerCargo,stack:OriginalNativeCargoStack,amount:number,services?:OriginalNativeCargoServices):void;
export function addOriginalNativeCargoItems(cargo:OriginalPlayerCargo,item:OriginalNativeCargoItem,amount:number,services?:OriginalNativeCargoServices):void;
export function originalNativeCargoIsEmpty(cargo:OriginalPlayerCargo):boolean;
export function clearOriginalNativeCargo(cargo:OriginalPlayerCargo):void;
export function sortOriginalNativeCargo(cargo:OriginalPlayerCargo,services?:OriginalNativeCargoServices):void;

export function originalNativeCargoStackFields(stack:OriginalNativeCargoStack):{max:number;round:boolean};
export function sameOriginalNativeCargoItem(a:OriginalNativeCargoItem|null,b:OriginalNativeCargoItem|null):boolean;
export function setOriginalNativeCargoStackSize(cargo:OriginalPlayerCargo,stack:OriginalNativeCargoStack,size:number,services?:OriginalNativeCargoServices):void;
export function removeOriginalNativeCargoItems(cargo:OriginalPlayerCargo,item:OriginalNativeCargoItem,amount:number,services?:OriginalNativeCargoServices):boolean;
export function originalNativeCargoItemQuantity(cargo:OriginalPlayerCargo,item:OriginalNativeCargoItem):number;
export function setOriginalNativeCargoSlot(cargo:OriginalPlayerCargo,index:number,stack:OriginalNativeCargoStack|null,services?:OriginalNativeCargoServices):void;

export interface NativeCargoPresentation {name:string;icons:string[];overlay:string|null;presentation:'base-native-assets';canPutInLoot:boolean}
export function originalNativeCargoItemPresentation(stack:OriginalNativeCargoItem):NativeCargoPresentation;

export function addAllOriginalNativeCargo(target:OriginalPlayerCargo,source:OriginalPlayerCargo,services?:OriginalNativeCargoServices):void;
export function copyOriginalNativeCargo(source:OriginalPlayerCargo,createCargo:()=>OriginalPlayerCargo,services?:OriginalNativeCargoServices):OriginalPlayerCargo;
