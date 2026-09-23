// Real browser/Worker close regression, isolated and headless; no game/campaign build.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {WebSocketServer} from 'ws';
const {chromium}=createRequire(import.meta.url)('playwright');
const out=path.resolve(process.env.SOCKET_CLOSE_OUT??'artifacts/network-stream-20260921/phase18/socket-close');await fs.mkdir(out,{recursive:true});
let vite,browser,browserServer;const errors=[],cases=[],serverCloses=[];const wss=new WebSocketServer({noServer:true});
wss.on('connection',ws=>ws.on('close',(code,reason)=>serverCloses.push({code,reason:String(reason)})));
try {
 vite=await createServer({configFile:false,root:process.cwd(),optimizeDeps:{noDiscovery:true,entries:[]},server:{host:'127.0.0.1',port:0,open:false,watch:null,headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}},plugins:[{name:'close-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__close.html')return next();res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Headless close fixture</title>');});}}],logLevel:'error'});
 await vite.listen();const port=vite.httpServer.address().port;
 vite.httpServer.on('upgrade',(req,socket,head)=>{if(req.url==='/socket-test')wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
 browserServer=await chromium.launchServer({headless:true});browser=await chromium.connect(browserServer.wsEndpoint());const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/__close.html`);
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
 assert.deepEqual(errors,[]);assert.equal(serverCloses.length,8);
} catch(e){process.exitCode=1;errors.push(String(e));}
finally{await browser?.close();await browserServer?.kill();for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));await vite?.close();}
const result={cases,serverCloses,errors,cleanupCompleted:true};await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
