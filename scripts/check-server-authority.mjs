import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {WebSocket} from 'ws';
import {createLanServer} from '../server/lan-server.mjs';
import {createAuthorityFactory} from '../server/ServerBattleAuthority.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
const base=path.resolve('artifacts/server-authority-20260920'), dist=path.join(base,'test-web');
await fs.mkdir(dist,{recursive:true}); await fs.writeFile(path.join(dist,'lan-build.json'),JSON.stringify({build:'dedicated-test'}));await fs.writeFile(path.join(dist,'index.html'),'dedicated test');
const factory=createAuthorityFactory({workerFile:path.join(base,'runtime/authority-worker.mjs'),assets:path.resolve('public'),maxBattles:1});
const app=await createLanServer({host:'127.0.0.1',port:0,dist,authorityFactory:factory});
const origin='http://127.0.0.1:'+app.server.address().port;
const clients=[],checks=[];
const until=async(fn,label,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out: '+label);};
class Peer {
 constructor(name,token){this.name=name;this.frames=0;this.messages=[];this.ws=new WebSocket(origin.replace('http','ws')+'/lan/ws',{origin,perMessageDeflate:false});clients.push(this);
  this.ws.on('error',()=>{});this.ws.on('open',()=>this.send({type:'hello',name,instance:crypto.randomUUID(),build:'dedicated-test',protocol:protocol.version,stateCredits:1,...(token?{resumeToken:token}:{})}));
  this.ws.on('message',(data,binary)=>{const m=binary?decodeBinaryState(data):JSON.parse(data);this.messages.push(m);if(this.messages.length>300)this.messages.shift();
   if(m.type==='welcome')this.welcome=m;
   if(m.type==='room')this.room=m.room;
   if(m.type==='match'){this.match=m.match;this.send({type:'loaded',matchId:m.match.id});}
   if(m.type==='launch')this.launch=m;
   if(m.type==='controls-ready')this.controls=m;
   if(m.type==='ended')this.ended=m;
   if(m.type==='state'){this.frames++;this.state=m;this.send({type:'state-consumed',matchId:m.matchId,seq:m.seq});if(this.launch?.matchId===m.matchId&&this.controls?.syncId!==this.launch.syncId&&m.frame.tick>=this.launch.minTick)this.send({type:'sync-ready',matchId:m.matchId,syncId:this.launch.syncId,tick:m.frame.tick});}
  });
 }
 send(m){if(this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(m));}
 input(seq){this.send({type:'input',matchId:this.match.id,syncId:this.launch.syncId,input:{seq,keys:1,aim:[0,0],firing:false,pointerActive:true,actions:[]}});}
}
try {
 const a=new Peer('creator'),b=new Peer('guest');await until(()=>a.welcome&&b.welcome,'hello');
 a.send({type:'create'});await until(()=>a.room,'room');const code=a.room.code;
 b.send({type:'join',code});await until(()=>b.room?.members.length===2,'join');b.send({type:'ready',ready:true});await until(()=>a.room.members.some(p=>p.id===b.welcome.id&&p.ready),'ready');
 a.send({type:'start'});await until(()=>a.controls&&b.controls&&a.frames>=12&&b.frames>=12,'server snapshots for both seats');
 assert.equal(a.match.authority,'server');assert.equal(factory.activeCount(),1);checks.push('actual Node authority sends frames to creator and guest');
 a.input(10);b.input(20);await until(()=>a.state.frame.acknowledged[0]>=10&&b.state.frame.acknowledged[1]>=20,'both input acknowledgements');checks.push('seat 0 and guest inputs acknowledged by server');
 const initialMatch=a.match.id;const before=b.state.frame.tick;const token=a.welcome.resumeToken;a.ws.terminate();await until(()=>b.state.frame.tick>before+10,'creator disconnected but simulation continues');
 const resumed=new Peer('creator',token);await until(()=>resumed.controls&&resumed.frames>=5,'creator page reload');assert.equal(resumed.match.id,initialMatch);assert.equal(resumed.room.status,'running');checks.push('creator disconnect and new-instance resume keep same authoritative match');
 const bads=['state','finish','deployment-result','host-recovered'];for(const type of bads){const n=resumed.messages.filter(m=>m.type==='error').length;resumed.send({type,matchId:initialMatch,seq:900000,frame:{},winner:0});await until(()=>resumed.messages.filter(m=>m.type==='error').length>n,'reject '+type);}assert.equal(b.room.status,'running');checks.push('even room creator cannot forge authoritative states/results/recovery');
 const mine=resumed.state.frame.ships.find(row=>row.state.teamId===0).id;const requestId='deploy-own';resumed.send({type:'deployment',matchId:initialMatch,syncId:resumed.launch.syncId,requestId,operation:'retreat',ids:[mine]});await until(()=>resumed.messages.some(m=>m.type==='deployment-result'&&m.requestId===requestId),'server deployment reply');assert.ok(resumed.messages.find(m=>m.type==='deployment-result'&&m.requestId===requestId).ok);checks.push('deployment request executed by server Worker');
 resumed.send({type:'leave'});await until(()=>b.room.members.length===1&&b.room.hostId===b.welcome.id,'leadership transfer');const oldTick=b.state.frame.tick;await until(()=>b.state.frame.tick>oldTick+10,'creator leave continuation');checks.push('creator explicit leave transfers room administration, not simulation ownership');
 const c=new Peer('next'),d=new Peer('other'),e=new Peer('capacity-guest');await until(()=>c.welcome&&d.welcome&&e.welcome,'new clients');
 d.send({type:'create'});await until(()=>d.room,'second room');e.send({type:'join',code:d.room.code});await until(()=>e.room?.members.length===2,'capacity join');e.send({type:'ready',ready:true});await until(()=>d.room.members.some(p=>p.id===e.welcome.id&&p.ready),'capacity ready');d.send({type:'start'});await until(()=>d.ended,'capacity rejection');assert.match(d.ended.reason,/已满/);assert.equal(b.room.status,'running');checks.push('battle capacity rejects extra worker without disturbing running room');
 b.send({type:'end',matchId:initialMatch});await until(()=>b.ended&&factory.activeCount()===0,'worker cleanup on end');
 c.send({type:'join',code});await until(()=>c.room?.members.length===2,'next battle join');c.send({type:'ready',ready:true});await until(()=>b.room.members.some(p=>p.id===c.welcome.id&&p.ready),'next ready');b.controls=null;c.controls=null;b.send({type:'start'});await until(()=>b.match.id!==initialMatch&&b.controls&&c.controls,'new leader next match');assert.equal(b.match.players.find(p=>p.id===b.welcome.id).seat,0);checks.push('next match remaps seats only after previous match ends');
 b.send({type:'leave'});c.send({type:'leave'});await until(()=>!app.rooms.has(code)&&factory.activeCount()===0,'empty room worker cleanup');checks.push('empty room releases worker');
 const info=await (await fetch(origin+'/lan/info')).json();assert.equal(info.authority,'server');checks.push('browser discovery advertises server authority');
 console.log(JSON.stringify({passed:true,checks},null,2));await fs.writeFile(path.join(base,'integration-results.json'),JSON.stringify({passed:true,checks},null,2));
} finally {for(const p of clients)p.ws.terminate();await app.close();await factory.close();}
