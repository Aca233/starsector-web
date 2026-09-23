/** Installed public specs + actual required-item factories; no sector or save access. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
const repo=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(repo,'..'),sources={},checking=process.argv.includes('--check');
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Only --check is supported');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
function csv(text){const rows=[];let row=[],field='',quoted=false;const endField=()=>{row.push(field.trim());field='';},endRow=()=>{endField();if(row.some(Boolean))rows.push(row);row=[];};for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.trim())quoted=true;else if(c===',')endField();else if(c==='\n')endRow();else if(c!=='\r')field+=c;}if(quoted)throw Error('Unterminated CSV');if(field||row.length)endRow();const headers=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));}
const R=JSON.parse(await read('starsector-web/src/campaign/data/reference-battle-autoresolver.json'));
const supported=['com.fs.starfarer.api.campaign.impl.items.BaseSpecialItemPlugin','com.fs.starfarer.api.campaign.impl.items.ShroudedHullmodItemPlugin'];
const specials=csv(await read('starsector-core/data/campaign/special_items.csv')).filter(row=>supported.includes(row.plugin));
const hullmods=Object.values(R.hullmods).filter(row=>row.requiredItem==='custom').map(({id,script})=>({id,script}));
if(hullmods.length!==6)throw Error('Review changed native custom hullmod roster');
for(const {script}of hullmods)await read('decompiled/starfarer_api_source/'+script.replaceAll('.','/')+'.java');
for(const p of ['campaign/impl/items/BaseSpecialItemPlugin.java','campaign/impl/items/ShroudedHullmodItemPlugin.java','impl/campaign/HullModItemManager.java','impl/campaign/ids/Items.java'])await read('decompiled/starfarer_api_source/com/fs/starfarer/api/'+p);
for(const p of ['campaign/ui/trade/CargoItemStack.java','loading/X.java','loading/scripts/ScriptStore.java'])await read('decompiled/starfarer_obf/com/fs/starfarer/'+p);
for(const p of ['starfarer_obf.jar','starfarer.api.jar','json.jar'])await read('starsector-core/'+p);await read('jre/release');await read('starsector-web/scripts/lib/NativeRequiredItemInputs.java');
const run=(exe,args,input='')=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd:repo,windowsHide:true}),out=[],err=[];const timer=setTimeout(()=>{child.kill();reject(Error('Required-item extraction timed out'));},30000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.on('close',code=>{clearTimeout(timer);if(code)reject(Error(Buffer.concat(err).toString()));else resolve(Buffer.concat(out).toString());});child.stdin.end(input);});
const build=await fs.mkdtemp(path.join(repo,'artifacts/native-required-items-')),cp=path.join(root,'starsector-core/*');
await run('C:/Program Files/Java/jdk-17/bin/javac.exe',['--release','17','-encoding','UTF-8','-cp',cp,'-d',build,path.join(repo,'scripts/lib/NativeRequiredItemInputs.java')]);
const original=JSON.parse(await run(path.join(root,'jre/bin/java.exe'),['-Xverify:none','-Djava.awt.headless=true','-cp',build+path.delimiter+cp,'NativeRequiredItemInputs'],JSON.stringify({specials,hullmods})));
const result={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',scope:'native-hullmod-required-items',sources,...original};
const output=path.join(repo,'src/campaign/data/reference-required-items.json'),text=JSON.stringify(result,null,2)+'\n',prior=await fs.readFile(output,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(checking){if(prior!==text)throw Error('Required-item reference changed; review source');}else await fs.writeFile(output,text,{flag:prior===null?'wx':'w'});
console.log(JSON.stringify({hullmods:Object.keys(original.requiredItems).length,specials:Object.keys(original.specials).length,check:checking}));
