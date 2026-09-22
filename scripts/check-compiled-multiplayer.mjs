import {startRelayProcessProfile} from "./lib/relay-process-profiler.mjs";
import {startHostWorkerProfile} from "./lib/host-worker-profiler.mjs";
// Compiled app only (current dist by default, or an audited isolated build). No Vite source imports or gameplay transforms.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {createLanServer} from '../server/lan-server.mjs';import {parseNetworkConsole} from '../desktop/network-diagnostic-record.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');const out=path.resolve(process.env.COMPILED_MULTIPLAYER_OUT??'artifacts/network-stream-20260922/phase42/compiled-5');assert.ok(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const manifestPath=process.env.COMPILED_MULTIPLAYER_MANIFEST??'artifacts/local-latest-build.json',manifest=JSON.parse(fs.readFileSync(manifestPath));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),dist=path.resolve(manifest.output??'dist');
const archivedArtifact=manifest.archivedArtifact;
if(archivedArtifact){
 assert.ok(!manifest.frozen&&manifest.outputFiles?.length>0,'Archived run requires a complete compiled byte inventory');
 assert.equal(sha(archivedArtifact.sourceManifest.file),archivedArtifact.sourceManifest.sha256);
 const original=JSON.parse(fs.readFileSync(archivedArtifact.sourceManifest.file));assert.equal(manifest.build,original.build);assert.equal(manifest.indexSha256,original.indexSha256);
 for(const row of archivedArtifact.verifiedHistoricalAssets)assert.equal(sha(row.file),row.sha256,'Historical compiled byte drift');
}
let captured=new Map();
if(manifest.frozen){assert.equal(sha(manifest.frozen.file),manifest.frozen.sha256);const frozen=JSON.parse(fs.readFileSync(manifest.frozen.file));for(const row of frozen.files)assert.equal(crypto.createHash('sha256').update(row.code).digest('hex'),row.sha256);captured=new Map(frozen.files.map(r=>[r.file.replaceAll('\\','/'),r]));}
for(const row of manifest.sources){const saved=row.captured?captured.get(row.file.replaceAll('\\','/')):null;if(row.captured)assert.ok(saved,'Missing captured source');if(!archivedArtifact)assert.equal(saved?.sha256??sha(row.file),row.sha256);}
for(const row of manifest.outputFiles??[])assert.equal(sha(path.join(dist,row.file)),row.sha256,'Compiled asset drift: '+row.file);
const currentSourceDrift=manifest.sources.filter(row=>sha(row.file)!==row.sha256).map(row=>row.file);
const fixtureSeed=process.env.COMPILED_MULTIPLAYER_SEED===undefined?null:Number(process.env.COMPILED_MULTIPLAYER_SEED);assert.ok(fixtureSeed===null||(Number.isSafeInteger(fixtureSeed)&&fixtureSeed>=0&&fixtureSeed<=0xffffffff));
assert.ok(manifest.graphs.worker.some(s=>s.file.replaceAll('\\','/').endsWith('/host.worker.ts')));
const scenario=process.env.COMPILED_MULTIPLAYER_SCENARIO??'fleet-load';assert.ok(['players-only','fleet-load'].includes(scenario));
const aiHulls=scenario==='players-only'?[[],[]]:[Array(8).fill('hammerhead'),Array(9).fill('hammerhead')],expectedShips=5+aiHulls.flat().length;
const inputEvidence=[];
const profileEnabled=process.env.COMPILED_MULTIPLAYER_PROFILE==='true';
const relayProfileEnabled=process.env.COMPILED_MULTIPLAYER_RELAY_PROFILE==='true';
const captureWire=process.env.COMPILED_MULTIPLAYER_CAPTURE_WIRE==='true',wireFrames=[];let wirePeer,wireListener;
const warmupMs=Number(process.env.COMPILED_MULTIPLAYER_WARMUP_MS??0),measureMs=Number(process.env.COMPILED_MULTIPLAYER_MEASURE_MS??10000);
assert.ok(Number.isSafeInteger(warmupMs)&&warmupMs>=0&&warmupMs<=30000);assert.ok(Number.isSafeInteger(measureMs)&&measureMs>=10000&&measureMs<=60000);
assert.equal(sha(path.join(dist,'index.html')),manifest.indexSha256,'Compiled index drift');assert.equal(JSON.parse(fs.readFileSync(path.join(dist,'lan-build.json'))).build,manifest.build,'Compiled build drift');
// Tailwind watches the entire repository, including docs, test scripts and the
// EXCLUDED career tree. Record drift rather than claim all watched inputs match.
// Strict/frozen runs require matching main/Worker sources. Explicit archived
// diagnostics instead verify the sealed compiled inventory and list source drift.
const watchedDrift=(manifest.watchedSources??[]).filter(s=>sha(s.file)!==s.sha256).map(s=>({file:s.file,expected:s.sha256,actual:sha(s.file)}));
fs.writeFileSync(path.join(out,'build-input-audit.json'),JSON.stringify({build:manifest.build,runtimeSources:manifest.sources.length,runtimeSourceDrift:currentSourceDrift,indexSha256:sha(path.join(dist,'index.html')),watchedDrift,scope:archivedArtifact?'Archived accepted compiled bytes verified independently; runtime source drift listed, no current-source equivalence claimed.':manifest.frozen?'Isolated compiled frozen source; current-worktree drift reported separately.':'Existing accepted compiled artifact; runtime modules match current worktree. Changed watch-only inputs may produce different CSS on a future rebuild; no rebuild occurred.'},null,2));
const profileSessions=[],metricSessions=[];let hostProfile,relayProfile;
const stopProfiles=async()=>{
 if(relayProfile){const value=relayProfile;relayProfile=null;const result=await value.stop();if(result){fs.writeFileSync(path.join(out,'relay-process.cpuprofile'),JSON.stringify(result.profile));fs.writeFileSync(path.join(out,'relay-process-metrics.json'),JSON.stringify(result.metrics,null,2));}}
 if(hostProfile){const value=hostProfile;hostProfile=null;const profile=await value.stop();if(profile)fs.writeFileSync(path.join(out,'host.cpuprofile'),JSON.stringify(profile));}
 while(profileSessions.length){const {cdp,seat}=profileSessions.shift();try{const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(out,'viewer-'+seat+'.cpuprofile'),JSON.stringify(profile));}finally{await cdp.detach().catch(()=>{});}}
};
const relay=await createLanServer({host:'127.0.0.1',port:0,dist}),origin='http://127.0.0.1:'+relay.server.address().port;const browsers=[],pages=[],errors=[],samples=[],workerUrls=[];let room,stage='init',report={};
const until=async(fn,label,timeout=60000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out '+label);};
const mark=s=>{stage=s;console.log('[compiled]',s);};const watchdog=setTimeout(()=>{console.error('Compiled multiplayer watchdog expired');void Promise.all(browsers.map(b=>b.close().catch(()=>{}))).finally(()=>process.exit(1));},240000);watchdog.unref();
try{
 for(let seat=0;seat<5;seat++){
  mark('joining '+seat);const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});browsers.push(browser);const page=await browser.newPage({viewport:{width:1280,height:720}});pages.push(page);page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push({seat,error:e.message}));page.on('worker',w=>workerUrls.push({seat,url:w.url()}));page.on('console',m=>{const row=parseNetworkConsole(m.text());if(row){samples.push({seat,...row});if(samples.length>1200)samples.shift();}else if(m.type()==='error'||m.text()==='Compiled fixture: WebGL context lost')errors.push({seat,console:m.text(),wallTimeMs:Date.now()});});
  await page.addInitScript(()=>{window.addEventListener('webglcontextlost',()=>console.warn('Compiled fixture: WebGL context lost'),true);window.compiledWorkerErrors=[];window.compiledTicks=[];const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('error',e=>window.compiledWorkerErrors.push(e.message));this.addEventListener('message',e=>{const m=e.data;if(m?.type==='snapshot'){window.compiledTicks.push(m.tick);if(window.compiledTicks.length>200)window.compiledTicks.shift();}if(['failed','io-unavailable','connect-failed'].includes(m?.type))window.compiledWorkerErrors.push(m);});}};});
  await page.goto(origin+'/?view=lan');await page.getByLabel('玩家名称',{exact:true}).fill('编译玩家'+seat);
  if(seat===0){await page.getByRole('button',{name:'创建房间',exact:true}).click();await until(()=>relay.rooms.size===1,'compiled UI create');room=[...relay.rooms.values()][0];await page.getByRole('button',{name:'房间设置',exact:true}).click();await page.getByLabel('房间人数上限',{exact:true}).selectOption('5');await page.getByLabel('战斗规模',{exact:true}).selectOption('3200');await page.getByRole('dialog').getByRole('button',{name:'返回',exact:true}).click();await until(()=>room.capacity===5&&room.options.battleSize===3200,'UI room settings');}
  else{await page.getByLabel('房间码',{exact:true}).fill(room.code);await page.getByRole('button',{name:'加入房间',exact:true}).click();await until(()=>room.peers.length===seat+1,'compiled UI join');}
 }
 if(fixtureSeed!==null){
  // Test-owned room only, BEFORE match construction and broadcast. This changes
  // initial setup, never an already running engine or network validation.
  let value=room.match;assert.ok(!value);Object.defineProperty(room,'match',{enumerable:true,configurable:true,get(){return value;},set(next){if(next&&next!==value)next.seed=fixtureSeed;value=next;}});
 }
 mark(expectedShips+'-ship '+scenario+' fixture');
 // Fixture setup only: normal validated host command on the OWNED test socket.
 // Does not mutate simulation, client code, physics, clocks, or room validation.
 room.peers[0].ws.emit('message',Buffer.from(JSON.stringify({type:'options',baseRevision:room.options.aiRevision??0,options:{assignment:'teams',battleSize:3200,aiHulls}})),false);
 await until(()=>JSON.stringify(room.options.aiHulls)===JSON.stringify(aiHulls),'validated AI composition');
 for(let seat=0;seat<5;seat++){mark('apply '+seat);const p=pages[seat];await p.getByRole('button',{name:seat===0?'应用配装':'应用并准备',exact:true}).click();}
 await until(()=>room.peers.slice(1).every(p=>p.ready),'compiled ready');mark('start');await pages[0].getByRole('button',{name:'开始战斗',exact:true}).click();await until(()=>room.status==='running'&&room.peers.every(p=>p.loaded)&&room.lastTick>60,'all production replicas loaded',90000);
 if(fixtureSeed!==null)assert.equal(room.match.seed,fixtureSeed);const matchId=room.match.id;assert.notEqual(room.match.authority,'server');assert.equal(room.match.players.length+room.match.options.aiHulls.flat().length,expectedShips);assert.ok(workerUrls.some(w=>w.seat===0&&/host\.worker/.test(w.url)));assert.ok(!workerUrls.some(w=>w.seat>0&&/host\.worker/.test(w.url)));
 mark('real input');for(const p of pages)await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w'})));await new Promise(r=>setTimeout(r,700));for(const p of pages)await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w'})));
 if(scenario==='players-only'){
  mark('five-player scripted flight/fire');
  for(const peer of room.peers){const listener=(data,binary)=>{if(binary)return;let m;try{m=JSON.parse(String(data));}catch{return;}if(m.type==='input'&&m.input?.firing&&peer.seq===m.input.seq){inputEvidence.push({seat:peer.seat,seq:peer.seq,wallTimeMs:Date.now(),keys:m.input.keys,aim:m.input.aim,firing:true});peer.ws.off('message',listener);}};peer.ws.on('message',listener);}
  for(let seat=0;seat<pages.length;seat++)await pages[seat].evaluate(({team})=>{
   const c=[...document.querySelectorAll('canvas')].find(c=>c.width>=640&&c.height>=360);if(!c)throw Error('Combat canvas missing');
   const r=c.getBoundingClientRect(),x=r.left+r.width*.5,y=r.top+r.height*(team===0?.18:.72);
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w'}));
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit1',key:'1'}));
   c.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
   c.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,buttons:1,clientX:x,clientY:y}));
  },{team:room.match.players.find(p=>p.seat===seat).team});
  await until(()=>inputEvidence.length===5,'five accepted held-fire inputs');
 }
 if(warmupMs){mark('pre-measurement warmup');await new Promise(r=>setTimeout(r,warmupMs));assert.equal(room.status,'running');}
 if(profileEnabled){
  mark('start CPU profiles');hostProfile=await startHostWorkerProfile(browsers[0]);
  for(const seat of [0,1]){const cdp=await pages[seat].context().newCDPSession(pages[seat]);profileSessions.push({cdp,seat});await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  for(let seat=0;seat<pages.length;seat++){const cdp=await pages[seat].context().newCDPSession(pages[seat]);metricSessions.push({cdp,seat});await cdp.send('Performance.enable');}
 }
 const readMetrics=()=>Promise.all(metricSessions.map(async({cdp,seat})=>({seat,at:Date.now(),...await cdp.send('Performance.getMetrics')})));
 assert.deepEqual(errors,[],'Browser/graphics errors before measurement');
 if(relayProfileEnabled)relayProfile=await startRelayProcessProfile();
 if(captureWire){
  wirePeer=room.peers.find(p=>p.id===room.hostId);assert.ok(wirePeer);let next=0;
  wireListener=(data,binary)=>{const at=Date.now();if(!binary||at<next||wireFrames.length>=64||data[0]!==83||data[1]!==87||data[2]!==66||data[3]!==49)return;next=at+1000;wireFrames.push({at,bytes:Buffer.from(data)});};
  wirePeer.ws.on('message',wireListener);
 }
 const metricsBefore=await readMetrics();mark('measurement');const before=room.lastTick,measuredAt=Date.now();await new Promise(r=>setTimeout(r,measureMs));
 const measuredUntil=Date.now(),tickAfter=room.lastTick,metricsAfter=await readMetrics();
 if(wireListener){wirePeer.ws.off('message',wireListener);wireListener=null;}
 await stopProfiles();
 if(captureWire){fs.mkdirSync(path.join(out,'wire'));for(let i=0;i<wireFrames.length;i++)fs.writeFileSync(path.join(out,'wire',i+'.bin'),wireFrames[i].bytes);fs.writeFileSync(path.join(out,'wire','index.json'),JSON.stringify(wireFrames.map(({at,bytes},i)=>({file:i+'.bin',at,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})),null,2));}
 for(const {cdp}of metricSessions)await cdp.detach();metricSessions.length=0;
 const measurement={scenario,expectedShips,inputEvidence,profileEnabled,relayProfileEnabled,warmupMs,requestedMs:measureMs,started:measuredAt,ended:measuredUntil,tickBefore:before,tickAfter,elapsedMs:measuredUntil-measuredAt,metricsBefore,metricsAfter,seed:room.match.seed,players:room.match.players,options:room.match.options};
 fs.writeFileSync(path.join(out,'measurement.json'),JSON.stringify(measurement,null,2));fs.writeFileSync(path.join(out,'measured-samples.jsonl'),samples.filter(s=>s.wallTimeMs>=measuredAt&&s.wallTimeMs<=measuredUntil).map(s=>JSON.stringify(s)).join('\n')+'\n');
 const measuredSamples=samples.filter(s=>s.wallTimeMs>=measuredAt&&s.wallTimeMs<=measuredUntil);
 if(typeof manifest.serializerWorker==='boolean'){
  const states=measuredSamples.filter(s=>s.seat===0&&s.hud?.authority?.serializer).map(s=>s.hud.authority.serializer);assert.ok(states.length,'Serializer telemetry must be sampled');
  for(const state of states)assert.equal(state.enabled,manifest.serializerWorker);
  if(manifest.serializerWorker){assert.ok(states.at(-1).completed>0);assert.ok(states.every(s=>s.fallbacks===0));}
 }
 assert.deepEqual(errors,[],'Browser/graphics errors during measurement');
 if(scenario==='players-only'){
  assert.equal(room.match.options.aiHulls.flat().length,0);assert.equal(new Set(inputEvidence.map(e=>e.seat)).size,5);
  for(let seat=0;seat<5;seat++){const rows=measuredSamples.filter(s=>s.seat===seat&&s.hudFresh!==false&&s.hud);assert.ok(rows.length,'Missing seat telemetry');assert.ok(rows.every(s=>s.hud.ships===5),'Pure-five run must contain exactly five ships');}
  assert.ok(measuredSamples.some(s=>s.hud?.projectiles>0),'Held fire must produce actual projectiles');
  for(const p of pages)await p.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w'}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0,buttons:0}));});
 }
 assert.equal(room.status,'running');assert.ok(tickAfter>before+300);assert.ok(room.peers.every(p=>p.loaded));report={build:manifest.build,watchedInputDriftCount:watchedDrift.length,before,after:tickAfter,elapsedMs:measuredUntil-measuredAt,measurement};
 mark('main-thread stall');const trace=[];const observe=setInterval(()=>trace.push({at:Date.now(),seq:room.lastSeq,tick:room.lastTick}),10);let block;try{block=await pages[0].evaluate(()=>{const startedAt=Date.now(),end=performance.now()+800;while(performance.now()<end){}return{startedAt,finishedAt:Date.now()};});}finally{clearInterval(observe);}const middle=trace.filter(r=>r.at>=block.startedAt+200&&r.at<=block.startedAt+650);const progress=middle.at(-1)?.seq-middle[0]?.seq;assert.ok(progress>=5,'worker must still publish during compiled renderer stall');report.stall={block,progress,trace};
 mark('guest reload');const tick=room.lastTick;await pages[4].reload();await until(()=>room.status==='running'&&room.peers.every(p=>p.loaded)&&room.lastTick>tick+60,'same compiled match resume',60000);assert.equal(room.match.id,matchId);report.reconnect={sameMatch:true,before:tick,after:room.lastTick};
 const viewers=[];for(let i=0;i<pages.length;i++){const p=pages[i],view=await p.evaluate(()=>({body:document.body.innerText,canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),workerErrors:window.compiledWorkerErrors,workerTicks:window.compiledTicks,modules:performance.getEntriesByType('resource').map(r=>r.name).filter(s=>s.endsWith('.js'))}));assert.ok(view.canvas.some(c=>c.width>=640&&c.height>=360));assert.deepEqual(view.workerErrors,[]);viewers.push({seat:i,...view});}
 assert.deepEqual(errors,[]);assert.ok(samples.some(s=>s.seat===0&&s.hud?.authority?.io?.sharedCredit===true),'default production shared local credit is active');
 report={...report,scenario,expectedShips,scope:'Compiled frontend, 5 independent headless browsers, '+expectedShips+' ships ('+scenario+'), actual UI create/settings/join/apply/ready/start. Optional fixed initial seed plus validated AI composition; simulation and wire validation unchanged. Same-machine LAN, not remote Steam/n2n. Captured build provenance records whether sources are frozen.',passed:true,viewers,workerUrls,samples,errors};
}catch(e){process.exitCode=1;report={...report,passed:false,stage,error:String(e.stack??e),errors,workerUrls,samples,room:room?{status:room.status,lastTick:room.lastTick,peers:room.peers.map(p=>({ready:p.ready,loaded:p.loaded}))}:null,bodies:await Promise.all(pages.map(p=>p.locator('body').innerText().catch(()=>'<closed>')))};}
finally{if(wireListener){wirePeer.ws.off('message',wireListener);wireListener=null;}try{await stopProfiles();}catch(error){report.profileCleanupError=String(error);process.exitCode=1;}for(const {cdp}of metricSessions)await cdp.detach().catch(()=>{});metricSessions.length=0;await Promise.all(browsers.map(b=>b.close().catch(()=>{})));await relay.close();clearTimeout(watchdog);report.cleanupCompleted=true;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,stage,error:report.error,build:report.build,workerCount:workerUrls.length,cleanupCompleted:true}));}
