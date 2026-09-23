import {initializeOriginalCharacterExperience,validateOriginalCharacterExperience} from './OriginalCharacterExperience.mjs';
import {originalFleetCommanderRef} from './OriginalFleetCommander.mjs';
/** CharacterStats.readResolve/refresh. World callbacks are real synchronous services, never optional no-ops. */
import R from '../data/reference-fleet-sync.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {put,stat} from './OriginalIndustryState.mjs';
import {originalNativeFleetDynamicMod,originalNativeFleetDynamicStat,restoreOriginalNativeStatTargets} from './OriginalNativeFleetStats.mjs';
const C=R.character,f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CHARACTER_STATS',m);
const prefix='com.fs.starfarer.api.impl.campaign.skills.',blank=()=>({flat:[],percent:[],mult:[]});
const number=(n,label)=>{check(typeof n==='number'&&Number.isFinite(n)&&f(n)===n,'Actual native float required: '+label);return n;};
const constant=(script,key)=>number(C.constants[prefix+script]?.[key],script+'.'+key);
const round=n=>Math.max(-2147483648,Math.min(2147483647,Math.floor(n+0.5)));
function call(services,name,...args){check(typeof services?.[name]==='function','Actual character lifecycle service required: '+name);const result=services[name](...args);check(!result||typeof result.then!=='function','Character lifecycle must be synchronous: '+name);return result;}
function createField(s,key,base){const objectRef='created:'+s.objectRef+':'+key,value=base===null?blank():{base,modifiers:blank()};s[key]=value;s.fields[key]=objectRef;s.targets.push({objectRef,kind:base===null?'bonus':'mutable',value,temporary:[]});}
/** The rebuilt scalar fields alone are not a completed readResolve. Saved repair/command/dynamic targets may replace these handles before refresh. */
export function createOriginalCharacterStats(objectRef){
 check(typeof objectRef==='string'&&objectRef.length>0,'Character identity required');
 const s={objectRef,nativeCharacterStatsVersion:1,lifecycle:'native-read-resolve-pending',skipRefresh:false,skills:[],aptitudes:[],fleetRef:null,fields:{},dynamic:{},dynamicStats:{},dynamicRefs:{mods:{},stats:{}},targets:[],tempMods:[]};
 for(const [key,base]of Object.entries(C.defaults))createField(s,key,base);return s;
}
export function restoreOriginalCharacterStats(s){
 check(s?.nativeCharacterStatsVersion===1,'Complete native character stat capture required');
 restoreOriginalNativeStatTargets(s,C.defaults);validateOriginalCharacterStats(s);return s;
}
export function validateOriginalCharacterStats(s){
 if(s?.nativeExperienceVersion===1)validateOriginalCharacterExperience(s);
 check(s?.nativeCharacterStatsVersion===1&&['native-read-resolve-pending','resolving','current'].includes(s.lifecycle),'Invalid native character lifecycle');validateLevels(s);
 const targets=new Map(s.targets.map(t=>[t.objectRef,t]));check(targets.size===s.targets.length,'Duplicate character stat identity');
 for(const key of Object.keys(C.defaults))check(targets.get(s.fields[key])?.value===s[key],'Lost shared character field: '+key);
 for(const [space,values]of [['mods',s.dynamic],['stats',s.dynamicStats]])for(const [key,ref]of Object.entries(s.dynamicRefs[space]))check(targets.get(ref)?.value===values[key],'Lost shared character dynamic target');
 return s;
}
function validateLevels(s){
 check(typeof s.skipRefresh==='boolean'&&Array.isArray(s.skills)&&Array.isArray(s.aptitudes),'Actual ordered character skills/aptitudes required');
 const seen=new Set();for(const row of s.skills){check(Object.hasOwn(R.skills,row.skillId)&&!seen.has(row.skillId),'Unknown/duplicate character skill');seen.add(row.skillId);number(row.level,'skill level');}
 seen.clear();for(const a of s.aptitudes){check(C.aptitudes.some(row=>row.id===a.aptitudeId)&&!seen.has(a.aptitudeId),'Unknown/duplicate aptitude');seen.add(a.aptitudeId);number(a.level,'aptitude level');check(Number.isInteger(a.maxTier)&&a.maxTier>=0,'Invalid aptitude tier');}
}
// Each operation records unapply's exact channel. "all" clears all channels for that source.
const op=(target,channel,value,remove='all',description=null)=>({target,channel,value,remove,description});
const k=(script,key)=>constant(script,key),pct=(script,key)=>f(k(script,key)*f(0.01));
const effects={
 'BestOfTheBest$Level2':[op('mod:deployment_points_min_fraction_of_battle_size_bonus_mod','flat',k('BestOfTheBest','DEPLOYMENT_BONUS'),'flat')],
 'ColonyManagement$Level1':[op('outpostNumber','flat',k('ColonyManagement','COLONY_NUM_BONUS'))],
 'ColonyManagement$Level2':[op('adminNumber','flat',k('ColonyManagement','ADMINS'))],
 'ContainmentProcedures$Level3':[op('stat:fuel_salvage_value_mult_fleet','flat',pct('ContainmentProcedures','FUEL_SALVAGE_BONUS'))],
 'ContainmentProcedures$Level2':[op('stat:emergency_burn_mult','mult',0)],
 'CyberneticAugmentation$Level1':[op('mod:officer_max_elite_skills_mod','flat',k('CyberneticAugmentation','MAX_ELITE_SKILLS_BONUS'))],
 'FieldRepairs$Level5A':[op('mod:ship_recovery_hull_min','flat',f(0.29999998)),op('mod:ship_recovery_hull_max','flat',f(0.39999998))],
 'FieldRepairs$Level5B':[op('mod:ship_recovery_cr_min','flat',f(0.29999998)),op('mod:ship_recovery_cr_max','flat',f(0.39999998))],
 'FluxRegulation$Level2':[op('maxCapacitorsBonus','flat',k('FluxRegulation','CAPACITORS_BONUS'))],
 'FluxRegulation$Level3':[op('maxVentsBonus','flat',k('FluxRegulation','VENTS_BONUS'))],
 'ForceConcentration$Level2':[],
 'ForceConcentration$Level3':[op('mod:can_deploy_left_right','flat',1,'flat')],
 'ForceConcentration$Level4':[op('stat:command_point_rate','flat',f(k('ForceConcentration','COMMAND_POINT_REGEN_PERCENT')/100))],
 'HullRestoration$Level1':[op('mod:ship_recovery_mod','flat',k('HullRestoration','RECOVERY_PROB'))],
 'HullRestoration$Level4A':[],'HullRestoration$Level4B':[],
 'IndustrialPlanning$Level1':[op('mod:supply_bonus','flat',k('IndustrialPlanning','SUPPLY_BONUS'),'flat')],
 'IndustrialPlanning$Level2':[op('mod:custom_production_mod','mult',f(1+f(k('IndustrialPlanning','CUSTOM_PRODUCTION_BONUS')/100)),'mult','工业规划')],
 'MakeshiftEquipment$Level1':[op('stat:survey_cost_mult','mult',k('MakeshiftEquipment','SURVEY_COST_MULT'),'mult','临时设备')],
 'Navigation$Level1':[op('stat:nav_penalty_mult','flat',f(f(-0.01)*k('Navigation','TERRAIN_PENALTY_REDUCTION')))],
 'Navigation$Level3A':[op('fleetwideMaxBurnMod','flat',k('Navigation','FLEET_BURN_BONUS'),'flat','精准导航')],
 'Navigation$Level3B':[op('mod:sustained_burn_bonus','flat',k('Navigation','SB_BURN_BONUS'),'flat')],
 'OfficerManagement$Level1':[op('officerNumber','flat',k('OfficerManagement','NUM_OFFICERS_BONUS'))],
 'OfficerManagement$Level1B':[op('commandPoints','flat',k('OfficerManagement','CP_BONUS'))],
 'OfficerTraining$Level1':[op('mod:officer_max_level_mod','flat',1)],
 'OfficerTraining$Level2':[op('mod:officer_max_elite_skills_mod','flat',1)],
 'OfficerTraining$Level3':[op('commandPoints','flat',2)],
 'PlanetaryOperations$Level3':[op('mod:ground_attack_mod','percent',k('PlanetaryOperations','ATTACK_BONUS'),'percent','地面行动')],
 'PlanetaryOperations$Level4':[op('stat:ground_attack_casualties_mult','mult',k('PlanetaryOperations','CASUALTIES_MULT'),'mult','地面行动')],
 'Salvaging$Level1':[op('stat:salvage_value_bonus_fleet_not_rare','flat',pct('Salvaging','SALVAGE_BONUS'),'all','打捞技术')],
 'Salvaging$Level3':[op('stat:battle_salvage_value_bonus_fleet','flat',f(0.19999999))],
 'Salvaging$Level5':[op('stat:overall_crew_loss_mult','mult',f(1-f(k('Salvaging','CREW_LOSS_REDUCTION')/100)))],
 'Sensors$Level1':[op('detectedRangeMod','mult',f(1-f(k('Sensors','DETECTED_BONUS')/100)),'all','传感探测')],
 'Sensors$Level2':[op('sensorRangeMod','percent',k('Sensors','SENSOR_BONUS'),'all','传感探测')],
 'Sensors$Level3':[op('mod:move_slow_speed_bonus_mod','flat',k('Sensors','SLOW_BURN_BONUS'),'flat')],
 'SpecialModifications$Level1':[op('maxCapacitorsBonus','flat',k('SpecialModifications','CAPACITORS_BONUS'))],
 'SpecialModifications$Level2':[op('maxVentsBonus','flat',k('SpecialModifications','VENTS_BONUS'))],
 'TacticalDrills$Level2':[op('mod:ground_attack_mod','percent',k('TacticalDrills','ATTACK_BONUS'),'percent','战术演练')],
 'TacticalDrills$Level3':[op('stat:ground_attack_casualties_mult','mult',k('TacticalDrills','CASUALTIES_MULT'),'mult','战术演练')],
};
function applyOperation(s,id,o,remove){
 const value=o.target.startsWith('mod:')?originalNativeFleetDynamicMod(s,o.target.slice(4)):o.target.startsWith('stat:')?originalNativeFleetDynamicStat(s,o.target.slice(5)):s[o.target];
 const handle=s.targets.find(t=>t.value===value);check(handle,'Actual shared character/fleet stat target required: '+o.target);
 const target=value.modifiers?value:{modifiers:value};
 for(const channel of remove?(o.remove==='all'?['flat','percent','mult']:[o.remove]):[o.channel]){
  put(target,channel,id,remove?0:o.value,remove);
  if(remove){if(handle.descriptions?.[channel])delete handle.descriptions[channel][id];}
  else if(target.modifiers[channel].some(m=>m.id===id)){handle.descriptions??={flat:{},percent:{},mult:{}};if(o.description!==null)handle.descriptions[channel][id]=o.description;else delete handle.descriptions[channel][id];}
 }
}
/** Uses the real FleetData cache and getters; absent fleet is the native maximum case, missing evidence is not. */
function thresholdBonus(s,world,services,key,max,type){
 if(s.fleetRef===null)return max;const fleet=world.fleet;check(fleet?.objectRef===s.fleetRef,'Actual character fleet required');
 if(fleet.dataRef===null)return max;check(fleet.cacheClearedOnSync&&typeof fleet.cacheClearedOnSync==='object','Actual fleet cache required');
 if(Object.hasOwn(fleet.cacheClearedOnSync,key)&&fleet.cacheClearedOnSync[key]!==null)return number(fleet.cacheClearedOnSync[key],'cached skill bonus');
 let value=0;const members=call(services,'readFleetMembers',fleet);check(Array.isArray(members),'Actual fleet members required');
 for(const m of members){check(typeof m.repairTracker?.mothballed==='boolean','Actual member mothball flag required');if(m.repairTracker.mothballed)continue;if(type==='militarized'){check(Array.isArray(m.variant?.effects?.hullMods),'Actual member hullmod list required');if(!m.variant.effects.hullMods.includes('militarized_subsystems'))continue;}value=f(value+number(call(services,'readMemberDeploymentPoints',m,fleet),'deployment points'));}
 value=f(round(value));const threshold=C.thresholds[type];let bonus=f(f(max*threshold)/Math.max(value,threshold));
 if(bonus>0&&bonus<1)bonus=1;if(max>1){if(bonus<max)bonus=Math.min(bonus,f(max-1));bonus=f(round(bonus));}fleet.cacheClearedOnSync[key]=bonus;return bonus;
}
function invokeEffect(s,e,remove,world,services,level){
 const target=e.type==='FLEET'?world.fleet?.stats:s;if(e.type==='FLEET'&&target==null)return;
 const custom=services.effects?.[e.script];if(custom){call({effect:custom},'effect',target,e.id,level,remove,{character:s,world});return;}
 const name=e.script.slice(prefix.length);let operations;
 if(name==='AutomatedShips$Level2'){if(world.isPlayer)call(services,'changeAllowedRecoveryTag','auto_rec',!remove);return;}
 if(name==='NeuralLink$Level1'){if(!world.isPlayer)return;operations=[op('mod:has_neural_link','flat',1,'flat')];}
 else if(name==='AuxiliarySupport$Level1')operations=[op('mod:auxiliary_effect_add_percent','flat',remove?0:thresholdBonus(s,world,services,'aux_effect',k('AuxiliarySupport','AUXILIARY_EFFECT_BONUS'),'militarized'),'flat')];
 else if(name==='FieldRepairs$Level1')operations=[op('repairRateMult','percent',remove?0:thresholdBonus(s,world,services,'fr_repRate',50,'all'))];
 else{check(Object.hasOwn(effects,name),'Unported character effect: '+e.script);operations=effects[name];}
 for(const operation of operations)applyOperation(target,e.id,operation,remove);
}
/** Global before -> clear all registered effects -> tiers -> active character -> fleet -> player colonies -> player after. */
export function refreshOriginalCharacterStats(s,world,services,refreshOutposts=true){
 check(s?.nativeCharacterStatsVersion===1,'Complete character stats required');validateLevels(s);check(typeof refreshOutposts==='boolean','Explicit colony refresh option required');if(s.skipRefresh)return {skipped:true};
 check(typeof world?.isPlayer==='boolean'&&Object.hasOwn(world,'fleet'),'Actual character world context required');check(s.fleetRef===null?world.fleet===null:world.fleet?.objectRef===s.fleetRef,'Character fleet identity mismatch');
 call(services,'reportBeforeCharacterStatsRefresh',s,world);
 for(const e of C.refreshEffects)invokeEffect(s,e,true,world,services,0);
 const tiers=new Map(),levels=new Map(s.skills.map(row=>[row.skillId,row.level]));
 for(const row of s.skills){const m=C.skillMetadata[row.skillId];if(!m.aptitudeEffect&&row.level>0)tiers.set(m.aptitude,Math.max(tiers.get(m.aptitude)??0,m.tier));}
 for(const a of s.aptitudes)a.maxTier=tiers.get(a.aptitudeId)??0;
 const applied=[];for(const type of ['CHARACTER_STATS','FLEET'])for(const row of s.skills)for(const e of R.skills[row.skillId]){const level=levels.get(e.governingSkill)??0;if(e.type!==type||level<e.requiredLevel||type==='FLEET'&&world.fleet?.stats==null)continue;const entry={...e,skillId:row.skillId,id:row.skillId+'_stats_'+e.index};invokeEffect(s,entry,false,world,services,level);applied.push(entry.id);}
 if(world.isPlayer&&refreshOutposts)call(services,'refreshPlayerOutposts',s,world);
 if(world.isPlayer)call(services,'reportAfterCharacterStatsRefresh',s,world);
 return {skipped:false,unapplied:C.refreshEffects.length,applied};
}
export function setOriginalCharacterSkillLevel(s,skillId,level,world,services){
 check(Object.hasOwn(R.skills,skillId),'Unknown skill');number(level,'skill level');let row=s.skills.find(e=>e.skillId===skillId);if(!row){row={skillId,level};s.skills.push(row);}else row.level=level;return refreshOriginalCharacterStats(s,world,services);
}
export function setOriginalCharacterAptitudeLevel(s,aptitudeId,level,world,services){
 const spec=C.aptitudes.find(a=>a.id===aptitudeId);check(spec,'Unknown aptitude');number(level,'aptitude level');let row=s.aptitudes.find(a=>a.aptitudeId===aptitudeId),created=false;if(!row){created=true;row={aptitudeId,level,maxTier:0};}else row.level=level;
 // Native adds a missing aptitude AFTER setSkillLevel's refresh, not before it.
 if(spec.effectSkill!==null)setOriginalCharacterSkillLevel(s,spec.effectSkill,level,world,services);if(created)s.aptitudes.push(row);
}
export function readResolveOriginalCharacterStats(s,world,services){
 check(s?.lifecycle==='native-read-resolve-pending','Character readResolve must run exactly once');restoreOriginalCharacterStats(s);s.lifecycle='resolving';
 for(const a of C.aptitudes)if(!s.aptitudes.some(row=>row.aptitudeId===a.id))setOriginalCharacterAptitudeLevel(s,a.id,0,world,services);
 const result=refreshOriginalCharacterStats(s,world,services);s.lifecycle='current';return result;
}

