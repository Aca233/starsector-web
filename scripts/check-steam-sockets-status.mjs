import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bindSteamSocketsStatusV012,decodeSocketStatus,SOCKET_STATUS_ABI} from '../server/steam/sockets-status-v012.mjs';
function buffers(){const c=Buffer.alloc(120),l=Buffer.alloc(192);c.writeInt32LE(3,0);c.writeInt32LE(37,4);c.writeFloatLE(.75,8);c.writeFloatLE(.5,12);c.writeFloatLE(12345.5,20);c.writeFloatLE(2222.25,28);c.writeInt32LE(64000,32);c.writeInt32LE(1200,36);c.writeInt32LE(3400,40);c.writeInt32LE(9000,44);c.writeBigInt64LE(0x7fffffffffffffffn,48);
 for(const [i,u,r,a,q]of[[0,0,400,1000,1000],[1,0,3000,8000,50000],[2,1200,0,0,100000]]){l.writeInt32LE(u,i*64);l.writeInt32LE(r,i*64+4);l.writeInt32LE(a,i*64+8);l.writeBigInt64LE(BigInt(q),i*64+16);}return {c,l};}
test('status binding is inert, fixed to one export and performs no SDK initialization/accessor',()=>{
 const calls=[],signatures=[];const read=bindSteamSocketsStatusV012({func(s){signatures.push(s);return(...args)=>{calls.push(args);return 3;};}});assert.equal(signatures.length,1);assert.match(signatures[0],/GetConnectionRealTimeStatus/);assert.equal(calls.length,0);
 for(const handle of [0,-1,2**32,1.5,'1'])assert.equal(read(1n,handle).available,false);assert.equal(read(null,1).available,false);assert.equal(read(1n<<64n,1).available,false);assert.equal(calls.length,0);
 assert.equal(read(1n,42).reason,'native-status-unavailable');assert.equal(calls.length,1);assert.equal(calls[0][2].length,SOCKET_STATUS_ABI.connectionBytes);assert.equal(calls[0][3],3);assert.equal(calls[0][4].length,192);
});
test('decode returns exact per-lane pending, reliable-in-flight and lane-specific delays, not global queue time',()=>{
 const {c,l}=buffers(),s=decodeSocketStatus(c,l);assert.equal(s.available,true);assert.equal(s.pingMs,37);assert.equal(s.sendRateBytesPerSecond,64000);assert.equal(s.outBytesPerSecond,12345.5);assert.equal(s.inBytesPerSecond,2222.25);assert.equal(s.pendingBytes,4600);assert.equal(s.unackedReliableBytes,9000);
 assert.deepEqual(s.lanes.map(x=>[x.pendingBytes,x.unackedReliable,x.queueMs]),[[400,1000,1],[3000,8000,50],[1200,0,100]]);assert.equal(Object.hasOwn(s,'queueMs'),false);
});
test('zero/unknown estimates remain unknown; no fake infinite bandwidth or zero-delay credit',()=>{
 const {c,l}=buffers();c.writeInt32LE(-1,4);c.writeInt32LE(0,32);c.writeFloatLE(NaN,8);c.writeFloatLE(-1,12);c.writeFloatLE(Infinity,20);c.writeFloatLE(-1,28);
 l.writeBigInt64LE(-1n,16);l.writeBigInt64LE(9007199254740992n,80);l.writeBigInt64LE(123456n,144);
 const s=decodeSocketStatus(c,l);assert.equal(s.available,true);for(const k of ['pingMs','sendRateBytesPerSecond','outBytesPerSecond','inBytesPerSecond','qualityLocal','qualityRemote'])assert.equal(s[k],null,k);
 assert.deepEqual(s.lanes.map(l=>l.queueMs),[null,null,123.456]);assert.equal(s.pendingBytes,4600);
});
test('connection and lane totals use conservative larger values without counting pending reliable twice',()=>{
 const {c,l}=buffers();c.writeInt32LE(0,36);c.writeInt32LE(0,40);c.writeInt32LE(0,44);assert.equal(decodeSocketStatus(c,l).pendingBytes,4600);assert.equal(decodeSocketStatus(c,l).unackedReliableBytes,9000);
 c.writeInt32LE(10000,36);c.writeInt32LE(10000,40);c.writeInt32LE(12000,44);assert.equal(decodeSocketStatus(c,l).pendingBytes,20000);assert.equal(decodeSocketStatus(c,l).unackedReliableBytes,12000);
});
test('invalid state, counter, buffer or FFI result is unavailable rather than zeroed telemetry',()=>{
 for(const [buffer,offset]of[['c',32],['c',36],['c',40],['c',44],['l',0],['l',4],['l',8],['l',128]]){const b=buffers();b[buffer].writeInt32LE(-1,offset);assert.equal(decodeSocketStatus(b.c,b.l).available,false);}
 const b=buffers();b.c.writeInt32LE(2,0);assert.equal(decodeSocketStatus(b.c,b.l).available,false);assert.equal(decodeSocketStatus(Buffer.alloc(119),b.l).available,false);
 const read=bindSteamSocketsStatusV012({func(){return()=>{throw Error('private SDK details');};}});assert.deepEqual(read(1n,1),{available:false,reason:'native-status-failed'});
});
test('reader copies no native pointer and decodes only successful returned buffers',()=>{
 let call=0;const {c,l}=buffers();const read=bindSteamSocketsStatusV012({func(){return(self,h,out,n,lanes)=>{assert.equal(self,1n);assert.equal(h,17);assert.equal(n,3);c.copy(out);l.copy(lanes);call++;return call===1?1:3;};}});
 const first=read(1n,17);assert.equal(first.available,true);c.fill(0);l.fill(0);assert.equal(first.pendingBytes,4600);assert.equal(read(1n,17).available,false);
});
