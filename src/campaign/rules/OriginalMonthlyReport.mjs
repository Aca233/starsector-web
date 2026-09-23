/** MonthlyReport and CoreScript accounting only; not every sector/managed economy listener. */
import { immutableJSON, requireThat, integer, isRecord } from '../core/Values.mjs';
import { ORIGINAL_MARKET_FINANCE, nativeInt } from './OriginalMarketFinance.mjs';
import { ORIGINAL_MARKET_REFERENCE } from './OriginalMarketPricing.mjs';
import { validateOriginalResourceCargo, originalResourceQuantity, addOriginalResourceCargo } from './OriginalResourceCargo.mjs';
const f=Math.fround,S=ORIGINAL_MARKET_FINANCE.settings;
export const ORIGINAL_MONTHLY_REPORT_IDS=ORIGINAL_MARKET_FINANCE.monthlyReportIds;
const ID=ORIGINAL_MONTHLY_REPORT_IDS,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_MONTHLY_REPORT',message);
const float=(n,label)=>{check(Number.isFinite(n)&&n===f(n),'Expected native float '+label);return n;};
const int=(n,label)=>{check(Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Expected Java int '+label);return n;};
const text=(s,label)=>{check(typeof s==='string'&&s.length<=4096,'Invalid '+label);return s;};
const reference=(objectRef,classAlias)=>({kind:'reference',objectRef,classAlias});
const string=value=>({kind:'string',value});
const call=(runtime,name,...args)=>{check(typeof runtime?.[name]==='function','Missing actual monthly runtime '+name);const value=runtime[name](...args);check(!value||typeof value.then!=='function','Monthly runtime must be synchronous: '+name);return value;};
const truth=(v,label)=>{check(typeof v==='boolean','Expected actual '+label);return v;};
const add=(node,key,amount)=>{node[key]=float(f(node[key]+float(amount,key)),key);};
export function validateOriginalMonthlyAccounts(state){
 immutableJSON(state);check(state?.scope==='native-core-monthly-accounts'&&state.schemaVersion===1,'Unsupported monthly account state');
 integer(state.serial,'monthly object serial');check(isRecord(state.credits),'Actual shared player credits required');text(state.credits.objectRef,'credit object identity');float(state.credits.value,'credits');
 check(Array.isArray(state.messages),'Monthly message outbox required');
 const checked=new Set();
 for(const report of [state.current,state.previous]){
  if(report===null||checked.has(report))continue;checked.add(report);
  text(report.objectRef,'report identity');integer(report.timestamp,'report timestamp',-Number.MAX_SAFE_INTEGER);int(report.debt,'debt');int(report.previousDebt,'previous debt');
  const seen=new Set();let count=0;
  const visit=(node,depth)=>{
   check(isRecord(node)&&depth<=48&&!seen.has(node)&&++count<=20000,'Invalid report tree');seen.add(node);text(node.objectRef,'report node identity');
   for(const key of ['income','upkeep','totalIncome','totalUpkeep'])float(node[key],key);
   if(node.custom2?.kind==='resource-cargo'){check(node.custom2.objectRef===node.custom2.value?.objectRef,'Detached report cargo identity');validateOriginalResourceCargo(node.custom2.value);}
   if(node.custom2?.kind==='float')float(node.custom2.value,'report quantity');
   check(node.children===null||Array.isArray(node.children),'Invalid ordered report children');const keys=new Set();
   for(const row of node.children??[]){check(Array.isArray(row)&&row.length===2,'Invalid report child');text(row[0],'report child key');check(!keys.has(row[0]),'Duplicate report child');keys.add(row[0]);visit(row[1],depth+1);}
  };visit(report.root,0);
 }
 return state;
}
const allocate=(state,type)=>'monthly-runtime:'+type+':'+(++state.serial);
function newNode(state){return {objectRef:allocate(state,'node'),name:null,icon:null,income:0,upkeep:0,totalIncome:0,totalUpkeep:0,custom:null,custom2:null,mapEntity:null,tooltipCreator:null,tooltipParam:null,children:null};}
export function newOriginalMonthlyReport(state){return {objectRef:allocate(state,'report'),root:newNode(state),timestamp:0,debt:0,previousDebt:0,monthlyReportTooltip:null};}
export function originalCurrentMonthlyReport(state){return state.current??=newOriginalMonthlyReport(state);}
export function originalPreviousMonthlyReport(state){return state.previous??=newOriginalMonthlyReport(state);}
/** Preserve insertion order and node identity; an empty child map is not created until needed. */
export function originalMonthlyNode(state,from,...path){
 let node=from;
 for(const key of path){text(key,'report path');let child=node.children?.find(row=>row[0]===key)?.[1];
  if(!child){child=newNode(state);(node.children??=[]).push([key,child]);}node=child;
 }
 return node;
}
export function computeOriginalMonthlyTotals(report){
 const visit=node=>{node.totalIncome=node.income;node.totalUpkeep=node.upkeep;
  for(const [,child]of node.children??[]){visit(child);node.totalIncome=float(f(node.totalIncome+child.totalIncome),'total income');node.totalUpkeep=float(f(node.totalUpkeep+child.totalUpkeep),'total upkeep');}
 };visit(report.root);return {income:report.root.totalIncome,upkeep:report.root.totalUpkeep};
}
function tooltip(state,report){return report.monthlyReportTooltip??=reference(allocate(state,'tooltip'),'MonthlyReportNodeTooltipCreator');}
function label(state,report,node,name,custom,withTooltip=true){node.name=name;node.custom=custom;if(withTooltip)node.tooltipCreator=tooltip(state,report);return node;}
export function originalOfficerSalary(level,mercenary){int(level,'officer level');truth(mercenary,'mercenary flag');return f(f((S.officerSalaryBase+Math.imul(level,S.officerSalaryPerLevel))|0)*f(mercenary?S.officerMercPayMult:1));}
export function originalAdministratorSalary(tier){int(tier,'administrator tier');const key='adminSalaryTier'+tier;check(Object.hasOwn(S,key),'Unknown actual administrator salary tier');return f(S[key]);}
/** Reads current fleet/personnel/storage getters at callback time, never a saved cached bill total. */
export function originalCoreEconomyTick(state,runtime){
 validateOriginalMonthlyAccounts(state);
 if(truth(call(runtime,'isTutorialInProgress'),'tutorial state'))return immutableJSON({scope:'core-script-economic-tick-only',skippedForTutorial:true});
 const factor=f(1/f(S.economyIterPerMonth)),fleet=call(runtime,'readFleetPayroll'),report=originalCurrentMonthlyReport(state),node=(from,...path)=>originalMonthlyNode(state,from,...path);
 int(fleet.crew,'crew count');int(fleet.marines,'marine count');check(Array.isArray(fleet.officers),'Actual officer roster required');
 const fleetNode=label(state,report,node(report.root,ID.FLEET),'舰队',string(ID.FLEET));
 const crew=node(fleetNode,ID.CREW);add(crew,'upkeep',f(f(Math.imul(fleet.crew,S.crewSalary))*factor));label(state,report,crew,'船员工资',string(ID.CREW));
 const marineCost=Math.imul(fleet.marines,S.marineSalary);
 if(S.marineSalary>0){const marines=node(fleetNode,ID.MARINES);add(marines,'upkeep',f(f(marineCost)*factor));label(state,report,marines,'陆战队员工资',string(ID.MARINES));}
 const officers=label(state,report,node(fleetNode,ID.OFFICERS),'军官工资',string(ID.OFFICERS));
 for(const officer of fleet.officers){const row=node(officers,officer.id);row.name=text(officer.name,'officer name');add(row,'upkeep',f(originalOfficerSalary(officer.level,officer.mercenary)*factor));row.custom=reference(officer.objectRef,'OfficerData');}
 const colonies=label(state,report,node(report.root,ID.OUTPOSTS),'殖民地',string(ID.OUTPOSTS));let storageNode=null;
 const markets=call(runtime,'marketIds');check(Array.isArray(markets)&&markets.length<=4096,'Actual monthly market roster required');
 for(const id of markets){
  const m=call(runtime,'market',id);truth(m.playerOwned,'market ownership');
  if(!m.playerOwned&&truth(call(runtime,'hasStorageAccess',id),'storage access')){
   const values=call(runtime,'readStorageValues',id),cargo=f(nativeInt(f(float(values.cargo,'stored cargo value')*f(S.storageFreeFraction)))),ships=f(nativeInt(f(float(values.ships,'stored ship value')*f(S.storageFreeFraction))));
   if(!(cargo>0)&&!(ships>0))continue;
   storageNode??=label(state,report,node(report.root,ID.STORAGE),'仓库',string(ID.STORAGE));
   const row=node(storageNode,id);row.name=m.name+' ('+(cargo>0&&ships>0?'泊位与仓管费':cargo>0?'仓管费':'泊位费')+')';row.custom=reference(m.objectRef,'Market');row.custom2=string(ID.STORAGE);add(row,'upkeep',f(f(cargo+ships)*factor));continue;
  }
  if(!m.playerOwned)continue;
  const marketNode=node(colonies,id);marketNode.name=m.name+' ('+m.size+')';marketNode.custom=reference(m.objectRef,'Market');
  const industries=label(state,report,node(marketNode,'industries'),'工业设施 & 其他设施',string(ID.INDUSTRIES));industries.mapEntity=m.primaryEntity;
  for(const industry of call(runtime,'readIndustryFinances',id)){
   const row=node(industries,industry.id);row.name=industry.name;add(row,'income',f(f(int(industry.income,'industry income'))*factor));add(row,'upkeep',f(f(int(industry.upkeep,'industry upkeep'))*factor));row.custom=reference(industry.objectRef,'Industry');row.mapEntity=m.primaryEntity;
  }
  const exports=label(state,report,node(marketNode,'exports'),'出口',string(ID.EXPORTS));exports.mapEntity=m.primaryEntity;
  for(const c of call(runtime,'commodities',id)){const row=node(exports,c.id);row.name=c.name;add(row,'income',f(f(int(call(runtime,'getExportIncome',id,c.id),'export income'))*factor));row.custom=reference(c.objectRef,'CommodityOnMarket');row.mapEntity=m.primaryEntity;}
 }
 const admins=label(state,report,node(colonies,ID.ADMIN),'管理员',string(ID.ADMIN));
 for(const admin of call(runtime,'readAdministrators')){
  let salary=originalAdministratorSalary(admin.tier);if(salary<=0)continue;
  const row=node(admins,admin.id);row.name=admin.name;
  if(admin.marketName!==null)row.name+=' ('+admin.marketName+')';else{row.name+=' (未上任) ';salary=f(salary*f(S.idleAdminSalaryMult));}
  add(row,'upkeep',f(salary*factor));row.custom=reference(admin.objectRef,'AdminData');
 }
 return immutableJSON({scope:'core-script-economic-tick-only',skippedForTutorial:false});
}
/** Caller owns the transaction. Production MUST complete before rollover/credits; failures require rollback. */
export function originalCoreEconomyMonthEnd(state,runtime){
 validateOriginalMonthlyAccounts(state);
 if(truth(call(runtime,'isTutorialInProgress'),'tutorial state'))return immutableJSON({scope:'core-script-month-end-only',skippedForTutorial:true});
 const report=originalCurrentMonthlyReport(state),colonies=originalMonthlyNode(state,report.root,ID.OUTPOSTS);
 if(colonies.custom!==null)for(const id of call(runtime,'marketIds')){
  const m=call(runtime,'market',id);if(!m.playerOwned)continue;const credits=float(call(runtime,'getIncentiveCredits',id),'incentive credits');if(!(credits>0))continue;
  const marketNode=originalMonthlyNode(state,colonies,id);
  if(marketNode.custom!==null){const row=originalMonthlyNode(state,marketNode,'incentives');label(state,report,row,'危险津贴',string(ID.INCENTIVES));row.mapEntity=m.primaryEntity;add(row,'upkeep',credits);}
  call(runtime,'setIncentiveCredits',id,0);
 }
 const previous=originalPreviousMonthlyReport(state),debt=f(previous.debt);
 if(debt>0){const row=originalMonthlyNode(state,originalCurrentMonthlyReport(state).root,ID.LAST_MONTH_DEBT);
  if(row.name===null){label(state,report,row,'上个月的债务',string(ID.LAST_MONTH_DEBT));row.icon={kind:'sprite-key',category:'income_report',key:'generic_expense'};}row.upkeep=debt;
 }
 call(runtime,'doCustomProduction',state);
 // Match SharedData.rollOverReport, including object identity and a genuinely empty new report.
 state.previous=state.current;state.current=newOriginalMonthlyReport(state);
 const settled=state.previous;settled.previousDebt=previous.debt;settled.timestamp=call(runtime,'timestamp');integer(settled.timestamp,'settlement timestamp',-Number.MAX_SAFE_INTEGER);
 computeOriginalMonthlyTotals(settled);
 const total=nativeInt(f(settled.root.totalIncome-settled.root.totalUpkeep)),credits=f(nativeInt(float(state.credits.value,'current player credits')));
 let newCredits=f(credits+f(total));if(newCredits<0){settled.debt=nativeInt(f(Math.abs(newCredits)));newCredits=0;}state.credits.value=float(newCredits,'settled credits');
 const message={type:'monthly-income-report',reportRef:settled.objectRef,total,timestamp:settled.timestamp,icon:{category:'intel',key:'monthly_income_report'},sound:total>=0?'ui_intel_monthly_income_positive':'ui_intel_monthly_income_negative',clickAction:'INCOME_TAB',tab:'income_report'};state.messages.push(message);
 return immutableJSON({scope:'core-script-month-end-only',skippedForTutorial:false,total,creditsBefore:credits,creditsAfter:newCredits,debt:settled.debt,message});
}

/** LocalResourcesSubmarketPlugin's per-stack billing. All colonies share OUTPOSTS/RESTOCKING. */
export function originalMonthlyRestockingCharge(state,commodity,quantity){
 float(quantity,'restocking quantity');check(quantity>=0,'Negative restocking quantity');
 const spec=ORIGINAL_MARKET_REFERENCE.commodities[commodity.id];check(spec&&!spec.plugin,'Actual supported commodity required');text(commodity.objectRef,'commodity identity');
 const report=originalCurrentMonthlyReport(state),colonies=originalMonthlyNode(state,report.root,ID.OUTPOSTS);
 if(colonies.name===null)label(state,report,colonies,'殖民地',string(ID.OUTPOSTS));
 const bill=originalMonthlyNode(state,colonies,ID.RESTOCKING);
 if(bill.name===null){
  label(state,report,bill,'账单',string(ID.RESTOCKING));const objectRef=allocate(state,'cargo');
  bill.custom2={kind:'resource-cargo',objectRef,value:{objectRef,unlimitedStacks:true,partials:null,slots:[],spaceUsed:0,extraCargoUsed:0,mothballedShipsRef:allocate(state,'empty-player-tooltip-fleet')}};
 }
 const cargo=bill.custom2;check(cargo?.kind==='resource-cargo'&&cargo.objectRef===cargo.value?.objectRef,'Actual saved restocking tooltip cargo required');
 validateOriginalResourceCargo(cargo.value);check(!cargo.value.unresolved?.length,'Restocking tooltip cargo has unresolved dependencies');
 let amount=quantity;if(f(originalResourceQuantity(cargo.value,commodity.id)+amount)<1)amount=1;
 addOriginalResourceCargo(cargo.value,commodity.id,amount,()=>{
  let used=0;for(const stack of cargo.value.slots){if(!stack)continue;check(stack.type==='RESOURCES'||stack.type==='NULL','Unsupported tooltip cargo item');if(stack.type==='RESOURCES')used=f(used+f(stack.cargoSpacePerUnit*stack.size));}
  cargo.value.spaceUsed=f(used+(cargo.value.extraCargoUsed??0));
 });
 const row=originalMonthlyNode(state,bill,commodity.id),price=Math.max(1,nativeInt(Math.floor(f(f(spec.basePrice)*f(S.stockpileCostMult))+0.5)));
 add(row,'upkeep',f(f(price)*amount));row.icon=spec.icon;row.custom=reference(commodity.objectRef,'CommodityOnMarket');
 if(row.custom2===null)row.custom2={kind:'float',value:0};
 check(row.custom2.kind==='float','Actual saved accumulated restocking quantity required');row.custom2.value=float(f(float(row.custom2.value,'restocking quantity')+amount),'restocking quantity');
 const display=f(Math.ceil(Math.max(1,row.custom2.value)));
 row.name=spec.name+' ×'+display.toLocaleString('en-US',{maximumFractionDigits:0,useGrouping:true});row.tooltipCreator=tooltip(state,report);
 return {quantity:amount,unitPrice:price,cost:f(f(price)*amount)};
}

/** CoreScript custom-production bill, before SharedData rolls over or adjusts credits.
 * Cargo remains owned by the real ProductionReportIntel; this ledger stores its native reference.
 */
export function chargeOriginalCustomProduction(state,cargo,totalCost,weaponCost){
 int(totalCost,'production cost');int(weaponCost,'production fitting cost');check(totalCost>0,'Production charge requires positive totalCost');text(cargo?.objectRef,'production cargo identity');
 const report=originalCurrentMonthlyReport(state),colonies=originalMonthlyNode(state,report.root,ID.OUTPOSTS);
 if(colonies.name===null)label(state,report,colonies,'Colonies',string(ID.OUTPOSTS));
 const production=originalMonthlyNode(state,colonies,ID.PRODUCTION);label(state,report,production,'Custom production orders',string(ID.PRODUCTION));production.custom2=reference(cargo.objectRef,'CargoData');add(production,'upkeep',f(totalCost));
 if(weaponCost>0){const weapons=originalMonthlyNode(state,colonies,ID.PRODUCTION_WEAPONS);label(state,report,weapons,'Weapons & fighter LPCs for produced ships',string(ID.PRODUCTION_WEAPONS));add(weapons,'upkeep',f(weaponCost));}
 return production;
}
