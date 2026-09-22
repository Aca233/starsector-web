// Node-produced component bytes -> real Chromium replicas. Always headless.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {prepareCombatState,CombatWireSender,CombatWireReceiver,readCombatEnvelope} from '../server/CriticalCombatWire.mjs';
import {createRequire} from 'node:module';import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)('playwright');
const folder='artifacts/network-stream-20260921/particle-paired-exact/recipe',manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
const components=JSON.parse(fs.readFileSync('artifacts/network-stream-20260921/phase11/weapon-replay.json','utf8'));
const baseline=fs.readFileSync(path.join(folder,manifest.rows[0].name)).toString('base64');
const sender=new CombatWireSender(),receiver=new CombatWireReceiver();
const delivered=components.rows.map(row=>{
 const target=prepareCombatState(Buffer.from(row.data,'base64')),choice=sender.prepare(target,'browser-check','scope');
 const message=receiver.decode(readCombatEnvelope(choice.data));assert.deepEqual(Buffer.from(message.data,'base64'),target.bytes);assert.ok(sender.commit(choice));
 return {...row,data:message.data};
});
assert.ok(sender.spatial>0);
const rows=delivered.filter((_,i)=>i>0&&i%12===1).map(row=>({...row,world:fs.readFileSync(path.join(folder,row.name)).toString('base64')}));
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:640,height:360}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__weapon_check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body>Weapon replica check</body>'}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__weapon_check.html`);
 const result=await page.evaluate(async({match,baseline,rows})=>{
  window.__LAN_BUILD_ID__='weapon-parity';
  const {assetManager}=await import('/src/engine/assets/AssetResolver.ts');await assetManager.ensureManifestLoaded();
  const {createLanWorld}=await import('/src/network/LanWorld.ts'),{applyCombatSnapshot}=await import('/src/network/CombatSnapshot.ts');
  const {decodeBinaryState}=await import('/src/network/BinarySnapshot.mjs');
  const {CriticalCombatReplica}=await import('/src/network/CriticalCombatReplica.ts');
  const {captureWeaponPresentation}=await import('/src/network/WeaponPresentationReplica.ts');
  const {encodeWeaponState}=await import('/src/network/WeaponPresentationState.mjs');
  const {decodeCombatState}=await import('/src/network/CriticalCombatState.mjs');
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),base=decodeBinaryState(bytes(baseline)).frame;
  const source=createLanWorld(match).engine,view=createLanWorld(match).engine,replica=new CriticalCombatReplica(),times=[];let compared=0,unlimited=0,sustained=0;
  const equal=(a,b,label)=>{if(a.length!==b.length)throw Error(label+' length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(label+' byte '+i);};
  const read=e=>encodeWeaponState(captureWeaponPresentation(e.allCapitalShips.filter(s=>!e.deployment.isReserve(s.id))));
  for(const row of rows){
   const f=decodeCombatState(bytes(row.data));if(!f.weapons)throw Error('Missing weapon component');
   const expected=encodeWeaponState(f.weapons);applyCombatSnapshot(source,decodeBinaryState(bytes(row.world)).frame,false);equal(read(source),expected,'full-world vs Node weapon section');
   applyCombatSnapshot(view,base,false);if(!replica.receive(f,row.tick,base.tick))throw Error('Rejected new component');
   const at=performance.now();replica.apply(view,base.tick);times.push(performance.now()-at);equal(read(view),expected,'independent component apply');
   applyCombatSnapshot(view,base,false);replica.apply(view,base.tick);equal(read(view),expected,'same-tick stale full replay');
   const {weapons:_weapons,...core}=f;if(!replica.receive({...core,tick:f.tick+1},row.tick+1,base.tick))throw Error('Rejected core');replica.apply(view,base.tick,true);equal(read(view),expected,'core-only fallback');
   for(const [,weapons]of f.weapons)for(const w of weapons){if(w[7]===Infinity)unlimited++;if(w[19]===Infinity)sustained++;}
   compared++;
  }
  const sorted=times.sort((a,b)=>a-b);return {compared,unlimited,sustained,applyMs:{p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]}};
 },{match:manifest.match,baseline,rows});
 assert.deepEqual(errors,[]);assert.equal(result.compared,rows.length);assert.ok(result.unlimited>0);assert.ok(result.sustained>0);
 console.log(JSON.stringify({...result,wire:{full:sender.full,delta:sender.delta,temporal:sender.predicted,spatial:sender.spatial},pageErrors:errors,scope:'Exact Node wire roundtrip -> Chromium whole-world and independent weapon replica bytes; no renderer, native UI, network or FPS claim'},null,2));
}finally{await browser?.close();await server.close();}
