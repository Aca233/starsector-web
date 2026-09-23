import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalOpaqueCargoStack} from './OriginalResourceCargo.mjs';
import type {OriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
export interface OriginalSpecialItemSpec {name:string;plugin:string;stackSize:number;cargoSpace:number;basePrice:number;manufacturer:string|null;params:string|null;soundId:string;soundIdDrop:string;desc:string;icon:string}
export interface OriginalSpecialItemState {scope:'native-special-item-plugin';classId:string;itemId:string;spec:OriginalSpecialItemSpec;stack:OriginalSpecialCargoStack}
export type OriginalSpecialCargoStack=Omit<OriginalOpaqueCargoStack,'cargo'>&{type:'SPECIAL';itemId:string;itemData:string|null;cargo:OriginalPlayerCargo|null;plugin:OriginalSpecialItemState};
export interface OriginalSpecialItemServices {
 isCharacterHullmodKnown?(id:string):boolean;playSpecialItemUISound?(id:string,pitch:number,volume:number):void;
 readSpecialItemPlayerMemory?():OriginalCampaignMemory;readSpecialItemPlayerFleet?():object|null;
 createSpecialItemRuleDialog?(trigger:string):object;setSpecialItemRuleDialogCustom1?(dialog:object,helper:unknown):void;
 /** Native dismiss delegate has no state effect; the actual UI service owns dialog presentation. */
 showSpecialItemCargoDialog?(dialog:object,fleet:object|null):void;createSpecialItemTooltip?(plugin:OriginalSpecialItemState,...args:unknown[]):void;
}
export interface OriginalSpecialItemFacade {
 getId():string;getName():string;getDesignType():string|null;getSpec():OriginalSpecialItemSpec;getPrice():number;getTooltipWidth():number;isTooltipExpandable():boolean;
 hasRightClickAction():boolean;shouldRemoveOnRightClickAction():boolean;resolveDropParamsToSpecificItemData():string;performRightClickAction(helper?:unknown):void;render():void;createTooltip(...args:unknown[]):void;
}
export function hasOriginalSpecialItemFactory(itemId:string):boolean;
export function createOriginalSpecialCargoStack(cargo:OriginalPlayerCargo,itemId:string,itemData:string|null):OriginalSpecialCargoStack&{cargo:OriginalPlayerCargo};
export function createOriginalSpecialCargoStack(cargo:OriginalPlayerCargo|null,itemId:string,itemData:string|null):OriginalSpecialCargoStack;
export function bindOriginalSpecialItem(plugin:OriginalSpecialItemState,services?:OriginalSpecialItemServices):OriginalSpecialItemFacade;
