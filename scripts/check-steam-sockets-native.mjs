// Opt-in Windows native ABI/ownership test. Compiles a local fixture against
// pinned public SDK headers, WITHOUT linking or initializing the Steam SDK.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { bindSteamSocketsV012 } from '../server/steam/sockets-v012.mjs';
import { bindSteamSocketsLifecycleV012 } from '../server/steam/sockets-lifecycle-v012.mjs';
import { checkNativeLifecycle } from './check-steam-sockets-native-lifecycle.mjs';
import { checkNativeSession } from './check-steam-sockets-native-session.mjs';
import { checkNativeRoom } from './check-steam-sockets-native-room.mjs';
import { checkNativeStatus } from './check-steam-sockets-native-status.mjs';
import { bindSteamSocketsStatusV012 } from '../server/steam/sockets-status-v012.mjs';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Windows x64 native fixture only');
const ref = '494c2d680b9e47bbc369496b57568f44ef2f6796';
const sourcePaths=['server/steam/sockets-state-codec.mjs','server/steam/sockets-flight-budget.mjs','scripts/check-steam-sockets-native-room.mjs','server/steam/sockets-room.mjs','server/steam/reliable-queue.mjs','scripts/fixtures/steam-sockets-v012-shim.cpp','scripts/fixtures/steam-sockets-lifecycle-v012-shim.h','scripts/check-steam-sockets-native.mjs','scripts/check-steam-sockets-native-lifecycle.mjs','server/steam/sockets-v012.mjs','server/steam/sockets-lifecycle-v012.mjs','server/steam/sockets-wire.mjs','server/steam/sockets-session.mjs','server/steam/anchored-snapshots.mjs','server/steam/snapshot-delta.mjs','server/steam/packet-codec.mjs','scripts/check-steam-sockets-native-session.mjs','scripts/fixtures/steam-sdk-v163-headers.json','scripts/fixtures/steam-sockets-status-v012-shim.h','server/steam/sockets-status-v012.mjs','scripts/check-steam-sockets-native-status.mjs','server/steam/sockets-room-pacer.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex')])));
const verifiedCache=process.argv.includes('--verified-headers');
const headerManifest=JSON.parse(await fs.readFile(path.join(root,'scripts/fixtures/steam-sdk-v163-headers.json'),'utf8'));
assert.equal(headerManifest.ref,ref);
const headers = path.join(root, 'artifacts', 'steam-sdk-headers-' + ref.slice(0,8));
await fs.mkdir(headers, {recursive:true});
const pending = ['isteamnetworkingsockets.h','isteamnetworkingutils.h'], pinned = new Map();
while (pending.length) {
  const name = pending.pop(); if (pinned.has(name)) continue;
  if (!/^[a-zA-Z0-9_]+\.h$/.test(name) || pinned.size >= 32) throw Error('Unexpected SDK include');
  const url = 'https://raw.githubusercontent.com/rlabrecque/SteamworksSDK/' + ref + '/public/steam/' + name;
  // Both online and explicit offline-cache mode verify the checked-in pinned
  // hash manifest. Edited/stale headers cannot silently become ABI evidence.
  let text;
  if(verifiedCache)text=await fs.readFile(path.join(headers,name),'utf8');
  else {const response=await fetch(url);if(!response.ok)throw Error('SDK header fetch failed: '+response.status);text=await response.text();}
  const hash=createHash('sha256').update(text).digest('hex');
  assert.equal(hash,headerManifest.sha256[name],'Only exact pinned SDK header bytes are acceptable: '+name);
  if(!verifiedCache)await fs.writeFile(path.join(headers,name),text);
  pinned.set(name,{url,sha256:hash});
  for (const match of text.matchAll(/^#include\s+"([a-zA-Z0-9_]+\.h)"/gm)) pending.push(match[1]);
}
const output = await fs.mkdtemp(path.join(root,'artifacts','steam-sockets-native-'));
const vswhere = path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio','Installer','vswhere.exe');
const vs = spawnSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true});
if(vs.status!==0||!vs.stdout.trim())throw Error('Installed MSVC x64 build tools required');
const setup = path.join(vs.stdout.trim(),'VC','Auxiliary','Build','vcvars64.bat');
const source = path.join(root,'scripts','fixtures','steam-sockets-v012-shim.cpp'), dll=path.join(output,'sockets-v012-shim.dll');
// One cmd invocation for compiler environment/build only; no deletes or moves.
const command = `call "${setup}" >nul && cl /nologo /EHsc /std:c++17 /LD /I"${headers}" "${source}" /Fo"${path.join(output,'shim.obj')}" /Fe"${dll}"`;
const compile = spawnSync('cmd.exe',['/d','/s','/c',command],{cwd:output,encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true,timeout:120000});
await fs.writeFile(path.join(output,'compile.log'),(compile.stdout??'')+(compile.stderr??''));
if(compile.status!==0)throw Error('Native fixture compile failed: '+compile.stdout+compile.stderr);
const require=createRequire(import.meta.url),koffi=require('koffi'),library=koffi.load(dll);
const marker=library.func('int SW_TestIsOfflineShim()');
assert.equal(marker(),0x53573012,'Never invoke open/send on an actual Steam library in this offline test');
const metric=library.func('int SW_TestMetric(int index)'),byte=library.func('int SW_TestByte(int index)');
const next=library.func('void SW_TestNextResult(int64_t result)');
const queue=library.func('void SW_TestEnqueue(uint32_t connection, uint64_t identity, int lane, int flags, const void *data, int bytes)');
let assertions=0;const check=(actual,expected,label)=>{assertions++;assert.deepEqual(actual,expected,label);};
const id='76561198000000002', guard=new Set([id]), io=bindSteamSocketsV012(library,koffi);
check(metric(0),0,'binding is inert');
assert.throws(()=>io.open({sdkInitialized:false,allowed:()=>true}));assertions++;
io.open({sdkInitialized:true,allowed:remote=>guard.has(remote)});
check(io.attach(999,id),false,'native identity mismatch rejects wrong handle association');
check(io.attach(17,id),true,'attach owned synthetic connection');check(metric(3),1,'three strict-priority native lanes');
const payload=Buffer.from(Array.from({length:256},(_,i)=>i));
for(const [kind,lane,flags]of[['control',0,9],['anchor',1,9],['snapshot',2,5]]){
 next(9007199254740995n);
 check(io.send(17,payload,kind),{status:'accepted',messageNumber:'9007199254740995'},'uint64 message number preserved');
 check(metric(0),0,'SDK owns/releases sent allocation');check(metric(6),flags,'correct modern flags');check(metric(7),lane,'correct lane');check(metric(8),17,'native connection field');check(metric(9),256,'native size');
 for(let i=0;i<256;i++)check(byte(i),i,'SDK-owned payload copied exactly');
}
for(const [code,kind,status]of[[-41,'snapshot','dropped'],[-41,'control','error'],[-25,'snapshot','backpressure'],[-3,'anchor','error']]){
 next(code);check(io.send(17,payload,kind).status,status,'return code semantics');check(metric(0),0,'negative result also transfers ownership');
}
queue(17,BigInt(id),0,8,payload,payload.length);queue(17,BigInt(id),2,0,payload,payload.length);queue(17,76561198000000003n,0,8,payload,payload.length);
const received=io.receive();check(received.map(m=>m.kind),['control','snapshot'],'native identity mismatch dropped');check(metric(0),0,'all received allocations released');
for(const m of received)check(m.data,payload,'payload copies remain valid after native poison/free');
guard.clear();const sends=metric(2);check(io.send(17,payload,'snapshot').status,'error','revoked membership');check(metric(2),sends,'no unauthorized native send');
queue(17,BigInt(id),0,8,payload,payload.length);check(io.receive(),[],'revoked membership inbound');check(metric(0),0,'discarded allocation released');guard.add(id);
// JS-side preparation failure must release a genuine native allocation exactly
// once, before SendMessages takes ownership. The SDK fixture poisons/frees it.
const prepareFail=bindSteamSocketsV012(library,{decode:koffi.decode,encode(){throw Error('private native detail');}});
prepareFail.open({sdkInitialized:true,allowed:()=>true});prepareFail.attach(18,id);
check(prepareFail.send(18,payload,'control').reason,'native-prepare-failed','bounded exception');check(metric(0),0,'prepare failure release');prepareFail.close();
// Receive exception on first item must still release the rest of the native batch.
const readFail=bindSteamSocketsV012(library,{decode(){throw Error('private native detail');},encode:koffi.encode});
readFail.open({sdkInitialized:true,allowed:()=>true});readFail.attach(19,id);
queue(19,BigInt(id),0,8,payload,payload.length);queue(19,BigInt(id),0,8,payload,payload.length);
check(readFail.receive(),[],'no partial batches after ABI failure');check(metric(0),0,'all native batch entries released after exception');check(readFail.diagnostics().available,false,'ABI failure quarantined');readFail.close();
io.close();check(metric(0),0,'no outstanding native allocations');check(metric(4),0,'all connections detached');check(metric(5),3,'all fixture poll groups released');
const lifecycle=await checkNativeLifecycle({library,memory:koffi,check,metric,queue,next});
const session=checkNativeSession({library,memory:koffi,check,metric,queue,next});
const room=checkNativeRoom({library,memory:koffi,check,metric,queue,next});
const status=checkNativeStatus({library,memory:koffi,check,metric});
// The actual bundled DLL only has its fixed symbols BOUND. Accessors, networking
// initialization, sends, reads, callback registration and session calls stay at 0.
const steamDll=path.join(path.dirname(require.resolve('steamworks.js')),'dist','win64','steam_api64.dll');
const steamLibrary=koffi.load(steamDll),bound=[];
bindSteamSocketsV012({func(signature){bound.push(signature);return steamLibrary.func(signature);}},koffi);
bindSteamSocketsLifecycleV012({func(signature){bound.push(signature);return steamLibrary.func(signature);}},koffi,{io:{}});
bindSteamSocketsStatusV012({func(signature){bound.push(signature);return steamLibrary.func(signature);}});
for(const [p,hash]of Object.entries(sourceHashes))assert.equal(createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex'),hash,'Source changed during native run: '+p);
const report={headerSource:verifiedCache?'pinned-sha256-cache':'pinned-remote-sha256',lifecycle,session,room,status,sourceHashes,createdAt:new Date().toISOString(),scope:'Offline native C++ ABI/ownership fixture plus inert real-DLL symbol binding, NOT a Steam networking test',sdkRef:ref,headers:Object.fromEntries(pinned),output,dll,assertions,liveNativeAllocations:metric(0),nativeReleases:metric(1),nativeFixtureSends:metric(2),boundRealExports:new Set(bound.map(s=>s.match(/SteamAPI_\w+/)[0])).size,boundRealBindingCalls:bound.length,steamSdkInitialized:false,steamNativeSends:0,steamNativeReceives:0,sourceSha256:createHash('sha256').update(await fs.readFile(source)).digest('hex'),boundarySha256:createHash('sha256').update(await fs.readFile(path.join(root,'server/steam/sockets-v012.mjs'))).digest('hex')};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(root,'artifacts','steam-sockets-native-latest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,headers:undefined},null,2));
