import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

const root=process.cwd(),out=path.resolve(root,'artifacts/rust-combat-core-20261008/verification-defense-ai');
const wasm=fs.readFileSync(path.join(out,'defense-ai.wasm'));
const entry=path.resolve(root,'scripts/lib/rust-core-defense-ai-check.ts'),nodeFile=path.join(out,'node-check.mjs');
const define={'import.meta.env':JSON.stringify({BASE_URL:'./',DEV:false,PROD:true})};
const rawPlugin={name:'raw-source',setup(builder){builder.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-source'}));builder.onLoad({filter:/.*/,namespace:'raw-source'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));}};
await build({entryPoints:[entry],outfile:nodeFile,bundle:true,platform:'neutral',format:'esm',target:'es2023',define,plugins:[rawPlugin]});
const {checkRustDefenseAI}=await import(pathToFileURL(nodeFile).href);
const node=await checkRustDefenseAI(wasm);
const worker=await build({stdin:{contents:`import {checkRustDefenseAI} from ${JSON.stringify(entry.replaceAll('\\','/'))};self.onmessage=async()=>{try{const source=await(await fetch('/core.wasm')).arrayBuffer();self.postMessage({result:await checkRustDefenseAI(source),windowAbsent:typeof window==='undefined'});}catch(e){self.postMessage({error:String(e),stack:e?.stack});}};`,resolveDir:root,sourcefile:'defense-ai-worker.ts',loader:'ts'},bundle:true,platform:'browser',format:'esm',target:'es2023',write:false,define,plugins:[rawPlugin]});
const server=http.createServer((req,res)=>{if(req.url==='/core.wasm'){res.setHeader('Content-Type','application/wasm');res.end(wasm);}else if(req.url==='/worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(worker.outputFiles[0].contents);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated defense AI verification</title>');}});
let browser;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:[root,'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dedicated=await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('/worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(Error('Worker timeout'));},45000);w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message));};w.onmessage=e=>{clearTimeout(timer);w.terminate();resolve(e.data);};w.postMessage({run:true});}));
  if(dedicated.error||!dedicated.result?.passed||!dedicated.windowAbsent)throw Error(JSON.stringify(dedicated));
  const hashes=Object.fromEntries(['native/combat-core/src/defense_ai.rs','scripts/lib/rust-core-defense-ai-harness.rs','scripts/lib/rust-core-defense-ai-check.ts','scripts/check-rust-defense-ai-module.mjs',
    'src/engine/ai/ShipDefenseController.ts','src/engine/ai/batch/AIThreatSolver.ts','src/engine/ai/ShieldThreatSector.ts','src/engine/ai/CapitalShipAI.ts','src/engine/simulation/systems/weapon/SourceMissileLifecycle.ts']
    .map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
  const result={passed:true,node,dedicatedWorker:dedicated,hashes,wasm:{bytes:wasm.length,sha256:createHash('sha256').update(wasm).digest('hex')},visibleWindows:false,productionIntegrated:false,fullBattleReady:false};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result,(k,v)=>k==='geometryLog'?{recordedFields:v.length}:v,2)+'\n');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
