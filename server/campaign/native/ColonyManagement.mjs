/** Read-only selected-market projection, not an ownership rule or an economic command.
 * Original evidence: docs/campaign-colony-management-source-notes-2026-09-22.md.
 * Never call snapshot/checkpoint, lazy network getters, getAdmin or industry constructors. */
import {immutableJSON} from '../../../src/campaign/core/Values.mjs';
import {resolveOriginalEconomyMutable} from '../../../src/campaign/rules/OriginalMarketEconomy.mjs';
import {originalCachedCommodityExportIncome} from '../../../src/campaign/rules/OriginalCommodityCache.mjs';
import {originalImmigrationHazardEffects} from '../../../src/campaign/rules/OriginalImmigration.mjs';
import {originalPersonnelByRef} from '../../../src/campaign/rules/OriginalMarketPersonnel.mjs';
import {ORIGINAL_ADMINISTRATORS} from '../../../src/campaign/rules/OriginalAdministrator.mjs';

// Stock spec name/image columns from local 0.98a-RC8 data/campaign/industries.csv.
// These are labels, NOT build candidates or plugin getCurrentImage/getCurrentName evaluations.
const specs = new Map([
  ["population",{"title":"居住区 & 基础设施","icon":"graphics/icons/industry/population.png","buildTimeDays":null}],
  ["farming",{"title":"农业","icon":"graphics/icons/industry/farming.png","buildTimeDays":60.0}],
  ["aquaculture",{"title":"水产养殖","icon":"graphics/icons/industry/aquaculture.png","buildTimeDays":60.0}],
  ["mining",{"title":"采矿业","icon":"graphics/icons/industry/mining.png","buildTimeDays":60.0}],
  ["techmining",{"title":"技术挖掘","icon":"graphics/icons/industry/techmining.png","buildTimeDays":45.0}],
  ["refining",{"title":"冶炼厂","icon":"graphics/icons/industry/refining.png","buildTimeDays":90.0}],
  ["spaceport",{"title":"太空港","icon":"graphics/icons/industry/spaceport.png","buildTimeDays":15.0}],
  ["megaport",{"title":"特大型港口","icon":"graphics/icons/industry/megaport.png","buildTimeDays":150.0}],
  ["lightindustry",{"title":"轻工业","icon":"graphics/icons/industry/light_industry.png","buildTimeDays":90.0}],
  ["heavyindustry",{"title":"重工业","icon":"graphics/icons/industry/heavy_industry.png","buildTimeDays":120.0}],
  ["orbitalworks",{"title":"轨道工业设施","icon":"graphics/icons/industry/orbital_works.png","buildTimeDays":150.0}],
  ["fuelprod",{"title":"燃料生产","icon":"graphics/icons/industry/fuel_production.png","buildTimeDays":120.0}],
  ["commerce",{"title":"贸易中心","icon":"graphics/icons/industry/commerce.png","buildTimeDays":90.0}],
  ["station_base",{"title":"轨道空间站","icon":"graphics/icons/industry/station_category.png","buildTimeDays":null}],
  ["orbitalstation",{"title":"轨道空间站 - 低端技术","icon":"graphics/icons/industry/orbital_station.png","buildTimeDays":90.0}],
  ["battlestation",{"title":"作战基地 - 低端技术","icon":"graphics/icons/industry/battlestation.png","buildTimeDays":120.0}],
  ["starfortress",{"title":"星际要塞 - 低端技术","icon":"graphics/icons/industry/star_fortress.png","buildTimeDays":180.0}],
  ["orbitalstation_mid",{"title":"轨道空间站 - 中线技术","icon":"graphics/icons/industry/orbital_station.png","buildTimeDays":90.0}],
  ["battlestation_mid",{"title":"作战基地 - 中线技术","icon":"graphics/icons/industry/battlestation.png","buildTimeDays":120.0}],
  ["starfortress_mid",{"title":"星际要塞 - 中线技术","icon":"graphics/icons/industry/star_fortress.png","buildTimeDays":180.0}],
  ["orbitalstation_high",{"title":"轨道空间站 - 高新技术","icon":"graphics/icons/industry/orbital_station.png","buildTimeDays":90.0}],
  ["battlestation_high",{"title":"作战基地 - 高新技术","icon":"graphics/icons/industry/battlestation.png","buildTimeDays":120.0}],
  ["starfortress_high",{"title":"星际要塞 - 高新技术","icon":"graphics/icons/industry/star_fortress.png","buildTimeDays":180.0}],
  ["grounddefenses",{"title":"地面防御设施","icon":"graphics/icons/industry/ground_defenses.png","buildTimeDays":60.0}],
  ["heavybatteries",{"title":"重型防御阵列","icon":"graphics/icons/industry/heavy_batteries.png","buildTimeDays":90.0}],
  ["patrolhq",{"title":"巡逻队总部","icon":"graphics/icons/industry/patrol_hq.png","buildTimeDays":60.0}],
  ["militarybase",{"title":"军事基地","icon":"graphics/icons/industry/military_base.png","buildTimeDays":120.0}],
  ["highcommand",{"title":"最高指挥部","icon":"graphics/icons/industry/high_command.png","buildTimeDays":120.0}],
  ["lionsguard",{"title":"狮心卫队总部","icon":"graphics/icons/industry/lions_guard.png","buildTimeDays":60.0}],
  ["planetaryshield",{"title":"行星护盾","icon":"graphics/icons/industry/planetary_shield.png","buildTimeDays":90.0}],
  ["waystation",{"title":"星际驿站","icon":"graphics/icons/industry/waystation.png","buildTimeDays":60.0}],
  ["cryosanctum",{"title":"低温避难所","icon":"graphics/icons/industry/cryosanctum.png","buildTimeDays":90.0}],
  ["cryorevival",{"title":"低温复苏设施","icon":"graphics/icons/industry/cryorevival.png","buildTimeDays":60.0}]
]);
const f = Math.fround;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const emptyFinances = () => ({industryIncome:null,exportIncome:null,grossIncome:null,industryUpkeep:null,shortageCost:null,incentiveCost:null,totalExpenses:null,netIncome:null});
function unavailable(marketId, blockers) {
  return (field, code = 'NATIVE_COLONY_VALUE_UNAVAILABLE') => {
    if (!blockers.some(item => item.field === field && item.code === code)) blockers.push({marketId,field,code});
    return null;
  };
}
function number(value, field, missing) { return finite(value) ? value : missing(field); }
function string(value, field, missing) { return typeof value === 'string' ? value : missing(field); }
function boolean(value, field, missing) { return typeof value === 'boolean' ? value : missing(field); }
function mutable(value, field, missing) {
  try { const result = resolveOriginalEconomyMutable(value); return finite(result) ? result : missing(field); }
  catch { return missing(field, 'NATIVE_COLONY_STAT_UNAVAILABLE'); }
}
function labels(id, field, missing) {
  const found = specs.get(id);
  if (!found) { missing(field, 'NATIVE_COLONY_INDUSTRY_SPEC_UNAVAILABLE'); return {title:null,icon:null}; }
  return {title:found.title,icon:found.icon};
}
function gate(canConstruct, id) {
  if (typeof canConstruct !== 'function') return 'NATIVE_COLONY_PERMISSION_NOT_EVALUATED';
  try {
    const result = canConstruct(id);
    return result === null ? null : typeof result === 'string' && result.length > 0 ? result : 'NATIVE_COLONY_INVALID_PERMISSION_RESULT';
  } catch { return 'NATIVE_COLONY_PERMISSION_UNAVAILABLE'; }
}
function activeRows(m) {
  return ['resourceLifecycle','civicLifecycle','productionLifecycle','industryLifecycle']
    .flatMap(key => Array.isArray(m[key]?.industries) ? m[key].industries.filter(row => row?.active === true) : []);
}
function projectIndustries(m, missing) {
  if (!Array.isArray(m.industries) || m.industries.some(entry => typeof entry?.state?.industryId !== 'string')) return missing('industries', 'NATIVE_COLONY_INDUSTRIES_UNAVAILABLE');
  const rows = activeRows(m);
  return m.industries.map((entry,index) => {
    const id = entry.state.industryId, field = `industries.${index}`;
    const matches = rows.filter(row => row.entry === entry), row = matches.length === 1 ? matches[0] : null;
    const objectRef = row ? string(row.objectRef, `${field}.objectRef`, missing) : missing(`${field}.objectRef`, 'NATIVE_COLONY_LIFECYCLE_UNAVAILABLE');
    const building = boolean(entry.operating?.building, `${field}.building`, missing);
    const disrupted = boolean(entry.operating?.disrupted, `${field}.disrupted`, missing);
    const upgradeId = entry.operating?.upgradeId === null ? null : string(entry.operating?.upgradeId, `${field}.upgradeId`, missing);
    let construction = null;
    if (building === true) {
      if (row && finite(row.buildProgress) && row.buildProgress >= 0 && finite(row.buildTime) && row.buildTime > 0 && disrupted !== null) {
        construction = {progressDays:row.buildProgress,totalDays:row.buildTime,remainingDays:Math.max(0,f(row.buildTime-row.buildProgress)),fraction:disrupted ? 0 : Math.min(1,f(row.buildProgress/row.buildTime))};
      } else missing(`${field}.construction`, 'NATIVE_COLONY_CONSTRUCTION_HISTORY_UNAVAILABLE');
    }
    // A null override means native spec-derived cost, not zero paid. Never reconstruct a paid amount.
    const buildCost = row?.buildCostOverride === null ? null : row ? number(row.buildCostOverride, `${field}.buildCost`, missing) : null;
    if (building === true && buildCost === null) missing(`${field}.buildCost`, 'NATIVE_COLONY_PAID_BUILD_COST_UNAVAILABLE');
    const financeMatches = Array.isArray(m.finances) ? m.finances.filter(item => item.industryId === id) : [];
    const finance = financeMatches.length === 1 ? financeMatches[0] : null;
    return {industryId:id,objectRef,index,...labels(id,field,missing),building,disrupted,upgradeId,construction,buildCost,
      income:mutable(finance?.income,`${field}.income`,missing),upkeep:mutable(finance?.upkeep,`${field}.upkeep`,missing)};
  });
}
function projectQueue(m, mutationBlocker, missing) {
  const queue = m.constructionQueueState;
  if (!queue || !Array.isArray(queue.items) || queue.items.some(item => typeof item?.industryId !== 'string')) return missing('queue', 'NATIVE_COLONY_QUEUE_UNAVAILABLE');
  const ids = queue.items.map(item => item.industryId);
  const aligned = Array.isArray(m.constructionQueue) && ids.length === m.constructionQueue.length && ids.every((id,index) => id === m.constructionQueue[index]);
  const unique = new Set(ids).size === ids.length && new Set(queue.items.map(item => item.objectRef)).size === queue.items.length;
  const complete = aligned && unique && queue.items.every(item => typeof item.objectRef === 'string' && Number.isInteger(item.cost) && item.cost >= 0);
  if (!complete) missing('queue', 'NATIVE_COLONY_QUEUE_NOT_ACTIONABLE');
  return queue.items.map((item,index) => {
    const field = `queue.${index}`, blocker = mutationBlocker ?? (complete ? null : 'NATIVE_COLONY_QUEUE_NOT_ACTIONABLE');
    const swapBlocker = blocker ?? (queue.items.length > 1 ? null : 'NATIVE_COLONY_QUEUE_NO_SWAP_TARGET');
    return {objectRef:string(item.objectRef,`${field}.objectRef`,missing),industryId:item.industryId,index,...labels(item.industryId,field,missing),
      cost:Number.isInteger(item.cost) && item.cost >= 0 ? item.cost : missing(`${field}.cost`),
      buildTimeDays:specs.get(item.industryId)?.buildTimeDays ?? missing(`${field}.buildTimeDays`, 'NATIVE_COLONY_BUILD_TIME_UNAVAILABLE'),
      canCancel:blocker === null,canSwap:swapBlocker === null,mutationBlocker:blocker,cancelBlocker:blocker,swapBlocker};
  });
}
function projectAdministrator(runtime, m, missing) {
  const record = m.personnel;
  if (!record || record.marketId !== m.marketId || record.marketRef !== m.objectRef || typeof record.adminRef !== 'string') return missing('administrator', 'NATIVE_COLONY_ADMINISTRATOR_UNRESOLVED');
  let state, person;
  try { state = runtime.playerEconomyState(); person = originalPersonnelByRef(state,record.adminRef); }
  catch { return missing('administrator', 'NATIVE_COLONY_ADMINISTRATOR_UNAVAILABLE'); }
  // Native getAdmin would mutate here. The read endpoint must not hide that behind a UI lookup.
  if (m.playerOwned && (!Object.hasOwn(person,'portraitSprite') || person.portraitSprite === ORIGINAL_ADMINISTRATORS.defaultPortrait)) return missing('administrator', 'NATIVE_COLONY_ADMINISTRATOR_REQUIRES_RESOLUTION');
  const names = [person.name?.first,person.name?.last];
  const name = names.every(part => part === null || typeof part === 'string') && names.some(part => typeof part === 'string' && part.length > 0)
    ? names.filter(part => part !== null && part.length > 0).join(' ') : missing('administrator.name');
  return {personId:string(person.id,'administrator.personId',missing),name,
    portrait:person.portraitSprite === null ? null : string(person.portraitSprite,'administrator.portrait',missing),
    aiCoreId:person.aiCoreId === null ? null : string(person.aiCoreId,'administrator.aiCoreId',missing),
    isPlayer:state.player ? person === state.player : missing('administrator.isPlayer')};
}
function exportIncome(runtime, m, missing) {
  if (!m.commodities || typeof m.commodities !== 'object' || Array.isArray(m.commodities) || typeof runtime.peekCommodityData !== 'function') return missing('finances.exportIncome', 'NATIVE_COLONY_EXPORTS_UNAVAILABLE');
  let total = 0;
  try {
    for (const id of Object.keys(m.commodities)) {
      // Native CommodityOnMarket.getExportIncome returns 0 for an unbound network. Do not initialize it.
      const entry = runtime.peekCommodityData(m.marketId,id);
      if (entry === null) continue;
      if (!entry?.data || !Array.isArray(entry.data.markets)) throw new Error('missing cached export inputs');
      const row = entry.data.markets.find(item => item.marketId === m.marketId);
      if (row?.sourceIsIllegal === true) continue;
      if (typeof m.playerOwned !== 'boolean') throw new Error('missing current ownership');
      let playerCommodityExportMult = null;
      if (m.playerOwned) {
        if (!runtime.playerExportModifiers || !Object.hasOwn(runtime.playerExportModifiers,id)) throw new Error('missing current export modifier');
        const mod = runtime.playerExportModifiers[id];
        playerCommodityExportMult = mod === null ? 1 : resolveOriginalEconomyMutable(mod);
      }
      const income = originalCachedCommodityExportIncome({sourceIsIllegal:false,exportMarketShare:row?.exportMarketShare ?? 0,marketValue:entry.data.marketValue,
        incomeMult:m.incomeMult,playerOwned:m.playerOwned,playerCommodityExportMult});
      total = f(total + income);
    }
    return finite(total) ? total : missing('finances.exportIncome');
  } catch { return missing('finances.exportIncome', 'NATIVE_COLONY_EXPORTS_UNAVAILABLE'); }
}
function projectFinances(runtime, m, industries, hazard, size, missing) {
  const sum = key => industries !== null && industries.every(item => item[key] !== null) ? industries.reduce((value,item) => f(value + item[key]),0) : null;
  const industryIncome = sum('income'), industryUpkeep = sum('upkeep'), exports = exportIncome(runtime,m,missing);
  if (industryIncome === null) missing('finances.industryIncome');
  if (industryUpkeep === null) missing('finances.industryUpkeep');
  const grossIncome = industryIncome !== null && exports !== null ? f(industryIncome + exports) : missing('finances.grossIncome');
  // Complete roster with no local_resources proves native getShortageCounteringCost() == 0,
  // regardless of its enable flag. Otherwise that plugin's actual estimate/flag is not exposed.
  const retail = m.retail;
  const noLocalResources = retail && Array.isArray(retail.unresolved) && retail.unresolved.length === 0 && Array.isArray(retail.submarkets) && Array.isArray(retail.otherSubmarkets)
    && [...retail.submarkets,...retail.otherSubmarkets].every(item => typeof item.specId === 'string' && item.specId !== 'local_resources');
  const shortageCost = noLocalResources ? 0 : missing('finances.shortageCost', 'NATIVE_COLONY_SHORTAGE_COST_UNAVAILABLE');
  let incentiveCost = null;
  if (m.incentives?.on === false) incentiveCost = 0;
  else if (m.incentives?.on === true && hazard !== null && size !== null) {
    try { incentiveCost = originalImmigrationHazardEffects({hazard,marketSize:size}).incentiveCost; }
    catch { /* Report incomplete live inputs below; never replace with the accumulated credit ledger. */ }
  }
  if (incentiveCost === null) missing('finances.incentiveCost', 'NATIVE_COLONY_INCENTIVE_COST_UNAVAILABLE');
  const totalExpenses = [industryUpkeep,shortageCost,incentiveCost].every(value => value !== null) ? f(f(industryUpkeep + shortageCost) + incentiveCost) : missing('finances.totalExpenses', 'NATIVE_COLONY_FINANCE_TOTAL_UNAVAILABLE');
  // Keep Market.getNetIncome's Java-float subtraction order, not gross - rounded expense total.
  const netIncome = grossIncome !== null && totalExpenses !== null ? f(f(f(grossIncome - industryUpkeep) - shortageCost) - incentiveCost) : missing('finances.netIncome', 'NATIVE_COLONY_FINANCE_TOTAL_UNAVAILABLE');
  return {industryIncome,exportIncome:exports,grossIncome,industryUpkeep,shortageCost,incentiveCost,totalExpenses,netIncome};
}
function missingMarket(marketId) {
  const blockers = [{marketId,field:'market',code:'NATIVE_COLONY_MARKET_UNAVAILABLE'}];
  return {marketId,objectRef:null,name:null,factionId:null,size:null,stability:null,hazard:null,location:{hyperspace:null,systemName:null,planetType:null},administrator:null,tech:null,
    finances:emptyFinances(),industries:null,queue:null,mutationBlocker:'NATIVE_COLONY_MARKET_UNAVAILABLE',buildOptions:null,buildOptionsBlocker:'NATIVE_COLONY_MARKET_UNAVAILABLE',blockers};
}
function projectMarket(runtime, marketId, canConstruct) {
  let m;
  try { m = runtime.market(marketId); } catch { return missingMarket(marketId); }
  if (!m || m.marketId !== marketId) return missingMarket(marketId);
  const blockers = [], missing = unavailable(marketId,blockers), mutationBlocker = gate(canConstruct,marketId);
  if (mutationBlocker !== null) missing('mutation', mutationBlocker);
  const objectRef = string(m.objectRef,'objectRef',missing), name = string(m.name,'name',missing), factionId = string(m.factionId,'factionId',missing);
  const size = Number.isInteger(m.size) && m.size >= 0 ? m.size : missing('size');
  const power = mutable(m.stability,'stability',missing), stability = power === null ? null : Math.floor(Math.max(0,Math.min(10,power)) + .5);
  const hazard = mutable(m.hazard,'hazard',missing);
  const hyperspace = finite(m.location?.x) && finite(m.location?.y) ? {x:m.location.x,y:m.location.y} : missing('location.hyperspace');
  const systemName = missing('location.systemName', 'NATIVE_COLONY_SYSTEM_NAME_UNAVAILABLE');
  const planetType = m.resourcePlanetContext?.planetType === null ? null : string(m.resourcePlanetContext?.planetType,'location.planetType',missing);
  const industries = projectIndustries(m,missing), queue = projectQueue(m,mutationBlocker,missing);
  const administrator = projectAdministrator(runtime,m,missing), finances = projectFinances(runtime,m,industries,hazard,size,missing);
  const tech = missing('tech','NATIVE_COLONY_TECH_OVERVIEW_UNAVAILABLE');
  const buildOptionsBlocker = mutationBlocker ?? 'NATIVE_COLONY_BUILD_NOT_EVALUATED';
  missing('buildOptions',buildOptionsBlocker);
  return {marketId,objectRef,name,factionId,size,stability,hazard,location:{hyperspace,systemName,planetType},administrator,tech,finances,industries,queue,mutationBlocker,buildOptions:null,buildOptionsBlocker,blockers};
}
/** marketIds must come from trusted server controller bindings, never from the requesting client.
 * The permission callback is a pure host gate; it must not construct industries or switch fleets. */
export function projectNativeColonyManagement(runtime, {marketIds,canConstruct} = {}) {
  if (!runtime || typeof runtime.market !== 'function' || !Array.isArray(marketIds) || marketIds.length > 1000
    || marketIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 512) || new Set(marketIds).size !== marketIds.length
    || canConstruct !== undefined && typeof canConstruct !== 'function') throw new TypeError('NATIVE_COLONY_PROJECTION_INPUT_REQUIRED');
  const rows = marketIds.map(id => projectMarket(runtime,id,canConstruct));
  return immutableJSON({schemaVersion:1,scope:'native-colony-management',rows,blockers:rows.flatMap(row => row.blockers)});
}