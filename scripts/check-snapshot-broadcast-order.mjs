import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createLanServer} from '../server/lan-server.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
class MemoryServer extends EventEmitter{listen(_p,_h,fn){fn();}address(){return{port:32110};}close(fn){fn();}}
for(const steam of [false,true])test(`actual ${steam?'Steam':'LAN'} relay rotates only eligible snapshot recipients, not host/control slots`,async t=>{
 const dist=mkdtempSync(join(tmpdir(),'snapshot-order-'));writeFileSync(join(dist,'lan-build.json'),JSON.stringify({build:'test'}));
 const mocked=t.mock.method(http,'createServer',()=>new MemoryServer());let relay;const sent=[];
 class Socket extends EventEmitter{
  readyState=1;bufferedAmount=0;extensions='';rows=[];
  constructor(index){super();this.index=index;}
  send(text){const m=JSON.parse(text);this.rows.push(m);sent.push({index:this.index,type:m.type,seq:m.seq});}
  ping(){}close(){this.readyState=3;this.emit('close',1000);}terminate(){this.close();}
  receive(m){this.emit('message',Buffer.from(JSON.stringify(m)),false);}
 }
 try{
  relay=await createLanServer({dist,host:'127.0.0.1',port:32110});mocked.mock.restore();
  const peers=Array.from({length:4},(_,index)=>{const ws=new Socket(index);relay.acceptTransport(ws,steam?{identity:'identity-'+index,scope:'room-scope',canHost:index===0}:null);ws.receive({type:'hello',name:'test',instance:'test',protocol:protocol.version,build:'test'});return ws;});
  const host=peers[0];host.receive({type:'create',password:''});const room=[...relay.rooms.values()][0];
  for(const guest of peers.slice(1))guest.receive({type:'join',code:room.code});
  assert.equal(room.peers.length,4);
  for(const guest of peers.slice(1))guest.receive({type:'ready',ready:true});
  host.receive({type:'start'});assert.ok(room.match,JSON.stringify(host.rows.filter(m=>m.type==='error')));for(const p of peers)p.receive({type:'loaded',matchId:room.match.id});assert.equal(room.status,'running');
  let seq=0;const state=()=>{sent.length=0;host.receive({type:'state',matchId:room.match.id,seq:++seq,frame:{tick:seq,ships:room.match.players.map((p,i)=>({id:'ship-'+i,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{time:seq/60}}});assert.equal(host.rows.at(-1)?.type==='error',false,JSON.stringify(host.rows.at(-1)));return sent.filter(x=>x.type==='state').map(x=>x.index);};
  assert.deepEqual(state(),[1,2,3]);assert.deepEqual(state(),[2,3,1]);assert.deepEqual(state(),[3,1,2]);assert.deepEqual(state(),[1,2,3]);
  peers[2].receive({type:'visibility',hidden:true});const a=state(),b=state();assert.deepEqual(a.toSorted(),[1,3]);assert.deepEqual(b.toSorted(),[1,3]);assert.notEqual(a[0],b[0]);
  peers[3].bufferedAmount=1;assert.deepEqual(state(),[1]);peers[3].bufferedAmount=0;
  sent.length=0;host.receive({type:'end',matchId:room.match.id});assert.equal(room.status,'ended');assert.deepEqual(sent.filter(x=>x.type==='ended').map(x=>x.index),[0,1,2,3]);
 }finally{mocked.mock.restore();if(relay)await relay.close();unlinkSync(join(dist,'lan-build.json'));rmdirSync(dist);}
});
