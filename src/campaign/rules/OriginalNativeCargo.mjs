import {createOriginalModSpecCargoStack} from './OriginalModSpecItem.mjs';
import {createOriginalSpecialCargoStack,hasOriginalSpecialItemFactory} from './OriginalSpecialItems.mjs';
/** CargoData item mutation/sort on real shared slots, not display rows. */
import R from '../data/reference-battle-autoresolver.json' with {type:'json'};
import {ORIGINAL_MARKET_REFERENCE as MARKET} from './OriginalMarketPricing.mjs';
import {addOriginalResourceCargo,removeOriginalResourceCargo,validateOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {updateOriginalFleetCargoSpace} from './OriginalFleetData.mjs';
import {encounterCheck as check,encounterCall as call,encounterFloat as num} from './OriginalEncounterState.mjs';
const f=Math.fround,int=n=>Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const order=['RESOURCES','WEAPONS','FIGHTER_CHIP','SPECIAL','NULL'];
export function originalNativeCargoItemSpec(stack){
 const id=stack.type==='RESOURCES'?stack.commodityId:stack.itemId;
 const spec=stack.type==='RESOURCES'?MARKET.commodities[id]:R.cargoItems[({WEAPONS:'weapons',FIGHTER_CHIP:'wings',SPECIAL:'specials'})[stack.type]]?.[id];
 check(spec,'Actual cargo item spec required: '+stack.type+'/'+id);return spec;
}
export function originalNativeCargoStackUnit(stack){const spec=originalNativeCargoItemSpec(stack);return num(spec.cargoSpace);}
function owner(cargo,services){
 if(services.readNativeCargoOriginalSource)return call(services,'readNativeCargoOriginalSource',cargo)??cargo;
 check(Object.hasOwn(cargo,'origSource'),'Actual nullable original cargo source required');return cargo.origSource===null?cargo:cargo.origSource;
}
export function originalNativeCargoStackFields(stack){
 const spec=originalNativeCargoItemSpec(stack),saved=stack.source?.attributes;
 let max=stack.maxSize,round=stack.roundSize;
 if(max===undefined){check(saved?.mS!==undefined,'Actual saved stack maximum required');max=f(Number(saved.mS));if(max<100000)max=spec.stackSize;}
 if(round===undefined){check(saved?.rS==='true'||saved?.rS==='false','Actual saved stack rounding required');round=saved.rS==='true';}
 num(max);check(max>0&&typeof round==='boolean','Actual stack lifecycle required');return {max,round};
}
/** Direct CargoStack.add differs from removeItems: no partials, null-slot cleanup, or crew dirtying. */
export function addOriginalNativeCargoStack(cargo,stack,amount,services={}){
 setOriginalNativeCargoStackSize(cargo,stack,f(num(stack.size)+amount),services);
}
export function setOriginalNativeCargoStackSize(cargo,stack,size,services={}){
 const {max,round}=originalNativeCargoStackFields(stack);size=f(size);if(Number.isNaN(size))size=0;if(round)size=f(int(size));stack.size=Math.min(max,Math.max(0,size));
 const bound=stack.cargo??owner(cargo,services);updateOriginalFleetCargoSpace(bound);
}
export function sameOriginalNativeCargoItem(a,b){return a!=null&&b!=null&&a.type===b.type&&(a.type==='RESOURCES'?a.commodityId===b.commodityId:a.itemId===b.itemId&&(a.type!=='SPECIAL'||a.itemData===b.itemData));}
function dirtyCrew(cargo,services){if(cargo.carryingFleetRef!==null){check(typeof cargo.carryingFleetRef==='string','Actual carrying FleetData required');const fleet=call(services,'resolveEncounterFleetData',cargo.carryingFleetRef);check(fleet?.synchronization,'Actual fleet synchronization required');fleet.synchronization.needsSync=true;}}
export function addOriginalNativeCargoItems(cargo,item,amount,services={}){
 num(amount);if(amount<=0||item.type==='NULL')return;validateOriginalResourceCargo(cargo);
 if(item.type==='RESOURCES'){
  const old=new Set(cargo.slots);addOriginalResourceCargo(cargo,item.commodityId,amount,()=>updateOriginalFleetCargoSpace(cargo),()=>{if(item.commodityId==='crew')dirtyCrew(cargo,services);});
  for(const stack of cargo.slots)if(stack&&!old.has(stack))stack.cargo=owner(cargo,services);return;
 }
 check(['WEAPONS','FIGHTER_CHIP','SPECIAL'].includes(item.type),'Actual item type required');
 if(item.type==='SPECIAL')check(Object.hasOwn(item,'itemData'),'Actual nullable SpecialItemData required');
 const spec=originalNativeCargoItemSpec(item);let iterations=0;
 do{
  check(++iterations<=65536,'Cargo item work limit');let stack=null;
  for(const row of cargo.slots)if(sameOriginalNativeCargoItem(row,item)&&(stack===null||stack.size>row.size))stack=row;
  if(stack===null||stack.size>=originalNativeCargoStackFields(stack).max){
   if(amount<1)break;
   if(item.type==='SPECIAL'){
    // Plugin initialization may customize actual stack state; it is never replaced by an inert DTO.
    stack=services.createNativeSpecialCargoStack?call(services,'createNativeSpecialCargoStack',cargo,item.itemId,item.itemData):item.itemId==='modspec'?createOriginalModSpecCargoStack(cargo,item.itemData):hasOriginalSpecialItemFactory(item.itemId)?createOriginalSpecialCargoStack(cargo,item.itemId,item.itemData):call(services,'createNativeSpecialCargoStack',cargo,item.itemId,item.itemData);
    check(stack?.type==='SPECIAL'&&sameOriginalNativeCargoItem(stack,item)&&stack.size===0,'Actual initialized special stack required');
   }else stack={objectRef:null,type:item.type,itemId:item.itemId,size:0,maxSize:num(spec.stackSize),roundSize:false,cargoSpacePerUnit:num(spec.cargoSpace),cargo};
   if(cargo.unlimitedStacks)stack.maxSize=1000000;stack.roundSize=true;stack.cargo=owner(cargo,services);
   let at=cargo.slots.findIndex(row=>row===null||row.type==='NULL'||row.size<=0);if(at<0){check(cargo.slots.length<65536,'Cargo slot limit');at=cargo.slots.length;}cargo.slots[at]=stack;updateOriginalFleetCargoSpace(cargo);
  }
  const used=Math.min(f(originalNativeCargoStackFields(stack).max-stack.size),amount);addOriginalNativeCargoStack(cargo,stack,used,services);const next=f(amount-used);check(next<amount,'Cargo add did not make float progress');amount=next;
 }while(amount>=1);
 updateOriginalFleetCargoSpace(cargo);
}
const compareFloat=(a,b)=>a===0&&b===0?Number(Object.is(b,-0))-Number(Object.is(a,-0)):Math.sign(a-b);
const compareString=(a,b)=>{check(typeof a==='string'&&typeof b==='string','Actual item sort names required');return a<b?-1:a>b?1:0;};
function compare(a,b){
 const type=order.indexOf(a.type)-order.indexOf(b.type);if(type)return type;const left=originalNativeCargoItemSpec(a),right=originalNativeCargoItemSpec(b);
 if(a.type==='WEAPONS')return right.size-left.size||Math.sign(b.size-a.size)||compareString(left.name,right.name);
 if(a.type==='FIGHTER_CHIP')return compareString(left.hullName,right.hullName);
 const id=s=>s.type==='RESOURCES'?s.commodityId:s.itemId;return id(a)===id(b)?Math.sign(b.size-a.size):compareFloat(num(left.order),num(right.order));
}
/** CargoData.addAll(false): item stacks only, never credits or mothballed ships. */
export function addAllOriginalNativeCargo(target,source,services={}){
 check(target!==source,'Cargo addAll requires distinct containers');validateOriginalResourceCargo(source);
 for(const stack of [...source.slots])if(stack!==null&&stack.type!=='NULL')addOriginalNativeCargoItems(target,stack,stack.size,services);
}
/** Despite its Java name, createCopyWithSameStacks recreates stacks through addItems. */
export function copyOriginalNativeCargo(source,createCargo,services={}){
 check(typeof createCargo==='function','Actual Cargo constructor required');const copy=createCargo();
 check(copy!==source&&Array.isArray(copy?.slots)&&copy.slots.length===0,'New empty Cargo required');
 copy.unlimitedStacks=source.unlimitedStacks;addAllOriginalNativeCargo(copy,source,services);return copy;
}
/** CargoData.isEmpty is a NULL-type test, including zero-sized but non-NULL stacks. */
export function originalNativeCargoIsEmpty(cargo){validateOriginalResourceCargo(cargo);return cargo.slots.every(stack=>stack===null||stack.type==='NULL');}
export function clearOriginalNativeCargo(cargo){cargo.slots.length=0;updateOriginalFleetCargoSpace(cargo);}
export function sortOriginalNativeCargo(cargo,services={}){
 const original=cargo.slots.filter(stack=>stack!==null&&stack.type!=='NULL');cargo.slots.length=0;
 // Native sort deliberately retains partials while rebuilding, and does not reset credits.
 for(const stack of original)addOriginalNativeCargoItems(cargo,stack,stack.size,services);
 for(const stack of cargo.slots)stack.cargo=owner(cargo,services);cargo.slots.sort(compare);
 check(Object.hasOwn(cargo,'mothballedShips'),'Actual nullable cargo ship roster required');if(cargo.mothballedShips!==null)call(services,'sortNativeCargoShips',cargo.mothballedShips);
}

/** CargoData.removeItems, including smallest-stack selection and native <1 NULL cleanup. */
export function removeOriginalNativeCargoItems(cargo,item,amount,services={}){
 num(amount);if(amount<=0)return true;if(item.type==='NULL')return false;validateOriginalResourceCargo(cargo);
 if(item.type==='RESOURCES')return removeOriginalResourceCargo(cargo,item.commodityId,amount,()=>updateOriginalFleetCargoSpace(cargo),()=>{if(item.commodityId==='crew')dirtyCrew(cargo,services);});
 originalNativeCargoItemSpec(item);let iterations=0;
 while(amount>0){
  check(++iterations<=65536,'Cargo removal work limit');let index=-1;
  for(let n=0;n<cargo.slots.length;n++)if(sameOriginalNativeCargoItem(cargo.slots[n],item)&&(index<0||cargo.slots[index].size>cargo.slots[n].size))index=n;
  if(index<0)return false;const stack=cargo.slots[index],used=Math.min(stack.size,amount);setOriginalNativeCargoStackSize(cargo,stack,Math.max(0,f(stack.size-used)),services);
  if(stack.size<1)cargo.slots[index]=null;const next=f(amount-used);check(next<amount||cargo.slots[index]===null,'Cargo removal did not make float progress');amount=next;
 }
 updateOriginalFleetCargoSpace(cargo);return true;
}
export function originalNativeCargoItemQuantity(cargo,item){let total=0;for(const stack of cargo.slots)if(sameOriginalNativeCargoItem(stack,item))total=f(total+stack.size);return total;}
/** Direct UI slot assignment: never substitute removeItems/addItems here. */
export function setOriginalNativeCargoSlot(cargo,index,stack,services={}){
 check(Number.isSafeInteger(index)&&index>=0&&index<65536,'Cargo slot out of bounds');while(cargo.slots.length<=index)cargo.slots.push(null);cargo.slots[index]=stack;
 if(stack!==null&&stack.type!=='NULL')stack.cargo=owner(cargo,services);updateOriginalFleetCargoSpace(cargo);
}

/** Base native presentation assets only; arbitrary SpecialItemPlugin rendering stays separate. */
export function originalNativeCargoItemPresentation(stack){
 const spec=originalNativeCargoItemSpec(stack),hullmod=stack.type==='SPECIAL'&&stack.itemId==='modspec'?R.hullmods[stack.itemData]:null;
 const safe=p=>typeof p==='string'&&p.startsWith('graphics/')&&!p.split('/').includes('..');
 const icons=(spec.iconLayers??[spec.icon]).filter(safe);
 return {name:hullmod?hullmod.name+' - 船体插件':spec.name??spec.hullName??stack.itemId??stack.commodityId,icons,overlay:safe(hullmod?.icon??spec.overlay)?hullmod?.icon??spec.overlay:null,presentation:'base-native-assets',canPutInLoot:!(stack.type==='RESOURCES'&&['crew','marines'].includes(stack.commodityId))&&!(stack.type==='SPECIAL'&&spec.tags?.includes('mission_item'))};
}
