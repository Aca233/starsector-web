import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
import type {OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export interface OriginalImportantPersonData {scope:'native-important-person-data';person:OriginalPayrollPerson;location:{scope:'native-important-person-location';market:object|null;entity:object|null};checkedOutFor:string[]}
export interface OriginalImportantPeople {scope:'native-important-people';people:OriginalImportantPersonData[];excludeFromGetPerson:OriginalPayrollPerson[]|null;idToPersonDataMap:{id:string;data:OriginalImportantPersonData}[]|null;lastGetPersonResultWasExistingPerson:boolean;listVersion:number}
export interface OriginalImportantPeopleServices {convertImportantPeopleSecondsToDays(seconds:number):number;memoryServices?:OriginalCampaignMemoryServices;advanceImportantPerson?(person:OriginalPayrollPerson,seconds:number):void}
export function createOriginalImportantPeople():OriginalImportantPeople;
export function validateOriginalImportantPeople(state:OriginalImportantPeople):OriginalImportantPeople;
export function originalImportantPersonData(state:OriginalImportantPeople,id:string):OriginalImportantPersonData|null;
export function addOriginalImportantPerson(state:OriginalImportantPeople,person:OriginalPayrollPerson,services:{readImportantPersonMarket(person:OriginalPayrollPerson):object|null}):void;
export function removeOriginalImportantPerson(state:OriginalImportantPeople,id:string):void;
export function advanceOriginalImportantPeople(state:OriginalImportantPeople,seconds:number,context:{paused:boolean},services:OriginalImportantPeopleServices):void;
