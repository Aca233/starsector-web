import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeNetworkRecord} from '../desktop/network-diagnostic-record.mjs';
const record=hud=>normalizeNetworkRecord({version:1,event:'sample',transport:'lan',hudAgeMs:0,hud});
test('render diagnostics preserve measured draw counts and actual texture capacity independently of Hz',()=>{
 const r=record({hz:17,fps:11,renderDrawCalls:523,spriteDrawCalls:300,spriteTextureSlots:4,privateGpuString:'not retained'});
 assert.equal(r.hud.renderDrawCalls,523);assert.equal(r.hud.spriteDrawCalls,300);assert.equal(r.hud.spriteTextureSlots,4);assert.equal(r.hud.hz,17);assert.equal(r.hud.fps,11);assert.ok(!JSON.stringify(r).includes('not retained'));
 assert.equal(record({spriteTextureSlots:1}).hud.spriteTextureSlots,1);
});
test('older/malformed render diagnostics remain unknown rather than claiming active batching',()=>{
 const r=record({renderDrawCalls:Infinity,spriteDrawCalls:-1,spriteTextureSlots:'4'});for(const k of ['renderDrawCalls','spriteDrawCalls','spriteTextureSlots'])assert.equal(r.hud[k],null);
 assert.equal(record({}).hud.spriteTextureSlots,null);
});
