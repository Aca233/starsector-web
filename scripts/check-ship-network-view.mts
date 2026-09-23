import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';
import {ShipViewPublisher,ShipViewReceiver,readShipView,SHIP_VIEW_FIELDS,SHIP_VIEW_LIMITS} from '../src/network/experimental/ShipNetworkView';
import {lanCrc32} from '../src/network/LanBinaryDelta.mjs';
import {captureCombat,applyCombatSnapshot,pilotCaptureShips,pilotApplyShips} from '../src/network/AuthorityCombatSnapshot';
import {initAssets,world,take,channel} from './lib/ship-network-view-pilot.mts';
await initAssets();
function fixture(){const host=world(),view=world(),rows=host.allCapitalShips.map(ship=>({ship,generation:1}));return{host,view,rows,p:new ShipViewPublisher(17),r:new ShipViewReceiver(17,new Map(view.allCapitalShips.map(s=>[s.id,s])))};}
function send(f:any,tick:number,rows=f.rows,full=false){const packet=f.p.prepare(rows,tick,full||f.p.stats().seq===0);const tx=f.r.prepare(packet.bytes);f.r.commit(tx);f.p.commit(packet);return packet;}
function repair(bytes:Uint8Array){new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(bytes.length-4,lanCrc32(bytes.subarray(0,-4)));return bytes;}
const firstMask=(bytes:Uint8Array)=>28+6+bytes[33];

