import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLanBytePatch, LAN_DELTA_MAX_BYTES} from '../src/network/LanBinaryDelta.mjs';

// Independent byte-at-a-time oracle for candidate selection. No DataView word
// comparisons, production decoder, motion math or exported matcher internals.
function reference(base, target) {
  const newest=new Int32Array(65536).fill(-1),older=new Int32Array(65536).fill(-1);
  const word=(a,i)=>a[i]|a[i+1]<<8|a[i+2]<<16|a[i+3]<<24;
  const hash=(a,i)=>Math.imul(word(a,i)^word(a,i+8),0x9e3779b1)>>>16;
  for(let i=0;i+16<=base.length;i+=4){const h=hash(base,i);older[h]=newest[h];newest[h]=i;}
  const output=[],limit=Math.ceil(target.length/2);let at=0,literalAt=0,shift=0;
  const vint=n=>{while(n>=128){output.push((n&127)|128);n>>>=7;}output.push(n);};
  const literal=end=>{const n=end-literalAt;if(!n)return true;if(output.length+n+5>limit)return false;vint(n*2);for(let i=literalAt;i<end;i++)output.push(target[i]);return true;};
  while(at+16<=target.length){let best=-1,length=0;const h=hash(target,at);
    for(const c of [at+shift,newest[h],older[h]]){if(c<0||c+16>base.length)continue;let n=0;
      while(c+n<base.length&&at+n<target.length&&base[c+n]===target[at+n])n++;
      if(n>=16&&n>length){best=c;length=n;}}
    if(length>=16){if(!literal(at)||output.length+10>limit)return null;shift=best-at;vint(length*2+1);vint(best);at+=length;literalAt=at;}else at++;
  }
  return literal(target.length)?Uint8Array.from(output):null;
}
function restore(base, patch, size){
  const result=new Uint8Array(size);let at=0,written=0,ops=0;
  const vint=()=>{let v=0;for(let i=0;i<5;i++){assert.ok(at<patch.length);const b=patch[at++];v+=(b&127)*2**(7*i);if(!(b&128))return v;}throw Error('varint');};
  while(at<patch.length){assert.ok(++ops<=262144);const tag=vint(),n=Math.floor(tag/2);assert.ok(n>0&&written+n<=size);
    if(tag&1){const offset=vint();assert.ok(offset+n<=base.length);result.set(base.subarray(offset,offset+n),written);}
    else{assert.ok(at+n<=patch.length);result.set(patch.subarray(at,at+n),written);at+=n;}written+=n;
  }
  assert.equal(written,size);return result;
}
let seed=0x1bb8d310;
const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
function check(base,target){
  const savedBase=base.slice(),savedTarget=target.slice(),actual=createLanBytePatch(base,target);
  assert.deepEqual(actual,reference(base,target));assert.deepEqual(base,savedBase);assert.deepEqual(target,savedTarget);
  if(actual){assert.ok(actual.length<=Math.ceil(target.length/2));assert.deepEqual(restore(base,actual,target.length),target);}
  return actual;
}
test('continuity matcher agrees byte-for-byte with scalar oracle across seeded insertions/deletions/edits',()=>{
  let accepted=0;
  for(let k=0;k<400;k++){
    const base=Uint8Array.from({length:128+rand()%8192},()=>rand()&255);
    if(k%3===0)for(let i=0;i<base.length;i++)base[i]=i%31;
    let target=base.slice();
    const cut=rand()%target.length,insert=rand()%33;
    if(k%2){const next=new Uint8Array(target.length+insert);next.set(target.subarray(0,cut));next.set(Uint8Array.from({length:insert},()=>rand()&255),cut);next.set(target.subarray(cut),cut+insert);target=next;}
    else target=Uint8Array.from([...target.subarray(0,cut),...target.subarray(Math.min(target.length,cut+insert))]);
    for(let i=0;i<1+rand()%40;i++)target[rand()%target.length]=rand()&255;
    if(check(base,target))accepted++;
  }
  assert.ok(accepted>300,'Exercise actual patches, not only full fallbacks');
});
test('unaligned views, word tails and every short boundary preserve selected bytes and ownership',()=>{
  for(let offset=0;offset<8;offset++)for(const size of [1,15,16,17,31,32,33,63,64,65,127,128,129,1023]){
    const slab=Uint8Array.from({length:size+offset+9},(_,i)=>i*31&255),base=slab.subarray(offset,offset+size);
    const target=base.slice();target[Math.floor(size/2)]^=127;const expected=check(base,target);
    assert.deepEqual(createLanBytePatch(new DataView(slab.buffer,offset,size),target.buffer),expected);
    if(expected){const prior=expected.slice();slab.fill(0);target.fill(0);assert.deepEqual(expected,prior);}
  }
});
test('repetitive/colliding bases and shifted long copies remain bounded and reconstruct exactly',()=>{
  for(const length of [4096,65536,LAN_DELTA_MAX_BYTES]){
    const base=Uint8Array.from({length},(_,i)=>i%97<80?0:i%251),target=new Uint8Array(length+0);
    target.set(base.subarray(7),0);target.fill(93,length-7);
    for(let i=99;i<length;i+=311)target[i]^=3;
    const patch=createLanBytePatch(base,target);assert.ok(patch);assert.deepEqual(restore(base,patch,target.length),target);
  }
});
test('empty, over-budget and unrelated data retain ordinary full-packet fallback',()=>{
  for(const [base,target] of [[new Uint8Array(),new Uint8Array(64)],[new Uint8Array(64),new Uint8Array()],
    [new Uint8Array(LAN_DELTA_MAX_BYTES+1),new Uint8Array(32)],[new Uint8Array(32),new Uint8Array(LAN_DELTA_MAX_BYTES+1)]])assert.equal(createLanBytePatch(base,target),null);
  const a=Uint8Array.from({length:4096},()=>rand()&255),b=Uint8Array.from({length:4096},()=>rand()&255);assert.equal(check(a,b),null);
});
