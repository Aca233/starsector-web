import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {verifyRustLanServerBuild} from './lib/rust-lan-server-proof.mjs';

// Narrow production Node authority/asset-loader validation. This cannot qualify
// a browser/source numerical pass or the current whole native source revision.
const base=path.resolve('artifacts/rust-combat-core-20261008/verification-lan-authority'),wasm=await fs.readFile(path.join(base,'production.wasm'));
const sha256=createHash('sha256').update(wasm).digest('hex'),assets=path.join(base,'server-assets'),runtime=path.join(base,'server-runtime','authority-worker.mjs');
const buildProof=await verifyRustLanServerBuild(base,sha256);
await fs.mkdir(path.join(assets,'game-assets','runtime'),{recursive:true});
await fs.copyFile('public/game-assets/asset-manifest.json',path.join(assets,'game-assets','asset-manifest.json'));
await fs.writeFile(path.join(assets,'game-assets','runtime','combat-core.wasm'),wasm);
await fs.writeFile(path.join(assets,'game-assets','runtime','combat-core.json'),JSON.stringify({sha256,bytes:wasm.length}));
const {rustLanAcceptanceMatches}=await import(pathToFileURL(path.join(base,'node-check.mjs')).href),match=rustLanAcceptanceMatches()[0];
let worker,timer,ready=false,lastFrame,snapshots=0,deployed=false,replies=0,diagnostics;
try{
 const result=await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('Actual Node authority timed out')),20000);
  worker=new Worker(runtime,{workerData:{match,assets},execArgv:[]});
  worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('Actual Node authority exit '+code));});
  worker.on('message',message=>{try{
   if(message.diagnostics)diagnostics=message.diagnostics;
   if(message.type==='error')throw Error(message.message);
   if(message.type==='ready'){
    if(message.authority?.kind!=='rust-wasm'||message.authority.sha256!==sha256)throw Error('Actual Node loader module mismatch');ready=true;
    for(const p of match.players){worker.postMessage({type:'presence',seat:p.seat,connected:true,online:true});worker.postMessage({type:'input',seat:p.seat,input:{seq:1,keys:1,aim:[0,0],firing:false,pointerActive:false,actions:[]}});}worker.postMessage({type:'start'});
   }
   if(message.type==='deployment-result'){replies++;if(!message.ok)throw Error('Actual Node deployment '+message.message);}
   if(message.type!=='snapshot')return;
   const frame=message.binary?decodeBinaryFrame(message.binary):JSON.parse(message.json);lastFrame=frame;snapshots++;
   if(frame.displayVersion!==2||frame.tick!==message.tick||!frame.displayDefinitions?.length||frame.ships.length!==6||Object.keys(frame.controlled).length!==3)throw Error('Actual Node display publication differs');
   worker.postMessage({type:'snapshot-consumed',tick:frame.tick});
   if(ready&&frame.tick>=3&&!deployed){deployed=true;const team=match.players.find(p=>p.seat===0).team;
    const reserve=frame.deployment.rows.find(r=>r.teamId===team&&r.status==='reserve');if(!reserve)throw Error('Actual Node reserve absent');worker.postMessage({type:'deployment',seat:0,requestId:'server-reserve',operation:'deploy',ids:[reserve.id]});}
   if(frame.tick>=60&&replies===1){if(match.players.some(p=>frame.acknowledged[p.seat]!==1))throw Error('Actual Node ACK mismatch');resolve({passed:true,tick:frame.tick,snapshots,replies,actualServerAuthorityWorker:true,actualLocalAssetLoader:true,wasmSHA256:sha256,diagnostics});}
  }catch(error){reject(error);}});
 });
 const proof=await verifyRustLanServerBuild(base,sha256);if(proof.bundleSHA256!==buildProof.bundleSHA256)throw Error('Actual Node authority rebuilt during check');Object.assign(result,{buildProof:{...proof,sourceFingerprints:undefined}});
 await fs.writeFile(path.join(base,'server-loader-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){const result={passed:false,error:String(error),stack:error?.stack,ready,tick:lastFrame?.tick,snapshots,replies,diagnostics,wasmSHA256:sha256};await fs.writeFile(path.join(base,'server-loader-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=1;}
finally{clearTimeout(timer);if(worker){worker.postMessage({type:'stop'});await worker.terminate();}}
