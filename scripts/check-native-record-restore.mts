// Keep all existing adversarial receiver tests and add static-plan contracts.
import './check-receiver-fields.mts';
import assert from 'node:assert/strict';import {test} from 'node:test';
import shapes from './lib/native-restore-shapes.json';
import {nativeRecordRestorer} from '../src/network/NativeRecordRestore.generated';
import {world} from './lib/native-projectile-fixture.mts';
import {captureCombat,applyCombatSnapshots as before} from 'receiver-fields-control';
import {applyCombatSnapshots as after} from 'receiver-fields-candidate';
import {decodeBinaryFrame,encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
for(const [id,keys] of shapes.entries())test(`fixed layout ${id}: all fields, eager previous reads, nested identity, depth/throw order`,()=>{
 const restore=nativeRecordRestorer(keys);assert.ok(restore);assert.equal(nativeRecordRestorer(keys.slice()),restore);
 const values=keys.map((k,i)=>[null,i,undefined,{nested:i},false,'value'][i%6]);
 const run=(fixed:boolean,depth:number,throwAt=-1)=>{const events:any[]=[];const state=Object.fromEntries(keys.map(k=>[k,{previous:k}]));const target=new Proxy(state,{get(t,k){events.push(['read',k]);return t[k];},set(t,k,v){events.push(['write',k]);t[k]=v;return true;}});const input=new Proxy(values,{get(t,k){if(typeof k==='string'&&/^\d+$/.test(k))events.push(['value',k]);return t[k];}});
  const decode=(v:any,p:any,d:number)=>{events.push(['decode',v.nested,d]);if(v.nested===throwAt)throw Error('nested failure');p.restored=v.nested;return p;};let error=null;
  try{if(fixed)restore(input,target,depth,decode);else for(let i=0;i<keys.length;i++){const key=keys[i],value=input[i],previous=target[key];if(depth>64)throw Error('Snapshot nesting exceeds limit');target[key]=value===null||typeof value!=='object'?value:decode(value,previous,depth);}}catch(e){error=e.message;}
  return {events,state,error};};
 for(const depth of [0,64,65])for(const throwAt of [-1,3])assert.deepEqual(run(true,depth,throwAt),run(false,depth,throwAt));
 assert.equal(nativeRecordRestorer([...keys,'unknown']),undefined);const changed=keys.slice();changed[1]='unknown';assert.equal(nativeRecordRestorer(changed),undefined);
 const reordered=keys.slice();[reordered[0],reordered[1]]=[reordered[1],reordered[0]];assert.equal(nativeRecordRestorer(reordered),undefined);
});
test('arbitrary/empty/denied layouts never match compiled plans',()=>{for(const k of [[],['__proto__'],['constructor'],['foo','bar']])assert.equal(nativeRecordRestorer(k),undefined);});
test('22-ship native world pair restores retain complete world and both endpoint callbacks',()=>{
 const take=(e:any)=>encodeProjectedBinaryFrame(captureCombat(e,1,{},0,true,true,true,true,true),true);
 const source=world(),a=world(),b=world();const sa=a.playerShip.pos,sb=b.playerShip.pos;
 // Native fixture has the same 22-ship world used by the complete-pipeline tests.
 for(let tick=1;tick<=120;tick++){
  source.fixedUpdate(1/60);const f=decodeBinaryFrame(encodeProjectedBinaryFrame(captureCombat(source,tick,{},0,true,true,true,true,true),true));
  const seenA:any[]=[],seenB:any[]=[];const earlier=structuredClone(f);earlier.tick=tick-1;
  before(a,[earlier,f],tick===1,x=>seenA.push([x.tick,a.playerShip.pos.x]),{nativeTargeting:true,nativeProjection:true});after(b,[earlier,f],tick===1,x=>seenB.push([x.tick,b.playerShip.pos.x]),{nativeTargeting:true,nativeProjection:true});
  assert.deepEqual(take(b),take(a));assert.deepEqual(seenB,seenA);assert.equal(a.playerShip.pos,sa);assert.equal(b.playerShip.pos,sb);
 }
});
