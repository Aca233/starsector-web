/** Repackage approved art; no image generation, paint, mirroring or chroma-key. */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PACKAGE || 'sharp');
const input = resolve('output/imagegen/gloriana/layered-core-joints-v0.5');
const assembly = JSON.parse(await readFile(resolve(input, 'assembly-manifest.json')));
const layered = JSON.parse(await readFile(resolve(input, 'layered-manifest.json')));
const fit = JSON.parse(await readFile('output/imagegen/gloriana/fit-check-v0.1/fit-layout.json'));
const out = resolve('public/game-assets/graphics/ships/web_gloriana');
await mkdir(out, { recursive: true });
const additions = [
  ['M09',512,618,'C'], ['M10',369,1001,'P3'], ['M11',655,1001,'S3'],
  ['S09',300,1070,'P3'], ['S10',726,1070,'S3'], ['S11',299,1117,'P3'],
  ['S12',726,1117,'S3'], ['S13',410,1170,'P3'], ['S14',615,1170,'S3'],
  // Carrier-core expansion: keep geometry regeneration in sync with the authored sockets.
  ['L13',463,300,'C'], ['L14',558,300,'C'],
  ['M12',434,191,'C'], ['M13',590,191,'C'], ['M14',512,710,'C'],
  ['S15',482,439,'C'], ['S16',542,439,'C'], ['S17',445,954,'C'],
  ['S18',579,954,'C'], ['S19',487,1260,'C'], ['S20',537,1260,'C'],
];
// Actual skin ownership supersedes the earliest approximate module proposal.
const mounts = fit.mounts.map(m => ({ id:m.id,x:m.x,y:m.y,owner:assembly.parts.find(p=>p.sampleMounts.some(s=>s.id===m.id)).id,added:false }));
for(const [id,x,y] of additions){
  const owners=[];
  for(const p of assembly.parts){const r=p.sourceRect;if(x<r.x||y<r.y||x>=r.x+r.width||y>=r.y+r.height)continue;
    const pixel=await sharp(resolve(input,p.file)).extract({left:x-r.x,top:y-r.y,width:1,height:1}).ensureAlpha().raw().toBuffer();if(pixel[3]>32)owners.push(p.id);
  }
  if(owners.length!==1)throw new Error('Ambiguous added mount '+id+': '+owners);
  mounts.push({id,x,y,owner:owners[0],added:true});
}
function simplify(points, epsilon=2) {
  if(points.length<3)return points;
  const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
  let far=0,index=0;
  for(let i=1;i<points.length-1;i++){
    const p=points[i],t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0;
    const d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>far){far=d;index=i;}
  }
  return far>epsilon?[...simplify(points.slice(0,index+1),epsilon).slice(0,-1),...simplify(points.slice(index),epsilon)]:[a,b];
}
function outline(data,w,h) {
  const mask=new Uint8Array(w*h),visited=new Uint8Array(w*h);for(let i=0;i<mask.length;i++)mask[i]=data[i*4+3]>32?1:0;
  let largest=[];
  for(let seed=0;seed<mask.length;seed++)if(mask[seed]&&!visited[seed]){
    const q=[seed];visited[seed]=1;
    for(let k=0;k<q.length;k++){const p=q[k],x=p%w,y=Math.floor(p/w);for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&mask[n]&&!visited[n]){visited[n]=1;q.push(n);}}
    if(q.length>largest.length)largest=q;
  }
  mask.fill(0);for(const p of largest)mask[p]=1;
  const edges=new Map(),stride=w+1,edge=(x,y,X,Y)=>{const a=y*stride+x,b=Y*stride+X;const list=edges.get(a)||[];list.push(b);edges.set(a,list);};
  for(const p of largest){const x=p%w,y=Math.floor(p/w);if(!y||!mask[p-w])edge(x,y,x+1,y);if(x===w-1||!mask[p+1])edge(x+1,y,x+1,y+1);if(y===h-1||!mask[p+w])edge(x+1,y+1,x,y+1);if(!x||!mask[p-1])edge(x,y+1,x,y);}
  let best=[],area=0;
  while(edges.size){const start=edges.keys().next().value;let at=start;const loop=[];
    do {loop.push([at%stride,Math.floor(at/stride)]);const es=edges.get(at);if(!es)break;const next=es.pop();if(!es.length)edges.delete(at);at=next;}while(at!==start);
    const a=Math.abs(loop.reduce((s,p,i)=>{const q=loop[(i+1)%loop.length];return s+p[0]*q[1]-p[1]*q[0];},0));if(a>area){best=loop;area=a;}
  }
  const half=Math.floor(best.length/2);return [...simplify(best.slice(0,half+1)).slice(0,-1),...simplify([...best.slice(half),best[0]]).slice(0,-1)];
}
const geometry={sourceSha256:assembly.source.sha256,scale:1,parts:[],mounts};const assets=[];
for(const part of assembly.parts){
  const layers=layered.parts.filter(p=>p.owner===part.id).sort((a,b)=>a.z-b.z);
  const x=Math.min(...layers.map(l=>l.sourceRect.x)),y=Math.min(...layers.map(l=>l.sourceRect.y));
  const w=Math.max(...layers.map(l=>l.sourceRect.x+l.sourceRect.width))-x,h=Math.max(...layers.map(l=>l.sourceRect.y+l.sourceRect.height))-y;
  const sprite=await sharp({create:{width:w,height:h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers.map(l=>({input:resolve(input,l.file),left:l.sourceRect.x-x,top:l.sourceRect.y-y}))).png().toBuffer();
  const file=part.id.toLowerCase()+'.png';await writeFile(resolve(out,file),sprite);
  const {data}=await sharp(sprite).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const [cx,cy]=part.centerSourcePx;
  const bounds=outline(data,w,h).map(([px,py])=>[cy-y-py,x+px-cx]);
  geometry.parts.push({id:part.id,name:part.name,kind:part.kind,file,width:w,height:h,pivot:[cx-x,cy-y],center:part.centerSourcePx,offset:[768-cy,cx-512],bounds,radius:Math.ceil(Math.max(...bounds.map(([a,b])=>Math.hypot(a,b))))});
  for(const m of mounts.filter(m=>m.owner===part.id)){const px=m.x-x,py=m.y-y;if(px<0||py<0||px>=w||py>=h||data[(py*w+px)*4+3]<=32)throw new Error('Mount outside owner: '+m.id);}
  const path='graphics/ships/web_gloriana/'+file;assets.push({id:path,path,type:'image',bytes:sprite.length,hash:createHash('sha256').update(sprite).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}});
}
await writeFile('src/engine/content/gloriana-geometry.json',JSON.stringify(geometry,null,2)+'\n');
const manifestPath='public/game-assets/asset-manifest.json';const current=JSON.parse(await readFile(manifestPath));
await writeFile(manifestPath,JSON.stringify([...current.filter(row=>!row.path.startsWith('graphics/ships/web_gloriana/')),...assets],null,2)+'\n');
console.log(JSON.stringify({modules:geometry.parts.length,mounts:mounts.length,added:additions.length,assets:assets.length,vertices:geometry.parts.map(p=>[p.id,p.bounds.length])}));