/** Read the commander's shared CharacterStats, not an independently copied bonus. */
export function originalNativeCommanderStats(fleet){
 const ref=originalFleetCommanderRef(fleet);check(ref!==null,'Actual fleet commander required');const person=fleet.statPeople?.find(p=>p.objectRef===ref),s=person?.stats;
 check(s?.nativeCharacterStatsVersion===1&&['resolving','current'].includes(s.lifecycle),'Commander CharacterStats readResolve remains pending');return s;
}

/** Native new CharacterStats(), distinct from saved-object readResolve: constructor refreshes are suppressed. */
export function constructOriginalCharacterStats(objectRef){
 const s=createOriginalCharacterStats(objectRef);s.skipRefresh=true;
 for(const aptitude of C.aptitudes)setOriginalCharacterAptitudeLevel(s,aptitude.id,0,null,{});
 s.skipRefresh=false;s.lifecycle='current';s.level=1;return initializeOriginalCharacterExperience(s);
}

/** DynamicStats.getValue uses mods, does not allocate, and never reads the stats namespace. */
export function originalNativeCharacterDynamicValue(s,key,base=0){
 check(s?.nativeCharacterStatsVersion===1&&['resolving','current'].includes(s.lifecycle),'Current character readResolve required before dynamic getters');
 check(typeof key==='string'&&key.length>0,'Actual dynamic modifier key required');number(base,'dynamic default');
 return Object.hasOwn(s.dynamic,key)?stat({base,modifiers:s.dynamic[key]}):base;
}
export function originalNativeCharacterOutpostLimit(s){
 check(s?.nativeCharacterStatsVersion===1&&['resolving','current'].includes(s.lifecycle),'Current player readResolve required before outpost getter');
 return round(stat(s.outpostNumber));
}
