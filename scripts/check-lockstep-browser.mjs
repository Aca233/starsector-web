import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH??'playwright');
const assets=await fs.realpath('public'),base=path.resolve('artifacts/lockstep-20260920');
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Lockstep isolate preflight</title>');return;}
 const file=url.pathname==='/worker.mjs'?path.join(base,'replay-browser.mjs'):await fs.realpath(path.resolve(assets,decodeURIComponent(url.pathname).replace(/^\//,'')));
 if(file!==path.join(base,'replay-browser.mjs')&&!file.startsWith(assets+path.sep))throw Error('Outside assets');
 res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
 const reports=[];
 for(const [name,batch] of [['browser-a',1],['browser-b',13]]){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const out=path.join(base,name);await fs.mkdir(out,{recursive:true});
  await page.exposeFunction('saveSample',async(tick,bytes)=>fs.writeFile(path.join(out,tick+'.bin'),Buffer.from(bytes)));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(batch=>new Promise((resolve,reject)=>{
   const worker=new Worker('/worker.mjs',{type:'module'}),samples=[];
   const timer=setTimeout(()=>{worker.terminate();reject(Error('Replica timed out'));},120000);
   worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
   worker.onmessage=e=>{const m=e.data;
    if(m.type==='sample')samples.push(window.saveSample(m.tick,Array.from(m.bytes)));
    if(m.type==='error'){clearTimeout(timer);worker.terminate();reject(Error(m.message));}
    if(m.type==='done'){clearTimeout(timer);worker.terminate();Promise.all(samples).then(()=>resolve(m),reject);}
   };worker.postMessage({batch});
  }),batch);
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({...report,browser:browser.version()},null,2));reports.push(report);await context.close();
 }
 assert.deepEqual(reports[0].checkpoints,reports[1].checkpoints,'Different browser scheduling must not change results');
 const node=JSON.parse(await fs.readFile(path.join(base,'node-a/results.json'),'utf8'));
 const firstMismatch=reports[0].checkpoints.find((row,i)=>row.sha256!==node.checkpoints[i]?.sha256);
 const gate={passed:!firstMismatch,sameBrowserSchedulingPassed:true,firstDifferentCheckpoint:firstMismatch?.tick??null,browser:browser.version(),node:node.node,replicas:2,ticks:reports[0].ticks,checkpoints:reports[0].checkpoints.length,scope:'Headless Worker replay only; not a playable network room or full internal-state proof.'};
 await fs.writeFile(path.join(base,'browser-gate.json'),JSON.stringify(gate,null,2));console.log(JSON.stringify(gate,null,2));
 assert.ok(!firstMismatch,'Node/browser differ at sampled tick '+firstMismatch?.tick+'; do not enable lockstep.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
