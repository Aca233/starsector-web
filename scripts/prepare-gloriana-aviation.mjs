/** User-provided RGBA sprites: lossless source archive + deterministic runtime resize only. */
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sharp=createRequire(import.meta.url)(process.env.SHARP_PACKAGE||'sharp');
const dir=resolve('output/imagegen/gloriana/aviation-v1'),out=resolve('public/game-assets/graphics/ships/web_gloriana/aviation');
await mkdir(dir,{recursive:true});await mkdir(out,{recursive:true});
const art={
 fury:{source:'64b06c07-5762-4446-b28b-05bf6b4394cf',size:96,pivot:[627,710],nozzles:[[500,1180,85],[749,1180,85]],muzzles:[[515,532],[740,532]],outline:[[627,25],[710,415],[737,582],[1130,1074],[1020,1000],[836,943],[791,1188],[460,1188],[417,943],[121,1074],[517,582],[546,415]]},
 starhawk:{source:'1c3d1edd-77f4-4eb2-b41a-9aff4326a0b3',size:128,pivot:[627,680],nozzles:[[420,1116,75],[511,1150,75],[744,1150,75],[834,1116,75]],muzzles:[[511,510],[742,510]],outline:[[605,83],[649,83],[781,397],[1227,904],[1230,1001],[937,894],[880,1108],[776,1148],[739,1158],[508,1158],[382,1120],[323,895],[24,1001],[34,910],[474,397]]},
 thunderhawk:{source:'f374b1c5-69ef-4592-a5af-2a4f3bfa16b7',size:144,pivot:[627,690],nozzles:[[420,1154,95],[627,1168,92],[831,1154,95]],muzzles:[[627,298]],outline:[[585,56],[673,56],[716,249],[875,260],[878,332],[737,350],[778,594],[1221,862],[1231,981],[975,928],[871,1163],[800,1175],[668,1185],[584,1185],[376,1163],[277,928],[25,981],[37,862],[474,594],[518,350],[376,332],[380,260],[546,249]]},
};
const assets=[];const proof=[];
for(const [name,a] of Object.entries(art)){
 const dest=resolve(dir,name+'-approved.png');
 if(process.argv.includes('--import'))await copyFile('C:/Users/Aca/AppData/Local/Temp/codex-clipboard-'+a.source+'.png',dest);
 const image=sharp(dest),m=await image.metadata(),st=await image.stats();
 if(m.width!==1254||m.height!==1254||!m.hasAlpha||st.isOpaque)throw Error(name+': expected original transparent 1254x1254');
 const bytes=await image.resize(a.size*4,a.size*4,{kernel:'lanczos3'}).png().toBuffer();await writeFile(resolve(out,name+'.png'),bytes);
 const path='graphics/ships/web_gloriana/aviation/'+name+'.png';assets.push({id:path,path,type:'image',bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}});
 proof.push({input:await sharp(dest).resize(384,384).png().toBuffer(),left:proof.length*384,top:0});
}
await mkdir('artifacts/gloriana/aviation',{recursive:true});
await sharp({create:{width:1152,height:384,channels:4,background:'#17212b'}}).composite(proof).png().toFile('artifacts/gloriana/aviation/approved-sprites.png');
await writeFile('src/engine/content/gloriana-aviation-art.json',JSON.stringify(art,null,2)+'\n');
const manifest=JSON.parse(await readFile('public/game-assets/asset-manifest.json','utf8')),ids=new Set(assets.map(a=>a.id));
await writeFile('public/game-assets/asset-manifest.json',JSON.stringify([...manifest.filter(a=>!ids.has(a.id)),...assets],null,2)+'\n');
console.log('Registered approved aviation sprites with preserved alpha:',assets.map(a=>[a.path,a.bytes]));
