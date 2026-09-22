import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import {transform} from 'esbuild';
const {code}=await transform(await fs.readFile('src/network/LanSocketShared.ts','utf8'),{loader:'ts',format:'esm',target:'es2022'});
const {closeTransport,closeArguments}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const fixture=()=>{const calls=[];return {calls,socket:{close(...args){calls.push(args);}}};};
test('normal no-code close omits native WebIDL arguments instead of passing undefined as zero',()=>{
 const f=fixture();const a=closeArguments();closeTransport(f.socket,a.code,a.reason);assert.deepEqual(f.calls,[[]]);
});
test('reason-only close uses standard normal-closure code and preserves reason',()=>{
 const f=fixture();const a=closeArguments(undefined,'done');closeTransport(f.socket,a.code,a.reason);assert.deepEqual(f.calls,[[1000,'done']]);
});
test('explicit close preserves valid code/reason and WebIDL unsigned-short normalization',()=>{
 const f=fixture();for(const code of [1000,4001,65536+4002]){const a=closeArguments(code,'retry');closeTransport(f.socket,a.code,a.reason);}assert.deepEqual(f.calls,[[1000,'retry'],[4001,'retry'],[4002,'retry']]);
});
test('invalid close arguments are rejected before transport call',()=>{
 for(const code of [0,NaN,Infinity,1006,1011,4999.99+1,2999])assert.throws(()=>closeArguments(code),{name:'InvalidAccessError'});
 assert.throws(()=>closeArguments(4000,'a'.repeat(124)),{name:'SyntaxError'});assert.throws(()=>closeArguments(4000,'中'.repeat(42)),{name:'SyntaxError'});
 assert.equal(closeArguments(4000,'中'.repeat(41)).reason,'中'.repeat(41));
});
