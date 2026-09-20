import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createLanServer} from '../server/lan-server.mjs';
import {createAuthorityFactory} from '../server/ServerBattleAuthority.mjs';
import {decodeBinaryState} from '../src/network/BinarySnapshot.mjs';
const require=createRequire(import.meta.url), {chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const base=path.resolve('artifacts/server-authority-20260920'),runtime=path.join(base,'runtime');
const factory=createAuthorityFactory({workerFile:path.join(runtime,'authority-worker.mjs'),assets:path.join(runtime,'web')});
const app=await createLanServer({host:'127.0.0.1',port:0,dist:path.join(runtime,'web'),authorityFactory:factory});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH,headless:true});
const checks=[],errors=[],workers=[],states=[null,null],frames=[0,0],pages=[];
const url='http://127.0.0.1:'+app.server.address().port;
const until=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out '+label);};
const page=async i=>{const ctx=await browser.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();pages.push(p);p.on('pageerror',e=>errors.push({page:i,message:e.message}));p.on('worker',w=>workers.push({page:i,url:w.url()}));p.on('websocket',ws=>ws.on('framereceived',frame=>{if(Buffer.isBuffer(frame.payload)){try{const m=decodeBinaryState(frame.payload);states[i]=m;frames[i]++;}catch{/* Loopback compression/delta are disabled. Other binary transports aren't used. */}}}));await p.goto(url+'/?view=lan');return p;};
try {
 const a=await page(0);await a.getByLabel('玩家名称',{exact:true}).fill('网页房主');await a.getByRole('button',{name:'创建房间',exact:true}).click();
 await until(()=>app.rooms.size===1,'UI create');const room=[...app.rooms.values()][0];
 await a.getByRole('button',{name:'应用配装',exact:true}).click();
 const b=await page(1);await b.getByLabel('玩家名称',{exact:true}).fill('网页队友');await b.getByLabel('房间码',{exact:true}).fill(room.code);await b.getByRole('button',{name:'加入房间',exact:true}).click();
 await b.getByRole('button',{name:'应用并准备',exact:true}).click();await until(()=>room.peers.length===2&&room.peers[1].ready,'UI apply and ready');
 await a.getByRole('button',{name:'开始战斗',exact:true}).click();await until(()=>room.status==='running'&&room.peers.every(p=>p.loaded)&&frames.every(n=>n>=30),'both browser replicas ready',60000);
 assert.equal(room.match.authority,'server');assert.ok(!workers.some(w=>/host\.worker/.test(w.url)));checks.push('UI create/join/apply/ready/start; neither browser launches authority Worker');
 const tick=states[0].frame.tick;await a.keyboard.down('w');await new Promise(r=>setTimeout(r,550));await a.keyboard.up('w');await until(()=>states[0].frame.tick>tick+20&&states[0].frame.acknowledged[0]>0,'creator input acknowledged');assert.ok(states[1].frame.acknowledged[1]>0);checks.push('both browser player inputs acknowledged by Node authority');
 const matchId=room.match.id;await a.reload();await until(()=>room.peers.every(p=>p.loaded)&&states[0].frame.tick>tick+40,'creator browser reload recovery',60000);assert.equal(room.status,'running');assert.equal(room.match.id,matchId);checks.push('actual creator browser refresh recovers same server battle');
 await b.screenshot({path:path.join(base,'browser-battle.png')});
 await a.close();const before=states[1].frame.tick;await until(()=>states[1].frame.tick>before+60,'creator closed browser and guest still playing');checks.push('closing creator browser does not stop guest or simulation');
 assert.deepEqual(errors,[]);
 const result={passed:true,checks,frames,tick:states[1].frame.tick,workers,errors};await fs.writeFile(path.join(base,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} catch(error){const bodies=[];for(const p of pages)if(!p.isClosed())bodies.push((await p.locator('body').innerText()).slice(0,12000));const result={passed:false,error:String(error),checks,errors,workers,frames,bodies};await fs.writeFile(path.join(base,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=1;}
finally{await browser.close();await app.close();await factory.close();}
