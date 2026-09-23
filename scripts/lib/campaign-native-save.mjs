import {captureNativeFactionDoctrines} from './campaign-native-doctrines.mjs';
import {captureNativeShipSelection} from './campaign-native-ship-selection.mjs';
import {captureNativeRouteSpace} from './campaign-native-route-space.mjs';
import {captureNativeFleetSensors} from './campaign-native-sensors.mjs';
import {captureNativePatrols} from './campaign-native-patrols.mjs';
import {captureNativeTopographyMarketStat} from './campaign-native-topography.mjs';
import { captureNativePlayerEconomy } from './campaign-native-player-economy.mjs';
import { captureNativeEconomyNotifications } from './campaign-native-economy-notifications.mjs';
import { captureNativeMonthlyReports } from './campaign-native-monthly-reports.mjs';
import { captureNativeEconomyListeners } from './campaign-native-economy-listeners.mjs';
import { captureNativeOpenRetail } from './campaign-native-retail-inputs.mjs';
import { captureNativeGrowthListeners, captureNativeGrowthMarket } from './campaign-native-growth-inputs.mjs';
import { captureNativeNetworkLocation, captureNativeNetworkState } from './campaign-native-network-inputs.mjs';
import { captureNativeIndustryInputs, captureNativePopulationState } from './campaign-native-industry-inputs.mjs';
import { captureNativeLoadConditions } from './campaign-native-load-conditions.mjs';
import { captureNativeAdministrator } from './campaign-native-administrator.mjs';
import { captureNativeMarketPlanet } from './campaign-native-market-planet.mjs';
import { originalIndustryDisruptionKey } from '../../src/campaign/rules/OriginalIndustryRuntime.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES } from '../../src/campaign/rules/OriginalSpecialIndustries.mjs';
/** Data-only XStream graph reader. Never instantiates a saved class or evaluates embedded text. */
import sax from 'sax';
import { createHash } from 'node:crypto';
import { ORIGINAL_INDUSTRY_COMMODITIES } from '../../src/campaign/rules/OriginalCivicIndustries.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES } from '../../src/campaign/rules/OriginalProductionIndustries.mjs';
import { ORIGINAL_IMMIGRATION } from '../../src/campaign/rules/OriginalColonyEnvironment.mjs';
const fail = message => { throw new Error('NATIVE_SAVE_INPUT: ' + message); };
const ensure = (condition, message) => { if (!condition) fail(message); };
const sha = text => createHash('sha256').update(text).digest('hex');
const float = (text, label) => {
  ensure(typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text), 'Invalid float ' + label);
  const value = Math.fround(Number(text)); ensure(Number.isFinite(value), 'Nonfinite float ' + label); return value;
};
const int = (text, label) => { ensure(typeof text === 'string' && /^-?\d+$/.test(text), 'Invalid integer ' + label); const n = Number(text); ensure(Number.isSafeInteger(n), 'Inexact integer ' + label); return n; };
const bool = (text, label) => { ensure(text === 'true' || text === 'false', 'Missing/invalid boolean ' + label); return text === 'true'; };
function token(value, label) { ensure(typeof value === 'string' && value.length > 0 && value.length <= 256, 'Missing/oversized ' + label); return value; }
export function parseNativeSaveGraph(xml) {
  ensure(typeof xml === 'string' && Buffer.byteLength(xml) <= 256 * 1024 * 1024, 'XML exceeds 256 MiB');
  const objects = new Map(), references = [], stack = []; let root = null, count = 0;
  const parser = sax.parser(true, { strictEntities: true });
  parser.ondoctype = () => fail('DTD/entity declarations are forbidden');
  parser.onprocessinginstruction = p => ensure(p.name === 'xml', 'Processing instructions are not supported');
  parser.onopentag = tag => {
    ensure(++count <= 1500000 && stack.length < 256, 'XML node/depth budget exceeded');
    const node = { name: tag.name, attributes: { ...tag.attributes }, children: [], text: '' };
    for (const [key, value] of Object.entries(node.attributes)) ensure(key.length <= 256 && value.length <= 1048576, 'Oversized attribute');
    const { z, ref } = node.attributes;
    ensure(!(z && ref), 'An object cannot be both definition and reference');
    if (z) { ensure(/^\d+$/.test(z) && !objects.has(z), 'Duplicate/invalid object identity ' + z); objects.set(z, node); }
    if (ref) { ensure(/^\d+$/.test(ref), 'Invalid reference'); references.push(node); }
    if (stack.length) stack.at(-1).children.push(node); else { ensure(root === null, 'Multiple document roots'); root = node; }
    stack.push(node);
  };
  const text = value => { if (stack.length) { const node = stack.at(-1); ensure(node.text.length + value.length <= 16 * 1024 * 1024, 'Text budget exceeded'); node.text += value; } else ensure(!value.trim(), 'Text outside root'); };
  parser.ontext = text; parser.oncdata = text; parser.onclosetag = () => stack.pop();
  parser.write(xml).close(); ensure(root && stack.length === 0, 'Incomplete document');
  for (const node of references) { ensure(objects.has(node.attributes.ref), 'Dangling reference ' + node.attributes.ref); ensure(!node.children.length && !node.text.trim(), 'Reference has inline content'); }
  const resolve = node => node?.attributes.ref ? objects.get(node.attributes.ref) : node;
  const child = (node, name, required = false) => {
    const found = resolve(node)?.children.filter(c => c.name === name) ?? [];
    ensure(found.length <= 1, 'Repeated field ' + name); if (required) ensure(found.length === 1, 'Missing field ' + name);
    return resolve(found[0]) ?? null;
  };
  return { root, objects, nodeCount: count, resolve, child };
}
function reader(graph) {
  const { resolve, child } = graph;
  const value = (node, name, required = false) => child(node, name, required)?.text.trim() ?? null;
  const ref = node => token(resolve(node)?.attributes.z, 'object identity');
  const members = node => node ? resolve(node).children.map(resolve) : [];
  const names = node => members(node).map(n => token(n.text.trim(), 'list value'));
  function bonus(node, channels = ['fBs', 'pBs', 'mBs']) {
    if (!node) return null;
    node = resolve(node); const result = { flat: [], percent: [], mult: [] };
    for (const [i, channel] of ['flat', 'percent', 'mult'].entries()) {
      const seen = new Set();
      for (const item of node.children.filter(c => c.name === channels[i])) {
        const mod = resolve(item), id = token(mod.attributes.s, 'modifier source'); ensure(!seen.has(id), 'Duplicate modifier ' + id); seen.add(id);
        result[channel].push({ id, value: float(mod.attributes.v, 'modifier ' + id) });
      }
    }
    return result;
  }
  function stat(node) {
    if (!node) return null;
    node = resolve(node); const temporary = [], seen = new Set();
    for (const entry of members(child(node, 'tM'))) {
      ensure(entry.name === 'e' && entry.children.length === 2, 'Invalid temporary modifier map');
      const id = resolve(entry.children[0]).text.trim(), item = resolve(entry.children[1]);
      ensure(id === item.attributes.s && !seen.has(id), 'Temporary modifier key mismatch'); seen.add(id);
      temporary.push({ id: token(id, 'temporary modifier'), timeRemaining: float(item.attributes.tR, 'temporary duration') });
    }
    return { objectRef: ref(node), state: { base: float(node.attributes.b, 'stat base'), modifiers: bonus(node, ['fMs', 'pMs', 'mMs']) }, serializedModified: node.attributes.m === undefined ? null : float(node.attributes.m, 'cached stat value'), temporary };
  }
  const attr = (node, key) => resolve(node)?.attributes[key] ?? null;
  return { value, ref, members, names, stat, bonus, attr };
}
function industryDisruptionMemory(graph, r, market, industryId) {
  const key = originalIndustryDisruptionKey(industryId), memory = graph.child(market, 'memory');
  if (!memory) return { key, present: false, value: null, expires: [] };
  ensure(!memory.attributes.cl || memory.attributes.cl === 'Memory', 'Unsupported market memory class');
  ensure(memory.children.every(n => ['d', 'e', 'r', 'rF'].includes(n.name)), 'Unknown serialized memory field');
  let present = false, value = null;
  const seen = new Set();
  for (const entry of r.members(graph.child(memory, 'd'))) {
    ensure(entry.name === 'e' && entry.children.length === 2, 'Invalid memory map entry');
    const name = graph.resolve(entry.children[0]), datum = graph.resolve(entry.children[1]);
    ensure(name.name === 'st' && !name.children.length, 'Unsupported memory key');
    ensure(!seen.has(name.text), 'Duplicate memory key'); seen.add(name.text);
    if (name.text !== key) continue;
    ensure(!datum.children.length, 'Unsupported structured disruption value');
    const type = datum.attributes.cl ?? datum.name;
    if (type === 'bp') value = bool(datum.text.trim(), 'disruption Boolean');
    else if (type === 'st') { ensure(datum.text.length <= 4096, 'Oversized disruption string'); value = datum.text; }
    else if (type === 'fp') value = float(datum.text.trim(), 'disruption float');
    else if (type === 'ip') value = int(datum.text.trim(), 'disruption integer');
    else fail('Unsupported/null disruption scalar type ' + type);
    present = true;
  }
  const expires = [];
  for (const expiry of r.members(graph.child(memory, 'e'))) {
    ensure((expiry.attributes.cl ?? expiry.name) === 'MExp' && !expiry.children.length, 'Invalid memory expiry');
    const name = token(expiry.attributes.k, 'expiry key');
    if (name === key) expires.push(float(expiry.attributes.t, 'memory expiry days'));
  }
  return { key, present, value, expires };
}
function savedSpecialItem(graph, r, industry) {
  const node = graph.child(industry, 'special');
  if (!node) return null;
  ensure(!node.attributes.cl || node.attributes.cl === 'SpID', 'Unsupported special-item class');
  ensure(!node.children.length && Object.keys(node.attributes).every(k => ['z', 'cl', 'i', 'd'].includes(k)), 'Unsupported special-item encoding');
  const id = token(node.attributes.i, 'special-item id'), data = node.attributes.d ?? null;
  ensure(data === null || data.length <= 4096, 'Oversized special-item data');
  return { objectRef: r.ref(node), id, data };
}
/** This is SERIALIZED input, not an original post-load world, callback execution, or trade snapshot. */
export function extractNativeSaveEconomy(campaignXML, descriptorXML) {
  const dg = parseNativeSaveGraph(descriptorXML), d = reader(dg); ensure(dg.root.name === 'SaveGameData', 'Wrong descriptor root');
  const version = d.value(dg.root, 'gameVersion', true); ensure(version === '0.98a-RC8', 'Unsupported game version ' + version);
  ensure(d.value(dg.root, 'saveFileVersion', true) === '0.6', 'Unsupported save file version');
  ensure(d.value(dg.root, 'compressed', true) === 'false', 'Compressed saves need a separate decoder');
  ensure(d.members(dg.child(dg.root, 'enabledMods', true)).length === 0, 'Modded save requires its own definitions');
  const g = parseNativeSaveGraph(campaignXML), r = reader(g), { child } = g;
  ensure(g.root.name === 'CampaignEngine', 'Wrong campaign root');
  const economy = child(g.root, 'economy', true), reach = child(economy, 'econ', true), roster = child(reach, 'markets', true), stepper = child(economy, 'stepper', true);
  ensure(child(stepper, 'econ', true) === reach, 'Stepper and economy disagree on ReachEconomy identity');
  const marketIds = new Set(), marketObjects = new Set(), missingIndustryPlugins = new Set(), missingConditions = new Set();
  const markets = r.members(roster).map(m => {
    ensure((m.attributes.cl ?? m.name) === 'Market', 'Unexpected registered market class');
    const id = token(r.value(m, 'id', true), 'market id'), objectRef = r.ref(m);
    ensure(!marketIds.has(id) && !marketObjects.has(objectRef), 'Duplicate registered market'); marketIds.add(id); marketObjects.add(objectRef);
    const owned = (node, field) => { ensure(child(node, field, true) === m, 'Foreign market owner for ' + id + '/' + field); };
    const demandClasses = [], demandRefs = new Map();
    const demands = child(m, 'demandData', true); owned(demands, 'market');
    for (const item of demands.children.filter(c => c.name === 'demand')) {
      const node = g.resolve(item); owned(node, 'm'); const demandClass = token(node.attributes.dC, 'demand class'), object = r.ref(node);
      ensure(!demandClasses.some(c => c.demandClass === demandClass), 'Duplicate demand class');
      const demand = r.stat(child(node, 'd', true)); demandClasses.push({ objectRef: object, demandClass, demand }); demandRefs.set(object, demandClass);
    }
    const commodityIds = new Set();
    const commodities = r.members(child(m, 'commodities', true)).map(c => {
      ensure((c.attributes.cl ?? c.name) === 'COMkt', 'Unexpected commodity class'); owned(c, 'm');
      ensure(!['commodityMarketData','supplyPrice','demandPrice','commodity'].some(k => child(c,k)), 'Unexpected serialized transient commodity fields');
      const commodityId = token(c.attributes.c, 'commodity id'), demandRef = r.ref(child(c, 'd', true));
      ensure(!commodityIds.has(commodityId) && demandRefs.has(demandRef), 'Duplicate commodity or detached shared demand'); commodityIds.add(commodityId);
      return { commodityId, objectRef: r.ref(c), demandRef, demandClass: demandRefs.get(demandRef), stockpile: float(c.attributes.sto, 'stockpile'), maxSupply: int(c.attributes.mS, 'maxSupply'), maxDemand: int(c.attributes.mD, 'maxDemand'), supplyLegal: bool(c.attributes.iSL, 'supply legal'), demandLegal: bool(c.attributes.iDL, 'demand legal'), savedExoticUtility: float(c.attributes.eU, 'saved exotic utility'), greed: r.stat(child(c, 'g', true)), available: r.stat(child(c, 'available')), tradeMod: r.stat(child(c, 'tradeMod')), tradeModPlus: r.stat(child(c, 'tradeModPlus')), tradeModMinus: r.stat(child(c, 'tradeModMinus')), playerDemandMod: r.bonus(child(c, 'pDM')), playerSupplyMod: r.bonus(child(c, 'pSM')), network: 'transient-not-serialized', priceCalculators: 'transient-requires-readResolve' };
    });
    const suppressed = r.names(child(m, 'suppressedConditions'));
    const conditions = r.members(child(m, 'conditions', true)).map(c => {
      owned(c, 'm'); const conditionId = token(c.attributes.i, 'condition id'), unique = token(c.attributes.u, 'condition unique');
      if (!Object.hasOwn(ORIGINAL_IMMIGRATION.conditions, conditionId)) missingConditions.add(conditionId);
      return { objectRef: r.ref(c), id: conditionId, unique, modId: conditionId + '_' + unique, surveyed: bool(c.attributes.s, 'condition surveyed'), suppressed: suppressed.includes(conditionId), pluginRef: child(c, 'p') ? r.ref(child(c, 'p')) : null };
    });
    const industries = r.members(child(m, 'industries', true)).map(i => {
      owned(i, 'm'); const industryId = token(i.attributes.id, 'industry id'), classAlias = i.attributes.cl ?? i.name;
      const expectedClass = Object.hasOwn(ORIGINAL_INDUSTRY_COMMODITIES.industries, industryId) ? ORIGINAL_INDUSTRY_COMMODITIES.industries[industryId].className : Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries, industryId) ? ORIGINAL_PRODUCTION_INDUSTRIES.industries[industryId].className : Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, industryId) ? ORIGINAL_SPECIAL_INDUSTRIES.industries[industryId].savedClassAlias : ({ farming: 'Farming', aquaculture: 'Farming', mining: 'Mining' })[industryId];
      if (!expectedClass || classAlias !== expectedClass) missingIndustryPlugins.add(industryId);
      const fields = ['s', 'd', 'i', 'u'];
      const runtimeInput = expectedClass && classAlias === expectedClass ? { industryId, classAlias, building: bool(i.attributes.b, 'building'), upgradeId: i.attributes.uI ?? r.value(i, 'uI'), improved: r.value(i, 'improved') === null ? null : bool(r.value(i, 'improved'), 'improved'), disruption: industryDisruptionMemory(g, r, m, industryId) } : null;
      const heavyPollution=classAlias==='HeavyIndustry'?{daysWithNanoforge:float(r.value(i,'daysWithNanoforge')??'0','nanoforge days'),permaPollution:bool(r.value(i,'permaPollution')??'false','permanent pollution'),addedPollution:bool(r.value(i,'addedPollution')??'false','industry pollution')}:null;
      // Mining's non-transient primitive defaults false only when absent in the original XML.
      // Keep the new capture field explicit: an older JSON capture without it is not known false.
      const shownPlasmaNetVisuals = classAlias === 'Mining' ? bool(r.value(i, 'shownPlasmaNetVisuals') ?? 'false', 'shown plasma net visuals') : null;
      // BaseIndustry.java:82,1571: boxed Boolean null is known only from this XML read.
      // Older JSON captures without hiddenOverride remain unknown; never backfill them as false.
      const hiddenOverrideText = r.value(i, 'hiddenOverride');
      const hiddenOverride = hiddenOverrideText === null ? null : bool(hiddenOverrideText, 'industry hidden override');
      return { objectRef: r.ref(i), industryId, classAlias, runtimeInput, heavyPollution, shownPlasmaNetVisuals, hiddenOverride, specialItem: savedSpecialItem(g, r, i), building: bool(i.attributes.b, 'building'), buildProgress: float(i.attributes.bP, 'build progress'), buildCostOverride:r.value(i,'buildCostOverride')===null?null:float(r.value(i,'buildCostOverride'),'build cost override'), wasDisrupted: bool(i.attributes.wD, 'wasDisrupted'), buildTime: r.value(i, 'buildTime') === null ? null : float(r.value(i, 'buildTime'), 'build time'), upgradeId: i.attributes.uI ?? r.value(i, 'uI'), aiCoreId: i.attributes.aCI ?? r.value(i, 'aCI'), improved: r.value(i, 'improved') === null ? null : bool(r.value(i, 'improved'), 'improved'), demandReduction: r.stat(child(i, 'dR')), supplyBonus: r.stat(child(i, 'sB')), cleanupFields: Object.fromEntries(fields.map(k => [k, child(i, k) ? 'serialized-requires-decoder' : 'omitted-requires-post-save-restore'])), specialItemRef: child(i, 'special') ? r.ref(child(i, 'special')) : null, otherFields: i.children.filter(c => !['m', 'buildTime', 'buildCostOverride', 'hiddenOverride', 'uI', 'aCI', 'improved', 'dR', 'sB', 'special', ...(classAlias === 'Mining' ? ['shownPlasmaNetVisuals'] : []), ...fields].includes(c.name)).map(c => c.name) };
    });
    const location = token(r.value(m, 'location', true), 'market location').split('|'); ensure(location.length === 2, 'Invalid market location');
    const administratorCapture = captureNativeAdministrator(g, r, m);
    const conditionLoadCapture = captureNativeLoadConditions(g, r, m, administratorCapture);
    return { slipstreamDetection:captureNativeTopographyMarketStat(g,r,m), retailCapture: captureNativeOpenRetail(g,r,m), growthCapture: captureNativeGrowthMarket(g,r,m,administratorCapture), populationCapture: captureNativePopulationState(g, r, m), networkLocationCapture: captureNativeNetworkLocation(g, r, m), industryInputCapture: captureNativeIndustryInputs(g, r, m), conditionLoadCapture, objectRef, marketId: id, planetInput: captureNativeMarketPlanet(g, r, m), administratorCapture, name: r.value(m, 'name', true), factionId: token(r.value(m, 'factionId', true), 'faction id'), size: int(r.value(m, 'size', true), 'market size'), econGroup: r.value(m, 'econGroup'), hidden: r.value(m, 'hidden') === null ? null : bool(r.value(m, 'hidden'), 'hidden'), playerOwned: bool(r.value(m, 'playerOwned', true), 'playerOwned'), isFreePort: bool(r.value(m, 'isFreePort', true), 'isFreePort'), location: { x: float(location[0], 'market x'), y: float(location[1], 'market y') }, hazard: r.stat(child(m, 'hazard', true)), incomeMult: r.stat(child(m, 'incomeMult', true)), upkeepMult: r.stat(child(m, 'upkeepMult', true)), accessibility: r.bonus(child(m, 'accessibilityMod', true)), demandPriceMod: r.bonus(child(m, 'demandPriceMod', true)), supplyPriceMod: r.bonus(child(m, 'supplyPriceMod', true)), suppressedConditions: suppressed, conditions, industries, demandClasses, commodities, unresolvedObjects: ['stats','admin','submarkets','memory','constructionQueue','primaryEntity','immigrationModifiers'].filter(k => child(m,k)).map(k => ({ field: k, objectRef: r.ref(child(m,k)) })) };
  });
  const clock = child(g.root, 'clock', true), timestamp = r.value(clock, 'timestamp', true); int(timestamp, 'clock timestamp');
  const monthlyReportCapture=captureNativeMonthlyReports(g,r),economyListenerCapture=captureNativeEconomyListeners(g,r,markets);
  const economyNotificationCapture=captureNativeEconomyNotifications(g,r,economyListenerCapture,monthlyReportCapture);
  const patrolCapture=captureNativePatrols(g,r,markets),routeSpaceCapture=captureNativeRouteSpace(g,r,patrolCapture),playerEconomyCapture=captureNativePlayerEconomy(g,r),sensorCapture=captureNativeFleetSensors(g,r,routeSpaceCapture,playerEconomyCapture);
  return { shipSelectionCapture:captureNativeShipSelection(g,r),sensorCapture,routeSpaceCapture,factionDoctrineCapture:captureNativeFactionDoctrines(g,r),patrolCapture,playerEconomyCapture,monthlyReportCapture,economyListenerCapture,economyNotificationCapture, growthListeners: captureNativeGrowthListeners(g,r), inNewGameAdvance: r.value(g.root, 'isInNewGameAdvance') === null ? null : bool(r.value(g.root, 'isInNewGameAdvance'), 'new-game advance'), schemaVersion: 1, scope: 'serialized-native-economy-inputs-not-restored-world', gameVersion: version, source: { campaignSha256: sha(campaignXML), descriptorSha256: sha(descriptorXML), campaignBytes: Buffer.byteLength(campaignXML) }, networkCapture: captureNativeNetworkState(g, r, markets), clock: { timestamp, secondsPerDay: float(r.value(clock, 'secondsPerDay', true), 'seconds per day') }, scheduler: { state: r.value(stepper, 'state', true), elapsed: float(r.value(stepper, 'elapsed', true), 'stepper elapsed'), untilNext: float(r.value(stepper, 'untilNext', true), 'stepper untilNext'), iterationsLeft: int(r.value(stepper, 'iterLeft', true), 'iterations left'), previousMonth: int(r.value(stepper, 'prevMonth', true), 'previous month'), queuedTaskCount: r.members(child(stepper, 'tasks', true)).length }, marketRoster: markets.map(m=>m.marketId), markets, reconstruction: { readyForAuthority: false, missingIndustryCommodityPlugins: [...missingIndustryPlugins].sort(), unrecognizedEnvironmentConditions: [...missingConditions].sort(), required: ['industry-post-save-restore','condition-and-industry-live-reapply','administrator-and-listener-runtime','commodity-network-construction','transient-price-calculators','faction-relationships-and-admission','retail-inventories-and-market-publication'] } };
}
export function summarizeNativeSaveEconomy(capture) {
  const commodities = capture.markets.flatMap(m=>m.commodities), industries = capture.markets.flatMap(m=>m.industries);
  return { scope: capture.scope, gameVersion: capture.gameVersion, source: capture.source, marketCount: capture.markets.length, commodityCount: commodities.length, demandClassCount: capture.markets.reduce((n,m)=>n+m.demandClasses.length,0), industryCount: industries.length, missingIndustryCommodityPlugins: capture.reconstruction.missingIndustryCommodityPlugins, unrecognizedEnvironmentConditions: capture.reconstruction.unrecognizedEnvironmentConditions, industriesNeedingPostSaveRestore: industries.filter(i=>Object.values(i.cleanupFields).some(s=>s==='omitted-requires-post-save-restore')).length, temporaryModifierCount: commodities.reduce((n,c)=>n+[c.available,c.tradeMod,c.tradeModPlus,c.tradeModMinus].reduce((s,m)=>s+(m?.temporary.length??0),0),0), readyForAuthority: false };
}
