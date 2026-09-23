import type {OriginalNativeFleet,OriginalNativeFleetMember} from './OriginalFleetData.mjs';
import type {OriginalNativeRepairServices} from './OriginalNativeRepair.mjs';
export type OriginalNativeMaintenanceMode='all'|'without-recovery'|'fully-recovered'|'recovering'|'mothballed';
export interface OriginalNativeLogisticsQuote {marines:number;crew:number;maintenance:number;excessCargo:number;excessFuel:number;excessPersonnel:number;excessShips:number;suppliesPerDay:number}
export interface OriginalNativeLogisticsResult {hasSupplies:boolean;supplyCost:number;fuelCost:number}
export function originalNativeDeploymentSupplyCost(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet):number;
export function originalNativeRecoverySuppliesPerDay(member:OriginalNativeFleetMember,fleet:OriginalNativeFleet,services?:OriginalNativeRepairServices):number;
export function originalNativeMaintenanceSuppliesPerDay(fleet:OriginalNativeFleet,mode?:OriginalNativeMaintenanceMode,services?:OriginalNativeRepairServices):number;
export function quoteOriginalNativeLogistics(fleet:OriginalNativeFleet,services?:OriginalNativeRepairServices):OriginalNativeLogisticsQuote;
export function originalNativeBaseFuelPerLightYear(fleet:OriginalNativeFleet):number;
export function advanceOriginalNativeFleetLogistics(fleet:OriginalNativeFleet,days:number,services?:OriginalNativeRepairServices):OriginalNativeLogisticsResult;
