/** Compile approved art calibration and authored six-mount layout. Never register a ship. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const sharp=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('sharp');
const root='output/imagegen/rocinante',source=path.join(root,'prepared-v02');
const author=JSON.parse(await fs.readFile(path.join(root,'rocinante-six-pdc-authoring.json'),'utf8'));
const art=JSON.parse(await fs.readFile(path.join(source,'asset-manifest.json'),'utf8'));
const destination='public/game-assets/graphics/ships/web_rocinante/installation-v01',url='/game-assets/graphics/ships/web_rocinante/installation-v01/';
await fs.mkdir(destination,{recursive:true});
// Prefilter the dense PDC ribs for the actual 18-world-unit weapon. The high-resolution
// authoring master stays untouched; normalized pivots and physical size stay unchanged.
const runtimeTextureSizes={'pdc.png':[57,80],'seat.png':[66,64]};
const hashes={};for(const file of ['hull.png','pdc.png','seat.png']){const original=await fs.readFile(path.join(source,file));const size=runtimeTextureSizes[file];const bytes=size?await sharp(original).resize(...size,{fit:'fill',kernel:'lanczos3'}).png().toBuffer():original;await fs.writeFile(path.join(destination,file),bytes);hashes[file]=createHash('sha256').update(bytes).digest('hex');}
const hull=art.hull,wpp=hull.previewWorld.spriteHeight/hull.textureSize[1];
const toLocal=point=>{const tex=point.map((v,i)=>v*hull.sourceToTexture.scale[i]+hull.sourceToTexture.offset[i]);return[(hull.authorPivotTexture[1]-tex[1])*wpp,(tex[0]-hull.authorPivotTexture[0])*wpp];};
const raw=await sharp(path.join(source,'hull.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const points=[];for(let y=0;y<raw.info.height;y++){let lo=raw.info.width,hi=-1;for(let x=0;x<raw.info.width;x++)if(raw.data[(y*raw.info.width+x)*4+3]>=128){lo=Math.min(lo,x);hi=Math.max(hi,x);}if(hi>=0)for(const x of [lo,hi+1])points.push([(hull.authorPivotTexture[1]-y)*wpp,(x-hull.authorPivotTexture[0])*wpp]);}
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const lower=[],upper=[];
for(const p of points){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of [...points].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}lower.pop();upper.pop();const bounds=[...lower,...upper];
const mounts=author.mounts.map(m=>{const [x,y]=toLocal(m.sourcePoint);return {...m,x,y};});
assert.equal(new Set(mounts.map(m=>m.slotId)).size,6);assert.equal(mounts.filter(m=>m.renderLayer==='ABOVE_HULL').length,1);assert.equal(mounts.filter(m=>m.surface==='VENTRAL').length,1);
const geometry={version:1,status:'six-pdc-installation-only-not-complete-ship',sourceImage:author.sourceImage,sourceSha256:hull.sourceSha256,sourceToTexture:hull.sourceToTexture,hashes,runtimeTextureSizes,hull:{spriteUrl:url+'hull.png',spriteWidth:hull.previewWorld.spriteWidth,spriteHeight:hull.previewWorld.spriteHeight,pivotX:hull.authorPivotTexture[0]*wpp,pivotY:hull.authorPivotTexture[1]*wpp,collisionRadius:Math.max(...bounds.map(p=>Math.hypot(...p))),bounds},pdc:{...art.pdc.previewWorld,turretSpriteUrl:url+'pdc.png',hardpointSpriteUrl:url+'pdc.png'},installation:{...art.installation,spriteUrl:url+'seat.png'},mounts,references:author.references,interpretation:author.interpretation};
await fs.writeFile('src/engine/content/rocinante-installation.json',JSON.stringify(geometry,null,2)+'\n');
console.log(JSON.stringify({mounts:mounts.map(m=>({id:m.slotId,x:m.x,y:m.y,base:m.baseAngleDeg,arc:m.arcDeg,layer:m.renderLayer})),collisionHullVertices:bounds.length,assets:hashes,registered:false}));
