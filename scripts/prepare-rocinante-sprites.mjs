/** Deterministic asset preparation, not image generation: preserve RGB of the
 * connected hull/head; normalize alpha, trim, downsample and record transforms.
 * Source AI masters are NEVER overwritten; outputs are not registered content. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
let sharp;try{sharp=createRequire(import.meta.url)('sharp');}catch{sharp=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('sharp');}
const sha=data=>createHash('sha256').update(data).digest('hex');
export function components(rgba,width,height,threshold=128){
 const n=width*height,labels=new Int32Array(n),queue=new Int32Array(n),parts=[];
 for(let start=0;start<n;start++){
  if(labels[start]||rgba[start*4+3]<threshold)continue;
  const id=parts.length+1;let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;queue[0]=start;labels[start]=id;
  while(head<tail){
   const p=queue[head++],x=p%width,y=Math.floor(p/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const q=yy*width+xx;
    if(!labels[q]&&rgba[q*4+3]>=threshold){labels[q]=id;queue[tail++]=q;}
   }
  }
  parts.push({id,pixels:tail,bounds:[minX,minY,maxX+1,maxY+1]});
 }
 return {labels,parts:parts.sort((a,b)=>b.pixels-a.pixels)};
}
export function normalizeSprite(rgba,width,height,{edgeReach=2,opaqueFrom=240,minimumAlpha=8}={}){
 assert.equal(rgba.length,width*height*4);const {labels,parts}=components(rgba,width,height);assert.ok(parts.length,'Empty sprite');
 const main=parts[0],keep=new Uint8Array(width*height),output=Buffer.from(rgba);
 // Fail closed if the image contains substantial detached art. Never silently
 // throw away a second gun, a separated subassembly, or a significant antenna.
 assert.ok((parts[1]?.pixels??0)<64,'Multiple substantial components: needs manual part review');
 for(let i=0;i<labels.length;i++)if(labels[i]===main.id){const x=i%width,y=Math.floor(i/width);
  for(let dy=-edgeReach;dy<=edgeReach;dy++)for(let dx=-edgeReach;dx<=edgeReach;dx++){
   const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height)keep[yy*width+xx]=1;
  }
 }
 let removedPixels=0,removedStrongPixels=0,normalizedPixels=0,changedVisibleRGB=0,minX=width,minY=height,maxX=-1,maxY=-1;
 for(let i=0;i<keep.length;i++){
  const j=i*4,a=rgba[j+3],next=keep[i]&&a>=minimumAlpha?(a>=opaqueFrom?255:a):0;
  output[j+3]=next;
  if(!next){if(a){removedPixels++;if(a>=128)removedStrongPixels++;}output[j]=output[j+1]=output[j+2]=0;}
  else {const x=i%width,y=Math.floor(i/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(next!==a)normalizedPixels++;
   if(output[j]!==rgba[j]||output[j+1]!==rgba[j+1]||output[j+2]!==rgba[j+2])changedVisibleRGB++;
  }
 }
 assert.ok(maxX>=minX);assert.equal(changedVisibleRGB,0);assert.ok(removedStrongPixels/main.pixels<.001,'Too much strong silhouette removed');
 return {rgba:output,bounds:[minX,minY,maxX+1,maxY+1],report:{sourceComponents:parts.length,largestComponent:main.pixels,secondComponent:parts[1]?.pixels??0,removedPixels,removedStrongPixels,normalizedPixels,changedVisibleRGB,edgeReach,opaqueFrom,minimumAlpha}};
}
function countAlpha(rgba){const histogram=Array(256).fill(0);for(let i=3;i<rgba.length;i+=4)histogram[rgba[i]]++;return {zero:histogram[0],opaque:histogram[255],antialias:histogram.slice(1,255).reduce((a,b)=>a+b,0)};}
export async function prepareSprite(root,name,settings){
 const source=path.join(root,settings.source),sourceBytes=await fs.readFile(source),decoded=await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=decoded.info;assert.equal(decoded.info.channels,4);
 const cleaned=normalizeSprite(decoded.data,width,height),[left,top,right,bottom]=cleaned.bounds;
 const folder=path.join(root,settings.outputFolder??'prepared-v01');await fs.mkdir(folder,{recursive:true});
 const master=path.join(folder,`${name}-master.png`),runtime=path.join(folder,`${name}.png`);
 await sharp(cleaned.rgba,{raw:{width,height,channels:4}}).png({compressionLevel:9}).toFile(master);
 const content=await sharp(cleaned.rgba,{raw:{width,height,channels:4}}).extract({left,top,width:right-left,height:bottom-top})
  .resize({height:settings.contentHeight,kernel:'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pad=16;await sharp(content.data,{raw:content.info}).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png({compressionLevel:9}).toFile(runtime);
 const packed=await sharp(runtime).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const sx=content.info.width/(right-left),sy=content.info.height/(bottom-top);
 const point=([x,y])=>[pad+(x-left)*sx,pad+(y-top)*sy];
 const pivot=point(settings.pivot),muzzle=settings.muzzle?point(settings.muzzle):undefined;
 const worldPerPixel=settings.previewLength/content.info.height;
 const meta={status:'prepared-art-candidate-not-registered',source:settings.source,sourceSha256:sha(sourceBytes),sourceSize:[width,height],master:path.basename(master),file:path.basename(runtime),
  cleanup:cleaned.report,sourceCrop:cleaned.bounds,sourceToTexture:{scale:[sx,sy],offset:[pad-left*sx,pad-top*sy]},textureSize:[packed.info.width,packed.info.height],padding:pad,
  authorPivotSource:settings.pivot,authorPivotTexture:pivot,pivotNormalized:[pivot[0]/packed.info.width,pivot[1]/packed.info.height],authorMuzzleSource:settings.muzzle,authorMuzzleTexture:muzzle,
  previewWorld:{purpose:'Web-adaptation fit study, not canonical coordinates or final balance',visibleLength:settings.previewLength,
   spriteWidth:packed.info.width*worldPerPixel,spriteHeight:packed.info.height*worldPerPixel,
   spritePivotX:pivot[0]/packed.info.width,spritePivotY:pivot[1]/packed.info.height,
   ...(muzzle?{turretOffsets:[(pivot[1]-muzzle[1])*worldPerPixel,(muzzle[0]-pivot[0])*worldPerPixel]}:{})},
  alpha:countAlpha(packed.data),bytes:(await fs.stat(runtime)).size,sha256:sha(await fs.readFile(runtime)),
  anchorsNote:settings.note};
 assert.equal(sha(await fs.readFile(source)),meta.sourceSha256,'Source changed');
 assert.equal(packed.data[3],0,'Corner gutter not transparent');
 assert.ok(meta.alpha.opaque>0,'No opaque body after export');
 assert.equal(packed.info.height,settings.contentHeight+pad*2);
 await fs.writeFile(path.join(folder,`${name}.json`),JSON.stringify(meta,null,2));return meta;
}
export async function prepareRocinanteSprites(){
 const root=path.resolve('output/imagegen/rocinante');
 const hull=await prepareSprite(root,'hull',{source:'rocinante-hull-v02.png',contentHeight:480,previewLength:220,pivot:[474,780],
  note:'Authored test rotation center on the central structural spine, not a claimed canonical center of mass. No ship weapon slots are frozen.'});
 const pdc=await prepareSprite(root,'pdc',{source:'rocinante-pdc-v01.png',contentHeight:128,previewLength:18,pivot:[474,1090],muzzle:[474,165],
  note:'Manual visual calibration: yaw center inside rear drum/root, muzzle at front of the vertical barrel cluster. This one top-down head is not evidence for the four side installations.'});
 const result={hull,pdc,atlasUploadBytes:hull.textureSize[0]*hull.textureSize[1]*4+pdc.textureSize[0]*pdc.textureSize[1]*4,
  runtimePngBytes:hull.bytes+pdc.bytes,registered:false,fitStudy:{hullSourcePoint:[474,650],notFinalMount:true,
   rationale:'Temporary material/scale test on a visible armor panel. Not assigned to PDC_01–06 and never shipped as a weapon slot.'}};
 await fs.writeFile(path.join(root,'prepared-v01','asset-manifest.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const r=await prepareRocinanteSprites();console.log(JSON.stringify({hull:r.hull.textureSize,pdc:r.pdc.textureSize,sourcePreserved:true,pngBytes:r.runtimePngBytes,rgbaBytes:r.atlasUploadBytes,cleanup:{hull:r.hull.cleanup,pdc:r.pdc.cleanup}},null,2));}
