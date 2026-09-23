import type {OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalNativeCargoStack,OriginalNativeCargoServices} from './OriginalNativeCargo.mjs';
export type OriginalLootCargoSide='fleet'|'loot';
export type OriginalLootCargoAction={kind:'pick'|'drop';side:OriginalLootCargoSide;index:number}|{kind:'sort';side:OriginalLootCargoSide}|{kind:'return'|'cancel'|'take-all'};
export interface OriginalLootCargoTransaction {scope:'native-loot-cargo-transaction';tookAll:boolean;legacySharedSource:boolean;panelConfirmed:boolean;fleet:OriginalPlayerCargo;sourceLoot:OriginalPlayerCargo;loot:OriginalPlayerCargo;bought:OriginalPlayerCargo;sold:OriginalPlayerCargo;picked:null|{from:OriginalLootCargoSide;index:number;original:OriginalNativeCargoStack;restore:OriginalNativeCargoStack;stack:OriginalNativeCargoStack}}
export type NativeLootItemView={display:import('./OriginalNativeCargo.mjs').NativeCargoPresentation;size:number;maxSize:number;roundSize:boolean}&({type:'RESOURCES';commodityId:string}|{type:'WEAPONS'|'FIGHTER_CHIP';itemId:string}|{type:'SPECIAL';itemId:string;itemData:string|null});
export interface NativeLootCargoView {scope:'native-loot-cargo-all-tab';tookAll:boolean;fleet:{slots:(NativeLootItemView|null)[]};loot:{slots:(NativeLootItemView|null)[]};bought:{slots:(NativeLootItemView|null)[]};sold:{slots:(NativeLootItemView|null)[]};picked:null|{from:OriginalLootCargoSide;index:number;stack:NativeLootItemView};transactionExists:boolean}
export function createOriginalLootCargoTransaction(fleet:OriginalPlayerCargo,loot:OriginalPlayerCargo,createCargo:()=>OriginalPlayerCargo,services?:OriginalNativeCargoServices):OriginalLootCargoTransaction;
export function validateOriginalLootCargoTransaction(state:OriginalLootCargoTransaction):OriginalLootCargoTransaction;
export function originalLootTransactionExists(state:OriginalLootCargoTransaction):boolean;
export function applyOriginalLootCargoActions(state:OriginalLootCargoTransaction,actions:OriginalLootCargoAction[],services?:OriginalNativeCargoServices):OriginalLootCargoTransaction;
export function projectOriginalLootCargo(fleet:OriginalPlayerCargo,loot:OriginalPlayerCargo,state?:OriginalLootCargoTransaction|null):NativeLootCargoView;

export interface OriginalLootTransactionContext {market:object;submarket:object|null;tradeMode:string;freeTransfer:true}
export interface OriginalLootNonMarketTransaction {scope:'native-player-market-transaction';market:object;submarket:object|null;tradeMode:string;creditValue:0;bought:OriginalPlayerCargo;sold:OriginalPlayerCargo;lineItems:[];shipsBought:[];shipsSold:[]}
export interface OriginalLootConfirmationServices extends OriginalNativeCargoServices {
 createEncounterLootCargo?():OriginalPlayerCargo;
 readInteractionLootTransactionContext?(state:OriginalLootCargoTransaction,dialog:object):OriginalLootTransactionContext;
 reportInteractionPlayerDidNotTakeCargo?(cargo:OriginalPlayerCargo,fleet:import('./OriginalFleetData.mjs').OriginalNativeFleet):void;
 reportInteractionNonMarketTransaction?(transaction:OriginalLootNonMarketTransaction,dialog:object):void;
 updateInteractionLootMarketPrices?(market:object):void;
}
export function confirmOriginalLootCargoPanel(state:OriginalLootCargoTransaction,fleet:import('./OriginalFleetData.mjs').OriginalNativeFleet,dialog:object,services?:OriginalLootConfirmationServices):boolean;
