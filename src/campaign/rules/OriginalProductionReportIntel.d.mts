import type {OriginalBaseIntel,OriginalBaseIntelFields} from './OriginalBaseIntel.mjs';
import type {OriginalProductionDelivery,OriginalProductionBatch} from './OriginalCustomProduction.mjs';
export interface OriginalProductionReportIntel<M extends {objectRef:string}={objectRef:string}> extends OriginalBaseIntelFields {
 classId:'production-report';duration:number|null;removeTrigger:null;keepExploredDebrisField:boolean|null;removeSurveyedPlanet:boolean|null;icon:string|null;iconId:string|null;sound:string|null;
 gatheringPoint:M;data:{scope:'native-production-data';batches:OriginalProductionBatch[]};totalCost:number;accrued:number;noProductionThisMonth:boolean;
}
export type OriginalSupportedIntel=OriginalBaseIntel|OriginalProductionReportIntel;
export function isOriginalProductionReportIntel(item:unknown):item is OriginalProductionReportIntel;
export function createOriginalProductionReportIntel<M extends {objectRef:string}>(objectRef:string,delivery:OriginalProductionDelivery<M>):OriginalProductionReportIntel<M>;
export function validateOriginalProductionReportIntel<M extends {objectRef:string}>(item:OriginalProductionReportIntel<M>):OriginalProductionReportIntel<M>;
export function validateOriginalSupportedIntel<T extends OriginalSupportedIntel>(item:T):T;
export function originalProductionReportShouldRemove(item:OriginalProductionReportIntel,elapsedDaysSince:(timestamp:string)=>number,currentTimestamp:string):boolean;
