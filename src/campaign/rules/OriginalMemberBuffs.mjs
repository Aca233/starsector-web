/** BuffManager and the audited terrain/TowCable buffs, in native list order. */
import {requireThat} from '../core/Values.mjs';
import {getOriginalMemberStats} from './OriginalMemberEffects.mjs';
import {modifyOriginalMemberStat} from './OriginalFleetMemberStats.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MEMBER_BUFF',m);
const terrain='com.fs.starfarer.api.impl.campaign.terrain.';
const tow='com.fs.starfarer.api.impl.campaign.TowCable$TowCableBuff';
const fields={CRRecoveryBuff:['baseCRRecoveryRatePercentPerDay','mult','mult'],CRLossPerSecondBuff:['cRLossPerSecondPercent','mult','mult'],MaxBurnBuff:['maxBurnLevel','flat','delta'],PeakPerformanceBuff:['peakCRDuration','mult','mult']};
const number=(v,label)=>{check(typeof v==='number'&&Number.isFinite(v)&&f(v)===v,'Invalid native buff '+label);return v;};
function list(member){check(member.buffManager&&member.buffManager.objectRef===member.buffManagerRef&&member.buffManager.memberRef===member.objectRef&&Array.isArray(member.buffManager.buffs),'Actual owned BuffManager required');return member.buffManager.buffs;}
function dirty(member){member.statUpdateNeeded=true;member.cachedStrength=-1;}
function handler(buff,plugins){
 if(Object.hasOwn(plugins,buff.className))return plugins[buff.className];
 if(buff.className===tow)return {advance:b=>{check(Number.isInteger(b.frames)&&b.frames>=-2147483648&&b.frames<=2147483647,'Invalid tow buff frames');b.frames=(b.frames+1)|0;},expired:b=>b.frames>=2,apply:(b,m,fleet)=>modifyOriginalMemberStat(getOriginalMemberStats(m,fleet),'maxBurnLevel','flat',b.id,1)};
 const name=buff.className?.startsWith(terrain)?buff.className.slice(terrain.length):null;
 check(name&&Object.hasOwn(fields,name),'Unported active buff: '+buff.className);
 const [key,channel,field]=fields[name];
 return {advance:(b,days)=>{b.dur=f(number(b.dur,'duration')-days);},expired:b=>number(b.dur,'duration')<=0,apply:(b,m,fleet)=>modifyOriginalMemberStat(getOriginalMemberStats(m,fleet),key,channel,b.id,number(b[field],field))};
}
function invoke(fn,...args){check(typeof fn==='function','Incomplete buff implementation');const out=fn(...args);check(!out||typeof out.then!=='function','Buff callbacks must be synchronous');return out;}
export function addOriginalMemberBuff(member,buff){list(member).push(buff);dirty(member);}
export function addOriginalMemberBuffOnlyUpdateStat(member,buff,fleet,plugins={}){
 const buffs=list(member),i=buffs.findIndex(b=>b.id!==null&&b.id===buff.id);if(i>=0)buffs.splice(i,1);
 buffs.push(buff);invoke(handler(buff,plugins).apply,buff,member,fleet);
}
export function removeOriginalMemberBuff(member,id){const buffs=list(member);for(let i=0;i<buffs.length;)if(buffs[i].id!==null&&buffs[i].id===id){buffs.splice(i,1);dirty(member);}else i++;}
export function getOriginalMemberBuff(member,id){return list(member).find(b=>b.id!==null&&b.id===id)??null;}
export function advanceOriginalMemberBuffs(member,days,plugins={}){
 number(days,'advance days');const buffs=list(member);
 for(let i=0;i<buffs.length;){const buff=buffs[i],impl=handler(buff,plugins);invoke(impl.advance,buff,days);const expired=invoke(impl.expired,buff);check(typeof expired==='boolean','Buff expiry must be Boolean');if(expired){buffs.splice(i,1);dirty(member);}else i++;}
}
export function applyOriginalMemberBuffs(member,fleet,plugins={}){for(const buff of list(member))invoke(handler(buff,plugins).apply,buff,member,fleet);}
