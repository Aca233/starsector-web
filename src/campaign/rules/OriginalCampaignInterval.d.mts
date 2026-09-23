export interface OriginalCampaignInterval {scope:'native-campaign-interval-tracker';minInterval:number;maxInterval:number;currInterval:number;elapsed:number;intervalElapsed:boolean}
export function createOriginalCampaignInterval(min:number,max:number,randomDouble:()=>number):OriginalCampaignInterval;
export function validateOriginalCampaignInterval(state:OriginalCampaignInterval):OriginalCampaignInterval;
export function setOriginalCampaignInterval(state:OriginalCampaignInterval,min:number,max:number,randomDouble:()=>number):void;
export function advanceOriginalCampaignInterval(state:OriginalCampaignInterval,amount:number,randomDouble:()=>number):void;
