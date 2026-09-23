import type {OriginalVisibilityLevel} from '../rules/OriginalSensors.mjs';
import type {NativeDevelopmentPlayer} from '../../../server/campaign/native/DevelopmentWorld.mjs';
export interface NativeObservationRequest {worldId:string;epoch:string;observerDataRef:string}
/** This is current sensor information, not an animation frame or the native saved identity graph. */
export interface NativeFleetObservations {
 scope:'native-current-fleet-sensor-observations';worldId:string;epoch:string;revision:number;readyForAuthority:false;presentation:'not-an-animated-scene';
 observer:{dataRef:string;locationRef:string;position:[number,number]};
 contacts:{contactId:string;position:[number,number];visibility:Exclude<OriginalVisibilityLevel,'NONE'>;controlledDataRef:string|null;identity:{name:string;factionId:string}|null}[];
}
export interface NativeDevelopmentSession {runtime:'native-development';epoch:string;development:true;view:NativeDevelopmentPlayer;simulation:{status:'unavailable';error:{code:'NATIVE_WORLD_FRAME_UNAVAILABLE'}}}
export type NativeNavigationCommand={worldId:string;epoch:string;requestId:string;expectedRevision:number}&(
 {type:'native.fleet.navigate';payload:{dataRef:string;x:number;y:number}}|
 {type:'native.fleet.set-destination';payload:{dataRef:string;x:number;y:number}}|
 {type:'native.fleet.go-slow';payload:{dataRef:string;stop?:boolean}}
);

/** Sends native slot gestures, never client-owned cargo snapshots or item quantities. */
export interface NativeLootCargoCommand {worldId:string;epoch:string;requestId:string;expectedRevision:number;type:'native.loot.actions';payload:{dataRef:string;encounterId:string;actions:import('../rules/OriginalLootCargoTransaction.mjs').OriginalLootCargoAction[]}}

/** Authorized visible geometry only, never a saved world/member/cargo graph. */
export interface NativeSceneRequest extends NativeObservationRequest {viewId:string;width:number;height:number}
export interface NativeSceneFrame {
 scope:'native-observer-scene';worldId:string;epoch:string;revision:number;sceneId:string;sequence:number;observerDataRef:string;
 camera:{center:[number,number];width:number;height:number;zoom:number};
 layers:{pings:import('../rules/OriginalFleetDraw.mjs').OriginalFleetDrawFrame[];background:import('../rules/OriginalFleetDraw.mjs').OriginalFleetDrawFrame[];planets:import('../rules/OriginalFleetDraw.mjs').OriginalFleetDrawFrame[];above:import('../rules/OriginalFleetDraw.mjs').OriginalFleetDrawFrame[];terrain:import('../rules/OriginalFleetDraw.mjs').OriginalFleetDrawFrame[];fleets:import('../rules/OriginalFleetDraw.mjs').OriginalFleetDrawFrame[];contacts:import('../rules/OriginalFleetDraw.mjs').OriginalFleetDrawFrame[]};
 effects:({kind:'sensor-ping';id:string;position:[number,number];color:[number,number,number,number]}|{kind:'campaign-sound';id:string;position:[number,number];velocity:[number,number];pitch:number;volume:number})[];
 readyForAuthority:false;limitations:string[];
}

/** Press resolves the saved current slot again on the server; the client never sends effect state. */
export type NativeAbilityCommand={worldId:string;epoch:string;requestId:string;expectedRevision:number}&(
 {type:'native.ability.press';payload:{dataRef:string;slotIndex:number;abilityId:string}}|
 {type:'native.ability-bar.change';payload:{dataRef:string;action:import('../rules/OriginalCampaignAbilityBar.mjs').OriginalAbilityBarGesture}}
);

/** Only colony gestures; ownership, treasury, cost and queue identity remain server-side. */
export interface NativeColonyCommand {worldId:string;epoch:string;requestId:string;expectedRevision:number;type:'native.colony.construction';payload:{dataRef:string;marketId:string;action:NativeColonyGesture}}

export type NativeColonyGesture=
 | {kind:'inspect-build';marketId:string}
 | {kind:'build';marketId:string;industryId:string;expectedCost:number}
 | {kind:'cancel-construction';marketId:string;industryId:string}
 | {kind:'swap-construction';marketId:string;industryId:string;otherIndustryId:string};

/** Committed native-player effects only; observer sensor effects stay in NativeSceneFrame. */
export type NativeFrameEventsRequest=import('../../../server/campaign/native/FrameEffects.mjs').NativeFrameEventsRequest;
export type NativePlayerFrameEvents=import('../../../server/campaign/native/FrameEffects.mjs').NativePlayerFrameEvents;
