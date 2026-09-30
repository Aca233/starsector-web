// Real browser/Worker close regression, isolated and headless; no game/campaign build.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {WebSocketServer} from 'ws';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const out=path.resolve(process.env.SOCKET_CLOSE_OUT??'artifacts/network-stream-20260921/phase18/socket-close');await fs.mkdir(out,{recursive:true});
let vite,browser,browserServer;const errors=[],cases=[],serverCloses=[],admissionCases=[],authorityFrames=[];const wss=new WebSocketServer({noServer:true});
wss.on('connection',ws=>{
 ws.on('close',(code,reason)=>serverCloses.push({code,reason:String(reason)}));
 ws.on('message',(data,binary)=>{if(binary){const state=decodeBinaryState(data);authorityFrames.push({tick:state.frame.tick,seq:state.seq,matchId:state.matchId});}else if(String(data)==='test-launch')ws.send('{"type":"launch","matchId":"admission-test"}');});
});
try {
 vite=await createServer({configFile:false,root:process.cwd(),optimizeDeps:{noDiscovery:true,entries:[]},server:{host:'127.0.0.1',port:0,open:false,watch:null,headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}},plugins:[{name:'close-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__close.html')return next();res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Headless close fixture</title>');});}}],logLevel:'error'});
 await vite.listen();const port=vite.httpServer.address().port;
 vite.httpServer.on('upgrade',(req,socket,head)=>{if(req.url==='/socket-test')wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
 browserServer=await chromium.launchServer({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});browser=await chromium.connect(browserServer.wsEndpoint());const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/__close.html`);
 for(const mode of ['worker','fallback'])for(const kind of ['empty','reason','explicit','invalid']){
  const result=await page.evaluate(async({mode,kind})=>{
   const {createLanSocket}=await import('/src/network/LanSocket.ts');const NativeWorker=window.Worker;
   if(mode==='fallback')window.Worker=class{constructor(){throw Error('isolated forced pre-connect fallback');}};
   const socket=createLanSocket(location.origin.replace('http:','ws:')+'/socket-test');window.Worker=NativeWorker;
   const row={mode,kind,isolated:crossOriginIsolated,name:socket.constructor.name,errors:[]};socket.onerror=()=>row.errors.push('socket error');
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('open timed out')),10000);socket.onopen=()=>{clearTimeout(timer);resolve();};});
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('close timed out')),10000);socket.onclose=e=>{clearTimeout(timer);row.code=e.code;row.reason=e.reason;row.wasClean=e.wasClean;resolve();};
    if(kind==='invalid'){try{socket.close(0);row.invalidAccepted=true;}catch(e){row.invalidName=e.name;}socket.close();}
    else if(kind==='empty')socket.close();else if(kind==='reason')socket.close(undefined,'done');else socket.close(4001,'retryable');
   });return row;
  },{mode,kind});cases.push(result);
  assert.equal(result.isolated,true);assert.equal(result.name,'WorkerLanSocket');assert.deepEqual(result.errors,[]);assert.equal(result.wasClean,true);
  assert.equal(result.code,kind==='explicit'?4001:kind==='reason'?1000:1005);if(kind==='invalid')assert.equal(result.invalidName,'InvalidAccessError');
 }
 // Actual browser I/O Worker, MessagePort and WebSocket. The congestion is a
 // controlled main-thread reservation (as in a failed copy/post), NOT a WAN test.
 const admission=await page.evaluate(async()=>{
  const {createLanSocket}=await import('/src/network/LanSocket.ts');const {Cell}=await import('/src/network/LanSocketShared.ts');
  const {attachAuthorityAdmission,isAuthoritySnapshotBlocked}=await import('/src/network/AuthorityIoAdmission.mjs');
  const {encodeProjectedBinaryFrame}=await import('/src/network/BinarySnapshot.mjs');
  const wait=async(fn,label)=>{const until=performance.now()+5000;while(performance.now()<until){if(fn())return;await new Promise(r=>setTimeout(r,4));}throw Error(label);};
  const socket=createLanSocket(location.origin.replace('http:','ws:')+'/socket-test'),events=[],channel=new MessageChannel();
  channel.port1.onmessage=e=>events.push(e.data);channel.port1.start();await wait(()=>socket.readyState===1,'open');
  if(!socket.attachAuthority(channel.port2,'admission-test',7))throw Error('No real authority port');
  await wait(()=>events.some(e=>e.type==='io-ready'),'ready');const ready=events.find(e=>e.type==='io-ready');const view=attachAuthorityAdmission(ready.admission);
  if(!view)throw Error('Shared admission not installed');
  const cells=socket.cells,bytes=4096; // test observes the real facade's private accounting
  Atomics.add(cells,Cell.outbound,bytes);Atomics.add(cells,Cell.pendingSend,bytes);
  socket.send('test-launch');await wait(()=>events.some(e=>e.type==='start'),'launch');
  await wait(()=>Atomics.load(cells,Cell.nativeBuffered)===0 && socket.bufferedAmount===bytes && isAuthoritySnapshotBlocked(view),'reservation-only blockage');
  const publish=tick=>{const binary=encodeProjectedBinaryFrame({tick,ships:[],world:{combatTime:tick/60}}).buffer;channel.port1.postMessage({type:'snapshot',tick,attempt:tick,binary,bytes:binary.byteLength},[binary]);};
  publish(1);await wait(()=>events.some(e=>e.type==='io-snapshot'&&e.tick===1),'skip');
  const skipped=events.find(e=>e.type==='io-snapshot'&&e.tick===1),priorEvents=events.length;
  // No further send/message is posted. Only the existing drain timer can clear
  // a hint whose last observation consisted solely of a rolled-back reservation.
  Atomics.sub(cells,Cell.pendingSend,bytes);Atomics.sub(cells,Cell.outbound,bytes);
  await wait(()=>!isAuthoritySnapshotBlocked(view),'rollback wake');const wakeMessages=events.length-priorEvents;
  publish(2);await wait(()=>events.some(e=>e.type==='io-snapshot'&&e.tick===2),'recovery');
  const sent=events.find(e=>e.type==='io-snapshot'&&e.tick===2);socket.detachAuthority();await wait(()=>events.some(e=>e.type==='io-unavailable'),'detach');
  const revoked=!isAuthoritySnapshotBlocked(view);channel.port1.close();socket.close();await wait(()=>socket.readyState===3,'closed');
  return{isolated:crossOriginIsolated,skipped,sent,wakeMessages,revoked,queueBytes:socket.bufferedAmount};
 });admissionCases.push(admission);
 assert.equal(admission.isolated,true);assert.equal(admission.skipped.delivery,'skipped');assert.equal(admission.skipped.nextSequence,7);assert.equal(admission.sent.delivery,'sent');assert.equal(admission.sent.nextSequence,8);assert.equal(admission.wakeMessages,0);assert.equal(admission.revoked,true);assert.equal(admission.queueBytes,0);
 assert.deepEqual(authorityFrames,[{tick:2,seq:7,matchId:'admission-test'}]);
 assert.deepEqual(errors,[]);assert.equal(serverCloses.length,9);
} catch(e){process.exitCode=1;errors.push(String(e));}
finally{await browser?.close();await browserServer?.kill();for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));await vite?.close();}
const result={cases,admissionCases,authorityFrames,serverCloses,errors,cleanupCompleted:true};await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
