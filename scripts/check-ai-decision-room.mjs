import assert from 'node:assert/strict';import fs from 'node:fs';import {EventEmitter} from 'node:events';import {createLanServer} from '../server/lan-server.mjs';import protocol from '../src/network/protocol.json' with {type:'json'};
const root='artifacts/lan-ai-decision-profile-20260929';fs.mkdirSync(root+'/relay',{recursive:true});fs.writeFileSync(root+'/relay/lan-build.json',JSON.stringify({build:'decision-profile-test'}));
class Browser extends EventEmitter{constructor(){super();this.readyState=1;this.bufferedAmount=0;this.messages=[];}send(text,done){this.messages.push(JSON.parse(text));done?.();}message(m){this.emit('message',Buffer.from(JSON.stringify(m)),false);}last(type){return this.messages.findLast(m=>m.type===type);}close(){if(this.readyState!==1)return;this.readyState=3;this.emit('close',1000,Buffer.from(''));}terminate(){this.close();}ping(data){this.emit('pong',data);}}
const app=await createLanServer({host:'127.0.0.1',port:0,dist:root+'/relay'});const browsers=[];
try{
 const connect=(name)=>{const b=new Browser();browsers.push(b);app.acceptTransport(b);b.message({type:'hello',protocol:protocol.version,build:'decision-profile-test',name,instance:name});assert.ok(b.last('welcome'));return b;};
 const host=connect('host');host.message({type:'create'});const room=[...app.rooms.values()][0];assert.ok(room);assert.equal(room.options.aiDecisionProfile,'standard');
 const guest=connect('guest');guest.message({type:'join',code:room.code});assert.equal(room.peers.length,2);
 guest.message({type:'options',options:{aiDecisionProfile:'large-battle-v1'}});assert.match(guest.last('error').message,/房主/);assert.equal(room.options.aiDecisionProfile,'standard');
 for(const value of [null,12,false,{},[],'unknown']){host.message({type:'options',options:{aiDecisionProfile:value}});assert.equal(room.options.aiDecisionProfile,'standard');}
 host.message({type:'ready',ready:true});guest.message({type:'ready',ready:true});assert.ok(room.peers.every(p=>p.ready));
 host.message({type:'options',options:{aiDecisionProfile:'large-battle-v1'}});assert.equal(room.options.aiDecisionProfile,'large-battle-v1');assert.ok(room.peers.every(p=>!p.ready));assert.equal(guest.last('room').room.options.aiDecisionProfile,'large-battle-v1');
 host.message({type:'options',options:{initialDeploymentLimit:120}});assert.equal(room.options.aiDecisionProfile,'large-battle-v1');
 host.message({type:'ready',ready:true});guest.message({type:'ready',ready:true});host.message({type:'start'});assert.equal(room.status,'loading',JSON.stringify(host.last('error')));assert.equal(room.match.options.aiDecisionProfile,'large-battle-v1');assert.notEqual(room.match.options,room.options);
 host.message({type:'options',options:{aiDecisionProfile:'standard'}});assert.match(host.last('error').message,/战斗中/);assert.equal(room.match.options.aiDecisionProfile,'large-battle-v1');
 const result={passed:['default standard','unknown enum rejected','guest denied','readiness reset','all peers receive rule','unrelated edits preserve rule','match frozen copy','mid-match edits denied'],scope:'Real shared LAN/Steam relay with in-memory transport; no Valve or real network latency claim'};fs.writeFileSync(root+'/room-contract.json',JSON.stringify(result,null,2));console.log(result);
}finally{for(const b of browsers)b.close();await app.close();}
