import {sameTickSkipPlugin} from './lib/same-tick-skip-fixture.mjs';
import {publicationProbePlugin} from './lib/publication-probe.mjs';
import {steadyFixturePlugin,STEADY_START_TICK,STEADY_END_TICK} from './lib/steady-multiplayer-fixture.mjs';
import {createHash} from 'node:crypto';
import {startHostWorkerProfile} from './lib/host-worker-profiler.mjs';
import {hostLoadProbe} from './lib/host-load-probe.mjs';
import { frozenBrowserPlugin } from './lib/frozen-vite-sources.mjs';
// Headless-only acceptance harness. Uses actual LanBattle, host Worker, WebGL,
// LanConnection and desktop helper; no campaign imports or user browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {createLanServer} from '../server/lan-server.mjs';
import {DesktopLanBridge} from '../server/desktop-lan-bridge.mjs';
import {parseNetworkConsole} from '../desktop/network-diagnostic-record.mjs';
import {measuredSamples,recordedStall} from './lib/multiplayer-measurement.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const steady=process.env.MULTIPLAYER_STEADY_FIXTURE==='true';
const commandHeld=process.env.MULTIPLAYER_COMMAND_HELD_FIXTURE==='true';
assert.ok(!commandHeld||steady,'Command-held recovery fixture requires controlled startup');
const styled=process.env.MULTIPLAYER_STYLED==='true';
const compiledCss=process.env.MULTIPLAYER_COMPILED_CSS ? path.resolve(process.env.MULTIPLAYER_COMPILED_CSS) : null;
let compiledCssHref=null;
if(compiledCss){
 assert.ok(styled&&compiledCss.startsWith(path.resolve('dist/assets')+path.sep)&&compiledCss.endsWith('.css'),'Compiled style must be this workspace battle CSS');
 const {createHash}=await import('node:crypto');const build=JSON.parse(await fs.readFile('artifacts/local-latest-build.json','utf8'));
 const cssSources=build.sources.filter(s=>s.file.endsWith('.css'));assert.ok(cssSources.length,'Build must record style sources');
 for(const source of cssSources)assert.equal(createHash('sha256').update(await fs.readFile(source.file)).digest('hex'),source.sha256,'Compiled style source drift: '+source.file);
 assert.ok((await fs.readFile('dist/index.html','utf8')).includes(path.basename(compiledCss)),'Use the current main stylesheet');
 compiledCssHref='/'+path.relative(process.cwd(),compiledCss).replaceAll('\\','/');
}
const tailwind=styled&&!compiledCss?(await import('@tailwindcss/vite')).default:null;
const out=path.resolve(process.env.MULTIPLAYER_OUT??'artifacts/network-stream-20260921/phase17/browser');
const count=Number(process.env.MULTIPLAYER_PLAYERS??3), duration=Number(process.env.MULTIPLAYER_MS??15000);
const fixtureSeed=process.env.MULTIPLAYER_SEED===undefined?null:Number(process.env.MULTIPLAYER_SEED);
assert.ok(fixtureSeed===null||(Number.isSafeInteger(fixtureSeed)&&fixtureSeed>=0&&fixtureSeed<=0xffffffff));
assert.ok([2,3,4,5].includes(count));assert.ok(duration>=5000&&duration<=120000);
if(steady){assert.equal(duration,15000);assert.notEqual(fixtureSeed,null);assert.equal(process.env.MULTIPLAYER_WEAPON_FIXTURE,'true');}
await fs.mkdir(out,{recursive:true});
const dist=await fs.mkdtemp(path.join(tmpdir(),'normal-multiplayer-'));
await fs.writeFile(path.join(dist,'lan-build.json'),' {"build":"normal-multiplayer"}');
const hostLoad=hostLoadProbe();
const errors=[],samples=[],pages=[],bridges=[],profilers=[],workerLoopProbes=[],viewerBrowsers=[];let relay,vite,browser,report;
const until=async(fn,label,timeout=60000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out '+label);};
let currentStage='init';
const stage=s=>{currentStage=s;console.log('[multiplayer]',s);};
let heapSession,heapTimer,heapPending,hostProfiler;
if(process.env.MULTIPLAYER_HEAP==='true'){
 const {Session}=await import('node:inspector/promises');heapSession=new Session();heapSession.connect();
 await heapSession.post('HeapProfiler.startSampling',{samplingInterval:65536});
 let busy=false;heapTimer=setInterval(()=>{if(busy)return;busy=true;heapPending=(async()=>{
  const memory={at:Date.now(),stage:currentStage,...process.memoryUsage()};
  await fs.appendFile(path.join(out,'node-memory.jsonl'),JSON.stringify(memory)+'\n');
  const {profile}=await heapSession.post('HeapProfiler.getSamplingProfile');
  await fs.writeFile(path.join(out,'node-heap-sampling.json'),JSON.stringify(profile));
 })().catch(error=>console.error('Heap probe failed:',error)).finally(()=>{busy=false;});},5000);heapTimer.unref();
}
const watchdog=setTimeout(()=>{console.error('Watchdog expired');void Promise.all(viewerBrowsers.map(b=>b.close().catch(()=>{}))).finally(()=>process.exit(1));setTimeout(()=>process.exit(1),5000).unref();},240000);watchdog.unref();
try{
 relay=await createLanServer({host:'127.0.0.1',port:0,dist});const origin='http://127.0.0.1:'+relay.server.address().port;
 vite=await createServer({configFile:false,root:process.cwd(),esbuild:{jsx:'automatic'},optimizeDeps:{noDiscovery:true,entries:[],include:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client','react-dom','lucide-react']},define:{__LAN_BUILD_ID__:'"normal-multiplayer"',...(process.env.SPRITE_CULL==='false'?{'import.meta.env.VITE_CULL_SPRITES':'"false"'}:{}),...(process.env.DAMAGE_CULL==='false'?{'import.meta.env.VITE_CULL_DAMAGE_OVERLAYS':'"false"'}:{}),...(process.env.MULTI_TEXTURE_SHIPS==='false'?{'import.meta.env.VITE_MULTI_TEXTURE_SHIPS':'"false"'}:{}),...(process.env.DIRECT_AUTHORITY==='false'?{'import.meta.env.VITE_LAN_DIRECT_AUTHORITY':'"false"'}:{})},plugins:[...(tailwind?tailwind():[]),frozenBrowserPlugin(process.env.MULTIPLAYER_FROZEN),steadyFixturePlugin(steady,commandHeld),publicationProbePlugin(process.env.MULTIPLAYER_PUBLICATION_PROBE==='true'),sameTickSkipPlugin(process.env.MULTIPLAYER_SAME_TICK_SKIP==='true'),{name:'test-only-initial-particles',enforce:'pre',transform(code,id){if(process.env.MULTIPLAYER_PARTICLE_FIXTURE!=='true'||!id.replaceAll('\\','/').split('?')[0].endsWith('/src/network/HostSnapshot.ts'))return;const marker='return new HostMuzzleEvents(engine.fxSystem';assert.ok(code.includes(marker));return code.replace(marker,'if (localParticles) engine.fxSystem.spawnSparks(engine.playerShip.pos, 60); '+marker);}},{name:'isolated-battle-check',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__multiplayer.html')return next();res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Isolated multiplayer check</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="root"></div>');});}}],server:{host:'127.0.0.1',port:0,open:false,headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'},watch:null},logLevel:'error'});
 await vite.listen();const port=vite.httpServer.address().port;
 // Each real desktop owns its own helper. Do not put five clients behind one
 // helper or raise its deliberate four-connection safety cap for a benchmark.
 for(let i=0;i<count;i++)bridges.push(new DesktopLanBridge(port));
 vite.httpServer.on('upgrade',(req,socket,head)=>{if(req.url.startsWith('/desktop/lan/ws')){try{const client=Number(new URL(req.url,'http://127.0.0.1').searchParams.get('testClient'));assert.ok(Number.isInteger(client)&&client>=0&&client<count);bridges[client].upgrade(req,socket,head);}catch{socket.destroy();}}});
 // Use the direct pipe: launchServer + connect serialized every observed network
 // event twice and built an unbounded proxy backlog under this fixture.
 const launchViewerBrowser=()=>chromium.launch({headless:true,args:[...(process.env.MULTIPLAYER_ANGLE?['--use-angle='+process.env.MULTIPLAYER_ANGLE]:[]),'--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 browser=await launchViewerBrowser();viewerBrowsers.push(browser);
 for(let i=0;i<count;i++){
  const owner=process.env.MULTIPLAYER_BROWSER_PER_VIEWER==='true'&&i>0?await launchViewerBrowser():browser;
  if(owner!==browser)viewerBrowsers.push(owner);
  stage('joining '+i);const context=await owner.newContext({viewport:styled?{width:1280,height:720}:{width:640,height:360}}),page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>errors.push({seat:i,error:e.message}));
  page.on('console',m=>{if(process.env.MULTIPLAYER_LOOP_PROBE==='true'&&m.text().startsWith('[host-loop-probe] ')){workerLoopProbes.push({seat:i,...JSON.parse(m.text().slice('[host-loop-probe] '.length))});return;}const row=parseNetworkConsole(m.text());if(row){samples.push({seat:i,...row});}else if(m.type()==='error')errors.push({seat:i,console:m.text()});});
  await page.goto(`http://127.0.0.1:${port}/__multiplayer.html`);
  await page.evaluate(async({origin,index,fixtureSeed,styled,compiledCssHref,steady,textureProbe})=>{
   if(styled){if(compiledCssHref)await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=compiledCssHref;link.onload=resolve;link.onerror=()=>reject(Error('Compiled CSS failed'));document.head.append(link);});else await import('/src/index.css');await import('/src/network/lan.css');await import('/src/ui/core/motion.css');}
   window.__LAN_BUILD_ID__='normal-multiplayer';
   if(textureProbe){const {installTextureProbe}=await import('/scripts/lib/multiplayer-texture-probe.mjs');const {WebGLTextureManager}=await import('/src/engine/render/webgl/WebGLTextureManager.ts');window.textureProbe=installTextureProbe(WebGLTextureManager);}
   window.workerNotes=[];window.steadyEvents=[];if(steady)window.__steadyAim={x:0,y:0};const NativeWorker=window.Worker;window.Worker=class extends NativeWorker { constructor(...args){super(...args);this.addEventListener('error',e=>window.workerNotes.push({error:e.message,url:String(args[0])}));this.addEventListener('message',e=>{if(steady&&e.data?.type==='snapshot')window.steadySnapshotTick=e.data.tick;if(steady&&e.data?.type==='test-fixture'){window.steadyWorker=this;window.steadyEvents.push(e.data);}if(['failed','io-unavailable','connect-failed'].includes(e.data?.type))window.workerNotes.push(e.data);});} };
   const reactModule=await import('/node_modules/.vite/deps/react.js');const React=reactModule.default??reactModule;const domModule=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=domModule.createRoot??domModule.default.createRoot;
   const {LanConnection}=await import('/src/network/protocol.ts');const {LanBattle}=await import('/src/network/LanBattle.tsx');
   if(!crossOriginIsolated)throw Error('Missing required isolation headers');window.rows=[];window.connection=new LanConnection();window.battleRoot=createRoot(document.querySelector('#root'));
   connection.subscribe(m=>{if(m.type==='state' && window.stallAcks)window.stallAcks.push({wallTimeMs:Date.now(),seq:m.seq,tick:m.frame.tick,ack:m.frame.acknowledged?.[1]});window.rows.push(m.type==='state'?{type:m.type,seq:m.seq,tick:m.frame.tick,ack:m.frame.acknowledged}:m);if(window.rows.length>500)window.rows.shift();
    if(m.type==='welcome')window.identity=m.id;
    if(m.type==='match' && window.match?.id!==m.match.id) {if(fixtureSeed!==null)m.match.seed=fixtureSeed;window.match=m.match;const seat=m.match.players.find(p=>p.id===window.identity).seat;window.battleRoot.render(React.createElement(LanBattle,{connection,match:m.match,seat,ended:null,onReturn:()=>{window.returned=true;},roomHost:index===0}));}
   });
   connection.connect(location.origin+'/desktop/lan/ws?testClient='+index+'&target='+encodeURIComponent(origin),'test'+index);
  },{origin,index:i,fixtureSeed,styled,compiledCssHref,steady,textureProbe:process.env.MULTIPLAYER_TEXTURE_PROBE==='true'});
  await until(()=>page.evaluate(()=>connection.ready),'welcome');
  if(i===0){await page.evaluate(()=>connection.send({type:'create',password:'',battleSize:3200}));await until(()=>relay.rooms.size,'create');await page.evaluate(capacity=>connection.send({type:'capacity',capacity}),count);}
  else{await page.evaluate(code=>connection.send({type:'join',code}),[...relay.rooms.values()][0].code);await until(()=>[...relay.rooms.values()][0].peers.length===i+1,'join');}
 }
 const room=[...relay.rooms.values()][0];
 const aiCount=Number(process.env.MULTIPLAYER_AI??(22-count));assert.ok(Number.isInteger(aiCount)&&aiCount>=0&&aiCount<=24);
 await pages[0].evaluate(({aiCount,revision})=>connection.send({type:'options',baseRevision:revision,options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.floor(aiCount/2)).fill('hammerhead'),Array(Math.ceil(aiCount/2)).fill('hammerhead')]}}),{aiCount,revision:room.options.aiRevision??0});
 await until(()=>room.options.aiHulls.flat().length===aiCount,'options');
 for(const page of pages.slice(1))await page.evaluate(()=>connection.send({type:'ready',ready:true}));
 await until(()=>room.peers.slice(1).every(p=>p.ready),'ready');stage('start');await pages[0].evaluate(()=>connection.send({type:'start'}));
 await until(()=>room.status==='running'&&room.peers.every(p=>p.loaded),'all real replicas loaded',90000);stage('loaded');if(!steady)await new Promise(r=>setTimeout(r,3000));
 // Optional DOM-only input inside our isolated headless pages, never OS input.
 if(!steady&&process.env.MULTIPLAYER_PREDICTION_FIXTURE==='true')for(const page of pages)await page.evaluate(()=>{
  let step=0;
  const cycle=()=>{for(const code of ['KeyW','KeyE','KeyX'])window.dispatchEvent(new KeyboardEvent('keyup',{code}));window.dispatchEvent(new KeyboardEvent('keydown',{code:['KeyW','KeyE','KeyX'][step++%3]}));};
  cycle();window.predictionInputTimer=setInterval(cycle,1500);
 });
 if(!steady&&process.env.MULTIPLAYER_WEAPON_FIXTURE==='true')for(const page of pages)await page.evaluate(()=>{
  const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
  const aim=()=>{const phase=performance.now()/900;canvas.dispatchEvent(new MouseEvent('mousemove',{clientX:rect.left+rect.width*(.5+.2*Math.sin(phase)),clientY:rect.top+rect.height*.15}));};
  const press=()=>canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:rect.left+rect.width*.5,clientY:rect.top+rect.height*.15}));
  const group=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));window.dispatchEvent(new KeyboardEvent('keyup',{code}));};
  aim();group('Digit4');setTimeout(press,300);window.weaponAimTimer=setInterval(aim,40);
  setTimeout(()=>{window.dispatchEvent(new MouseEvent('mouseup',{button:0}));group('Digit1');setTimeout(press,300);},6000);
 });
 if(steady){
  stage('steady: replicas at tick 1');
  await until(async()=>Promise.all(pages.map(p=>p.evaluate(()=>window.rows.some(r=>r.tick===1)||window.steadyEvents.some(e=>e.phase==='checkpoint'&&e.tick===1)))).then(rows=>rows.every(Boolean)),'all replicas received tick 1');
  for(const page of pages)await page.evaluate(commandHeld=>{
   const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
   canvas.dispatchEvent(new MouseEvent('mousemove',{clientX:rect.left+rect.width*.5,clientY:rect.top+rect.height*.15}));
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit4'}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit4'}));
   if(commandHeld){
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
    canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:rect.left+rect.width*.5,clientY:rect.top+rect.height*.15}));
   }
  },commandHeld);
  stage('steady: prime real network inputs');
  await until(()=>pages[0].evaluate(()=>{window.steadyWorker?.postMessage({type:'test-fixture-status'});return window.steadyEvents.findLast(e=>e.phase==='status')?.primed;}),'steady host input priming');
  if(!commandHeld){
  await pages[0].evaluate(()=>window.steadyWorker.postMessage({type:'test-fixture-prepare'}));
  await until(async()=>Promise.all(pages.map(p=>p.evaluate(()=>window.steadySnapshotTick===61||window.rows.some(r=>r.tick===61)))).then(rows=>rows.every(Boolean)),'all replicas received settled group at tick 61');
  await Promise.all(pages.map(page=>page.evaluate(()=>{
   const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
   canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:rect.left+rect.width*.5,clientY:rect.top+rect.height*.15}));
  })));
  await until(()=>pages[0].evaluate(()=>{window.steadyWorker.postMessage({type:'test-fixture-status'});const s=window.steadyEvents.findLast(e=>e.phase==='status');return s?.tick===61&&s.primed;}),'steady held fire priming');
  }
 }
 if(process.env.MULTIPLAYER_PROFILE==='true')for(const page of pages.slice(0,2)){const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');profilers.push(cdp);}
 if(process.env.MULTIPLAYER_HOST_PROFILE==='true')hostProfiler=await startHostWorkerProfile(browser);
 let started,tickBefore,measuredUntil,measuredTickAfter,steadyEvidence=null;
 const processSessions=process.env.MULTIPLAYER_PROCESS_PROBE==='true'?await Promise.all(viewerBrowsers.map(b=>b.newBrowserCDPSession())):[];
 const processSample=async()=>({wallTimeMs:Date.now(),browsers:await Promise.all(processSessions.map(async(s,index)=>({index,...await s.send('SystemInfo.getProcessInfo')})))});
 const processBefore=processSessions.length?await processSample():null;
 stage('measurement');
 if(process.env.MULTIPLAYER_TEXTURE_PROBE==='true')await Promise.all(pages.map(p=>p.evaluate(()=>window.textureProbe.start())));
 if(steady){
  await pages[0].evaluate(()=>window.steadyWorker.postMessage({type:'test-fixture-release'}));
  await until(()=>pages[0].evaluate(()=>window.steadyEvents.some(e=>e.phase==='released')),'steady release');
  await until(()=>pages[0].evaluate(tick=>window.steadyEvents.some(e=>e.phase==='checkpoint'&&e.tick===tick),STEADY_END_TICK),'steady measured end');
  if(process.env.MULTIPLAYER_PUBLICATION_PROBE==='true')await until(()=>pages[0].evaluate(()=>window.steadyEvents.some(e=>e.phase==='publication-probe')),'publication probe completion');
  const events=await pages[0].evaluate(()=>window.steadyEvents.filter(e=>e.phase!=='status').map(({bytes,...e})=>{
   if(!bytes)return e;
   let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   return {...e,base64:btoa(binary)};
  }));
  const probe=events.find(e=>e.phase==='publication-probe');if(probe){assert.equal(probe.probe.overflow,0);await fs.writeFile(path.join(out,'publication-probe.json'),JSON.stringify(probe,null,2));}
  const checkpoints=[];
  for(const {base64,...event} of events){
   if(!base64)continue;const bytes=Buffer.from(base64,'base64');
   await fs.writeFile(path.join(out,'checkpoint-'+event.tick+'.bin'),bytes);
   checkpoints.push({...event,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const first=checkpoints.find(e=>e.tick===STEADY_START_TICK),last=checkpoints.find(e=>e.tick===STEADY_END_TICK);
  assert.ok(first&&last);started=first.wallTimeMs;measuredUntil=last.wallTimeMs;tickBefore=first.tick;measuredTickAfter=last.tick;
  steadyEvidence={inputTransitions:events.filter(e=>e.phase==='input-transition'),prepared:events.find(e=>e.phase==='prepared'),release:events.find(e=>e.phase==='released'),checkpoints,scope:'Worker wall timestamps at completed ticks; checkpoint capture/encode cost included, HUD rolling samples may straddle boundaries.'};
  await fs.writeFile(path.join(out,'steady-fixture.json'),JSON.stringify(steadyEvidence,null,2));
 }else{
  started=Date.now();tickBefore=room.lastTick;
  await new Promise(r=>setTimeout(r,duration));
  measuredUntil=Date.now();measuredTickAfter=room.lastTick;
 }
 if(process.env.MULTIPLAYER_TEXTURE_PROBE==='true')await fs.writeFile(path.join(out,'texture-probe.json'),JSON.stringify({scope:'Full local rendering interval from release through collection of tick1021, not just the121-1021 measurement; API CPU time only, no GPU finish. Revision byte estimates include only changed canvas revisions.',viewers:await Promise.all(pages.map(p=>p.evaluate(()=>window.textureProbe.stop())))},null,2));
 if(processSessions.length){const processAfter=await processSample();await fs.writeFile(path.join(out,'browser-processes.json'),JSON.stringify({mode:process.env.MULTIPLAYER_BROWSER_PER_VIEWER==='true'?'separate-browsers':'shared-browser',before:processBefore,after:processAfter},null,2));await Promise.all(processSessions.map(s=>s.detach()));}
 const measurement={commandHeld,steady:steadyEvidence,started,measuredUntil,elapsedMs:measuredUntil-started,requestedMs:duration,tickBefore,tickAfter:measuredTickAfter,seed:fixtureSeed??room.match.seed};
 report={measurement,roomStatus:room.status,failures:samples.filter(s=>s.event==='battle-failed').map(s=>({seat:s.seat,event:s.event,at:s.wallTimeMs,stage:s.failureStage}))};
 stage('measurement saved');await fs.writeFile(path.join(out,'measurement.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'samples-measured.jsonl'),samples.map(s=>JSON.stringify(s)).join('\n')+'\n');
 if(hostProfiler){const profile=await hostProfiler.stop();await fs.writeFile(path.join(out,'host.cpuprofile'),JSON.stringify(profile));}
 for(let i=0;i<profilers.length;i++){const {profile}=await profilers[i].send('Profiler.stop');await fs.writeFile(path.join(out,'cpu-'+i+'.json'),JSON.stringify(profile));}
 for(const cdp of profilers)await cdp.detach();profilers.length=0;
 if(styled&&process.env.MULTIPLAYER_WEAPON_FIXTURE==='true')await pages[0].screenshot({path:path.join(out,'turrets.png')});
 assert.deepEqual(report.failures,[],'authority failed before stress/reconnect');assert.equal(room.status,'running');assert.ok(measuredTickAfter>tickBefore,'physics must progress throughout measurement');
 let stall=null;
 if(process.env.MULTIPLAYER_STALL!=='false'){stage('stall: guest probe');
  await pages[1].evaluate(()=>{const row=window.rows.findLast(m=>m.type==='state');window.stallAcks=[{wallTimeMs:Date.now(),ack:row?.ack?.[1]}];});
  const hostSocket=room.peers.find(p=>p.id===room.hostId).ws;
  const trace={startedAt:Date.now()},publications=[{at:trace.startedAt,seq:room.lastSeq,boundary:true}];let lastAccepted=room.lastSeq;
  // This listener runs after the real validation/broadcast handler. Observe
  // accepted states only; no packet decoding, mutation, or production hook.
  const observe=()=>{if(room.lastSeq!==lastAccepted){lastAccepted=room.lastSeq;publications.push({at:Date.now(),seq:lastAccepted,tick:room.lastTick});}};
  hostSocket.on('message',observe);
  let block;
  try{stage('stall: host blocked');block=await pages[0].evaluate(()=>{const startedAt=Date.now(),until=performance.now()+800;while(performance.now()<until){};return {startedAt,finishedAt:Date.now()};});}
  finally{trace.finishedAt=Date.now();hostSocket.off('message',observe);}
  stage('stall: guest ACKs');const acks=await pages[1].evaluate(()=>{const rows=window.stallAcks;window.stallAcks=null;return rows;});
  stall=recordedStall(block,publications,acks,trace);
  await fs.writeFile(path.join(out,'stall-acknowledgements.json'),JSON.stringify(acks,null,2));
  await fs.writeFile(path.join(out,'stall-publications.json'),JSON.stringify(publications,null,2));
  report={measurement,stall};
 }
 let reconnected=null;
 if(process.env.MULTIPLAYER_RECONNECT==='true'){stage('reconnect: disconnect');
  const before=room.lastTick;await pages[0].evaluate(()=>connection.socket.close(4000,'isolated retryable disconnect'));
  await until(()=>!room.peers[0].loaded,'host disconnected',10000);
  stage('reconnect: recovery');await until(()=>room.peers.every(p=>p.loaded)&&room.lastTick>before+20,'host recovered same battle',30000);
  await new Promise(r=>setTimeout(r,2000));reconnected={before,after:room.lastTick,matchIdUnchanged:room.match.id===(await pages[0].evaluate(()=>window.match.id))};
  assert.equal(reconnected.matchIdUnchanged,true);
 }
 if(process.env.MULTIPLAYER_WEAPON_FIXTURE==='true')await pages[0].screenshot({path:path.join(out,'weapons.png')});
 stage('viewers');const loaded=room.peers.every(p=>p.loaded),tickAfter=room.lastTick;
 const viewers=await Promise.all(pages.map(p=>p.evaluate(()=>({canvas:(()=>{const c=document.querySelector('canvas'),r=c?.getBoundingClientRect();return c?{width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height}:null;})(),isolated:crossOriginIsolated,socket:connection.socket?.constructor.name,workerNotes:window.workerNotes,features:connection.networkFeatures,connected:connection.ready,returned:!!window.returned,errors:window.rows.filter(m=>['error','disconnected','roomClosed'].includes(m.type)),gpu:(()=>{const gl=document.querySelector('canvas')?.getContext('webgl2');const debug=gl?.getExtension('WEBGL_debug_renderer_info');return gl?{vendor:gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)}:null;})(),text:document.body.innerText.slice(0,5000)}))));
 const measured=measuredSamples(samples,started,measuredUntil);
 const q=(xs,p)=>xs.length?xs.toSorted((a,b)=>a-b)[Math.floor((xs.length-1)*p)]:null;
 if(process.env.MULTIPLAYER_SAME_TICK_SKIP==='true'){const retryEvents=await pages[0].evaluate(()=>window.steadyEvents.filter(e=>e.phase==='same-tick-retry'));await fs.writeFile(path.join(out,'same-tick-retry.json'),JSON.stringify(retryEvents,null,2));const skipped=retryEvents.find(e=>e.delivery==='skipped'),sent=retryEvents.find(e=>e.delivery==='sent'&&e.attempt>skipped?.attempt);assert.ok(skipped&&sent,'forced tick61 skip must recover at the SAME tick with a NEW attempt');}
 const stats=pages.map((_,i)=>{const rows=measured.filter(s=>s.seat===i&&s.hud);return {seat:i,samples:rows.length,hz:q(rows.map(s=>s.hud.hz).filter(Number.isFinite),.5),motionHz:q(rows.map(s=>s.hud.motionHz).filter(Number.isFinite),.5),fps:q(rows.map(s=>s.hud.fps).filter(Number.isFinite),.5),ageP95:q(rows.map(s=>s.hud.age).filter(Number.isFinite),.95),inputP95:q(rows.map(s=>s.hud.acknowledgementMs).filter(Number.isFinite),.95),direct:rows.at(-1)?.hud.authority?.io??null,captureReuse:rows.at(-1)?.hud.authority?.captureReuse??null,capturePlans:rows.at(-1)?.hud.authority?.capturePlans??null,serializer:rows.at(-1)?.hud.authority?.serializer??null,motionPrediction:rows.at(-1)?.hud.input?.motionPrediction??null,turretPrediction:rows.at(-1)?.hud.input?.turretPrediction??null,firePrediction:rows.at(-1)?.hud.input?.firePrediction??null,projectileFlight:rows.at(-1)?.hud.input?.projectileFlight??null,physics:q(rows.map(s=>s.hud.authority?.flow?.rates?.simulated).filter(Number.isFinite),.5)};});
 report={browserMode:process.env.MULTIPLAYER_BROWSER_PER_VIEWER==='true'?'separate-browsers':'shared-browser',scope:'Actual default LAN host Worker + LanBattle + desktop helper + WebGL on ONE headless machine (actual renderer recorded per viewer), 22-ship roster unless overridden; loopback, not Valve/n2n/multi-machine FPS.',players:count,ai:aiCount,fixtureSeed,styled,compiledCss:compiledCssHref,frozenSources:process.env.MULTIPLAYER_FROZEN??null,damageCull:process.env.DAMAGE_CULL!=='false',spriteCull:process.env.SPRITE_CULL!=='false',particleFixture:process.env.MULTIPLAYER_PARTICLE_FIXTURE==='true',roomStatus:room.status,failures:samples.filter(s=>s.event==='battle-failed').map(s=>({seat:s.seat,event:s.event,at:s.wallTimeMs,stage:s.failureStage})),measurement,stall,reconnected,elapsed:measuredUntil-started,ticks:measuredTickAfter-tickBefore,loaded,stats,viewers,errors};
 if(stall&&process.env.DIRECT_AUTHORITY!=='false'){assert.ok(stall.validWindow,'publication sampling must be inside actual browser block');assert.ok(stall.publicationsDuringMiddle450ms>=5,'host rendering stall must not stop publication');assert.ok(stall.validAckProgress,'guest ACK must advance and be observed while host main is blocked');}
 if(process.env.MULTIPLAYER_PREDICTION_FIXTURE==='true')for(let seat=0;seat<count;seat++)assert.ok(measured.some(s=>s.seat===seat&&s.hud?.input?.motionPrediction?.renderedFrames>0&&s.hud?.input?.motionPrediction?.reconciliations>0),'motion prediction must actually run and reconcile on viewer '+seat);
 if(styled)for(const v of viewers)assert.ok(v.canvas?.cssWidth>=1200&&v.canvas?.cssHeight>=650,'styled fixture must render the full battle canvas');
 if(process.env.MULTIPLAYER_WEAPON_FIXTURE==='true'&&process.env.MULTIPLAYER_EXPECT_LOCAL_WEAPONS!=='false')for(let seat=0;seat<count;seat++){
  assert.ok(measured.some(s=>s.seat===seat&&s.hud?.input?.turretPrediction?.renderedFrames>0),'local turret must actually render on viewer '+seat);
  assert.ok(measured.some(s=>s.seat===seat&&s.hud?.input?.firePrediction?.repeated>0),'confirmed held repeats must actually be created on viewer '+seat);
 }
 if(commandHeld)for(let seat=0;seat<count;seat++)assert.ok(measured.some(s=>s.seat===seat&&s.hud?.input?.firePrediction?.recoveredCycles>0),'command-blocked held fire must actually recover on viewer '+seat);
 if(process.env.MULTIPLAYER_EXPECT_FLIGHT==='true')for(let seat=0;seat<count;seat++)assert.ok(measured.some(s=>s.seat===seat&&s.hud?.input?.projectileFlight?.renderedFrames>0&&s.hud?.input?.projectileFlight?.entities>0),'confirmed projectile flight must actually run on viewer '+seat);
 if(process.env.MULTIPLAYER_PARTICLE_FIXTURE==='true')for(let seat=0;seat<count;seat++)assert.ok(samples.some(s=>s.seat===seat&&s.hud?.input?.localParticles?.generated>0),'default particle replay must actually run on viewer '+seat);
 assert.deepEqual(report.failures,[],'no authority failure during the run');assert.equal(room.status,'running','battle must remain running');assert.equal(loaded,true);assert.ok(tickAfter>tickBefore);assert.deepEqual(errors,[]);for(const v of viewers){assert.equal(v.connected,true);assert.equal(v.returned,false);assert.deepEqual(v.errors,[]);}for(const s of stats){assert.ok(s.samples>=3);assert.ok(s.hz>0);assert.ok(s.ageP95<1500);}
 assert.equal((process.env.MULTIPLAYER_RECONNECT==='true'?samples.findLast(s=>s.seat===0&&s.hud?.authority?.io)?.hud.authority.io:stats[0].direct)?.enabled,process.env.MULTIPLAYER_RECONNECT==='true'?false:process.env.DIRECT_AUTHORITY!=='false');stage('assertions passed');
}catch(error){process.exitCode=1;report={...report,error:String(error),errors,bodies:await Promise.all(pages.map(p=>p.locator('body').innerText().catch(()=>''))),lifecycle:await Promise.all(pages.map(p=>p.evaluate(()=>({ready:connection.ready,socket:connection.socket?.constructor.name,workerNotes:window.workerNotes,steadyEvents:window.steadyEvents?.slice(-8).map(({bytes,...e})=>({...e,byteLength:bytes?.length})),rows:window.rows.filter(m=>['welcome','launch','resume','reconnecting','disconnected','error','ended'].includes(m.type)).map(m=>({type:m.type,matchId:m.matchId,stateSeq:m.stateSeq,reason:m.reason,code:m.code}))})).catch(()=>null)))};console.error(error);}
finally{
 if(report)await fs.writeFile(path.join(out,'result-before-cleanup.json'),JSON.stringify(report,null,2));
 if(hostProfiler){try{await hostProfiler.stop();}catch(error){console.error('Host profile cleanup:',error);}}
 stage('cleanup: snapshots saved');
 await fs.writeFile(path.join(out,'samples.jsonl'),samples.map(s=>JSON.stringify(s)).join('\n')+'\n');
 stage('cleanup: close room');
 if(relay&&relay.rooms.size)for(const code of [...relay.rooms.keys()])relay.closeRoom(code);
 stage('cleanup: unmount');
 if(browser)for(const page of pages)await page.evaluate(()=>{window.battleRoot?.unmount();window.connection?.close();}).catch(()=>{});
 stage('cleanup: browser');
 await Promise.all(viewerBrowsers.map(b=>b.close()));stage('cleanup: helpers');for(const bridge of bridges)bridge.close();await vite?.close();await relay?.close();await fs.unlink(path.join(dist,'lan-build.json'));await fs.rmdir(dist);clearTimeout(watchdog);clearInterval(heapTimer);await heapPending;heapSession?.disconnect();
}
await fs.writeFile(path.join(out,'host-load.json'),JSON.stringify(hostLoad.stop(),null,2));
if(process.env.MULTIPLAYER_LOOP_PROBE==='true')await fs.writeFile(path.join(out,'worker-loop.jsonl'),workerLoopProbes.map(r=>JSON.stringify(r)).join('\n')+'\n');
report.cleanupCompleted=true;await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
