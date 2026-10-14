import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=process.cwd(),out=path.resolve(root,'artifacts/rust-combat-core-20261008/verification-scene-prelude');
fs.mkdirSync(out,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const native=fs.readdirSync(path.resolve(root,'native/combat-core/src')).filter(f=>f.endsWith('.rs')).map(f=>'native/combat-core/src/'+f);
const fixtures=['scripts/lib/rust-core-ai-resident-fixture.rs','scripts/lib/rust-core-scene-prelude-fixture.rs','scripts/lib/rust-core-scene-prelude-harness.rs','scripts/lib/rust-core-ai-resident-observation.rs'];
const sourceFiles=[...native,...fixtures,'scripts/lib/rust-core-scene-prelude-check.ts','scripts/lib/rust-core-ai-resident-fixture.ts',
  'src/engine/runtime/rust/RustScenePreludeProtocol.ts','src/engine/simulation/CombatEngine.ts','src/engine/simulation/systems/CombatVisibility.ts','src/engine/simulation/systems/ElectronicWarfareSystem.ts','src/engine/simulation/Ship.ts'];
const sources=Object.fromEntries(sourceFiles.map(file=>[file,hash(file)])),absolute=file=>path.resolve(root,file).replaceAll('\\','/');
let joint=fs.readFileSync(path.resolve(root,'native/combat-core/src/lib.rs'),'utf8'),installed=new Set();
joint=joint.replace(/^mod (\w+);$/gm,(_,name)=>{installed.add(name);
  if(name==='state')return `mod state { include!(${JSON.stringify(absolute('native/combat-core/src/state.rs'))}); include!(${JSON.stringify(absolute(fixtures[0]))}); include!(${JSON.stringify(absolute(fixtures[1]))}); }`;
  if(name==='ai_resident')return `mod ai_resident {\n${fs.readFileSync(path.resolve(root,'native/combat-core/src/ai_resident.rs'),'utf8')}\ninclude!(${JSON.stringify(absolute(fixtures[3]))});\n}`;
  return `#[path=${JSON.stringify(absolute('native/combat-core/src/'+name+'.rs'))}] mod ${name};`;
});
for(const name of ['scene_prelude','flight_admission','flight_allocator'])if(!installed.has(name))joint+=`\n#[path=${JSON.stringify(absolute('native/combat-core/src/'+name+'.rs'))}] mod ${name};`;
joint+='\n'+fs.readFileSync(path.resolve(root,fixtures[2]),'utf8');fs.writeFileSync(path.join(out,'joint.rs'),joint);
const compiler='C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe',sysroot=path.resolve(root,'artifacts/rust-combat-core-20261008/toolchain/sysroot');
const host=spawnSync(compiler,['--print','sysroot'],{encoding:'utf8',windowsHide:true}).stdout.trim(),wasmPath=path.join(out,'scene-prelude.wasm');
const compiled=spawnSync(compiler,['--edition=2021','--crate-type=cdylib','--target=wasm32-unknown-unknown','--sysroot',sysroot,'-C','opt-level=2',
  '-C',`linker=${host.replaceAll('\\','/')}/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe`,'-A','dead_code',path.join(out,'joint.rs'),'-o',wasmPath],{encoding:'utf8',windowsHide:true});
fs.writeFileSync(path.join(out,'compile.log'),compiled.stderr||compiled.stdout||'');if(compiled.status)throw Error(compiled.stderr||compiled.stdout);
for(const[file,digest]of Object.entries(sources))if(hash(file)!==digest)throw Error('source changed during build: '+file);
fs.writeFileSync(path.join(out,'build-source.json'),JSON.stringify(sources,null,2)+'\n');
if(process.argv.includes('--build-only')){console.log(JSON.stringify({built:true,bytes:fs.statSync(wasmPath).size,sha256:hash(wasmPath)}));process.exit(0);}
const actualEngine=fs.readFileSync(path.resolve(root,'src/engine/simulation/CombatEngine.ts'),'utf8');
const shared=actualEngine.match(/    for \(const root of this\.capitalShips\) for \(const parent of root\.assemblyShips\) \{[\s\S]+?\n    \}\r?\n    fireBudget =/);
const vital=actualEngine.match(/        const vital = root\.assemblyShips\.slice\(1\)\.filter\([^\r\n]+\);\r?\n        if \(([^\r\n]+)\) \{/);
const gate=actualEngine.match(/      if \((!root\.isDead && root\.isStation && root\.childModules\.length)\) \{/);
if(!shared||!vital||!gate)throw Error('Actual CombatEngine source stage changed; re-audit extraction');
const sourceStage=`export function actualSharedFlux(capital){${shared[0].replace(/\r?\n    fireBudget =$/,'').replace('this.capitalShips','capital')}}\nexport function actualDoomed(root){if(${gate[1]}){${vital[0].split(/\r?\n/)[0]} return !!(${vital[1]});}return false;}`;
fs.writeFileSync(path.join(out,'actual-source-stages.mjs'),sourceStage);
const wasm=fs.readFileSync(wasmPath),entry=absolute('scripts/lib/rust-core-scene-prelude-check.ts'),define={'import.meta.env':JSON.stringify({BASE_URL:'./',DEV:false,PROD:true,VITE_COMBAT_NUMERIC_DECISION_CORE:'true'})};
const plugins=[{name:'actual-source',setup(b){
  b.onResolve({filter:/^rust-actual-scene-prelude-stages$/},()=>({path:'actual-source',namespace:'actual-source'}));
  b.onLoad({filter:/.*/,namespace:'actual-source'},()=>({contents:sourceStage,loader:'js'}));
  b.onResolve({filter:/\?raw$/},a=>({path:path.resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));
  b.onLoad({filter:/.*/,namespace:'raw'},a=>({contents:fs.readFileSync(a.path,'utf8'),loader:'text'}));
}}];
const nodeFile=path.join(out,'node-check.mjs');await build({entryPoints:[entry],outfile:nodeFile,bundle:true,platform:'neutral',format:'esm',target:'es2023',define,plugins});
const{checkRustScenePrelude}=await import(pathToFileURL(nodeFile).href),node=await checkRustScenePrelude(wasm);
const worker=await build({stdin:{contents:`import{checkRustScenePrelude}from ${JSON.stringify(entry)};self.onmessage=async()=>{try{self.postMessage({result:await checkRustScenePrelude(await(await fetch('/core.wasm')).arrayBuffer()),windowAbsent:typeof window==='undefined'});}catch(e){self.postMessage({error:String(e),stack:e?.stack});}};`,resolveDir:root,sourcefile:'scene-prelude-worker.ts',loader:'ts'},bundle:true,platform:'browser',format:'esm',target:'es2023',write:false,define,plugins});
const server=http.createServer((req,res)=>{if(req.url==='/core.wasm'){res.setHeader('Content-Type','application/wasm');res.end(wasm);}else if(req.url==='/worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(worker.outputFiles[0].contents);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Scene prelude differential</title>');}});let browser;
try{await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:[root,'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const dedicated=await page.evaluate(()=>new Promise((ok,no)=>{const w=new Worker('/worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();no(Error('Worker timeout'));},45000);w.onerror=e=>{clearTimeout(timer);w.terminate();no(Error(e.message));};w.onmessage=e=>{clearTimeout(timer);w.terminate();ok(e.data);};w.postMessage({run:true});}));
  if(dedicated.error||!dedicated.result?.passed||!dedicated.windowAbsent)throw Error(JSON.stringify(dedicated));
  for(const[file,digest]of Object.entries(sources))if(hash(file)!==digest)throw Error('source changed during verification: '+file);
  const result={passed:true,node,dedicatedWorker:dedicated,sources,wasm:{bytes:wasm.length,sha256:createHash('sha256').update(wasm).digest('hex')},visibleWindows:false,productionIntegrated:false,fullBattleReady:false};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
