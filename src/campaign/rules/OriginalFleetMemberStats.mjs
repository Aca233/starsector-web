/** Actual campaign-side MutableShipStats, CRPluginImpl and RepairTracker operations. */
import reference from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable} from './OriginalMarketEconomy.mjs';
import {put} from './OriginalIndustryState.mjs';
const R=reference,f=Math.fround;
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_MEMBER_STATS',message);
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&n===f(n),'Actual finite native float required: '+label);return n;};
const blank=()=>({flat:[],percent:[],mult:[]}),stat=base=>({base,modifiers:blank()});
const effective=resolveOriginalEconomyMutable;
function hull(member){const id=member.variant?.hullId;check(typeof id==='string'&&Object.hasOwn(R.hulls,id),'Native member hull required');return R.hulls[id];}
function stats(member){check(member.stats?.nativeMemberStatsVersion===1,'Full member stat creation required (not logistics-only saved cache)');return member.stats;}
export function modifyOriginalMemberStat(s,key,channel,id,value){const target=s[key];check(target&&['flat','percent','mult'].includes(channel),'Unknown member stat/channel: '+key);put(target.modifiers?target:{modifiers:target},channel,id,number(value,key));}
export function unmodifyOriginalMemberStat(s,key,id,channel=null){const target=s[key];check(target,'Unknown member stat: '+key);for(const c of channel?[channel]:['flat','percent','mult'])put(target.modifiers?target:{modifiers:target},c,id,0,true);}
export function originalMemberDynamicStat(s,key){check(s.dynamicStats&&typeof key==='string'&&key.length>0&&key.length<=128&&!['__proto__','constructor','prototype'].includes(key),'Invalid dynamic stats namespace/key');if(!Object.hasOwn(s.dynamicStats,key))s.dynamicStats[key]=stat(1);return s.dynamicStats[key];}
export function removeOriginalUnmodifiedMemberDynamics(s){for(const [space,isStat]of [[s.dynamicStats,true],[s.dynamic,false]])for(const key of Object.keys(space)){const mods=isStat?space[key].modifiers:space[key];if(Object.values(mods).every(a=>a.length===0))delete space[key];}}
/** Fresh native base values; caller must run skills, hullmods and lifecycle before publishing current. */
export function createOriginalFleetMemberStats(member){return baseStats(hull(member));}
/** MutableShipStats.create(variant): no ShipAPI, FleetMember, crew, commander or CR. */
export function createOriginalVariantShipStats(variant){
 const h=R.hulls[variant?.hullId];check(h&&variant.effects,'Actual variant/hull required for temporary ship stats');
 return Object.assign(baseStats(h),{scope:'native-variant-ship-stats',variant,entity:null,fleetMember:null});
}
function baseStats(h){
 const s={lifecycle:'base-only',nativeMemberStatsVersion:1,listenerManager:null,dynamic:{},dynamicStats:{}};
 for(const [key,value]of Object.entries(R.memberStatDefaults))s[key]=value.kind==='bonus'?blank():stat(value.base);
 for(const [key,base]of Object.entries(h.memberStats))s[key]=stat(base);
 for(const [key,base]of Object.entries({suppliesToRecover:h.suppliesToRecover,suppliesPerMonth:h.suppliesPerMonth,maxBurnLevel:h.maxBurn,numFighterBays:f(h.fighterBays)}))s[key]=stat(base);
 for(const [alias,key]of Object.entries(R.memberStatAliases))s[alias]=s[key];
 // Existing FleetData getter names are aliases, never a second mutable value.
 s.maxBurn=s.maxBurnLevel;s.fighterBays=s.numFighterBays;return s;
}
export function originalMemberCrewFraction(member,fleet,context){
 const s=stats(member),h=hull(member),playerCommander=context?.playerCommander??false;check(typeof playerCommander==='boolean','Actual commander player flag required');
 if(member.fleetCommanderForStatsRef!==null&&member.fleetCommanderForStatsRef!==undefined)check(context&&Object.hasOwn(context,'playerCommander'),'Commander override requires actual player flag');
 let count=1;if(member.type==='FIGHTER_WING'){check(Object.hasOwn(R.wings,member.specId),'Unknown wing');count=f(R.wings[member.specId].numFighters);}
 const minCrew=f(Math.ceil(f(effective({base:h.minCrew,modifiers:s.minCrewMod})*count)));
 if(minCrew<=0)return 1;
 if(!playerCommander&&member.fleetDataRef!==null&&fleet?.attachedToCampaignFleet){check(typeof fleet.aiMode==='boolean','Actual fleet AI mode required');if(fleet.aiMode)return 1;}
 check(member.status!==undefined,'Actual member hull status required');
 if(member.status!==null){const values=member.status.modules?.map(m=>m.hullFraction)??member.status.hullFractions;check(Array.isArray(values)&&values.length>0,'Actual member module status required');let total=0;for(const v of values)total=f(total+number(v,'hull fraction'));if(f(total/f(values.length))<=0)return 1;}
 check(member.crewComposition,'Actual crew composition required');return Math.min(1,f(number(member.crewComposition.crew,'crew')/minCrew));
}
/** RepairTracker.getCR applies crew shortage before CRPluginImpl sees the value. */
export function originalMemberCurrentCR(member,fleet,context){check(member.repairTracker,'Actual repair tracker required');const t=member.repairTracker;check(Object.hasOwn(t,'crOverride'),'Actual runtime CR override state required');return t.crOverride===null?f(number(t.cr,'CR')*originalMemberCrewFraction(member,fleet,context)):number(t.crOverride,'CR override');}
export function originalMemberCRThresholds(s){const mult=effective(originalMemberDynamicStat(s,'cr_malfunction_range_mult'));return {malfunction:f(f(f(0.4)*mult)-f(0.001)),critical:f(f(f(0.2)*mult)-f(0.001)),shield:f(f(0.1)*mult),degrade:f(f(0.5)*mult),improve:f(0.7)};}
/** Campaign stats have no combat entity, so this does not toggle a live ship's system/defence. */
export function applyOriginalMemberCR(s,cr,hullSize){
 number(cr,'effective CR');check(s.nativeMemberStatsVersion===1,'Full current-build member stats required');const t=originalMemberCRThresholds(s),id='cr_effect';
 if(hullSize!=='FIGHTER'){
  for(const [key,threshold,max]of [['weaponMalfunctionChance',t.malfunction,10],['engineMalfunctionChance',t.malfunction,7.5],['criticalMalfunctionChance',t.critical,25],['shieldMalfunctionChance',t.shield,5]]){
   if(cr<threshold)modifyOriginalMemberStat(s,key,'flat',id,f(f(0.01)*f(f(f(max)*f(threshold-cr))/threshold)));else unmodifyOriginalMemberStat(s,key,id);
  }
  if(cr<t.shield)modifyOriginalMemberStat(s,'shieldMalfunctionFluxLevel','flat',id,f(0.75));else unmodifyOriginalMemberStat(s,'shieldMalfunctionFluxLevel',id);
 }
 let movement=0;if(cr<t.degrade)movement=f(f(-1*f(f(t.degrade-cr)/t.degrade))*10);else if(cr>t.improve)movement=f(f(f(cr-t.improve)/f(1-t.improve))*10);
 for(const [keys,change]of [[['maxSpeed','acceleration','deceleration','turnAcceleration','maxTurnRate','ballisticWeaponDamageMult','energyWeaponDamageMult','missileWeaponDamageMult'],movement],[['armorDamageTakenMult','hullDamageTakenMult','shieldDamageTakenMult','fighterRefitTimeMult'],-movement]])for(const key of keys){if(change!==0)modifyOriginalMemberStat(s,key,'percent',id,change);else unmodifyOriginalMemberStat(s,key,id);}
 modifyOriginalMemberStat(s,'autofireAimAccuracy','flat',id,f(f(cr*f(1.5))-f(0.5)));
}
export function updateOriginalMemberCrewAndCRStats(member,fleet,context){
 check(typeof member.forceNoMoreStatsUpdates==='boolean','Actual force-no-stats flag required');if(member.forceNoMoreStatsUpdates)return;
 const s=stats(member),cf=originalMemberCrewFraction(member,fleet,context);
 modifyOriginalMemberStat(s,'maxCombatReadiness','flat','船员能力增益',f(0.7));
 if(cf<1){modifyOriginalMemberStat(s,'maxCombatReadiness','flat','船员能力不足',f(-f(f(0.5)*f(1-cf))));modifyOriginalMemberStat(s,'baseCRRecoveryRatePercentPerDay','mult','crew understrength',Math.max(0,Math.min(1,cf)));}
 else{unmodifyOriginalMemberStat(s,'maxCombatReadiness','船员能力不足','flat');unmodifyOriginalMemberStat(s,'baseCRRecoveryRatePercentPerDay','crew understrength');}
 if(member.repairTracker!==null)applyOriginalMemberCR(s,originalMemberCurrentCR(member,fleet,context),hull(member).hullSize);
}
export function updateOriginalMemberRepairRates(member){
 const s=stats(member),t=member.repairTracker;check(t,'Actual repair tracker required');
 t.recoveryRate=f(effective(s.baseCRRecoveryRatePercentPerDay)*f(0.01));
 t.decreaseRate=f(f(s.baseCRRecoveryRatePercentPerDay.base*f(0.01))*f(0.5));
}
