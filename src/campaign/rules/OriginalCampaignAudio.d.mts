export interface OriginalCampaignSoundShot {file:string;pitch:number;volume:number;position:number[];velocity:number[];age:number}
export interface OriginalCampaignAudioState {scope:'native-campaign-audio';recent:OriginalCampaignSoundShot[]}
export function createOriginalCampaignAudio():OriginalCampaignAudioState;
export function selectOriginalCampaignSounds(state:OriginalCampaignAudioState,effects:readonly unknown[],context:{listener:readonly number[];seconds:number},services?:{random?():number;readSoundSpec?(id:string):{file:string;pitch:number;volume:number}[]|null|undefined}):{shots:OriginalCampaignSoundShot[];unsupported:string[]};
