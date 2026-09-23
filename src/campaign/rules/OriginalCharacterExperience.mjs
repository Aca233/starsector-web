/** CharacterStats/OfficerData experience on shared native objects. UI receivers stay explicit. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {originalPersonMemoryWithoutUpdate} from './OriginalPersonAdvance.mjs';
import {originalCampaignMemoryBoolean,originalCampaignMemoryContains,originalCampaignMemoryInteger} from './OriginalCampaignMemory.mjs';
import {originalNativeFleetDynamicMod} from './OriginalNativeFleetStats.mjs';
import {resolveOriginalEconomyMutable} from './OriginalMarketEconomy.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_EXPERIENCE',m),wrap=n=>BigInt.asIntN(64,n),int=n=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(n))),round=n=>int(Math.floor(n+.5));
const invoke=(s,k,...a)=>{check(typeof s[k]==='function','Actual experience service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Synchronous experience service required');return v;};
export function originalExperienceLong(value){check(typeof value==='string'&&/^-?(0|[1-9]\d*)$/.test(value),'Exact decimal long required');const n=BigInt(value);check(wrap(n)===n,'Signed long out of range');return n;}
export function originalExperienceFloatToLong(value){if(Number.isNaN(value))return 0n;if(value>=2**63)return (1n<<63n)-1n;if(value<=-(2**63))return -(1n<<63n);return BigInt(Math.trunc(value));}
const scalarKeys=['xp','bonusXp','deferredBonusXp','xpAtLastStoryPointGain'];
export function initializeOriginalCharacterExperience(stats){Object.assign(stats,{nativeExperienceVersion:1,xp:'0',bonusXp:'0',deferredBonusXp:'0',xpAtLastStoryPointGain:'0',points:0,storyPoints:0,bonusXPGainReason:null,onlyAddBonusXPDoNotSpendStoryPoints:false});return stats;}
export function validateOriginalCharacterExperience(stats){check(stats?.nativeExperienceVersion===1,'Complete actual CharacterStats XP required; old uncaptured XP is not zero');for(const key of scalarKeys)originalExperienceLong(stats[key]);for(const key of ['level','points','storyPoints'])check(Number.isInteger(stats[key])&&int(stats[key])===stats[key],'Actual character integer required: '+key);check(stats.bonusXPGainReason===null||typeof stats.bonusXPGainReason==='string','Actual bonus XP reason required');check(typeof stats.onlyAddBonusXPDoNotSpendStoryPoints==='boolean','Actual story-point spend flag required');return stats;}
const value=(s,key)=>originalExperienceLong(s[key]),put=(s,key,n)=>{s[key]=wrap(n).toString();};
export function originalExperienceSetting(key,services={}){const n=services.readExperienceSetting?invoke(services,'readExperienceSetting',key):R.settings[key];check(typeof n==='number'&&Number.isFinite(n),'Actual XP setting required: '+key);return f(n);}
export function originalCharacterLevelupPlugin(services={}){
 if(services.readCharacterLevelupPlugin)return invoke(services,'readCharacterLevelupPlugin');
 const max=()=>int(originalExperienceSetting('playerMaxLevel',services));return {
 getMaxLevel:max,getPointsAtLevel:()=>int(originalExperienceSetting('skillPointsPerLevel',services)),getStoryPointsPerLevel:()=>int(originalExperienceSetting('storyPointsPerLevel',services)),getBonusXPUseMultAtMaxLevel:()=>int(originalExperienceSetting('bonusXPUseMultAtMaxLevel',services)),
 getXPForLevel:level=>{if(level<=1)return 0n;const a=R.experience.playerXP;let total=0n;for(let i=0;i<Math.min(level,a.length);i++)total+=BigInt(a[i]);if(level-1<a.length)return total;let last=BigInt(a.at(-1));for(let i=a.length;i<level&&i<max();i++){last=originalExperienceFloatToLong(f(f(Number(last))*R.experience.playerExponent));total=wrap(total+last);}if(level>=max()+1)total=wrap(total+originalExperienceFloatToLong(f(f(a[R.experience.maxStoryXPBaseLevel-1])*R.experience.maxStoryXPMult)));return total;}
 };
}
const player=(s,services)=>invoke(services,'readExperiencePlayerStats')===s;
const report=(services,stats,kind,panel,details={})=>invoke(services,'reportExperienceEvent',{kind,stats,panel,...details});
export function originalCharacterStoryThreshold(stats,previous,services={}){
 const p=originalCharacterLevelupPlugin(services),per=p.getStoryPointsPerLevel(),max=p.getMaxLevel();check(Number.isInteger(per)&&per>0,'Positive story points per level required');let low=p.getXPForLevel(stats.level),high=p.getXPForLevel(stats.level+1),step=(high-low)/BigInt(per);if(step<=0n)step=100000n;let threshold=low,next=stats.level+1,count=1;
 while((threshold=wrap(threshold+step))<=previous){if(count%per===0&&next<max+1){low=high;high=p.getXPForLevel(++next);step=(high-low)/BigInt(per);check(step>0n,'Increasing story thresholds required');}count++;}return threshold;
}
export function originalCharacterBonusForStoryPoint(stats,services={}){
 validateOriginalCharacterExperience(stats);const p=originalCharacterLevelupPlugin(services),per=p.getStoryPointsPerLevel(),max=p.getMaxLevel(),effective=wrap(value(stats,'xp')+wrap(value(stats,'bonusXp')*2n));let level=1;
 while(p.getXPForLevel(level+1)<=effective){if(++level>=max)break;}
 if(level<max-1){const low=p.getXPForLevel(level),step=wrap(p.getXPForLevel(level+1)-low),next=wrap(p.getXPForLevel(level+2)-low),progress=f(f(Number(wrap(effective-low)))/f(Number(step))),end=f(progress+f(f(1/per)*2)),one=f(Math.max(0,f(Math.min(1,end)-progress))*f(Number(step))),two=f(Math.max(0,f(end-1))*f(Number(wrap(next-step))));return BigInt(round(f(f(one+two)*f(.5))));}
 const next=Math.min(stats.level+1,max+1);return wrap(p.getXPForLevel(next)-p.getXPForLevel(next-1))/BigInt(per);
}
export function spendOriginalCharacterStoryPoints(stats,points,bonusFraction,panel=null,services={},options={}){
 validateOriginalCharacterExperience(stats);check(Number.isInteger(points)&&int(points)===points&&Number.isFinite(bonusFraction),'Actual story-point spend arguments required');const {sendMessage=true,asMessage=false,logText=null}=options;
 if(!stats.onlyAddBonusXPDoNotSpendStoryPoints)stats.storyPoints=(stats.storyPoints-points)|0;if(stats.storyPoints<0)stats.storyPoints=0;
 if(!player(stats,services))return;
 if(logText!==null)invoke(services,'appendExperiencePlaythroughLog',logText);
 if(sendMessage&&!stats.onlyAddBonusXPDoNotSpendStoryPoints)report(services,stats,'story-points-spent',panel,{points,asMessage});
 let bonus=0;for(let i=0;i<points;i++){const p=originalCharacterLevelupPlugin(services),max=p.getMaxLevel(),total=wrap(p.getXPForLevel(max+1)-p.getXPForLevel(max))/BigInt(p.getStoryPointsPerLevel()),all=f(round(f(f(Number(total))*f(bonusFraction))));let now=f(round(f(f(Number(originalCharacterBonusForStoryPoint(stats,services)))*f(bonusFraction))));if(stats.level>=max)now=all;bonus=f(bonus+now);put(stats,'deferredBonusXp',originalExperienceFloatToLong(f(f(Number(value(stats,'deferredBonusXp')))+Math.max(0,f(all-now)))));}
 if(bonus>0){const amount=BigInt(round(bonus));put(stats,'bonusXp',value(stats,'bonusXp')+amount);if(sendMessage)report(services,stats,'bonus-xp-gained',panel,{amount:amount.toString(),reason:stats.bonusXPGainReason,asMessage});}
}
export function levelUpOriginalCharacterIfNeeded(stats,panel=null,services={}){
 validateOriginalCharacterExperience(stats);const p=originalCharacterLevelupPlugin(services),isPlayer=player(stats,services),max=p.getMaxLevel();let atMax=stats.level>=max;if(!isPlayer&&atMax)return;let storyGained=false,levelGained=false;
 if(isPlayer){let threshold;while((threshold=originalCharacterStoryThreshold(stats,value(stats,'xpAtLastStoryPointGain'),services))<=value(stats,'xp')){storyGained=true;stats.storyPoints=(stats.storyPoints+1)|0;put(stats,'xpAtLastStoryPointGain',threshold);}}
 while(!atMax&&value(stats,'xp')>=p.getXPForLevel(stats.level+1)){levelGained=true;stats.level=(stats.level+1)|0;atMax=stats.level>=max;stats.points=(stats.points+p.getPointsAtLevel(stats.level))|0;if(!player(stats,services))continue;report(services,stats,'level-gained',panel,{level:stats.level,atMax});if(value(stats,'deferredBonusXp')<=0n||!atMax)continue;put(stats,'bonusXp',value(stats,'bonusXp')+value(stats,'deferredBonusXp'));report(services,stats,'deferred-bonus-xp-gained',panel,{amount:stats.deferredBonusXp});}
 if(!isPlayer)return;
 if(atMax){const low=p.getXPForLevel(stats.level),high=p.getXPForLevel(stats.level+1);let step=wrap(high-low);if(step<=0n)step=100000n;while(value(stats,'xp')>=high){put(stats,'xp',value(stats,'xp')-step);put(stats,'xpAtLastStoryPointGain',value(stats,'xpAtLastStoryPointGain')-step);}}
 if(storyGained){if(!levelGained)report(services,stats,'sound',panel,{id:'ui_char_gained_story_point'});report(services,stats,'story-points-available',panel,{points:stats.storyPoints});invoke(services,'setExperienceCharacterTabOpened',false);}
 if(levelGained){report(services,stats,'sound',panel,{id:'ui_char_level_up'});if(stats.points>0)report(services,stats,'skill-points-available',panel,{points:stats.points});invoke(services,'setExperienceCharacterTabOpened',false);}
}
export function addOriginalCharacterXP(stats,amount,panel=null,services={},options={}){
 validateOriginalCharacterExperience(stats);let gained=originalExperienceLong(amount),bonus=0n;const {sendMessage=true,useBonus=true,levelUp=true}=options;
 if(useBonus&&value(stats,'bonusXp')>0n){let mult=1;if(player(stats,services)&&stats.level===originalCharacterLevelupPlugin(services).getMaxLevel())mult=originalCharacterLevelupPlugin(services).getBonusXPUseMultAtMaxLevel();bonus=originalExperienceFloatToLong(f(f(Number(gained))*f(mult)));if(bonus>value(stats,'bonusXp'))bonus=value(stats,'bonusXp');if(bonus<0n)bonus=0n;gained=wrap(gained+bonus);put(stats,'bonusXp',value(stats,'bonusXp')-bonus);}
 put(stats,'xp',value(stats,'xp')+gained);if(player(stats,services)&&sendMessage)report(services,stats,'xp-gained',panel,{amount:gained.toString(),bonus:bonus.toString()});if(levelUp)levelUpOriginalCharacterIfNeeded(stats,panel,services);
}
export function originalOfficerXPForLevel(level,services={}){if(services.readOfficerXPForLevel)return originalExperienceLong(invoke(services,'readOfficerXPForLevel',level));if(level<=1)return 0n;const a=R.experience.officerXP;let total=0n;for(let i=0;i<Math.min(level,a.length);i++)total+=BigInt(a[i]);if(level-1>=a.length){let last=BigInt(a.at(-1));for(let i=a.length;i<level;i++){last=originalExperienceFloatToLong(f(f(Number(last))*R.experience.officerExponent));total=wrap(total+last);}}return originalExperienceFloatToLong(f(f(Number(total))*originalExperienceSetting('officerXPRequiredMult',services)));}
export function originalOfficerMaxLevel(person,services={}){if(services.readOfficerMaxLevel)return invoke(services,'readOfficerMaxLevel',person);const memory=originalPersonMemoryWithoutUpdate(person);if(originalCampaignMemoryContains(memory,'$officerMaxLevel',services.memoryServices))return originalCampaignMemoryInteger(memory,'$officerMaxLevel',services.memoryServices);const commander=invoke(services,'readOfficerFleetCommanderStats',person),bonus=commander===null?0:int(resolveOriginalEconomyMutable({base:0,modifiers:originalNativeFleetDynamicMod(commander,'officer_max_level_mod')}));return (int(originalExperienceSetting('officerMaxLevel',services))+bonus)|0;}
export function originalOfficerCanLevelUp(officer,services={}){const next=officer.person.stats.level+1;return originalOfficerXPForLevel(next,services)<=value(officer.person.stats,'xp')&&next<=originalOfficerMaxLevel(officer.person,services);}
export function addOriginalOfficerXP(officer,amount,panel=null,services={},applyMax=true){
 const person=officer.person;if(originalCampaignMemoryBoolean(originalPersonMemoryWithoutUpdate(person),'$isMercenary',services.memoryServices))return;const stats=validateOriginalCharacterExperience(person.stats),max=originalOfficerMaxLevel(person,services);let base=originalExperienceLong(amount);
 if(applyMax&&stats.level>=max){put(stats,'xp',originalOfficerXPForLevel(max,services));return;}
 const before=value(stats,'bonusXp');addOriginalCharacterXP(stats,base.toString(),null,services,{sendMessage:false,useBonus:true,levelUp:false});let used=wrap(before-value(stats,'bonusXp'));const limit=originalOfficerXPForLevel(max,services);
 if(applyMax&&value(stats,'xp')>limit){const excess=wrap(value(stats,'xp')-limit);put(stats,'xp',limit);used=wrap(used-excess);if(used<0n){base=wrap(base+used);used=0n;}if(base<0n)base=0n;}
 const officers=invoke(services,'readExperiencePlayerOfficers');if(officers!==null&&officers.includes(officer)&&base>0n){report(services,stats,'officer-xp-gained',panel,{person,amount:wrap(base+used).toString(),bonus:used.toString()});if(originalOfficerCanLevelUp(officer,services))report(services,stats,'officer-level-ready',panel,{person});}
 if(originalOfficerCanLevelUp(officer,services)){check(typeof officer.madePicks==='boolean'&&Array.isArray(officer.skillPicks),'Actual OfficerData skill picks required');if(!officer.madePicks){officer.skillPicks.length=0;const picks=invoke(services,'pickOfficerLevelupSkills',person,null);check(Array.isArray(picks)&&picks.every(id=>typeof id==='string'),'Actual selected officer skills required');officer.skillPicks.push(...picks);officer.madePicks=true;}}
}
