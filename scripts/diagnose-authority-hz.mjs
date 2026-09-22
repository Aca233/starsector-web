// Isolated CPU/MessagePort ceiling, NOT an end-to-end network benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {frozenBrowserPlugin} from './lib/frozen-vite-sources.mjs';
import {hzProbePlugin} from './lib/hz-probe-plugin.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve('artifacts/network-stream-20260921/phase22');
const match=JSON.parse(await fs.readFile(process.env.HZ_FIXTURE??path.join(root,'probe-normal-repeat/fixture-match.json'),'utf8'));
let browser,server;
try {
 server=await createServer({configFile:false,plugins:[frozenBrowserPlugin(process.env.MULTIPLAYER_FROZEN),hzProbePlugin()],define:{__LAN_BUILD_ID__:'"hz-probe"'},optimizeDeps:{noDiscovery:true,entries:[]},server:{host:'127.0.0.1',port:0,open:false,watch:null},logLevel:'error'});await server.listen();
 browser=await chromium.launch({headless:true});
 for(const variant of ['both','network-only','physics-only']){
  const page=await browser.newPage();await page.route('**/__hz-bare.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>headless authority diagnostic</title>'}));await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__hz-bare.html');
  await page.evaluate(async({match,variant})=>{
   window.__LAN_BUILD_ID__='hz-probe';const Worker=(await import('/src/network/host.worker.ts?worker')).default,w=new Worker();
   const b=window.bare={worker:w,rows:[],errors:[],ready:false,networkFrames:0,displayFrames:0,bytes:0,lastTick:0};
   w.addEventListener('error',e=>b.errors.push(String(e.message)));
   w.onmessage=({data:m})=>{if(m.type==='hz-probe')b.rows.push(m);if(m.type==='ready')b.ready=true;if(m.type==='error'||m.type==='failed'||m.type==='finished')b.errors.push(m.type+':'+(m.message??''));if(m.type==='snapshot'){b.displayFrames++;b.lastTick=m.tick;if(variant==='both')w.postMessage({type:'snapshot-consumed',tick:m.tick});}if(m.type==='motion')w.postMessage({type:'motion-consumed',tick:m.tick});};
   if(variant!=='physics-only'){
    const channel=new MessageChannel();let sequence=0;
    channel.port1.onmessage=({data:m})=>{const at=performance.timeOrigin+performance.now();if(m.type==='snapshot'){b.networkFrames++;b.lastTick=m.tick;b.bytes+=m.bytes;channel.port1.postMessage({type:'io-snapshot',tick:m.tick,delivery:'sent',nextSequence:++sequence,probeReceivedAt:at,probeDoneAt:performance.timeOrigin+performance.now()});}else if(m.type==='motion')channel.port1.postMessage({type:'io-motion',tick:m.tick});};channel.port1.start();
    w.postMessage({type:'authority-port',port:channel.port2},[channel.port2]);channel.port1.postMessage({type:'io-ready'});b.port=channel.port1;
   }
   w.postMessage({type:'init',match,binarySnapshots:true,motionState:true,hidden:false});
  },{match,variant});
  await page.waitForFunction(()=>bare.ready||bare.errors.length,{timeout:30000});assert.deepEqual(await page.evaluate(()=>bare.errors),[]);
  await page.evaluate(()=>bare.worker.postMessage({type:'start'}));
  await new Promise(r=>setTimeout(r,3000));const started=await page.evaluate(()=>performance.timeOrigin+performance.now());await new Promise(r=>setTimeout(r,20000));
  const result=await page.evaluate(()=>{const end=performance.timeOrigin+performance.now();bare.worker.postMessage({type:'stop'});const {worker,port,...report}=bare;worker.terminate();port?.close();return{end,...report};});
  await fs.writeFile(path.join(root,`authority-${variant}.json`),JSON.stringify({scope:'Same production authority Worker / frozen source / roster, no gameplay rendering, no socket/relay/real guest. Local MessagePort sink immediately releases private publication only; not remote network ACK.',variant,started,...result},null,2));assert.deepEqual(result.errors,[]);assert.ok(result.rows.length>10);console.log(variant,'complete',result.rows.length,'windows');await page.close();
 }
} finally {await browser?.close();await server?.close();}
