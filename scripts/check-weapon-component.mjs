import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WEAPON_NUMBERS, encodeWeaponState, decodeWeaponState} from '../src/network/WeaponPresentationState.mjs';
import {COMBAT_NUMBERS, encodeCombatState, decodeCombatState} from '../src/network/CriticalCombatState.mjs';
import {prepareCombatState, CombatWireSender, CombatWireReceiver, readCombatEnvelope} from '../server/CriticalCombatWire.mjs';
import {LanCriticalCombat} from '../server/LanCriticalCombat.mjs';
const row=(id='slot',seq=1)=>[id,'lightmg',5,seq%4,seq%4,...WEAPON_NUMBERS.map((_,i)=>i===2||i===14?Infinity:i%3===0?-0:i%3===1?0:Math.PI*(i+seq))];
const frame=(tick,weapons)=>({tick,time:tick/60,ships:weapons.map(([id])=>[id,0,0,...COMBAT_NUMBERS.map((_,i)=>i+1)]),weapons});
test('weapon rows retain every float64 bit, positive/negative zero, unlimited ammo, optional absence and UTF8 identity',()=>{
 const ships=[['舰🚀',Array.from({length:4},(_,i)=>row('slot'+i,i))],['empty',[]]];
 const bytes=encodeWeaponState(ships);assert.deepEqual(decodeWeaponState(bytes),ships);
 const dense=structuredClone(ships);for(const r of dense[0][1])for(let i=5;i<r.length;i++)r[i]=Math.PI+i;assert.equal(encodeWeaponState(dense).length,bytes.length,'zero transitions must not shift subsequent row offsets');
 const f=frame(7,ships);assert.deepEqual(decodeCombatState(encodeCombatState(f)),f);
 const {weapons:_weapons,...core}=f;assert.deepEqual(decodeCombatState(encodeCombatState(core)),core);
});
test('weapon codec rejects unknown shape, duplicate ids, corrupt flags/enums, invalid UTF8, trailing/truncated and non-ammo infinity',()=>{
 const good=[['a',[row()]]],bytes=encodeWeaponState(good);
 for(const bad of [[...good,...good],[['a',[row(),row()]]],[['a',[row('\ud800')]]],[['a',[row('x').slice(1)]]]])assert.throws(()=>encodeWeaponState(bad));
 for(const [index,value] of [[2,8],[3,4],[4,4],[5,Infinity],[7,-Infinity],[5,NaN],[5,1e13]]){const r=row();r[index]=value;assert.throws(()=>encodeWeaponState([['a',[r]]]));}
 for(const b of [bytes.subarray(0,-1),new Uint8Array([...bytes,0]),new Uint8Array(32769)])assert.throws(()=>decodeWeaponState(b));
 const bad=bytes.slice();bad[7]=255;assert.throws(()=>decodeWeaponState(bad));
 const core=frame(1,good);assert.throws(()=>encodeCombatState({...core,weapons:[['other',[row()]]]}));
 assert.throws(()=>encodeCombatState({...core,weapons:[]}));
 const packet=encodeCombatState(core);packet[packet.length-1]^=255;
 // Not every changed float is invalid: wire CRC (tested below) protects such changes.
 assert.throws(()=>decodeCombatState(new Uint8Array([...encodeCombatState(core),0])));
});
test('SCC1/SCC2 ordered wire switches and skipped admissions reconstruct complete exact weapon rows',()=>{
 const sender=new CombatWireSender(),receiver=new CombatWireReceiver();let deltas=0;
 for(let tick=1;tick<=40;tick++){
  const f=frame(tick,[['a',[row()]]]);if(tick%11===0)delete f.weapons;
  const target=prepareCombatState(encodeCombatState(f)),choice=sender.prepare(target,'m','s');
  if(tick%7===0)continue;
  const decoded=receiver.decode(readCombatEnvelope(choice.data));assert.deepEqual(decodeCombatState(Buffer.from(decoded.data,'base64')),f);
  assert.ok(sender.commit(choice));if(choice.delta)deltas++;
 }
 assert.ok(deltas>10);
 const choice=sender.prepare(prepareCombatState(encodeCombatState(frame(41,[['a',[row()]]]))),'m','s');
 const broken=Buffer.from(choice.data);broken[16]^=1;assert.throws(()=>receiver.decode(readCombatEnvelope(broken)));
 assert.ok(receiver.decode(readCombatEnvelope(choice.data)));
});
function dense(tick,mounts){
 let seed=31+tick;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 return frame(tick,[['a',Array.from({length:mounts},(_,i)=>['w'+i,'gun',0,0,0,...WEAPON_NUMBERS.map(()=>rng()+rng()/4294967296)])]]);
}
test('an incompressible oversize weapon extension still sends core HP without increasing wire/debt caps',()=>{
 // Two complete ship rosters remain within the 32KiB component cap but exceed
 // the 16KiB envelope once compressed. The extension must not mute HP updates.
 const first=dense(1,100),second=dense(2,100);first.weapons.push(['b',second.weapons[0][1]]);first.ships.push(['b',...first.ships[0].slice(1)]);
 const data=encodeCombatState(first),target=prepareCombatState(data);assert.ok(target.payload.length>16384);
 const fan=new LanCriticalCombat('m'),peer={},reader=new CombatWireReceiver();let result;
 fan.publish(data,1);fan.flush([{peer,syncId:'s',idleRttMs:60}],{writable:()=>true,send:(_,b)=>{assert.ok(b.length<=16384);result=reader.decode(readCombatEnvelope(b));return true;}});
 assert.ok(result);const f=decodeCombatState(Buffer.from(result.data,'base64'));assert.equal(f.weapons,undefined);assert.deepEqual(f.ships,first.ships);
 assert.equal(fan.stats().weaponFallbacks,1);assert.ok(fan.stats().coreFallbackBytes>0);assert.ok(fan.stats().flightBytes<16384);
 assert.ok(fan.acknowledge(peer,{type:'combat-consumed',matchId:'m',syncId:'s',tick:1,status:'consumed'}));assert.equal(fan.stats().flightBytes,0);
});
test('outstanding real weapon debt can fall back to HP without fabricating receipts or abandoning prior frames',()=>{
 const fan=new LanCriticalCombat('m'),peer={},reader=new CombatWireReceiver(),received=[];
 for(let tick=1;tick<=3;tick++){
  fan.publish(encodeCombatState(dense(tick,55)),tick);
  fan.flush([{peer,syncId:'s',idleRttMs:60}],{writable:()=>true,send:(_,b)=>{received.push(reader.decode(readCombatEnvelope(b)));return true;}});
 }
 assert.equal(received.length,3);assert.equal(decodeCombatState(Buffer.from(received[2].data,'base64')).weapons,undefined);assert.ok(fan.stats().flightBytes<=16384);
 assert.ok(fan.stats().weaponFallbacks>0);const debt=fan.stats().flightBytes;
 assert.equal(fan.acknowledge(peer,{type:'combat-consumed',matchId:'m',syncId:'other',tick:3,status:'consumed'}),false);assert.equal(fan.stats().flightBytes,debt);
 for(const r of received)assert.ok(fan.acknowledge(peer,{type:'combat-consumed',matchId:'m',syncId:'s',tick:r.tick,status:'consumed'}));
 assert.equal(fan.stats().flightBytes,0);
});
import {combatByteReference} from '../server/CriticalCombatReference.mjs';
test('temporal byte references use two admitted frames, never predict damage, and remain exact through skips and CRC failures',()=>{
 const sender=new CombatWireSender(),receiver=new CombatWireReceiver();let predicted=0,checkedMissing=false;
 const moving=tick=>{
  const ships=Array.from({length:12},(_,s)=>['s'+s,Array.from({length:4},(_,w)=>['w'+w,'beam',0,2,1,...WEAPON_NUMBERS.map((_,i)=>i===2||i===14?Infinity:[0,1,3,7,10,13].includes(i)?tick*.125+(s+w+i)*.0625:i===8?500-tick:i===9?500:0)])]);
  return frame(tick,ships);
 };
 for(let tick=1;tick<45;tick++){
  const f=moving(tick),target=prepareCombatState(encodeCombatState(f)),base=sender.base,choice=sender.prepare(target,'m','s');
  if(tick%7===0){assert.equal(sender.base,base);continue;}
  if(choice.predicted){
   predicted++;const b=sender.base,reference=combatByteReference(b,b.previous,tick),r=decodeCombatState(reference);
   assert.equal(r.weapons[0][1][0][13],decodeCombatState(b.bytes).weapons[0][1][0][13],'health is NOT extrapolated');
   assert.equal(Object.hasOwn(b.previous,'previous'),false,'history must stop at two frames');
   if(!checkedMissing){const old=receiver.base,prior=old.previous;old.previous=null;assert.throws(()=>receiver.decode(readCombatEnvelope(choice.data)));assert.equal(receiver.base,old);old.previous=prior;checkedMissing=true;}
   const bad=Buffer.from(choice.data);bad[16]^=1;const held=receiver.base;assert.throws(()=>receiver.decode(readCombatEnvelope(bad)));assert.equal(receiver.base,held);
  }
  assert.deepEqual(decodeCombatState(Buffer.from(receiver.decode(readCombatEnvelope(choice.data)).data,'base64')),f);assert.ok(sender.commit(choice));
 }
 assert.ok(predicted>20);assert.equal(sender.predicted,predicted);assert.ok(checkedMissing);
 sender.reset();assert.equal(sender.base,null);assert.equal(sender.prepare(prepareCombatState(encodeCombatState(moving(50))),'m','new').predicted,false);
 assert.equal(combatByteReference(null,null,2),null);
});
import {encodeCombatEnvelope} from '../server/CriticalCombatWire.mjs';
import {applyCombatSpatialReference,prepareCombatSpatialReference,COMBAT_SPATIAL_MAX_BYTES} from '../server/CriticalCombatReference.mjs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
const correlated=tick=>frame(tick,Array.from({length:12},(_,s)=>['s'+s,Array.from({length:8},(_,w)=>{
 const r=row('w'+w);r[5]=Math.sin(tick*.731+s*.312)*2+w*.0321;r[6]=tick*.125;r[13]=500-tick;r[14]=500;return r;
})]));
test('same-ship reference reconstructs exact authoritative bits with skips, scope changes and transactional corruption rejection',()=>{
 const sender=new CombatWireSender(),receiver=new CombatWireReceiver();let spatial=0,corrupted=false;
 for(let tick=1;tick<=70;tick++){
  const f=correlated(tick),target=prepareCombatState(encodeCombatState(f));
  const match=tick<=30?'m':'next',scope=tick<=30?'s':'new';const choice=sender.prepare(target,match,scope);
  if(tick%9===0)continue;
  if(choice.spatial){
   spatial++;
   if(!corrupted){
    const envelope=readCombatEnvelope(choice.data),payload=envelope.compressed?inflateRawSync(envelope.data):Buffer.from(envelope.data),held=receiver.base;
    const bads=[];
    for(const count of [0,129]){const b=Buffer.from(payload);b[0]=count;bads.push(b);}
    const outside=Buffer.from(payload);outside[1]=128;bads.push(outside);
    const unordered=Buffer.from(payload);unordered[10]=unordered[1];bads.push(unordered);
    for(const n of [NaN,Infinity,-Infinity,1e13,.25]){const b=Buffer.from(payload);b.writeDoubleBE(n,2);bads.push(b);}
    bads.push(payload.subarray(0,-1),Buffer.concat([payload,Buffer.from([0])]));
    for(const b of bads){assert.throws(()=>receiver.decode({...envelope,compressed:false,data:b}));assert.equal(receiver.base,held);}
    assert.throws(()=>receiver.decode({...envelope,compressed:true,data:deflateRawSync(Buffer.alloc(envelope.rawBytes+COMBAT_SPATIAL_MAX_BYTES+1))}));assert.equal(receiver.base,held);
    const missing=receiver.base;receiver.base=null;assert.throws(()=>receiver.decode(envelope));receiver.base=missing;
    corrupted=true;
   }
  }
  const out=receiver.decode(readCombatEnvelope(choice.data));assert.deepEqual(Buffer.from(out.data,'base64'),target.bytes);assert.ok(sender.commit(choice));
  if(tick===31){assert.equal(choice.delta,false);assert.equal(sender.base.previous,null);assert.equal(receiver.base.previous,null);}
  if(sender.base.previous)assert.equal(Object.hasOwn(sender.base.previous,'previous'),false);
 }
 assert.ok(spatial>30);assert.equal(sender.spatial,spatial);assert.ok(corrupted);
 const target=prepareCombatState(encodeCombatState(correlated(71)));
 for(const flags of [{spatial:true},{predicted:true}]){
  assert.throws(()=>encodeCombatEnvelope(target,'m','s',{...target,...flags}));
  const raw=encodeCombatEnvelope(target,'m','s');raw[4]|=flags.spatial?8:4;assert.throws(()=>readCombatEnvelope(raw));
 }
});
test('bounded spatial metadata checks identities, empty rosters, extremes and never changes health or ammo',()=>{
 const first=correlated(1),second=correlated(2),a=encodeCombatState(first),b=encodeCombatState(second),built=prepareCombatSpatialReference(a,b);
 assert.ok(built);assert.deepEqual(applyCombatSpatialReference(a,built.anchors),built.bytes);assert.ok(built.anchors.length<=COMBAT_SPATIAL_MAX_BYTES);
 const decoded=decodeCombatState(built.bytes);assert.equal(decoded.weapons[0][1][0][13],first.weapons[0][1][0][13]);assert.equal(decoded.weapons[0][1][0][7],Infinity);
 assert.equal(prepareCombatSpatialReference(a,a),null);const changed=structuredClone(second);changed.weapons[0][1][0][1]='other';assert.equal(prepareCombatSpatialReference(a,encodeCombatState(changed)),null);
 const core=encodeCombatState({...first,weapons:undefined});assert.equal(prepareCombatSpatialReference(core,b),null);assert.throws(()=>applyCombatSpatialReference(core,built.anchors));
 const sparse=frame(1,Array.from({length:128},(_,i)=>['s'+i,i===0?[row()]:[]]));sparse.weapons[0][1][0][5]=1e12;
 const anchor=Buffer.alloc(10);anchor[0]=1;anchor.writeDoubleBE(1e12,2);const limited=decodeCombatState(applyCombatSpatialReference(encodeCombatState(sparse),anchor));assert.equal(limited.weapons[0][1][0][5],1e12);
 anchor[1]=127;assert.throws(()=>applyCombatSpatialReference(encodeCombatState(sparse),anchor));
 const bads=[new Uint8Array(),new Uint8Array(COMBAT_SPATIAL_MAX_BYTES+1),built.anchors.subarray(0,-1)];for(const x of bads)assert.throws(()=>applyCombatSpatialReference(a,x));
});
