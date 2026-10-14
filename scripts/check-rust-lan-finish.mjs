import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {validateBattleReport} from '../src/network/battle-report.mjs';
import {verifyRustLanServerBuild} from './lib/rust-lan-server-proof.mjs';

// The real production Node worker completes a real retreat across the arena.
// No pose/HP edits, shortened arena, synthetic result or accelerated timer.
const base=path.resolve('artifacts/rust-combat-core-20261008/verification-lan-authority');
const wasm=await fs.readFile(path.join(base,'production.wasm')),sha256=createHash('sha256').update(wasm).digest('hex');
const buildProof=await verifyRustLanServerBuild(base,sha256);
const assets=path.join(base,'server-assets'),runtime=path.join(base,'server-runtime','authority-worker.mjs');
await fs.mkdir(path.join(assets,'game-assets','runtime'),{recursive:true});
await fs.copyFile('public/game-assets/asset-manifest.json',path.join(assets,'game-assets','asset-manifest.json'));
await fs.writeFile(path.join(assets,'game-assets','runtime','combat-core.wasm'),wasm);
await fs.writeFile(path.join(assets,'game-assets','runtime','combat-core.json'),JSON.stringify({sha256,bytes:wasm.length}));
const {rustLanAcceptanceMatches}=await import(pathToFileURL(path.join(base,'node-check.mjs')).href);
const match=structuredClone(rustLanAcceptanceMatches()[2]),hull=match.players[1].hull;
match.id='rust-lan-real-retreat-finish';
for(const player of match.players)player.hull=hull;
match.options.aiHulls=match.options.aiHulls.map(hulls=>hulls.map(()=>hull));
const guest=match.players.find(player=>player.seat!==0),host=match.players.find(player=>player.seat===0);
let worker,timer,ready=false,lastFrame,snapshots=0,sent=false,replies=0,diagnostics,lastMessage='',retreating=false,retreated=false;
const motionEvidence=()=>lastFrame?.ships.map(ship=>({id:ship.id,pos:ship.state.pos,vel:ship.state.vel,facing:ship.state.facingRad,throttle:ship.state.throttle,turn:ship.state.turnInput,engines:ship.state.engineController,stats:ship.state.motionStats}));
try{
 const result=await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('Actual Node retreat finish timed out')),90000);
  worker=new Worker(runtime,{workerData:{match,assets},execArgv:[]});
  worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('Actual Node authority exit '+code));});
  worker.on('message',message=>{try{
   const previousMessage=lastMessage;lastMessage=message.type;
   if(message.diagnostics)diagnostics=message.diagnostics;
   if(message.type==='error')throw Error(message.message);
   if(message.type==='recovered')throw Error('Actual retreat finish required authority recovery');
   if(message.type==='ready'){
    if(message.authority?.kind!=='rust-wasm'||message.authority.sha256!==sha256)throw Error('Actual Node loader module mismatch');ready=true;
    for(const player of match.players){worker.postMessage({type:'presence',seat:player.seat,connected:true,online:true});worker.postMessage({type:'input',seat:player.seat,input:{seq:1,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]}});}worker.postMessage({type:'start'});
   }
   if(message.type==='deployment-result'){replies++;if(!message.ok)throw Error('Actual Node withdrawal '+message.message);}
   if(message.type==='snapshot'){
    const frame=message.binary?decodeBinaryFrame(message.binary):JSON.parse(message.json);lastFrame=frame;snapshots++;
    if(frame.tick%120===0)void fs.writeFile(path.join(base,'server-finish-progress.json'),JSON.stringify({tick:frame.tick,motion:motionEvidence(),layouts:frame.layouts},null,2));
    if(frame.tick!==message.tick||frame.displayVersion!==2)throw Error('Actual terminal publication differs');
    worker.postMessage({type:'snapshot-consumed',tick:frame.tick});
    const guestId=frame.controlled[guest.seat],guestRow=frame.deployment.rows.find(row=>row.id===guestId);
    retreating||=guestRow?.status==='retreating';retreated||=guestRow?.status==='retreated';
    if(ready&&frame.tick>=3&&!sent){sent=true;
     worker.postMessage({type:'deployment',seat:host.seat,requestId:'finish-host-reserves',operation:'withdraw',ids:[]});
     worker.postMessage({type:'deployment',seat:guest.seat,requestId:'finish-guest-withdraw',operation:'withdraw',ids:[guestId]});
    }
   }
   if(message.type==='finished'){
    if(previousMessage!=='snapshot'||!lastFrame||lastFrame.tick!==message.report.tick)throw Error('Terminal snapshot did not precede finished on same FIFO');
    const report=validateBattleReport(message.report,match,lastFrame);
    if(!retreating||!retreated||replies!==2||message.winner!==host.team||report.ships.some(row=>row.team===guest.team&&row.status!=='retreated')||report.ships.find(row=>row.seat===host.seat)?.status!=='deployed')throw Error('Actual retreat/winner/settlement differs');
    resolve({passed:true,actualServerAuthorityWorker:true,actualLocalAssetLoader:true,actualTimedArenaRetreat:true,terminalSnapshotFIFO:true,tick:report.tick,seconds:report.seconds,snapshots,replies,winner:message.winner,ships:report.ships,wasmSHA256:sha256});
   }
  }catch(error){reject(error);}});
 });
 const proof=await verifyRustLanServerBuild(base,sha256);if(proof.bundleSHA256!==buildProof.bundleSHA256)throw Error('Actual Node authority rebuilt during check');Object.assign(result,{buildProof:{...proof,sourceFingerprints:undefined}});
 await fs.writeFile(path.join(base,'server-finish-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){const result={passed:false,error:String(error),stack:error?.stack,ready,tick:lastFrame?.tick,snapshots,replies,retreating,retreated,motion:motionEvidence(),layouts:lastFrame?.layouts,diagnostics,wasmSHA256:sha256};await fs.writeFile(path.join(base,'server-finish-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=1;}
finally{clearTimeout(timer);if(worker){worker.postMessage({type:'stop'});await worker.terminate();}}
