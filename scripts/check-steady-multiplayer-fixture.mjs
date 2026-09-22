import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transform} from 'esbuild';
import {firstDifferences} from './compare-steady-multiplayer.mjs';
import {primedSteadyControls,steadyInputTuple,steadyFixturePlugin,transformSteadyFixture} from './lib/steady-multiplayer-fixture.mjs';
const state={connected:true,online:true,received:900,input:{keys:1,aim:[0,0],firing:true,pointerActive:true,actions:[]},queued:[]};
assert.equal(primedSteadyControls([[0,state]],1000),true);
for(const patch of [{online:false},{connected:false},{received:500},{received:1001},{queued:[{id:1,kind:'group',value:3}]},{input:{...state.input,keys:0}},{input:{...state.input,firing:false}},{input:{...state.input,pointerActive:false}},{input:{...state.input,aim:[1,0]}}])assert.equal(primedSteadyControls([[0,{...state,...patch}]],1000),false);
assert.equal(primedSteadyControls([],1000),false);
const setup={...state,input:{...state.input,keys:0,firing:false},queued:[{id:1,kind:'group',value:3}]};
assert.equal(primedSteadyControls([[0,setup]],1000,true),true);
assert.equal(primedSteadyControls([[0,{...state,queued:setup.queued}]],1000,true,true),true);
assert.equal(primedSteadyControls([[0,setup]],1000,true,true),false);
assert.equal(primedSteadyControls([[0,setup]],1000),false);
assert.equal(primedSteadyControls([[0,state]],1000,true),false);
assert.deepEqual(steadyInputTuple(0,{...setup,queued:[...setup.queued,...setup.queued]}),steadyInputTuple(0,setup));
for(const file of ['src/network/host.worker.ts','src/network/LanBattle.tsx']) {
 const source=fs.readFileSync(file,'utf8'),id=process.cwd()+'/'+file;
 assert.equal(steadyFixturePlugin(false).transform(source,id),null);
 const transformed=transformSteadyFixture(source,id);assert.notEqual(transformed,source);
 await transform(transformed,{loader:file.endsWith('tsx')?'tsx':'ts'});
 await transform(transformSteadyFixture(source,id,true),{loader:file.endsWith('tsx')?'tsx':'ts'});
 assert.throws(()=>transformSteadyFixture('anchor missing',id),/anchor changed/);
}
assert.equal(transformSteadyFixture('unrelated','src/unrelated.ts'),null);
console.log('Steady fixture: priming boundaries, action deduplication, opt-in isolation, anchor guards and TS compilation passed');

assert.deepEqual(firstDifferences({v:new Uint8Array([1,2])},{v:new Uint8Array([1,2])}),[]);
assert.equal(firstDifferences({a:1,b:2},{a:2,b:3},1).length,1);
assert.equal(firstDifferences({a:[1]},{a:[2]})[0].path,'frame.a.0');
console.log('Whole-checkpoint difference reporting checks passed');
