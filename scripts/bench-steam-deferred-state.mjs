// CPU-only A/B: same captured whole states, 60 offers / 15 selected per second.
// Not a network or game Hz benchmark. Validation and hashing remain mandatory.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {SteamSnapshotEncoder} from '../server/steam/snapshot-delta.mjs';
import {SteamSocketStateCodec} from '../server/steam/sockets-state-codec.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
const folder=process.argv[2]??'artifacts/lan-worker-latency',output=process.argv[3]??'artifacts/network-latency-phase4-20260920/deferred-cpu.json';
const names=fs.existsSync(path.join(folder,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')).rows.map(r=>r.name):[0,1,2].map(n=>`snapshot-32-${n}.bin`);
const frames=names.map(name=>JSON.stringify(decodeBinaryState(fs.readFileSync(path.join(folder,name)))));
const encoder=new SteamSnapshotEncoder(),codec=new SteamSocketStateCodec(),eligible=frames.filter(raw=>encoder.prepare(raw,codec)!==null);assert.ok(eligible.length>0);
const texts=Array.from({length:120},(_,i)=>{const v=JSON.parse(eligible[i%eligible.length]);v.seq=i+1;v.frame.tick=i+1;return JSON.stringify(v);});
function run(eager){
 const enc=new SteamSnapshotEncoder(),c=new SteamSocketStateCodec(),prepare=c.prepare.bind(c),wire=[],times=[];let calls=0;
 c.prepare=(op,value)=>{calls++;return prepare(op,value);};
 for(let i=0;i<texts.length;i++){const at=performance.now(),target=enc.prepare(texts[i],c);assert.ok(target);if(eager)void target.full;if(i%4===3)wire.push(target.full);times.push(performance.now()-at);}
 return {eager,calls,packedPreparations:c.packedPreparations,totalMs:times.reduce((a,b)=>a+b,0),meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times.toSorted((a,b)=>a-b)[Math.floor(times.length*.95)],wire};
}
run(true);run(false);const rounds=[];let expected=null;for(const eager of [true,false,false,true]){const r=run(eager);expected??=r.wire;assert.equal(r.wire.length,expected.length);r.wire.forEach((p,i)=>{assert.equal(p.raw,expected[i].raw);assert.equal(p.rawBytes,expected[i].rawBytes);assert.equal(p.packedState,expected[i].packedState);assert.ok(p.payload.equals(expected[i].payload));});const {wire:_wire,...row}=r;rounds.push(row);console.log(row);}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({scope:'CPU only, real recorded 32-ship whole-state JSON; 120 offers/30 selections; no Steam or network timing',recordedFrames:frames.length,eligibleFrames:eligible.length,minBytes:Math.min(...texts.map(t=>Buffer.byteLength(t))),maxBytes:Math.max(...texts.map(t=>Buffer.byteLength(t))),rounds},null,2));
