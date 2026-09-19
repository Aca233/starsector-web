import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SteamSocketFlightBudget, SOCKET_FLIGHT_LIMITS as L } from '../server/steam/sockets-flight-budget.mjs';
import { SteamAnchoredSender } from '../server/steam/anchored-snapshots.mjs';
import { SteamSnapshotEncoder } from '../server/steam/snapshot-delta.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { socketWireFrame, socketWireHeader, SocketWireReceiver } from '../server/steam/sockets-wire.mjs';
function peer(){return{state:'ready',stateJob:{},latest:null,controls:[]};}
function track(b,s,id,bytes=1000,at=0,kind='snapshot'){const p={epoch:1,id,index:0,bytes,kind};assert.ok(b.allows(s,bytes,s.stateJob));b.track(s,p,at,s.stateJob);return p;}
const receipt=p=>[p.epoch,p.id,p.index];
const empty={available:true,lanes:[{pendingBytes:0},{pendingBytes:0},{pendingBytes:0}]};

test('shared flight credit counts actual admission, not cached zero native pending or elapsed time',()=>{
 const b=new SteamSocketFlightBudget(),s=peer();for(let i=0;i<48;i++)track(b,s,i,1024);
 assert.equal(b.bytes,L.initial);assert.equal(b.allows(s,1024,s.stateJob),false);
 b.observeNative(s,empty,100000);assert.equal(b.bytes,L.initial);assert.equal(b.allows(s,1024,s.stateJob),false);
 assert.equal(b.expired(s,8000),false);assert.equal(b.expired(s,8001),true);
});
test('duplicate, unknown, pre-admission, cross-session and nonpositive-time receipts grant no credit',()=>{
 const b=new SteamSocketFlightBudget(),a=peer(),other=peer(),p=track(b,a,1,1024,100);
 for(const [session,packets,now]of[[a,[[1,99,0]],101],[other,[receipt(p)],101],[a,[receipt(p)],100],[a,[[2,1,0]],101]])b.acknowledge(session,packets,now);
 assert.equal(b.bytes,1024);b.acknowledge(a,[receipt(p),receipt(p)],200);assert.equal(b.bytes,0);assert.equal(b.stats.acknowledged,1);
});
test('shrinking a congested window cannot forgive already-issued debt',()=>{
 const b=new SteamSocketFlightBudget(),s=peer();const first=track(b,s,1,1024);b.acknowledge(s,[receipt(first)],100);
 const ps=[];for(let i=0;i<40;i++)ps.push(track(b,s,i+2,1024,200));
 b.acknowledge(s,[receipt(ps[0])],1400);assert.ok(b.limit<L.initial);assert.equal(b.bytes,39*1024);assert.equal(b.allows(s,1024,s.stateJob),false);
});
test('fair reservation survives replacement of unsent state; tiny packets cannot starve a large fragment',()=>{
 const b=new SteamSocketFlightBudget(),a=peer(),z=peer();const ps=[];for(let i=0;i<45;i++)ps.push(track(b,z,i,1024));
 assert.equal(b.allows(a,8256,a.stateJob),false);assert.equal(b.allows(z,1024,z.stateJob),false);
 a.stateJob=null;a.latest={};assert.equal(b.allows(z,1024,z.stateJob),false);
 b.acknowledge(z,ps.slice(0,10).map(receipt),10);a.latest=null;a.stateJob={};assert.ok(b.allows(a,8256,a.stateJob));track(b,a,100,8256,10);
 assert.ok(b.allows(z,1024,z.stateJob));
});
test('native backpressure and terminal cancellation release only the fair turn, never issued byte debt',()=>{
 const b=new SteamSocketFlightBudget(),a=peer(),z=peer();track(b,a,1);b.allows(a,1000,a.stateJob);b.cancelWait(a);assert.ok(b.allows(z,1000,z.stateJob));assert.equal(b.bytes,1000);
 b.cancelWait(z);b.allows(a,1000,a.stateJob);a.stateJob=null;assert.ok(b.allows(z,1000,z.stateJob));
});
test('loss reconciliation needs empty native snapshot lane followed by a newer real snapshot receipt',()=>{
 const b=new SteamSocketFlightBudget(),s=peer(),lost=track(b,s,1),reliable=track(b,s,2,1000,1,'anchor'),early=track(b,s,3,1000,2);
 b.observeNative(s,{available:false},100);b.acknowledge(s,[receipt(early)],1500);assert.equal(b.bytes,2000);
 b.observeNative(s,empty,1600);const later=track(b,s,4,1000,1700);b.acknowledge(s,[receipt(later)],6000);
 assert.equal(b.bytes,1000);assert.equal(b.stats.lostPackets,1);assert.equal(b.records.get(s).packets.has(`${reliable.epoch}:${reliable.id}:0`),true);
 b.acknowledge(s,[receipt(lost)],6200);assert.equal(b.bytes,1000);
});
test('a receipt for a packet admitted before the native-empty barrier cannot reconcile other losses',()=>{
 const b=new SteamSocketFlightBudget(),s=peer();track(b,s,1);const p=track(b,s,2,1000,10);b.observeNative(s,empty,100);b.acknowledge(s,[receipt(p)],2000);
 assert.equal(b.bytes,1000);assert.equal(b.stats.lostPackets,0);
});
test('input credit is bounded independently of the host state window; reliable delivery retains eight-second guard',()=>{
 const b=new SteamSocketFlightBudget({inputOnly:true}),s=peer(),p=track(b,s,1,8256,0,'anchor');assert.equal(b.allows(s,1,s.stateJob),false);
 assert.equal(b.expired(s,8000),false);assert.equal(b.expired(s,8001),true);b.acknowledge(s,[receipt(p)],100);assert.equal(b.limit,8256);
});
test('native disconnect keeps uncertain router debt from becoming a new reconnect window',()=>{
 const b=new SteamSocketFlightBudget(),s=peer();track(b,s,1,40000);b.retire(s);assert.equal(b.bytes,40000);assert.equal(b.stats.orphanBytes,40000);
 const next=peer();assert.equal(b.allows(next,10000,next.stateJob),false);b.clear();assert.equal(b.bytes,0);assert.equal(b.count,0);assert.equal(b.waiters.size,0);
});
test('wide snapshots retain exact message bytes, bounded 8KiB fragments and strict flag metadata',()=>{
 const value={type:'state',v:'x'.repeat(19000)},payload=Buffer.from(JSON.stringify(value));
 const f=socketWireFrame({op:'snapshot',source:'a'.repeat(32),target:'b'.repeat(32),epoch:1,id:2,prepared:{payload,rawBytes:payload.length,zipped:false},wide:true});
 assert.equal(f.count,3);const r=new SocketWireReceiver();let result;
 for(let i=0;i<f.count;i++){const p=f.packet(i);assert.ok(p.length<=8256);const h=socketWireHeader('snapshot',p);assert.equal(h.wide,true);result=r.receive(h,p,10);}
 assert.deepEqual(result.data,value);assert.equal(r.budget.bytes,0);
 const bad=Buffer.from(f.packet(0));bad[6]=8;assert.throws(()=>socketWireHeader('snapshot',bad));
 assert.throws(()=>socketWireFrame({op:'anchor',source:'a'.repeat(32),target:'b'.repeat(32),id:1,prepared:{payload,rawBytes:payload.length,zipped:false},wide:true}));
});
test('adaptive anchors amortize reliable refresh by admitted snapshot bytes, not only a wall-clock timer',()=>{
 const s=new SteamAnchoredSender({adaptive:true}),encoder=new SteamSnapshotEncoder(),codec=new SteamPacketCodec();
 let seed=18;const ballast=Array.from({length:14000},()=>String.fromCharCode(33+((seed=Math.imul(seed,1664525)+1013904223>>>0)%89))).join('');
 const text=n=>JSON.stringify({type:'state',matchId:'budget',seq:n,frame:{tick:n,ballast,x:n}});
 const a=s.prepare(text(0),encoder,codec,0);assert.equal(a.kind,'anchor');s.commit(a);s.acknowledgeAnchor(a.target.token);
 const sparse=s.prepare(text(1),encoder,codec,60000);assert.equal(sparse.kind,'snapshot');s.commit(sparse);
 let rotated=false;for(let n=2;n<2000;n++){const choice=s.prepare(text(n),encoder,codec,60000+n*20);if(choice.kind==='anchor'){rotated=true;break;}s.commit(choice);}
 assert.equal(rotated,true);assert.ok(s.diagnostics().anchorCount<=2);
});

test('fair reservation is work-conserving when independent pacer order visits a later peer first',()=>{
 const b=new SteamSocketFlightBudget(),a=peer(),z=peer();
 const outstanding=track(b,z,1,40000);
 assert.equal(b.allows(a,8256,a.stateJob),true); // Reserve, but native scheduler has not sent yet.
 assert.equal(b.allows(z,1024,z.stateJob),false); // Cannot consume a's reservation.
 b.acknowledge(z,[receipt(outstanding)],10);
 assert.equal(b.allows(z,1024,z.stateJob),true); // Spare bytes are usable even before a's next poll.
 for(let i=0;i<39;i++)track(b,z,i+2,1024,10);
 assert.equal(b.allows(z,1024,z.stateJob),false);
 assert.equal(b.allows(a,8256,a.stateJob),true);track(b,a,100,8256,10);
 assert.equal(b.bytes,39*1024+8256);assert.ok(b.bytes<=b.limit);
});
