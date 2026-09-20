// Headless browser compatibility check for the guarded server PMD adapter.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { WebSocketServer } from 'ws';
import { LanBroadcastCompression } from '../server/LanBroadcastCompression.mjs';
import { LanDeltaSender, lanDeltaTarget } from '../server/LanDeltaTransport.mjs';
import { lanPerMessageDeflate } from '../server/lan-websocket.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source='import {LanDeltaReceiver} from "./src/network/LanBinaryDelta.mjs"; window.LanDeltaReceiver=LanDeltaReceiver;';
const script=(await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'})).outputFiles[0].text;
const out=process.argv[3]||'artifacts/relay-fanout-20260920/browser.json',dir=process.argv[2]||'artifacts/network-latency-phase5-20260920/frames22';
const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
const frames=await Promise.all(manifest.rows.slice(0,12).map(r=>fs.readFile(path.join(dir,r.name))));
const server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Isolated relay wire check</title>');});
const wss=new WebSocketServer({server,perMessageDeflate:lanPerMessageDeflate()}),sharing=new LanBroadcastCompression(),peers=[];
wss.on('connection',p=>{peers.push(p);assert.equal(sharing.attach(p),true);});
server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.addScriptTag({content:script});
 await page.evaluate(async url=>{
  window.rows=[];window.clients=[];
  for(let i=0;i<3;i++){
   const ws=new WebSocket(url),receiver=new LanDeltaReceiver({motionReference:true});ws.binaryType='arraybuffer';clients.push(ws);let chain=Promise.resolve();
   ws.onmessage=event=>{chain=chain.then(async()=>{const bytes=receiver.decode(event.data),digest=await crypto.subtle.digest('SHA-256',bytes);rows.push({peer:i,bytes:bytes.length,sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')});});};
   await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  }
 },'ws://127.0.0.1:'+server.address().port);
 const senders=peers.map(()=>new LanDeltaSender({ordered:true,motionReference:true}));
 for(let i=0;i<frames.length;i++){
  const bytes=frames[i],seq=JSON.parse(bytes.subarray(8,8+bytes.readUInt32LE(4))).seq,target=lanDeltaTarget(bytes,seq);
  for(let j=0;j<peers.length;j++){const choice=senders[j].prepare(target);sharing.share(choice.packet);peers[j].send(choice.packet);senders[j].commit(choice);}
  await page.waitForFunction(n=>rows.length===n,(i+1)*3,{timeout:5000});
 }
 const observed=await page.evaluate(()=>rows);
 for(let i=0;i<frames.length;i++)for(const row of observed.slice(i*3,i*3+3)){assert.equal(row.bytes,frames[i].length);assert.equal(row.sha256,createHash('sha256').update(frames[i]).digest('hex'));}
 assert.deepEqual(errors,[]);assert.equal(sharing.stats().jobs,12);assert.equal(sharing.stats().shared,24);
 const result={scope:'Native headless browser WebSocket PMD + production LanDeltaReceiver, 3 guests ×12 exact complete recorded states; no game simulation/rendering or WAN',browser:await browser.version(),exactDeliveries:observed.length,compression:sharing.stats(),errors};
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();for(const p of peers)p.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));}
