import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {WebSocket} from 'ws';
import protocol from '../src/network/protocol.json' with {type:'json'};
import {parseNetworkConsole} from '../desktop/network-diagnostic-record.mjs';
import {createLanServer} from '../server/lan-server.mjs';
import {createAuthorityFactory} from '../server/ServerBattleAuthority.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {LanDeltaReceiver} from '../src/network/LanBinaryDelta.mjs';
const require=createRequire(import.meta.url), {chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const base=path.resolve('artifacts/server-authority-20260920'),runtime=path.join(base,'runtime');
const remoteOrigin=process.env.BATTLE_TEST_URL;
const factory=remoteOrigin?null:createAuthorityFactory({workerFile:path.join(runtime,'authority-worker.mjs'),assets:path.join(runtime,'web')});
const app=remoteOrigin?null:await createLanServer({host:'127.0.0.1',port:0,dist:path.join(runtime,'web'),authorityFactory:factory});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH,headless:true});
const checks=[],errors=[],workers=[],states=[null,null],frames=[0,0],pages=[],clientRooms=[null,null],tokens=[null,null],diagnostics=[];
const url=remoteOrigin??('http://127.0.0.1:'+app.server.address().port);
const until=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out '+label);};
const page=async i=>{const ctx=await browser.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();pages.push(p);p.on('pageerror',e=>errors.push({page:i,message:e.message}));p.on('console',message=>{const record=parseNetworkConsole(message.text());if(record&&diagnostics.length<200)diagnostics.push({page:i,...record});});p.on('worker',w=>workers.push({page:i,url:w.url()}));p.on('websocket',ws=>{const decoder=new LanDeltaReceiver();ws.on('framereceived',frame=>{try{if(typeof frame.payload==='string'){const m=JSON.parse(frame.payload);if(m.type==='room')clientRooms[i]=m.room;if(m.type==='welcome'){tokens[i]=m.resumeToken;decoder.setMotionReference(m.motionReference===1);}if(m.type==='match')decoder.reset();}if(Buffer.isBuffer(frame.payload)){const m=decodeBinaryState(decoder.decode(frame.payload));states[i]=m;frames[i]++;}}catch(error){errors.push({page:i,message:'WebSocket observer: '+error.message});}});});await p.goto(url+'/?view=lan');return p;};
try {
 const a=await page(0);await a.getByLabel('玩家名称',{exact:true}).fill('网页房主');await a.getByRole('button',{name:'创建房间',exact:true}).click();
 await until(()=>clientRooms[0],'UI create');const code=clientRooms[0].code;
 await a.getByRole('button',{name:'应用配装',exact:true}).click();
 const b=await page(1);await b.getByLabel('玩家名称',{exact:true}).fill('网页队友');await b.getByLabel('房间码',{exact:true}).fill(code);await b.getByRole('button',{name:'加入房间',exact:true}).click();
 await b.getByRole('button',{name:'应用并准备',exact:true}).click();await until(()=>clientRooms[0]?.members.length===2&&clientRooms[0].members[1].ready,'UI apply and ready');
 await a.getByRole('button',{name:'开始战斗',exact:true}).click();await until(()=>clientRooms[0]?.status==='running'&&clientRooms[0].members.every(p=>p.loaded)&&frames.every(n=>n>=30),'both browser replicas ready',60000);
 const measureMs=Number(process.env.BATTLE_MEASURE_MS??0);if(Number.isFinite(measureMs)&&measureMs>0&&measureMs<=60000)await new Promise(resolve=>setTimeout(resolve,measureMs));
 assert.equal(clientRooms[0].match.authority,'server');assert.ok(!workers.some(w=>/host\.worker/.test(w.url)));checks.push('UI create/join/apply/ready/start; neither browser launches authority Worker');
 const tick=states[0].frame.tick;await a.keyboard.down('w');await new Promise(r=>setTimeout(r,550));await a.keyboard.up('w');await until(()=>states[0].frame.tick>tick+20&&states[0].frame.acknowledged[0]>0,'creator input acknowledged');assert.ok(states[1].frame.acknowledged[1]>0);checks.push('both browser player inputs acknowledged by Node authority');
 const matchId=clientRooms[0].match.id,reloadTick=states[0].frame.tick;clientRooms[0]=null;states[0]=null;await a.reload();await until(()=>clientRooms[0]?.members.every(p=>p.loaded)&&states[0]?.frame.tick>reloadTick,'creator browser reload recovery',60000);assert.equal(clientRooms[0].status,'running');assert.equal(clientRooms[0].match.id,matchId);checks.push('actual creator browser refresh recovers same server battle');
 await b.screenshot({path:path.join(base,'browser-battle.png')});
 await a.close();const before=states[1].frame.tick;await until(()=>states[1].frame.tick>before+60,'creator closed browser and guest still playing');checks.push('closing creator browser does not stop guest or simulation');
 assert.deepEqual(errors,[]);
 const result={passed:true,remote:!!remoteOrigin,url,checks,frames,tick:states[1].frame.tick,workers,errors};await fs.writeFile(path.join(base,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} catch(error){const bodies=[];for(const p of pages)if(!p.isClosed())bodies.push((await p.locator('body').innerText()).slice(0,12000));const result={passed:false,error:String(error),checks,errors,workers,frames,bodies};await fs.writeFile(path.join(base,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=1;}
finally{
 await fs.writeFile(path.join(base,'browser-flow-samples.json'),JSON.stringify({diagnostics},null,2));
 await browser.close();
 if(remoteOrigin){
  // Reclaim only this test's authenticated seats; do not leave a cloud Worker
  // waiting out the reconnect grace, and never expose an administrative API.
  const {build}=await (await fetch(url+'/lan-build.json')).json();
  for(const token of tokens.filter(Boolean))await new Promise(resolve=>{
   const ws=new WebSocket(url.replace(/^http/,'ws')+'/lan/ws',{origin:url,handshakeTimeout:5000});
   const timeout=setTimeout(()=>{ws.terminate();resolve();},7000);
   ws.on('error',()=>{});ws.on('close',()=>{clearTimeout(timeout);resolve();});
   ws.on('open',()=>ws.send(JSON.stringify({type:'hello',name:'test-cleanup',instance:crypto.randomUUID(),build,protocol:protocol.version,resumeToken:token})));
   ws.on('message',(data,binary)=>{if(binary)return;const m=JSON.parse(data);if(m.type==='welcome')ws.send(JSON.stringify({type:'leave'}));if(m.type==='left'||m.type==='error')ws.close();});
  });
 }
 await app?.close();await factory?.close();
}
