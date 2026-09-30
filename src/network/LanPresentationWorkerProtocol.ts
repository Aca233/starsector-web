import type { LanRealtimePacket, LanRealtimeReceipt } from './LanPresentationRealtime';
import type { GraphicsSettings } from '../engine/runtime/GraphicsSettings';
import type { LanVisualDelivery } from './LanPresentationVisuals';
import type { CombatViewport } from '../engine/runtime/CombatViewport';
import type { Match, PlayerInput, Seat } from './protocol';
import type { LanBinaryDelivery, LanBinaryIngressSession } from './LanBinaryStateIngress';
import type { LanComponentDelivery, LanComponentResult } from './LanPresentationComponents';
import type { LanUiPacket, LanUiReceipt, LanUiSession } from './LanPresentationUiTransport';
import type { LanViewReply, LanViewRequest } from './LanPresentationCommands';
import type { LanWorkerTelemetry } from './LanPresentationTelemetry';
import type { CombatSnapshot, CombatSound } from './CombatSnapshot';

export interface PresentationEpoch { owner: string; epoch: number }
/** Latest sampled controls, NOT a queued input/action or authority command. */
export interface LanWorkerControls {
  viewport: CombatViewport | null; pointer: [number, number] | null; zoom: number;
  seq: number; keys: number; firing: boolean;
  visible: boolean; launched: boolean; synced: boolean; focused: boolean; blocked: boolean;
  syncId: string; minTick: number;
}
export const idleWorkerControls = (): LanWorkerControls => ({ viewport:null,pointer:null,zoom:.65,seq:0,keys:0,firing:false,
  visible:true,launched:false,synced:false,focused:false,blocked:true,syncId:'',minTick:0 });
