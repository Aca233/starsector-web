import assert from 'node:assert/strict';
import {test} from 'node:test';
import {editAiFleet} from '../src/network/room-fleet.mjs';
const limit=1048576;
const design={version:1,id:'ai-test',name:'测试配装',hullId:'onslaught',weapons:{},hullMods:[],sMods:[],captainSkills:{},capacitors:10,vents:10,groups:[],updatedAt:0};
const base=()=>({assignment:'teams',aiHulls:[[],[]],aiRevision:0,battleSize:400});
const edit=(room,command)=>editAiFleet(room,{assignment:room.assignment,team:0,baseRevision:room.aiRevision,...command},limit,10);
const seed=()=>edit(base(),{operation:'add',design,count:2});

test('copy entire group to the other team preserves source and shares exact loadout',()=>{
  const room=seed(),original=structuredClone(room),key=room.aiHulls[0][0];
  const copied=edit(room,{operation:'add',hull:key,count:2,team:1});
  assert.deepEqual(room,original);assert.deepEqual(copied.aiHulls,[[key,key],[key,key]]);
  assert.equal(Object.keys(copied.aiLoadouts).length,1);assert.deepEqual(copied.aiLoadouts[key],room.aiLoadouts[key]);
});
test('copy into an existing identical group adds quantity without creating another configuration',()=>{
  const room=seed(),key=room.aiHulls[0][0];let copied=edit(room,{operation:'add',hull:key,count:2,team:1});
  copied=edit(copied,{operation:'add',hull:key,count:2,team:1});
  assert.equal(copied.aiHulls[1].length,4);assert.equal(Object.keys(copied.aiLoadouts).length,1);
});
test('same hull with different equipment remains a separate group after copying',()=>{
  let room=seed();const first=room.aiHulls[0][0];room=edit(room,{operation:'add',design:{...design,id:'different',capacitors:11},count:1,team:1});
  const second=room.aiHulls[1][0];assert.notEqual(first,second);
  room=edit(room,{operation:'add',hull:first,count:2,team:1});assert.deepEqual(room.aiHulls[1],[second,first,first]);
});
test('move still removes only the source group and keeps copied loadout valid',()=>{
  const room=seed(),key=room.aiHulls[0][0];const moved=edit(room,{operation:'move',hull:key,targetTeam:1});
  assert.deepEqual(moved.aiHulls,[[],[key,key]]);assert.ok(moved.aiLoadouts[key]);
});
test('removing one copy never prunes the other team configuration',()=>{
  const room=seed(),key=room.aiHulls[0][0];let copied=edit(room,{operation:'add',hull:key,count:2,team:1});
  copied=edit(copied,{operation:'remove',hull:key});assert.ok(copied.aiLoadouts[key]);assert.equal(copied.aiHulls[1].length,2);
  copied=edit(copied,{operation:'remove',team:1,hull:key});assert.equal(Object.keys(copied.aiLoadouts).length,0);
});
test('stale copy and absent source configuration are rejected without partial updates',()=>{
  const room=seed(),original=structuredClone(room),key=room.aiHulls[0][0];
  assert.throws(()=>edit(room,{operation:'add',hull:key,team:1,count:2,baseRevision:0}),/已变化/);
  assert.throws(()=>edit(room,{operation:'add',hull:'fit:missing',team:1,count:2}),/不存在/);assert.deepEqual(room,original);
});
test('invalid copy quantities and communication-budget overflow do not mutate the fleet',()=>{
  const room=seed(),original=structuredClone(room),key=room.aiHulls[0][0];
  for(const count of [0,-1,1.5,NaN,Infinity,1000000])assert.throws(()=>edit(room,{operation:'add',hull:key,team:1,count}));
  assert.deepEqual(room,original);
});
test('solo mode cannot move groups; last-ship removal stays an explicit remove',()=>{
  let room=seed(),key=room.aiHulls[0][0];room={...room,assignment:'solo'};
  assert.throws(()=>edit(room,{operation:'move',hull:key,targetTeam:1}),/个人战/);
  room=edit(room,{operation:'set-count',hull:key,count:1});
  assert.throws(()=>edit(room,{operation:'adjust',hull:key,count:-1}),/最后一艘/);
  room=edit(room,{operation:'remove',hull:key});assert.equal(room.aiHulls.flat().length,0);
});
