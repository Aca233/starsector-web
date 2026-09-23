/** F.java's no-cost, all-tab cargo transaction. UI state is retained for network reconnects. */
import {requireThat,isRecord} from '../core/Values.mjs';
import {validateOriginalResourceCargo} from './OriginalResourceCargo.mjs';
import {addAllOriginalNativeCargo,copyOriginalNativeCargo,addOriginalNativeCargoItems,removeOriginalNativeCargoItems,originalNativeCargoItemQuantity,originalNativeCargoStackFields,sameOriginalNativeCargoItem,setOriginalNativeCargoStackSize,setOriginalNativeCargoSlot,clearOriginalNativeCargo,sortOriginalNativeCargo,originalNativeCargoItemSpec,originalNativeCargoItemPresentation} from './OriginalNativeCargo.mjs';
const f=Math.fround;
const check=(ok,message)=>requireThat(ok,'INVALID_NATIVE_LOOT_TRANSACTION',message);
const present=stack=>stack!==null&&stack!==undefined&&stack.type!=='NULL';
const side=value=>{check(value==='fleet'||value==='loot','Unknown cargo side');return value;};
const index=value=>{check(Number.isSafeInteger(value)&&value>=0&&value<65536,'Invalid cargo slot');return value;};
const clone=stack=>({...stack,objectRef:null}); // Java Object.clone is shallow, including the SpecialItemPlugin.
const extra=['extraCargoUsed','extraCrewUsed','extraMarinesUsed','extraFuelUsed','extraSuppliesUsed'];
function reset(state){clearOriginalNativeCargo(state.bought);clearOriginalNativeCargo(state.sold);for(const cargo of [state.fleet,state.loot])for(const key of extra)cargo[key]=0;}
function ledgerEmpty(cargo){return cargo.slots.every(stack=>!present(stack));} // size==0 does not imply NULL.
export function originalLootTransactionExists(state){return state.picked!==null||!ledgerEmpty(state.bought)||!ledgerEmpty(state.sold);}
export function createOriginalLootCargoTransaction(fleet,sourceLoot,createCargo,services={}){
 check(typeof createCargo==='function','Actual native Cargo constructor required');
 // class.<init>/BaseSubmarketPlugin.addAllCargo: the screen owns a temporary storage Cargo.
 sortOriginalNativeCargo(sourceLoot,services);const loot=createCargo();addAllOriginalNativeCargo(loot,sourceLoot,services);
 // G.updateFilteredCargo in the all tab rebinds every real stack to its owning Cargo.
 for(const cargo of [fleet,loot])for(const stack of cargo.slots)if(present(stack))stack.cargo=cargo;
 const state={scope:'native-loot-cargo-transaction',fleet,sourceLoot,loot,bought:createCargo(),sold:createCargo(),picked:null,tookAll:false,legacySharedSource:false,panelConfirmed:false};
 validateOriginalLootCargoTransaction(state);return state;
}
export function validateOriginalLootCargoTransaction(state){
 check(state?.scope==='native-loot-cargo-transaction','Actual loot transaction required');
 check(typeof state.tookAll==='boolean'&&typeof state.legacySharedSource==='boolean'&&typeof state.panelConfirmed==='boolean','Actual loot panel lifecycle required');
 validateOriginalResourceCargo(state.sourceLoot);
 check(state.legacySharedSource?state.sourceLoot===state.loot:![state.fleet,state.loot,state.bought,state.sold].includes(state.sourceLoot),'Lost original/temporary Cargo separation');
 if(state.panelConfirmed)check(!originalLootTransactionExists(state),'Confirmed loot panel still has a transaction');
 const cargos=[state.fleet,state.loot,state.bought,state.sold];check(new Set(cargos).size===4,'Transaction cargos must have distinct identities');
 const stacks=new Set();
 for(const cargo of cargos){validateOriginalResourceCargo(cargo);check(cargo.origSource===null,'All-tab transaction requires actual unfiltered Cargo');
  for(const stack of cargo.slots){if(!present(stack))continue;check(!stacks.has(stack),'Stack cannot occupy two transaction slots');stacks.add(stack);originalNativeCargoStackFields(stack);check(stack.cargo===cargo,'Lost stack Cargo binding');}
 }
 if(!state.legacySharedSource)for(const stack of state.sourceLoot.slots)if(present(stack))check(!stacks.has(stack),'Temporary cargo must not share source stacks');
 for(const ledger of [state.bought,state.sold])check(ledger.carryingFleetRef===null&&ledger.unlimitedStacks&&ledger.partials===null,'Actual unlimited transaction ledger required');
 if(state.picked!==null){const p=state.picked;side(p.from);index(p.index);check(present(p.stack)&&present(p.original)&&present(p.restore),'Actual held stack and restoration copies required');check(!stacks.has(p.stack)&&!stacks.has(p.restore),'Held stack still occupies a slot');originalNativeCargoStackFields(p.stack);check(p.stack.size>=0&&Number.isFinite(p.stack.size),'Invalid held quantity');}
 return state;
}
function transferred(state,from,to,stack,amount,services){
 if(from===to)return;
 const reverse=to==='fleet'?state.sold:state.bought,forward=to==='fleet'?state.bought:state.sold;
 const old=originalNativeCargoItemQuantity(reverse,stack),remaining=Math.max(0,f(amount-old));
 removeOriginalNativeCargoItems(reverse,stack,Math.min(amount,old),services);addOriginalNativeCargoItems(forward,stack,remaining,services);
}
function clearHeld(state){if(ledgerEmpty(state.bought)&&ledgerEmpty(state.sold))reset(state);state.picked=null;}
function returnHeld(state,services){
 const p=state.picked;check(p!==null,'No stack is held');const cargo=state[p.from];
 let at=p.index,quantity=p.stack.size;
 if(cargo.slots[at]===p.original)quantity=f(quantity+p.original.size);
 else{at=cargo.slots.findIndex(stack=>!present(stack)||stack.size<=0);if(at<0)at=cargo.slots.length;}
 setOriginalNativeCargoStackSize(cargo,p.restore,quantity,services);setOriginalNativeCargoSlot(cargo,at,p.restore,services);clearHeld(state);
}
function canDrop(to,stack){
 if(to!=='loot')return;
 check(!(stack.type==='RESOURCES'&&['crew','marines'].includes(stack.commodityId)),'Personnel cannot be left in standard battle loot');
 check(!(stack.type==='SPECIAL'&&originalNativeCargoItemSpec(stack).tags?.includes('mission_item')),'Mission items cannot be put in loot');
}
function pick(state,action,services){
 check(state.picked===null,'Return or drop the held stack first');const from=side(action.side),at=index(action.index),cargo=state[from],stack=cargo.slots[at];
 check(present(stack),'No cargo stack at this slot');
 state.picked={from,index:at,original:stack,restore:clone(stack),stack:clone(stack)};
 setOriginalNativeCargoSlot(cargo,at,null,services);
}
function drop(state,action,services){
 const p=state.picked;check(p!==null,'No stack is held');const to=side(action.side),at=index(action.index),cargo=state[to],target=cargo.slots[at];canDrop(to,p.stack);
 if(present(target)&&sameOriginalNativeCargoItem(target,p.stack)){
  const quantity=p.stack.size,used=Math.min(f(originalNativeCargoStackFields(target).max-target.size),quantity);
  transferred(state,p.from,to,target,used,services);setOriginalNativeCargoStackSize(cargo,target,f(target.size+used),services);setOriginalNativeCargoStackSize(state[p.from],p.stack,f(quantity-used),services);
  if(quantity===used)clearHeld(state);
 }else{
  transferred(state,p.from,to,p.stack,p.stack.size,services);setOriginalNativeCargoSlot(cargo,at,p.stack,services);
  if(present(target))state.picked={from:to,index:at,original:target,restore:clone(target),stack:clone(target)};
  else clearHeld(state);
 }
}
function takeAll(state,services){
 check(state.picked===null,'Return or drop the held stack before taking all');
 check(Number.isFinite(state.fleet.maxFuel)&&Number.isFinite(state.fleet.extraFuelUsed),'Actual Cargo fuel capacity required');
 let fuel=state.tookAll?1e9:Math.trunc(f(state.fleet.maxFuel-f(originalNativeCargoItemQuantity(state.fleet,{type:'RESOURCES',commodityId:'fuel'})+state.fleet.extraFuelUsed)));state.tookAll=true;
 // q.actionPerformed iterates the live slot list; removeItems replaces slots with NULL, not splice.
 for(const stack of state.loot.slots){if(!present(stack))continue;let size=stack.size;
  if(stack.type==='RESOURCES'&&stack.commodityId==='fuel'){size=Math.min(fuel,size);fuel=f(fuel-size);if(size<=0)continue;}
  // Take-all adds to bought directly. Unlike drag, it deliberately does not net against sold.
  addOriginalNativeCargoItems(state.bought,stack,size,services);addOriginalNativeCargoItems(state.fleet,stack,size,services);removeOriginalNativeCargoItems(state.loot,stack,size,services);
 }
}
function cancel(state,services){
 check(state.picked===null,'Return the held stack before cancelling the transaction');
 if(originalLootTransactionExists(state)){
  // Native cancel removes net purchases from the fleet, then restores net sales from loot.
  for(const stack of state.bought.slots)if(present(stack)){removeOriginalNativeCargoItems(state.fleet,stack,stack.size,services);addOriginalNativeCargoItems(state.loot,stack,stack.size,services);}
  for(const stack of state.sold.slots)if(present(stack)){removeOriginalNativeCargoItems(state.loot,stack,stack.size,services);addOriginalNativeCargoItems(state.fleet,stack,stack.size,services);}
  sortOriginalNativeCargo(state.loot,services);sortOriginalNativeCargo(state.loot,services); // F sorts manifest two's real and filtered cargo, even when aliased.
 }
 reset(state);
}
/** A batch is applied only to a disposable repository draft; any exception discards the entire graph. */
export function applyOriginalLootCargoActions(state,actions,services={}){
 validateOriginalLootCargoTransaction(state);check(!state.panelConfirmed,'Loot panel is already confirmed');check(Array.isArray(actions)&&actions.length>0&&actions.length<=128,'Expected 1..128 cargo actions');
 for(const action of actions){
  check(isRecord(action)&&typeof action.kind==='string','Invalid cargo action');const keys=['pick','drop'].includes(action.kind)?['kind','side','index']:action.kind==='sort'?['kind','side']:['kind'];check(Object.keys(action).every(key=>keys.includes(key)),'Unexpected cargo action field');
  switch(action.kind){
   case 'pick':pick(state,action,services);break;
   case 'drop':drop(state,action,services);break;
   case 'return':returnHeld(state,services);break;
   case 'take-all':takeAll(state,services);break;
   case 'cancel':cancel(state,services);state.tookAll=false;break;
   case 'sort':check(state.picked===null,'Return or drop the held stack before sorting');sortOriginalNativeCargo(state[side(action.side)],services);break;
   default:check(false,'Unknown cargo action');
  }
 }
 validateOriginalLootCargoTransaction(state);return state;
}
/** class.confirmTransaction/twConfirm before q dismisses its core panel.
 * Required receivers must mutate the same disposable world draft. They must not publish external
 * effects before repository commit; an exception invalidates the whole Runtime, including this reset.
 * This is NOT a default CoreScript/pod factory, market constructor, or listener implementation.
 */
