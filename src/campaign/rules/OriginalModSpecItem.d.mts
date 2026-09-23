import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalOpaqueCargoStack} from './OriginalResourceCargo.mjs';
export interface OriginalModSpecState {scope:'native-modspec-item-plugin';itemId:'modspec';modId:string;stack:OriginalModSpecStack;spec:object;modSpec:{id:string;name:string;manufacturer:string|null;baseValue:number|null}}
export type OriginalModSpecStack=OriginalOpaqueCargoStack&{type:'SPECIAL';itemId:'modspec';itemData:string;plugin:OriginalModSpecState};
export interface OriginalModSpecServices {isCharacterHullmodKnown?(id:string):boolean;addCharacterHullmod?(id:string):void;showModSpecMessage?(message:string):void;playModSpecUISound?(id:string,pitch:number,volume:number):void;renderModSpecItem?(plugin:OriginalModSpecState,...args:unknown[]):void;createModSpecTooltip?(plugin:OriginalModSpecState,...args:unknown[]):void}
export function createOriginalModSpecCargoStack(cargo:OriginalPlayerCargo,modId:string):OriginalModSpecStack;
export function bindOriginalModSpecItem(plugin:OriginalModSpecState,services?:OriginalModSpecServices):{getId():string;getName():string;getDesignType():string|null;getPrice():number;hasRightClickAction():boolean;shouldRemoveOnRightClickAction():boolean;isTooltipExpandable():boolean;performRightClickAction():void;render(...args:unknown[]):void;createTooltip(...args:unknown[]):void};
