/** Native sector/manager notification receivers. Not a full CampaignEngine.advance implementation. */
import { immutableJSON, requireThat, isRecord } from '../core/Values.mjs';
import { ORIGINAL_MARKET_FINANCE, nativeInt } from './OriginalMarketFinance.mjs';
import { originalCurrentMonthlyReport, originalMonthlyNode, ORIGINAL_MONTHLY_REPORT_IDS } from './OriginalMonthlyReport.mjs';
const f=Math.fround,check=(ok,message)=>requireThat(ok,'UNSUPPORTED_ECONOMY_NOTIFICATIONS',message);
const kinds=new Set(['core','native-empty-sector','not-economy-tick','local-resources','playthrough-log','academy-stipend']);
const statKinds=new Set(['level','fleet','credits','supplies','fuel','cargo','crew','marines','colonies']);
const call=(runtime,name,...args)=>{check(typeof runtime?.[name]==='function','Actual notification dependency required: '+name);const value=runtime[name](...args);check(!value||typeof value.then!=='function','Notification dependency must be synchronous: '+name);return value;};
const truth=(v,label)=>{check(typeof v==='boolean','Actual boolean required: '+label);return v;};
const int=(v,label)=>{check(Number.isInteger(v)&&v>=-2147483648&&v<=2147483647,'Actual Java int required: '+label);return v;};
const float=(v,label)=>{check(Number.isFinite(v)&&f(v)===v,'Actual Java float required: '+label);return v;};
const timestamp=v=>{check(Number.isSafeInteger(v),'Inexact native timestamp');return v;};
const long=v=>{check(typeof v==='string'&&/^-?(0|[1-9]\d*)$/.test(v),'Expected decimal Java long');const n=BigInt(v);check(BigInt.asIntN(64,n)===n,'Java long overflow');return n;};
const floatLong=value=>{if(value>=Number(9223372036854775807n))return 9223372036854775807n;if(value<=Number(-9223372036854775808n))return -9223372036854775808n;return BigInt(Math.trunc(value));};
function validate(state){
 immutableJSON(state);check(state.scope==='native-economy-notification-state'&&state.schemaVersion===1,'Unsupported notification state');
 check(Array.isArray(state.sectorRoster)&&state.sectorRoster.length<=65536&&isRecord(state.objects),'Actual receiver roster required');
 for(const [ref,o]of Object.entries(state.objects)){
  check(o.objectRef===ref&&kinds.has(o.kind)&&typeof o.classAlias==='string','Invalid receiver identity/class');
  if(o.kind==='academy-stipend')timestamp(o.startTime);
  if(o.kind==='playthrough-log'){
   check(Array.isArray(o.stats)&&o.stats.length<=256&&Array.isArray(o.data)&&o.data.length<=65536,'Invalid playthrough data');const ids=new Set();
   for(const s of o.stats){check(typeof s.objectRef==='string'&&s.id===s.kind&&statKinds.has(s.kind)&&!ids.has(s.id)&&Array.isArray(s.accrued)&&s.accrued.length<=65536,'Unknown/duplicate playthrough stat');ids.add(s.id);for(const v of s.accrued)long(v);}
   for(const snapshot of o.data){timestamp(snapshot.timestamp);check(Array.isArray(snapshot.data)&&snapshot.data.length<=256,'Invalid playthrough snapshot');const keys=new Set();for(const row of snapshot.data){check(Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&!keys.has(row[0]),'Invalid snapshot value');keys.add(row[0]);long(row[1]);}}
  }
 }
 for(const ref of state.sectorRoster)check(['core','native-empty-sector'].includes(state.objects[ref]?.kind),'Unimplemented sector receiver');
 const flag=state.academyFlag;check(flag&&flag.key==='$playerReceivingGAStipend'&&typeof flag.present==='boolean'&&(flag.present?typeof flag.value==='boolean':flag.value===null),'Actual academy memory entry required');
 return state;
}
function currentValue(kind,runtime){
 if(kind==='credits')return floatLong(float(call(runtime,'readCredits'),'credits'));
 if(kind==='colonies'){let sum=0;const markets=call(runtime,'readMarkets');check(Array.isArray(markets)&&markets.length<=65536,'Actual market roster required');for(const market of markets)if(truth(market.playerOwned,'market ownership'))sum=(sum+int(market.size,'market size'))|0;return BigInt(sum);}
 if(kind==='level')return BigInt(int(call(runtime,'readPlayerLevel'),'player level'));
 if(kind==='fleet'){const costs=call(runtime,'readFleetDeploymentPoints');check(Array.isArray(costs)&&costs.length<=65536,'Actual member deployment cost list required');let sum=0;for(const value of costs)sum=f(sum+float(value,'deployment points'));return BigInt(nativeInt(Math.floor(sum+0.5)));}
 const value=call(runtime,'readFleetCargoStat',kind);return BigInt(['crew','marines'].includes(kind)?int(value,kind):nativeInt(float(value,kind)));
}
function plog(o,event,runtime){
 if(truth(call(runtime,'isInNewGameAdvance'),'new-game advance')||!truth(call(runtime,'hasPlayerFleet'),'player fleet presence'))return;
 if(event==='tick'){for(const stat of o.stats){check(stat.accrued.length<65536,'Playthrough accrual budget');stat.accrued.push(currentValue(stat.kind,runtime).toString());}return;}
 check(o.data.length<65536,'Playthrough history budget');const snapshot={timestamp:timestamp(call(runtime,'timestamp')),data:[]},previous=new Map(o.data.at(-1)?.data??[]);
 for(const stat of o.stats){const prev=long(previous.get(stat.id)??'0');let best=0n,maxDiff=-2147483648n;
  for(const value of stat.accrued){const curr=long(value),delta=BigInt.asIntN(64,curr-prev),diff=delta<0n?BigInt.asIntN(64,-delta):delta;if(diff<=maxDiff)continue;maxDiff=diff;best=curr;}
  stat.accrued.length=0;snapshot.data.push([stat.id,best.toString()]);
 }
 o.data.push(snapshot);
}
export class OriginalEconomyNotifications {
 #state;
 constructor(capture){
  check(capture?.scope==='native-saved-economy-notifications'&&capture.schemaVersion===1&&capture.unresolved.length===0,'Complete native notification capture required');
  check(Array.isArray(capture.managedRoster)&&capture.managedRoster.every(ref=>capture.objects[ref]),'Complete managed classification required');
  this.#state=validate(structuredClone({scope:'native-economy-notification-state',schemaVersion:1,sectorRoster:capture.sectorRoster,objects:capture.objects,academyFlag:capture.academyFlag}));
 }
 #academy(o,iteration,runtime){
  const rules=ORIGINAL_MARKET_FINANCE.monthlyListenerRules;if(!rules.enableStipend||iteration!==Math.trunc(ORIGINAL_MARKET_FINANCE.settings.economyIterPerMonth)-1)return;
  const days=float(call(runtime,'elapsedDaysSince',o.startTime),'stipend age'),exists=truth(call(runtime,'marketExists','ancyra_market'),'Ancyra existence');
  if(days>f(rules.academy.durationDays)||!exists){
   call(runtime,'removeManagedListener',o.objectRef);Object.assign(this.#state.academyFlag,{present:false,value:null});return;
  }
  const accounts=call(runtime,'monthlyAccounts'),report=originalCurrentMonthlyReport(accounts),row=originalMonthlyNode(accounts,report.root,ORIGINAL_MONTHLY_REPORT_IDS.FLEET,'GA_stipend');
  row.income=f(rules.academy.stipend);row.name='来自 Galatia 学院的补助津贴';row.icon={category:'income_report',key:'generic_income'};row.tooltipCreator={kind:'reference',objectRef:o.objectRef,classAlias:'GalatianAcademyStipend'};
 }
 #dispatch(channel,event,iteration,runtime){
  if(event==='tick')int(iteration,'economy iteration');
  const roster=channel==='sector'?[...this.#state.sectorRoster]:call(runtime,'managedRoster');check(Array.isArray(roster),'Actual managed listener roster required');
  const receivers=[...roster].map(ref=>{const o=this.#state.objects[ref];check(o,'Unclassified live receiver: '+ref);return o;});const called=[];
  for(const o of receivers){
   if(channel==='sector'){
    check(o.kind==='core'||o.kind==='native-empty-sector','Wrong sector receiver type');
    if(o.kind==='core')call(runtime,event==='tick'?'coreEconomyTick':'coreEconomyMonthEnd');
    // These inherited empty methods are verified in the source, not defaults for unknown classes.
    called.push(o.objectRef);continue;
   }
   if(!['local-resources','playthrough-log','academy-stipend'].includes(o.kind))continue;
   if(o.kind==='local-resources')call(runtime,event==='tick'?'localResourcesEconomyTick':'localResourcesEconomyMonthEnd',o.objectRef,iteration);
   else if(o.kind==='playthrough-log')plog(o,event,runtime);
   else if(event==='tick')this.#academy(o,iteration,runtime); // Native academy monthEnd really is empty.
   called.push(o.objectRef);
  }
  return immutableJSON({scope:'native-economy-notification-dispatch',channel,event,receivers:called});
 }
 callbacks(runtime){return {
  reportSectorEconomyTick:i=>this.#dispatch('sector','tick',i,runtime),reportManagedEconomyTick:i=>this.#dispatch('managed','tick',i,runtime),
  reportSectorEconomyMonthEnd:()=>this.#dispatch('sector','month-end',null,runtime),reportManagedEconomyMonthEnd:()=>this.#dispatch('managed','month-end',null,runtime),
 };}
 snapshot(){return immutableJSON(this.#state);}
 checkpoint(){return immutableJSON({scope:'web-economy-notification-checkpoint',schemaVersion:1,state:this.#state});}
 static fromCheckpoint(checkpoint){check(checkpoint?.scope==='web-economy-notification-checkpoint'&&checkpoint.schemaVersion===1,'Unsupported notification checkpoint');const state=validate(structuredClone(checkpoint.state)),receiver=new OriginalEconomyNotifications({scope:'native-saved-economy-notifications',schemaVersion:1,unresolved:[],managedRoster:[],sectorRoster:state.sectorRoster,objects:state.objects,academyFlag:state.academyFlag});return receiver;}
}
