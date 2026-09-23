/** Original public hull inputs for BattleAutoresolverPluginImpl. No save or game access. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseFactionText} from './import-campaign-factions.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(repo,'..'),sources={};
const checking=process.argv.includes('--check'),f=Math.fround;
if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Only --check is supported');
async function read(p){const b=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(b).digest('hex')};return b.toString('utf8');}
function csv(text){const rows=[];let row=[],field='',quoted=false;const endField=()=>{row.push(field.trim());field='';},endRow=()=>{endField();if(row.some(Boolean))rows.push(row);row=[];};for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'&&!field.trim())quoted=true;else if(c===',')endField();else if(c==='\n')endRow();else if(c!=='\r')field+=c;}if(quoted)throw Error('Unterminated CSV');if(field||row.length)endRow();const headers=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));}
const api='decompiled/starfarer.api/com/fs/starfarer/api/',obf='decompiled/starfarer_obf/com/fs/starfarer/';
for(const name of ['impl/campaign/BattleAutoresolverPluginImpl.java','impl/campaign/FleetEncounterContext.java','impl/campaign/FleetInteractionDialogPluginImpl.java','util/MutableValue.java','util/Misc.java','util/WeightedRandomPicker.java','impl/campaign/RepairGantry.java','impl/campaign/HullModItemManager.java','impl/campaign/DebugFlags.java','campaign/impl/items/ModSpecItemPlugin.java','campaign/impl/items/BaseSpecialItemPlugin.java','combat/HullModEffect.java','combat/BaseHullMod.java','impl/campaign/rulecmd/salvage/SalvageEntity.java','impl/campaign/rulecmd/salvage/special/BaseSalvageSpecial.java'])await read(api+name);
for(const name of ['campaign/fleet/RepairTracker.java','campaign/fleet/CrewComposition.java','campaign/fleet/CargoData.java','campaign/ui/trade/CargoItemStack.java','campaign/ui/trade/CargoStackView.java','campaign/ui/trade/F.java','campaign/ui/J.java','campaign/ui/G.java','campaign/ui/class.java','coreui/q.java','ui/newui/o0oo_2.java','campaign/fleet/FleetMemberStatus.java','combat/entities/ship/new.java','loading/ShipHullSpecLoader.java','loading/ShipHullSpreadsheetLoader.java','loading/specs/g_0.java','loading/specs/HullVariantSpec.java','util/DynamicStats.java','campaign/BaseCampaignEntity.java','campaign/fleet/FleetMember.java','rpg/Person.java'])await read(obf+name);
const catalog=JSON.parse(await read('starsector-web/src/engine/data/generated/native-catalog.json'));
const sync=JSON.parse(await read('starsector-web/src/campaign/data/reference-fleet-sync.json'));
const rows=new Map(csv(await read('starsector-core/data/hulls/ship_data.csv')).map(r=>[r.id,r]));
const raw=new Map(),hulls={},resolving=new Set();
for(const item of catalog.ships){const value=parseFactionText(await read('starsector-core/'+item.sourcePath));const id=value.skinHullId??value.hullId;if(!raw.has(id))raw.set(id,value);}
function hull(id){
 if(hulls[id])return hulls[id];
 if(!raw.has(id)&&id.endsWith('_default_D'))return hulls[id]={...hull(id.slice(0,-10))};
 const spec=raw.get(id);if(!spec||resolving.has(id))throw Error('Missing/cyclic hull '+id);resolving.add(id);
 let value;
 if(spec.skinHullId){value={...hull(spec.baseHullId),tags:[...new Set((spec.tags??[]).map(t=>t.trim()).filter(Boolean))]};if(Object.hasOwn(spec,'shieldEfficiency'))value.shieldFluxPerDamage=f(spec.shieldEfficiency);}
 else{const row=rows.get(id);if(!row)throw Error('Missing original spreadsheet '+id);
  value={hitpoints:f(Number(row.hitpoints||1)),armorRating:f(Math.max(Number(row['armor rating']||0),1)),shieldType:row['shield type']||null,shieldFluxPerDamage:f(Number(row['shield efficiency']||1)),tags:[...new Set((row.tags??'').split(',').map(t=>t.trim()).filter(Boolean))]};
 }
 if(![value.hitpoints,value.armorRating,value.shieldFluxPerDamage].every(Number.isFinite))throw Error('Invalid original hull '+id);
 hulls[id]=value;resolving.delete(id);return value;
}
for(const id of Object.keys(sync.hulls))hull(id);
const text=await read('starsector-core/data/config/settings.json'),settings={};
for(const key of ['autoresolveDamageMult','maxArmorDamageReduction','crLossMultForRetreatInLoss','salvageCargoFraction','salvageWeaponProb','salvageOwnWeaponProb','salvageWingProb','salvageOwnWingProb','salvageHullmodProb','salvageHullmodRequiredItemProb','salvageValuePerFP','salvageFractionCreditsMin','salvageFractionCreditsMax','easySalvageMult','xpGainMult','playerMaxLevel','skillPointsPerLevel','storyPointsPerLevel','bonusXPUseMultAtMaxLevel','officerXPRequiredMult','officerMaxLevel','maxOfficerPromoteProb','officerPromoteProbMult','drop_prob_officer_alpha_core','drop_prob_officer_beta_core','drop_prob_officer_gamma_core','drop_prob_mult_ai_core_frigate','drop_prob_mult_ai_core_destroyer','drop_prob_mult_ai_core_cruiser','drop_prob_mult_ai_core_capital','drop_prob_mult_ai_core_station']){const matches=[...text.matchAll(new RegExp('^\\s*"'+key+'"\\s*:\\s*([0-9.]+)','gm'))];if(matches.length!==1)throw Error('Missing setting '+key);settings[key]=f(Number(matches[0][1]));}
const weaponRows=new Map(csv(await read('starsector-core/data/weapons/weapon_data.csv')).map(row=>[row.id,row]));
const tags=text=>[...new Set(text.split(',').map(t=>t.trim()).filter(Boolean))];
const cargoItems={weapons:{},wings:{},specials:{}};
for(const item of catalog.weapons){const spec=parseFactionText(await read('starsector-core/'+item.sourcePath)),row=weaponRows.get(item.id);if(!row)throw Error('Missing weapon row '+item.id);const size={SMALL:0,MEDIUM:1,LARGE:2}[spec.size];if(size===undefined)throw Error('Unknown weapon size '+item.id);cargoItems.weapons[item.id]={tags:tags(row.tags),name:row.name,iconLayers:[spec.turretSprite??spec.hardpointSprite,spec.turretGunSprite].filter(Boolean),size,stackSize:[40,20,10][size],cargoSpace:sync.weaponSpace[item.id]};}
const variants=new Map(catalog.variants.map(row=>[row.id,row.spec]));
for(const row of csv(await read('starsector-core/data/hulls/wing_data.csv'))){if(!row.id)continue;const variant=variants.get(row.variant);if(!variant)throw Error('Missing wing variant '+row.variant);const hullRow=rows.get(variant.hullId);if(!hullRow)throw Error('Missing fighter hull '+variant.hullId);cargoItems.wings[row.id]={tags:tags(row.tags),hullName:hullRow.name,icon:'graphics/icons/cargo/fighter_lpc.png',overlay:raw.get(variant.hullId)?.spriteName??null,stackSize:10000,cargoSpace:1};}
for(const row of csv(await read('starsector-core/data/campaign/special_items.csv'))){if(!row.id)continue;cargoItems.specials[row.id]={name:row.name,icon:row.icon||null,tags:tags(row.tags),order:row.order?f(Number(row.order)):null,stackSize:row['stack size']?f(Number(row['stack size'])):null,cargoSpace:row['cargo space']?f(Number(row['cargo space'])):null,plugin:row.plugin||null};}
const requiredCache=new Map();
async function requiredItem(script,seen=new Set()){
 if(requiredCache.has(script))return requiredCache.get(script);
 if(seen.has(script))throw Error('Cyclic hullmod class '+script);seen.add(script);
 const file=script.startsWith('data.')?'starsector-core/'+script.replaceAll('.','/')+'.java':script.startsWith('com.fs.starfarer.api.')?api+script.slice(21).replaceAll('.','/')+'.java':null;
 if(!file)return 'unknown';let body;try{body=await read(file);}catch(e){if(e.code==='ENOENT')return 'unknown';throw e;}
 let result;
 if(/(?:public|protected)\s+(?:[\w.]+)\s+getRequiredItem\s*\(\s*\)\s*\{/.test(body))result='custom';
 else if(script==='com.fs.starfarer.api.combat.BaseHullMod'||/class\s+\w+\s+implements\s+HullModEffect\s*\{/.test(body))result='default-null';
 else{let parent=body.match(/class\s+\w+\s+extends\s+([\w.]+)/)?.[1];if(parent&&!parent.includes('.'))parent=body.match(new RegExp('import\\s+([\\w.]+\\.'+parent+');'))?.[1]??script.slice(0,script.lastIndexOf('.')+1)+parent;result=parent?await requiredItem(parent,seen):'unknown';}
 requiredCache.set(script,result);return result;
}
const hullmods={};
for(const row of csv(await read('starsector-core/data/hullmods/hull_mods.csv'))){if(!row.id)continue;const boolean=key=>{const v=row[key].toLowerCase();if(!['','true','false'].includes(v))throw Error('Unknown hullmod boolean '+key+'/'+row.id);return v==='true';};hullmods[row.id]={id:row.id,name:row.name,icon:row.sprite||null,manufacturer:row['tech/manufacturer']||null,baseValue:row['base value']?f(Number(row['base value'])):null,tags:tags(row.tags),hidden:boolean('hidden'),hiddenEverywhere:boolean('hiddenEverywhere'),script:row.script,requiredItem:await requiredItem(row.script)};}
const gantryText=await read(api+'impl/campaign/RepairGantry.java'),gantry={hullSizeMap:{}};
for(const m of gantryText.matchAll(/mag.put\(ShipAPI.HullSize.(\w+), Float.valueOf\(([0-9.]+)f\)\)/g))gantry.hullSizeMap[m[1]]=f(Number(m[2]));
for(const key of ['BATTLE_SALVAGE_MULT','MIN_CR']){const m=gantryText.match(new RegExp(key+' = ([0-9.]+)f;'));if(!m)throw Error('Missing gantry '+key);gantry[key]=f(Number(m[1]));}
if(Object.keys(gantry.hullSizeMap).length!==4)throw Error('Missing gantry sizes');
const playerXPText=(await read('starsector-core/data/scripts/plugins/LevelupPluginImpl.java')).replace(/\/\/[^\n]*/g,'');
const officerXPText=await read(api+'impl/campaign/OfficerLevelupPluginImpl.java');
for(const name of ['campaign/CharacterStats.java','rpg/OfficerData.java','campaign/save/CampaignGameManager.java'])await read(obf+name);
const playerXP=playerXPText.match(/XP_PER_LEVEL = new long \[\] \{([\s\S]*?)\};/)?.[1].split(',').map(s=>s.trim()).filter(Boolean).map(Number);
if(!playerXP||playerXP.length!==15||!playerXP.every(Number.isSafeInteger))throw Error('Missing player XP table');
const officerXP=Array(10).fill(0);for(const m of officerXPText.matchAll(/lArray\[(\d+)\] = (\d+)L;/g))officerXP[Number(m[1])]=Number(m[2]);
if(officerXP.some((n,i)=>i>0&&n===0))throw Error('Missing officer XP table');
const constant=(body,key)=>{const m=body.match(new RegExp(key+' = ([0-9.]+)f?;'));if(!m)throw Error('Missing XP constant '+key);return f(Number(m[1]));};
const experience={playerXP,officerXP,playerExponent:constant(playerXPText,'EXPONENT_BEYOND_MAX_SPECIFIED_LEVEL'),officerExponent:constant(officerXPText,'EXPONENT_BEYOND_MAX_SPECIFIED_LEVEL'),maxStoryXPMult:constant(playerXPText,'XP_REQUIRED_FOR_STORY_POINT_GAIN_AT_MAX_LEVEL_MULT'),maxStoryXPBaseLevel:constant(playerXPText,'LEVEL_FOR_BASE_XP_FOR_MAXED_STORY_POINT_GAIN')};
const repLevelsText=await read(api+'campaign/RepLevel.java'),repText=await read(api+'impl/campaign/CoreReputationPlugin.java');
for(const name of ['impl/campaign/CoreCampaignPluginImpl.java','characters/RelationshipAPI.java'])await read(api+name);
for(const name of ['campaign/FactionManager.java','campaign/Faction.java','campaign/Relationship.java','campaign/CampaignEngine.java','campaign/ModAndPluginData.java'])await read(obf+name);
const threshold=Object.fromEntries(['T1','T2','T3','T4'].map(key=>[key,constant(repLevelsText,key)])),bound=s=>s.startsWith('RepLevel.get')?threshold[s.slice(12,14)]:f(Number(s.replace(/f$/,'')));
const levels=[...repLevelsText.matchAll(/^    (\w+)\("([^"]+)", (RepLevel\.getT[1-4]\(\)|[0-9.]+f), (RepLevel\.getT[1-4]\(\)|[0-9.]+f)\)/gm)].map(([,id,label,min,max])=>({id,label:label.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))),min:bound(min),max:bound(max)}));
if(levels.length!==9||levels.some(l=>!Number.isFinite(l.min)||!Number.isFinite(l.max)))throw Error('Missing RepLevel bounds');
const repActions=repText.match(/public static enum RepActions \{([\s\S]*?)\}/)?.[1];if(!repActions)throw Error('Missing native reputation actions');const reputation={levels,actions:[...repActions.matchAll(/^\s*(\w+)[,;]/gm)].map(m=>m[1])};
const result={schemaVersion:1,scope:'native-default-battle-autoresolver-inputs',originalReference:'Starsector 0.98a-RC8',sources,settings,hulls,cargoItems,hullmods,gantry,experience,reputation};
const dest=path.join(repo,'src/campaign/data/reference-battle-autoresolver.json'),output=JSON.stringify(result,null,2)+'\n';
let old=null;try{old=await fs.readFile(dest,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(checking){if(old!==output)throw Error('Autoresolver reference differs');}else await fs.writeFile(dest,output,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({hulls:Object.keys(hulls).length,sources:Object.keys(sources).length}));
