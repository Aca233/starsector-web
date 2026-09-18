import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roomApplyAction, roomWorkflow, submitRoomAction } from '../src/network/room-workflow.mjs';
const member=(id,team=0)=>({id,name:id,team,hull:'onslaught',design:null,ready:false,editing:false,connected:true});
const makeRoom=()=>({code:'ABC123',hostId:'host',status:'lobby',members:[member('host')],options:{aiHulls:[[],['onslaught']],assignment:'teams',battleSize:400}});
const draft={hullId:'onslaught'};

test('solo host can apply and start against AI; with no enemy only apply',()=>{
  const room=makeRoom();room.members[0].editing=true;
  assert.equal(roomApplyAction(room,'host',draft).label,'应用并开始');
  room.options.aiHulls=[[],[]];
  assert.equal(roomApplyAction(room,'host',draft).continueToAction,false);
  assert.equal(roomWorkflow(room,'host').opponentTeam,1);
  room.options.assignment='solo';assert.equal(roomWorkflow(room,'host').opponentTeam,0);
});
test('host apply predicts readiness reset, never starts over ready guests',()=>{
  const room=makeRoom();room.members.push({...member('guest',1),ready:true});
  const next=roomApplyAction(room,'host',draft);
  assert.equal(next.label,'应用配装');assert.match(next.hint,/等待玩家准备/);
  assert.equal(room.members[1].ready,true,'prediction must not mutate live room');
});
test('guest applies and readies regardless of another pending editor',()=>{
  const room=makeRoom();room.members[0].editing=true;room.members.push(member('guest',1));
  assert.equal(roomApplyAction(room,'guest',draft).label,'应用并准备');
  assert.equal(roomApplyAction(room,'guest',draft).continueToAction,true);
});
test('deployment budget, offline guests and in-progress battles block automatic start',()=>{
  const room=makeRoom();room.options.battleSize=200;room.options.aiHulls=Array.from({length:6},()=>['onslaught']);
  assert.equal(roomApplyAction(room,'host',draft).continueToAction,false);
  room.options.battleSize=400;room.options.aiHulls=[[],['onslaught']];room.members.push({...member('guest',1),connected:false});
  assert.match(roomApplyAction(room,'host',draft).hint,/重新连接/);
  room.members.pop();room.status='running';assert.equal(roomApplyAction(room,'host',draft).continueToAction,false);
});
test('readiness summary excludes offline/editing guests and ignores empty teams',()=>{
  const room=makeRoom();room.members.push({...member('guest',1),ready:true,editing:true});
  let flow=roomWorkflow(room,'guest');assert.equal(flow.ready,0);assert.equal(flow.ownReady,false);assert.equal(flow.guests,1);
  room.members[1].editing=false;flow=roomWorkflow(room,'guest');assert.equal(flow.ready,1);assert.equal(flow.ownReady,true);
  room.options.aiHulls=[[],[],[],[]];room.members.pop();assert.equal(roomWorkflow(room,'host').opponentsMissing,true);
});
function connection(onSend){const listeners=new Set();return {ready:true,listeners,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  emit(message){for(const fn of listeners)fn(message);},send(message){return onSend?.(message)??true;}};}
test('ready acknowledgement ignores unrelated rooms and unchanged ready state',async()=>{
  const room=makeRoom();room.members.push(member('guest',1));let sent,done=false;
  const conn=connection(message=>{sent=message;});
  const pending=submitRoomAction(conn,room.code,'guest',{type:'ready',ready:true}).then(()=>{done=true;});
  conn.emit({type:'room',room});await Promise.resolve();assert.equal(done,false);
  conn.emit({type:'error',requestId:'someone-else',message:'unrelated'});
  room.members[1].ready=true;conn.emit({type:'room',room:{...room,code:'OTHER1'}});await Promise.resolve();assert.equal(done,false);
  assert.equal(sent.type,'ready');assert.ok(sent.requestId);
  conn.emit({type:'room',room});await pending;assert.equal(conn.listeners.size,0);
});
test('cancel ready can acknowledge editing state; start requires matching loading room',async()=>{
  const room=makeRoom();room.members.push({...member('guest'),editing:true});const conn=connection();
  let pending=submitRoomAction(conn,room.code,'guest',{type:'ready',ready:false});conn.emit({type:'room',room});await pending;
  pending=submitRoomAction(conn,room.code,'host',{type:'start'});room.status='loading';room.match={hostId:'host'};
  conn.emit({type:'room',room});await pending;assert.equal(conn.listeners.size,0);
});
test('server rejection, disconnect, abort and send failure all release listeners',async()=>{
  for(const event of ['error','reconnecting','abort','send']){
    let sent;const controller=new AbortController();const conn=connection(message=>{sent=message;return event!=='send';});
    const pending=submitRoomAction(conn,'ABC123','guest',{type:'ready',ready:true},controller.signal);
    const rejected=assert.rejects(pending);
    if(event==='error')conn.emit({type:'error',requestId:sent.requestId,message:'rejected'});
    if(event==='reconnecting')conn.emit({type:'reconnecting'});
    if(event==='abort')controller.abort();
    await rejected;assert.equal(conn.listeners.size,0,event);
  }
});

