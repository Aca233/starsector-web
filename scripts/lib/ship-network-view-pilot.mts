import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {assetManager} from '../../src/engine/assets/AssetResolver';
import {createLanWorld} from '../../src/network/LanWorld';
import {configureHostCosmetics} from '../../src/network/HostSnapshot';
import {pilotCaptureShips,pilotApplyShips} from '../../src/network/AuthorityCombatSnapshot';
import {SHIP_VIEW_ROOT_OMISSIONS,SHIP_VIEW_FLUX_OMISSIONS,ShipViewPublisher,ShipViewReceiver} from '../../src/network/experimental/ShipNetworkView';
import {encodeProjectedBinaryFrame,encodeBinaryState,decodeBinaryState} from '../../src/network/BinarySnapshot.mjs';
import {isLanDelta,LanDeltaReceiver} from '../../src/network/LanBinaryDelta.mjs';
import {LanDeltaSender,lanDeltaTarget} from '../../server/LanDeltaTransport.mjs';
import fs from 'node:fs';import path from 'node:path';
export async function initAssets(){const root=path.resolve('public');globalThis.fetch=async(input:any)=>{const file=path.resolve(root,String(input).replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(file));};await assetManager.ensureManifestLoaded();}
export function world(count=2){const e=createLanWorld({id:'ship-view',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(Math.floor((count-2)/2)).fill('hammerhead'),Array(Math.ceil((count-2)/2)).fill('hammerhead')]}} as any).engine;configureHostCosmetics(e,true,true,true);return e;}
export function take(engine:any,count:number,tick:number,remainder=false){return pilotCaptureShips(engine,engine.allCapitalShips.slice(0,count),tick,remainder?SHIP_VIEW_ROOT_OMISSIONS:undefined,remainder?SHIP_VIEW_FLUX_OMISSIONS:undefined);}
export {pilotApplyShips};
export function channel(engine:any,candidate:boolean,peers=1,compression=false){
 const pub=new ShipViewPublisher(17),viewers=Array.from({length:peers},()=>world(engine.allCapitalShips.length));
 const receivers=viewers.map(e=>({fields:new ShipViewReceiver(17,new Map(e.allCapitalShips.map(s=>[s.id,s]))),bytes:new LanDeltaReceiver()}));
 const senders=Array.from({length:peers},()=>new LanDeltaSender({ordered:true,motionReference:true}));let seq=0;
 return {viewers,stats:()=>({senders:senders.map(s=>s.stats()),publisher:pub.stats(),receivers:receivers.map(r=>r.fields.stats())}),step(count:number,tick:number){
  const time=()=>performance.now(),metrics:any={capture:0,fieldView:0,encode:0,delta:0,compress:0,inflate:0,decode:0,apply:0};let t=time();
  const frame=take(engine,count,tick,candidate);metrics.capture=time()-t;t=time();const fields=candidate?pub.prepare(engine.allCapitalShips.slice(0,count).map(ship=>({ship,generation:1})),tick):null;
  metrics.fieldView=time()-t;t=time();
  const encoded=encodeBinaryState('ship-view',++seq,encodeProjectedBinaryFrame(frame,true));metrics.encode=time()-t;t=time();
  const target=lanDeltaTarget(encoded,seq),choices=senders.map(s=>target?s.prepare(target):null);
  const packets=choices.map(c=>{const main=c?.packet??encoded;if(!fields)return main;const combined=new Uint8Array(4+main.length+fields.bytes.length);new DataView(combined.buffer).setUint32(0,main.length);combined.set(main,4);combined.set(fields.bytes,4+main.length);return combined;});
  choices.forEach((c,i)=>{if(c)senders[i].commit(c);});if(fields)pub.commit(fields);metrics.delta=time()-t;
  t=time();const compressed=compression?packets.map(p=>deflateRawSync(p,{level:6})):packets;metrics.compress=time()-t;
  for(let i=0;i<peers;i++){
   t=time();const bytes=compression?inflateRawSync(compressed[i]):packets[i];metrics.inflate+=time()-t;t=time();let main=bytes,core=null;
   if(candidate){const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);main=bytes.subarray(4,4+length);core=receivers[i].fields.prepare(bytes.subarray(4+length));}
   const decoded=decodeBinaryState(isLanDelta(main)?receivers[i].bytes.decode(main):main);
   if(core&&(core.tick!==decoded.frame.tick||core.seq!==decoded.seq))throw Error('Pilot transaction mismatch');
   metrics.decode+=time()-t;t=time();pilotApplyShips(viewers[i],decoded.frame,seq===1,core?()=>receivers[i].fields.commit(core):undefined);metrics.apply+=time()-t;
  }
  return {metrics,packets,compressed,frame,changedFields:fields?.changedFields??null};
 }};
}
