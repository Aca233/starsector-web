import type {OriginalPayrollPerson,OriginalPersonnelMemoryEntry} from './OriginalPlayerEconomy.mjs';
import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export function originalPersonMemoryWithoutUpdate(person:OriginalPayrollPerson):OriginalCampaignMemory;
export function advanceOriginalPerson(person:OriginalPayrollPerson,seconds:number,days:number,context:{paused:boolean},services?:OriginalCampaignMemoryServices):void;
export function readOriginalPersonMemoryEntry(person:OriginalPayrollPerson,key:string,services?:OriginalCampaignMemoryServices):OriginalPersonnelMemoryEntry;
