import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const baseline = process.env.RELAY_PROJECTION_BASELINE ? await import(pathToFileURL(path.resolve(process.env.RELAY_PROJECTION_BASELINE)).href) : null;
const exactResult=(decode,bytes)=>{try{return {value:decode(bytes)};}catch(error){return {error:{name:error.name,message:error.message}};}};
import {encode} from '@msgpack/msgpack';
import {decodeBinaryState,decodeBinaryStateForRelay,encodeBinaryState,encodeProjectedBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {summarizeCombatFrame} from '../src/network/CombatFrameSummary.mjs';
import {KEY_DICTIONARY} from '../src/network/KeyDictionary.mjs';

const wrap = payload => encodeBinaryState('relay-equivalence',7,payload);
const frame = tick => ({tick, ships:[{id:'a',state:{teamId:0,x:1.75}},{id:'b',state:{teamId:1,x:-33}}],
  crafts:[{id:'fighter',state:{x:4}}],craftSpecs:[{id:'spec',weapons:[1,2,3]}],
  world:{time:tick/60,projectiles:[{id:'p',x:3.4,y:5.6,visual:['beam',null,true]}]},
  deployment:{rows:[{id:'a',teamId:0,hull:100},{id:'b',teamId:1,hull:92}]}});
function result(decode, bytes) {
  try {const state=decode(bytes);return {ok:true,matchId:state.matchId,seq:state.seq,summary:summarizeCombatFrame(state.frame,2,-1)};}
  catch {return {ok:false};}
}
function equivalent(bytes, expected) {
  const before=Buffer.from(bytes),full=result(decodeBinaryState,bytes),projected=result(decodeBinaryStateForRelay,bytes);
  assert.deepEqual(projected,full);assert.deepEqual(Buffer.from(bytes),before);
  if(baseline)assert.deepEqual(exactResult(decodeBinaryStateForRelay,bytes),exactResult(baseline.decodeBinaryStateForRelay,bytes));
  if(expected!==undefined)assert.equal(full.ok,expected);
}
const rawMap = pairs => Buffer.concat([Buffer.from([0x80+pairs.length]),...pairs.flatMap(([key,value])=>[typeof key==='string'?encode(key):key,value])]);
function branch(bytes, dictionary=false) {
  const f=frame(1),payload=rawMap(Object.entries(f).map(([k,v])=>[k,k==='world'?rawMap([['ignored',bytes]]):encode(v)]));
  return wrap(dictionary?Buffer.concat([Buffer.from('SWF2'),payload]):payload);
}

test('relay selection preserves summary, original payload and full recipient world for both encodings',()=>{
  for(const encoder of [encode,encodeProjectedBinaryFrame])for(let tick=0;tick<80;tick++){
    const f=frame(tick);f.world.projectiles=Array.from({length:tick},(_,i)=>({id:'p'+i,x:i+0.125,y:-i,tuple:[NaN,Infinity,-0,2**40]}));
    // Projected encoder correctly refuses non-finite producer input; ordinary decoder still accepts its legacy tags.
    if(encoder===encodeProjectedBinaryFrame)f.world.projectiles.forEach(p=>p.tuple=[1.25,2**40,-(2**40),null]);
    const bytes=wrap(encoder(f));equivalent(bytes,true);
    const full=decodeBinaryState(bytes),small=decodeBinaryStateForRelay(bytes);
    assert.deepEqual(full.frame.craftSpecs,f.craftSpecs);assert.equal(full.frame.ships[0].state.x,1.75);assert.equal(full.frame.world.projectiles.length,tick);
    assert.deepEqual(small.frame.world,{});assert.deepEqual(small.frame.craftSpecs,[]);assert.equal(small.frame.ships[0].state.x,undefined);
  }
});

test('wrong containers, ID/team/tick/deployment/muzzle semantics reject identically',()=>{
  const bad=[f=>f.tick=-1,f=>f.tick=1.5,f=>f.tick=null,f=>f.ships={},f=>f.ships[0]=null,
    f=>f.ships[0]=[],f=>f.ships[0].state=[],f=>f.ships[0].state.teamId=-1,f=>f.ships[0].state.teamId='0',
    f=>f.ships[0].id='',f=>f.ships[1].id='a',f=>f.crafts[0].id='a',f=>f.crafts=[null],
    f=>f.crafts={},f=>f.craftSpecs={},f=>f.world=[],f=>f.world=null,
    f=>f.deployment=[],f=>f.deployment.rows={},f=>f.deployment.rows[0]=null,
    f=>f.deployment.rows[0].teamId=1,f=>f.deployment.rows.push(f.deployment.rows[0]),
    f=>f.deployment.rows[0].id='fighter',f=>f.muzzleEvents={},f=>f.muzzleEvents=[null]];
  for(const mutate of bad)for(const encoder of [encode,encodeProjectedBinaryFrame]){const f=frame(1);mutate(f);equivalent(wrap(encoder(f)),false);}
  for(const deployment of [null,undefined]){const f=frame(1);f.deployment=deployment;equivalent(wrap(encode(f)),true);}
});

test('discarded branches still validate all map keys, tags, depth, bounds and UTF8 compatibility',()=>{
  const poison=['__proto__','constructor','prototype'].map(k=>rawMap([[k,encode(1)]]));
  const bad=[...poison,rawMap([[encode(true),encode(1)]]),rawMap([[encode([]),encode(1)]]),
    rawMap([[encode(KEY_DICTIONARY.length+1),encode(1)]]),Buffer.from([0xc1]),Buffer.from([0xc4,0]),
    Buffer.from([0xdd,0xff,0xff,0xff,0xff]),Buffer.from([0xd9,8,65]),Buffer.from([0xcb,1,2]),
    Buffer.concat([Buffer.alloc(129,0x91),Buffer.from([0])])];
  for(const b of bad)for(const dict of [false,true])equivalent(branch(b,dict),false);
  // Legacy short-string decoder accepts some malformed UTF8; do not silently change that contract.
  for(const b of [Buffer.from([0xa1,0xff]),Buffer.from([0xa2,0xc0,0xaf]),encode('\uFEFF'+'z'.repeat(220)),encode('\uFEFFx')])
    for(const dict of [false,true])equivalent(branch(b,dict));
  // A malformed short value invokes library fallback; poison appearing later must still fail.
  equivalent(branch(rawMap([['utf8',Buffer.from([0xa1,0xff])],['constructor',encode(1)]])),false);
  const good=wrap(encode(frame(1)));
  for(let n=0;n<good.length;n++)equivalent(good.subarray(0,n),false);
  equivalent(Buffer.concat([good,Buffer.from([0])]),false);
  const duplicates=rawMap([...Object.entries(frame(1)).map(([k,v])=>[k,encode(v)]),['tick',encode(9)]]);
  equivalent(wrap(duplicates),true);assert.equal(decodeBinaryStateForRelay(wrap(duplicates)).frame.tick,9);
});

test('seeded bit mutations retain full decoder acceptance and semantic summary',()=>{
  let seed=0x516ab8;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  for(const encoder of [encode,encodeProjectedBinaryFrame]){
    const source=wrap(encoder(frame(4)));
    for(let i=0;i<1600;i++){const bytes=Buffer.from(source);for(let j=0,n=1+random()%3;j<n;j++)bytes[random()%bytes.length]^=1<<(random()%8);equivalent(bytes);}
  }
});

test('skipped numeric widths, valid dictionary numeric keys and complete muzzle fields preserve legacy semantics',()=>{
  const widths={0xcc:1,0xcd:2,0xce:4,0xcf:8,0xd0:1,0xd1:2,0xd2:4,0xd3:8,0xca:4,0xcb:8};
  for(const [tag,width] of Object.entries(widths)){
    const b=Buffer.alloc(1+width);b[0]=Number(tag);b.fill(0xff,1);equivalent(branch(b),true);equivalent(branch(b,true),true);
  }
  for(const code of [0,1,KEY_DICTIONARY.length-1]){
    const key=Buffer.from([0xcb,0,0,0,0,0,0,0,0]);key.writeDoubleBE(code,1);
    equivalent(branch(rawMap([[key,encode(7)]]),true),true);
    equivalent(branch(rawMap([[key,encode(7)]]),false),false);
  }
  const f=frame(1);f.muzzleEvents={time:1,latest:0,styles:[],events:[]};
  for(const encoder of [encode,encodeProjectedBinaryFrame])equivalent(wrap(encoder(f)),true);
  for(const change of [batch=>batch.time=-1,batch=>batch.latest=1.5,batch=>batch.events.push([1,0,0,0,0,0,0,0,0]),batch=>batch.styles.push({kind:1,spec:{}})]){
    const g=structuredClone(f);change(g.muzzleEvents);equivalent(wrap(encode(g)),false);
  }
});


test('bounded relay checks every skipped tag/truncation, near-depth boundary and view offset',()=>{
  for(let tag=0;tag<256;tag++)for(let length=1;length<=12;length++){
    const value=Buffer.alloc(length);value[0]=tag;
    for(const dictionary of [false,true])equivalent(branch(value,dictionary));
  }
  for(const levels of [119,123,125,126,127,128])for(const leaf of [Buffer.from([0]),Buffer.from([0x90]),Buffer.from([0x80])]){
    const nested=Buffer.concat([Buffer.alloc(levels,0x91),leaf]);
    for(const dictionary of [false,true])equivalent(branch(nested,dictionary));
  }
  for(const encoder of [encode,encodeProjectedBinaryFrame]){
    const bytes=wrap(encoder(frame(1))),padded=Buffer.concat([Buffer.alloc(7,0xff),bytes,Buffer.alloc(9,0xff)]);
    equivalent(padded.subarray(7,padded.length-9),true);
    const view=new DataView(padded.buffer,padded.byteOffset+7,bytes.length);
    assert.deepEqual(result(decodeBinaryStateForRelay,view),result(decodeBinaryStateForRelay,bytes));
    if(baseline)assert.deepEqual(exactResult(decodeBinaryStateForRelay,view),exactResult(baseline.decodeBinaryStateForRelay,bytes));
  }
  // Wrong length/count claims must be rejected before allocating huge arrays/maps.
  for(const value of [Buffer.from([0xdd,0x7f,0xff,0xff,0xff]),Buffer.from([0xdf,0,1,0,1]),Buffer.from([0xda,0xff,0xff]),Buffer.from([0xdb,0xff,0xff,0xff,0xff])]){
    equivalent(branch(value),false);equivalent(branch(value,true),false);
  }
});
