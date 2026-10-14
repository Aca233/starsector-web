import { rustLanAcceptanceMatches } from './rust-lan-authority-check';
import { initializeLanDisplayWorld, applyLanDisplaySnapshot } from '../../src/network/LanDisplaySnapshot';
import { decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { assetManager } from '../../src/engine/assets/AssetResolver';
import assetManifest from '../../public/game-assets/asset-manifest.json';
import type { CombatSnapshot } from '../../src/network/CombatSnapshot';

/** Actual production host.worker, actual binary receiver and real timer loop. */
export async function checkRustLanHost(sha256:string){
 await assetManager.loadManifest('data:application/json,'+encodeURIComponent(JSON.stringify(assetManifest)));
 const module=await WebAssembly.compile(await(await fetch('/core.wasm')).arrayBuffer()),cases:unknown[]=[],failures:unknown[]=[];
 for(const match of rustLanAcceptanceMatches().slice(0,2)){
  try{
  const result=await new Promise<unknown>((resolve,reject)=>{
   const worker=new Worker('/host.mjs',{type:'module'}),timer=setTimeout(()=>finish(Error('Actual LAN host timeout')),45000);
   const views=new Map<number,ReturnType<typeof initializeLanDisplayWorld>>(),replies:unknown[]=[],sent=new Set<string>(),snapshots:number[]=[];
   let ready=false,startedAt=0,neutralTick=-1,neutral=false,resumedTick=-1,resumed=false,deployId='',deployed=false,creditHeld=false,heldTick=-1,latest:CombatSnapshot|undefined,recoveries=0,sequence=2,diagnostics:unknown;
   let lifecycle:'initial'|'edge'|'replay'|'disconnect'|'reconnect'|'stale'|'done'='initial',phaseTick=0,phaseAt=0,phaseSequence=0,groupIndex=-1,autofireBefore=false,disconnectedAI=false,ackAndEdgeReplay=false,staleNeutral=false;
   function finish(error?:Error){clearTimeout(timer);worker.postMessage({type:'stop'});worker.terminate();const elapsedMs=startedAt?performance.now()-startedAt:0,completedHz=elapsedMs>0?(latest?.tick??0)*1000/elapsedMs:0;const evidence={match:match.id,ready,tick:latest?.tick,snapshots:snapshots.length,seats:[...views.keys()],neutral,resumed,deployed,replies:replies.length,recoveries,elapsedMs,completedHz,disconnectedAI,ackAndEdgeReplay,staleNeutral,diagnostics,simulationMs:latest?.simulationMs,captureMs:latest?.captureMs,encodeMs:latest?.encodeMs,completeProjectileSnapshot:true};if(!error&&recoveries)error=Error('Actual LAN host recovered during playable acceptance');if(!error&&!match.id.includes('sparse')&&((latest?.tick??0)<600||completedHz<55))error=Error('Actual large LAN host did not sustain sixty-hertz simulation');if(error)reject(Error(String(error)+' '+JSON.stringify(evidence)));else resolve(evidence);}
   function post(value:unknown){worker.postMessage(value);}
   worker.onerror=event=>finish(Error(event.message));
   worker.onmessage=event=>{try{const m=event.data;
    if(m.diagnostics)diagnostics=m.diagnostics;
    if(m.type==='error')throw Error(m.message);
    if(m.type==='recovered'){recoveries++;for(const p of match.players){post({type:'presence',seat:p.seat,connected:true,online:true});post({type:'input',seat:p.seat,input:{seq:++sequence,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]}});}return;}
    if(m.type==='ready'){if(m.authority?.kind!=='rust-wasm'||m.authority.sha256!==sha256)throw Error('Wrong authority module');ready=true;
     for(const p of match.players){post({type:'presence',seat:p.seat,connected:true,online:true});post({type:'input',seat:p.seat,input:{seq:1,keys:p.seat===0?1:32,aim:[0,0],firing:false,pointerActive:true,actions:[{id:1,kind:'shield'}]}});}startedAt=performance.now();post({type:'start'});return;}
    if(m.type==='deployment-result'){replies.push(m);if(!m.ok&&m.requestId==='reserve')throw Error('Actual host deployment: '+m.message);return;}
    if(m.type!=='snapshot')return;
    if(m.visualBinary)throw Error('Rust host emitted stripped projectile variant');
    const frame=m.binary?decodeBinaryFrame(m.binary):JSON.parse(m.json)as CombatSnapshot;latest=frame;snapshots.push(frame.tick);
    if(frame.projectileVisuals!==undefined)throw Error('Rust host omitted full projectile facts');
    if(!views.size)for(const p of match.players)views.set(p.seat,initializeLanDisplayWorld(p.seat,frame));else for(const v of views.values())applyLanDisplaySnapshot(v.world,frame);
    const guest=match.players.find(p=>p.seat!==0)!,guestShip=views.get(guest.seat)!.world.playerShip;
    if(ready&&frame.tick>=3&&!sent.has('neutral')){sent.add('neutral');neutralTick=frame.tick;post({type:'presence',seat:guest.seat,connected:true,online:false});}
    else if(neutralTick>=0&&frame.tick>neutralTick&&!neutral){if(guestShip.throttle!==0||guestShip.strafeInput!==0||guestShip.turnInput!==0||guestShip.isFiringMain)throw Error('Syncing seat failed neutral controls');neutral=true;resumedTick=frame.tick;post({type:'presence',seat:guest.seat,connected:true,online:true});post({type:'input',seat:guest.seat,input:{seq:++sequence,keys:16,aim:[0,0],firing:false,pointerActive:true,actions:[]}});}
    if(neutral&&frame.tick>resumedTick&&frame.acknowledged[guest.seat]>=2)resumed=true;
    if(ready&&frame.tick>=8&&!sent.has('deployment')){sent.add('deployment');const team=views.get(0)!.world.playerShip.teamId;deployId=frame.deployment!.rows.find(r=>r.teamId===team&&r.status==='reserve')?.id??'';if(!deployId)throw Error('Host reserve absent');
     post({type:'deployment',seat:0,requestId:'empty',operation:'deploy',ids:[]});post({type:'deployment',seat:0,requestId:'empty',operation:'deploy',ids:[]});post({type:'deployment',seat:0,requestId:'human',operation:'retreat',ids:[guestShip.id]});post({type:'deployment',seat:0,requestId:'reserve',operation:'deploy',ids:[deployId]});}
    if(deployId&&frame.deployment!.rows.find(r=>r.id===deployId)?.status==='deployed')deployed=true;
    if(frame.tick>=18&&neutral&&resumed&&deployed&&replies.length===4&&lifecycle==='initial'){const empty=replies.filter((r:any)=>r.requestId==='empty')as any[],human=replies.find((r:any)=>r.requestId==='human')as any;if(empty.length!==2||JSON.stringify(empty[0])!==JSON.stringify(empty[1])||empty[0].ok||human?.ok||human?.message!=='不能替其他真人玩家下达撤退。')throw Error('Actual host request receipts differ');
     if(match.id.includes('sparse')){const group=guestShip.weaponGroups.find(g=>g.weaponSlotIds.length);if(!group)throw Error('Guest has no real weapon group');groupIndex=group.index;autofireBefore=group.isAutofire;phaseTick=frame.tick;phaseSequence=++sequence;lifecycle='edge';post({type:'input',seat:guest.seat,input:{seq:phaseSequence,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[{id:10,kind:'autofire',value:groupIndex}]}});post({type:'input',seat:999,input:{seq:1,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]}});}else if(frame.tick>=600){finish();return;}}
    else if(lifecycle==='edge'&&frame.acknowledged[guest.seat]>=phaseSequence&&frame.tick>phaseTick){if(guestShip.weaponGroups.find(g=>g.index===groupIndex)?.isAutofire===autofireBefore)throw Error('Accepted command edge absent');lifecycle='replay';phaseTick=frame.tick;phaseSequence=++sequence;
     post({type:'input',seat:guest.seat,input:{seq:phaseSequence,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[{id:10,kind:'autofire',value:groupIndex}]}});
     post({type:'input',seat:guest.seat,input:{seq:phaseSequence-1,keys:255,aim:[0,0],firing:true,pointerActive:true,actions:[{id:11,kind:'autofire',value:groupIndex}]}});}
    else if(lifecycle==='replay'&&frame.acknowledged[guest.seat]>=phaseSequence&&frame.tick>phaseTick){if(guestShip.weaponGroups.find(g=>g.index===groupIndex)?.isAutofire===autofireBefore||guestShip.throttle!==0||guestShip.isFiringMain)throw Error('Old input or edge replayed');ackAndEdgeReplay=true;lifecycle='disconnect';phaseTick=frame.tick;
     post({type:'presence',seat:guest.seat,connected:false,online:false});}
    else if(lifecycle==='disconnect'&&frame.tick>=phaseTick+9){if(guestShip.fireControlMode!=='AI')throw Error('Disconnected seat lacks real AI takeover');disconnectedAI=true;lifecycle='reconnect';phaseTick=frame.tick;phaseSequence=++sequence;
     post({type:'presence',seat:guest.seat,connected:true,online:true});post({type:'input',seat:guest.seat,input:{seq:phaseSequence,keys:1,aim:[0,0],firing:false,pointerActive:false,actions:[]}});}
    else if(lifecycle==='reconnect'&&frame.tick>phaseTick&&frame.acknowledged[guest.seat]>=phaseSequence){if(guestShip.fireControlMode!=='MANUAL'||guestShip.throttle!==1)throw Error('Reconnect input failed');lifecycle='stale';phaseAt=performance.now();phaseTick=frame.tick;}
    else if(lifecycle==='stale'&&performance.now()-phaseAt>=600&&frame.tick>phaseTick){if(guestShip.fireControlMode!=='MANUAL'||guestShip.throttle!==0||guestShip.turnInput!==0||guestShip.strafeInput!==0||guestShip.isFiringMain)throw Error('Expired input failed neutral controls');staleNeutral=true;lifecycle='done';finish();return;}
    // Exercise one held publication credit while physics keeps advancing.
    if(ready&&frame.tick>=2&&!creditHeld){creditHeld=true;heldTick=frame.tick;setTimeout(()=>post({type:'snapshot-consumed',tick:heldTick}),80);}else post({type:'snapshot-consumed',tick:frame.tick});
   }catch(error){finish(error as Error);}};
   post({type:'init',backend:'rust-wasm',rustModule:{module,sha256},match,hidden:false,binarySnapshots:true,authoritySummaries:true,visualState:true,motionState:true,combatState:true});
  });cases.push(result);
  }catch(error){failures.push({match:match.id,error:String(error),stack:(error as Error).stack});}
 }
 return {passed:failures.length===0,cases,failures,actualHostWorker:true,actualDisplayReceiver:true,headless:true};
}
