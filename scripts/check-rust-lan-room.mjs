import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {WebSocket} from 'ws';
import {createLanServer} from '../server/lan-server.mjs';
import {createAuthorityFactory} from '../server/ServerBattleAuthority.mjs';
import {LanDeltaReceiver,isLanDelta} from '../src/network/LanBinaryDelta.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
import {verifyRustLanServerBuild} from './lib/rust-lan-server-proof.mjs';

const base=path.resolve('artifacts/rust-combat-core-20261008/verification-lan-authority'),runtime=path.join(base,'server-runtime'),assets=path.join(base,'server-assets');
const wasm=await fs.readFile(path.join(base,'production.wasm')),sha256=createHash('sha256').update(wasm).digest('hex');
const buildProof=await verifyRustLanServerBuild(base,sha256);
await fs.mkdir(path.join(assets,'game-assets','runtime'),{recursive:true});
await fs.copyFile('public/game-assets/asset-manifest.json',path.join(assets,'game-assets','asset-manifest.json'));
await fs.writeFile(path.join(assets,'game-assets','runtime','combat-core.wasm'),wasm);
await fs.writeFile(path.join(assets,'game-assets','runtime','combat-core.json'),JSON.stringify({sha256,bytes:wasm.length}));
await fs.writeFile(path.join(assets,'lan-build.json'),JSON.stringify({build:'rust-room-acceptance'}));
await fs.writeFile(path.join(assets,'index.html'),'<!doctype html><title>Rust LAN authority acceptance</title>');
const inputFiles=JSON.parse(await fs.readFile(path.join(runtime,'authority-build-inputs.json'),'utf8')).filter(file=>!file.startsWith('<')).map(file=>file.replace(/^runtime-raw:/,'').replace(/ with \{ type: 'json' \}$/,''));
const inputs=Object.fromEntries(await Promise.all(inputFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const delegate=createAuthorityFactory({workerFile:path.join(runtime,'authority-worker.mjs'),assets,maxBattles:1});
let actualAuthority,recoveries=0;
const factory=(match,receive)=>delegate(match,message=>{if(message.type==='ready')actualAuthority=message.authority;if(message.type==='recovered')recoveries++;receive(message);});
Object.assign(factory,{activeCount:delegate.activeCount,close:delegate.close,workerFile:delegate.workerFile});
const lanAddress=Object.values(networkInterfaces()).flat().find(address=>address?.family==='IPv4'&&!address.internal&&!address.address.startsWith('169.254.'))?.address;
const listenAddress=lanAddress??'127.0.0.1';
const app=await createLanServer({host:listenAddress,port:0,dist:assets,authorityFactory:factory});
const origin='http://'+listenAddress+':'+app.server.address().port,clients=[],errors=[],checks=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(errors.length)throw errors[0];if(fn())return;await delay(20);}throw Error('Actual room timed out: '+label);}
class Peer{
 constructor(name,resumeToken){this.frames=0;this.deltaPackets=0;this.ack=true;this.decoder=new LanDeltaReceiver();clients.push(this);
  this.ws=new WebSocket(origin.replace(/^http/,'ws')+'/lan/ws',{origin,perMessageDeflate:true});
  this.ws.on('error',error=>errors.push(error));
  this.ws.on('open',()=>this.send({type:'hello',name,instance:crypto.randomUUID(),build:'rust-room-acceptance',protocol:protocol.version,resumeToken,stateCredits:1,binaryDelta:1,motionReference:1}));
  this.ws.on('message',(data,binary)=>{try{
   if(binary&&isLanDelta(data))this.deltaPackets++;
   const message=binary?decodeBinaryState(this.decoder.decode(data)):JSON.parse(data);
   if(message.type==='error')throw Error(message.message);
   if(message.type==='welcome'){this.welcome=message;this.decoder.setMotionReference(message.motionReference===1);}
   if(message.type==='room')this.room=message.room;
   if(message.type==='configured')this.configured=message;
   if(message.type==='match'){this.match=message.match;this.decoder.reset();this.send({type:'loaded',matchId:message.match.id});}
   if(message.type==='launch')this.launch=message;
   if(message.type==='controls-ready')this.controls=message;
   if(message.type==='deployment-result')this.deployment=message;
   if(message.type==='left')this.left=true;
   if(message.type==='state'){this.state=message;this.frames++;if(this.ack)this.send({type:'state-consumed',matchId:message.matchId,seq:message.seq});
    if(this.launch?.matchId===message.matchId&&this.controls?.syncId!==this.launch.syncId&&message.frame.tick>=this.launch.minTick)this.send({type:'sync-ready',matchId:message.matchId,syncId:this.launch.syncId,tick:message.frame.tick});}
  }catch(error){errors.push(error);}});
 }
 send(message){if(this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(message));}
}
let room;
try{
 const host=new Peer('rust-creator'),guest=new Peer('rust-guest');await until(()=>host.welcome&&guest.welcome,'hello');
 if(lanAddress){assert.equal(host.welcome.binaryDelta,1);assert.equal(guest.welcome.binaryDelta,1);assert.match(host.ws.extensions,/permessage-deflate/);assert.match(guest.ws.extensions,/permessage-deflate/);}
 else{assert.equal(host.ws.extensions,'');assert.equal(guest.ws.extensions,'');}
 host.send({type:'create',battleSize:400});await until(()=>host.room,'create');
 guest.send({type:'join',code:host.room.code});await until(()=>guest.room?.members.length===2,'join');room=app.rooms.get(host.room.code);
 host.send({type:'team',id:guest.welcome.id,team:1});await until(()=>guest.room.members.find(member=>member.id===guest.welcome.id)?.team===1,'team');
 host.send({type:'configure',hull:'web_zhuyuan',design:null});guest.send({type:'configure',hull:'web_sc2_hyperion',design:null});
 await until(()=>host.room.members.find(member=>member.id===host.welcome.id)?.hull==='web_zhuyuan'&&guest.room.members.find(member=>member.id===guest.welcome.id)?.hull==='web_sc2_hyperion','apply');
 guest.send({type:'ready',ready:true});await until(()=>host.room.members.find(member=>member.id===guest.welcome.id)?.ready,'ready');host.send({type:'start'});
 await until(()=>host.controls&&guest.controls&&host.frames>=20&&guest.frames>=20,'both actual replicas');
 assert.equal(host.match.authority,'server');assert.equal(actualAuthority?.kind,'rust-wasm');assert.equal(actualAuthority?.sha256,sha256);
 assert.deepEqual(room.authorityBackend,actualAuthority);assert.deepEqual(room.authority.authority,actualAuthority);
 assert.equal(host.state.frame.displayVersion,2);assert.equal(host.state.frame.ships.length,2);assert.deepEqual(Object.keys(host.state.frame.controlled).sort(),['0','1']);
 if(lanAddress){assert.ok(host.deltaPackets>0);assert.ok(guest.deltaPackets>0);}
 checks.push('actual create/join/apply/team/ready/start -> production Node Rust/Wasm and two seats over '+(lanAddress?'LAN IP with PMD/binary delta':'loopback full-state compression policy'));
 const hostPeer=room.peers.find(peer=>peer.id===host.welcome.id),guestPeer=room.peers.find(peer=>peer.id===guest.welcome.id);
 host.ack=false;await until(()=>hostPeer.stateCredits.stats().inflight===hostPeer.stateCredits.capacity,'host credits full');await delay(150);
 const sent=hostPeer.stateCredits.stats().sent,guestFrames=guest.frames,inflight=hostPeer.stateCredits.stats().inflight;
 host.send({type:'state-consumed',matchId:host.match.id,seq:host.state.seq+999999});await delay(200);
 assert.equal(hostPeer.stateCredits.stats().inflight,inflight);assert.equal(hostPeer.stateCredits.stats().sent,sent);assert.ok(guest.frames>guestFrames);assert.ok(hostPeer.stateCredits.stats().rejected>0);
 host.ack=true;const resumedFrames=host.frames;host.send({type:'state-consumed',matchId:host.match.id,seq:host.state.seq});await until(()=>host.frames>resumedFrames+5,'credits resumed');
 checks.push('one-seat credit barrier, forged ACK rejection, guest continuity and exact ACK resume');
 for(const [peer,seq,keys]of [[host,50,1],[guest,60,32]])peer.send({type:'input',matchId:peer.match.id,syncId:peer.launch.syncId,input:{seq,keys,aim:[0,0],firing:false,pointerActive:true,actions:[]}});
 await until(()=>host.state.frame.acknowledged[0]===50&&guest.state.frame.acknowledged[1]===60,'input receipts');
 checks.push('both actual player controls acknowledged through live compressed transport');
 const matchId=host.match.id,tick=guest.state.frame.tick,token=host.welcome.resumeToken;host.ws.terminate();await until(()=>guest.state.frame.tick>tick+30,'creator disconnect continuity');
 const resumed=new Peer('rust-creator',token);await until(()=>resumed.controls&&resumed.frames>=10,'credential recovery');assert.equal(resumed.match.id,matchId);assert.equal(resumed.welcome.id,host.welcome.id);
 checks.push('creator credential reconnect retains actual match/seat while guest continues');
 assert.ok(guestPeer.stateCredits.stats().acked>0);assert.equal(recoveries,0);
 for(const peer of [resumed,guest])peer.send({type:'leave'});await until(()=>resumed.left&&guest.left&&factory.activeCount()===0,'owned room cleanup');
 const changed=(await Promise.all(Object.entries(inputs).map(async([file,hash])=>createHash('sha256').update(await fs.readFile(file)).digest('hex')!==hash?file:null))).filter(Boolean);
 const proof=await verifyRustLanServerBuild(base,sha256);if(proof.bundleSHA256!==buildProof.bundleSHA256)throw Error('Actual Node authority rebuilt during check');
 const result={passed:changed.length===0,actualProductionNodeAuthority:true,actualWebSocketServer:true,actualDeltaReceiver:true,wasmSHA256:sha256,authority:actualAuthority,checks,frames:clients.map(peer=>peer.frames),recoveries,changed,buildProof:{...proof,sourceFingerprints:undefined},visibleWindows:false};
 await fs.writeFile(path.join(base,'server-room-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}catch(error){const result={passed:false,error:String(error),stack:error?.stack,authority:actualAuthority,wasmSHA256:sha256,checks,frames:clients.map(peer=>peer.frames),recoveries,errors:errors.map(e=>String(e)),roomStatus:room?.status};await fs.writeFile(path.join(base,'server-room-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=1;}
finally{for(const peer of clients)peer.ws.terminate();await app.close();await factory.close();}
