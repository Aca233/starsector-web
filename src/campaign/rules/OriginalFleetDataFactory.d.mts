import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalPlayerEconomyState,OriginalPlayerCargo,OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalFleetMemberFactory} from './OriginalFleetMembers.mjs';
import type {OriginalFleetRosterState,OriginalFleetRosterBinding} from './OriginalFleetRoster.mjs';
export interface OriginalFleetDataClass {scope:'native-fleet-data-class-objects';origin:'new-web-current-sector-runtime'|'bound-current-class-objects';nullMember:OriginalNativeFleetMember;defaultCommander:OriginalPayrollPerson}
export interface OriginalConstructedCargo extends OriginalPlayerCargo {credits:{objectRef:string;value:number};maxCapacity:number;maxFuel:number;maxPersonnel:number;mothballedShips:OriginalConstructedFleetData|null;mothballedShipsRef?:string;freeTransfer:boolean;origSource:string|null}
export interface OriginalConstructedFleetData extends OriginalNativeFleet {nativeConstruction:'fleet-data';campaign?:import('./OriginalCampaignFleet.mjs').OriginalCampaignFleetConstruction;campaignFleetRef:string|null;defaultCommanderRef:string;nullMember:OriginalNativeFleetMember;cargo:OriginalConstructedCargo;snapshot:OriginalNativeFleetMember[];postLoadReset:boolean|null;compressedMembers:string|null;compressedCaptains:unknown|null}
export interface OriginalFleetDataFactory {scope:'web-current-fleet-data-factory';classState:OriginalFleetDataClass|null;serial:number;fleets:OriginalConstructedFleetData[];campaignResources:import('./OriginalCampaignFleet.mjs').OriginalCampaignResources|null}
export function createOriginalFleetDataFactory():OriginalFleetDataFactory;
export function initializeOriginalFleetDataClass(factory:OriginalFleetDataFactory,memberFactory:OriginalFleetMemberFactory,player:OriginalPlayerEconomyState):OriginalFleetDataClass;
export function bindOriginalFleetDataClass(factory:OriginalFleetDataFactory,nullMember:OriginalNativeFleetMember,defaultCommander:OriginalPayrollPerson,player:OriginalPlayerEconomyState):OriginalFleetDataClass;
export function createOriginalFleetCargo(dataRef:string):OriginalConstructedCargo;
export function initializeOriginalCargoMothballedShips(cargo:OriginalConstructedCargo,factionId:string,services:{readMothballedFaction(id:string):{factionId:string;shipNamePrefix:string|null};createMothballedFleetData(prefix:string|null,id:string):OriginalConstructedFleetData}):OriginalConstructedFleetData;
export function createOriginalFleetData(factory:OriginalFleetDataFactory,rosters:OriginalFleetRosterState,player:OriginalPlayerEconomyState,prefix:string|null,sourceFactionId:string|null):OriginalFleetRosterBinding&{fleet:OriginalConstructedFleetData};
export function validateOriginalFleetDataFactory(factory:OriginalFleetDataFactory,memberFactory:OriginalFleetMemberFactory|null,player:OriginalPlayerEconomyState|null,rosters:OriginalFleetRosterState|null):OriginalFleetDataFactory;