test('real relay returns correlated ready/start failures and confirms ready toggles', {timeout:15000}, async()=>{
  const { createLanServer } = await import('../server/lan-server.mjs');
  const { WebSocket } = await import('ws');
  const { default: protocol } = await import('../src/network/protocol.json', {with:{type:'json'}});
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  const dir=fs.mkdtempSync(path.join(process.cwd(),'artifacts','room-workflow-test-'));
  fs.writeFileSync(path.join(dir,'lan-build.json'),JSON.stringify({build:'room-workflow-test'}));
  fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html>');
  let app;const clients=[];
  const next=(conn,predicate)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{unsubscribe();reject(Error('relay response timed out'));},3000);
    const unsubscribe=conn.subscribe(message=>{if(predicate(message)){clearTimeout(timer);unsubscribe();resolve(message);}});
  });
  try {
    app=await createLanServer({host:'127.0.0.1',port:0,dist:dir});
    const origin='http://127.0.0.1:'+app.server.address().port;
    const connect=async(name)=>{
      const ws=new WebSocket(origin.replace('http','ws')+'/lan/ws',{origin});
      const conn=connection(message=>{ws.send(JSON.stringify(message));return true;});clients.push(ws);
      ws.on('message',data=>conn.emit(JSON.parse(data.toString())));
      const welcome=next(conn,m=>m.type==='welcome');
      await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
      conn.send({type:'hello',protocol:protocol.version,build:'room-workflow-test',name,instance:name});
      return {conn,id:(await welcome).id};
    };
    const host=await connect('host');let response=next(host.conn,m=>m.type==='room');host.conn.send({type:'create',battleSize:400});
    const code=(await response).room.code;
    await assert.rejects(submitRoomAction(host.conn,code,host.id,{type:'start'}),/至少需要两个/);
    const guest=await connect('guest');response=next(guest.conn,m=>m.type==='room');guest.conn.send({type:'join',code,password:''});await response;
    await assert.rejects(submitRoomAction(guest.conn,code,guest.id,{type:'start'}),/房主/);
    response=next(guest.conn,m=>m.type==='room'&&m.room.members.find(p=>p.id===guest.id)?.editing);
    guest.conn.send({type:'editing',editing:true});await response;
    await assert.rejects(submitRoomAction(guest.conn,code,guest.id,{type:'ready',ready:true}),/应用或放弃/);
    response=next(guest.conn,m=>m.type==='room'&&!m.room.members.find(p=>p.id===guest.id)?.editing);
    guest.conn.send({type:'editing',editing:false});await response;
    await submitRoomAction(guest.conn,code,guest.id,{type:'ready',ready:true});
    await submitRoomAction(guest.conn,code,guest.id,{type:'ready',ready:false});
    assert.equal(host.conn.listeners.size,0);assert.equal(guest.conn.listeners.size,0);
  } finally {
    for(const ws of clients)ws.terminate();await app?.close();
    for(const name of ['index.html','lan-build.json'])fs.unlinkSync(path.join(dir,name));
    fs.rmdirSync(dir);
  }
});

test('ordinary HTTP LAN works without crypto.randomUUID',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
  Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
  try {
    let request;const conn=connection(message=>{request=message;return false;});
    await assert.rejects(submitRoomAction(conn,'ABC123','guest',{type:'ready',ready:true}),/未能发送/);
    assert.match(request.requestId,/^[a-f0-9]{32}$/);assert.equal(conn.listeners.size,0);
  } finally {
    if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID;
  }
});
