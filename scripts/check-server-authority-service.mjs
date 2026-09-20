import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {WebSocket} from 'ws';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
const args=process.argv.slice(2),value=(k,f)=>{const i=args.indexOf(k);return i<0?f:args[i+1];};
const origin=value('--origin','http://127.0.0.1:32120'),out=value('--out','service-smoke.json');
const info=await(await fetch(origin+'/lan/info')).json();assert.equal(info.authority,'server');
const build=(await(await fetch(origin+'/lan-build.json')).json()).build;
assert.equal((await fetch(origin+'/')).status,200);
const clients=[],errors=[],checks=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<2000;i++){if(errors.length)throw errors[0];if(fn())return;await sleep(20);}throw Error('Timeout '+label);}
class Peer{
 constructor(name,token){
  this.decoder=new LanDeltaReceiver();this.frames=0;clients.push(this);
  this.ws=new WebSocket(origin.replace(/^http/,'ws')+'/lan/ws',{origin,perMessageDeflate:true});
  this.ws.on('error',e=>errors.push(e));
  this.ws.on('open',()=>this.send({type:'hello',name,instance:crypto.randomUUID(),build,protocol:protocol.version,resumeToken:token,stateCredits:1,binaryDelta:1,motionReference:1}));
  this.ws.on('message',(data,binary)=>{try{
   const m=binary?decodeBinaryState(this.decoder.decode(data)):JSON.parse(data);
   if(m.type==='welcome'){this.welcome=m;this.decoder.setMotionReference(m.motionReference===1);}
   if(m.type==='room')this.room=m.room;
   if(m.type==='match'){this.match=m.match;this.decoder.reset();this.send({type:'loaded',matchId:m.match.id});}
   if(m.type==='launch')this.launch=m;
   if(m.type==='controls-ready')this.controls=m;
   if(m.type==='left')this.left=true;
   if(m.type==='error')throw Error(m.message);
   if(m.type==='state'){this.state=m;this.frames++;this.send({type:'state-consumed',matchId:m.matchId,seq:m.seq});if(this.controls?.syncId!==this.launch?.syncId&&m.frame.tick>=this.launch.minTick)this.send({type:'sync-ready',matchId:m.matchId,syncId:this.launch.syncId,tick:m.frame.tick});}
  }catch(e){errors.push(e);}});
 }
 send(m){if(this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(m));}
}
try{
 const a=new Peer('service-creator'),b=new Peer('service-guest');await until(()=>a.welcome&&b.welcome,'hello');
 assert.match(a.ws.extensions,/permessage-deflate/);assert.equal(a.welcome.motionReference,1);
 a.send({type:'create'});await until(()=>a.room,'create');b.send({type:'join',code:a.room.code});await until(()=>b.room?.members.length===2,'join');
 b.send({type:'ready',ready:true});await until(()=>a.room.members[1].ready,'ready');a.send({type:'start'});
 await until(()=>a.controls&&b.controls&&a.frames>30&&b.frames>30,'actual service snapshots');
 checks.push('deployed HTTP assets, real authority, PMD/delta and both replicas');
 const matchId=a.match.id,tick=b.state.frame.tick;a.ws.terminate();
 await until(()=>b.state.frame.tick>tick+30,'creator close continues');
 const resumed=new Peer('service-creator',a.welcome.resumeToken);await until(()=>resumed.controls&&resumed.frames>10,'resume');assert.equal(resumed.match.id,matchId);
 checks.push('creator disconnect/reconnect keeps actual server battle');
 for(const p of [resumed,b])p.send({type:'visibility',hidden:true});await sleep(300);const frames=b.frames;await sleep(1500);assert.equal(b.frames,frames);
 for(const p of [resumed,b]){p.decoder.reset();p.send({type:'visibility',hidden:false});p.send({type:'resync',matchId});}
 await until(()=>resumed.controls?.syncId===resumed.launch?.syncId&&b.controls?.syncId===b.launch?.syncId&&b.frames>frames+10,'fresh resume');
 checks.push('all hidden suspends delivery and both clients recover fresh frames');
 for(const p of [resumed,b])p.send({type:'leave'});await until(()=>resumed.left&&b.left,'test seats released');
 const result={passed:true,origin,build,checks,frames:clients.map(p=>p.frames),errors:[]};await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{for(const p of clients)p.send({type:'leave'});await sleep(100);for(const p of clients)p.ws.terminate();}
