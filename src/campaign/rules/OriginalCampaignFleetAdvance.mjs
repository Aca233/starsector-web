/** CampaignFleet.advance, after Base/interaction cleanup through member effects (730–834).
 * Not the AI/person/Base phase, view/despawn, or a complete world tick.
 * The owner must consume returned ordered presentation effects; they are not rendered here. */
import {requireThat} from '../core/Values.mjs';
import {advanceOriginalFader,createOriginalFader,fadeOriginalFader} from './OriginalFader.mjs';
import {ORIGINAL_FLEET_SYNC,synchronizeOriginalFleet,originalFleetBurnLevel} from './OriginalFleetData.mjs';
import {advanceOriginalFleetStats,modifyOriginalNativeStatTarget} from './OriginalNativeFleetStats.mjs';
import {advanceOriginalFleetCampaignHullmods,advanceOriginalMemberHullmods} from './OriginalFleetEffects.mjs';
import {advanceOriginalMemberBuffs} from './OriginalMemberBuffs.mjs';
import {advanceOriginalFleetAccidents} from './OriginalFleetAccidents.mjs';
import {advanceOriginalConstructedFleetLogistics} from './OriginalCampaignFleet.mjs';
import {advanceOriginalConstructedFleetMotion} from './OriginalCampaignFleetMotion.mjs';
import {originalNativeMemberHullFraction,originalNativeMemberNeedsRepairs} from './OriginalNativeRepair.mjs';
import {removeOriginalFleetRosterMember} from './OriginalFleetRoster.mjs';
import {originalResourceQuantity} from './OriginalResourceCargo.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_ADVANCE',m);
const scalar=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Actual finite '+label+' required');return f(n);};
const int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const crew=c=>(int(originalResourceQuantity(c,'crew'))+int(c.extraCrewUsed))|0;
const marines=c=>(int(originalResourceQuantity(c,'marines'))+int(c.extraMarinesUsed))|0;
const supplies=c=>f(originalResourceQuantity(c,'supplies')+f(int(c.extraSuppliesUsed)));
function current(fleet){check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed fleet required');return fleet.campaign;}
export function setOriginalFleetNoEngaging(fleet,seconds){const c=current(fleet);seconds=scalar(seconds,'no-engaging seconds');c.noCombat=createOriginalFader(0,seconds);fadeOriginalFader(c.noCombat,'IN');c.noCombatPulse.bounceUp=true;c.noCombatPulse.bounceDown=true;fadeOriginalFader(c.noCombatPulse,'IN');}
export function updateOriginalFleetOvercapacitySpeed(fleet,services={}){
 current(fleet);if(!fleet.isPlayerFleet)return;
 synchronizeOriginalFleet(fleet,services);const c=fleet.cargo;
 let fraction=f(f(originalResourceQuantity(c,'fuel')+c.extraFuelUsed)/Math.max(1,c.maxFuel));
 fraction=Math.max(fraction,f(f((marines(c)+crew(c))|0)/Math.max(1,c.maxPersonnel)));
 fraction=Math.max(fraction,f(c.spaceUsed/Math.max(1,c.maxCapacity)));
 synchronizeOriginalFleet(fleet,services);const ships=f(fleet.membersWithoutNull.length),max=f(ORIGINAL_FLEET_SYNC.settings.maxShipsInFleet);
 fraction=Math.max(fraction,f(f(f(ships-max)+ships)/max));
 const target=fleet.stats.targets.find(t=>t.value===fleet.stats.fleetwideMaxBurnMod);check(target,'Actual shared fleet burn modifier required');const id='overcap_speed_penalty';
 for(const channel of ['flat','percent','mult'])modifyOriginalNativeStatTarget(target,channel,id,0,{remove:true});
 if(fraction>1){
  // Source reads getBurnLevel even though its return is unused; preserve the sync side effect.
  synchronizeOriginalFleet(fleet,services);originalFleetBurnLevel(fleet);
  fraction=Math.min(fraction,2);const mult=Math.min(f(2-fraction),1);
  modifyOriginalNativeStatTarget(target,'mult',id,mult,{remove:mult>=1,description:'超载 或 舰船数量超出上限。'});
 }
}
function repairsCompleteIntent(member){return {kind:'repairs-complete',member,mergeExtraPrefix:'repairs_finished',initialExtra:'repairs_finished:1',initialText:String(member.shipName)+' - 修理完毕',mergedTextPrefix:'修理完毕 (共 ',mergedTextSuffix:' 艘舰船) ',colorRole:'base-player',icon:{category:'intel',key:'repairs_finished'},clickAction:'REFIT_TAB'};}
export function advanceOriginalFleetAfterBase(binding,seconds,days,globalRandom,context,services={}){
 const fleet=binding?.fleet,c=current(fleet);seconds=scalar(seconds,'frame seconds');days=scalar(days,'frame days');
 check(seconds>=0&&days>=0&&typeof context?.isFastForwardIteration==='boolean'&&Object.hasOwn(context,'playerFleet'),'Actual nonnegative time/engine context required');
 check(typeof fleet.aiMode==='boolean'&&fleet.isPlayerFleet===(context.playerFleet===fleet),'Player identity must match the actual engine fleet');
 const effects=[],bound={...services,reportRepairsComplete:member=>effects.push(repairsCompleteIntent(member))};
 if(c.noCombat!==null){advanceOriginalFader(c.noCombat,seconds);if(c.noCombat.state==='IDLE'){c.noCombat=null;c.noCombatPulse.bounceUp=false;c.noCombatPulse.bounceDown=true;}}
 advanceOriginalFader(c.noCombatPulse,seconds);
 updateOriginalFleetOvercapacitySpeed(fleet,bound);
 advanceOriginalFleetCampaignHullmods(fleet,bound);
 advanceOriginalFleetStats(fleet.stats,days);
 const accidents=fleet.aiMode?null:advanceOriginalFleetAccidents(binding,days,globalRandom,bound);
 if(accidents?.report)effects.push({kind:'accident-report',report:accidents.report,showPlayerReport:accidents.showPlayerReport});
 // Logistics first reads cargo in non-AI mode; AI only reads members for days > 0.
 // A zero-time AI logistics call must not prematurely sync the fleet.
 if(!fleet.aiMode||days>0)synchronizeOriginalFleet(fleet,bound);
 const logistics=advanceOriginalConstructedFleetLogistics(fleet,days,bound);
 synchronizeOriginalFleet(fleet,bound);const available=supplies(fleet.cargo);
 const removedMembers=fleet.membersWithoutNull.filter(m=>originalNativeMemberHullFraction(m,bound)<=0);
 for(const member of removedMembers)removeOriginalFleetRosterMember(binding,member);
 synchronizeOriginalFleet(fleet,bound);let needsRepairs=false;
 // Source boolean |= evaluates every member; do not replace this with short-circuit some().
 for(const member of fleet.membersWithoutNull)needsRepairs=originalNativeMemberNeedsRepairs(member,bound)||needsRepairs;
 const flags=c.flags,isPlayer=context.playerFleet===fleet;
 const message=text=>effects.push({kind:'campaign-message',text,colorRole:'enemy'});
 if(isPlayer&&flags.wasOutOfSupplies===null&&available<=0){flags.wasOutOfSupplies=true;message('补给不足');if(needsRepairs)message('无法继续进行当前维修');}
 else if(available>1)flags.wasOutOfSupplies=null;
 if(isPlayer){
  synchronizeOriginalFleet(fleet,bound);const missing=fleet.minCrew>f(crew(fleet.cargo));
  if(flags.wasOutOfCrew===null&&missing){flags.wasOutOfCrew=true;message('没有足够的船员让所有舰船做好战斗准备');}
  else if(!missing)flags.wasOutOfCrew=null;
 }
 const motion=advanceOriginalConstructedFleetMotion(fleet,seconds,context,bound);
 const memberEffects=advanceOriginalFleetMemberCampaignEffects(fleet,seconds,days,bound);
 return {scope:'native-fleet-after-base-through-member-effects',effects,accidents,logistics,removedMembers,needsRepairs,motion,memberEffects,readyForAuthority:false};
}

/** Natural-frame order differs from FleetData.sync's zero-time order. Do not apply buffs early. */
export function advanceOriginalFleetMemberCampaignEffects(fleet,seconds,days,services={}){
 seconds=scalar(seconds,'member frame seconds');days=scalar(days,'member frame days');synchronizeOriginalFleet(fleet,services);
 check(Array.isArray(fleet.membersWithoutNull),'Actual member list required');const members=fleet.membersWithoutNull;
 const invoke=(fn,...args)=>{const result=fn(...args);check(!result||typeof result.then!=='function','Member campaign effects must be synchronous');};
 for(const member of members){
  if(member.variant!==null){if(services.advanceMemberHullmods)invoke(services.advanceMemberHullmods,member,seconds);else advanceOriginalMemberHullmods(member,seconds,fleet,services.memberHullmodPlugins,services);}
  if(member.buffManagerRef!==null){if(services.advanceMemberBuffs)invoke(services.advanceMemberBuffs,member,days);else advanceOriginalMemberBuffs(member,days,services.memberBuffPlugins);}
 }
 return {membersAdvanced:members.length};
}
