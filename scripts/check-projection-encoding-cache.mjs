import assert from 'node:assert/strict';
import {test} from 'node:test';
import {encodeProjectedBinaryFrame,decodeBinaryFrame,ProjectionEncodingCache} from '../src/network/BinarySnapshot.mjs';
import config from '../src/network/protocol.json' with {type:'json'};
const frame=()=>({tick:7,acknowledged:{0:9},simulationMs:4,ships:Array.from({length:22},(_,i)=>({id:'ship'+i,values:Array.from({length:500},(_,j)=>[i,j,i*j/7])})),world:{combatTime:7/60,values:['舰船',null,true,{pos:[3,4]}]},crafts:[],craftSpecs:{},layouts:[['pos','vel']],sounds:[{id:1,key:'fire'}]});
test('same immutable capture re-encodes mutable headers/sounds but not large bodies; wire bytes stay exact',()=>{
 const f=frame(),cache=new ProjectionEncodingCache(f),first=encodeProjectedBinaryFrame(f,true,cache);assert.deepEqual(first,encodeProjectedBinaryFrame(f,true));assert.equal(cache.hits,0);assert.ok(cache.bytes>10000&&cache.bytes<=config.maxSnapshotBytes);
 const transferred=structuredClone(first,{transfer:[first.buffer]});assert.equal(first.byteLength,0);
 const b={...f,simulationMs:0,captureMs:2,encodeMs:1.5,realtimeRatio:0.99,sounds:[{id:2,key:'shield'}]};
 const second=encodeProjectedBinaryFrame(b,true,cache);assert.deepEqual(second,encodeProjectedBinaryFrame(b,true));assert.ok(cache.hits>=5);assert.equal(decodeBinaryFrame(transferred).sounds[0].id,1);assert.equal(decodeBinaryFrame(second).sounds[0].id,2);assert.equal(decodeBinaryFrame(second).simulationMs,0);
 second.fill(0);assert.deepEqual(encodeProjectedBinaryFrame(b,true,cache),encodeProjectedBinaryFrame(b,true));
});
test('a new body identity is never answered from an earlier fragment, even with the same cache',()=>{
 const f=frame(),cache=new ProjectionEncodingCache(f);encodeProjectedBinaryFrame(f,true,cache);
 const next={...f,tick:8,world:{combatTime:8/60,other:'new'},ships:[{id:'different'}]};assert.deepEqual(encodeProjectedBinaryFrame(next,true,cache),encodeProjectedBinaryFrame(next,true));
});
test('fragment limit bounds retained bytes, all excess fields still encode losslessly',()=>{
 const f={tick:1,world:{x:'x'.repeat(config.maxSnapshotBytes+1)}},cache=new ProjectionEncodingCache(f);assert.throws(()=>encodeProjectedBinaryFrame(f,true,cache),/budget/);assert.equal(cache.bytes,0);
 const fresh=frame();assert.deepEqual(encodeProjectedBinaryFrame(fresh,true),encodeProjectedBinaryFrame(fresh,true,new ProjectionEncodingCache(fresh)));
});
test('fallback/failed encodes cannot leak a cache into unrelated singleton encoder calls',()=>{
 const f=frame(),cache=new ProjectionEncodingCache(f);encodeProjectedBinaryFrame(f,true,cache);
 assert.equal(encodeProjectedBinaryFrame({...f,invalid:NaN},true,cache),null);
 f.world.values.push('new after old cache lifetime');const uncached=encodeProjectedBinaryFrame(f,true);assert.equal(decodeBinaryFrame(uncached).world.values.at(-1),'new after old cache lifetime');assert.deepEqual(uncached,encodeProjectedBinaryFrame(f,true,new ProjectionEncodingCache(f)));
});
test('both numeric encoder modes produce identical cached and uncached bytes',()=>{
 const f=frame(),cache=new ProjectionEncodingCache(f);const old=encodeProjectedBinaryFrame(f,false,cache);assert.deepEqual(old,encodeProjectedBinaryFrame(f,true,cache));assert.deepEqual(old,encodeProjectedBinaryFrame(f,false));
});
