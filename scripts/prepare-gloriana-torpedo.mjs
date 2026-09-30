/** Deterministic sprite extraction/registration, not generated replacement artwork. */
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sharp=createRequire(import.meta.url)(process.env.SHARP_PACKAGE||'sharp');
export async function prepareGlorianaTorpedo(){
 const source=resolve('output/imagegen/gloriana/armory-v1');
 const output=resolve('public/game-assets/graphics/weapons/web_gloriana');
 const preview=resolve('artifacts/gloriana/armory');await mkdir(preview,{recursive:true});
 const art=JSON.parse(await readFile('src/engine/content/gloriana-armory-art.json','utf8')).torpedo;
 const original=await readFile(resolve(source,'torpedo-loaded-reference.png'));
 const empty=await sharp(resolve(source,'approved-torpedo-empty.png')).resize(627,627).png().toBuffer();
 // Nose, casing and missile tail only. Side clamps, golden guides and aft rammers stay on the rack.
 const outline=[[262,8],[269,15],[285,47],[294,73],[296,103],[295,224],[292,260],[291,350],
  [281,362],[271,386],[268,416],[253,416],[249,385],[239,367],[230,355],[229,271],[227,230],[229,98],[232,76],[245,39],[256,15]];
 const layers=[empty];
 for(const dx of [0,113]){
  const points=outline.map(([x,y])=>`${x+dx},${y}`).join(' ');
  const mask=Buffer.from(`<svg width="627" height="627"><polygon points="${points}" fill="white"/></svg>`);
  layers.push(await sharp(original).composite([{input:mask,blend:'dest-in'}]).png().toBuffer());
 }
 const loaded=await sharp(empty).composite(layers.slice(1).map(input=>({input}))).png().toBuffer();
 const w=Math.round(art.crop.width*art.scale),h=Math.round(art.crop.height*art.scale);
 const px=Math.round((art.pivot[0]-art.crop.left)/art.crop.width*w),py=Math.round((art.pivot[1]-art.crop.top)/art.crop.height*h);
 const assets=[];
 for(const [i,image] of [...layers,loaded].entries()){
  const id=['torpedo-empty','torpedo-left','torpedo-right','torpedo'][i];
  const region=await sharp(image).extract({...art.crop,left:art.crop.left-627,top:art.crop.top-627}).resize(w,h).png().toBuffer();
  const rendered=await sharp({create:{width:art.width,height:art.height,channels:4,background:'#00000000'}})
   .composite([{input:region,left:art.width/2-px,top:art.height/2-py}]).png().toBuffer();
  await writeFile(resolve(output,id+'.png'),rendered);
  const path='graphics/weapons/web_gloriana/'+id+'.png';
  assets.push({id:path,path,type:'image',bytes:rendered.length,hash:createHash('sha256').update(rendered).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}});
 }
 const single=await sharp(empty).composite([{input:layers[2]}]).png().toBuffer();
 // A large registration proof, independent of gameplay state/screenshots.
 const proof=await sharp({create:{width:1881,height:627,channels:4,background:'#18212e'}}).composite([loaded,single,empty].map((input,i)=>({input,left:i*627,top:0})))
  .png().toBuffer();
 await sharp(proof).resize(1410,470).png().toFile(resolve(preview,'torpedo-layer-proof.png'));
 const manifest=JSON.parse(await readFile('public/game-assets/asset-manifest.json','utf8')),ids=new Set(assets.map(a=>a.id));
 await writeFile('public/game-assets/asset-manifest.json',JSON.stringify([...manifest.filter(a=>!ids.has(a.id)),...assets],null,2)+'\n');
 console.log('Prepared registered torpedo layers: 50x92, unchanged mount pivot/muzzles.');
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await prepareGlorianaTorpedo();
