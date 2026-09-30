/** Technical sprite preparation only: crop approved art, resample, and pad to its mount pivot. */
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sharp=createRequire(import.meta.url)(process.env.SHARP_PACKAGE||'sharp');
const source=resolve('output/imagegen/gloriana/armory-v1');
const output=resolve('public/game-assets/graphics/weapons/web_gloriana');
await mkdir(output,{recursive:true});
const layouts=[
 {id:'macro',file:'approved-large-medium.png',region:[0,0,627,627],pivot:[338,438],scale:.165,muzzles:[[288,20],[391,20]]},
 {id:'lance',file:'approved-large-medium.png',region:[627,0,627,627],pivot:[950,483],scale:.14,muzzles:[[950,20]]},
 {id:'siege',file:'approved-large-medium.png',region:[0,627,627,627],pivot:[340,998],scale:.1,muzzles:[[340,674]]},
 {id:'torpedo',file:'approved-large-medium.png',region:[627,627,627,627],pivot:[945,1000],scale:.12,muzzles:[[886,644],[997,644]]},
 {id:'bolter',file:'approved-small.png',region:[0,0,887,887],pivot:[478,550],scale:.048,muzzles:[[400,244],[551,244]]},
 {id:'interceptor',file:'approved-small.png',region:[887,0,887,887],pivot:[1286,552],scale:.048,muzzles:[[1286,190]]},
];
const assets=[],metrics={};
for(const l of layouts){
 const bytes=await readFile(resolve(source,l.file));
 const [left,top,width,height]=l.region;
 const raw=await sharp(bytes).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
 let x0=width,y0=height,x1=0,y1=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(raw[(y*width+x)*4+3]>16){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 // Small allowance preserves antialiasing; there is no background recoloring or painting.
 x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(width-1,x1+2);y1=Math.min(height-1,y1+2);
 const crop={left:left+x0,top:top+y0,width:x1-x0+1,height:y1-y0+1};
 const w=Math.round(crop.width*l.scale),h=Math.round(crop.height*l.scale);
 const px=Math.round((l.pivot[0]-crop.left)/crop.width*w),py=Math.round((l.pivot[1]-crop.top)/crop.height*h);
 const W=2*(Math.max(px,w-px)+2),H=2*(Math.max(py,h-py)+2);
 const image=await sharp(bytes).extract(crop).resize(w,h).png().toBuffer();
 const rendered=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:image,left:W/2-px,top:H/2-py}]).png().toBuffer();
 await writeFile(resolve(output,l.id+'.png'),rendered);
 const path='graphics/weapons/web_gloriana/'+l.id+'.png';
 assets.push({id:path,path,type:'image',bytes:rendered.length,hash:createHash('sha256').update(rendered).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}});
 metrics[l.id]={source:l.file,sourceSha256:createHash('sha256').update(bytes).digest('hex'),crop,pivot:l.pivot,scale:l.scale,width:W,height:H,
  offsets:l.muzzles.flatMap(([x,y])=>[+((l.pivot[1]-y)*l.scale).toFixed(2),+((x-l.pivot[0])*l.scale).toFixed(2)])};
}
const manifest=JSON.parse(await readFile('public/game-assets/asset-manifest.json','utf8'));
const ids=new Set(assets.map(a=>a.id));
await writeFile('public/game-assets/asset-manifest.json',JSON.stringify([...manifest.filter(a=>!ids.has(a.id)),...assets],null,2)+'\n');
await writeFile('src/engine/content/gloriana-armory-art.json',JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify(metrics,null,2));

// Keep the approved empty rack + missile layers authoritative on regeneration.
await (await import('./prepare-gloriana-torpedo.mjs')).prepareGlorianaTorpedo();
