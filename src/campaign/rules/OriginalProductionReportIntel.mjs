/** ProductionReportIntel + the FleetLog lifetime it actually inherits (0.98a-RC8).
 * Retains real cargo/market identities; this is not an intel UI implementation. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalBaseIntel,validateOriginalBaseIntelFields,validateOriginalBaseIntel} from './OriginalBaseIntel.mjs';
import {validateOriginalResourceCargo} from './OriginalResourceCargo.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_PRODUCTION_REPORT',message);
const int=value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;
export const isOriginalProductionReportIntel=item=>item?.scope==='native-base-intel-plugin'&&item.classId==='production-report';
export function createOriginalProductionReportIntel(objectRef,delivery){
 return validateOriginalProductionReportIntel({...createOriginalBaseIntel(objectRef),classId:'production-report',duration:10,removeTrigger:null,keepExploredDebrisField:null,removeSurveyedPlanet:null,icon:null,iconId:null,sound:null,
  gatheringPoint:delivery.gatheringPoint,data:{scope:'native-production-data',batches:delivery.batches},totalCost:delivery.totalCost,accrued:delivery.accrued,noProductionThisMonth:delivery.noProductionThisMonth});
}
export function validateOriginalProductionReportIntel(item){
 check(isOriginalProductionReportIntel(item),'Actual ProductionReportIntel required');validateOriginalBaseIntelFields(item);
 check(item.duration===null||typeof item.duration==='number'&&Number.isFinite(item.duration)&&Math.fround(item.duration)===item.duration,'Actual nullable FleetLog duration required');
 check(item.removeTrigger===null,'Production report removeTrigger requires its actual world lifecycle service');
 for(const key of ['keepExploredDebrisField','removeSurveyedPlanet'])check(item[key]===null||typeof item[key]==='boolean','Actual nullable FleetLog flag required');
 for(const key of ['icon','iconId','sound'])check(item[key]===null||typeof item[key]==='string','Actual nullable FleetLog resource required');
 check(item.gatheringPoint&&typeof item.gatheringPoint.objectRef==='string','Actual production gathering-point market required');
 check(int(item.totalCost)&&int(item.accrued)&&typeof item.noProductionThisMonth==='boolean','Actual production report amounts/status required');
 check(item.data?.scope==='native-production-data'&&Array.isArray(item.data.batches),'Actual ordered ProductionData required');const titles=new Set(),identities=new Map();
 for(const batch of item.data.batches){
  check(batch&&(batch.title===null||typeof batch.title==='string')&&!titles.has(batch.title),'Unique nullable production batch titles required');titles.add(batch.title);
  const cargo=batch.cargo;validateOriginalResourceCargo(cargo);check(typeof cargo.objectRef==='string'&&cargo.objectRef.length>0,'Actual retained batch cargo identity required');
  check(!identities.has(cargo.objectRef)||identities.get(cargo.objectRef)===cargo,'Lost shared production cargo identity');identities.set(cargo.objectRef,cargo);
  check(Object.hasOwn(cargo,'mothballedShips')&&(cargo.mothballedShips===null||typeof cargo.mothballedShips.dataRef==='string'&&Array.isArray(cargo.mothballedShips.members)),'Actual nullable production FleetData required');
  for(const stack of cargo.slots)if(stack?.cargo!==undefined)check(stack.cargo===cargo,'Lost production stack cargo owner identity');
 }
 return item;
}
/** Dispatch only subclasses implemented here, not arbitrary missions with BaseIntel fields. */
export const validateOriginalSupportedIntel=item=>isOriginalProductionReportIntel(item)?validateOriginalProductionReportIntel(item):validateOriginalBaseIntel(item);
export function originalProductionReportShouldRemove(item,elapsedDaysSince,currentTimestamp){
 validateOriginalProductionReportIntel(item);if(item.important===true)return false;
 // BaseIntelPlugin falls back to the current clock (including its timestamp-zero sentinel).
 check(typeof elapsedDaysSince==='function','Actual campaign clock required');
 const days=elapsedDaysSince(item.timestamp??currentTimestamp);check(typeof days==='number'&&Number.isFinite(days),'Actual elapsed campaign days required');
 if(Math.fround(days)<30)return false;
 if(item.ended===true)return true;
 return item.duration!==null&&item.timestamp!==null&&Math.fround(days)>=item.duration;
}
