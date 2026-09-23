import type {OriginalConstructedCampaignFleet} from './OriginalCampaignFleet.mjs';
import type {OriginalFleetContactPresentation,OriginalFleetContactEffect} from './OriginalFleetContact.mjs';
import type {OriginalFleetView} from './OriginalCampaignFleetView.mjs';
import type {OriginalFleetFrameContext,OriginalFleetFrameServices} from './OriginalCampaignFleetFrame.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalFleetDrawFrame} from './OriginalFleetDraw.mjs';
export interface OriginalFleetObserverPresentation {scope:'native-observer-fleet-presentation';fleet:OriginalConstructedCampaignFleet;observer:OriginalConstructedCampaignFleet;contact:OriginalFleetContactPresentation & {fleet:OriginalConstructedCampaignFleet};view:OriginalFleetView;random:OriginalJavaRandomState}
export type OriginalObserverFrameContext=Omit<OriginalFleetFrameContext,'playerFleet'>;
export interface OriginalObserverRenderContext extends OriginalObserverFrameContext {alpha:number;isNearViewport(position:[number,number],margin:number):boolean;course:null|{target:[number,number];zoom:number;phase:number;brightness:number}}
export interface OriginalObserverFleetLayers {scope:'native-observer-fleet-layers';fleet:OriginalFleetDrawFrame;contacts:OriginalFleetDrawFrame}
export function createOriginalFleetObserverPresentation(fleet:OriginalConstructedCampaignFleet,observer:OriginalConstructedCampaignFleet,seed:string|number|bigint):OriginalFleetObserverPresentation;
export function advanceOriginalFleetObserverContact(state:OriginalFleetObserverPresentation,seconds:number,context:OriginalObserverFrameContext,services?:OriginalFleetFrameServices):{effects:OriginalFleetContactEffect[]};
export function advanceOriginalFleetObserverView(state:OriginalFleetObserverPresentation,seconds:number,context:OriginalObserverFrameContext,services?:OriginalFleetFrameServices):boolean;
export function renderOriginalFleetObserverLayers(state:OriginalFleetObserverPresentation,context:OriginalObserverRenderContext,services?:OriginalFleetFrameServices):OriginalObserverFleetLayers;
export function validateOriginalFleetObserverPresentation(state:OriginalFleetObserverPresentation):OriginalFleetObserverPresentation;

export interface OriginalObserverRebindReferences {members:ReadonlyMap<string,import('./OriginalFleetData.mjs').OriginalNativeFleetMember>;variants:ReadonlyMap<string,import('./OriginalStorage.mjs').OriginalStorageVariant>}
export function createOriginalObserverRebindReferences(factory:import('./OriginalFleetMembers.mjs').OriginalFleetMemberFactory):OriginalObserverRebindReferences;
export function rebindOriginalFleetObserverPresentation(state:OriginalFleetObserverPresentation,fleet:OriginalConstructedCampaignFleet,observer:OriginalConstructedCampaignFleet,references:OriginalObserverRebindReferences):OriginalFleetObserverPresentation;
