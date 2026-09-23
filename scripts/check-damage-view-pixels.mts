import {Vector2} from '../src/engine/math/Vector2';
import {captureCombat as oldCapture,applyCombatSnapshots as oldApply} from 'receiver-fields-control';
import {captureCombat as newCapture,applyCombatSnapshots as newApply} from 'receiver-fields-candidate';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {contentManifestManager} from '../src/engine/content/ContentManifest';
import {createLanWorld} from '../src/network/LanWorld';
import {configureHostCosmetics} from '../src/network/HostSnapshot';
import {drawShipDamageDecals,getDamageGlowRevision} from '../src/engine/render/ShipDamageVisuals';
import {textureCache} from '../src/engine/render/TextureCache';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {normalizedProjection} from './lib/damage-view-oracle.mts';
(globalThis as any).checkDamageViewPixels=async()=>{
 await assetManager.ensureManifestLoaded();await contentManifestManager.ensureLoaded();
 await Promise.all(['cracks','burns','holes'].flatMap(kind=>[0,1].flatMap(variant=>['base','glow'].map(layer=>textureCache.waitForImage(`/game-assets/graphics/damage/damage_${kind}48_${variant}_${layer}.png`)))));
 const world=()=>{const e=createLanWorld({id:'damage-pixels',seed:917,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull:'onslaught'},{id:'p1',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array(10).fill('hammerhead'),Array(10).fill('hammerhead')]}} as any).engine;configureHostCosmetics(e,true,true,true);return e;};
 const take=(e:any,t:number,fn:any=oldCapture)=>fn(e,t,{},0,true,true,true,true,true,true,false,false,false,true,true);
 const canon=(e:any,t:number)=>JSON.stringify(normalizedProjection(take(e,t),true));
 const source=world();for(const ship of source.allCapitalShips){ship.pos.scale(.2);ship.prevPos.copy(ship.pos);ship.fireControlMode='AI';}
 const canvases=[document.createElement('canvas'),document.createElement('canvas')];for(const c of canvases){c.width=c.height=768;document.body.append(c);}
 const contexts=canvases.map(c=>c.getContext('2d',{willReadFrequently:true})!);
 const paint=(ctx:CanvasRenderingContext2D,ship:any,layer:'base'|'glow',scale:number,piece:boolean)=>{
  ctx.clearRect(0,0,768,768);ctx.save();ctx.translate(50,30);const ready=drawShipDamageDecals(ctx,ship,layer,scale,scale,piece?ship.spec.bounds?.map((point:any)=>new Vector2(point.x,point.y)):undefined);ctx.restore();if(!ready)throw Error('Unloaded damage texture');return ctx.getImageData(0,0,768,768).data;
 };
 const results=[];let a=world(),b=world(),picture:any;
 for(let tick=1;tick<=900;tick++){
  source.fixedUpdate(1/60);if(![300,600,900].includes(tick))continue;
  if(tick===900){a=world();b=world();} // A cold rejoin; both earlier frames are deliberately absent.
  const x=take(source,tick),y=take(source,tick,newCapture);
  oldApply(a,[decodeBinaryFrame(encodeProjectedBinaryFrame(x,true))],true,undefined,{nativeTargeting:true,nativeProjection:true});
  newApply(b,[decodeBinaryFrame(encodeProjectedBinaryFrame(y,true))],true,undefined,{nativeTargeting:true,nativeProjection:true});
  if(canon(a,tick)!==canon(b,tick))throw Error('Complete P1 mismatch before pixels');
  const ordered=a.allCapitalShips.map((ship,index)=>({ship,index})).sort((x,y)=>y.ship.scorchMarks.length-x.ship.scorchMarks.length);
  const selected=ordered.slice(0,2);if(selected.some(s=>s.ship.scorchMarks.length===0))throw Error('Fixture has no visible damage');
  const before=[JSON.stringify(take(a,tick)),JSON.stringify(take(b,tick))];
  for(const {ship,index} of selected)for(const layer of ['base','glow'] as const)for(const scale of [1,.4])for(const piece of [false,true]){
   const right=b.allCapitalShips[index];if(getDamageGlowRevision(ship)!==getDamageGlowRevision(right))throw Error('Glow revision mismatch');
   const leftPixels=paint(contexts[0],ship,layer,scale,piece),rightPixels=paint(contexts[1],right,layer,scale,piece);let different=0,nonzero=0;for(let i=0;i<leftPixels.length;i++){if(leftPixels[i]!==rightPixels[i])different++;if(i%4===3&&leftPixels[i])nonzero++;}
   if(different)throw Error('Damage pixels differ');
   results.push({tick,ship:ship.id,marks:ship.scorchMarks.length,layer,scale,piece,different,nonzero});
   if(tick===600&&layer==='base'&&scale===1&&!piece&&!picture)picture=canvases.map(c=>c.toDataURL('image/png'));
  }
  if(JSON.stringify(take(a,tick))!==before[0]||JSON.stringify(take(b,tick))!==before[1])throw Error('Rendering mutated restored snapshot state');
 }
 if(!results.some(r=>r.layer==='base'&&r.nonzero>1000)||!results.some(r=>r.layer==='glow'&&r.nonzero>100))throw Error('Pixel comparisons must include actual damage and glow');
 return {scope:'Real damage tile Canvas rendering via ShipDamageVisuals, both layers/scales/hull-piece filtering, same complete P1 state. Not original-game desktop UI parity or full-WebGL battle acceptance.',passed:true,results,picture};
};
