/** ModularFleetAI construction and real frame dispatch. Built-in strategic/tactical frames remain explicit services. */
import {requireThat} from '../core/Values.mjs';
import {createOriginalCampaignInterval,validateOriginalCampaignInterval} from './OriginalCampaignInterval.mjs';
import {createOriginalTimeoutTracker,validateOriginalTimeoutTracker} from './OriginalTimeoutTracker.mjs';
import {originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MODULAR_FLEET_AI',m);
function call(s,k,...a){check(typeof s?.[k]==='function','Actual modular fleet AI service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Modular fleet AI services must be synchronous');return v;}
function scalar(n){check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Actual finite AI time required');return f(n);}
const moduleFields={navigation:'navModule',assignment:'assignmentModule',strategic:'strategicModule',tactical:'tacticalModule'};
export function createOriginalModularFleetAI(objectRef,fleet,services){
 check(typeof objectRef==='string'&&objectRef.length>0&&fleet&&typeof fleet.objectRef==='string','Actual new AI and fleet identities required');
 const ai={scope:'native-modular-fleet-ai',objectRef,fleet,navModule:null,assignmentModule:null,strategicModule:null,tacticalModule:null,abilityAI:[],noAIAbilities:[],actionTextProvider:null,actionTextOverride:null};
 for(const kind of ['navigation','assignment','strategic','tactical']){let module=call(services,'pickFleetAIModule',kind,fleet,ai);check(module===null||module&&typeof module==='object','Actual chosen module or known null required');
  if(module===null){const base={scope:'native-fleet-ai-'+kind,objectRef:objectRef+':'+kind,fleet};
   if(kind==='navigation')module={...base,avoiding:createOriginalTimeoutTracker(),doNotAvoid:createOriginalTimeoutTracker(),destination:[0,0],clickLocation:[0,0],hasDest:false};
   else if(kind==='assignment')module={...base,assignments:[],fr:null};
   else{validateOriginalJavaRandom(services.globalRandom);const random=()=>originalJavaNextDouble(services.globalRandom);
    if(kind==='strategic')module={...base,ai,currJumpPlan:null,avoidTracker:{...createOriginalCampaignInterval(.5,1.5,random),scope:'native-api-interval-util',random:null},doNotAttack:createOriginalTimeoutTracker(),recentlyStoppedPursuing:createOriginalTimeoutTracker()};
    else{const tracker=createOriginalCampaignInterval(.05,.1,random);tracker.elapsed=tracker.currInterval;module={...base,ai,tracker,travelDest:null,priorityTarget:null,travelDur:0,targetDur:0,target:null,largestEnemy:null,pursueDuration:0,pursuitDays:0,beforeSearchPattern:0,plan:null,followMode:false,isFleeing:false,isMaintainingContact:false,slowDown:false,didSlowDownBark:false,currentTerrain:[],optionCache:{scope:'native-timeout-tracker-map',items:[]}};}
   }
  }
  check(typeof module.objectRef==='string'&&module.objectRef.length>0,'Actual module identity required');ai[moduleFields[kind]]=module;
 }
 return validateOriginalModularFleetAI(ai,fleet);
}
export function validateOriginalModularFleetAI(ai,fleet=ai?.fleet){
 check(ai?.scope==='native-modular-fleet-ai'&&typeof ai.objectRef==='string'&&ai.fleet===fleet&&fleet&&typeof fleet.objectRef==='string','Lost ModularFleetAI fleet identity');
 for(const [kind,key]of Object.entries(moduleFields)){const m=ai[key];check(m&&typeof m.objectRef==='string','Actual retained '+kind+' module required');if(m.scope!=='native-fleet-ai-'+kind)continue;check(m.fleet===fleet,'Lost native '+kind+' fleet identity');if(kind==='strategic'||kind==='tactical')check(m.ai===ai,'Lost native '+kind+' parent AI identity');
  if(kind==='navigation'){validateOriginalTimeoutTracker(m.avoiding);validateOriginalTimeoutTracker(m.doNotAvoid);for(const key of ['destination','clickLocation'])check(Array.isArray(m[key])&&m[key].length===2&&m[key].every(n=>scalar(n)===n),'Actual navigation vector required');check(typeof m.hasDest==='boolean','Actual destination flag required');}
  if(kind==='assignment')check(Array.isArray(m.assignments)&&(m.fr===null||typeof m.fr==='boolean'),'Actual assignments/freeze history required');
  if(kind==='strategic'){check(m.avoidTracker?.scope==='native-api-interval-util'&&Object.hasOwn(m.avoidTracker,'random'),'Actual IntervalUtil history required');validateOriginalCampaignInterval({...m.avoidTracker,scope:'native-campaign-interval-tracker'});if(m.avoidTracker.random!==null)validateOriginalJavaRandom(m.avoidTracker.random);validateOriginalTimeoutTracker(m.doNotAttack);validateOriginalTimeoutTracker(m.recentlyStoppedPursuing);}
  if(kind==='tactical'){validateOriginalCampaignInterval(m.tracker);check(Array.isArray(m.currentTerrain)&&m.optionCache?.scope==='native-timeout-tracker-map'&&Array.isArray(m.optionCache.items),'Actual tactical caches required');}
 }
 check(Array.isArray(ai.abilityAI)&&ai.abilityAI.every(r=>Array.isArray(r)&&r.length===2&&typeof r[0]==='string'&&r[1]&&typeof r[1]==='object')&&new Set(ai.abilityAI.map(r=>r[0])).size===ai.abilityAI.length,'Actual ordered ability AI map required');check(Array.isArray(ai.noAIAbilities)&&ai.noAIAbilities.every(x=>typeof x==='string')&&new Set(ai.noAIAbilities).size===ai.noAIAbilities.length,'Actual no-AI ability set required');return ai;
}
export function advanceOriginalModularFleetAI(ai,seconds,services){
 validateOriginalModularFleetAI(ai);seconds=scalar(seconds);check(Object.hasOwn(ai.fleet,'battle'),'Actual nullable fleet battle required');if(ai.fleet.battle!==null)return;
 const days=scalar(call(services,'convertAIDays',seconds));for(const kind of ['assignment','strategic','tactical','navigation'])call(services,'advanceFleetAIModule',kind,ai[moduleFields[kind]],days,ai);
 const abilities=call(services,'readFleetAIAbilities',ai.fleet);check(Array.isArray(abilities),'Actual ordered ability map copy required');const snapshot=[...abilities],processed=new Set();
 for(const ability of snapshot){check(ability&&typeof ability.id==='string','Actual ability ID required');const id=ability.id;if(ai.noAIAbilities.includes(id))continue;processed.add(id);let item=ai.abilityAI.find(r=>r[0]===id)?.[1]??null;
  if(item===null){item=call(services,'pickFleetAbilityAI',ability,ai);check(item===null||item&&typeof item==='object','Actual nullable ability AI required');if(item===null)ai.noAIAbilities.push(id);else ai.abilityAI.push([id,item]);}
  if(item===null)continue;const exists=call(services,'fleetHasAIAbility',ai.fleet,id);check(typeof exists==='boolean','Actual ability membership required');if(exists)call(services,'advanceFleetAbilityAI',item,days,ability,ai);
 }
 // Native only removes IDs in this snapshot that were not processed, not every absent ability.
 for(const ability of snapshot)if(!processed.has(ability.id)){const at=ai.abilityAI.findIndex(r=>r[0]===ability.id);if(at>=0)ai.abilityAI.splice(at,1);}
}
/** Actual String/name/boolean factory sequence. Construct service returns the current registered FleetData binding. */
export function createOriginalNamedEmptyFleet(factionId,name,aiMode,services){
 check(typeof factionId==='string'&&factionId.length>0&&(name===null||typeof name==='string')&&typeof aiMode==='boolean','Actual empty-fleet factory arguments required');const faction=call(services,'readFactoryFaction',factionId);check(faction&&faction.factionId===factionId,'Actual registered factory faction required');const binding=call(services,'constructFactoryFleet',faction,aiMode),fleet=binding?.fleet;check(fleet?.campaign,'Actual constructed CampaignFleet required');
 const ai=call(services,'createFactoryFleetAI',fleet);check(ai&&typeof ai==='object'&&typeof ai.objectRef==='string','Actual ModularFleetAI required');fleet.campaign.ai=ai;fleet.name=name;const commander=call(services,'readFactoryFleetCommander',fleet);check(commander&&typeof commander==='object','Actual default fleet commander required');commander.factionId=factionId;return binding;
}
