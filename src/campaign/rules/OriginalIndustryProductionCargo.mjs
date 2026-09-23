/** BaseIndustry / TechMining gathering-point cargo. Mutates the real market Memory, RNG and returned Cargo. */
import raw from '../data/reference-industry-production-cargo.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
import {functional} from './OriginalIndustryState.mjs';
import {resolveOriginalEconomyMutable} from './OriginalMarketEconomy.mjs';
import {originalCampaignMemoryContains,originalCampaignMemoryGet,setOriginalCampaignMemory,validateOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
import {originalJavaNextFloat,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {originalFactionKnownEquipment} from './OriginalFactionEquipment.mjs';
import {originalPlayerAvailableHullmods} from './OriginalPlayerHullmods.mjs';
import {validateOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {updateOriginalFleetCargoSpace} from './OriginalFleetData.mjs';
export const ORIGINAL_INDUSTRY_PRODUCTION_CARGO=immutableJSON(raw);
export const ORIGINAL_TECH_MINING_MEMORY_KEY='$core_techMiningMult';
const R=ORIGINAL_INDUSTRY_PRODUCTION_CARGO,f=Math.fround;
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_INDUSTRY_PRODUCTION_CARGO',message);
function call(services,key,...args){check(typeof services[key]==='function','Actual industry cargo service required: '+key);const value=services[key](...args);check(!value||typeof value.then!=='function','Industry cargo services must be synchronous');return value;}
function finite(value,name){check(typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(f(value)),'Actual finite '+name+' required');return f(value);}
function strings(value){check(Array.isArray(value)&&value.every(id=>typeof id==='string'&&id.length>0),'Actual blueprint IDs required');return value;}

/** Market.hasCondition order, not condition magnitude or surveyed state. */
export function originalTechMiningRuinSizeModifier(conditions){
 check(Array.isArray(conditions)&&conditions.every(c=>typeof c?.id==='string'),'Actual market conditions required');
 for(const [id,value]of [['ruins_vast',1],['ruins_extensive',.6],['ruins_widespread',.35],['ruins_scattered',.2]])if(conditions.some(c=>c.id===id))return f(value);
 return 0;
}
/** No new tech lifecycle: use the exact shared Market.getMemoryWithoutUpdate instance. */
export function originalTechMiningMult(memory,services={}){
 validateOriginalCampaignMemory(memory);
 if(!originalCampaignMemoryContains(memory,ORIGINAL_TECH_MINING_MEMORY_KEY,services.memory)){
  setOriginalCampaignMemory(memory,ORIGINAL_TECH_MINING_MEMORY_KEY,1);return 1;
 }
 const value=originalCampaignMemoryGet(memory,ORIGINAL_TECH_MINING_MEMORY_KEY,services.memory);
 return finite(typeof value==='number'?value:call(services,'readIndustryProductionMemoryFloat',value),'Memory.getFloat value');
}

function known(context,kind,id,services){
 const faction=context.playerFaction;check(faction&&typeof faction.objectRef==='string'&&typeof faction.factionId==='string','Actual player Faction required');
 if(kind==='ship'){
  if(services.isIndustryProductionBlueprintKnown)return knownOverride(context,kind,id,services);
  const state=context.shipSelection;check(state?.scope==='native-current-ship-selection','Actual ship-selection knowledge required');
  const row=state.factions.find(row=>row.factionId===faction.factionId&&row.objectRef===faction.objectRef);check(row,'Actual shared player faction ship membership required');return strings(row.knownShips).includes(id);
 }
 if(kind==='industry')return knownOverride(context,kind,id,services);
 if(kind==='hullmod'&&faction.factionId==='player'&&context.playerEconomy!==undefined){
  check(context.playerEconomy!==null,'Actual PlayerCharacterData required');return originalPlayerAvailableHullmods(context.playerEconomy,services.playerHullmods).includes(id);
 }
 return originalFactionKnownEquipment(faction,kind,services.factionEquipment).includes(id);
}
function knownOverride(context,kind,id,services){const value=call(services,'isIndustryProductionBlueprintKnown',context.playerFaction,kind,id);check(typeof value==='boolean','Actual Faction blueprint membership required');return value;}
function provider(stack,services){
 if(stack.type!=='SPECIAL')return null;
 const plugin=stack.plugin;check(plugin&&plugin.stack===stack,'Actual initialized special cargo plugin required');
 if(plugin.scope==='native-modspec-item-plugin'){
  check(plugin.itemId==='modspec'&&typeof plugin.modId==='string','Actual ModSpecItemPlugin required');return {kind:'hullmod',id:plugin.modId};
 }
 // These are the two actual local native plugin factories, neither implements BlueprintProviderItem.
 if(plugin.scope==='native-special-item-plugin'&&['com.fs.starfarer.api.campaign.impl.items.BaseSpecialItemPlugin','com.fs.starfarer.api.campaign.impl.items.ShroudedHullmodItemPlugin'].includes(plugin.classId))return null;
 // Other plugin implementations (including blueprint packages) must expose their real provider lists.
 const value=call(services,'readIndustryProductionBlueprints',stack);
 check(value===null||value?.kind==='blueprint'||value?.kind==='hullmod','Actual nullable BlueprintProviderItem / ModSpecItemPlugin result required');
 if(value?.kind==='hullmod')check(typeof value.id==='string'&&value.id.length>0,'Actual hullmod ID required');
 return value;
}
/** CargoData.removeStack removes this exact object, not removeItems/smallest matching stack, and leaves size intact. */
export function filterOriginalTechMiningCargo(cargo,context,services={}){
 validateOriginalResourceCargo(cargo);check(context&&context.playerFaction,'Actual player Faction context required');
 OUTER:for(const stack of [...cargo.slots]){
  if(stack===null||stack.type==='NULL')continue;
  const bp=provider(stack,services);if(bp===null)continue;
  if(bp.kind==='blueprint'){
   for(const [kind,key]of [['ship','ships'],['weapon','weapons'],['fighter','fighters'],['industry','industries']]){
    check(Object.hasOwn(bp,key),'Blueprint provider must return explicit nullable '+key);
    if(bp[key]===null)continue;for(const id of strings(bp[key]))if(!known(context,kind,id,services))continue OUTER;
   }
  }else if(!known(context,'hullmod',bp.id,services))continue;
  const index=cargo.slots.indexOf(stack);check(index>=0,'Lost actual salvage stack');cargo.slots.splice(index,1);updateOriginalFleetCargoSpace(cargo);
 }
 return cargo;
}
/** context is deliberately not read for BaseIndustry or a nonfunctional TechMining instance. */
export function generateOriginalIndustryProductionCargo(industry,random,context,services={}){
 const id=industry?.state?.industryId;check(typeof id==='string'&&Object.hasOwn(R.industries,id),'Actual registered vanilla industry required');
 if(R.industries[id].kind==='base-null')return null;
 if(!functional(industry.operating))return null;
 // Refuse the known missing nonempty generator before touching Memory/RNG; no empty-cargo substitute.
 check(typeof services.generateEncounterExtraDrops==='function','Actual nonempty SalvageEntity.generateSalvage service required: generateEncounterExtraDrops');
 check(context&&context.marketMemory&&context.techMiningMult,'Actual shared market Memory and dynamic tech_mining_mult required');
 validateOriginalJavaRandom(random);
 const mult=originalTechMiningMult(context.marketMemory,services),decay=R.techMiningDecay;
 let base=originalTechMiningRuinSizeModifier(context.conditions);
 setOriginalCampaignMemory(context.marketMemory,ORIGINAL_TECH_MINING_MEMORY_KEY,f(mult*decay));
 base=f(base*finite(resolveOriginalEconomyMutable(context.techMiningMult),'dynamic tech mining effectiveness'));
 const dropRandom=structuredClone(R.dropRandom),dropValue=structuredClone(R.dropValue);
 if(mult>=1){
  const num=Math.max(1,f(base*f(5+f(originalJavaNextFloat(random)*2))));
  // Java Math.round(float), including saturating conversion at Integer.MAX_VALUE.
  const chances=Math.min(2147483647,Math.floor(num+.5));
  dropRandom.push({chances,maxChances:-1,value:-1,valueMult:1,group:'techmining_first_find'});
 }
 // Existing six-argument bridge calls the native overload whose randomMult is exactly 1.
 const cargo=call(services,'generateEncounterExtraDrops',random,1,f(base*mult),1,dropValue,dropRandom);
 check(cargo&&Array.isArray(cargo.slots),'SalvageEntity must return actual Cargo, never null');
 return filterOriginalTechMiningCargo(cargo,context,services);
}