export function copyWorkerControls(value: LanWorkerControls): LanWorkerControls {
  if (!value || !Number.isFinite(value.zoom) || value.zoom <= 0 || !Number.isSafeInteger(value.seq) || value.seq < 0
    || !Number.isInteger(value.keys) || value.keys < 0 || value.keys > 255 || !Number.isSafeInteger(value.minTick) || value.minTick < 0
    || typeof value.syncId !== 'string' || value.syncId.length > 128
    || [value.firing,value.visible,value.launched,value.synced,value.focused,value.blocked].some(v=>typeof v!=='boolean')) throw Error('Invalid presentation controls');
  const pointer=value.pointer;
  if (pointer !== null && (!Array.isArray(pointer) || pointer.length!==2 || !pointer.every(Number.isFinite))) throw Error('Invalid presentation pointer');
  const viewport=value.viewport;
  if(viewport!==null){
    const rect=viewport?.rect;
    if(!rect||!Number.isSafeInteger(viewport.width)||!Number.isSafeInteger(viewport.height)||viewport.width<1||viewport.height<1
      ||![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)throw Error('Invalid presentation viewport');
  }
  // Copy only these bounded scalar fields; never retain a caller's extra graph.
  return {viewport:viewport?{width:viewport.width,height:viewport.height,rect:{left:viewport.rect.left,top:viewport.rect.top,width:viewport.rect.width,height:viewport.rect.height}}:null,
    pointer:pointer?[pointer[0],pointer[1]]:null,zoom:value.zoom,seq:value.seq,keys:value.keys,firing:value.firing,visible:value.visible,
    launched:value.launched,synced:value.synced,focused:value.focused,blocked:value.blocked,syncId:value.syncId,minTick:value.minTick};
}
export interface LanWorkerAuxiliary {
  tick: number; acknowledged: number | null; sounds: CombatSound[]; listener: [number,number];
}
export interface LanWorkerStatus {
  control:{transport:'shared'|'messages';revision:number;revocations:number;pointerRevocations:number};
  telemetry: LanWorkerTelemetry; controlledIds: string[]; gpuInfo: {vendor:string;renderer:string};
  tick: number; receivedTick: number; frames: number; pendingFrames: number; ready: boolean;
  camera: [number,number]; zoom: number; hudZoom: number; motionTick: number; combatTick: number;
  stale: boolean; phase: string;
  visual: {tick:number;received:number;entities:number;renderEntities:number;bulkEntities:number}; graphics: Readonly<GraphicsSettings>;
}
export interface LanWorkerDisposal { disposed: true; residentTextures: number; pendingUploads: number }
export type ToPresentationWorker =
 | {type:'init';match:Match;seat:Seat;canvas:OffscreenCanvas;graphics:Readonly<GraphicsSettings>;realtime:SharedArrayBuffer|null;controlMailbox:SharedArrayBuffer|null}
 | {type:'reset';session:LanBinaryIngressSession;viewGeneration:number}
 | {type:'realtime-receipt';receipt:LanRealtimeReceipt}
 | {type:'state';id:number;packet:LanBinaryDelivery}
 | {type:'fallback';id:number;session:PresentationEpoch;frame:CombatSnapshot}
 | {type:'component';id:number;packet:LanComponentDelivery}
 | {type:'visual';id:number;packet:LanVisualDelivery}
 | {type:'controls';id:number;session:PresentationEpoch;controls:LanWorkerControls;graphics?:Readonly<GraphicsSettings>}
 | {type:'controls-wake';id:number;session:PresentationEpoch;graphics?:Readonly<GraphicsSettings>}
 | {type:'accepted-input';id:number;session:PresentationEpoch;input:PlayerInput;at:number;active:boolean}
 | {type:'view';session:PresentationEpoch;request:LanViewRequest}
 | {type:'ui-receipt';session:PresentationEpoch;receipt:LanUiReceipt}
 | {type:'stop';id:number;session:PresentationEpoch}
 | {type:'close'};
export type FromPresentationWorker =
 | {type:'capabilities';raf:boolean;offscreen:boolean}
 | {type:'realtime';packet:LanRealtimePacket}
 | {type:'ready';context:WebGLContextAttributes|null;layers:string[]}
 | {type:'fatal';message:string}
 | {type:'disposed';report:LanWorkerDisposal}
 | {type:'ui-session';session:PresentationEpoch;ui:LanUiSession}
 | {type:'ui';session:PresentationEpoch;packet:LanUiPacket;status:LanWorkerStatus}
 | {type:'view-result';session:PresentationEpoch;reply:LanViewReply}
 | {type:'controls-applied';id:number;session:PresentationEpoch;applied?:boolean}
 | {type:'operation';id:number;session:PresentationEpoch;accepted:boolean}
 | {type:'retained';id:number;session:PresentationEpoch;kind:'state'|'motion'|'combat'|'visual';status:'consumed'|'discarded';parseMs:number;auxiliary?:LanWorkerAuxiliary;component?:LanComponentResult};
export function samePresentationEpoch(a:PresentationEpoch|null,b:PresentationEpoch|null):boolean {
  return !!a&&!!b&&a.owner===b.owner&&a.epoch===b.epoch;
}
export function requireSynchronousPresentation(value:unknown):void {
  if(value&&typeof (value as Promise<unknown>).then==='function'){
    void Promise.resolve(value).catch(()=>{});throw Error('Presentation retention callbacks must be synchronous');
  }
}

export function copyAcceptedWorkerInput(input:PlayerInput):PlayerInput {
  const point=(value:unknown):value is [number,number]=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite);
  if(!input||!Number.isSafeInteger(input.seq)||input.seq<0||!Number.isInteger(input.keys)||input.keys<0||input.keys>255
    ||!point(input.aim)||typeof input.firing!=='boolean'||typeof input.pointerActive!=='boolean'||!Array.isArray(input.actions)||input.actions.length>16)throw Error('Invalid accepted presentation input');
  const kinds=['shield','hullShield','vent','system','group','mode','autofire','target','recall','module'];
  const actions=input.actions.map(a=>{
    if(!a||!Number.isSafeInteger(a.id)||a.id<0||!kinds.includes(a.kind)||a.value!==undefined&&!Number.isFinite(a.value)||a.aim!==undefined&&!point(a.aim)||a.kind==='module'&&(typeof a.value!=='number'||!Number.isInteger(a.value)||a.value<0||a.value>=128))throw Error('Invalid accepted presentation action');
    return {id:a.id,kind:a.kind,...(a.value===undefined?{}:{value:a.value}),...(a.aim?{aim:[a.aim[0],a.aim[1]] as [number,number]}:{})};
  });
  return {seq:input.seq,keys:input.keys,aim:[...input.aim],firing:input.firing,pointerActive:input.pointerActive,actions};
}
