import type {OriginalCampaignMessages} from '../rules/OriginalCampaignMessages.mjs';
import type {NativePlayerFrameEvents} from './NativeProtocol.js';
export interface NativeMessageStream {worldId:string;playerId:string;cursor:number;list:OriginalCampaignMessages;unhandled:string[]}
export function createNativeMessageStream(worldId:string,playerId:string,revision:number):NativeMessageStream;
export function applyNativeMessagePage(stream:NativeMessageStream,page:NativePlayerFrameEvents,ownedDataRefs:readonly string[]):{accepted:boolean;added:number;merged:number;sounds:number};
