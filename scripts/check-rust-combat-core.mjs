import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// One concentrated domain check plus a fresh headless dedicated Worker. Never
// attaches to the user's browser, changes app settings or enables a battle backend.
const lifecycle = process.argv.includes('--lifecycle');
const shield = process.argv.includes('--shield');
const damage = process.argv.includes('--damage');
const engines = process.argv.includes('--engines');
const weapons = process.argv.includes('--weapons');
const projectiles=process.argv.includes('--projectiles');
const fireQuery=process.argv.includes('--fire-query');
const readiness=process.argv.includes('--readiness-owner');
const missiles=process.argv.includes('--missile-owner');
const effects=process.argv.includes('--effects-owner');
const systemOwner=process.argv.includes('--system-owner');
const gravityRuntime=process.argv.includes('--gravity-runtime');
const auxRuntime=process.argv.includes('--aux-runtime');
const worldOwner=process.argv.includes('--world-owner');
const root = process.cwd(), output = path.resolve(root, `artifacts/rust-combat-core-20261008/${auxRuntime?'verification-p2-aux-runtime':gravityRuntime?'verification-p2-gravity-runtime':worldOwner?'verification-p2-world-owner':systemOwner?'verification-p2-system-owner':effects?'verification-p2-effects-owner':missiles?'verification-p2-missile-owner':readiness?'verification-p2-readiness-owner':fireQuery?'verification-p2-fire-query':projectiles?'verification-p2-projectiles':weapons?'verification-p1f':engines?'verification-p1e':damage?'verification-p1d':shield ? 'verification-p1c' : lifecycle ? 'verification-p1b' : 'verification'}`);
const wasmPath = path.resolve(process.argv.slice(2).find(value=>!value.startsWith('--')) ?? 'artifacts/rust-combat-core-20261008/build/wasm32-unknown-unknown/release/foundry_combat_core.wasm');
const wasm = fs.readFileSync(wasmPath), module = await WebAssembly.compile(wasm);
if (WebAssembly.Module.imports(module).length) throw new Error('Foundation unexpectedly imports a host rule solver');
fs.mkdirSync(output, {recursive:true});
const entry = path.resolve(root, `scripts/lib/${auxRuntime?'rust-core-aux-runtime-check':gravityRuntime?'rust-core-gravity-runtime-check':worldOwner?'rust-core-world-owner-check':systemOwner?'rust-core-system-owner-check':effects?'rust-core-effects-owner-check':missiles?'rust-core-missile-owner-check':readiness?'rust-core-readiness-owner-check':fireQuery?'rust-core-fire-query-check':projectiles?'rust-core-projectile-check':weapons?'rust-core-weapon-check':engines?'rust-core-engine-check':damage?'rust-core-damage-check':shield ? 'rust-core-shield-check' : lifecycle ? 'rust-core-lifecycle-check' : 'rust-core-foundation-check'}.ts`);
const nodeOutput = path.join(output, 'node-check.mjs');
const define = {'import.meta.env': JSON.stringify({BASE_URL:'./',DEV:false,PROD:true,...(projectiles||fireQuery||missiles||effects||systemOwner||worldOwner||gravityRuntime||auxRuntime?{VITE_COMBAT_NUMERIC_DECISION_CORE:'true'}:{})})};
const rawPlugin={name:'source-raw',setup(build){
  build.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-text'}));
  build.onLoad({filter:/.*/,namespace:'raw-text'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));
}};
const plugins=[rawPlugin,...(auxRuntime?[{name:'actual-private-stealth-observer',setup(b){b.onLoad({filter:/StealthMinefield\.ts$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport const oracleFields=fields;\n',loader:'ts'}));}}]:[])];
const bundle = await build({entryPoints:[entry],outfile:nodeOutput,bundle:true,platform:'neutral',format:'esm',target:'es2023',metafile:true,define,plugins});
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceFiles=new Set([...Object.keys(bundle.metafile.inputs).filter(file=>!file.startsWith('<')).map(file=>file.startsWith('raw-text:')?file.slice(9):file),
  ...fs.readdirSync(path.join(root,'native/combat-core/src')).filter(file=>file.endsWith('.rs')).map(file=>'native/combat-core/src/'+file),
  'native/combat-core/Cargo.toml','native/combat-core/Cargo.lock','scripts/check-rust-combat-core.mjs']);
const sourceHashes=Object.fromEntries([...sourceFiles].sort().map(file=>[file,hash(fs.readFileSync(path.resolve(root,file)))]));
const buildManifest=JSON.parse(fs.readFileSync(path.resolve(root,'artifacts/rust-combat-core-20261008/build/build-manifest.json'),'utf8').replace(/^\uFEFF/,''));
if(buildManifest.sha256!==hash(wasm))throw Error('Wasm differs from recorded build');
for(const [file,expected] of Object.entries(buildManifest.sources)){
  if(sourceHashes[file]!==expected)throw Error('Rust source differs from built Wasm: '+file);
}
const {checkRustCore} = await import(pathToFileURL(nodeOutput).href);
const node = await checkRustCore(wasm, !lifecycle && !shield && !damage && !engines && !weapons&&!projectiles&&!fireQuery&&!readiness&&!missiles&&!effects&&!systemOwner&&!worldOwner&&!gravityRuntime&&!auxRuntime);
const worker = await build({stdin:{contents:`import {checkRustCore} from ${JSON.stringify(entry.replaceAll('\\','/'))};
self.onmessage=async()=>{try{if(typeof window!=='undefined')throw Error('Not a dedicated Worker');
const response=await fetch('/core.wasm');if(!response.ok)throw Error('Wasm response failed');
const result=await checkRustCore(await response.arrayBuffer(),false);self.postMessage({result,windowAbsent:true});
}catch(error){self.postMessage({error:String(error),stack:error?.stack});}};`,resolveDir:root,sourcefile:'rust-core-worker-check.ts',loader:'ts'},
  bundle:true,platform:'browser',format:'esm',target:'es2023',write:false,define,plugins});
const workerBytes = worker.outputFiles[0].contents;
fs.writeFileSync(path.join(output, 'worker-check.mjs'), workerBytes);
const server = http.createServer((request,response)=>{
  if(request.url==='/core.wasm'){response.setHeader('Content-Type','application/wasm');response.end(wasm);}
  else if(request.url==='/worker.mjs'){response.setHeader('Content-Type','text/javascript');response.end(workerBytes);}
  else {response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Rust core isolated verification</title>');}
});
let browser, browserResult;
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const require=createRequire(import.meta.url);
  const {chromium}=require(require.resolve('playwright',{paths:[root,process.env.PLAYWRIGHT_MODULE_ROOT ??
    'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  browserResult=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const worker=new Worker('/worker.mjs',{type:'module'});
    const timer=setTimeout(()=>{worker.terminate();reject(Error('Rust Worker check timed out'));},45000);
    worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(Error(event.message));};
    worker.onmessage=event=>{clearTimeout(timer);worker.terminate();resolve(event.data);};worker.postMessage({run:true});
  }));
  if(browserResult.error||!browserResult.result?.passed||!browserResult.windowAbsent) throw new Error(JSON.stringify(browserResult));
  for(const [file,expected] of Object.entries(sourceHashes)) {
    if(hash(fs.readFileSync(path.resolve(root,file)))!==expected)throw Error('Source changed during domain verification: '+file);
  }
  const result={passed:true,scope:auxRuntime?'resident-aux-complete-shared-world':gravityRuntime?'resident-gravity-complete-shared-world':worldOwner?'resident-world-real-fire-death-explosion-terrain':systemOwner?'resident-system-hullmod-real-fire-resource-world':effects?'resident-real-fire-special-hit-beam-effects':missiles?'resident-real-fire-guidance-mirv-contact':readiness?'resident-readiness-real-critical-damage-shield-failure':fireQuery?'resident-post-motion-fire-query-real-emission-contact':projectiles?'resident-real-fire-projectile-beam-conventional-contact-rules':weapons?'resident-weapon-prefire-clock-ammo-disable-critical-groups':engines?'resident-engines-motion-component-propagation-critical-damage':damage?'resident-armor-hull-weapon-health-scar-domains':shield ? 'resident-shield-phase-void-recovery-upkeep-domains' : lifecycle ? 'resident-flux-local-clock-generic-lifecycle' : 'resident-identity-rng-motion-foundation',fullBattleReady:false,
    performanceMeasured:false,node,browser:browserResult,wasm:{path:wasmPath,bytes:wasm.length,sha256:hash(wasm),imports:[]},
    sourceHashes,verificationEnvironment:define,visibleWindows:false};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify({passed:true,node,browser:browserResult,wasm:result.wasm},
    (key,value)=>key==='geometryLog'?{recordedFields:value.length}:value,2)+'\n');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

