import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeParticleMotionResidual as encode,decodeParticleMotionResidual as decode,validateParticleMotion,particleReferenceAngle,particleReferenceDrag} from '../src/engine/visual/ParticleMotionReference.mjs';
const bytes = new DataView(new ArrayBuffer(8));
const shifted = (n,delta) => {bytes.setFloat64(0,n);bytes.setBigUint64(0,bytes.getBigUint64(0)+BigInt(delta));return bytes.getFloat64(0);};
test('motion residuals restore exact bits over mantissa carries, both signs, subnormals and literal fallbacks',()=>{
 const samples=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,1,-1,2,-2,65536,-65536,1e9,-1e9,1e12,-1e12];
 let seed=17;for(let i=0;i<10000;i++){seed=Math.imul(seed,1664525)+1013904223|0;samples.push(seed/2147483648*1e8);}
 for(const n of samples)for(const delta of [-65536,-65535,-129,-1,0,1,128,65535,65536]){
  let other;try{other=shifted(n,delta);}catch{continue;}
  if(!Number.isFinite(other)||Math.abs(other)>1e12)continue;
  const actual=[n,other,-0,0],base=[other,n,0,-0],before=actual.slice(),prior=base.slice(),wire=encode(actual,base);
  assert.deepEqual(decode(wire,base),actual);assert.deepEqual(decode(JSON.parse(JSON.stringify(wire)),base),actual);
  assert.deepEqual(actual,before);assert.deepEqual(base,prior);
 }
});
test('legacy absolute motion stays compatible and returned arrays do not alias the wire',()=>{
 const value=[-0,10,20,30],out=decode(value,[]);assert.deepEqual(out,value);out[1]=99;assert.equal(value[1],10);
 assert.deepEqual(encode([1,2,3,4],[1,2,3,4]),[0,0,0,0,0]);
 const fallback=encode([1e12,-1e12,0,-0],[-1e12,1e12,-0,0]);assert.equal(fallback[0]&15,15);assert.deepEqual(decode(fallback,[-1e12,1e12,-0,0]),[1e12,-1e12,0,-0]);
});
test('malformed masks, residual ranges, sparse data and overflow are rejected before output',()=>{
 for(const wire of [null,{},[],[1,2,3],[1,2,3,4,5,6],[NaN,0,0,0],[256,0,0,0,0],[-0,0,0,0,0],[16,0,0,0,0],[17,1,0,0,0],[0,65536,0,0,0],[0,.5,0,0,0],[0,-0,0,0,0],new Array(4),[15,Infinity,0,0,0]])assert.throws(()=>validateParticleMotion(wire));
 assert.throws(()=>decode([0,-1,0,0,0],[0,0,0,0]));
 assert.throws(()=>decode([0,1,0,0,0],[1e12,0,0,0]));
 assert.throws(()=>encode([0,0,0,0],[0,0,NaN,0]));
});
test('frozen compression reference does not call implementation-dependent transcendental functions',()=>{
 const original=[Math.sin,Math.cos,Math.exp],angles=[0,.1,Math.PI/2,Math.PI,3*Math.PI/2,2*Math.PI];
 const expected=angles.map(a=>[Math.cos(a)*70,Math.sin(a)*70]);
 try{Math.sin=Math.cos=Math.exp=()=>{throw Error('platform-dependent reference');};
  angles.forEach((a,i)=>{const v=particleReferenceAngle(a,70);for(let j=0;j<2;j++)assert.ok(Math.abs(v[j]-expected[i][j])<1e-12);});
  assert.equal(particleReferenceDrag(0),1);assert.ok(particleReferenceDrag(-.05)>.95);
 }finally{[Math.sin,Math.cos,Math.exp]=original;}
 for(const n of [NaN,Infinity,-1,7])assert.throws(()=>particleReferenceAngle(n,1));
 for(const n of [NaN,Infinity,-.101,.1])assert.throws(()=>particleReferenceDrag(n));
});
