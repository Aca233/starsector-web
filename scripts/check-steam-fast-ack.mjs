import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SteamGateway } from '../server/steam/gateway.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamReliableQueue } from '../server/steam/reliable-queue.mjs';
import { bundleGateway, simulateSharedLink } from './steam-shared-link-model.mjs';
const remote='76561198000000002', connection='a'.repeat(32);
test('only tiny ACKs get identical fast + reliable copies; loss/refusal never removes reliable fallback',()=>{
 for(const failure of ['none','false','throw']) {
  const sent=[];const g=new SteamGateway({build:'test',client:{networking:{sendP2PPacket(_remote,type,data){sent.push({type,data:Buffer.from(data)});if(type===1&&failure==='throw')throw Error('best effort unavailable');return type===1&&failure==='false'?false:true;}}}});
  g.owner=remote;g.selected={owner:'76561198000000001'};
  try {
   for(const data of [{id:17},{id:18,consumed:true},{id:19,needsFull:true}]){
    sent.length=0;g.transmit(remote,connection,'ack',data);assert.deepEqual(sent.map(p=>p.type),[1,2]);assert.deepEqual(sent[0].data,sent[1].data);
    const c=new SteamPacketCodec();for(const p of sent)assert.deepEqual(c.receive(remote,p.data).data,data);
   }
   for(const op of ['open','opened','data','close','ping','pong']){sent.length=0;g.transmit(remote,connection,op,{type:'state',value:'small'});assert.deepEqual(sent.map(p=>p.type),[2]);}
   sent.length=0;g.transmit(remote,connection,'ack',{id:3,padding:'x'.repeat(1300)});assert.deepEqual(sent.map(p=>p.type),[2]);
   g.selected={owner:remote};sent.length=0;g.transmit(remote,connection,'ack',{id:22});assert.deepEqual(sent.map(p=>p.type),[2],'host input ACKs must not amplify shared uplink');
  }finally{g.wss.close();}
 }
});
test('duplicate ACK cannot drain twice, consume a later control, or suppress a reliable send error',()=>{
 let id=0;const q=new SteamReliableQueue(()=>({id:++id,packets:[Buffer.alloc(20)]}));q.enqueue('{}');q.enqueue('{}');q.ack(1);const before=q.diagnostics();q.ack(1);q.ack(999);assert.deepEqual(q.diagnostics(),before);
 const g=new SteamGateway({build:'test',client:{networking:{sendP2PPacket(_r,type){return type===1;}}}});
 try{assert.throws(()=>g.transmit(remote,connection,'ack',{id:1}),/Steam/);}finally{g.wss.close();}
});
test('production gateways keep state flowing during reverse reliable HOL; dropping every fast copy still recovers',async()=>{
 const bundle=await bundleGateway(),config={guests:1,durationMs:18000,rttMs:120,upBytesPerSecond:1000000,reverseReliableStallAtMs:8000,reverseReliableStallMs:3000};
 const fast=simulateSharedLink(bundle,config),fallback=simulateSharedLink(bundle,{...config,dropFastAcks:true});
 for(const r of [fast,fallback]){assert.deepEqual(r.closes,[]);assert.equal(r.budgetViolations,0);assert.equal(r.peers[0].decodeFailures,0);assert.ok(r.peers[0].steadyHz>=50);assert.ok(r.peers[0].peakBytes<=65536);}
 assert.ok(fallback.peers[0].maxStateGapMs>2000);assert.ok(fast.peers[0].maxStateGapMs<250,JSON.stringify(fast.peers[0]));
 console.log(JSON.stringify({scope:'deterministic gateway model, NOT native Steam or a real network',fastGapMs:fast.peers[0].maxStateGapMs,allFastCopiesLostGapMs:fallback.peers[0].maxStateGapMs,fastHz:fast.peers[0].steadyHz,fallbackHz:fallback.peers[0].steadyHz}));
});

test('guest fast-copy byte budget is bounded across bursts, clock reversal and peer changes',t=>{
 let now=1000; t.mock.method(performance,'now',()=>now);const packets=[];
 const g=new SteamGateway({build:'budget',client:{networking:{sendP2PPacket(_r,type,p){packets.push({type,bytes:p.length});return true;}}}});g.owner=remote;g.selected={owner:'76561198000000001'};
 try {
  const send=()=>{for(let i=0;i<100;i++)g.transmit(g.selected.owner,connection,'ack',{id:i,consumed:true});};
  send();assert.ok(packets.filter(p=>p.type===1).reduce((n,p)=>n+p.bytes,0)<=1200);
  now+=100;g.selected.owner='76561198000000003';send();
  assert.ok(packets.filter(p=>p.type===1).reduce((n,p)=>n+p.bytes,0)<=1200+819.2);
  assert.equal(packets.filter(p=>p.type===2).length,200);
  const before=packets.filter(p=>p.type===1).length;now-=200;send();assert.equal(packets.filter(p=>p.type===1).length,before);
 }finally{g.wss.close();}
});
