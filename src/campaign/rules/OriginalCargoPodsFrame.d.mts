import type {OriginalCargoPods} from './OriginalCargoPods.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFleetContactContext,OriginalCargoPodsContactServices,OriginalCargoPodsContactEffect} from './OriginalFleetContact.mjs';
import type {OriginalEntityFrameServices} from './OriginalCampaignEntityFrame.mjs';
import type {OriginalSensorEntity} from './OriginalSensors.mjs';
export interface OriginalCargoPodsFrameContext extends OriginalFleetContactContext {paused:boolean}
export interface OriginalCargoPodsFrameServices extends OriginalCargoPodsContactServices,OriginalEntityFrameServices {readCargoPodsAbyssalDepth?(pod:OriginalCargoPods):number}
export function advanceOriginalCargoPodsField(pod:OriginalCargoPods,seconds:number,days:number,random:OriginalJavaRandomState,context:OriginalFleetContactContext,manager?:OriginalCargoPods['plugin']['manager']):void;
export function advanceOriginalCargoPodsPlugin(pod:OriginalCargoPods,seconds:number,days:number,random:OriginalJavaRandomState,context:OriginalFleetContactContext,services?:OriginalCargoPodsFrameServices):OriginalCargoPods;
export function advanceOriginalCargoPodsFrame(pod:OriginalCargoPods,seconds:number,days:number,random:OriginalJavaRandomState,context:OriginalCargoPodsFrameContext,services?:OriginalCargoPodsFrameServices):{scope:'native-cargo-pods-frame';effects:OriginalCargoPodsContactEffect[];readyForAuthority:false};
export function advanceOriginalCargoPodsEvenIfPaused(pod:OriginalCargoPods,seconds:number,context:OriginalCargoPodsFrameContext,services?:OriginalCargoPodsFrameServices):void;
export function originalCargoPodsSensorEntity(pod:OriginalCargoPods):OriginalSensorEntity;

export function initializeOriginalCargoPodsField(pod:OriginalCargoPods,random:OriginalJavaRandomState,manager?:OriginalCargoPods['plugin']['manager']):void;
