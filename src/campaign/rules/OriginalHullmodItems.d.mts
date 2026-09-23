import type {OriginalNativeCargoItem,OriginalNativeCargoServices} from './OriginalNativeCargo.mjs';
import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalStorageVariant} from './OriginalStorage.mjs';
import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export interface OriginalHullmodItemManager {scope:'native-hullmod-item-manager';objectRef?:string;kind?:'hullmod-item-manager';map:{memberId:string;installed:{modId:string;item:OriginalNativeCargoItem}[]}[]}
export interface OriginalHullmodItemMember {id:string;variant:OriginalStorageVariant}
export interface OriginalHullmodItemServices {
 readHullmodRequiredItem?(id:string):OriginalNativeCargoItem|null;
 readHullmodGameState?():string;readHullmodPlayerCargo?():OriginalPlayerCargo|null;readHullmodStorageCargo?(market:object):OriginalPlayerCargo|null;
 isHullmodBuiltIntoMember?(member:OriginalHullmodItemMember,id:string):boolean;createHullmodItemsCargo?():OriginalPlayerCargo;cargoServices?:OriginalNativeCargoServices;
}
export interface OriginalHullmodItemInstanceServices {memoryServices?:OriginalCampaignMemoryServices;readRefitScreenListeners():{saved:object[];transient:object[]};createHullmodItemManagerRef():string}
export interface OriginalHullmodItemManagerFacade {
 isRequiredItemAvailable(id:string,member:OriginalHullmodItemMember|null,variant:OriginalStorageVariant|null,market:object|null):boolean;
 getHullmodDiff(member:OriginalHullmodItemMember,variant:OriginalStorageVariant):{needItems:string[];noLongerNeedItems:string[]};
 getNumUnconfirmed(item:OriginalNativeCargoItem,member:OriginalHullmodItemMember|null,variant:OriginalStorageVariant|null):number;
 getNumAvailable(item:OriginalNativeCargoItem,market:object|null):number;
 getNumAvailableMinusUnconfirmed(item:OriginalNativeCargoItem,member:OriginalHullmodItemMember|null,variant:OriginalStorageVariant|null,market:object|null):number;
 takeRequiredItems(id:string,member:OriginalHullmodItemMember,market:object|null):void;giveBackRequiredItems(id:string,member:OriginalHullmodItemMember,cargo:OriginalPlayerCargo|null):void;
 giveBackAllItems(member:OriginalHullmodItemMember,cargo?:OriginalPlayerCargo|null):void;reportFleetMemberVariantSaved(member:OriginalHullmodItemMember,market:object|null):void;getItemsInUseBy(member:OriginalHullmodItemMember):OriginalPlayerCargo;
}
export function originalHullmodRequiredItem(id:string,services?:OriginalHullmodItemServices):OriginalNativeCargoItem|null;
export function validateOriginalHullmodItemManager(state:OriginalHullmodItemManager):OriginalHullmodItemManager;
export function originalHullmodItemManagerInstance(memory:OriginalCampaignMemory,services:OriginalHullmodItemInstanceServices):OriginalHullmodItemManager;
export function bindOriginalHullmodItemManager(state:OriginalHullmodItemManager,services?:OriginalHullmodItemServices):OriginalHullmodItemManagerFacade;
