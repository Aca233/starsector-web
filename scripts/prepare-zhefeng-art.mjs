import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareSprite} from './prepare-rocinante-sprites.mjs';
const root='output/imagegen/zhefeng',dest='public/game-assets/graphics/ships/web_zhefeng';
// The v1 full-hull exporter must not overwrite reviewed cylindrical nozzle geometry.
const currentArt=JSON.parse(await fs.readFile('src/engine/content/zhefeng-art.json','utf8'));
if(currentArt.source.startsWith('nozzles-cylinder-v03/'))throw Error('Zhefeng uses reviewed cylindrical nozzles v03. Use output/imagegen/zhefeng/nozzles-cylinder-v03/prepare.py for pixel export; do not replace calibrated v03 geometry with this v1 exporter.');
// Generated weapon layers are required authored inputs; never recover them from native assets.
const files=['assault_chaingun_turret_base.png','assault_chaingun_turret_recoil.png','assault_chaingun_hardpoint_base.png','assault_chaingun_hardpoint_recoil.png','heavy_autocannon_turret_base.png','heavy_autocannon_turret_recoil.png','heavy_autocannon_hardpoint_base.png','heavy_autocannon_hardpoint_recoil.png','light_autocannon_turret_base.png','light_autocannon_turret_recoil.png','light_autocannon_hardpoint_base.png','light_autocannon_hardpoint_recoil.png','vulcan_cannon_turret_base.png','vulcan_cannon_turret_recoil.png','vulcan_cannon_hardpoint_base.png','vulcan_cannon_hardpoint_recoil.png'];
const provenance=JSON.parse(await fs.readFile('public/ai-media-provenance.json','utf8'));
const authored=JSON.parse(await fs.readFile('public/authored-assets.json','utf8'));
for(const file of files){
 const path='graphics/weapons/'+file;
 const record=provenance.records.find(r=>r.path===path),declaration=authored.records.find(r=>r.path===path);
 if(!record||record.source!=='local-proxy/gpt-image-2.5:text-to-image'||!declaration)throw Error('Missing authored weapon provenance: '+path);
 let data;try{data=await fs.readFile('public/game-assets/'+path);}catch{throw Error('Missing generated weapon art; restore the reviewed asset, not native art: '+path);}
 const hash=createHash('sha256').update(data).digest('hex');
 if(hash!==record.sha256||hash!==declaration.sha256||hash===record.originalSha256)throw Error('Authored weapon art mismatch: '+path);
}
await fs.mkdir(dest,{recursive:true});
const hull=await prepareSprite(root,'hull',{source:'hull-v01.png',contentHeight:480,previewLength:300,pivot:[535,780],note:'Original Zhefeng. Six sockets and four real nozzle lips measured in the generated 1071x1468 master; no baked weapons/flames.'});
await fs.copyFile(root+'/prepared-v01/hull.png',dest+'/hull.png');
const sy=300/(hull.sourceCrop[3]-hull.sourceCrop[1]);
const toLocal=([x,y])=>[(780-y)*sy,(x-535)*sy];
const silhouette=[[504,19],[449,44],[395,154],[326,277],[279,291],[227,379],[213,397],[177,510],[251,578],[279,557],[306,645],[350,704],[332,735],[341,828],[304,917],[269,920],[239,1003],[218,1108],[224,1184],[252,1264],[296,1378],[316,1397],[427,1397],[450,1368],[464,1290],[600,1290],[620,1368],[638,1397],[754,1397],[773,1378],[824,1220],[850,1130],[835,1028],[796,949],[753,917],[730,826],[739,730],[719,699],[771,637],[792,558],[819,578],[892,514],[875,461],[838,396],[800,293],[751,278],[686,162],[623,44],[566,19],[554,53],[520,53]];
const mounts=[['M01',350,374],['M02',721,374],['S01',370,729],['S02',700,729],['PD01',329,1056],['PD02',741,1056]].map(([id,x,y])=>({id,source:[x,y],local:toLocal([x,y])}));
const nozzles=[[362,1386,90],[708,1386,90],[491,1280,27],[576,1280,27]].map(([x,y,w])=>({source:[x,y],local:toLocal([x,y]),width:w*sy}));
const geometry={source:hull.source,sourceSha256:hull.sourceSha256,sourceSize:hull.sourceSize,textureSize:hull.textureSize,sourceCrop:hull.sourceCrop,scale:sy,visibleLength:300,spriteWidth:hull.previewWorld.spriteWidth,spriteHeight:hull.previewWorld.spriteHeight,pivotX:hull.authorPivotTexture[0]*.625,pivotY:hull.authorPivotTexture[1]*.625,bounds:silhouette.map(toLocal),mounts,nozzles};
await fs.writeFile('src/engine/content/zhefeng-art.json',JSON.stringify(geometry,null,2)+'\n');
const manifestPath='public/game-assets/asset-manifest.json',manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
for(const path of ['graphics/ships/web_zhefeng/hull.png',...files.map(f=>'graphics/weapons/'+f)]){
 const data=await fs.readFile('public/game-assets/'+path);const hash=createHash('sha256').update(data).digest('hex');
 const existing=manifest.find(e=>e.path===path);if(existing){if(existing.hash!==hash)throw Error('Existing asset mismatch: '+path);continue;}
 manifest.push({id:path,path,type:'image',bytes:data.length,hash,group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}});
}
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(root+'/production-art.json',JSON.stringify({hull,authoredWeaponArt:files,geometry},null,2));
console.log(JSON.stringify({sourceSize:hull.sourceSize,textureSize:hull.textureSize,bytes:hull.bytes,alpha:hull.alpha,cleanup:hull.cleanup,geometry}));
