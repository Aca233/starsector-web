/** Public installed geometry/tags needed by native fleet accidents; never reads a save or starts a game. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {parseFactionText} from './import-campaign-factions.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(repo,'..'),sources={},checking=process.argv.includes('--check');
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Only --check is supported');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
const obf='decompiled/starfarer_obf/com/fs/starfarer/';
for(const p of ['campaign/accidents/AccidentManager.java','campaign/accidents/AccidentRisk.java','campaign/accidents/O0oO.java','campaign/accidents/oooo_0.java','campaign/accidents/ShipLoss.java','campaign/fleet/FleetMemberStatus.java','campaign/fleet/CargoData.java','campaign/ui/trade/CargoItemStack.java','combat/entities/ship/new.java','loading/ShipHullSpecLoader.java','loading/specs/Q.java','campaign/save/CampaignGameManager.java'])await read(obf+p);
for(const dir of ['campaign/accidents','campaign/B'])for(const name of await fs.readdir(path.join(root,obf,dir)))if((dir.endsWith('accidents')?name.startsWith('Oo0'):name.startsWith('ooOO'))&&name.length>100)await read(obf+dir+'/'+name);
await read('decompiled/starfarer.api/com/fs/starfarer/api/util/WeightedRandomPicker.java');await read('starsector-core/starfarer_obf.jar');
const catalog=JSON.parse(await read('starsector-web/src/engine/data/generated/native-catalog.json')),sync=JSON.parse(await read('starsector-web/src/campaign/data/reference-fleet-sync.json')),raw={};
for(const h of catalog.ships){const s=parseFactionText(await read('starsector-core/'+h.sourcePath));raw[s.skinHullId??s.hullId]??=s;}
const hulls={},f=Math.fround;
function hull(id){if(hulls[id])return hulls[id];const s=raw[id];if(!s){if(id.endsWith('_default_D'))return hulls[id]={...hull(id.slice(0,-10))};throw Error('Missing hull '+id);}
 if(s.skinHullId)return hulls[id]={...hull(s.baseHullId)};
 const width=f(s.width),height=f(s.height),cx=f(s.center[0]),cy=f(s.center[1]),cell=f(Math.min(Math.max(15,f(height/10)),30));
 const gridWidth=Math.ceil(f(f(width-cx)/cell))+Math.ceil(f(cx/cell))+4,gridHeight=Math.ceil(f(f(height-cy)/cell))+Math.ceil(f(cy/cell))+4;
 const ordinal=['DEFAULT','FIGHTER','FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP'].indexOf(s.hullSize);if(ordinal<0||![width,height,cx,cy,cell,gridWidth,gridHeight].every(Number.isFinite))throw Error('Invalid original hull geometry');
 return hulls[id]={width,height,center:[cx,cy],cellSize:cell,gridWidth,gridHeight,hullSizeOrdinal:ordinal};}
for(const id of Object.keys(sync.hulls))hull(id);
// Same CSV quoting semantics as the existing public-reference importer; tags alone are read here.
function csv(text){const rows=[];let row=[],field='',quoted=false;const endField=()=>{row.push(field.trim());field='';},endRow=()=>{endField();if(row.some(Boolean))rows.push(row);row=[];};for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.trim())quoted=true;else if(c===',')endField();else if(c==='\n')endRow();else if(c!=='\r')field+=c;}if(quoted)throw Error('Unterminated CSV');if(field||row.length)endRow();const headers=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));}
const weaponRows=new Map(csv(await read('starsector-core/data/weapons/weapon_data.csv')).map(row=>[row.id,row])),weapons={};
for(const w of catalog.weapons){const s=parseFactionText(await read('starsector-core/'+w.sourcePath)),row=weaponRows.get(w.id);if(!row)throw Error('Missing actual weapon stats');const maxSize={SMALL:40,MEDIUM:20,LARGE:10}[s.size],space=sync.weaponSpace[w.id];if(!maxSize||space===undefined)throw Error('Missing weapon size');weapons[w.id]={maxSize,cargoSpace:space,tags:row.tags.split(',').map(v=>v.trim()).filter(Boolean)};}
const result={schemaVersion:1,scope:'native-fleet-accident-public-inputs',originalReference:'Starsector 0.98a-RC8',sources,hulls,weapons};
const dest=path.join(repo,'src/campaign/data/reference-fleet-accidents.json'),text=JSON.stringify(result,null,2)+'\n';let old=null;try{old=await fs.readFile(dest,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if(checking){if(old!==text)throw Error('Accident inputs differ');}else await fs.writeFile(dest,text,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({hulls:Object.keys(hulls).length,weapons:Object.keys(weapons).length,sources:Object.keys(sources).length}));
