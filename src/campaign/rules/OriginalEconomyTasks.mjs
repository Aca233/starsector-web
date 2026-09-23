import raw from '../data/reference-economy-tasks.json' with { type: 'json' };
import { identifier, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool } from './OriginalIndustryState.mjs';
export const ORIGINAL_ECONOMY_TASKS = immutableJSON(raw);
const nativeTaskPhases={MainWorkTask2:0,UpdateMarketsAgainTask:1,ImmigrationTask:2,FinishEconomyUpdateTask:3};
const phaseOrder=['main','reapply-again','immigration','finish','done'];
const restoreToken = Symbol('economy-task-restore');
const check = (v,m) => requireThat(v,'UNSUPPORTED_ECONOMY_TASK',m);
const methods = ['listReachMarkets','listEconomyMarkets','getCommoditySpecs','getMarketEconGroup','refreshCharacterEffects','refreshGovernedOutpostEffects','reapplyConditions','reapplyIndustries','computeCommodityData','updateStockpileAndPrice','advanceImmigration','listUpdateListeners','isEconomyListenerExpired','removeUpdateListener','commodityUpdated','economyUpdated'];
function ids(value, label, unique = true) {
  check(Array.isArray(value) && value.length <= 4096, 'Expected complete bounded '+label); const seen = new Set();
  for (const id of value) { identifier(id); check(!unique || !seen.has(id),'Duplicate '+label+' identity'); seen.add(id); }
  return [...value];
}
export function originalEconomyCommodityOrder(specs) {
  check(Array.isArray(specs) && specs.length <= 4096,'Expected actual loaded commodity specs'); const seen = new Set();
  for (const s of specs) {
    economyShape(s,['id','economyTier','tags'],'economy commodity spec'); identifier(s.id); check(!seen.has(s.id),'Duplicate commodity spec'); seen.add(s.id);
    check(Number.isFinite(s.economyTier) && s.economyTier===Math.fround(s.economyTier),'Expected native float economy tier');
    check(Array.isArray(s.tags) && s.tags.length <= 128 && s.tags.every(t=>typeof t==='string'),'Expected explicit commodity tags');
  }
  return immutableJSON(specs.filter(s=>!s.tags.includes('nonecon')).sort((a,b)=>Math.sign(Math.fround(a.economyTier-b.economyTier))).map(s=>s.id));
}
/**
 * Source task sequencing, not a world-state freshness certificate. Runtime methods operate on one
 * transaction-owned draft and retain captured market/listener identities even after live removal.
 * All methods are synchronous. Missing implementations and asynchronous placeholders are errors.
 */
