import type {DeepReadonly,JsonValue} from '../Types.js';
import type {OriginalMonthlyAccounts} from './OriginalMonthlyReport.mjs';
export type OriginalPlaythroughStatKind='level'|'fleet'|'credits'|'supplies'|'fuel'|'cargo'|'crew'|'marines'|'colonies';
export interface OriginalPlaythroughStat {objectRef:string;id:OriginalPlaythroughStatKind;kind:OriginalPlaythroughStatKind;accrued:string[]}
export interface OriginalPlaythroughSnapshot {timestamp:number;data:[string,string][]}
export interface OriginalEconomyNotificationObject {objectRef:string;classAlias:string;kind:'core'|'native-empty-sector'|'not-economy-tick'|'local-resources'|'playthrough-log'|'academy-stipend'|'unsupported';startTime?:number;stats?:OriginalPlaythroughStat[];data?:OriginalPlaythroughSnapshot[];retainedMetadata?:JsonValue}
export interface OriginalAcademyMemory {key:'$playerReceivingGAStipend';present:boolean;value:boolean|null}
export interface OriginalEconomyNotificationCapture {scope:'native-saved-economy-notifications';schemaVersion:1;sectorRoster:string[];managedRoster:string[]|null;objects:Record<string,OriginalEconomyNotificationObject>;academyFlag:OriginalAcademyMemory|null;unresolved:string[]}
export interface OriginalEconomyNotificationState {scope:'native-economy-notification-state';schemaVersion:1;sectorRoster:string[];objects:Record<string,OriginalEconomyNotificationObject>;academyFlag:OriginalAcademyMemory}
export interface OriginalEconomyNotificationCheckpoint {scope:'web-economy-notification-checkpoint';schemaVersion:1;state:OriginalEconomyNotificationState}
export interface OriginalEconomyNotificationRuntime {
 managedRoster():string[]|null;removeManagedListener(ref:string):void;
 coreEconomyTick():unknown;coreEconomyMonthEnd():unknown;localResourcesEconomyTick(ref:string,iteration:number):unknown;localResourcesEconomyMonthEnd(ref:string):unknown;
 isInNewGameAdvance():boolean;hasPlayerFleet():boolean;readPlayerLevel():number;readFleetDeploymentPoints():number[];readFleetCargoStat(kind:'supplies'|'fuel'|'cargo'|'crew'|'marines'):number;
 readCredits():number;readMarkets():{playerOwned:boolean;size:number}[];monthlyAccounts():OriginalMonthlyAccounts;marketExists(id:string):boolean;timestamp():number;elapsedDaysSince(timestamp:number):number;
}
export interface OriginalEconomyNotificationResult {scope:'native-economy-notification-dispatch';channel:'sector'|'managed';event:'tick'|'month-end';receivers:string[]}
export interface OriginalEconomyNotificationCallbacks {reportSectorEconomyTick(iteration:number):DeepReadonly<OriginalEconomyNotificationResult>;reportManagedEconomyTick(iteration:number):DeepReadonly<OriginalEconomyNotificationResult>;reportSectorEconomyMonthEnd():DeepReadonly<OriginalEconomyNotificationResult>;reportManagedEconomyMonthEnd():DeepReadonly<OriginalEconomyNotificationResult>}
export class OriginalEconomyNotifications {
 constructor(capture:DeepReadonly<OriginalEconomyNotificationCapture>);
 callbacks(runtime:OriginalEconomyNotificationRuntime):OriginalEconomyNotificationCallbacks;
 snapshot():DeepReadonly<OriginalEconomyNotificationState>;checkpoint():DeepReadonly<OriginalEconomyNotificationCheckpoint>;
 static fromCheckpoint(checkpoint:unknown):OriginalEconomyNotifications;
}
