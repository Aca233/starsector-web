// Headless only; exercises actual browser I/O Worker, negotiation, helper and
// MotionReplica. Synthetic tiny world: NOT full game FPS or a bandwidth benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import WebSocket from 'ws';
import {createLanServer} from '../server/lan-server.mjs';
import {DesktopLanBridge} from '../server/desktop-lan-bridge.mjs';
import {encodeMotionFrame,motionToText} from '../src/network/MotionFrame.mjs';
import protocol from '../src/network/protocol.json' with {type:'json'};
const {chromium}=createRequire(import.meta.url)('playwright');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<400;i++){const x=await fn();if(x)return x;await wait(10);}throw Error('Timed out: '+label);}
const dist=await fs.mkdtemp(path.join(tmpdir(),'activation-browser-'));
await fs.writeFile(path.join(dist,'lan-build.json'),'{"build":"activation-browser"}');
let relay,vite,bridge,browser,browserServer,host,report;
const stage=name=>console.log('[activation-browser]',name);
const watchdog=setTimeout(()=>{console.error('Browser test watchdog expired');void (browserServer ? browserServer.kill() : Promise.resolve()).finally(()=>process.exit(1));},60000);watchdog.unref();
try {
 stage('relay');relay=await createLanServer({host:'127.0.0.1',port:0,dist});const origin='http://127.0.0.1:'+relay.server.address().port;
 vite=await createServer({configFile:false,root:process.cwd(),optimizeDeps:{noDiscovery:true,include:[]},define:{__LAN_BUILD_ID__:'"activation-browser"'},plugins:[{name:'activation-page',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__activation.html')return next();res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Network activation check</title>');});}}],server:{host:'127.0.0.1',port:0,open:false,headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'},watch:{ignored:['**/artifacts/**']}},logLevel:'error'});
 stage('vite listen');await vite.listen();const port=vite.httpServer.address().port,localOrigin='http://127.0.0.1:'+port;
 bridge=new DesktopLanBridge(port);vite.httpServer.on('upgrade',(req,socket,head)=>{if(!req.url.startsWith('/desktop/lan/ws'))return;try{bridge.upgrade(req,socket,head);}catch{socket.destroy();}});
 stage('host connect');host=new WebSocket(origin.replace('http:','ws:')+'/lan/ws',{origin,perMessageDeflate:false});const hostRows=[];host.on('message',(raw,binary)=>{if(!binary)hostRows.push(JSON.parse(raw));});await once(host,'open');
 const send=m=>host.send(JSON.stringify(m));
 send({type:'hello',name:'host',instance:'headless-host',build:'activation-browser',protocol:protocol.version,stateCredits:1,motionState:1,motionAuto:1});await until(()=>hostRows.find(m=>m.type==='welcome'),'host welcome');
 send({type:'create',password:''});const room=await until(()=>[...relay.rooms.values()][0],'room');send({type:'capacity',capacity:3});await until(()=>room.capacity===3,'capacity');
 stage('chromium launch');browserServer=await chromium.launchServer({headless:true});browser=await chromium.connect(browserServer.wsEndpoint());const pages=[],errors=[];
 for(let i=0;i<2;i++){
  const page=await browser.newPage();pages.push(page);page.on('pageerror',e=>errors.push(String(e)));
  stage('navigate guest '+i);await page.goto(localOrigin+'/__activation.html');
  stage('initialize guest '+i);await page.evaluate(async({origin,code,index})=>{
    window.__LAN_BUILD_ID__='activation-browser';
    const {LanConnection}=await import('/src/network/protocol.ts');
    const {MotionReplica}=await import('/src/network/MotionReplica.ts');
    const {motionFromText}=await import('/src/network/MotionFrame.mjs');
    const {shipPresentationPose}=await import('/src/engine/visual/ShipPresentation.ts');
    const {Vector2}=await import('/src/engine/math/Vector2.ts');
    const connection=window.connection=new LanConnection(),replica=new MotionReplica();
    const ships=[0,1,2].map(i=>({id:'ship'+i,pos:new Vector2(0,0),vel:new Vector2(0,0),facingRad:0,angularVelRad:0,spec:{collisionRadius:20},isDead:false,isRetreated:false}));
    window.rows=[];window.worldTick=-1;window.motionCount=0;
    window.inspectPose=()=>{replica.render({allCapitalShips:ships},performance.now(),window.worldTick);return {pose:shipPresentationPose(ships[1])?.pos.x??null,physicsX:ships[1].pos.x};};
    connection.subscribe(m=>{window.rows.push(m);if(m.type==='state')window.worldTick=m.frame.tick;
      if(m.type==='motion'){const frame=motionFromText(m.data);if(replica.receive(frame,performance.now(),window.worldTick))window.motionCount++;connection.send({type:'motion-consumed',matchId:m.matchId,syncId:m.syncId,tick:frame.tick});}});
    connection.connect(location.origin+'/desktop/lan/ws?target='+encodeURIComponent(origin),'guest'+index);
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('welcome timeout')),5000);const off=connection.subscribe(m=>{if(m.type==='welcome'){clearTimeout(t);off();resolve();}});});
    connection.send({type:'join',code});
  },{origin,code:room.code,index:i});
  await until(()=>room.peers.length===i+2,'browser join');
 }
 stage('ready lanes');await until(()=>room.peers.slice(1).every(p=>p.controlLane?.socket),'real helper lanes');
 for(const page of pages)await page.evaluate(()=>window.connection.send({type:'ready',ready:true}));
 await until(()=>room.peers.slice(1).every(p=>p.ready),'ready');send({type:'start'});await until(()=>room.status==='loading','start');
 send({type:'loaded',matchId:room.match.id});for(const page of pages)await page.evaluate(matchId=>window.connection.send({type:'loaded',matchId}),room.match.id);await until(()=>room.status==='running','running');
 const state=tick=>({type:'state',matchId:room.match.id,seq:tick,frame:{tick,acknowledged:{},ships:room.peers.map((p,i)=>({id:'ship'+i,state:{teamId:p.team}})),crafts:[],craftSpecs:[],world:{combatTime:tick/60}}});send(state(1));
 await until(async()=>(await Promise.all(pages.map(p=>p.evaluate(()=>window.worldTick===1)))).every(Boolean),'browser whole world');
 send({type:'sync-ready',matchId:room.match.id,syncId:room.peers[0].sync.id,tick:1});
 for(let i=0;i<pages.length;i++)await pages[i].evaluate(m=>window.connection.send(m),{type:'sync-ready',matchId:room.match.id,syncId:room.peers[i+1].sync.id,tick:1});
 await until(()=>room.peers.every(p=>p.loaded),'bootstrap');await until(()=>room.peers.slice(1).every(p=>p.autoMotion.world),'renderer consumed world');
 send({type:'motion',matchId:room.match.id,data:motionToText(encodeMotionFrame({tick:2,time:2/60,acknowledged:{},ships:room.peers.map((_,i)=>['ship'+i,10+i,0,0,0,0,0,0,0])}))});
 await until(()=>room.peers.slice(1).every(p=>p.motionWindow.acked===1),'real motion consumption');
 const viewers=await Promise.all(pages.map(p=>p.evaluate(()=>({isolated:crossOriginIsolated,socket:window.connection.socket.constructor.name,features:window.connection.networkFeatures,motionCount:window.motionCount,...window.inspectPose()}))));
 for(const viewer of viewers){assert.equal(viewer.isolated,true);assert.equal(viewer.socket,'WorkerLanSocket');assert.equal(viewer.features.policy,'auto');assert.equal(viewer.features.motion,true);assert.equal(viewer.features.visuals,false);assert.equal(viewer.pose,11);assert.equal(viewer.physicsX,0);assert.equal(viewer.motionCount,1);}
 room.peers[1].controlLane.socket.terminate();await until(()=>!room.peers[1].controlLane.socket,'lane failure');send(state(2));await until(()=>pages[0].evaluate(()=>window.worldTick===2),'full state after lane loss');
 await wait(280);assert.equal((await pages[0].evaluate(()=>window.inspectPose())).pose,null);
 assert.deepEqual(errors,[]);assert.ok(!hostRows.some(m=>m.type==='error'));
 report={scope:'Headless Chromium + real default LanConnection/SharedArrayBuffer I/O Worker + production DesktopLanBridge/relay + MotionReplica; synthetic worlds, no game FPS/Steam/n2n claim',viewers,laneLossFullState:true,expiredPoseCleared:true,pageErrors:errors};
 stage('assertions passed');
} catch(error) { console.error(error);throw error; } finally {
 stage('closing client workers');if(browser)for(const context of browser.contexts())for(const page of context.pages())await page.evaluate(()=>window.connection?.close()).catch(()=>{});
 stage('closing isolated browser server');await browser?.close();await browserServer?.kill();host?.terminate();bridge?.close();stage('closing vite');await vite?.close();stage('closing relay');await relay?.close();clearTimeout(watchdog);await fs.unlink(path.join(dist,'lan-build.json'));await fs.rmdir(dist);
}

report.cleanupCompleted=true;await fs.mkdir('artifacts/network-stream-20260921/phase14',{recursive:true});await fs.writeFile('artifacts/network-stream-20260921/phase14/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
