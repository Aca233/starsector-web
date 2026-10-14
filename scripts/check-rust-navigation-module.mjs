import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root=process.cwd(),out=path.resolve(root,'artifacts/rust-combat-core-20261008/verification-navigation');
fs.mkdirSync(out,{recursive:true});
const rustc=path.join(process.env.USERPROFILE,'.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe');
const sysroot=path.resolve(root,'artifacts/rust-combat-core-20261008/toolchain/sysroot');
const linker=path.join(process.env.USERPROFILE,'.rustup/toolchains/stable-x86_64-pc-windows-msvc/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe');
const wasmFile=path.join(out,'navigation.wasm');
const compilation=spawnSync(rustc,[path.resolve(root,'scripts/lib/rust-core-navigation-harness.rs'),'--edition=2021','--crate-type=cdylib','--target','wasm32-unknown-unknown','--sysroot',sysroot,'-C',`linker=${linker}`,'-C','opt-level=3','-o',wasmFile],{encoding:'utf8',windowsHide:true});
if(compilation.status!==0)throw Error(compilation.stdout+compilation.stderr);
const wasm=fs.readFileSync(wasmFile),entry=path.resolve(root,'scripts/lib/rust-core-navigation-check.ts'),nodeFile=path.join(out,'node-check.mjs');
const define={'import.meta.env':'{}'};
await build({entryPoints:[entry],outfile:nodeFile,bundle:true,platform:'neutral',format:'esm',target:'es2023',define});
const {checkRustNavigation}=await import(pathToFileURL(nodeFile).href);
const node=await checkRustNavigation(wasm);
const worker=await build({stdin:{contents:`import {checkRustNavigation} from ${JSON.stringify(entry.replaceAll('\\','/'))};self.onmessage=async()=>{try{const source=await(await fetch('/core.wasm')).arrayBuffer();self.postMessage({result:await checkRustNavigation(source),windowAbsent:typeof window==='undefined'});}catch(e){self.postMessage({error:String(e),stack:e?.stack});}};`,resolveDir:root,sourcefile:'navigation-worker.ts',loader:'ts'},bundle:true,platform:'browser',format:'esm',target:'es2023',write:false,define});
const server=http.createServer((req,res)=>{if(req.url==='/core.wasm'){res.setHeader('Content-Type','application/wasm');res.end(wasm);}else if(req.url==='/worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(worker.outputFiles[0].contents);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Resident navigation verification</title>');}});
let browser;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:[root,'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dedicated=await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('/worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(Error('Worker timeout'));},45000);w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message));};w.onmessage=e=>{clearTimeout(timer);w.terminate();resolve(e.data);};w.postMessage({run:true});}));
  if(dedicated.error||!dedicated.result?.passed||!dedicated.windowAbsent)throw Error(JSON.stringify(dedicated));
  const sourceHash=createHash('sha256').update(fs.readFileSync(path.resolve(root,'native/combat-core/src/navigation_ai.rs'))).digest('hex');
  const result={passed:true,node,dedicatedWorker:dedicated,wasmBytes:wasm.length,wasmSha256:createHash('sha256').update(wasm).digest('hex'),sourceSha256:sourceHash,visibleWindows:false,productionIntegrated:false,fullBattleReady:false};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result,(key,value)=>key==='geometryLog'?{recordedFields:value.length}:value,2)+'\n');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
