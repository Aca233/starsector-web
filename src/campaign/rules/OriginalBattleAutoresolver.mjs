/** Default BattleAutoresolverPluginImpl: real strengths, damage, pursuit and results.
 * Encounter/loot/recovery and campaign AI are explicit dependencies, never success stubs. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import SYNC from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {originalBattleFleetMembers,originalBattleIsInvolved,originalBattlePlayerSide,originalBattleSideFor,validateOriginalCampaignBattle} from './OriginalCampaignBattle.mjs';
import {originalNativeMemberIsCivilian,originalNativeMemberStrength} from './OriginalNativeStrength.mjs';
import {originalNativeMemberHullFraction} from './OriginalNativeRepair.mjs';
import {originalMemberCanDeployForCombat} from './OriginalTowCable.mjs';
import {getOriginalMemberStats} from './OriginalMemberEffects.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalBattleDamageHull,applyOriginalBattleMemberDamage,resetOriginalBattleDamageTaken} from './OriginalBattleMemberDamage.mjs';
import {originalJavaNextDouble,originalJavaNextInt,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_BATTLE_AUTORESOLVER',m);
const call=(s,k,...args)=>{check(typeof s?.[k]==='function','Actual autoresolver service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','Synchronous autoresolver service required: '+k);return v;};
const bool=value=>{check(typeof value==='boolean','Actual autoresolver Boolean required');return value;};
const scalar=value=>{check(typeof value==='number'&&Number.isFinite(value)&&value===f(value),'Actual autoresolver float required');return value;};
function actual(resolver){check(resolver?.scope==='native-default-battle-autoresolver','Actual default autoresolver required');return resolver;}
function station(member,services){if(services.isBattleMemberStation)return bool(call(services,'isBattleMemberStation',member));const hull=SYNC.hulls[member.variant.hullId];check(hull,'Actual station hull hints required');return hull.hints.includes('STATION');}
function combinedFor(battle,fleet){const side=originalBattleSideFor(battle,fleet);return side===battle.sideOne?battle.combinedOne:side===battle.sideTwo?battle.combinedTwo:null;}
export function createOriginalBattleAutoresolver(battle,services={}){
 validateOriginalCampaignBattle(battle);let one=battle.combinedOne,two=battle.combinedTwo;
 if(originalBattleIsInvolved(battle,call(services,'readBattlePlayerFleet'))){const side=originalBattlePlayerSide(battle,services);one=side===battle.sideOne?battle.combinedOne:side===battle.sideTwo?battle.combinedTwo:null;two=side===battle.sideOne?battle.combinedTwo:side===battle.sideTwo?battle.combinedOne:null;}
 return {scope:'native-default-battle-autoresolver',battle,one,two,playerPursuitAutoresolveMode:false,playerShipsToDeploy:null,result:null,context:null};
}
export function computeOriginalBattleMemberData(member,fleet,pursuit=false,services={}){
 bool(pursuit);const data={member,strength:0,shieldRatio:0,combatReady:false},hull=originalBattleDamageHull(member.variant,services);
 if(originalNativeMemberIsCivilian(member)&&!pursuit||!originalMemberCanDeployForCombat(member,fleet)){
  data.strength=f(.25);if(hull.shieldType!=='NONE')data.shieldRatio=f(.5);return data;
 }
 data.combatReady=true;const stats=getOriginalMemberStats(member,fleet);
 let hullStrength=f(effective({base:hull.hitpoints,modifiers:stats.hullBonus})+f(effective({base:hull.armorRating,modifiers:stats.armorBonus})*10));
 let shieldStrength=f(effective(stats.fluxCapacity)+f(effective(stats.fluxDissipation)*10));
 if(hull.shieldType==='NONE')shieldStrength=0;
 else{let cost=f(hull.shieldFluxPerDamage*f(effective(stats.shieldAbsorptionMult)*effective(stats.shieldDamageTakenMult)));if(cost<f(.1))cost=f(.1);shieldStrength=f(shieldStrength*f(1/cost));}
 if(hullStrength<1)hullStrength=1;if(shieldStrength<1)shieldStrength=1;
 data.shieldRatio=f(shieldStrength/f(shieldStrength+hullStrength));if(station(member,services))data.shieldRatio=f(.5);
 const strength=services.readMemberStrength?scalar(call(services,'readMemberStrength',member,true,true,true)):originalNativeMemberStrength(member,fleet,true,true,true,services);
 data.strength=Math.max(f(strength*f(f(.85)+f(f(.3)*f(originalJavaNextDouble(services.globalRandom))))),f(.25));return data;
}
export function computeOriginalBattleFleetData(resolver,fleet,services={}){
 actual(resolver);const result={fleet,fightingStrength:0,members:[]};
 for(const member of [...originalBattleFleetMembers(fleet,services)]){
  const data=computeOriginalBattleMemberData(member,fleet,resolver.playerPursuitAutoresolveMode,services);result.members.push(data);
  const selected=resolver.playerPursuitAutoresolveMode&&resolver.playerShipsToDeploy!==null&&fleet===resolver.one&&(resolver.playerShipsToDeploy.includes(member)||bool(member.isAlly));
  if(!data.combatReady||resolver.playerPursuitAutoresolveMode&&fleet===resolver.one&&!selected)continue;
  const mult=resolver.playerShipsToDeploy!==null&&resolver.playerShipsToDeploy.includes(member)?8:1;
  result.fightingStrength=f(result.fightingStrength+f(data.strength*mult));
 }
 // ListenerUtil always queries the actual listener manager, even when it has no listeners.
 call(services,'modifyBattleAutoresolveData',result);return result;
}
export function originalBattleOutcomeWeights(data,advantage,maxDamage,escaping,enemyEscaping,services={}){
 scalar(advantage);scalar(maxDamage);bool(escaping);bool(enemyEscaping);const hull=SYNC.hulls[data.member.variant.hullId];check(hull,'Actual hull size required');
 let unscathed=({CAPITAL_SHIP:5,CRUISER:10,DESTROYER:15,FIGHTER:30,FRIGATE:30})[hull.hullSize]??1;
 let disabled=0,heavy=0,medium=0,light=0,ratio=f(maxDamage/data.strength);if(ratio>1)ratio=1;if(ratio<=0)ratio=0;
 if(ratio>=f(.8)){disabled=20;heavy=10;medium=10;light=5;}
 else if(ratio>=f(.6)){disabled=5;heavy=20;medium=10;light=5;}
 else if(ratio>=f(.4)){heavy=10;medium=20;light=10;}
 else if(ratio>=f(.2)){medium=10;light=20;}
 else if(ratio>0){medium=5;light=10;}
 if(escaping){unscathed=f(unscathed*2);light=f(light*f(1.5));}
 if(enemyEscaping){disabled=f(disabled*f(.5));heavy=f(heavy*f(.6));medium=f(medium*f(.7));light=f(light*f(.8));}
 unscathed=f(unscathed*advantage);light=f(light*advantage);const shield=data.shieldRatio;
 disabled=f(disabled*f(f(1.5)-f(shield*1)));heavy=f(heavy*f(f(1.4)-f(shield*f(.8))));
 medium=f(medium*f(f(1.3)-f(shield*f(.6))));light=f(light*f(f(1.2)-f(shield*f(.4))));unscathed=f(unscathed*f(f(.9)+f(shield*f(.2))));
 if(station(data.member,services)){heavy=f(heavy+disabled);disabled=0;}
 return [['DISABLED',disabled],['HEAVY_DAMAGE',heavy],['MEDIUM_DAMAGE',medium],['LIGHT_DAMAGE',light],['UNSCATHED',unscathed]];
}
export function computeOriginalBattleMemberOutcome(data,fleet,advantage,maxDamage,escaping,enemyEscaping,services={}){
 const entries=originalBattleOutcomeWeights(data,advantage,maxDamage,escaping,enemyEscaping,services).filter(([,weight])=>!(weight<=0));
 check(entries.length>0,'Native outcome picker is empty');let total=0;for(const [,weight]of entries)total=f(total+weight);
 // WeightedRandomPicker without an explicit Random casts AFTER multiplying the double.
 const random=Math.min(total,f(originalJavaNextDouble(services.globalRandom)*total));let sum=0,outcome=entries.at(-1)[0];
 for(const [item,weight]of entries){sum=f(sum+weight);if(random<=sum){outcome=item;break;}}
 resetOriginalBattleDamageTaken(data.member,services);let damage=0;
 if(outcome==='DISABLED')damage=1;
 else if(outcome!=='UNSCATHED')damage=f(f(({HEAVY_DAMAGE:.7,MEDIUM_DAMAGE:.45,LIGHT_DAMAGE:.2})[outcome])+f(f(originalJavaNextDouble(services.globalRandom))*f(.1)));
 applyOriginalBattleMemberDamage(data.member,fleet,damage,services);return outcome;
}
function shuffle(list,services){
 const random=call(services,'readBattleShuffleRandom');validateOriginalJavaRandom(random);
 check(random!==services.globalRandom,'Collections.shuffle must not alias Math.random');
 for(let i=list.length;i>1;i--){const at=originalJavaNextInt(random,i);[list[i-1],list[at]]=[list[at],list[i-1]];}
}
function fleetResult(fleet){return {fleet,goal:null,winner:false,deployed:[],reserves:[],destroyed:[],disabled:[],retreated:[],allEverDeployed:null,isPlayer:false,enemyCanCleanDisengage:false};}
export function resolveOriginalBattleEngagement(resolver,context,oneEscaping,twoEscaping,services={}){
 actual(resolver);bool(oneEscaping);bool(twoEscaping);
 const one=computeOriginalBattleFleetData(resolver,resolver.one,services),two=computeOriginalBattleFleetData(resolver,resolver.two,services);
 if(one.fightingStrength<=0&&two.fightingStrength<=0)return;
 if(one.fightingStrength<=f(.1))one.fightingStrength=f(.1);if(two.fightingStrength<=f(.1))two.fightingStrength=f(.1);
 const firstWins=(one.fightingStrength>two.fightingStrength||twoEscaping)&&!oneEscaping;
 const winner=firstWins?one:two,loser=firstWins?two:one,loserEscaping=firstWins?twoEscaping:oneEscaping;
 const advantage=Math.max(f(.1),Math.min(10,f(winner.fightingStrength/loser.fightingStrength)));
 let winnerDamage=f(loser.fightingStrength/advantage),loserDamage=f(winner.fightingStrength*advantage);
 if(resolver.playerPursuitAutoresolveMode)winnerDamage=0;
 const mult=services.readBattleAutoresolveDamageMult?scalar(call(services,'readBattleAutoresolveDamageMult')):R.settings.autoresolveDamageMult;
 winnerDamage=f(winnerDamage*mult);loserDamage=f(loserDamage*mult);
 const battle=call(context,'getBattle');validateOriginalCampaignBattle(battle);
 const result=resolver.result={scope:'native-autoresolve-engagement-result',battle,winnerResult:fleetResult(combinedFor(battle,winner.fleet)),loserResult:fleetResult(combinedFor(battle,loser.fleet)),playerOutBeforeEnd:false,lastCombatDamageData:null};
 shuffle(loser.members,services);
 for(const data of loser.members){computeOriginalBattleMemberOutcome(data,loser.fleet,f(1/advantage),loserDamage,loserEscaping,false,services);loserDamage=Math.max(0,f(loserDamage-data.strength));}
 for(const data of loser.members)(originalNativeMemberHullFraction(data.member,services)>0?result.loserResult.retreated:result.loserResult.disabled).push(data.member);
 shuffle(winner.members,services);let carrierLeft=false;
 for(const data of winner.members){
  if(!data.combatReady)continue;
  computeOriginalBattleMemberOutcome(data,winner.fleet,advantage,winnerDamage,false,loserEscaping,services);winnerDamage=Math.max(0,f(winnerDamage-data.strength));
  if(!bool(data.member.repairTracker.mothballed)&&originalNativeMemberHullFraction(data.member,services)>0&&Math.trunc(effective(getOriginalMemberStats(data.member,winner.fleet).numFighterBays))>0)carrierLeft=true;
 }
 let deployedStrength=0;const maxDeployed=f(loser.fightingStrength*2);
 for(const data of winner.members){if(originalNativeMemberHullFraction(data.member,services)>0||data.member.type==='FIGHTER_WING'&&carrierLeft)continue;deployedStrength=f(deployedStrength+data.strength);}
 for(const data of winner.members){
  if(resolver.playerPursuitAutoresolveMode){(resolver.playerShipsToDeploy.includes(data.member)||bool(data.member.isAlly)?result.winnerResult.deployed:result.winnerResult.reserves).push(data.member);}
  else if(originalNativeMemberHullFraction(data.member,services)>0){if(deployedStrength<maxDeployed){result.winnerResult.deployed.push(data.member);deployedStrength=f(deployedStrength+data.strength);}else result.winnerResult.reserves.push(data.member);}
  else result.winnerResult.disabled.push(data.member);
 }
 result.winnerResult.goal='ATTACK';result.winnerResult.winner=true;result.loserResult.goal=loserEscaping?'ESCAPE':'ATTACK';result.loserResult.winner=false;
 if(!resolver.playerPursuitAutoresolveMode){
  call(context,'processEngagementResults',result);call(context,'performPostVictoryRecovery',result);
  call(call(context,'getDataFor',winner.fleet),'setDisengaged',false);call(call(context,'getDataFor',winner.fleet),'setWonLastEngagement',true);call(call(context,'getDataFor',winner.fleet),'setLastGoal','ATTACK');
  call(call(context,'getDataFor',loser.fleet),'setDisengaged',true);call(call(context,'getDataFor',loser.fleet),'setWonLastEngagement',false);call(call(context,'getDataFor',loser.fleet),'setLastGoal','ESCAPE');
  if(!bool(winner.fleet.aiMode)){call(context,'generateLoot',null,true);call(context,'autoLoot');call(context,'recoverCrew',winner.fleet);}
  call(context,'applyAfterBattleEffectsIfThereWasABattle');
 }else for(const data of loser.members)data.member.owner=1;
 return result;
}
export function resolveOriginalBattleAutoresolver(resolver,services={}){
 actual(resolver);const context=resolver.context=call(services,'createBattleEncounterContext');
 call(context,'setAutoresolve',true);call(context,'setBattle',resolver.battle);
 const one=call(services,'pickBattleAIEncounterOption',resolver.one.campaign.ai,context,resolver.two,resolver.one);
 const two=call(services,'pickBattleAIEncounterOption',resolver.two.campaign.ai,context,resolver.one,resolver.two);
 if(one==='DISENGAGE'&&two==='DISENGAGE')return;
 // freeDisengageIfCanOutrun is a native constant false; no speed-based shortcut.
 return resolveOriginalBattleEngagement(resolver,context,one==='DISENGAGE'&&two==='ENGAGE',one==='ENGAGE'&&two==='DISENGAGE',services);
}
export function resolveOriginalBattlePlayerPursuit(resolver,context,selected,services={}){
 actual(resolver);check(Array.isArray(selected),'Actual player pursuit selection required');resolver.context=context;resolver.playerPursuitAutoresolveMode=true;resolver.playerShipsToDeploy=selected;
 return resolveOriginalBattleEngagement(resolver,context,false,true,services);
}