test('float64 field anchor preserves exact scalars/negative zero and native object identities without authority/RNG writes',()=>{
 const f=fixture(),s=f.host.playerShip;s.pos.x=-0;s.vel.y=Number.MIN_VALUE;s.hullHp=19999.123456789;
 const before=captureCombat(f.host,0,{},0),rng=JSON.stringify([f.host.random,f.host.visualRandom]);const pos=f.view.playerShip.pos,flux=f.view.playerShip.flux;
 send(f,1);assert.deepEqual(readShipView(f.view.playerShip),readShipView(s));assert.ok(Object.is(f.view.playerShip.pos.x,-0));assert.equal(f.view.playerShip.pos,pos);assert.equal(f.view.playerShip.flux,flux);assert.deepEqual(captureCombat(f.host,0,{},0),before);assert.equal(JSON.stringify([f.host.random,f.host.visualRandom]),rng);
});
test('one changed field registers once, unchanged ticks emit a bounded empty transaction',()=>{
 const f=fixture();send(f,1);assert.equal(send(f,2).changedFields,0);f.host.playerShip.hullHp-=1;assert.equal(send(f,3).changedFields,1);assert.equal(f.view.playerShip.hullHp,f.host.playerShip.hullHp);assert.equal(send(f,4).bytes.length,32);
});
test('unsent preparation cannot advance baseline; stale/double commit is rejected',()=>{
 const f=fixture(),old=f.p.prepare(f.rows,1);f.host.playerShip.pos.x+=20;const next=f.p.prepare(f.rows,2);assert.equal(next.seq,1);assert.equal(f.p.stats().seq,0);f.r.commit(f.r.prepare(next.bytes));f.p.commit(next);assert.throws(()=>f.p.commit(old),/stale/);assert.throws(()=>f.p.commit(next),/stale/);assert.equal(f.view.playerShip.pos.x,f.host.playerShip.pos.x);
});
test('lost base, replay and old epoch reject without mutation; a complete anchor recovers',()=>{
 const f=fixture();const first=send(f,1);f.host.playerShip.pos.x+=2;f.p.commit(f.p.prepare(f.rows,2));const skipped=f.p.prepare(f.rows,3);f.p.commit(skipped);const before=readShipView(f.view.playerShip);
 assert.throws(()=>f.r.prepare(skipped.bytes),/baseline/);assert.deepEqual(readShipView(f.view.playerShip),before);assert.throws(()=>f.r.prepare(first.bytes),/order/);send(f,4,f.rows,true);assert.deepEqual(readShipView(f.view.playerShip),readShipView(f.host.playerShip));
 const fresh=new ShipViewReceiver(18,new Map(f.view.allCapitalShips.map(s=>[s.id,s])));assert.throws(()=>fresh.prepare(first.bytes),/epoch/);const p=new ShipViewPublisher(18);fresh.commit(fresh.prepare(p.prepare(f.rows,1).bytes));
});
test('registered entity deletion/recreation uses generations and keeps retained identities bounded',()=>{
 const f=fixture();send(f,1);send(f,2,[]);assert.equal(f.r.stats().entities,0);assert.throws(()=>f.p.prepare(f.rows,3),/generation/);const rows=f.rows.map(r=>({...r,generation:2}));send(f,3,rows);assert.equal(f.r.stats().entities,2);assert.equal(f.r.stats().identities,2);
});
test('complete replacement generation and duplicate prepared receive commits are guarded',()=>{
 const f=fixture();send(f,1);f.rows[0].generation=2;const packet=f.p.prepare(f.rows,2),a=f.r.prepare(packet.bytes),b=f.r.prepare(packet.bytes);f.r.commit(a);assert.throws(()=>f.r.commit(b),/stale/);f.p.commit(packet);
});
for(const mode of ['crc','version','epoch','base','mask','op','truncate','trailing','count','reserved','nan','boolean','unknown-id','duplicate-id'])test('malformed packet is rejected atomically: '+mode,()=>{
 const f=fixture(),good=f.p.prepare(f.rows,1).bytes;let bytes=good.slice();let d=new DataView(bytes.buffer);const mask=firstMask(bytes),value=mask+4;
 if(mode==='crc'){bytes[value]^=1;}
 if(mode==='version')d.setUint16(4,99);
 if(mode==='epoch')d.setUint32(8,18);
 if(mode==='base')d.setUint32(16,100);
 if(mode==='mask')d.setUint32(mask,0x80000000);
 if(mode==='op')bytes[28]=7;
 if(mode==='reserved')d.setUint16(26,1);
 if(mode==='nan')d.setFloat64(value,NaN);
 if(mode==='boolean')bytes[value+11*8]=2;
 if(mode==='unknown-id')bytes[34]=bytes[34]===120?121:120;
 if(mode==='count')d.setUint16(24,129);
 if(mode==='truncate')bytes=bytes.subarray(0,-7).slice();
 if(mode==='trailing'){const b=new Uint8Array(bytes.length+1);b.set(bytes);bytes=b;}
 if(mode==='duplicate-id'){
  const firstLength=10+bytes[33]+SHIP_VIEW_FIELDS.reduce((n,f)=>n+(f.boolean?1:8),0),b=new Uint8Array(28+2*firstLength+4);b.set(bytes.subarray(0,28));b.set(bytes.subarray(28,28+firstLength),28);b.set(bytes.subarray(28,28+firstLength),28+firstLength);bytes=b;
 }
 if(mode!=='crc')repair(bytes);
 const before=captureCombat(f.view,0,{},0);assert.throws(()=>f.r.prepare(bytes));assert.deepEqual(captureCombat(f.view,0,{},0),before);assert.equal(f.r.stats().seq,0);
});
test('publisher rejects poisoned fields, oversized IDs, duplicate identities, and mutated prepared bytes',()=>{
 const f=fixture();f.host.playerShip.pos.x=NaN;assert.throws(()=>f.p.prepare(f.rows,1),/field/);f.host.playerShip.pos.x=0;assert.throws(()=>f.p.prepare([f.rows[0],f.rows[0]],1),/identity/);
 const packet=f.p.prepare(f.rows,1);packet.bytes[40]^=1;assert.throws(()=>f.p.commit(packet),/mutated/);f.host.playerShip.id='x'.repeat(129);assert.throws(()=>f.p.prepare(f.rows,1),/ID/);assert.equal(f.p.stats().seq,0);assert.equal(SHIP_VIEW_LIMITS.entities,64);
});
test('every declared field can change individually without touching another field',()=>{
 const f=fixture();send(f,1);let tick=2;for(const field of SHIP_VIEW_FIELDS){const s:any=f.host.playerShip,target=field.path.length===1?s:s[field.path[0]],key=field.path.at(-1)!;target[key]=field.boolean?!target[key]:target[key]+.125;const before=readShipView(f.view.playerShip);assert.equal(send(f,tick++).changedFields,1);const after=readShipView(f.view.playerShip);assert.equal([...before].filter((v,i)=>!Object.is(v,after[i])).length,1);}
});
test('pilot control matches existing native P1 for all ship fields and dependent native objects',()=>{
 const host=world(),view=world(),reference=world();for(let tick=1;tick<=100;tick++){host.fixedUpdate(1/60);const full=captureCombat(host,tick,{},0,true,true,true,true,true);applyCombatSnapshot(reference,full);pilotApplyShips(view,pilotCaptureShips(host,host.allCapitalShips,tick),tick===1);assert.deepEqual(take(view,2,tick),take(reference,2,tick));}
});
test('hybrid path retains complete P1 ship state, references, interpolation, UI readers, unknown extension fields and dynamic shape changes',()=>{
 const host=world(4),control=channel(host,false,2),candidate=channel(host,true,2);let projectiles=0;
 for(const ship of host.allCapitalShips){ship.pos.scale(.2);ship.prevPos.copy(ship.pos);}
 for(let tick=1;tick<=420;tick++){
  host.fixedUpdate(1/60);projectiles+=host.projectiles.length;
  if(tick===100)(host.playerShip as any).pilotExtension={a:3,b:[1,2,3]};
  if(tick===150){host.playerShip.teleportSequence++;host.playerShip.pos.x+=300;}
  if(tick===200)(host.playerShip.flux as any).pilotExtension={x:'keep'};
  control.step(4,tick);candidate.step(4,tick);
  for(let i=0;i<2;i++){const a=control.viewers[i],b=candidate.viewers[i];assert.deepEqual(take(b,4,tick),take(a,4,tick));assert.deepEqual(b.playerShip.prevPos,a.playerShip.prevPos);assert.equal(b.playerShip.prevFacingRad,a.playerShip.prevFacingRad);assert.equal(b.playerShip.flux.fluxPercent,a.playerShip.flux.fluxPercent);assert.equal(b.playerShip.flux.totalFlux,a.playerShip.flux.totalFlux);assert.equal(b.playerShip.isDead,a.playerShip.isDead);assert.equal(b.playerShip.weapons.length,a.playerShip.weapons.length);}
 }
 assert.ok(projectiles>0,'native combat must exercise weapons');
});
test('no production transport or app imports the experimental view',()=>{
 const files=['src/network/LanBattle.tsx','src/network/protocol.ts','server/steam/gateway.mjs','server/lan-server.mjs'];for(const f of files)assert.doesNotMatch(fs.readFileSync(f,'utf8'),/ShipNetworkView/);
});

