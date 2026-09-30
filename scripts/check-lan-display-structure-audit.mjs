import test from 'node:test';
import assert from 'node:assert/strict';
import {expandAuditRecords,restoreStructure,definitionSignature,summarizeDefinitions} from './lib/lan-display-structure-audit.mjs';

test('record expansion preserves plain restore fields and counts nested batches',()=>{
 const layouts=[['a','b'],['spec']];
 const wire={$records:1,values:[[{$record:0,values:[1,[2,{$vector:[3,4]}]]}],[{$record:0,values:[5,[]]}]]};
 const expanded=expandAuditRecords(wire,layouts);
 assert.deepEqual(expanded,[{spec:{a:1,b:[2,{$vector:[3,4]}]}},{spec:{a:5,b:[]}}]);
 assert.deepEqual(restoreStructure(expanded),{fields:6,arrayElements:4,objects:4,arrays:3,scalars:3,envelopes:1});
 assert.deepEqual(restoreStructure(expandAuditRecords({$custom:{x:1}},[])),{fields:2,arrayElements:0,objects:2,arrays:0,scalars:1,envelopes:0});
 assert.throws(()=>expandAuditRecords({$record:0,values:[1]},layouts),/Invalid audit row/);
 assert.throws(()=>expandAuditRecords({$record:-1,values:[]},layouts),/Invalid audit record/);
});
test('signatures retain undefined, special numbers, order, holes, and reject capabilities',()=>{
 const hash=value=>definitionSignature(value).hash;
 for(const [a,b] of [[{}, {a:undefined}],[0,-0],[NaN,null],[Infinity,null],[[undefined],[]],[Array(1),[undefined]],[{a:1,b:2},{b:2,a:1}]])assert.notEqual(hash(a),hash(b));
 assert.equal(hash({a:[1,undefined]}),hash({a:[1,undefined]}));
 let invoked=0;assert.throws(()=>hash({get a(){invoked++;return 1;}}),/Audit accessor/);assert.equal(invoked,0);
 assert.throws(()=>hash({toJSON(){invoked++;return {};}}),/Non-data/);assert.equal(invoked,0);
 const cycle={};cycle.self=cycle;assert.throws(()=>hash(cycle),/Non-data/);
 assert.throws(()=>hash(new Map()),/Non-plain/);
 assert.equal(definitionSignature({a:[1,2]}).units,4);
});
test('content duplication does not imply object alias; cross-frame changes are binding-local',()=>{
 const previous=new Map(),previousRoots=new Map(),a={x:1},b={x:1};
 const first=summarizeDefinitions([{binding:'a',value:a},{binding:'b',value:b}],previous,previousRoots);
 assert.equal(first.distinctRoots,2);assert.equal(first.uniqueContents,1);assert.equal(first.units,4);assert.equal(first.uniqueUnits,2);
 assert.equal(first.comparableBindings,0);
 b.x=2;
 const next=summarizeDefinitions([{binding:'a',value:a},{binding:'b',value:b}],previous,previousRoots);
 assert.equal(next.changedBindings,1);assert.equal(next.comparableBindings,2);assert.equal(next.uniqueContents,2);assert.equal(next.retainedRoots,2);assert.equal(next.replacedRoots,0);
 const replaced=summarizeDefinitions([{binding:'a',value:{x:1}}],previous,previousRoots);assert.equal(replaced.changedBindings,0);assert.equal(replaced.replacedRoots,1);
 const alias=summarizeDefinitions([{binding:'a',value:a},{binding:'b',value:a}]);
 assert.equal(alias.distinctRoots,1);assert.equal(alias.occurrences,2);
});
