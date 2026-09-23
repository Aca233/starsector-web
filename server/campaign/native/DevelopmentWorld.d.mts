import type {OriginalAbilitySlots,NativeAbilityBar} from '../../../src/campaign/rules/OriginalCampaignAbilityBar.mjs';
import type {NativeCampaignRuntime} from './NativeCampaignRuntime.mjs';
import type {OfflineCheckpoint} from './CheckpointCodec.mjs';
import type {DeepReadonly,Principal} from '../../../src/campaign/Types.js';
export interface NativeDevelopmentController {playerId:string;fleetDataRefs:string[]}
export interface NativeColonyController {marketId:string;playerId:string;financeDataRef:string}
export interface NativeDevelopmentCreation {id:string;controllers:NativeDevelopmentController[];checkpoint:DeepReadonly<OfflineCheckpoint>;colonyControllers?:NativeColonyController[]|null}
export interface NativeDevelopmentEnvelope extends NativeDevelopmentCreation {scope:'native-campaign-development-world';schemaVersion:3;revision:number;colonyControllers:NativeColonyController[]|null;abilityBars:NativeControlledAbilityBar[]|null}
export interface NativeControlledAbilityBar {playerId:string;dataRef:string;slots:OriginalAbilitySlots}
export interface NativeDevelopmentState {id:string;revision:number;controllers:DeepReadonly<NativeDevelopmentController[]>;runtime:NativeCampaignRuntime;colonyControllers:DeepReadonly<NativeColonyController[]>|null;abilityBars:NativeControlledAbilityBar[]|null}
export interface NativeDevelopmentSummary {scope:'native-campaign-development-world';worldId:string;revision:number;readyForAuthority:false;status:'development-incomplete';capabilities:readonly string[];fleetCount:number}
export interface NativeDevelopmentCommand {worldId:string;epoch:string;requestId:string;type:string;payload:Record<string,unknown>;expectedRevision:number}
export interface NativeDevelopmentPlayer extends NativeDevelopmentSummary {playerId:string;disclosure:'controlled-fleet-state-and-open-loot';colonyManagement:import('./ColonyManagement.mjs').NativeColonyManagementView|null;colonyControls:{marketId:string;dataRef:string}[]|null;lootWindows:{encounterId:string;dataRef:string;cargo:import('../../../src/campaign/rules/OriginalLootCargoTransaction.mjs').NativeLootCargoView}[];fleets:{dataRef:string;name:string;logisticsHud:import('../../../src/campaign/rules/OriginalNativeLogisticsHud.mjs').NativeLogisticsHudView;abilityBar:NativeAbilityBar|null;position:[number,number];locationRef:string|null;expired:boolean;navigation:{destination:[number,number]|null;override:boolean;goSlow:boolean|null;stop:boolean|null;targetContactId:string|null}}[]}
export const NATIVE_DEVELOPMENT_SCOPE:'native-campaign-development-world';
export function isNativeDevelopmentWorld(value:unknown):boolean;
export function restoreNativeDevelopmentWorld(value:unknown):NativeDevelopmentState;
export function createNativeDevelopmentWorld(input:unknown):{state:NativeDevelopmentState;envelope:NativeDevelopmentEnvelope};
export function nativeDevelopmentEnvelope(state:NativeDevelopmentState):NativeDevelopmentEnvelope;
export function nativeDevelopmentSummary(state:NativeDevelopmentState):DeepReadonly<NativeDevelopmentSummary>;
export function authorizeNativeDevelopmentPrincipal(state:NativeDevelopmentState,principal:unknown):Principal;
export function validateNativeDevelopmentCommand(input:unknown):DeepReadonly<NativeDevelopmentCommand>;
export function projectNativeDevelopmentPlayer(state:NativeDevelopmentState,playerId:string):DeepReadonly<NativeDevelopmentPlayer>;
export function applyNativeDevelopmentCommand(state:NativeDevelopmentState,principal:Principal,command:unknown):{result:unknown;events:{type:string;data:{dataRef:string}}[]};

export function projectNativeDevelopmentObservations(state:NativeDevelopmentState,playerId:string,observerDataRef:string):DeepReadonly<Omit<import('../../../src/campaign/client/NativeProtocol.js').NativeFleetObservations,'epoch'>>;

export function advanceNativeDevelopmentNavigation(state:NativeDevelopmentState,context:{paused:boolean}):{scope:'native-controlled-target-navigation-only';fleets:{playerId:string;dataRef:string;updated:boolean}[];readyForAuthority:false};

/** Internal owning-thread request. Not accepted by the HTTP/native command allowlist. */
export interface NativeDevelopmentFrameInput {worldId:string;epoch:string;requestId:string;expectedRevision:number;fromFrame:string;seconds:number;paused:boolean;fastAdvance:boolean;isFastForwardIteration:boolean;skipMarketAdvance:boolean}
export type NativeDevelopmentFrameContext=import('../../../src/campaign/rules/OriginalCampaignEngine.mjs').OriginalCampaignEngineContext;
/** Bind to this transaction's actual graph, never a captured runtime from before rollback. No external I/O. */
export type NativeDevelopmentFrameFactory=(runtime:NativeCampaignRuntime,context:NativeDevelopmentFrameContext)=>NonNullable<Parameters<NativeCampaignRuntime['advanceNativeEngineFrame']>[2]>;
export interface NativeDevelopmentFrameResult {scope:'native-authority-frame-transaction';fromFrame:string;frame:string;fromTimestamp:string;timestamp:string;navigation:ReturnType<typeof advanceNativeDevelopmentNavigation>;effects:DeepReadonly<import('./FrameEffects.mjs').NativeCommittedFrameEffect[]>;readyForAuthority:false}
export function validateNativeDevelopmentFrame(input:unknown):DeepReadonly<NativeDevelopmentFrameInput>;
export function requireNativeDevelopmentFrame(state:NativeDevelopmentState,frame:NativeDevelopmentFrameInput):NonNullable<ReturnType<NativeCampaignRuntime['nativeEngineFrameState']>>;
export function advanceNativeDevelopmentFrame(state:NativeDevelopmentState,frame:NativeDevelopmentFrameInput,prepare:NativeDevelopmentFrameFactory):{result:NativeDevelopmentFrameResult;events:{type:'native.world.frame';data:{fromFrame:string;frame:string;effects:DeepReadonly<import('./FrameEffects.mjs').NativeCommittedFrameEffect[]>}}[]};
