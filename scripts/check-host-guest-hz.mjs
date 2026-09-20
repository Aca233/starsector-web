import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createLanServer} from '../server/lan-server.mjs';
import {parseNetworkConsole} from '../desktop/network-diagnostic-record.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const base=path.resolve(process.argv[2]??'artifacts/guest-latency-20260920/before');
const ships=Number(process.argv[3]??32),seconds=Number(process.argv[4]??20),tag=process.argv[5]??String(ships);
assert.ok([2,16,32,64].includes(ships));
const app=await createLanServer({host:'127.0.0.1',port:0,dist:path.join(base,'web')});
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
const url='http://127.0.0.1:'+app.server.address().port,errors=[],workers=[],diagnostics=[],pages=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label,ms=90000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;if(['controls','warmup ticks'].includes(label)&&room()?.status==='ended')throw Error('Battle ended before '+label+': '+room().reason);await wait(50);}throw Error('Timeout '+label);};
const room=()=>[...app.rooms.values()][0];
async function page(i){
 const ctx=await browser.newContext({viewport:{width:1000,height:700}}),p=await ctx.newPage();pages.push(p);
 p.on('pageerror',e=>errors.push({page:i,message:e.message}));
 p.on('console',m=>{const record=parseNetworkConsole(m.text());if(record)diagnostics.push({page:i,at:Date.now(),record});});
 p.on('worker',w=>workers.push({page:i,url:w.url()}));
 await p.addInitScript(()=>{
  window.__hz={acks:[],poses:[]};
  window.__guestAckProbe=v=>{window.__hz.acks.push(v);};
  window.__guestPoseProbe=v=>{window.__hz.poses.push(v);};
 });
 await p.goto(url+'/?view=lan');return p;
}
function seedFixture(p){const send=p.ws.send.bind(p.ws);p.ws.send=(data,...args)=>{
 if(typeof data==='string'&&data.includes('"type":"match"')){
  const m=JSON.parse(data);if(m.type==='match'){m.match.seed=1511506142;room().match.seed=m.match.seed;data=JSON.stringify(m);}
 }
 return send(data,...args);
};}
let cdp,profileSession,profileCommand;
try{
 const a=await page(0);await a.getByLabel('玩家名称',{exact:true}).fill('Hz房主');await a.getByRole('button',{name:'创建房间',exact:true}).click();await until(()=>room(),'create');
 await a.getByRole('button',{name:'应用配装',exact:true}).click();
 // Test fixture submits options through the actual gateway validator on this
 // authenticated socket. UI room creation/readiness/start remain real browser operations.
 room().peers[0].ws.emit('message',Buffer.from(JSON.stringify({type:'options',baseRevision:room().options.aiRevision??0,options:{battleSize:3200,aiHulls:[Array((ships-2)/2).fill('hammerhead'),Array((ships-2)/2).fill('hammerhead')]}})),false);
 await until(()=>room().options.aiHulls.flat().length===ships-2,'fleet');

 const b=await page(1);await b.getByLabel('玩家名称',{exact:true}).fill('Hz客机');await b.getByLabel('房间码',{exact:true}).fill(room().code);await b.getByRole('button',{name:'加入房间',exact:true}).click();
 await b.getByRole('button',{name:'应用并准备',exact:true}).click();await until(()=>room().peers.length===2&&room().peers[1].ready,'ready');
 room().peers.forEach(seedFixture);
 await a.getByRole('button',{name:'开始战斗',exact:true}).click();
 await until(()=>b.evaluate(()=>window.__hz.poses.some(v=>v.synced)),'controls');
 assert.notEqual(room().match.authority,'server');assert.equal(workers.filter(w=>/host\.worker/.test(w.url)).length,1);
 await until(()=>b.evaluate(()=>window.__hz.acks.at(-1)?.tick>=180),'warmup ticks');
 if(process.env.HZ_PROFILE==='1'){
  cdp=await browser.newBrowserCDPSession();const targets=await cdp.send('Target.getTargets');const target=targets.targetInfos.find(t=>/host\.worker/.test(t.url));assert.ok(target,'host worker target');
  ({sessionId:profileSession}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false}));let id=0;const pending=new Map();
  cdp.on('Target.receivedMessageFromTarget',e=>{if(e.sessionId!==profileSession)return;const m=JSON.parse(e.message);if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);if(m.error)reject(Error(JSON.stringify(m.error)));else resolve(m.result);}});
  profileCommand=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId:profileSession,message:JSON.stringify({id:n,method,params})}).catch(reject);});
  await profileCommand('Profiler.enable');await profileCommand('Profiler.start');
 }
 const starts=await Promise.all(pages.map(p=>p.evaluate(()=>({at:performance.now(),ack:window.__hz.acks.length,pose:window.__hz.poses.length}))));
 const phaseAt=Date.now();await wait(seconds*1000);
 const data=await Promise.all(pages.map((p,i)=>p.evaluate(s=>({elapsedMs:performance.now()-s.at,acks:window.__hz.acks.slice(s.ack),poses:window.__hz.poses.slice(s.pose)}),starts[i])));
 if(profileCommand){const {profile}=await profileCommand('Profiler.stop');await fs.writeFile(path.join(base,`host-${tag}.cpuprofile`),JSON.stringify(profile));}
 const stats=vs=>{vs=[...vs].sort((a,b)=>a-b);return {mean:vs.reduce((a,b)=>a+b,0)/vs.length,p95:vs[Math.ceil(vs.length*.95)-1],max:vs.at(-1)};};
 const summary=data.map(d=>({firstTick:d.acks[0].tick,lastTick:d.acks.at(-1).tick,receivedHz:new Set(d.acks.map(v=>v.tick)).size*1000/d.elapsedMs,acceptedCount:d.acks.length,uniqueTicks:new Set(d.acks.map(v=>v.tick)).size,strictlyIncreasingTicks:d.acks.every((v,i)=>i===0||v.tick>d.acks[i-1].tick),renderCallbacksHz:d.poses.length*1000/d.elapsedMs,physicsTickHz:(d.acks.at(-1).tick-d.acks[0].tick)*1000/(d.acks.at(-1).at-d.acks[0].at),ageMs:stats(d.poses.map(v=>v.age)),playbackMs:stats(d.poses.map(v=>v.playback)),receiveGapMs:stats(d.acks.slice(1).map((v,i)=>v.at-d.acks[i].at)),syncedFraction:d.poses.filter(v=>v.synced).length/d.poses.length}));
 const passed=errors.length===0&&summary.every(v=>v.syncedFraction>.98&&v.strictlyIncreasingTicks&&v.acceptedCount===v.uniqueTicks);
 const result={passed,ships,seconds,seed:1511506142,profiled:!!profileCommand,scope:'Two headless browsers on one PC, host Worker + relay, no WAN. Probe build excludes campaign. Fixture deterministic seed and validated fleet options.',summary,workers,errors,diagnostics:diagnostics.filter(v=>v.at>=phaseAt)};
 await fs.writeFile(path.join(base,`hz-${tag}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({passed,ships,summary,errors,diagnosticCount:result.diagnostics.length},null,2));
 assert.ok(passed,'Browser error, duplicate/reordered ticks, or controls not synchronized for >2% of measured callbacks');
}catch(error){await fs.writeFile(path.join(base,`hz-${tag}-failure.json`),JSON.stringify({error:String(error),errors,workers,diagnostics,bodies:await Promise.all(pages.map(p=>p.locator('body').innerText().catch(()=>'')))},null,2));throw error;}
finally{await browser.close();await app.close();}


