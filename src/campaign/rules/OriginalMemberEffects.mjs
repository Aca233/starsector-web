import salvageReference from '../data/reference-battle-autoresolver.json' with {type:'json'};
import autofitCostReference from '../data/reference-autofit-costs.json' with {type:'json'};
import {originalAutofitSpecs} from './OriginalAutofitSpecRegistry.mjs';
import {originalFighterOPCost} from './OriginalEquipmentCosts.mjs';
/** Source-backed campaign member effects; unported active scripts are errors, never silent no-ops. */
import {originalFleetCommanderRef} from './OriginalFleetCommander.mjs';
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import memberReference from '../data/reference-fleet-members.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {resolveOriginalEconomyMutable as effective} from './OriginalMarketEconomy.mjs';
import {put} from './OriginalIndustryState.mjs';
import {createOriginalFleetMemberStats,createOriginalVariantShipStats,modifyOriginalMemberStat as mod,unmodifyOriginalMemberStat as unmod,originalMemberDynamicStat,removeOriginalUnmodifiedMemberDynamics,updateOriginalMemberCrewAndCRStats,updateOriginalMemberRepairRates} from './OriginalFleetMemberStats.mjs';
const f=Math.fround,check=(v,message)=>requireThat(v,'UNSUPPORTED_NATIVE_MEMBER_EFFECT',message);
const skillPrefix='com.fs.starfarer.api.impl.campaign.skills.',dmodPrefix='com.fs.starfarer.api.impl.hullmods.';
const constants=script=>{const data=R.effectConstants[script]??memberReference.extraEffects[script]??autofitCostReference.effects[script];check(data,'Missing source constants: '+script);return data.constants;};
const round=n=>Math.max(-2147483648,Math.min(2147483647,Math.floor(n+0.5)));
const minusPercent=n=>f(1-f(n*f(0.01)));
const dynamicMod=(s,key,channel,id,value)=>{s.dynamic[key]??={flat:[],percent:[],mult:[]};put({modifiers:s.dynamic[key]},channel,id,value);};
const dynValue=(s,key,base)=>base===undefined?(Object.hasOwn(s.dynamicStats,key)?effective(s.dynamicStats[key]):1):(Object.hasOwn(s.dynamic,key)?effective({base,modifiers:s.dynamic[key]}):base);
function variant(member){const v=member.variant;check(v?.effects,'Actual variant effects capture required');check(Array.isArray(v.effects.hullMods),'Actual ordered hullmods required');return v;}
function hull(member){const id=member.variant?.hullId;check(typeof id==='string'&&Object.hasOwn(R.hulls,id),'Actual hull inputs required');return R.hulls[id];}
function person(fleet,ref){check(Array.isArray(fleet.statPeople),'Actual fleet skill people required');const p=fleet.statPeople.find(p=>p.objectRef===ref);check(p?.stats&&Array.isArray(p.stats.skills),'Actual captain/commander skill roster required');return p;}
function invoke(handler,...args){const out=handler(...args);check(!out||typeof out.then!=='function','Member effects must be synchronous');}
function mapValue(script,size){const value=(R.effectConstants[script]??memberReference.extraEffects[script]??autofitCostReference.effects[script])?.hullSizeMap[size];check(typeof value==='number','Missing native hull-size modifier: '+script+'/'+size);return value;}
const skillHandlers={
 [skillPrefix+'Helmsmanship$Level1']:(s,id)=>{const c=constants(skillPrefix+'Helmsmanship');for(const key of ['acceleration','deceleration','maxTurnRate'])mod(s,key,'percent',id,c.MANEUVERABILITY_BONUS);mod(s,'turnAcceleration','percent',id,f(c.MANEUVERABILITY_BONUS*2));},
 [skillPrefix+'Helmsmanship$Level2']:(s,id)=>mod(s,'maxSpeed','percent',id,constants(skillPrefix+'Helmsmanship').SPEED_BONUS),
 [skillPrefix+'Helmsmanship$Level3']:(s,id)=>mod(s,'allowZeroFluxAtAnyLevel','flat',id,1),
 [skillPrefix+'Helmsmanship$Level4']:(s,id)=>mod(s,'maxSpeed','flat',id,constants(skillPrefix+'Helmsmanship').ELITE_SPEED_BONUS_FLAT),
 [skillPrefix+'CombatEndurance$Level1']:(s,id)=>mod(s,'peakCRDuration','flat',id,constants(skillPrefix+'CombatEndurance').PEAK_TIME_BONUS),
 [skillPrefix+'CombatEndurance$Level2']:(s,id)=>mod(s,'cRLossPerSecondPercent','mult',id,f(1-f(constants(skillPrefix+'CombatEndurance').DEGRADE_REDUCTION_PERCENT/100))),
 [skillPrefix+'CombatEndurance$Level3']:(s,id)=>mod(s,'maxCombatReadiness','flat',id,f(constants(skillPrefix+'CombatEndurance').MAX_CR_BONUS*f(0.01))),
 // Native apply() is empty; its separate after-ship-creation combat listener is not a campaign stat effect.
 [skillPrefix+'CombatEndurance$Level4']:()=>{},
};
export function applyOriginalCharacterShipEffects(character,member,type,plugins={}){
 check(['SHIP','ALL_SHIPS_IN_FLEET'].includes(type),'Unsupported character effect scope');const size=hull(member).hullSize;
 if(type==='ALL_SHIPS_IN_FLEET'&&size==='FIGHTER')return;
 const list=character?.skills;check(Array.isArray(list),'Actual ordered CharacterStats skills required');const levels=new Map();
 for(const row of list){check(Object.hasOwn(R.skills,row.skillId)&&!levels.has(row.skillId)&&typeof row.level==='number'&&Number.isFinite(row.level)&&row.level===f(row.level),'Unknown, duplicate or invalid skill');levels.set(row.skillId,row.level);}
 for(const row of list)for(const e of R.skills[row.skillId]){const level=levels.get(e.governingSkill)??0;if(e.type!==type||level<e.requiredLevel)continue;const handler=Object.hasOwn(plugins,e.script)?plugins[e.script]:skillHandlers[e.script];check(typeof handler==='function','Unported active character ship effect: '+e.script);const id=row.skillId+(type==='SHIP'?'_ship_':'_ships_')+e.index;invoke(handler,member.stats,id,level,member);}
}
function dmodCost(s,id){const c=constants(dmodPrefix+'CompromisedStructure');mod(s,'suppliesToRecover','mult',id,c.DEPLOYMENT_COST_MULT);if(dynValue(s,'dmod_reduce_maintenance',0)>0)mod(s,'suppliesPerMonth','mult',id,c.DEPLOYMENT_COST_MULT);}
const hullmodHandlers={
 [dmodPrefix+'ConvertedHangar']:(s,id,size,smod,member)=>{
  const c=constants(dmodPrefix+'ConvertedHangar'),v=s.variant??member?.variant;check(v?.effects&&Array.isArray(v.wings),'Actual converted-hangar variant required');
  const dynamic=(key,base=0)=>{s.dynamic[key]??={flat:[],percent:[],mult:[]};return effective({base,modifiers:s.dynamic[key]});};
  mod(s,'numFighterBays','flat',id,f(1+dynamic('converted_hangar_mod')));
  if(smod){const bonus=size==='CRUISER'?c.SMOD_CRUISER:size==='CAPITAL_SHIP'?c.SMOD_CAPITAL:0;if(bonus!==0)put(originalMemberDynamicStat(s,'replacement_rate_increase_mult'),'percent',id,bonus);}
  const crew=dynamic('converted_hangar_no_crew_increase')<=0,rearm=dynamic('converted_hangar_no_rearm_increase')<=0,dp=dynamic('converted_hangar_no_dp_increase')<=0,refit=dynamic('converted_hangar_no_refit_penalty')<=0;
  if(refit){mod(s,'fighterRefitTimeMult','mult',id,c.REPLACEMENT_TIME_MULT);for(const key of ['replacement_rate_decrease_mult','replacement_rate_increase_mult'])put(originalMemberDynamicStat(s,key),'mult',id,f(1/c.REPLACEMENT_TIME_MULT));}
  if(rearm)dynamicMod(s,'fighter_rearm_time_extra_fraction_of_base_refit_time_mod','flat',id,c.REARM_TIME_FRACTION);
  if(dp){let count=round(s.numFighterBays.base),op=0;for(const wing of v.wings){if(wing===null||wing==='')continue;if(count>0){count--;continue;}op=f(op+originalFighterOPCost(originalAutofitSpecs.readFighterSpec(wing),s));}
   const increase=Math.max(c.MIN_DP,Math.ceil(f(op/c.FIGHTER_OP_PER_DP)));if(increase>0){dynamicMod(s,'deployment_points_mod','flat',id,f(increase));if(member!==null){const perDeploy=hull(member).suppliesToRecover;mod(s,'cRPerDeploymentPercent','mult',id,f(1+f(increase/perDeploy)));}mod(s,'suppliesToRecover','flat',id,f(increase));}
  }
  if(crew)mod(s,'minCrewMod','flat',id,f(c.CREW_REQ));
 },
 'data.hullmods.ReinforcedBulkheads':(s,id)=>{mod(s,'hullBonus','percent',id,constants('data.hullmods.ReinforcedBulkheads').HULL_BONUS);dynamicMod(s,'individual_ship_recovery_mod','flat',id,1000);mod(s,'breakProb','mult',id,0);},
 'data.hullmods.FluxCoilAdjunct':(s,id,size,smod)=>{const data=autofitCostReference.effects['data.hullmods.FluxCoilAdjunct'];let value=data.hullSizeMap[size];check(typeof value==='number','Actual flux-coil size required');if(smod)value=f(value+data.hullSizeBonusMap[size]);mod(s,'fluxCapacity','flat',id,value);},
 'com.fs.starfarer.api.impl.campaign.RepairGantry':(s,id,size)=>{const value=salvageReference.gantry.hullSizeMap[size];check(typeof value==='number','Actual repair gantry hull-size value required');dynamicMod(s,'salvage_value_bonus_ship','flat',id,f(value*f(.01)));},
 [dmodPrefix+'Automated']:(s,id,size,smod,member,fleet)=>{mod(s,'minCrewMod','mult',id,0);mod(s,'maxCrewMod','mult',id,0);if(member===null)return;let ref=member.fleetCommanderForStatsRef;if(ref===null&&member.fleetDataRef!==null){check(fleet&&fleet.dataRef===member.fleetDataRef,'Actual automated member FleetData required');ref=originalFleetCommanderRef(fleet);}if(ref===null)return;check(fleet&&typeof fleet.playerPersonRef==='string','Actual automated-ship commander/player identity required');if(person(fleet,ref).objectRef!==fleet.playerPersonRef)return;const data=memberReference.hulls[member.variant.hullId];check(typeof data?.noAutoPenalty==='boolean','Actual automated HullSpec tag required');if(!data.noAutoPenalty&&!member.variant.effects.tags.includes('no_auto_penalty'))mod(s,'maxCombatReadiness','flat',id,-constants(dmodPrefix+'Automated').MAX_CR_PENALTY);},
 'data.hullmods.ArmoredWeapons':(s,id,size,smod)=>{const c=constants('data.hullmods.ArmoredWeapons');mod(s,'armorBonus','percent',id,c.ARMOR_BONUS);mod(s,'weaponHealthBonus','percent',id,c.HEALTH_BONUS);mod(s,'weaponTurnRateBonus','mult',id,minusPercent(c.TURN_PENALTY));for(const key of ['maxRecoilMult','recoilPerShotMult','recoilDecayMult'])mod(s,key,'mult',id,minusPercent(c.RECOIL_BONUS));if(smod)for(const key of ['ballisticRoFMult','energyRoFMult'])mod(s,key,'mult',id,f(1+f(c.SMOD_BONUS*f(.01))));},
 'data.hullmods.DedicatedTargetingCore':(s,id,size,smod)=>{const value=mapValue('data.hullmods.'+(smod?'IntegratedTargetingUnit':'DedicatedTargetingCore'),size);for(const key of ['ballisticWeaponRangeBonus','energyWeaponRangeBonus'])mod(s,key,'percent',id,value);},
 'data.hullmods.FluxBreakers':(s,id,size,smod)=>{const c=constants('data.hullmods.FluxBreakers');mod(s,'empDamageTakenMult','mult',id,minusPercent(c.FLUX_RESISTANCE));mod(s,'ventRateMult','percent',id,f(c.VENT_RATE_BONUS+(smod?c.SMOD_VENT_BONUS:0)));},
 'data.hullmods.InsulatedEngines':(s,id,size,smod)=>{const c=constants('data.hullmods.InsulatedEngines');mod(s,'engineHealthBonus','percent',id,f(c.HEALTH_BONUS+(smod?c.SMOD_ENGINE_HEALTH:0)));mod(s,'hullBonus','percent',id,c.HULL_BONUS);mod(s,'sensorProfile','mult',id,smod?c.SMOD_PROFILE_MULT:c.PROFILE_MULT);},
 'data.hullmods.FluxDistributor':(s,id,size,smod)=>{let value=mapValue('data.hullmods.FluxDistributor',size);if(smod){const bonus=memberReference.extraEffects['data.hullmods.FluxDistributor'].hullSizeBonusMap[size];check(typeof bonus==='number','Actual flux distributor S-mod bonus required');value=f(value+bonus);}mod(s,'fluxDissipation','flat',id,value);},
 'data.hullmods.AutomatedRepairUnit':(s,id,size,smod)=>{const c=constants('data.hullmods.AutomatedRepairUnit'),mult=minusPercent(f(c.REPAIR_BONUS+(smod?c.SMOD_REPAIR_BONUS:0)));for(const key of ['combatEngineRepairTimeMult','combatWeaponRepairTimeMult'])mod(s,key,'mult',id,mult);if(smod)mod(s,'overloadTimeMod','mult',id,minusPercent(c.SMOD_OVERLOAD_BONUS));},
 'data.hullmods.ExpandedMagazines':(s,id,size,smod)=>{const c=constants('data.hullmods.ExpandedMagazines');for(const key of ['ballisticAmmoBonus','energyAmmoBonus'])mod(s,key,'percent',id,c.AMMO_BONUS);if(smod)for(const key of ['ballisticAmmoRegenMult','energyAmmoRegenMult'])mod(s,key,'percent',id,c.SMOD_REGEN_BONUS);},
 // TowCable.applyEffectsBeforeShipCreation is explicitly empty; its campaign hook is not.
 'com.fs.starfarer.api.impl.campaign.TowCable':()=>{},
 [dmodPrefix+'DriveFieldStabilizer']:(s,id)=>{const c=constants(dmodPrefix+'DriveFieldStabilizer');dynamicMod(s,'fleet_burn_bonus','flat',id,c.BURN_BONUS);mod(s,'sensorProfile','flat',id,c.SENSOR_PROFILE);},
 'data.hullmods.HighMaintenance':(s,id)=>mod(s,'suppliesPerMonth','mult',id,constants('data.hullmods.HighMaintenance').SUPPLY_USE_MULT),
 // Native method is explicitly empty; its weapon-range listener is an AFTER-creation combat effect.
 [dmodPrefix+'BallisticRangefinder']:()=>{},
 'data.hullmods.HardenedSubsystems':(s,id)=>{const c=constants('data.hullmods.HardenedSubsystems');mod(s,'peakCRDuration','percent',id,c.PEAK_BONUS_PERCENT);mod(s,'cRLossPerSecondPercent','mult',id,f(1-f(c.DEGRADE_REDUCTION_PERCENT/100)));},
 'data.hullmods.SafetyOverrides':(s,id,size)=>{const c=constants('data.hullmods.SafetyOverrides'),speed=mapValue('data.hullmods.SafetyOverrides',size);mod(s,'maxSpeed','flat',id,speed);for(const key of ['acceleration','deceleration'])mod(s,key,'flat',id,f(speed*2));mod(s,'zeroFluxMinimumFluxLevel','flat',id,2);mod(s,'fluxDissipation','mult',id,c.FLUX_DISSIPATION_MULT);mod(s,'peakCRDuration','mult',id,c.PEAK_MULT);mod(s,'ventRateMult','mult',id,0);mod(s,'weaponRangeThreshold','flat',id,c.RANGE_THRESHOLD);mod(s,'weaponRangeMultPastThreshold','mult',id,c.RANGE_MULT);},
 'data.hullmods.UnstableInjector':(s,id,size)=>{const c=constants('data.hullmods.UnstableInjector');mod(s,'maxSpeed','flat',id,mapValue('data.hullmods.UnstableInjector',size));for(const key of ['ballisticWeaponRangeBonus','energyWeaponRangeBonus'])mod(s,key,'mult',id,c.RANGE_MULT);mod(s,'fighterRefitTimeMult','percent',id,c.FIGHTER_RATE);},
 [dmodPrefix+'HeavyBallisticsIntegration']:(s,id)=>dynamicMod(s,'large_ballistic_mod','flat',id,-constants(dmodPrefix+'HeavyBallisticsIntegration').COST_REDUCTION),
 [dmodPrefix+'PDIntegration']:(s,id)=>dynamicMod(s,'small_pd_mod','flat',id,-constants(dmodPrefix+'PDIntegration').OP_REDUCTION),
 [dmodPrefix+'RuggedConstruction']:(s,id)=>{const c=constants(dmodPrefix+'RuggedConstruction');put(originalMemberDynamicStat(s,'dmod_effect_mult'),'mult',id,c.DMOD_EFFECT_MULT);dynamicMod(s,'dmod_acquire_prob_mod','mult',id,minusPercent(c.DMOD_AVOID_CHANCE));dynamicMod(s,'individual_ship_recovery_mod','flat',id,1000);mod(s,'suppliesToRecover','mult',id,c.DEPLOYMENT_COST_MULT);},
 [dmodPrefix+'VastHangar']:(s,id)=>{dynamicMod(s,'converted_hangar_mod','flat',id,constants(dmodPrefix+'VastHangar').CONVERTED_HANGAR_BONUS);for(const key of ['converted_hangar_no_crew_increase','converted_hangar_no_rearm_increase','converted_hangar_no_dp_increase','converted_hangar_no_refit_penalty'])dynamicMod(s,key,'flat',id,1);},
 'com.fs.starfarer.api.impl.hullmods.HighResSensors':(s,id,size,smod)=>{s.dynamic.hrs_sensor_range_mod??={flat:[],percent:[],mult:[]};put({modifiers:s.dynamic.hrs_sensor_range_mod},'flat',id,mapValue(dmodPrefix+'HighResSensors',size));if(smod){const value=R.effectConstants[dmodPrefix+'HighResSensors'].combatHullSizeMap[size];check(typeof value==='number','Missing sensor S-mod hull size');mod(s,'sightRadiusMod','flat',id,f(Math.trunc(value)));}},
 'com.fs.starfarer.api.impl.hullmods.PhaseField':(s,id)=>mod(s,'sensorProfile','mult',id,constants(dmodPrefix+'PhaseField').PROFILE_MULT),
 'data.hullmods.AuxiliaryThrusters':(s,id,size,smod)=>{const c=constants('data.hullmods.AuxiliaryThrusters');for(const key of ['acceleration','turnAcceleration'])mod(s,key,'percent',id,f(c.MANEUVER_BONUS*2));for(const key of ['deceleration','maxTurnRate'])mod(s,key,'percent',id,c.MANEUVER_BONUS);if(smod){put(originalMemberDynamicStat(s,'zero_flux_boost_turn_rate_bonus_mult'),'mult',id,c.SMOD_TURN_MULT);mod(s,'zeroFluxSpeedBoost','flat',id,c.SMOD_SPEED_BONUS);}},
 'data.hullmods.BlastDoors':(s,id,size,smod)=>{const c=constants('data.hullmods.BlastDoors');mod(s,'hullBonus','percent',id,c.HULL_BONUS);mod(s,'crewLossMult','mult',id,minusPercent(f(c.CASUALTY_REDUCTION+(smod?c.SMOD_BONUS:0))));},
 'data.hullmods.ExpandedMissileRacks':(s,id,size,smod)=>{const c=constants('data.hullmods.ExpandedMissileRacks');mod(s,'missileAmmoBonus','percent',id,c.AMMO_BONUS);if(smod)mod(s,'missileRoFMult','mult',id,c.SMOD_ROF_MULT);},
 'data.hullmods.HeavyArmor':(s,id,size,smod)=>{mod(s,'armorBonus','flat',id,mapValue('data.hullmods.HeavyArmor',size));if(smod)for(const key of ['acceleration','deceleration','turnAcceleration','maxTurnRate'])mod(s,key,'mult',id,minusPercent(constants('data.hullmods.HeavyArmor').SMOD_MANEUVER_PENALTY));},
 'data.hullmods.IntegratedTargetingUnit':(s,id,size)=>{const value=mapValue('data.hullmods.IntegratedTargetingUnit',size);mod(s,'ballisticWeaponRangeBonus','percent',id,value);mod(s,'energyWeaponRangeBonus','percent',id,value);},
 'data.hullmods.CivGrade':(s,id)=>{const c=constants('data.hullmods.CivGrade');mod(s,'sensorProfile','percent',id,c.PROFILE_INCREASE);mod(s,'sensorStrength','mult',id,minusPercent(c.STRENGTH_DECREASE));},
 [dmodPrefix+'DegradedShields']:(s,id)=>{mod(s,'shieldDamageTakenMult','percent',id,f(constants(dmodPrefix+'DegradedShields').SHIELD_PERCENT*dynValue(s,'dmod_effect_mult')));dmodCost(s,id);},
 [dmodPrefix+'ErraticInjector']:(s,id)=>{const c=constants(dmodPrefix+'ErraticInjector'),e=dynValue(s,'dmod_effect_mult');mod(s,'fuelUseMod','percent',id,f(c.FUEL_PERCENT*e));mod(s,'zeroFluxSpeedBoost','flat',id,f(-c.ZERO_FLUX_PENALTY*e));dmodCost(s,id);},
 [dmodPrefix+'FaultyAutomatedSystems']:(s,id)=>{const c=constants(dmodPrefix+'FaultyAutomatedSystems'),e=dynValue(s,'dmod_effect_mult');mod(s,'minCrewMod','percent',id,f(c.CREW_PERCENT*e));mod(s,'maxCombatReadiness','flat',id,f(f(-round(f(f(c.MAX_CR_PENALTY*e)*100)))*f(0.01)));dmodCost(s,id);},
 [dmodPrefix+'IncreasedMaintenance']:(s,id)=>{const c=constants(dmodPrefix+'IncreasedMaintenance'),e=dynValue(s,'dmod_effect_mult');mod(s,'suppliesPerMonth','percent',id,f(round(f(f(f(c.SUPPLY_USE_MULT-1)*e)*100))));mod(s,'minCrewMod','percent',id,f(c.CREW_PERCENT*e));mod(s,'maxCombatReadiness','flat',id,f(f(-round(f(f(c.MAX_CR_PENALTY*e)*100)))*f(0.01)));dmodCost(s,id);},
 [dmodPrefix+'CompromisedStructure']:(s,id)=>{const c=constants(dmodPrefix+'CompromisedStructure'),e=dynValue(s,'dmod_effect_mult');mod(s,'armorBonus','mult',id,f(c.ARMOR_PENALTY_MULT+f(f(1-c.ARMOR_PENALTY_MULT)*f(1-e))));mod(s,'hullBonus','mult',id,f(c.HULL_PENALTY_MULT+f(f(1-c.HULL_PENALTY_MULT)*f(1-e))));dmodCost(s,id);},
};
export function applyOriginalMemberHullmods(member,plugins={},fleet=null){
 const v=variant(member),size=hull(member).hullSize;
 for(const id of v.effects.hullMods){check(Object.hasOwn(R.hullmodScripts,id),'Unloaded hullmod: '+id);const script=R.hullmodScripts[id];if(script===null)continue;const handler=Object.hasOwn(plugins,script)?plugins[script]:hullmodHandlers[script];check(typeof handler==='function','Unported active hullmod effect: '+script);invoke(handler,member.stats,id,size,v.effects.sMods.includes(id)||v.effects.sModdedBuiltIns.includes(id),member,fleet);}
}
/** Apply one real beforeCreation handler to a temporary, variant-only MutableShipStats. */
export function applyOriginalVariantHullmod(stats,v,id,plugins={}){
 check(stats?.scope==='native-variant-ship-stats'&&stats.variant===v&&stats.fleetMember===null&&stats.entity===null,'Actual variant-only hullmod context required');
 check(Object.hasOwn(R.hullmodScripts,id),'Unloaded hullmod: '+id);const script=R.hullmodScripts[id];if(script===null)return;
 const handler=Object.hasOwn(plugins,script)?plugins[script]:hullmodHandlers[script];check(typeof handler==='function','Unported variant hullmod effect: '+script);
 const size=R.hulls[v.hullId]?.hullSize;check(size,'Actual variant hull size required');invoke(handler,stats,id,size,v.effects.sMods.includes(id)||v.effects.sModdedBuiltIns.includes(id),null,null);
}
/** Allocate the native OP-only effect set; caching belongs to HullVariantSpec, not FleetMember. */
export function createOriginalVariantOPStats(member,plugins={}){
 const v=variant(member),s=createOriginalVariantShipStats(v);let affected=false;
 for(const id of v.effects.hullMods){const info=R.hullmodLifecycle[id];check(info&&typeof info.affectsOPCosts==='boolean','Actual OP lifecycle metadata required');if(!info.affectsOPCosts)continue;affected=true;applyOriginalVariantHullmod(s,v,id,plugins);}
 return affected?s:null;
}
function mothball(member){const s=member.stats,id='mothballed_mod_id';for(const key of ['suppliesPerMonth','cargoMod','fuelMod','maxCrewMod','minCrewMod']){if(member.repairTracker.mothballed)mod(s,key,'mult',id,key==='suppliesPerMonth'?R.settings.supplyConsumptionMothballedMult:0);else unmod(s,key,id);}}
export function originalMemberPlayerCommander(member,fleet){if(member.fleetCommanderForStatsRef===null)return false;check(fleet&&typeof member.fleetCommanderForStatsRef==='string'&&typeof fleet.playerPersonRef==='string','Actual commander override/player identity required');return person(fleet,member.fleetCommanderForStatsRef).objectRef===fleet.playerPersonRef;}
/** Full FleetMember.updateStats for supported active scripts, not the whole fleet/buff/logistics lifecycle. */
export function updateOriginalMemberStats(member,fleet,{skills={},hullmods={}}={}){
 member.cachedStrength=-1;check(typeof member.forceNoMoreStatsUpdates==='boolean','Actual force-no-stats flag required');if(member.forceNoMoreStatsUpdates)return;
 if(member.repairTracker===null)return;
 if(member.type==='NULL'&&member.variant===null){member.statUpdateNeeded=false;member.stats=null;member.valuationLifecycle='null-member';return;}
 const v=variant(member);check(member.fleetDataRef===null||fleet&&member.fleetDataRef===fleet.dataRef,'Member belongs to another FleetData');member.statUpdateNeeded=false;member.stats=createOriginalFleetMemberStats(member);member.stats.lifecycle='rebuilding';member.stats.fleetMemberRef=member.objectRef;member.stats.variantRef=v.objectRef;
 if(member.captainRef!==null){check(typeof member.captainRef==='string','Actual captain state required');if(member.fleetDataRef!==null&&fleet.members!==null)applyOriginalCharacterShipEffects(person(fleet,member.captainRef).stats,member,'SHIP',skills);}
 const commander=member.fleetCommanderForStatsRef??(member.fleetDataRef===null?null:originalFleetCommanderRef(fleet));
 if(commander!==null)applyOriginalCharacterShipEffects(person(fleet,commander).stats,member,'ALL_SHIPS_IN_FLEET',skills);
 applyOriginalMemberHullmods(member,hullmods,fleet);
 mod(member.stats,'fluxCapacity','flat','flux_capacitors',f(f(v.effects.fluxCapacitors)*R.settings.fluxPerCapacitor));mod(member.stats,'fluxDissipation','flat','flux_vents',f(f(v.effects.fluxVents)*R.settings.dissipationPerVent));
 updateOriginalMemberCrewAndCRStats(member,fleet,{playerCommander:originalMemberPlayerCommander(member,fleet)});mothball(member);removeOriginalUnmodifiedMemberDynamics(member.stats);updateOriginalMemberRepairRates(member);
 if(Math.trunc(effective(member.stats.fighterBays))<=0)v.wings.length=0;
 if(member.fleetDataRef!==null)fleet.synchronization.needsSync=true;
 member.stats.lifecycle='current';member.valuationLifecycle='current-fleet-variant';
}
export function applyOriginalCommanderFleetwideStats(member,fleet){const commander=member.fleetCommanderForStatsRef??originalFleetCommanderRef(fleet);if(commander!==null)applyOriginalCharacterShipEffects(person(fleet,commander).stats,member,'ALL_SHIPS_IN_FLEET');}
export function setOriginalCommanderStatsFleet(commanderRef,fleet){person(fleet,commanderRef).stats.fleetRef=fleet.attachedToCampaignFleet?fleet.objectRef:null;}

/** FleetMember.getStats rebuilds dirty stats before consumers apply buffs or read sensors. */
export function getOriginalMemberStats(member,fleet){if(member.statUpdateNeeded)updateOriginalMemberStats(member,fleet);check(member.stats?.lifecycle==='current','Current native member stats required');return member.stats;}
