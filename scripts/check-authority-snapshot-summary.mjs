import assert from 'node:assert/strict';
import {test} from 'node:test';
import {summarizeCombatFrame, validateAuthoritySummary} from '../src/network/CombatFrameSummary.mjs';
import {summarizeCombatFrame as relaySummary} from '../server/lan-state.mjs';
import {prepareAuthoritySnapshot} from '../server/authority-snapshot.mjs';
import {encodeProjectedBinaryFrame, encodeBinaryState, decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};

const frame = (tick=7) => ({tick, ships:[{id:'a',state:{teamId:0}},{id:'b',state:{teamId:1}}],
  crafts:[{id:'fighter'}],craftSpecs:[],world:{time:tick/60},
  deployment:{rows:[{id:'a',teamId:0},{id:'b',teamId:1}]},
  muzzleEvents:{time:tick/60,latest:0,styles:[],events:[]}});
const packet = f => ({type:'snapshot',tick:f.tick,binary:encodeProjectedBinaryFrame(f).buffer,summary:summarizeCombatFrame(f,2,-1)});

test('semantic summary is shared, detached and unchanged by binary projection',()=>{
  assert.strictEqual(relaySummary,summarizeCombatFrame);
  for(const tick of [0,1,7,123456789]){
    const f=frame(tick),m=packet(f),bytes=encodeBinaryState('m',3,new Uint8Array(m.binary));
    assert.deepEqual(m.summary,summarizeCombatFrame(decodeBinaryState(bytes).frame,2,-1));
    f.ships[0].state.teamId=2;assert.equal(m.summary.ships[0].state.teamId,0);
  }
});
test('trusted IPC fast path preserves exact bytes and does not reconstruct a presentation graph',()=>{
  const m=packet(frame()), before=new Uint8Array(m.binary).slice();
  const actual=prepareAuthoritySnapshot(m,'m',9,2,6);
  assert.equal(actual.frame,undefined);assert.deepEqual(actual.summary,m.summary);
  assert.deepEqual(actual.bytes,encodeBinaryState('m',9,before));assert.deepEqual(new Uint8Array(m.binary),before);
  m.summary.ships[0].state.teamId=2;assert.equal(actual.summary.ships[0].state.teamId,0);
});
test('missing metadata, JSON and decoded-state adapters retain full validation',()=>{
  const f=frame(),m=packet(f),legacy={...m};delete legacy.summary;
  for(const input of [legacy,{type:'snapshot',tick:f.tick,json:JSON.stringify(f)}]){
    const r=prepareAuthoritySnapshot(input,'m',1,2,6);assert.equal(r.frame.crafts[0].id,'fighter');assert.deepEqual(r.summary,m.summary);
  }
  const r=prepareAuthoritySnapshot(m,'m',1,2,6,true);assert.equal(r.frame.crafts[0].id,'fighter');assert.deepEqual(r.summary,m.summary);
  const bad=frame();bad.crafts[0].id='a';
  assert.throws(()=>prepareAuthoritySnapshot({tick:7,binary:encodeProjectedBinaryFrame(bad).buffer},'m',1,2,6));
  assert.throws(()=>prepareAuthoritySnapshot({...m,binary:encodeProjectedBinaryFrame(bad).buffer},'m',1,2,6,true));
});
test('worker semantic validation rejects invalid crafts, world, muzzle window and deployment',()=>{
  for(const change of [f=>delete f.ships[0],f=>delete f.deployment.rows[0],f=>f.crafts.push({id:'fighter'}),f=>f.crafts[0].id='a',f=>f.world=null,
    f=>f.craftSpecs={},f=>f.muzzleEvents.latest=-1,f=>f.deployment.rows[0].teamId=1,
    f=>f.deployment.rows.push({...f.deployment.rows[0]})]){
    const f=frame();change(f);assert.throws(()=>summarizeCombatFrame(f,2,-1));
  }
});
test('malformed IPC summaries never silently fall back to a valid binary frame',()=>{
  const valid=packet(frame());
  for(const change of [m=>m.summary=null,m=>m.summary=[],m=>m.summary.tick=8,m=>m.summary.tick=6,
    m=>m.summary.tick=7.5,m=>delete m.summary.ships[0],m=>delete m.summary.deployment.rows[0],m=>m.summary.ships.pop(),m=>m.summary.ships[1].id='a',
    m=>m.summary.ships[0].id='x'.repeat(257),m=>m.summary.ships[0].state.teamId=-1,
    m=>m.summary.deployment.rows[0].teamId=1,m=>m.summary.deployment.rows[0].id='missing',
    m=>m.summary.deployment.rows.push({...m.summary.deployment.rows[0]})]){
    const m=structuredClone(valid);change(m);assert.throws(()=>prepareAuthoritySnapshot(m,'m',1,2,6));
  }
  assert.throws(()=>prepareAuthoritySnapshot(valid,'m',1,2,7));
});
test('metadata strips extra IPC fields and keeps byte budget and credit tick checks',()=>{
  const m=packet(frame());m.summary.unneeded={world:'large graph'};
  assert.equal(validateAuthoritySummary(m.summary,2,6,7).unneeded,undefined);
  assert.throws(()=>prepareAuthoritySnapshot({...m,binary:new Uint8Array(protocol.maxSnapshotBytes+1).buffer},'m',1,2,6));
  assert.throws(()=>prepareAuthoritySnapshot({...m,tick:8},'m',1,2,6));
  assert.throws(()=>prepareAuthoritySnapshot({tick:8,json:JSON.stringify(frame())},'m',1,2,6));
});
