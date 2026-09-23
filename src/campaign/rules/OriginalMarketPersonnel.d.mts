import type { JsonValue } from '../Types.js';
import type { OriginalPlayerEconomyState, OriginalPayrollPerson } from './OriginalPlayerEconomy.mjs';
export interface OriginalNativeUID {scope:'native-sector-uid';sectorRef:string;nextId:string}
export interface OriginalCommEntry {objectRef:string;id:string|null;type:string|null;entryDataRef:string|null;hidden:boolean;source?:JsonValue}
export interface OriginalCommDirectory {objectRef:string;entries:OriginalCommEntry[]}
export interface OriginalMarketPersonnel {scope:'native-market-personnel';marketRef:string;marketId:string;adminRef:string|null;peopleRefs:string[]|null;commDirectory:OriginalCommDirectory|null}
export interface OriginalMarketPersonnelRegistry {scope:'native-market-personnel-registry';markets:OriginalMarketPersonnel[];people:OriginalPayrollPerson[];unresolved:string[]}
export interface OriginalPersonnelMarket {objectRef:string;marketId:string;factionId:string;playerOwned:boolean;personnel?:OriginalMarketPersonnel;adminIsPlayer:boolean|null;adminAiCoreId:string|null}
export interface OriginalMarketPersonnelServices {refreshGovernedOutpostEffects(stats:OriginalPayrollPerson['stats'],market:OriginalPersonnelMarket):unknown}
export function originalPersonnelPeople(state:OriginalPlayerEconomyState):OriginalPayrollPerson[];
export function originalPersonnelByRef(state:OriginalPlayerEconomyState,objectRef:string):OriginalPayrollPerson;
export function removeOriginalMarketPerson(market:OriginalPersonnelMarket,person:OriginalPayrollPerson|null):void;
export function addOriginalMarketPerson(market:OriginalPersonnelMarket,person:OriginalPayrollPerson|null):void;
export function setOriginalMarketAdministrator(state:OriginalPlayerEconomyState,market:OriginalPersonnelMarket,person:OriginalPayrollPerson|null,services:OriginalMarketPersonnelServices):OriginalPayrollPerson|null;
export function nextOriginalNativeUID(state:OriginalPlayerEconomyState):string;
export function createOriginalDefaultFleetCaptain(state:OriginalPlayerEconomyState):OriginalPayrollPerson;
export function createOriginalDefaultAdministrator(state:OriginalPlayerEconomyState,factionId:string):OriginalPayrollPerson;
export function getOriginalMarketAdministrator(state:OriginalPlayerEconomyState,market:OriginalPersonnelMarket,services:OriginalMarketPersonnelServices):OriginalPayrollPerson;
export function validateOriginalMarketPersonnel(state:OriginalPlayerEconomyState):OriginalPlayerEconomyState;
