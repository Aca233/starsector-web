/** Targeted campaign data import. Reads native settings + existing catalog only; no asset writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length>3)throw Error('Usage: node scripts/import-campaign-reference.mjs [StarsectorCore]');
const core=path.resolve(process.argv[2]??path.join(project,'../starsector-core'));
const source=await fs.readFile(path.join(core,'data/config/settings.json'),'utf8');
const catalogBytes=await fs.readFile(path.join(project,'src/engine/data/generated/native-catalog.json'),'utf8');
const catalog=JSON.parse(catalogBytes);
const sha256=text=>createHash('sha256').update(text).digest('hex');
const setting=key=>{
  const matches=[...source.matchAll(new RegExp('^\\s*"'+key+'"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)','gm'))];
  if(matches.length!==1)throw Error('Missing/ambiguous native setting: '+key);
  const value=Number(matches[0][1]);if(!Number.isFinite(value)||value<0)throw Error('Invalid setting: '+key);return value;
};
const settings={daysPerMonth:30,secondsPerDay:10,
  crewPerDay:setting('suppliesPerCrewPerDay'),marinesPerDay:setting('suppliesPerMarinePerDay'),
  excessCargoPerDay:setting('suppliesPerCargoUnitOverCapacity'),excessFuelPerDay:setting('suppliesPerFuelUnitOverCapacity'),
  excessPersonnelPerDay:setting('suppliesPerPersonnelUnitOverCapacity'),excessPerCategoryCap:setting('maxSuppliesPerDayForOverCapacity'),
  maxShips:setting('maxShipsInFleet'),excessShipFraction:setting('suppliesPerShipOverMaxInFleet')};
const fields={minCrew:'min crew',maxCrew:'max crew',cargoCapacity:'cargo',fuelCapacity:'fuel',fuelPerLightYear:'fuel/ly',
  maxBurn:'max burn',baseValue:'base value',baseRecoveryPercentPerDay:'cr %/day',deployCRPercent:'CR to deploy',
  deploymentSupplies:'supplies/rec',suppliesPerMonth:'supplies/mo'};
const recovery={mothballedMaintenanceMult:setting('supplyConsumptionMothballedMult'),
  repairPercentPerDay:{FRIGATE:setting('baseRepairRateFrigate'),DESTROYER:setting('baseRepairRateDestroyer'),
    CRUISER:setting('baseRepairRateCruiser'),CAPITAL_SHIP:setting('baseRepairRateCapital')}};
const navigation={baseFleetSelectionRadius:setting('baseFleetSelectionRadius'),fleetSelectionRadiusPerUnitSize:setting('fleetSelectionRadiusPerUnitSize'),maxFleetSelectionRadius:setting('maxFleetSelectionRadius'),minTravelSpeed:setting('minTravelSpeed'),unitsPerLightYear:setting('unitsPerLightYear'),baseTravelSpeed:setting('baseTravelSpeed'),speedPerBurnLevel:setting('speedPerBurnLevel')};
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  const endField=()=>{row.push(field.trim());field='';};
  const endRow=()=>{endField();if(row.some(v=>v))rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else if(ch==='"'&&!field.trim())quoted=true;else if(ch===',')endField();else if(ch==='\n')endRow();else if(ch!=='\r')field+=ch;
  }
  if(quoted)throw Error('Unterminated commodity CSV field');if(field||row.length)endRow();
  const headers=rows.shift();return rows.filter(r=>!r[0].startsWith('#')).map(r=>Object.fromEntries(headers.map((key,i)=>[key,r[i]??''])));
}
const commodityBytes=await fs.readFile(path.join(core,'data/campaign/commodities.csv'),'utf8');
const commodities={},excludedCommodities=[];
for(const row of parseCsv(commodityBytes)){
  if(!row.id)continue;const space=Number(row['cargo space']);
  if(!row['cargo space']||!Number.isFinite(space)||space<0){excludedCommodities.push({id:row.id,reason:'Missing or invalid cargo space; no default inferred'});continue;}
  if(Object.hasOwn(commodities,row.id))throw Error('Duplicate commodity: '+row.id);
  commodities[row.id]={id:row.id,name:row.name,cargoSpace:space,tags:row.tags.split(',').map(v=>v.trim()).filter(Boolean)};
}
const hulls={},excluded=[],seen=new Set();
for(const row of catalog.ships){
  if(seen.has(row.id)){excluded.push({id:row.id,reason:'Duplicate catalog ID; first record is authoritative, as in catalog consumers'});continue;}
  seen.add(row.id);
  if(row.spec?.hullSize==='FIGHTER'){excluded.push({id:row.id,reason:'Fighter, not an independently owned campaign ship'});continue;}
  if(row.stats?.['logistics n/a reason']){excluded.push({id:row.id,reason:row.stats['logistics n/a reason']});continue;}
  const stats={},missing=[];
  for(const [key,column]of Object.entries(fields)){
    const raw=row.stats?.[column];
    if(typeof raw!=='string'||!raw.trim()||!Number.isFinite(Number(raw))||Number(raw)<0)missing.push(column);
    else stats[key]=Number(raw);
  }
  if(missing.length){excluded.push({id:row.id,reason:'Incomplete logistics fields: '+missing.join(', ')});continue;}
  hulls[row.id]={id:row.id,name:row.stats.name,hullSize:row.spec?.hullSize??null,sourcePath:row.sourcePath,builtInMods:row.spec?.builtInMods??[],hasModules:(row.spec?.weaponSlots??[]).some(slot=>slot.type==='STATION_MODULE'),...stats};
}
const result={schemaVersion:1,originalReference:'Starsector 0.98a-RC8',
  provenance:{commoditiesSha256:sha256(commodityBytes),settingsSha256:sha256(source),catalogSha256:sha256(catalogBytes),referenceVersionEvidence:'Local starsector-core/starsector.log launcher line observed 2026-09-19; does not verify all installed modifications',
    settings:'data/config/settings.json',hulls:'Existing native-catalog.json ship stats (origin data/hulls/ship_data.csv)',
    timeConstants:'CampaignClock.java SECONDS_PER_GAME_DAY and convertToMonths, source inspected 2026-09-19',
    scope:'Base hull logistics data and quoted effective-stat formulas; no claim of modifier, repair advancement, economy or gameplay parity'},
  settings,recovery,navigation,commodities,excludedCommodities,hulls:Object.fromEntries(Object.entries(hulls).sort(([a],[b])=>a.localeCompare(b))),excluded};
const destination=path.join(project,'src/campaign/data/reference-logistics.json');
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination+'.tmp',JSON.stringify(result,null,2)+'\n','utf8');await fs.rename(destination+'.tmp',destination);
console.log(JSON.stringify({destination,hulls:Object.keys(hulls).length,excluded:excluded.length,settings},null,2));
