/** Real Base/Shrouded item initialization. Other plugin classes remain explicit service dependencies. */
import R from '../data/reference-required-items.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {setOriginalCampaignMemory,validateOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
const BASE='com.fs.starfarer.api.campaign.impl.items.BaseSpecialItemPlugin',SHROUDED='com.fs.starfarer.api.campaign.impl.items.ShroudedHullmodItemPlugin';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_SPECIAL_ITEM',message);
const requireService=(services,key)=>check(typeof services[key]==='function','Actual special item service required: '+key);
const call=(services,key,...args)=>{requireService(services,key);const result=services[key](...args);check(!result||typeof result.then!=='function','Special item services must be synchronous');return result;};
export function hasOriginalSpecialItemFactory(itemId){return [BASE,SHROUDED].includes(R.specials[itemId]?.plugin);}
export function createOriginalSpecialCargoStack(cargo,itemId,itemData){
 check(hasOriginalSpecialItemFactory(itemId),'Actual custom special item factory required: '+itemId);check(cargo===null||cargo&&Array.isArray(cargo.slots),'Actual nullable cargo required');check(itemData===null||typeof itemData==='string','Actual nullable SpecialItemData required');
 const spec=R.specials[itemId],stack={objectRef:null,type:'SPECIAL',itemId,itemData,size:0,maxSize:spec.stackSize,roundSize:false,cargoSpacePerUnit:spec.cargoSpace,cargo,plugin:null};
 // X.getNewPluginInstance calls setId (bind spec) and then init (retain the exact stack).
 stack.plugin={scope:'native-special-item-plugin',classId:spec.plugin,itemId,spec,stack};return stack;
}
export function bindOriginalSpecialItem(plugin,services={}){
 check(plugin?.scope==='native-special-item-plugin'&&[BASE,SHROUDED].includes(plugin.classId)&&plugin.stack?.plugin===plugin&&plugin.stack.itemId===plugin.itemId&&plugin.spec?.plugin===plugin.classId,'Actual initialized native special item plugin required');
 const shrouded=plugin.classId===SHROUDED;
 const known=()=>{check(typeof plugin.spec.params==='string','Actual hullmod ID in special-item params required');const value=call(services,'isCharacterHullmodKnown',plugin.spec.params);check(typeof value==='boolean','Actual CharacterData hullmod knowledge required');return value;};
 return {
  getId:()=>plugin.itemId,getName:()=>plugin.spec.name,getDesignType:()=>plugin.spec.manufacturer,getSpec:()=>plugin.spec,getPrice:()=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(plugin.spec.basePrice))),getTooltipWidth:()=>450,isTooltipExpandable:()=>false,
  hasRightClickAction:()=>shrouded?!known():false,shouldRemoveOnRightClickAction:()=>!shrouded,resolveDropParamsToSpecificItemData:()=>'',
  performRightClickAction:helper=>{
   if(!shrouded)return; // BaseSpecialItemPlugin itself intentionally has no action.
   // Refuse incomplete UI adapters before sound/memory side effects. Do not auto-learn or consume.
   for(const key of ['playSpecialItemUISound','readSpecialItemPlayerMemory','createSpecialItemRuleDialog','setSpecialItemRuleDialogCustom1','readSpecialItemPlayerFleet','showSpecialItemCargoDialog'])requireService(services,key);
   call(services,'playSpecialItemUISound',plugin.spec.soundId,1,1);
   const memory=validateOriginalCampaignMemory(call(services,'readSpecialItemPlayerMemory'));setOriginalCampaignMemory(memory,'$shroudedHullmodId',plugin.spec.params,0);
   const dialog=call(services,'createSpecialItemRuleDialog','ShroudedHullmodItemRC');check(dialog&&typeof dialog==='object','Actual rule-based interaction plugin required');call(services,'setSpecialItemRuleDialogCustom1',dialog,helper);
   const fleet=call(services,'readSpecialItemPlayerFleet');check(fleet===null||fleet&&typeof fleet==='object','Actual nullable player fleet required');call(services,'showSpecialItemCargoDialog',dialog,fleet);
  },
  render:()=>{}, // Native BaseSpecialItemPlugin.render is empty; CargoStackView draws the spec icon.
  createTooltip:(...args)=>call(services,'createSpecialItemTooltip',plugin,...args),
 };
}
