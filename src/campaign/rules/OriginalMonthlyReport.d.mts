import type {DeepReadonly,JsonValue} from '../Types.js';
export interface OriginalMonthlyNode {objectRef:string;name:string|null;icon:JsonValue;income:number;upkeep:number;totalIncome:number;totalUpkeep:number;custom:JsonValue;custom2:JsonValue;mapEntity:JsonValue;tooltipCreator:JsonValue;tooltipParam:JsonValue;children:[string,OriginalMonthlyNode][]|null;retainedMetadata?:Record<string,JsonValue>}
export interface OriginalMonthlyReport {objectRef:string;root:OriginalMonthlyNode;timestamp:number;debt:number;previousDebt:number;monthlyReportTooltip:JsonValue}
export interface OriginalMonthlyMessage {type:'monthly-income-report';reportRef:string;total:number;timestamp:number;icon:{category:string;key:string};sound:string;clickAction:'INCOME_TAB';tab:'income_report'}
export interface OriginalMonthlyAccounts {scope:'native-core-monthly-accounts';schemaVersion:1;serial:number;current:OriginalMonthlyReport|null;previous:OriginalMonthlyReport|null;credits:{objectRef:string;value:number};messages:OriginalMonthlyMessage[]}
export interface OriginalFleetPayroll {crew:number;marines:number;officers:{id:string;objectRef:string;name:string;level:number;mercenary:boolean}[]}
export interface OriginalAdministratorPayroll {id:string;objectRef:string;name:string;tier:number;marketName:string|null}
export interface OriginalCoreEconomyRuntime {
 isTutorialInProgress():boolean;readFleetPayroll():OriginalFleetPayroll;marketIds():string[];
 market(id:string):{objectRef:string;name:string;size:number;playerOwned:boolean;primaryEntity:JsonValue};
 hasStorageAccess(id:string):boolean;readStorageValues(id:string):{cargo:number;ships:number};
 readIndustryFinances(id:string):{id:string;objectRef:string;name:string;income:number;upkeep:number}[];
 commodities(id:string):{id:string;objectRef:string;name:string}[];getExportIncome(id:string,commodity:string):number;
 readAdministrators():OriginalAdministratorPayroll[];getIncentiveCredits(id:string):number;setIncentiveCredits(id:string,value:number):void;
 doCustomProduction(state:OriginalMonthlyAccounts):void;timestamp():number;
}
export const ORIGINAL_MONTHLY_REPORT_IDS:Readonly<Record<string,string>>;
export function validateOriginalMonthlyAccounts(state:OriginalMonthlyAccounts):OriginalMonthlyAccounts;
export function newOriginalMonthlyReport(state:OriginalMonthlyAccounts):OriginalMonthlyReport;
export function originalCurrentMonthlyReport(state:OriginalMonthlyAccounts):OriginalMonthlyReport;
export function originalPreviousMonthlyReport(state:OriginalMonthlyAccounts):OriginalMonthlyReport;
export function originalMonthlyNode(state:OriginalMonthlyAccounts,from:OriginalMonthlyNode,...path:string[]):OriginalMonthlyNode;
export function computeOriginalMonthlyTotals(report:OriginalMonthlyReport):{income:number;upkeep:number};
export function originalOfficerSalary(level:number,mercenary:boolean):number;
export function originalAdministratorSalary(tier:number):number;
export function originalCoreEconomyTick(state:OriginalMonthlyAccounts,runtime:Pick<OriginalCoreEconomyRuntime,'isTutorialInProgress'|'readFleetPayroll'|'marketIds'|'market'|'hasStorageAccess'|'readStorageValues'|'readIndustryFinances'|'commodities'|'getExportIncome'|'readAdministrators'>):DeepReadonly<{scope:'core-script-economic-tick-only';skippedForTutorial:boolean}>;
export function originalCoreEconomyMonthEnd(state:OriginalMonthlyAccounts,runtime:Pick<OriginalCoreEconomyRuntime,'isTutorialInProgress'|'marketIds'|'market'|'getIncentiveCredits'|'setIncentiveCredits'|'doCustomProduction'|'timestamp'>):DeepReadonly<{scope:'core-script-month-end-only';skippedForTutorial:boolean;total?:number;creditsBefore?:number;creditsAfter?:number;debt?:number;message?:OriginalMonthlyMessage}>;

export function originalMonthlyRestockingCharge(state:OriginalMonthlyAccounts,commodity:{id:string;objectRef:string},quantity:number):{quantity:number;unitPrice:number;cost:number};

export function chargeOriginalCustomProduction(state:OriginalMonthlyAccounts,cargo:{objectRef:string},totalCost:number,weaponCost:number):OriginalMonthlyNode;
