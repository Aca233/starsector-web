// Worker-side codec transaction. Native Steam, network/renderer credit and
// lifecycle remain owned by the gateway; this module never grants send credit.
import protocol from '../../src/network/protocol.json' with {type:'json'};
import {decodeBinaryState} from '../../src/network/BinarySnapshot.mjs';
import {SteamBinarySnapshotEncoder,SteamBinarySnapshotSender} from './binary-snapshot.mjs';
import {SteamSnapshotEncoder,SteamSnapshotSender} from './snapshot-delta.mjs';
import {SteamPacketCodec} from './packet-codec.mjs';
export const SNAPSHOT_PREPARE_LIMITS=Object.freeze({peers:protocol.maxPlayers-1,inputBytes:protocol.maxSnapshotBytes});
const positive=n=>Number.isSafeInteger(n)&&n>0;
const epoch=n=>Number.isSafeInteger(n)&&n>=0;
const invalid=()=>{throw Error('Invalid snapshot preparation transaction');};
const validState=s=>s?.type==='state'&&typeof s.matchId==='string'&&s.matchId.length>0&&s.matchId.length<=128&&epoch(s.seq)
 &&s.frame&&typeof s.frame==='object'&&!Array.isArray(s.frame)&&epoch(s.frame.tick);
function inputData(input){
 if(input?.kind==='json'){
  if(typeof input.data!=='string'||Buffer.byteLength(input.data)>SNAPSHOT_PREPARE_LIMITS.inputBytes)invalid();
  const state=JSON.parse(input.data);if(!validState(state))invalid();
  return {value:input.data,state,text:input.data};
 }
 if(input?.kind!=='binary')invalid();
 const raw=input.data;
 if(!(raw instanceof ArrayBuffer)&&!(ArrayBuffer.isView(raw)&&raw.buffer instanceof ArrayBuffer))invalid();
 const bytes=raw instanceof ArrayBuffer?new Uint8Array(raw):new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);
 if(!bytes.length||bytes.length>SNAPSHOT_PREPARE_LIMITS.inputBytes)invalid();
 const state=decodeBinaryState(bytes);if(!validState(state))invalid();
 return {value:{state,bytes},state,text:null};
}
/** One active broadcast, <=9 peer codecs and ONE current broadcast cache.
 * IDs are local opaque integers, not Steam identities. Only exact native-send
 * decisions commit bases. Reset/retire makes late decisions harmless. */
export class SnapshotPrepareState {
 constructor(){this.records=new Map();this.pending=null;this.binaryEncoder=new SteamBinarySnapshotEncoder();this.encoder=new SteamSnapshotEncoder();this.codec=new SteamPacketCodec({binaryStates:true});}
 prepare(message){
  if(this.pending||!positive(message.id)||!Number.isFinite(message.now)||!Array.isArray(message.peers)||!message.peers.length||message.peers.length>SNAPSHOT_PREPARE_LIMITS.peers)invalid();
  const seen=new Set();
  for(const p of message.peers){if(!positive(p?.key)||!epoch(p.epoch)||typeof p.binary!=='boolean'||seen.has(p.key))invalid();seen.add(p.key);const old=this.records.get(p.key);if(old&&old.binary!==p.binary)invalid();}
  if(this.records.size+[...seen].filter(k=>!this.records.has(k)).length>SNAPSHOT_PREPARE_LIMITS.peers)invalid();
  const started=performance.now(),input=inputData(message.input),choices=new Map(),results=[],copies=new Map(),transfer=[];
  for(const p of message.peers){
   let r=this.records.get(p.key);
   if(r&&r.epoch>p.epoch){results.push({key:p.key,epoch:p.epoch,stale:true});continue;}
   if(!r){r={epoch:p.epoch,binary:p.binary,sender:p.binary?new SteamBinarySnapshotSender():new SteamSnapshotSender(),lastSeq:null};this.records.set(p.key,r);}
   else if(r.epoch<p.epoch){r.sender.reset();r.epoch=p.epoch;r.lastSeq=null;}
   if(!p.binary&&input.text===null)input.text=this.binaryEncoder.text===input.value&&this.binaryEncoder.relayText!==null?this.binaryEncoder.relayText:JSON.stringify(input.state);
   const choice=r.sender.prepare(p.binary?input.value:input.text,p.binary?this.binaryEncoder:this.encoder,this.codec,message.now);
   // Do not copy private codec caches / canonical worlds through postMessage.
   // Payload copies may be shared by results but transferred only once; the
   // original cache/baseline bytes remain owned by the worker for later frames.
   let payload=copies.get(choice.prepared);
   if(!payload){payload=Uint8Array.from(choice.prepared.payload).buffer;copies.set(choice.prepared,payload);transfer.push(payload);}
   const {rawBytes,zipped,binary}=choice.prepared;
   const stateBytes=choice.rawBytes??Buffer.byteLength(input.text);
   results.push({key:p.key,epoch:p.epoch,seq:input.state.seq,matchId:input.state.matchId,tick:input.state.frame.tick,prepared:{payload,rawBytes,zipped,binary:!!binary},stateBytes,
    format:binary?(choice.delta?'binary-delta':'binary-full'):choice.delta?'delta':choice.target?'full':'legacy-full',
    budgetFallback:choice.choice?.budgetFallback??false});
   choices.set(p.key,{record:r,epoch:p.epoch,choice,seq:input.state.seq});
  }
  this.pending={id:message.id,choices};
  return {response:{op:'prepared',id:message.id,results,workMs:performance.now()-started},transfer};
 }
 commit(message){
  if(!positive(message.id)||!Array.isArray(message.accepted)||message.accepted.length>SNAPSHOT_PREPARE_LIMITS.peers||new Set(message.accepted).size!==message.accepted.length||message.accepted.some(k=>!positive(k)))invalid();
  if(!this.pending||message.id!==this.pending.id)return {response:{op:'ignored',id:message.id},transfer:[]};
  if(message.accepted.some(k=>!this.pending.choices.has(k)))invalid();
  for(const key of message.accepted){const item=this.pending.choices.get(key),r=this.records.get(key);
   if(r!==item.record||r.epoch!==item.epoch)continue;
   const committed=r.sender.commit(item.choice);
   if(r.binary&&committed!==true)invalid();r.lastSeq=item.seq;
  }
  this.pending=null;
  return {response:{op:'committed',id:message.id,stats:this.stats()},transfer:[]};
 }
 reset(message){
  if(!positive(message.key)||!epoch(message.epoch))invalid();const r=this.records.get(message.key);
  if(r&&message.epoch>r.epoch){r.sender.reset();r.epoch=message.epoch;r.lastSeq=null;}
  return {response:{op:'reset',key:message.key,epoch:message.epoch},transfer:[]};
 }
 retire(message){if(!positive(message.key))invalid();this.records.delete(message.key);return {response:{op:'retired',key:message.key},transfer:[]};}
 stats(){return [...this.records].map(([key,r])=>({key,epoch:r.epoch,lastSeq:r.lastSeq,delta:r.sender.diagnostics()}));}
 handle(message){
  if(message?.op==='prepare')return this.prepare(message);
  if(message?.op==='commit')return this.commit(message);
  if(message?.op==='reset')return this.reset(message);
  if(message?.op==='retire')return this.retire(message);
  return invalid();
 }
}
