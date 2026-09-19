// Experimental Sockets application framing. Not the legacy SWSP protocol.
// Identity/lobby/nonce admission belongs BEFORE reassembly (see sockets-session).
import { inflateRawSync } from 'node:zlib';
import { unpackSocketState } from './sockets-state-codec.mjs';
import protocol from '../../src/network/protocol.json' with { type: 'json' };
export const SOCKET_WIRE_HEADER = 64;
export const SOCKET_WIRE_MAX = protocol.maxSnapshotBytes + 4096;
export const SOCKET_WIRE_SNAPSHOT_MAX = 512 * 1024 + 4096;
// Preserve the legacy application payload ceiling, including large room/start controls.
export const SOCKET_WIRE_CONTROL_MAX = SOCKET_WIRE_MAX;
export const SOCKET_WIRE_TTL = 8000, SOCKET_SNAPSHOT_TTL = 500;
export const ZERO_NONCE = '0'.repeat(32);
export const validNonce = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) && value !== ZERO_NONCE;
const operations = ['hello','welcome','ready','control','ping','pong','stream','streamAck','anchorAck','fullAck','anchor','snapshot','full','receipt','input'];
const setupOps = new Set(['hello','welcome','ready']);
const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
export const newerWireId = (id, previous) => previous === null || id !== previous && ((id - previous) >>> 0) < 0x80000000;
export function wireKind(op) { return op === 'snapshot' ? 'snapshot' : ['anchor','full','input'].includes(op) ? 'anchor' : 'control'; }
function rawLimit(op) { if(op==='input')return 16384+512; return setupOps.has(op) || op !== 'control' && wireKind(op) === 'control' ? 1024 : op === 'control' ? SOCKET_WIRE_CONTROL_MAX : op === 'full' ? SOCKET_WIRE_MAX : SOCKET_WIRE_SNAPSHOT_MAX; }
const chunkSize = kind => kind === 'snapshot' ? 1024 : 8192;
function fail() { throw Error('Invalid socket wire frame'); }
function same(a,b) { return ['id','op','kind','source','target','epoch','encoded','raw','count','zipped','wide','packedState'].every(k=>a[k]===b[k]); }
export function socketWireFrame({op,source,target,epoch=0,id,prepared,wide=false}) {
 const kind=wireKind(op),limit=rawLimit(op),chunk=wide?8192:chunkSize(kind),packedState=prepared?.packedState===true;
 if(packedState&&!['anchor','snapshot'].includes(op)||typeof wide!=='boolean'||wide&&kind!=='snapshot'||!operations.includes(op)||!validNonce(source)||!(validNonce(target)||op==='hello'&&target===ZERO_NONCE)||!uint(epoch)||!uint(id)
  ||!Buffer.isBuffer(prepared?.payload)||!Number.isInteger(prepared.rawBytes)||prepared.rawBytes<1||prepared.rawBytes>limit
  ||prepared.payload.length<1||prepared.payload.length>limit||typeof prepared.zipped!=='boolean'
  ||!prepared.zipped&&prepared.payload.length!==prepared.rawBytes||setupOps.has(op)&&prepared.zipped) fail();
 const count=Math.ceil(prepared.payload.length/chunk);
 if(setupOps.has(op)&&count!==1)fail();
 // Only one native packet is materialized at a time, not N duplicated full
 // frames per guest. Caller keeps the immutable prepared payload until sent.
 return {op,kind,id,epoch,prepared,count,bytes:prepared.payload.length+count*SOCKET_WIRE_HEADER,
  packet(index){
   if(!Number.isInteger(index)||index<0||index>=count)fail();
   const part=prepared.payload.subarray(index*chunk,(index+1)*chunk);const b=Buffer.alloc(SOCKET_WIRE_HEADER+part.length);
   b.write('SWS2',0,'ascii');b[4]=1;b[5]=operations.indexOf(op);b[6]=Number(prepared.zipped)|(wide?2:0)|(packedState?4:0);
   b.writeUInt32LE(id,8);b.writeUInt16LE(index,12);b.writeUInt16LE(count,14);b.writeUInt32LE(prepared.payload.length,16);b.writeUInt32LE(prepared.rawBytes,20);
   Buffer.from(source,'hex').copy(b,24);Buffer.from(target,'hex').copy(b,40);b.writeUInt32LE(epoch,56);part.copy(b,SOCKET_WIRE_HEADER);return b;
  }};
}
// Header validation is allocation-free apart from bounded metadata/nonce strings.
// It must not parse JSON, inflate data, or allocate based on an untrusted length.
export function socketWireHeader(kind,b) {
 if(!Buffer.isBuffer(b)||b.length<SOCKET_WIRE_HEADER||b.length>SOCKET_WIRE_HEADER+8192||b.toString('ascii',0,4)!=='SWS2'
  ||b[4]!==1||b[5]>=operations.length||b[6]>7||b[7]!==0||b.readUInt32LE(60)!==0)fail();
 const wide=Boolean(b[6]&2),packedState=Boolean(b[6]&4),chunk=wide?8192:chunkSize(kind);
 const op=operations[b[5]],index=b.readUInt16LE(12),count=b.readUInt16LE(14),encoded=b.readUInt32LE(16),raw=b.readUInt32LE(20),limit=rawLimit(op);
 const source=b.subarray(24,40).toString('hex'),target=b.subarray(40,56).toString('hex');
 if(packedState&&!['anchor','snapshot'].includes(op)||wide&&kind!=='snapshot'||wireKind(op)!==kind||!validNonce(source)||!(validNonce(target)||op==='hello'&&target===ZERO_NONCE)
  ||encoded<1||encoded>limit||raw<1||raw>limit||!(b[6]&1)&&encoded!==raw||count!==Math.ceil(encoded/chunk)||index>=count
  ||b.length-SOCKET_WIRE_HEADER!==Math.min(chunk,encoded-index*chunk)||setupOps.has(op)&&(count!==1||b[6]))fail();
 return {op,kind,source,target,id:b.readUInt32LE(8),epoch:b.readUInt32LE(56),index,count,encoded,raw,zipped:Boolean(b[6]&1),wide,packedState};
}
export class SocketWireBudget {
 constructor(limit=SOCKET_WIRE_MAX*2){if(!Number.isSafeInteger(limit)||limit<1)fail();this.limit=limit;this.bytes=0;this.peak=0;}
 claim(bytes){if(this.bytes+bytes>this.limit)return false;this.bytes+=bytes;this.peak=Math.max(this.peak,this.bytes);return true;}
 release(bytes){this.bytes-=bytes;if(this.bytes<0)throw Error('Socket wire budget underflow');}
}
export class SocketWireReceiver {
 constructor(budget=new SocketWireBudget()){this.budget=budget;this.pending=new Map();this.completed=new Map();this.expired=0;this.stale=0;}
 remove(kind){const entry=this.pending.get(kind);if(entry){this.budget.release(entry.bytes);this.pending.delete(kind);}}
 clear(){for(const kind of this.pending.keys())this.remove(kind);this.completed.clear();}
 resetState(){this.remove('anchor');this.remove('snapshot');}
 sweep(now){let reliableExpired=false;for(const [kind,e]of this.pending){if(now-e.since>(kind==='snapshot'?SOCKET_SNAPSHOT_TTL:SOCKET_WIRE_TTL)){this.remove(kind);this.completed.set(kind,e.header.id);this.expired++;reliableExpired ||= kind!=='snapshot';}}return reliableExpired;}
 receive(header,packet,now){
  // Only the session's authenticated header reaches here. Exactly one assembly
  // per lane; incomplete lossy frames are replaced, never a history of worlds.
  if(this.sweep(now))throw Error('Socket reliable reassembly expired');
  const {kind,id,index}=header;
  if(!newerWireId(id,this.completed.get(kind)??null)){this.stale++;return null;}
  let entry=this.pending.get(kind);
  if(entry&&entry.header.id!==id){
   if(!newerWireId(id,entry.header.id)){this.stale++;return null;}
   if(kind!=='snapshot')throw Error('Socket reliable fragments interleaved');
   this.completed.set(kind,entry.header.id);this.remove(kind);entry=null;
  }
  if(!entry){entry={header,parts:new Map(),bytes:0,since:now};this.pending.set(kind,entry);}
  if(!same(entry.header,header)){this.remove(kind);fail();}
  const part=packet.subarray(SOCKET_WIRE_HEADER),existing=entry.parts.get(index);
  if(existing){if(!existing.equals(part)){this.remove(kind);fail();}return null;}
  if(!this.budget.claim(part.length)){this.remove(kind);throw Error('Socket reassembly budget exhausted');}
  entry.parts.set(index,Buffer.from(part));entry.bytes+=part.length;
  if(entry.parts.size!==header.count)return null;
  this.remove(kind);this.completed.set(kind,id);
  const assembled=Buffer.concat(Array.from({length:header.count},(_,i)=>entry.parts.get(i)),header.encoded);
  const decoded=header.zipped?inflateRawSync(assembled,{maxOutputLength:header.raw}):assembled;
  if(decoded.length!==header.raw)fail();
  return {data:header.packedState?unpackSocketState(decoded):JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded))};
 }
 diagnostics(){return {assemblies:this.pending.size,bytes:[...this.pending.values()].reduce((sum,e)=>sum+e.bytes,0),sharedBytes:this.budget.bytes,expired:this.expired,stale:this.stale};}
}