export class OriginalEconomyTaskRunner {
  #runtime; #mode; #params; #main; #again; #immigration; #specs=null; #marketIndex=0; #commodityIndex=0; #againIndex=0; #immigrationIndex=0; #phase='main'; #batches=0; #running=false; #failed=false; #framing=false;
  constructor(runtime, options) {
    for (const name of methods) check(typeof runtime?.[name]==='function','Missing economy runtime operation '+name);
    this.#runtime=runtime;
    if(options===restoreToken)return;
    check(options?.mode==='forced' || options?.mode==='scheduled','Expected forced or scheduled native entry point'); this.#mode=options.mode;
    if(options.mode==='forced') {
      economyShape(options,['mode','params'],'forced economy update'); economyShape(options.params,['withIncomeAndUpkeep','withStockpileUpdate','forceNonUIStep','withImmigration'],'native economy parameters');
      for(const [key,v]of Object.entries(options.params))bool(v,key);this.#params={...options.params};
      for(const market of ids(this.#call('listReachMarkets'),'reach market roster')) {this.#call('refreshCharacterEffects',market);this.#call('refreshGovernedOutpostEffects',market);}
      this.#main=ids(this.#call('listReachMarkets'),'main task market roster'); this.#again=null;this.#immigration=null;
    } else {
      economyShape(options,['mode','lastIteration'],'scheduled economy update');bool(options.lastIteration,'last monthly iteration');
      this.#params={withIncomeAndUpkeep:true,withStockpileUpdate:options.lastIteration,forceNonUIStep:true,withImmigration:true};
      this.#main=ids(this.#call('listReachMarkets'),'main task market roster');this.#again=ids(this.#call('listEconomyMarkets'),'second task market roster');this.#immigration=ids(this.#call('listReachMarkets'),'immigration task market roster');
    }
  }
  /** A batch-boundary checkpoint. Unlike status(), this owns the fixed task rosters and parameters. */
  checkpoint() {
    check(!this.#failed && !this.#running && !this.#framing,'Cannot checkpoint a failed or running economy batch');
    return immutableJSON({scope:'web-economy-task-checkpoint',schemaVersion:1,mode:this.#mode,params:this.#params,
      main:this.#main,again:this.#again,immigration:this.#immigration,specs:this.#specs,
      marketIndex:this.#marketIndex,commodityIndex:this.#commodityIndex,againIndex:this.#againIndex,
      immigrationIndex:this.#immigrationIndex,phase:this.#phase,batches:this.#batches});
  }
  static fromCheckpoint(runtime,checkpoint) {
    const s=immutableJSON(checkpoint);
    economyShape(s,['scope','schemaVersion','mode','params','main','again','immigration','specs','marketIndex','commodityIndex','againIndex','immigrationIndex','phase','batches'],'economy task checkpoint');
    check(s.scope==='web-economy-task-checkpoint' && s.schemaVersion===1,'Unsupported economy task checkpoint');
    check(s.mode==='scheduled'||s.mode==='forced','Invalid checkpoint task mode');
    economyShape(s.params,['withIncomeAndUpkeep','withStockpileUpdate','forceNonUIStep','withImmigration'],'checkpoint task parameters');
    for(const [key,value]of Object.entries(s.params))bool(value,key);
    if(s.mode==='scheduled')check(s.params.withIncomeAndUpkeep&&s.params.forceNonUIStep&&s.params.withImmigration,'Invalid scheduled parameters');
    ids(s.main,'checkpoint main roster');
    for(const key of ['again','immigration','specs'])if(s[key]!==null)ids(s[key],'checkpoint '+key);
    if(s.mode==='scheduled')check(s.again!==null&&s.immigration!==null,'Missing scheduled fixed rosters');
    for(const [key,max]of [['marketIndex',s.main.length],['commodityIndex',s.specs?.length??0],['againIndex',s.again?.length??0],['immigrationIndex',s.immigration?.length??0]])
      check(Number.isSafeInteger(s[key])&&s[key]>=0&&s[key]<=max,'Invalid checkpoint '+key);
    const phase=['main','reapply-again','immigration','finish','done'].indexOf(s.phase);
    check(phase>=0,'Unknown checkpoint phase');
    if(s.specs===null)check(phase===0&&s.marketIndex===0&&s.commodityIndex===0,'Unstarted task has advanced');
    else {
      if(s.commodityIndex>0)check(s.marketIndex===s.main.length,'Commodity work before market work');
      check(phase===0?s.commodityIndex<s.specs.length:s.commodityIndex===s.specs.length,'Commodity cursor disagrees with phase');
    }
    if(phase===0)check(s.againIndex===0&&s.immigrationIndex===0,'Later tasks advanced during main work');
    if(phase>=1)check(s.again!==null,'Missing second task roster');
    if(phase===1)check(s.againIndex<s.again.length&&s.immigrationIndex===0,'Invalid second task cursor');
    if(phase>=2)check(s.againIndex===s.again.length,'Second task is incomplete');
    if(phase===2)check(s.params.withImmigration&&s.immigration!==null&&s.immigrationIndex<s.immigration.length,'Invalid immigration task');
    if(phase>=3&&s.params.withImmigration)check(s.immigration!==null&&s.immigrationIndex===s.immigration.length,'Immigration task is incomplete');
    if(!s.params.withImmigration)check(s.immigrationIndex===0,'Disabled immigration advanced');
    check(Number.isSafeInteger(s.batches)&&s.batches===(s.specs===null?0:1)+s.marketIndex+s.commodityIndex+s.againIndex+s.immigrationIndex+(phase===4?1:0),'Checkpoint batch count mismatch');
    // Deliberately bypass the normal constructor's forced refreshes and live roster reads.
    const task=new OriginalEconomyTaskRunner(runtime,restoreToken);
    task.#mode=s.mode;task.#params=s.params;task.#main=s.main;task.#again=s.again;task.#immigration=s.immigration;task.#specs=s.specs;
    task.#marketIndex=s.marketIndex;task.#commodityIndex=s.commodityIndex;task.#againIndex=s.againIndex;task.#immigrationIndex=s.immigrationIndex;task.#phase=s.phase;task.#batches=s.batches;
    return task;
  }
  #call(method,...args) {const result=this.#runtime[method](...args);check(!result || typeof result.then!=='function','Economy runtime must finish synchronously: '+method);return result;}
  #listeners(commodity=null) {
    // Snapshot for EACH notification, including finish. A listener removed by an earlier callback
    // still receives its snapshot callback unless it is expired at its own turn.
    for(const listener of ids(this.#call('listUpdateListeners'),'economy listeners',false)) {
      const expired=this.#call('isEconomyListenerExpired',listener);bool(expired,'listener expiry');
      if(expired)this.#call('removeUpdateListener',listener);
      else if(commodity===null)this.#call('economyUpdated',listener);
      else this.#call('commodityUpdated',listener,commodity);
    }
  }
  #advancePhase() {
    if(this.#phase==='main' && this.#specs!==null && this.#commodityIndex>=this.#specs.length) {
      this.#phase='reapply-again'; if(this.#again===null)this.#again=ids(this.#call('listEconomyMarkets'),'second task market roster');
    }
    if(this.#phase==='reapply-again' && this.#againIndex>=this.#again.length) {
      this.#phase=this.#params.withImmigration?'immigration':'finish';
      if(this.#phase==='immigration' && this.#immigration===null)this.#immigration=ids(this.#call('listReachMarkets'),'immigration task market roster');
    }
    if(this.#phase==='immigration' && this.#immigrationIndex>=this.#immigration.length)this.#phase='finish';
  }
  #stepBatch() {
    check(!this.#failed,'Failed economy draft must be rolled back, not resumed'); check(!this.#running,'Reentrant economy task batch'); if(this.#phase==='done')return this.status();this.#running=true;
    try {
      this.#advancePhase();
      if(this.#phase==='main') {
        if(this.#specs===null)this.#specs=originalEconomyCommodityOrder(this.#call('getCommoditySpecs'));
        else if(this.#marketIndex<this.#main.length) {const market=this.#main[this.#marketIndex];this.#call('reapplyConditions',market);this.#call('reapplyIndustries',market);this.#marketIndex++;}
        else {
          const commodity=this.#specs[this.#commodityIndex++],groups=new Set();
          for(const market of this.#main){const group=this.#call('getMarketEconGroup',market);if(group!==null){identifier(group);groups.add(group);}}
          this.#call('computeCommodityData',commodity,null);for(const group of groups)this.#call('computeCommodityData',commodity,group);
          if(this.#params.withStockpileUpdate)for(const market of this.#main)this.#call('updateStockpileAndPrice',market,commodity);
          this.#listeners(commodity);
        }
      } else if(this.#phase==='reapply-again') {const market=this.#again[this.#againIndex];this.#call('reapplyConditions',market);this.#call('reapplyIndustries',market);this.#againIndex++;}
      else if(this.#phase==='immigration') {const market=this.#immigration[this.#immigrationIndex++];this.#call('advanceImmigration',market,Math.fround(30/ORIGINAL_ECONOMY_TASKS.iterationsPerMonth),!this.#params.forceNonUIStep);}
      else if(this.#phase==='finish') {this.#listeners();this.#phase='done';}
      this.#batches++;this.#advancePhase();return this.status();
    } catch(error) {this.#failed=true;throw error;} finally {this.#running=false;}
  }
  step() {check(!this.#framing,'Cannot interleave a native task frame');return this.#stepBatch();}
  /** MultiFrameTask.advance: at most one native task, default 1ms budget, at least one batch if not done. */
  advanceTask(task,{nowSeconds=()=>performance.now()/1000,budgetSeconds=0.001}={}) {
    check(!this.#failed&&!this.#running&&!this.#framing,'Cannot enter a failed or running native task frame');
    check(Object.hasOwn(nativeTaskPhases,task)&&typeof nowSeconds==='function','Expected native task identity and monotonic clock');
    check(Number.isFinite(budgetSeconds)&&budgetSeconds>=0,'Invalid native task frame budget');
    const target=nativeTaskPhases[task];check(phaseOrder.indexOf(this.#phase)>=target,'Cannot skip earlier native tasks');
    this.#framing=true;
    try {
      const start=nowSeconds();check(Number.isFinite(start),'Invalid monotonic task time');let previous=start,elapsedSeconds=0,batches=0;
      while(phaseOrder.indexOf(this.#phase)===target){
        this.#stepBatch();batches++;
        const now=nowSeconds();check(Number.isFinite(now)&&now>=previous,'Native task clock must be monotonic');previous=now;elapsedSeconds=now-start;
        // javap advance offsets 54..85: the decompiler omitted BOTH budget exit branches.
        if(elapsedSeconds>=budgetSeconds||budgetSeconds-elapsedSeconds<elapsedSeconds/batches)break;
      }
      return immutableJSON({task,complete:phaseOrder.indexOf(this.#phase)>target,batches,elapsedSeconds,status:this.status()});
    } catch(error){this.#failed=true;throw error;} finally {this.#framing=false;}
  }
  run() {while(this.#phase!=='done')this.step();return this.status();}
  status() {return immutableJSON({scope:'native-economy-task-orchestration-only',mode:this.#mode,phase:this.#phase,failed:this.#failed,batches:this.#batches,mainMarketIndex:this.#marketIndex,commodityIndex:this.#commodityIndex,againMarketIndex:this.#againIndex,immigrationMarketIndex:this.#immigrationIndex,commodityOrder:this.#specs});}
}
