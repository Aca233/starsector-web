/** Native BaseToggleAbility with the two supported travel plugins. UI effects are
 * explicit outputs; unknown plugins/listeners fail rather than pretending to run. */
import R from '../data/reference-campaign-travel-abilities.json' with {type:'json'};
import MOTION from '../data/reference-fleet-construction.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {modifyOriginalNativeStatTarget} from './OriginalNativeFleetStats.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {originalEntityMemoryWithoutUpdate,originalCampaignMemoryContains,originalCampaignMemoryBoolean,setOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {originalResourceQuantity} from './OriginalResourceCargo.mjs';
import {requestOriginalConstructedFleetGoSlow,getOriginalConstructedFleetDestination} from './OriginalCampaignFleetMotion.mjs';
import {getOriginalMovementFacing} from './OriginalMovement.mjs';
import {originalFleetMemberViews} from './OriginalCampaignFleetView.mjs';
import {shiftOriginalViewShifter} from './OriginalFleetViewShifters.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_ABILITY',m);
const scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native ability float required');return f(n);};
const call=(s,k,...args)=>{check(typeof s[k]==='function','Actual ability service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','Synchronous ability service required');return v;};
const entity=fleet=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual ability owner fleet required');return fleet.campaign.entity;};
export const isOriginalCampaignAbility=a=>a?.scope==='native-campaign-toggle-ability';
/** A null map getter returns a fresh temporary collection, without changing the entity. */
export function originalFleetAbilityEntries(fleet){const e=entity(fleet);check(e.abilities===null||Array.isArray(e.abilities),'Actual ordered ability map required');return e.abilities??[];}
export function originalFleetAbilities(fleet){return originalFleetAbilityEntries(fleet).map(row=>row.plugin);}
export function originalFleetAbility(fleet,id){return originalFleetAbilityEntries(fleet).find(row=>row.id===id)?.plugin??null;}
export function validateOriginalCampaignAbility(a,fleet=a?.fleet){
 check(isOriginalCampaignAbility(a)&&a.fleet===fleet&&a.entity===entity(fleet),'Lost ability/owner identity');
 const source=R.specs.find(s=>s.id===a.id);check(source&&a.spec?.id===a.id&&a.spec.plugin===source.plugin,'Unsupported native ability plugin');
 check(Array.isArray(a.spec.tags)&&a.spec.tags.every(t=>typeof t==='string'),'Actual ability tags required');
 for(const key of ['activationDays','deactivationDays','activationCooldown','deactivationCooldown','musicSuppression'])check(scalar(a.spec[key])===a.spec[key],'Actual saved ability spec float required');
 for(const key of ['name','icon'])check(typeof a.spec[key]==='string','Actual ability spec text required');
 for(const key of ['uiOn','uiOff','uiLoop','worldOn','worldOff','worldLoop'])check(a.spec[key]===null||typeof a.spec[key]==='string','Actual nullable ability sound required');
 check(typeof a.turnedOn==='boolean'&&typeof a.isActivateCooldown==='boolean'&&Number.isInteger(a.disableFrames)&&a.disableFrames>=0,'Actual toggle flags required');
 check(scalar(a.level)===a.level&&a.level>=0&&a.level<=1&&scalar(a.cooldownLeft)===a.cooldownLeft,'Actual ability transition/cooldown required');return a;
}
export function validateOriginalFleetAbilities(fleet){
 const e=entity(fleet),ids=new Set(),abilities=[];check(Array.isArray(e.scripts),'Actual entity scripts required');
 for(const row of originalFleetAbilityEntries(fleet)){check(row&&typeof row.id==='string'&&!ids.has(row.id)&&row.plugin&&typeof row.plugin==='object','Duplicate or mismatched ability map entry');ids.add(row.id);if(isOriginalCampaignAbility(row.plugin)){check(row.id===row.plugin.id,'Mismatched native ability id');validateOriginalCampaignAbility(row.plugin,fleet);check(e.scripts.filter(s=>s===row.plugin).length===1,'Ability must be the same single registered script');}abilities.push(row.plugin);}
 for(const script of e.scripts)if(isOriginalCampaignAbility(script))check(abilities.includes(script),'Unregistered native ability script');return fleet;
}
export function addOriginalFleetAbility(fleet,id){
 const e=entity(fleet),existing=originalFleetAbility(fleet,id);if(existing!==null)return validateOriginalCampaignAbility(existing,fleet);
 const source=R.specs.find(s=>s.id===id);check(source,'No native ability implementation: '+id);check(Array.isArray(e.scripts),'Actual script list required');
 const spec={...source,tags:[...source.tags]};for(const key of ['activationDays','deactivationDays','activationCooldown','deactivationCooldown','musicSuppression'])spec[key]=f(spec[key]);
 const ability={scope:'native-campaign-toggle-ability',id,spec,fleet,entity:e,disableFrames:0,turnedOn:false,cooldownLeft:0,isActivateCooldown:false,level:0};
 e.abilities??=[];e.abilities.push({id,plugin:ability});e.scripts.push(ability);return ability;
}
export function originalAbilityLayers(a){validateOriginalCampaignAbility(a);return null;}
export function originalAbilitiesCompatible(a,b){
 for(const tag of a.spec.tags){if(!/[+-]$/.test(tag))continue;if(tag.endsWith('+')&&b.spec.tags.includes(tag))return false;const opposite=tag.slice(0,-1)+(tag.endsWith('+')?'-':'+');if(b.spec.tags.includes(opposite))return false;}return true;
}
export function originalAbilityCooldownFraction(a){if(a.cooldownLeft<=0)return 1;const max=a.isActivateCooldown?a.spec.activationCooldown:a.spec.deactivationCooldown;return f(1-f(a.cooldownLeft/(max<=0?1:max)));}
function noFuel(a){return !a.fleet.aiMode&&originalResourceQuantity(a.fleet.cargo,'fuel')<=0&&a.entity.containingLocation!==null&&a.entity.containingLocation.hyperspaceMode;}
export function originalAbilityUsable(a){validateOriginalCampaignAbility(a);if(!a.isActivateCooldown&&a.level>0&&a.level<1&&a.spec.deactivationDays>0)return false;return originalAbilityCooldownFraction(a)>=1&&a.disableFrames<=0&&(a.id!=='sustained_burn'||!noFuel(a));}
export function forceDisableOriginalAbility(a){validateOriginalCampaignAbility(a);a.disableFrames=2;}
const modId=a=>a.id+'_ability_mod';
function modify(a,key,channel,value,description=null,remove=false){const target=a.fleet.stats.targets.find(t=>t.value===a.fleet.stats[key]);check(target,'Lost actual fleet stat target: '+key);modifyOriginalNativeStatTarget(target,channel,modId(a),scalar(value),{remove,description});}
function cleanupImpl(a){for(const key of a.id==='go_dark'?['detectedRangeMod']:['detectedRangeMod','fleetwideMaxBurnMod','accelerationMult'])for(const channel of ['flat','percent','mult'])modify(a,key,channel,0,null,true);}
function validateContext(c,frame=true){check(c&&(!frame||typeof c.paused==='boolean')&&Object.hasOwn(c,'playerFleet')&&Object.hasOwn(c,'currentLocation'),'Actual ability frame context required');check(scalar(c.secondsPerDay)===c.secondsPerDay&&c.secondsPerDay>0,'Actual native clock conversion required');}
function visibleHere(a,c,s){if(a.entity.containingLocation!==c.currentLocation)return false;const v=call(s,'isFleetVisibleToPlayer',a.fleet);check(typeof v==='boolean','Actual ability visibility required');return v;}
function effect(a,effects,type,extra={}){effects.push({scope:'native-campaign-ability-effect',type,abilityId:a.id,fleetRef:a.fleet.objectRef,...extra});}
function transitionPresentation(a,on,c,s,effects){const spec=a.spec,sound=on?spec.worldOn:spec.worldOff;if(a.fleet!==c.playerFleet&&sound!==null&&visibleHere(a,c,s))effect(a,effects,'world-sound',{soundId:sound,volume:1,pitch:1,position:[...a.entity.position],velocity:[...a.entity.velocity]});}
function report(a,on,c,s){if(a.fleet===c.playerFleet)call(s,'reportPlayerAbility',a,on);}
const length=v=>f(Math.sqrt(f(f(v[0]*v[0])+f(v[1]*v[1]))));
function memoryIs(a,key,s){const memory=originalEntityMemoryWithoutUpdate(a.entity);return originalCampaignMemoryContains(memory,key,s.memoryServices)&&originalCampaignMemoryBoolean(memory,key,s.memoryServices);}
function apply(a,seconds,level,c,s,effects){
 const fleet=a.fleet,views=originalFleetMemberViews(fleet);
 if(a.id==='go_dark'){
  if(level<1)level=0;const d=fleet.stats.dynamicStats.go_dark_effectiveness?effective(fleet.stats.dynamicStats.go_dark_effectiveness):1;
  modify(a,'detectedRangeMod','mult',f(1+f(f(f(.5*d)-1)*level)),a.spec.name);requestOriginalConstructedFleetGoSlow(fleet);
  for(const view of views){shiftOriginalViewShifter(view.contrailColor,modId(a),[0,0,0,0],1,1,1);for(const [key,value]of [['contrailDurMult',0],['engineGlowSizeMult',.5],['engineHeightMult',.5]])shiftOriginalViewShifter(view[key],modId(a),value,1,1,1);}return;
 }
 if(level>0&&noFuel(a)){deactivate(a,c,s,effects);return;}
 setOriginalCampaignMemory(originalEntityMemoryWithoutUpdate(a.entity),'$sb_active',true,f(.3));
 // Native getVelocity reads BaseEntity's previous frame vector; setVelocity writes movementModule only.
 const velocity=a.entity.velocity,speed=length(velocity),movement=fleet.campaign.movement;
 if(level>0&&level<1&&seconds>0&&!memoryIs(a,'$sb_no_slow',s)){
  const activateSeconds=f(a.spec.activationDays*c.secondsPerDay),acc=f(f(Math.max(speed,200)/activateSeconds)+movement.acceleration),ds=Math.min(f(acc*seconds),speed),angle=getOriginalMovementFacing(velocity),rad=f(angle*f(f(Math.PI)/180));
  movement.velocity[0]=f(velocity[0]-f(f(Math.cos(rad))*ds));movement.velocity[1]=f(velocity[1]-f(f(Math.sin(rad))*ds));return;
 }
 modify(a,'detectedRangeMod','percent',f(100*level),a.spec.name);
 const bonus=fleet.stats.dynamic.sustained_burn_bonus?effective({base:0,modifiers:fleet.stats.dynamic.sustained_burn_bonus}):0;
 modify(a,'fleetwideMaxBurnMod','flat',Math.trunc(f(bonus*level)),a.spec.name);modify(a,'fleetwideMaxBurnMod','mult',1,a.spec.name);modify(a,'fleetwideMaxBurnMod','percent',100,a.spec.name);
 let adjusted=f(speed-MOTION.motionSettings.baseTravelSpeed);if(adjusted<0||adjusted<=R.minTravelSpeed+1)adjusted=0;const burn=Math.floor(f(adjusted/MOTION.motionSettings.speedPerBurnLevel)+.5);let impact=0;
 if(burn>1){const desired=getOriginalConstructedFleetDestination(fleet),direction=fleet.campaign.flags.wasSlowMoving===true?getOriginalMovementFacing([-velocity[0],-velocity[1]]):getOriginalMovementFacing(desired.map((n,i)=>f(n-a.entity.position[i]))),velDir=getOriginalMovementFacing(velocity);let diff=f(f(f(direction-velDir)%360)+360)%360;if(diff>180)diff=f(360-diff);diff=Math.max(0,f(diff-120));impact=f(1-f(.5*Math.min(1,f(diff/60))));}
 modify(a,'accelerationMult','mult',f(1-f(f(1-f(.2))*impact)));
 for(const view of views){shiftOriginalViewShifter(view.contrailColor,modId(a),view.engineColor.base,1,1,f(.5*level));for(const [key,value]of [['engineGlowSizeMult',1.5],['engineHeightMult',3],['engineWidthMult',2]])shiftOriginalViewShifter(view[key],modId(a),value,1,1,level);}
 if(level<=0)cleanupImpl(a);
}
function deactivate(a,c,s,effects){if(!a.turnedOn)return;a.turnedOn=false;transitionPresentation(a,false,c,s,effects);if(a.spec.deactivationDays<=0)a.level=0;a.cooldownLeft=a.spec.deactivationCooldown;a.isActivateCooldown=false;apply(a,0,a.level,c,s,effects);if(a.id==='go_dark')cleanupImpl(a);report(a,false,c,s);}
function activate(a,c,s,effects){
 if(a.turnedOn||!originalAbilityUsable(a))return;a.turnedOn=true;transitionPresentation(a,true,c,s,effects);if(a.spec.activationDays<=0)a.level=1;a.cooldownLeft=a.spec.activationCooldown;a.isActivateCooldown=true;
 if(visibleHere(a,c,s))effect(a,effects,'floating-text',{text:a.spec.name,duration:.5,color:[...a.entity.indicator.color.slice(0,3),255]});
 if(a.id==='sustained_burn'&&!memoryIs(a,'$sb_active',s)){a.fleet.campaign.movement.velocity[0]=0;a.fleet.campaign.movement.velocity[1]=0;}
 apply(a,0,a.level,c,s,effects);
 for(const other of originalFleetAbilities(a.fleet)){if(other===a)continue;validateOriginalCampaignAbility(other);if(!originalAbilitiesCompatible(a,other)&&other.turnedOn)deactivate(other,c,s,effects);}
 report(a,true,c,s);
}
export function changeOriginalFleetAbility(a,action,c,s={}){
 validateOriginalCampaignAbility(a);validateContext(c,false);check(['activate','deactivate','press'].includes(action),'Actual ability action required');const effects=[];
 if(action==='activate')activate(a,c,s,effects);else if(action==='deactivate')deactivate(a,c,s,effects);else{if(a.turnedOn)deactivate(a,c,s,effects);else activate(a,c,s,effects);if(a.fleet===c.playerFleet){const sound=a.turnedOn?a.spec.uiOn:a.spec.uiOff;if(sound!==null)effect(a,effects,'ui-sound',{soundId:sound,volume:1,pitch:1});}}
 return {effects,active:a.turnedOn,level:a.level,readyForAuthority:false};
}
export function advanceOriginalCampaignAbility(a,seconds,c,s={}){
 validateOriginalCampaignAbility(a);validateContext(c);seconds=scalar(seconds);const effects=[];if(c.paused)return {effects};a.disableFrames=Math.max(0,a.disableFrames-1);
 for(const [kind,sound]of [['world',a.spec.worldLoop],['ui',a.spec.uiLoop]])if(sound!==null&&a.level>0&&(kind==='world'?visibleHere(a,c,s):a.fleet===c.playerFleet))effect(a,effects,kind+'-loop',{soundId:sound,volume:a.level,pitch:1,musicSuppression:f(a.spec.musicSuppression*a.level),position:[...a.entity.position],velocity:[...a.entity.velocity]});
 const days=f(seconds/c.secondsPerDay);if(a.cooldownLeft>0)a.cooldownLeft=Math.max(0,f(a.cooldownLeft-days));const prev=a.level;
 if(a.turnedOn&&a.level<1)a.level=Math.min(1,f(a.level+f(days/a.spec.activationDays)));else if(!a.turnedOn&&a.level>0)a.level=Math.max(0,f(a.level-f(days/a.spec.deactivationDays)));
 if(prev!==a.level||a.level>0)apply(a,seconds,a.level,c,s,effects);return {effects};
}
export function removeOriginalFleetAbility(fleet,id,c,s={}){
 const e=entity(fleet),ability=originalFleetAbility(fleet,id),effects=[];if(ability===null)return {effects};validateOriginalCampaignAbility(ability);validateContext(c);
 e.abilities.splice(e.abilities.findIndex(row=>row.id===id),1);const at=e.scripts.indexOf(ability);if(at>=0)e.scripts.splice(at,1);
 if(ability.turnedOn||ability.level>0){apply(ability,0,0,c,s,effects);cleanupImpl(ability);}if(e.abilities.length===0)e.abilities=null;return {effects};
}
export function clearOriginalFleetAbilities(fleet,c,s={}){check(entity(fleet).abilities!==null,'Native clearAbilities requires an initialized map');const effects=[];for(const row of [...originalFleetAbilityEntries(fleet)])effects.push(...removeOriginalFleetAbility(fleet,row.id,c,s).effects);return {effects};}
