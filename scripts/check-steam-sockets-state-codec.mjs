import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { packSocketState, unpackSocketState, SteamSocketStateCodec, SOCKET_PACKED_MAX } from '../server/steam/sockets-state-codec.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SocketWireBudget, SocketWireReceiver, socketWireFrame, socketWireHeader } from '../server/steam/sockets-wire.mjs';
const exact = value => { const raw = JSON.stringify(value), packed = packSocketState(raw); assert.equal(JSON.stringify(unpackSocketState(packed)), raw); return packed; };
function malformed(skeleton, count = 0, planes = Buffer.alloc(count * 8), jsonBytes = 2) {
 const h = Buffer.alloc(16); h.write('SMF1'); h.writeUInt32LE(skeleton.length,4); h.writeUInt32LE(count,8); h.writeUInt32LE(jsonBytes,12); return Buffer.concat([h,skeleton,planes]);
}
const envelope = (n = 80) => ({type:'steam-state',v:1,token:2,base:1,size:12000,hash:'a'.repeat(64),body:{moving:Array.from({length:n},(_,i)=>({x:Math.sin(i*.07)*1000,y:Math.cos(i*.04)*1000,hp:10000-i%5,name:'ship '+i})),empty:[],flag:false}});
const frame = prepared => socketWireFrame({op:'snapshot',source:'a'.repeat(32),target:'b'.repeat(32),epoch:1,id:2,wide:true,prepared});
test('packed state preserves the complete JSON contract, key order, strings, arrays, nulls and numeric precision',()=>{
 exact({z:null,a:[],n:{false:false,true:true,zero:0,negative:-1},'中文🚀':'line\nquote"\\',numbers:[Number.MIN_VALUE,Number.MAX_VALUE,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,Math.PI,1e-300,-1e300,9007199254740992]});
 exact(envelope());exact([null,true,false,0,1.5,[],{},'']);exact('');exact(null);
});
test('thousands of deterministic arbitrary finite float64 values round-trip without quantization',()=>{
 let seed=189;const values=[],b=Buffer.alloc(8);for(let i=0;i<5000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;b.writeUInt32BE(seed,0);seed=(Math.imul(seed,1664525)+1013904223)>>>0;b.writeUInt32BE(seed,4);const n=b.readDoubleBE();if(Number.isFinite(n)&&!Object.is(n,-0))values.push(n);}
 exact(values);
});
test('compact byte planes reduce representative moving-state bytes while preserving every field',()=>{
 const codec=new SteamSocketStateCodec(),old=new SteamPacketCodec(),raw=JSON.stringify(envelope(120));const p=codec.prepare('data',raw),j=old.prepare('data',raw);
 assert.equal(p.packedState,true);assert.ok(p.payload.length<j.payload.length*.9);assert.ok(p.rawBytes<=SOCKET_PACKED_MAX);
 const f=frame(p),r=new SocketWireReceiver();let data;for(let i=0;i<f.count;i++){const b=f.packet(i);data=r.receive(socketWireHeader('snapshot',b),b,1)?.data??data;}assert.equal(JSON.stringify(data),raw);assert.equal(r.budget.bytes,0);
});
test('one-entry immutable packed cache is reused and cleared; ordinary application controls never use it',()=>{
 const c=new SteamSocketStateCodec(),raw=JSON.stringify(envelope());const p=c.prepare('data',raw);assert.equal(c.prepare('data',raw),p);assert.equal(c.packedPreparations,1);
 for(const type of ['input','hello','room','state'])assert.equal(c.prepare('data',JSON.stringify({type,body:envelope()})).packedState,undefined);
 c.clear();assert.equal(c.cache,null);assert.equal(c.packedCache,null);assert.notEqual(c.prepare('data',raw),p);assert.equal(c.packedPreparations,2);
});
test('lone UTF-16 surrogates, prototype keys, deep or oversized trees retain lossless JSON fallback',()=>{
 const values=[{...envelope(),bad:'\ud800'},{...envelope(),['\udfff']:4},JSON.parse('{"type":"steam-state","__proto__":{"x":1},"body":"keep"}')];
 let deep={x:1};for(let i=0;i<100;i++)deep={child:deep};values.push({...envelope(),deep});
 for(const v of values){const raw=JSON.stringify(v);assert.throws(()=>packSocketState(raw));const p=new SteamSocketStateCodec().prepare('data',raw);assert.equal(p.packedState,undefined);assert.equal(p.raw,raw);}
 assert.throws(()=>packSocketState(JSON.stringify('x'.repeat(SOCKET_PACKED_MAX))));
 assert.throws(()=>packSocketState('{ "a": 1 }'));
});
test('declared giant or cumulatively excessive MessagePack containers are rejected before allocation',()=>{
 const bad=[Buffer.from([0xdd,255,255,255,255]),Buffer.from([0xdf,255,255,255,255]),Buffer.from([0xdc,255,255]),Buffer.from([0x92,0xdc,0x80,0,0xdc,0x80,0])];
 for(const skeleton of bad)assert.throws(()=>unpackSocketState(malformed(skeleton)));
 assert.throws(()=>unpackSocketState(malformed(Buffer.concat([Buffer.alloc(98,0x91),Buffer.from([0])]))));
});
test('reserved, binary, extension, numeric map keys and prototype keys are outside the accepted JSON subset',()=>{
 for(const s of [[0xc1],[0xc4,0],[0xc7,0,42],[0xd4,42,0],[0x81,1,0],[0x81,0xa9,...Buffer.from('__proto__'),0]])assert.throws(()=>unpackSocketState(malformed(Buffer.from(s))));
});
test('malformed UTF-8, unsafe integer64 and trailing/truncated scalar payloads are rejected',()=>{
 for(const s of [[0xa1,255],[0xcf,255,255,255,255,255,255,255,255],[0xd3,0x80,0,0,0,0,0,0,0],[0,0],[0xd2,0]])assert.throws(()=>unpackSocketState(malformed(Buffer.from(s))));
});
test('plane counts, exact lengths, magic and canonical JSON byte sizes cannot be forged',()=>{
 const good=exact(envelope());for(const offset of [0,4,8,12]){const bad=Buffer.from(good);bad[offset]^=0x40;assert.throws(()=>unpackSocketState(bad));}
 assert.throws(()=>unpackSocketState(good.subarray(0,good.length-1)));assert.throws(()=>unpackSocketState(Buffer.concat([good,Buffer.from([0])])));
 assert.throws(()=>unpackSocketState(malformed(Buffer.from([0]),1)));
});
test('NaN, infinity and negative zero cannot enter through separate float planes or inline float32',()=>{
 for(const n of [NaN,Infinity,-Infinity,-0]){const p=Buffer.alloc(8);p.writeDoubleBE(n);assert.throws(()=>unpackSocketState(malformed(Buffer.from([0xcb]),1,p,4)));const f=Buffer.alloc(5);f[0]=0xca;f.writeFloatBE(n,1);assert.throws(()=>unpackSocketState(malformed(f)));}
});
test('packed framing is restricted to state ops, and conflicting packed metadata clears the assembly',()=>{
 const payload=Buffer.alloc(19000,7),prepared={payload,rawBytes:payload.length,zipped:false,packedState:true};
 for(const op of ['control','input','full','hello'])assert.throws(()=>socketWireFrame({op,source:'a'.repeat(32),target:'b'.repeat(32),id:2,prepared}));
 const f=frame(prepared),budget=new SocketWireBudget(),r=new SocketWireReceiver(budget),first=f.packet(0),second=f.packet(1);r.receive(socketWireHeader('snapshot',first),first,0);second[6]^=4;
 assert.throws(()=>r.receive(socketWireHeader('snapshot',second),second,1));assert.equal(budget.bytes,0);
 const bad=f.packet(0);bad[6]|=8;assert.throws(()=>socketWireHeader('snapshot',bad));
});
test('invalid compressed packed payload cannot escape bounded inflate or retain reassembly bytes',()=>{
 const raw=Buffer.alloc(200000,65),payload=deflateRawSync(raw);const f=frame({payload,rawBytes:100,zipped:true,packedState:true}),r=new SocketWireReceiver(),p=f.packet(0);
 assert.throws(()=>r.receive(socketWireHeader('snapshot',p),p,0));assert.equal(r.budget.bytes,0);
});
test('deterministic byte mutations of packed states either reject or remain bounded JSON values',()=>{
 const good=exact(envelope(3));for(let i=0;i<Math.min(good.length,200);i++){const bad=Buffer.from(good);bad[i]^=0xff;let value;try{value=unpackSocketState(bad);}catch(error){assert.ok(error instanceof Error);continue;}assert.ok(Buffer.byteLength(JSON.stringify(value))<=SOCKET_PACKED_MAX);}
});