export function confirmOriginalLootCargoPanel(state,fleet,dialog,services={}){
 validateOriginalLootCargoTransaction(state);if(state.panelConfirmed)return false;
 check(state.picked===null,'Return or drop the held stack before confirming');
 check(fleet?.cargo===state.fleet&&fleet.synchronization,'Actual owning fleet and synchronization required');
 const call=(name,...args)=>{check(typeof services[name]==='function','Actual loot confirmation service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Synchronous loot confirmation service required: '+name);return value;};
 const context=call('readInteractionLootTransactionContext',state,dialog);
 check(context?.market&&typeof context.market==='object'&&(context.submarket===null||typeof context.submarket==='object')&&typeof context.tradeMode==='string','Actual loot market/submarket/trade mode required');
 // No-cost loot has no line items or tariff. A paid submarket is not this screen.
 check(context.freeTransfer===true,'Actual free-transfer loot context required');
 for(const name of ['reportInteractionNonMarketTransaction','updateInteractionLootMarketPrices'])check(typeof services[name]==='function','Actual loot confirmation service required: '+name);
 if(!ledgerEmpty(state.loot))check(typeof services.reportInteractionPlayerDidNotTakeCargo==='function','Actual loot confirmation service required: reportInteractionPlayerDidNotTakeCargo');
 const bought=copyOriginalNativeCargo(state.bought,services.createEncounterLootCargo,services),sold=copyOriginalNativeCargo(state.sold,services.createEncounterLootCargo,services);
 const transaction={scope:'native-player-market-transaction',market:context.market,submarket:context.submarket,tradeMode:context.tradeMode,creditValue:0,bought,sold,lineItems:[],shipsBought:[],shipsSold:[]};
 check(Number.isFinite(state.fleet.credits?.value),'Actual player credits required');state.fleet.credits.value=f(state.fleet.credits.value+0);fleet.synchronization.needsSync=true;
 reset(state);state.tookAll=false;
 // schema32 and earlier used an alias. Retain that history explicitly; never clear the source
 // and then copy it into itself, and never fabricate the lost pre-transfer original contents.
 if(!state.legacySharedSource){clearOriginalNativeCargo(state.sourceLoot);addAllOriginalNativeCargo(state.sourceLoot,state.loot,services);}
 if(!ledgerEmpty(state.sourceLoot))call('reportInteractionPlayerDidNotTakeCargo',state.sourceLoot,fleet);
 call('reportInteractionNonMarketTransaction',transaction,dialog);
 call('updateInteractionLootMarketPrices',context.market);
 state.panelConfirmed=true;validateOriginalLootCargoTransaction(state);return true;
}
/** Explicit disclosure allowlist; never serialize plugins, sources, credits objects or the graph. */
export function projectOriginalLootCargo(fleet,loot,state=null){
 const item=stack=>{if(!present(stack))return null;const limits=originalNativeCargoStackFields(stack);return {display:originalNativeCargoItemPresentation(stack),type:stack.type,...(stack.type==='RESOURCES'?{commodityId:stack.commodityId}:{itemId:stack.itemId,...(stack.type==='SPECIAL'?{itemData:stack.itemData}: {})}),size:stack.size,maxSize:limits.max,roundSize:limits.round};};
 const cargo=value=>({slots:value.slots.map(item)});
 return {scope:'native-loot-cargo-all-tab',tookAll:state?.tookAll??false,fleet:cargo(fleet),loot:cargo(state?.loot??loot),bought:state?cargo(state.bought):{slots:[]},sold:state?cargo(state.sold):{slots:[]},picked:state?.picked?{from:state.picked.from,index:state.picked.index,stack:item(state.picked.stack)}:null,transactionExists:state!==null&&originalLootTransactionExists(state)};
}
