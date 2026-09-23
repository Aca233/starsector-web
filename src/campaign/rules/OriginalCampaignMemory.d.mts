export interface OriginalCampaignMemory {scope:'native-campaign-memory';data:{key:string;value:unknown}[];expire:{key:string;timeLeft:number}[];require:{key:string;req:string[]}[];reqFor:{key:string;value:string}[];restored:boolean}
export interface OriginalCampaignMemoryServices {parseJavaFloat?(value:string):number;resolveEntity?(id:string):object|null;resolveMarket?(id:string):object|null;javaToString?(value:unknown):string}
export function createOriginalCampaignMemory():OriginalCampaignMemory;
export function validateOriginalCampaignMemory(memory:OriginalCampaignMemory):OriginalCampaignMemory;
export function originalEntityMemoryWithoutUpdate(entity:{memory:OriginalCampaignMemory|null}):OriginalCampaignMemory;
export function originalCampaignMemoryGet(memory:OriginalCampaignMemory,key:string,services?:OriginalCampaignMemoryServices):unknown;
export function originalCampaignMemoryContains(memory:OriginalCampaignMemory,key:string,services?:OriginalCampaignMemoryServices):boolean;
export function originalCampaignMemoryBoolean(memory:OriginalCampaignMemory,key:string,services?:OriginalCampaignMemoryServices):boolean;
export function expireOriginalCampaignMemory(memory:OriginalCampaignMemory,key:string,days:number):void;
export function setOriginalCampaignMemory(memory:OriginalCampaignMemory,key:string,value:unknown,days?:number):void;
export function addOriginalCampaignMemoryRequired(memory:OriginalCampaignMemory,key:string,required:string):void;
export function removeOriginalCampaignMemoryRequired(memory:OriginalCampaignMemory,key:string,required:string):void;
export function unsetOriginalCampaignMemory(memory:OriginalCampaignMemory,key:string,services?:OriginalCampaignMemoryServices):void;
export function advanceOriginalCampaignMemory(memory:OriginalCampaignMemory,days: number,context:{paused:boolean},services?:OriginalCampaignMemoryServices):void;

export function originalCampaignMemoryInteger(memory:OriginalCampaignMemory,key:string,services?:OriginalCampaignMemoryServices):number;
