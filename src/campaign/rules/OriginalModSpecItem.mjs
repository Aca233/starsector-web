/** ModSpecItemPlugin state/lifecycle; rendering and full tooltips require the native UI adapter. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {encounterCheck as check,encounterCall as call,encounterBool as bool,encounterFloat as num} from './OriginalEncounterState.mjs';
export function createOriginalModSpecCargoStack(cargo,modId){
 const spec=R.cargoItems.specials.modspec,modSpec=R.hullmods[modId];check(spec?.plugin==='com.fs.starfarer.api.campaign.impl.items.ModSpecItemPlugin'&&modSpec,'Actual hullmod chip ID required');
 const stack={objectRef:null,type:'SPECIAL',itemId:'modspec',itemData:modId,size:0,maxSize:num(spec.stackSize),roundSize:false,cargoSpacePerUnit:num(spec.cargoSpace),cargo,plugin:null};
 stack.plugin={scope:'native-modspec-item-plugin',itemId:'modspec',spec,stack,modId,modSpec};return stack;
}
export function bindOriginalModSpecItem(plugin,services={}){
 check(plugin?.scope==='native-modspec-item-plugin'&&plugin.stack?.plugin===plugin&&plugin.modId===plugin.stack.itemData,'Actual bound modspec plugin required');
 const known=()=>bool(call(services,'isCharacterHullmodKnown',plugin.modId));
 return {getId:()=>plugin.itemId,getName:()=>plugin.modSpec.name+' - 船体插件',getDesignType:()=>plugin.modSpec.manufacturer,getPrice:()=>Math.trunc(num(plugin.modSpec.baseValue)),hasRightClickAction:()=>true,shouldRemoveOnRightClickAction:()=>!known(),isTooltipExpandable:()=>false,
  performRightClickAction:()=>{if(known())call(services,'showModSpecMessage',plugin.modSpec.name+'：已知');else{call(services,'playModSpecUISound','ui_acquired_hullmod',1,1);call(services,'addCharacterHullmod',plugin.modId);call(services,'showModSpecMessage','获得船体插件：'+plugin.modSpec.name);}},
  render:(...args)=>call(services,'renderModSpecItem',plugin,...args),createTooltip:(...args)=>call(services,'createModSpecTooltip',plugin,...args),
 };
}
