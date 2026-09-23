import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createCargoTransfer, shiftCargoSlot, setCargoSelection, finishCargoSelection, clickCargoSlot, returnHeldCargo, cancelCargoTransfer, cargoTransferItems, cargoTransferRetained, cargoTransferPending, sortCargoTransfer } from '../src/campaign/client/CargoTransfer.mjs';
import { CARGO_QUANTITY_STEPS, cargoQuantitySteps, createCargoQuantityDrag, moveCargoQuantityDrag, cargoQuantityDragValue, cargoQuantityLabels } from '../src/campaign/client/CargoQuantity.mjs';
const freeze = value => {if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function conserved(state) {
  const totals=new Map();for(const item of [...state.hold,...state.discard,state.held?.stack]) {
    if(!item)continue;assert.ok(Number.isFinite(item.quantity)&&item.quantity>=0);
    if(item.quantity===0)assert.ok(state.held?.selectionTotal!==undefined&&item===state.held.stack);
    totals.set(item.id,(totals.get(item.id)??0)+item.quantity);
  }
  assert.deepEqual(Object.fromEntries([...totals].sort()),Object.fromEntries(Object.entries(state.baseline).sort()));
}
const base = (quantity=16) => freeze(createCargoTransfer({heavy_machinery:quantity,fuel:20}));
const begin = (quantity=16) => shiftCargoSlot(base(quantity),'hold',0);

test('native QUANTITIES, cutoff and geometry match checked G/F.java source',{skip:!existsSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/trade/G.java',import.meta.url))},()=>{
  const g=readFileSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/trade/G.java',import.meta.url),'utf8');
  const f=readFileSync(new URL('../../decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/trade/F.java',import.meta.url),'utf8');
  const extracted=[0,...[...g.matchAll(/nArray\[\d+\] = (\d+);/g)].map(m=>Number(m[1]))];
  assert.deepEqual(CARGO_QUANTITY_STEPS,extracted);
  assert.match(g,/WIDTH_PER_PIP = 10\.0f/);assert.match(g,/< 0\.25f/);assert.match(f,/getSize\(\) > 4\.0f/);assert.match(f,/n7 = 5000/);
  const drag=createCargoQuantityDrag(16,515,168,1920,1080,0);
  assert.deepEqual([drag.left,drag.top,drag.width],[502,140,88]);
  assert.deepEqual(cargoQuantityLabels(drag),[{value:0,left:5},{value:10,left:65}]);
});
test('picker uses native nonlinear steps and clipped last value rather than a linear range',()=>{
  assert.deepEqual(cargoQuantitySteps(16),[0,1,2,3,4,5,10,15,16]);
  assert.deepEqual(cargoQuantitySteps(4.5),[0,1,2,3,4]);
  assert.equal(cargoQuantitySteps(8000).at(-1),5000);
  for(const value of [NaN,Infinity,-1,0,0.5])assert.deepEqual(cargoQuantitySteps(value),[0]);
  for(const n of [5,16,500,5000]){const drag=createCargoQuantityDrag(n,2,1,1024,768,0);assert.ok(drag.left>=0&&drag.top>=0&&drag.left+drag.width<=1024);}
});
test('quick Shift click selects one, but deliberate movement crosses nonlinear pips',()=>{
  let drag=createCargoQuantityDrag(16,515,168,1920,1080,0);
  drag=moveCargoQuantityDrag(drag,568);assert.equal(drag.index,6);assert.equal(cargoQuantityDragValue(drag,100),1);assert.equal(cargoQuantityDragValue(drag,250),10);
  drag=moveCargoQuantityDrag(drag,580);assert.equal(cargoQuantityDragValue(drag,110),15);
  drag=moveCargoQuantityDrag(drag,1000);assert.equal(cargoQuantityDragValue(drag,120),16);
  drag=moveCargoQuantityDrag(drag,0);assert.equal(cargoQuantityDragValue(drag,130),0);
});
test('drag cannot latch outside the bar before first horizontal entry',()=>{
  let drag=createCargoQuantityDrag(16,515,168,1920,1080,0);
  drag=moveCargoQuantityDrag(drag,1000);assert.equal(drag.entered,false);assert.equal(cargoQuantityDragValue(drag,300),1);
  drag=moveCargoQuantityDrag(drag,568);assert.equal(drag.entered,true);assert.equal(cargoQuantityDragValue(drag,310),10);
});
test('native checked 1/16, 10/16, release and cancel merge into original remainder',()=>{
  const initial=base(), one=shiftCargoSlot(initial,'hold',0);assert.equal(one.hold[0].quantity,15);assert.equal(one.held.stack.quantity,1);
  const ten=setCargoSelection(freeze(one),10);assert.equal(ten.hold[0].quantity,6);assert.deepEqual(cargoTransferRetained(ten),{heavy_machinery:6,fuel:20});
  const held=finishCargoSelection(freeze(ten));assert.equal(held.held.selectionTotal,undefined);
  const restored=returnHeldCargo(freeze(held));assert.deepEqual(restored.hold,initial.hold);assert.equal(restored.held,null);
  for(const s of [initial,one,ten,held,restored])conserved(s);
});
test('small stacks pick one with no picker; sub-unit resource uses only the actual quantity',()=>{
  for(const n of [0.25,1,2,3,4]){
    const state=begin(n);assert.equal(state.held.selectionTotal,undefined);assert.equal(state.held.stack.quantity,Math.min(1,n));conserved(state);
    assert.equal(cargoTransferRetained(returnHeldCargo(freeze(state))).heavy_machinery,n);
  }
});
test('Shift on original remainder increments/decrements; returning last held unit cancels',()=>{
  const two=finishCargoSelection(setCargoSelection(freeze(begin()),2));
  const three=shiftCargoSlot(freeze(two),'hold',0);assert.equal(three.held.stack.quantity,3);assert.equal(three.hold[0].quantity,13);
  const back=shiftCargoSlot(freeze(three),'hold',0,'right');assert.equal(back.held.stack.quantity,2);
  const one=shiftCargoSlot(freeze(back),'hold',0,'right'), restored=shiftCargoSlot(freeze(one),'hold',0,'right');
  assert.equal(restored.held,null);assert.equal(restored.hold[0].quantity,16);
  for(const s of [two,three,back,one,restored])conserved(s);
});
test('same-ID duplicate is not the original remainder; ordinary merge/drop still applies',()=>{
  let state=finishCargoSelection(setCargoSelection(freeze(begin()),2));
  state=clickCargoSlot(freeze(state),'hold',2); // 14 at original, 2 in a new local stack.
  state=shiftCargoSlot(freeze(state),'hold',2);assert.equal(state.hold[2].quantity,1);
  const noop=shiftCargoSlot(freeze(state),'hold',0,'right');assert.equal(noop,state);
  const merged=shiftCargoSlot(freeze(state),'hold',0);assert.equal(merged.held,null);assert.equal(merged.hold[0].quantity,15);assert.equal(merged.hold[2].quantity,1);conserved(merged);
});
test('selection is modal for ordinary slots/sorts/transaction reset and zero release creates no stack',()=>{
  const state=freeze(begin());assert.equal(clickCargoSlot(state,'discard',0),state);assert.equal(sortCargoTransfer(state,'hold',new Map()),state);assert.equal(cancelCargoTransfer(state),state);
  const zero=setCargoSelection(state,0);assert.equal(cargoTransferPending(zero),true);conserved(zero);
  const end=finishCargoSelection(freeze(zero));assert.equal(cargoTransferPending(end),false);assert.equal(end.hold[0].quantity,16);conserved(end);
});
test('range rejects invalid quantities, cap is only the picker cap, and fractions never disappear',()=>{
  const large=freeze(begin(5001));for(const bad of [-1,5001,1.5,NaN,Infinity,'2'])assert.equal(setCargoSelection(large,bad),large);
  let all=setCargoSelection(large,5000);assert.equal(all.hold[0].quantity,1);all=finishCargoSelection(freeze(all));all=shiftCargoSlot(freeze(all),'hold',0);
  assert.equal(all.held.stack.quantity,5001);assert.equal(all.hold[0],null);conserved(all);
  const fractional=setCargoSelection(freeze(begin(16.25)),16);assert.equal(fractional.hold[0].quantity,0.25);conserved(fractional);conserved(returnHeldCargo(freeze(fractional)));
  const huge=base(1e20);assert.equal(shiftCargoSlot(huge,'hold',0),huge);
});
test('partial discard pickup, preview and cancellation preserve both containers',()=>{
  const part=finishCargoSelection(setCargoSelection(freeze(begin()),10));
  const staged=clickCargoSlot(freeze(part),'discard',0);assert.deepEqual(cargoTransferItems(staged),{heavy_machinery:10});
  const fromDiscard=setCargoSelection(freeze(shiftCargoSlot(freeze(staged),'discard',0)),3);assert.deepEqual(cargoTransferItems(fromDiscard),{heavy_machinery:7});assert.equal(cargoTransferRetained(fromDiscard).heavy_machinery,6);
  const putBack=returnHeldCargo(freeze(fromDiscard));assert.equal(putBack.discard[0].quantity,10);
  const cancelled=cancelCargoTransfer(freeze(putBack));assert.equal(cancelled.hold[0].quantity,16);conserved(cancelled);
});
test('fractional remainder cancellation uses its source identity; 64-ID/4096-slot guards remain atomic',()=>{
  const state=begin(5.25);assert.equal(returnHeldCargo(freeze(state)).hold[0].quantity,5.25);
  const hold=Array.from({length:4096},(_,i)=>({id:'x'+i,quantity:2}));const f=freeze({baseline:Object.fromEntries(hold.map(s=>[s.id,s.quantity])),hold,discard:[],held:null});
  const picked=shiftCargoSlot(f,'hold',4000);assert.equal(returnHeldCargo(freeze(picked)).hold[4000].quantity,2);
  let g=createCargoTransfer(Object.fromEntries(Array.from({length:65},(_,i)=>['c'+i,4])));
  for(let i=0;i<64;i++)g=clickCargoSlot(clickCargoSlot(freeze(g),'hold',i),'discard',i);
  g=shiftCargoSlot(freeze(g),'hold',64);assert.equal(clickCargoSlot(freeze(g),'discard',64),g);conserved(returnHeldCargo(freeze(g)));
});
test('8,000 deterministic whole/partial/drag gestures conserve immutable snapshots',()=>{
  let state=createCargoTransfer({fuel:496,crew:149,heavy_machinery:16,supplies:36}),seed=0x20260920;
  const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let i=0;i<8000;i++){
    const before=JSON.stringify(state);freeze(state);const old=state,side=rnd(2)?'hold':'discard',index=rnd(9);
    if(state.held?.selectionTotal!==undefined){const action=rnd(4);state=action===0?returnHeldCargo(state):action===1?finishCargoSelection(state):setCargoSelection(state,rnd(Math.floor(state.held.selectionTotal)+1));}
    else {switch(rnd(6)){case 0:state=shiftCargoSlot(state,side,index);break;case 1:state=shiftCargoSlot(state,side,index,'right');break;case 2:state=returnHeldCargo(state);break;case 3:state=cancelCargoTransfer(state);break;case 4:state=sortCargoTransfer(state,side,new Map());break;default:state=clickCargoSlot(state,side,index);}}
    assert.equal(JSON.stringify(old),before);conserved(state);
  }
});
