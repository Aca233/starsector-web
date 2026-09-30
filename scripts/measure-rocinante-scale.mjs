/** Read-only comparison of current ship art at a shared world scale. */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { createServer as netServer } from 'node:net';
import assert from 'node:assert/strict';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const out='output/imagegen/rocinante/scale-comparison';
await fs.mkdir(out,{recursive:true});
const probe=netServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__scale-probe.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Scale measurement</title></html>'}));
 await page.goto(`http://127.0.0.1:${port}/__scale-probe.html`);
 const result=await page.evaluate(async()=>{
  window.__LAN_BUILD_ID__='rocinante-scale-audit';
  await import('/src/network/LanWorld.ts');
  const {contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
  const {weaponArtLayout}=await import('/src/engine/content/WeaponInstallation.ts');
  const {arkArt}=await import('/src/engine/visual/AdunArkArt.ts');
  const before=contentRegistry.getAllShips().map(s=>s.id).join('|');
  const roci=await(await fetch('/output/imagegen/rocinante/prepared-v01/asset-manifest.json')).json();
  const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
  const measure=async(id,name,pieces,thumbnailHeight)=>{
   const loaded=await Promise.all(pieces.map(p=>load(p.url)));
   const left=Math.floor(Math.min(...pieces.map(p=>p.x))),top=Math.floor(Math.min(...pieces.map(p=>p.y)));
   const right=Math.ceil(Math.max(...pieces.map(p=>p.x+p.w))),bottom=Math.ceil(Math.max(...pieces.map(p=>p.y+p.h)));
   const sampling=2,c=document.createElement('canvas');c.width=(right-left)*sampling;c.height=(bottom-top)*sampling;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.scale(sampling,sampling);ctx.imageSmoothingQuality='high';
   pieces.forEach((p,i)=>ctx.drawImage(loaded[i],p.x-left,p.y-top,p.w,p.h));
   const rgba=ctx.getImageData(0,0,c.width,c.height).data;let minX=c.width,minY=c.height,maxX=-1,maxY=-1;
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(rgba[(y*c.width+x)*4+3]>=128){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
   if(maxX<0)throw Error('Empty assembled art: '+id);
   const w=maxX-minX+1,h=maxY-minY+1,t=document.createElement('canvas');t.height=thumbnailHeight;t.width=Math.round(thumbnailHeight*w/h);
   const tc=t.getContext('2d');tc.imageSmoothingQuality='high';tc.drawImage(c,minX,minY,w,h,0,0,t.width,t.height);
   return {id,name,visibleWidth:w/sampling,visibleLength:h/sampling,canvasWorldSize:[right-left,bottom-top],pieces:pieces.map(p=>({...p})),image:t.toDataURL('image/png')};
  };
  const queen=contentRegistry.getShip('web_gloriana'),adun=contentRegistry.getShip('web_spear_of_adun_ark');
  if(!queen||!adun)throw Error('Current registered giant ship missing');
  const qParts=[{spec:queen,x:0,y:0},...queen.modules];
  if(qParts.some(p=>p.angleDeg))throw Error('Need rotated module support, do not approximate');
  const qPieces=qParts.map(({spec,x,y})=>({url:spec.spriteUrl,x:y-spec.pivotX,y:-x-spec.pivotY,w:spec.spriteWidth,h:spec.spriteHeight}));
  const aPieces=arkArt.frames[0].map(d=>({url:'/game-assets/graphics/ships/web_adun_ark/'+d.file,x:(d.box[0]-arkArt.parts.CORE.anchor[0])*arkArt.scale,y:(d.box[1]-arkArt.parts.CORE.anchor[1])*arkArt.scale,w:d.size[0]*arkArt.scale,h:d.size[1]*arkArt.scale}));
  const ships=[
   await measure('rocinante-candidate','罗西南特 · 候选',[{url:'/output/imagegen/rocinante/prepared-v01/hull.png',x:0,y:0,w:roci.hull.previewWorld.spriteWidth,h:roci.hull.previewWorld.spriteHeight}],220),
   await measure(queen.id,'荣光女王',qPieces,500),
   await measure(adun.id,'亚顿之矛 · 方舟',aPieces,650)
  ];
  const weapons=[];
  for(const [id,name] of [['roci-pdc','罗西南特 PDC'],['web_gloriana_bolter','女王 · 铁卫近防'],['web_ark_guard_prism','亚顿 · 折光近防']]){
   const spec=id==='roci-pdc'?roci.pdc.previewWorld:contentRegistry.getWeapon(id);
   if(!spec)throw Error('Missing weapon '+id);
   const url=id==='roci-pdc'?'/output/imagegen/rocinante/prepared-v01/pdc.png':spec.turretSpriteUrl;
   const im=await load(url),layout=weaponArtLayout(spec,im.width,im.height);
   const measured=await measure(id,name,[{url,x:0,y:0,w:layout.width,h:layout.height}],140);
   weapons.push({...measured,mountSize:id==='roci-pdc'?'SMALL candidate':spec.mountSize,authoredCanvas:[layout.width,layout.height],pivot:[layout.pivotX,layout.pivotY]});
  }
  return {date:'2026-09-29',basis:'Current registered default hulls, all modules assembled; Adun frame 0; hull pixels only, alpha >=128, sampled at 2 pixels/world unit. No shields, engine plumes, installed weapons or game stats changed. Rocinante remains an unregistered art candidate.',ships,weapons,noCatalogueRegistration:before===contentRegistry.getAllShips().map(s=>s.id).join('|')};
 });
 assert.deepEqual(errors,[]);assert.ok(result.noCatalogueRegistration);result.pageErrors=errors;
 for(const item of [...result.ships,...result.weapons]){
  await fs.writeFile(`${out}/${item.id}.png`,Buffer.from(item.image.split(',')[1],'base64'));
  delete item.image;
 }
 result.ratios={queenToRoci:result.ships[1].visibleLength/result.ships[0].visibleLength,adunToRoci:result.ships[2].visibleLength/result.ships[0].visibleLength,adunToQueen:result.ships[2].visibleLength/result.ships[1].visibleLength};
 await fs.writeFile(`${out}/measurements.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({ships:result.ships.map(({name,visibleLength,visibleWidth})=>({name,visibleLength,visibleWidth})),weapons:result.weapons.map(({name,visibleLength,visibleWidth,authoredCanvas})=>({name,visibleLength,visibleWidth,authoredCanvas})),ratios:result.ratios,pageErrors:errors}));
}finally{await browser?.close();await server.close();}
