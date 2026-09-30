// Optional mode of check-multiteam-worker: the REAL host init/start/step/publish path.
// Manual one-tick wall-clock drive only; not a real-time scheduler/network/FPS benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const args=process.argv.slice(2), arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const out=path.resolve(arg('--out','artifacts/lan-fire-query-pair'));
const baseline=arg('--baseline'), candidate=arg('--candidate');
assert.ok(baseline && candidate,'Explicit frozen before/after source graphs are required');
const count=Number(arg('--count','120')), warm=Number(arg('--warm','150')), steps=Number(arg('--steps','180'));
const hull=arg('--hull','dominator'), enemyHull=arg('--enemy-hull',hull), audit=args.includes('--fire-query-audit');
assert.ok(Number.isInteger(count)&&count>=2&&count<=200&&count%2===0);
assert.ok(Number.isInteger(warm)&&warm>=0&&warm<=600&&Number.isInteger(steps)&&steps>0&&steps<=1800);
const hash=code=>createHash('sha256').update(code).digest('hex');
fs.mkdirSync(out,{recursive:true});
const entry='src/network/host.worker.ts', moduleHashes={};
function once(code,from,to){assert.equal(code.split(from).length,2,'Unique anchor: '+from);return code.replace(from,to);}
for(const [arm,file] of [['before',baseline],['after',candidate]]) {
 const rows=JSON.parse(fs.readFileSync(file,'utf8')).files, graph=new Map(rows.map(row=>[row.file,row]));
 for(const row of rows)assert.equal(hash(row.code),row.sha256,row.file);
 moduleHashes[arm]={};
 await build({entryPoints:{'host.worker':entry,decoder:'src/network/BinarySnapshot.mjs'},outdir:path.join(out,arm),bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',
  define:{__LAN_BUILD_ID__:'"lan-fire-query-check"','import.meta.env':JSON.stringify({BASE_URL:'/',DEV:false})},logLevel:'warning',
  plugins:[{name:'frozen-host-check',setup(b){b.onLoad({filter:/\.[cm]?[jt]sx?$|\.json$/},info=>{
   const key=path.relative(process.cwd(),info.path).replaceAll('\\','/');
   if(!key.startsWith('src/')&&!key.startsWith('desktop/'))return;
   assert.ok(!key.includes('/campaign/'),'No campaign in combat benchmark');
   const row=graph.get(key);if(key.startsWith('src/'))assert.ok(row,'Missing frozen module '+key);
   let code=row?.code??fs.readFileSync(info.path,'utf8');moduleHashes[arm][key]=hash(code);
   if(audit&&key==='src/engine/ai/FireControlQueryBatch.ts') {
    code='globalThis.__fireQueries={registrations:0,rosters:0,maxRoster:0,rejected:0,batches:0,targetHits:0};\n'+code;
    code=once(code,'workerOwnedEngines.add(engine);','globalThis.__fireQueries.registrations++; workerOwnedEngines.add(engine);');
    code=once(code,'return new FireControlQueryRoster(ships, true);','{globalThis.__fireQueries.rosters++;globalThis.__fireQueries.maxRoster=Math.max(globalThis.__fireQueries.maxRoster,ships.length);return new FireControlQueryRoster(ships,true);}');
    code=once(code,'if (!hasOwnedFireControlReadHooks(other)) return;','if (!hasOwnedFireControlReadHooks(other)) {globalThis.__fireQueries.rejected++;return;}');
    code=once(code,'return new FireControlQueryBatch(ship, ships);','globalThis.__fireQueries.batches++;return new FireControlQueryBatch(ship,ships);');
    code=once(code,'if (cached !== undefined) return cached;','if (cached !== undefined) {globalThis.__fireQueries.targetHits++;return cached;}');
   }
   if(key===entry) {
    code=once(code,'timer = setInterval(() => { void step(); }, 4);','/* Test driver supplies one completed tick; production timer is otherwise unchanged. */');
    const auditPath=path.resolve('scripts/lib/real-worker-audit.mts').replaceAll('\\','/');
    code+=`\nimport {workerAudit} from ${JSON.stringify(auditPath)};
const productionHandler=self.onmessage;
self.onmessage=async event=>{
 const m=event.data;
 if(m.type!=='benchmark-step'&&m.type!=='benchmark-audit'){productionHandler!.call(self,event);return;}
 try{
  if(m.type==='benchmark-audit'){
   send({type:'benchmark-audit',...workerAudit({engine:engine!,tick} as any),rng:[...engine!.random.checkpointWitness(),...engine!.visualRandom.checkpointWitness()],queries:globalThis.__fireQueries?{...globalThis.__fireQueries}:null,
    roster:{capitals:engine!.capitalShips.length,units:engine!.ships.length,storedReinforcements:engine!.reinforcements.length,deployed:engine!.deployment.snapshot().rows.filter(r=>r.status==='deployed').length,reserve:engine!.deployment.snapshot().rows.filter(r=>r.status==='reserve').length}});return;
  }
  const prior=tick;
  accumulator=0;last=performance.now()-1000/60-.01;
  const at=performance.now();await step();const stepMs=performance.now()-at;
  if(tick!==prior+1||!running)throw Error('Expected exactly one active authority tick');
  send({type:'benchmark-step',tick,simulationMs:lastStepMs,stepMs,rng:[...engine!.random.checkpointWitness(),...engine!.visualRandom.checkpointWitness()],ai:diagnostics().multicore.mode});
 }catch(error){send({type:'error',message:String(error)});}
};`;
   }
   return {contents:code,loader:info.path.endsWith('.json')?'json':/\.m?ts$/.test(info.path)?'ts':'js'};
  });}}]});
}
const differences=Object.keys(moduleHashes.after).filter(key=>moduleHashes.before[key]!==moduleHashes.after[key]);
assert.deepEqual(differences,[entry],'Only intended production module may differ');
fs.writeFileSync(path.join(out,'module-hashes.json'),JSON.stringify(moduleHashes,null,2));
const server=http.createServer((req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Headless LAN authority check</title>');return;}
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const file=path.resolve(out,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(out+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','text/javascript');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=createRequire(import.meta.url)('playwright');let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:arg('--browser','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')});
 const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async({count,hull,enemyHull,warm,steps,audit})=>{
  const arms=['before','after'], worlds={}, samples={before:[],after:[]}, checkpoints=[];
  const match={id:'fire-query-pair',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',name:'host',seat:0,team:0,hull,design:null}],
   options:{aiHulls:[Array(count/2-1).fill(hull),Array(count/2).fill(enemyHull),[],[],[]],assignment:'teams',battleSize:3200,initialDeploymentLimit:1600}};
  const fail=message=>{throw Error(message);};
  const equal=(a,b,label)=>{
   if(Object.is(a,b))return;
   if(typeof a!==typeof b||a===null||b===null||typeof a!=='object')fail('Mismatch: '+label);
   if(a instanceof ArrayBuffer||b instanceof ArrayBuffer){
    if(!(a instanceof ArrayBuffer&&b instanceof ArrayBuffer))fail('Buffer type: '+label);
    return equal(new Uint8Array(a),new Uint8Array(b),label);
   }
   if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){
    if(!(ArrayBuffer.isView(a)&&ArrayBuffer.isView(b))||a.constructor.name!==b.constructor.name||a.byteLength!==b.byteLength)fail('View type: '+label);
    const av=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),bv=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
    for(let i=0;i<av.length;i++)if(av[i]!==bv[i])fail('Buffer value: '+label+'/'+i);return;
   }
   if(Array.isArray(a)!==Array.isArray(b)||(Array.isArray(a)&&a.length!==b.length))fail('Array shape: '+label);
   const ak=Object.keys(a),bk=Object.keys(b);
   if(ak.length!==bk.length)fail('Key count: '+label);
   for(const k of ak){if(!Object.hasOwn(b,k))fail('Missing key: '+label+'/'+k);equal(a[k],b[k],label+'/'+k);}
  };
  const normalize=frame=>{for(const key of ['simulationMs','captureMs','encodeMs','realtimeRatio','combatRate'])delete frame[key];return frame;};
  let compared=0, init;
  try {
   for(const arm of arms){
    const {decodeBinaryFrame}=await import('/'+arm+'/decoder.js');
    const worker=new Worker('/'+arm+'/host.worker.js',{type:'module'});
    const w=worlds[arm]={worker,frame:null,decodeMs:0,pending:null};
    const reject=error=>{w.error=String(error);w.pending?.reject(Error(w.error));};
    worker.onerror=e=>reject(e.message);
    worker.onmessage=({data:m})=>{
     if(m.type==='error')return reject(m.message);
     if(m.type==='snapshot'){
      try{const at=performance.now();w.frame=decodeBinaryFrame(m.binary);w.decodeMs=performance.now()-at;
       worker.postMessage({type:'snapshot-consumed',tick:m.tick});}catch(e){reject(e);}return;
     }
     if(m.type===w.pending?.type){const p=w.pending;w.pending=null;clearTimeout(p.timer);p.resolve({data:m,roundTripMs:performance.now()-p.at});}
    };
    w.call=(message,type=message.type)=>new Promise((resolve,reject)=>{
     if(w.error)return reject(Error(w.error));if(w.pending)return reject(Error('Overlapping test request'));
     const timer=setTimeout(()=>reject(Error('Worker request timed out: '+type)),60000);
     w.pending={type,resolve,reject,timer,at:performance.now()};worker.postMessage(message);
    });
    await w.call({type:'init',match,binarySnapshots:true,hidden:false},'ready');worker.postMessage({type:'start'});
   }
   const compareFrame=label=>{equal(normalize(worlds.before.frame),normalize(worlds.after.frame),label);compared++;};
   const auditPair=async label=>{
    const rows={};for(const arm of arms)rows[arm]=(await worlds[arm].call({type:'benchmark-audit'})).data;
    const {queries:_b,...b}=rows.before,{queries:_a,...a}=rows.after;equal(b,a,label+'/authority+hidden+rng');return rows;
   };
   compareFrame('init');init=await auditPair('init');
   for(let tick=1;tick<=warm+steps;tick++){
    for(const arm of tick%2?arms.toReversed():arms){
     const w=worlds[arm],r=await w.call({type:'benchmark-step'});w.latest=r.data;
     if(w.frame.tick!==tick||r.data.tick!==tick)fail('Missing publication at tick '+tick);
     if(r.data.ai!=='serial')fail('Default LAN unexpectedly enabled AI owners');
     if(tick>warm)samples[arm].push({tick,simulationMs:r.data.simulationMs,stepMs:r.data.stepMs,roundTripMs:r.roundTripMs,decodeMs:w.decodeMs,deliveredMs:r.roundTripMs});
    }
    equal(worlds.before.latest.rng,worlds.after.latest.rng,tick+'/rng');compareFrame(tick+'/display+audio+ack');
    if(tick%30===0||tick===warm+steps){checkpoints.push({tick,...await auditPair(String(tick))});}
   }
   let reinit;
   if(audit){
    for(const arm of arms){const w=worlds[arm];w.worker.postMessage({type:'stop'});await w.call({type:'init',match,binarySnapshots:true,hidden:false},'ready');w.worker.postMessage({type:'start'});await w.call({type:'benchmark-step'});}
    compareFrame('reinit/1');reinit=await auditPair('reinit/1');
   }
   // Full authority snapshots were compared above; avoid writing their multi-megabyte bodies.
   const compact=row=>Object.fromEntries(arms.map(arm=>[arm,{queries:row[arm].queries,roster:row[arm].roster}]));
   return {match,coi:crossOriginIsolated,hardwareConcurrency:navigator.hardwareConcurrency,warm,steps,audit,compared,samples,init:compact(init),checkpoints:checkpoints.map(c=>({tick:c.tick,...compact(c)})),reinit:reinit&&compact(reinit)};
  }finally{for(const w of Object.values(worlds)){if(w.pending)clearTimeout(w.pending.timer);w.worker.terminate();}}
 },{count,hull,enemyHull,warm,steps,audit});
 assert.deepEqual(errors,[]);assert.equal(result.init.after.roster.deployed,count,'Fixture must deploy every requested capital without bypassing DP');assert.equal(result.init.after.roster.reserve,0);
 if(audit){
  const q=result.checkpoints.at(-1).after.queries;
  assert.equal(result.init.before.queries.registrations,0);assert.equal(result.init.after.queries.registrations,1);assert.equal(result.reinit.after.queries.registrations,2);assert.ok(result.reinit.after.queries.rosters>q.rosters,'New world must enter the owned domain again');
  assert.ok(q.rosters>0&&q.maxRoster>=100,'Owned LAN domain was not reached');
  if(args.includes('--expect-fallback')){assert.equal(q.batches,0);assert.ok(q.rejected>0);}else{assert.ok(q.batches>0&&q.targetHits>0);}
 }
 const stats=values=>{const sorted=values.toSorted((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:sorted[Math.ceil(.95*sorted.length)-1],max:sorted.at(-1)};};
 const summary=Object.fromEntries(['before','after'].map(arm=>[arm,Object.fromEntries(['simulationMs','stepMs','roundTripMs','decodeMs'].map(key=>[key,stats(result.samples[arm].map(r=>r[key]))]))]));
 const report={scope:'Real production LAN host Worker; deterministic one-tick driver, display snapshot consumption and binary decode. No sockets, relay, guest rendering, timer cadence or input-event fixtures. Round trip already includes decode; do not add it twice. Five wall-time telemetry fields excluded from packet comparison, no gameplay fields excluded. Full authority+hidden+RNG checked between timed calls. Query counter runs are NOT performance results.',browser:browser.version(),differences,productionModules:Object.keys(moduleHashes.after).length,errors,summary,...result};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,summary,compared:result.compared,checkpoints:result.checkpoints.map(c=>c.tick),init:result.init,reinit:result.reinit,audit},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