test('entity and lifetime-ID caps hold even under repeated create/delete churn',()=>{
 const f=fixture();assert.throws(()=>f.p.prepare(Array(65).fill(f.rows[0]),1),/budget/);
 const large=new Map(Array.from({length:65},(_,i)=>['id'+i,f.view.playerShip] as const));assert.throws(()=>new ShipViewReceiver(17,large),/registry/);
 for(let i=0;i<64;i++){f.host.playerShip.id='known-'+i;const packet=f.p.prepare([{ship:f.host.playerShip,generation:1}],i+1);f.p.commit(packet);}
 assert.equal(f.p.stats().entities,1);assert.equal(f.p.stats().identities,64);f.host.playerShip.id='overflow';assert.throws(()=>f.p.prepare([{ship:f.host.playerShip,generation:1}],65),/lifetime/);assert.equal(f.p.stats().seq,64);
});
test('wrong update generation and invalid deletion never change current view',()=>{
 const f=fixture();send(f,1);f.host.playerShip.hullHp-=2;
 const update=f.p.prepare(f.rows,2).bytes.slice();new DataView(update.buffer).setUint32(29,9);repair(update);assert.throws(()=>f.r.prepare(update),/generation/);
 const deletion=f.p.prepare([],2).bytes.slice();new DataView(deletion.buffer).setUint32(firstMask(deletion),1);repair(deletion);assert.throws(()=>f.r.prepare(deletion),/delete/);assert.equal(f.r.stats().seq,1);assert.equal(f.r.stats().entities,2);
});
test('wire field masks cannot overwrite methods or native component references',()=>{
 const f=fixture(),ship=f.view.playerShip,update=ship.update,flux=ship.flux,weaponControl=ship.weaponControl;
 const packet=f.p.prepare(f.rows,1).bytes.slice();new DataView(packet.buffer).setUint32(firstMask(packet),0xffffffff);repair(packet);assert.throws(()=>f.r.prepare(packet),/mask/);assert.equal(ship.update,update);assert.equal(ship.flux,flux);assert.equal(ship.weaponControl,weaponControl);
});
test('native reference-valued extension and P1 remainder remain intact on compressed hybrid delivery',()=>{
 const host=world(),control=channel(host,false,1,true),candidate=channel(host,true,1,true);
 (host.playerShip as any).pilotExtension={ref:host.enemyShip,unchanged:[1,2,3]};host.playerShip.flux.softFlux=200;host.playerShip.flux.hardFlux=50;
 control.step(2,1);candidate.step(2,1);const a=control.viewers[0],b=candidate.viewers[0];assert.deepEqual(take(a,2,1),take(b,2,1));assert.equal((b.playerShip as any).pilotExtension.ref,b.enemyShip);assert.equal(b.playerShip.flux.totalFlux,250);
});
