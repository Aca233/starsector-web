import type {OriginalNativeFleet} from './OriginalFleetData.mjs';
import type {OriginalPayrollPerson} from './OriginalPlayerEconomy.mjs';
export function originalFleetCommanderRef(fleet:{commanderRef:string|null;defaultCommanderRef?:string|null}):string|null;
export interface OriginalFleetCommanderServices { refreshCharacterStatsEffects(person:OriginalPayrollPerson,refreshOutposts:false):unknown }
export function setOriginalFleetCommander(fleet:OriginalNativeFleet,person:OriginalPayrollPerson|null,services:OriginalFleetCommanderServices):OriginalPayrollPerson|null;
export function initializeOriginalCampaignFleetCommander(fleet:OriginalNativeFleet,services:OriginalFleetCommanderServices & {createRandomPerson():OriginalPayrollPerson}):OriginalPayrollPerson;
