import assert from 'node:assert/strict';import {test} from 'node:test';
import {encodeMotionDisplayFrame,projectMotionDisplay,MOTION_DISPLAY_ERROR as E} from '../src/network/MotionDisplay.mjs';
import {encodeMotionFrame,decodeMotionFrame,motionToText} from '../src/network/MotionFrame.mjs';
import {MotionWireSender,MotionWireReceiver,motionWireTarget,encodeMotionWireEnvelope,decodeMotionWireEnvelope} from '../server/MotionWire.mjs';
import {sampleStateAge} from './lib/replay-state-age.mjs';
const frame=(tick=1)=>({tick,time:tick/60,acknowledged:{0:Number.MAX_SAFE_INTEGER,1:tick},ships:[['a',.123456789012,-0,567.89012345,-123.456789,.876543212345,-.987654321,4294967295,3]]});
test('display projection is explicit, bounded, idempotent, immutable and retains exact clocks/ACKs/flags/-0',()=>{
 const f=frame(),before=structuredClone(f),q=projectMotionDisplay(f),decoded=decodeMotionFrame(encodeMotionDisplayFrame(f));
 assert.deepEqual(f,before);assert.deepEqual(projectMotionDisplay(q),q);assert.equal(Object.getPrototypeOf(decoded.acknowledged),null);assert.deepEqual({...decoded,acknowledged:{...decoded.acknowledged}},q);assert.notDeepEqual(encodeMotionFrame(f),encodeMotionDisplayFrame(f));
 assert.deepEqual({...q,ships:[]},{...f,ships:[]});assert.notEqual(q.ships,f.ships);assert.notEqual(q.ships[0],f.ships[0]);assert.ok(Object.is(q.ships[0][2],-0));
 const values=[Number.MIN_VALUE,-Number.MIN_VALUE,-0,0,1e-18,-1e-18,1e9,1e9-1,-1e9+1,123456789.123,32768.001953125,Math.PI,Math.PI*2,-Math.PI,1/3];
 let seed=5143;for(let i=0;i<5000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values.push((seed/2**32-.5)*(i%2?1e4:1e9));}
 let changed=0,fallback=0;
 for(const n of values)for(let i=1;i<=6;i++){
  const input=frame();input.ships[0][i]=n;const row=decodeMotionFrame(encodeMotionDisplayFrame(input)).ships[0],limit=i<=4?E.linear:E.angular;
  assert.ok(Math.abs(row[i]-n)<=limit);const tiny=Math.fround(n);assert.ok(Object.is(row[i],Math.abs(tiny-n)<=limit?tiny:n));
  if(Math.abs(tiny-n)>limit)fallback++;else if(!Object.is(row[i],n))changed++;
  for(const j of [0,7,8])assert.equal(row[j],input.ships[0][j]);
 }
 assert.ok(changed>1000&&fallback>1000);
});
test('display projection never repairs invalid authority data or accepts partial/oversized fleets',()=>{
 for(const n of [NaN,Infinity,-Infinity,'1',null,1e9+1]){const f=frame();f.ships[0][1]=n;assert.throws(()=>encodeMotionDisplayFrame(f));}
 for(const f of [null,{}, {...frame(),ships:new Array(129).fill(frame().ships[0])},{...frame(),ships:[[]]},{...frame(),tick:-1},{...frame(),ships:[frame().ships[0],frame().ships[0]]}])assert.throws(()=>encodeMotionDisplayFrame(f));
 const empty={...frame(),ships:[]};const restored=decodeMotionFrame(encodeMotionDisplayFrame(empty));assert.deepEqual({...restored,acknowledged:{...restored.acknowledged}},empty);
});
test('existing exact ordered wire preserves every projected byte across skips, corruption and scope reset',()=>{
 const sender=new MotionWireSender(),reader=new MotionWireReceiver(),reference=new MotionWireSender();let projectedBytes=0,exactBytes=0;
 for(let tick=1;tick<=240;tick++){
  const f=frame(tick);f.ships=Array.from({length:22},(_,i)=>['s'+i,1000*Math.sin(i+tick/30),1000*Math.cos(i+tick/30),40*Math.cos(i+tick/30),-40*Math.sin(i+tick/30),.07*(i+tick),.007,0,0]);
  const exact={type:'motion',matchId:'m',syncId:tick<121?'a':'b',data:motionToText(encodeMotionFrame(f))},message={...exact,data:motionToText(encodeMotionDisplayFrame(f))};
  const selected=sender.prepare(motionWireTarget(message.data),message),plain=reference.prepare(motionWireTarget(exact.data),exact);
  if(tick%7===0)continue;
  const held=reader.base,bad=Buffer.from(selected.packet);bad[12]^=1;assert.throws(()=>reader.decode({...message,motionWire:1,data:bad.toString('base64')}));assert.equal(reader.base,held);
  assert.deepEqual(reader.decode(decodeMotionWireEnvelope(encodeMotionWireEnvelope(message,selected))),message);assert.ok(sender.commit(selected));assert.ok(reference.commit(plain));projectedBytes+=selected.bytes;exactBytes+=plain.bytes;
 }
 assert.ok(projectedBytes<exactBytes*.85,`${projectedBytes}/${exactBytes}`);
});
test('observed state age counts gaps and missing states without replay/duplicate receipts refreshing freshness',()=>{
 const result=sampleStateAge([{at:100,ageMs:50,tick:1},{at:110,ageMs:1,tick:0},{at:200,ageMs:3,tick:1},{at:300,ageMs:100,tick:2}],0,400,50);
 assert.equal(result.samples,8);assert.equal(result.missingSamples,2);assert.deepEqual(result.ages,[50,100,150,200,100,150]);
 const steady=sampleStateAge([{at:0,ageMs:60,tick:1},{at:1000,ageMs:60,tick:2}],500,1500,250);assert.deepEqual(steady.ages,[560,810,60,310]);
 assert.deepEqual(sampleStateAge([],0,100,20),{ages:[],missingSamples:5,samples:5});
 for(const args of [[[],0,10,0],[[],10,0,1],[[{at:100,ageMs:-1,tick:1}],0,50,1]])assert.throws(()=>sampleStateAge(...args));
});
