import type {NativeDevelopmentState,NativeDevelopmentController} from './DevelopmentWorld.mjs';
import type {advanceOriginalCampaignEngine} from '../../../src/campaign/rules/OriginalCampaignEngine.mjs';
import type {DeepReadonly,EventBatch} from '../../../src/campaign/Types.js';
export interface NativeCommittedFrameEffect {delivery:'native-player'|'observer-scene'|'host-only';sourceRef:string;locationRef:string;recipientPlayerId:string|null;recipientDataRef:string|null;effect:Record<string,unknown>}
export interface NativeFrameEventsRequest {worldId:string;epoch:string;afterRevision:number;limit?:number}
export interface NativePlayerFrameEvents {scope:'native-player-frame-events';worldId:string;epoch:string;revision:number;afterRevision:number;nextRevision:number;events:{id:string;revision:number;dataRef:string;effect:Record<string,unknown>}[];readyForAuthority:false}
export function captureNativeFrameEffects(entries:ReturnType<typeof advanceOriginalCampaignEngine>['effects'],controllers:DeepReadonly<NativeDevelopmentController[]>,presentation?:{readPlayerBaseColor?():number[]}):DeepReadonly<NativeCommittedFrameEffect[]>;
export function validateNativeFrameEventsRequest(input:unknown):NativeFrameEventsRequest&{limit:number};
export function projectNativeFrameEventBatches(state:NativeDevelopmentState,playerId:string,input:NativeFrameEventsRequest,batches:DeepReadonly<EventBatch[]>):DeepReadonly<Omit<NativePlayerFrameEvents,'epoch'>>;
