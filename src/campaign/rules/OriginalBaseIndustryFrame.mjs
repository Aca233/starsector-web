/** BaseIndustry.advance only. The concrete plugin owns all virtual hooks and post-super work. */
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_BASE_INDUSTRY_FRAME',m);
export function advanceOriginalBaseIndustryFrame(row,days,{colonyDebug=false},runtime){
 check(Number.isFinite(days)&&f(days)===days&&days>=0&&typeof colonyDebug==='boolean','Actual native days and debug flag required');
 check(typeof row.wasDisrupted==='boolean'&&typeof row.entry?.operating.building==='boolean'&&Number.isFinite(row.buildProgress)&&f(row.buildProgress)===row.buildProgress&&Number.isFinite(row.buildTime)&&f(row.buildTime)===row.buildTime,'Actual current BaseIndustry fields required');
 const disrupted=runtime.isDisrupted();check(typeof disrupted==='boolean','Actual current disruption required');
 if(!disrupted&&row.wasDisrupted)runtime.disruptionFinished();row.wasDisrupted=disrupted;
 if(row.entry.operating.building&&!disrupted){row.buildProgress=f(row.buildProgress+(colonyDebug?f(days*100):days));if(row.buildProgress>=row.buildTime)return runtime.finishBuildingOrUpgrading();}
 return null;
}
