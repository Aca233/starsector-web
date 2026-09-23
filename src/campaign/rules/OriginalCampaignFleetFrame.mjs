import {advanceOriginalFleetView,clearOriginalFleetView} from './OriginalCampaignFleetView.mjs';
export {clearOriginalFleetView} from './OriginalCampaignFleetView.mjs';
import {advanceOriginalFleetContact,setOriginalFleetIndicatorColors} from './OriginalFleetContact.mjs';
/** CampaignFleet.advance orchestration with the native Base phases.
 * AI, discovery, detection listeners, external member modules/jitter and arbitrary scripts need real plugins.
 * Reached missing services fail; no empty callback or fabricated visibility completes a frame.
 * This is not BaseLocation.advance or a complete Sector/network tick. */
import {requireThat} from '../core/Values.mjs';
import {advanceOriginalFader,fadeOriginalFader} from './OriginalFader.mjs';
import {advanceOriginalEntityBaseTail,advanceOriginalEntityEvenIfPaused} from './OriginalCampaignEntityFrame.mjs';
import {advanceOriginalPerson} from './OriginalPersonAdvance.mjs';
import {synchronizeOriginalFleet} from './OriginalFleetData.mjs';
import {originalNativeMemberMaxCR} from './OriginalNativeRepair.mjs';
import {advanceOriginalFleetAfterBase} from './OriginalCampaignFleetAdvance.mjs';
import {updateOriginalFleetAbilityLayers,finishOriginalFleetAfterView,reportOriginalDetectedEntity} from './OriginalFleetWorld.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_FRAME',m);
function invoke(services,name,...args){check(typeof services[name]==='function','Actual fleet frame service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Fleet frame services must be synchronous');return value;}
const current=fleet=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual constructed CampaignFleet required');return fleet.campaign;};
const scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Actual finite native frame time required');return f(n);};
const bool=(v,name)=>{check(typeof v==='boolean','Actual Boolean required: '+name);return v;};
function colorIndicator(fleet,services){
 const c=current(fleet),indicator=c.entity.indicator;if(indicator===null)return;
 const faction=services.readFleetIndicatorFaction?invoke(services,'readFleetIndicatorFaction',fleet):c.faction;if(faction===null)return;
 setOriginalFleetIndicatorColors(fleet,faction.specColor,faction.secondaryUIColor,faction.specSecondarySegments,services);
}
export function advanceOriginalFleetRangeIndicator(fleet,seconds,context,services={}){
 const c=current(fleet);seconds=scalar(seconds);if(c.entity.containingLocation!==context.currentLocation||fleet===context.playerFleet)return;
 const level=invoke(services,'readVisibilityToPlayer',fleet);check(['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(level),'Actual sensor visibility enum required');
 fadeOriginalFader(c.sensorRangeIndicator.fader,level==='NONE'?'OUT':'IN');advanceOriginalFader(c.sensorRangeIndicator.fader,seconds);
 c.sensorRangeIndicator.phase=f(f(c.sensorRangeIndicator.phase+f(seconds*50))%150);
}
/** BaseCampaignEntity.advance for a CampaignFleet. Contact behavior is not a no-op. */
export function advanceOriginalFleetBase(fleet,seconds,days,context,services={},globalRandom){
 const entity=current(fleet).entity;seconds=scalar(seconds);days=scalar(days);bool(context.paused,'pause state');colorIndicator(fleet,services);
 const contact=services.advanceContactIndicator?invoke(services,'advanceContactIndicator',fleet,seconds,context):advanceOriginalFleetContact(fleet,seconds,globalRandom,context,services);
 const contactEffects=contact?.effects??[];check(Array.isArray(contactEffects),'Actual ordered contact presentation effects required');
 const abilityEffects=advanceOriginalEntityBaseTail(entity,seconds,days,{get paused(){return context.paused;},get isPlayerFleet(){return fleet===context.playerFleet;}},services);return {contactEffects,abilityEffects};
}
/** Paused engine callback: does not run AI, motion, repairs, faders, or normal Memory.advance. */
export function advanceOriginalFleetEvenIfPaused(fleet,seconds,context,services={}){
 const entity=current(fleet).entity;seconds=scalar(seconds);bool(context.paused,'pause state');
 advanceOriginalEntityEvenIfPaused(entity,seconds,{get paused(){return context.paused;},get isPlayerFleet(){return fleet===context.playerFleet;}},services);
}
export function advanceOriginalFleetFrame(binding,seconds,days,globalRandom,world,context,services={}){
 const fleet=binding.fleet,c=current(fleet);seconds=scalar(seconds);days=scalar(days);bool(context.paused,'pause state');bool(context.isFastForwardIteration,'fast-forward state');
 check(world?.scope==='native-current-fleet-world-registration','Actual world registration/listener graph required');
 if(seconds>0&&fleet===context.playerFleet)for(const stack of fleet.cargo.slots)if(stack!==null&&stack.cargo!==fleet.cargo)stack.cargo=fleet.cargo;
 if(fleet.postLoadReset!==null){fleet.synchronization.needsSync=true;synchronizeOriginalFleet(fleet,services);for(const member of fleet.membersWithoutNull)member.repairTracker.cr=originalNativeMemberMaxCR(member,fleet);fleet.postLoadReset=null;}
 advanceOriginalFleetRangeIndicator(fleet,seconds,context,services);
 if(c.entity.containingLocation===context.currentLocation)updateOriginalFleetAbilityLayers(fleet,services);
 if(fleet===context.playerFleet&&fleet.cargo.partials===null)fleet.cargo.partials={};
 if(c.ai!==null&&c.flags.fadeAndExpire===null&&c.flags.doNotAdvanceAI!==true)invoke(services,'advanceFleetAI',c.ai,seconds,fleet);
 const advancePerson=person=>{if(services.advancePerson)invoke(services,'advancePerson',person,seconds,days,context);else advanceOriginalPerson(person,seconds,days,{paused:context.paused},services.memoryServices);};
 const commander=invoke(services,'readFleetCommander',fleet);if(commander!==null)advancePerson(commander);
 if(fleet.officers!==null){check(Array.isArray(fleet.officers),'Actual ordered officers required');for(const officer of fleet.officers)advancePerson(officer.person);}
 const base=advanceOriginalFleetBase(fleet,seconds,days,context,{...services,reportDetectedEntity:services.reportDetectedEntity??((entity,level)=>reportOriginalDetectedEntity(world,entity,level,services))},globalRandom);
 if(c.interactionTarget!==null){const target=invoke(services,'readInteractionTarget',c.interactionTarget);if(target.containingLocation!==c.entity.containingLocation)c.interactionTarget=null;}
 if(c.interactionTarget!==null){const target=invoke(services,'readInteractionTarget',c.interactionTarget);if(!bool(target.alive,'interaction target isAlive'))c.interactionTarget=null;}
 const afterBase=advanceOriginalFleetAfterBase(binding,seconds,days,globalRandom,context,services);
 const visible=bool(invoke(services,'isFleetVisible',fleet,500),'isVisible');let advancedView=false;
 if(visible||bool(invoke(services,'willFleetBeVisible',fleet),'willBeVisible')){if(services.advanceFleetView)invoke(services,'advanceFleetView',fleet,seconds);else advanceOriginalFleetView(fleet,seconds,context,globalRandom,services);advancedView=true;}else if(services.clearFleetView)invoke(services,'clearFleetView',fleet);else clearOriginalFleetView(fleet);
 const retirement=finishOriginalFleetAfterView(world,binding,services);
 return {scope:'native-campaign-fleet-frame',effects:[...base.contactEffects,...base.abilityEffects,...afterBase.effects],afterBase,advancedView,retirement,readyForAuthority:false};
}
