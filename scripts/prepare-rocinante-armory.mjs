import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {prepareSprite} from './prepare-rocinante-sprites.mjs';
const sharp=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('sharp');
const root='output/imagegen/rocinante',dest='public/game-assets/graphics/ships/web_rocinante/armory-v01',url='/game-assets/graphics/ships/web_rocinante/armory-v01/';
const bytes=await fs.readFile(root+'/armory-v01.png'),meta=await sharp(bytes).metadata();
if(meta.width!==948||meta.height!==1659||!meta.hasAlpha)throw Error('Atlas requires recalibration');
await fs.mkdir(dest,{recursive:true});
const defs={
 railgun:{box:[160,30,255,780],pivot:[130,650],muzzle:[130,10],length:57,height:160},
 tube:{box:[540,270,261,522],pivot:[138,335],muzzle:[138,16],length:19,height:80},
 agile:{box:[210,835,166,690],pivot:[83,345],muzzle:[83,15],length:12,height:80},
 heavy:{box:[550,835,255,690],pivot:[127,345],muzzle:[127,15],length:15,height:80},
};
const result={source:'armory-v01.png',actualSize:[meta.width,meta.height],sourceSha256:createHash('sha256').update(bytes).digest('hex'),art:{}};
for(const [name,d] of Object.entries(defs)){
 const [left,top,width,height]=d.box;
 await sharp(bytes).extract({left,top,width,height}).png().toFile(`${root}/${name}-source.png`);
 const a=await prepareSprite(root,name,{source:name+'-source.png',outputFolder:'prepared-armory-v01',contentHeight:d.height,previewLength:d.length,pivot:d.pivot,muzzle:d.muzzle,note:'Original Web adaptation. Source crop removes detached atlas debris; no RGB repaint. Tube crop excludes erroneous right-side painted flash.'});
 const b=await fs.readFile(`${root}/prepared-armory-v01/${name}.png`);await fs.writeFile(`${dest}/${name}.png`,b);
 result.art[name]={...a.previewWorld,spriteUrl:url+name+'.png',sourceBox:d.box,sha256:createHash('sha256').update(b).digest('hex'),textureSize:a.textureSize};
}
await fs.writeFile('src/engine/content/rocinante-armory-art.json',JSON.stringify(result,null,2)+'\n');
// Manifest updates are scoped to this ship's assets; all existing unrelated records preserved.
const manifestPath='public/game-assets/asset-manifest.json',manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
for(const dir of ['armory-v01','installation-v01'])for(const file of await fs.readdir(`public/game-assets/graphics/ships/web_rocinante/${dir}`)){
 if(!file.endsWith('.png'))continue;
 const path=`graphics/ships/web_rocinante/${dir}/${file}`,data=await fs.readFile('public/game-assets/'+path);
 const entry={id:path,path,type:'image',bytes:data.length,hash:createHash('sha256').update(data).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}};
 const index=manifest.findIndex(e=>e.path===path);if(index<0)manifest.push(entry);else manifest[index]=entry;
}
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(result));

