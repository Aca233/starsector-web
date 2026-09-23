import raw from '../data/reference-production-industries.json' with { type: 'json' };
import { identifier, integer, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape, economyFloat, resolveOriginalEconomyBonus } from './OriginalMarketEconomy.mjs';
import { blank, bool, size, stat, unmodified, put, commodity, functional, get, quantity, updateBonuses, validateIndustryState } from './OriginalIndustryState.mjs';
export const ORIGINAL_PRODUCTION_INDUSTRIES = immutableJSON(raw);
const R = ORIGINAL_PRODUCTION_INDUSTRIES, f = Math.fround;
const check = (ok, message) => requireThat(ok, 'UNSUPPORTED_PRODUCTION_INDUSTRY', message);
function spec(id) { identifier(id); check(Object.hasOwn(R.industries, id), 'Unknown production plugin'); return R.industries[id]; }
export function validateOriginalProductionIndustry(state) { validateIndustryState(state); spec(state.industryId); }
export function newOriginalProductionIndustry(industryId) { spec(industryId); return immutableJSON({ schemaVersion: 1, industryId, supplyBonus: blank(), demandReduction: blank(), supply: {}, demand: {} }); }
function quality(q) { resolveOriginalEconomyBonus(q); for (const m of Object.values(q).flat()) check(m.value === f(m.value), 'Quality modifiers must be native floats'); }
function item(id, industryId) {
  if (id === null) return null;
  identifier(id); check(Object.hasOwn(R.items, id) && R.items[id].industryIds.includes(industryId), 'Unknown or incompatible installed item'); return R.items[id];
}
function unapply(state, q, itemId) {
  const effect = item(itemId, state.industryId);
  // BoostIndustryInstallableItemEffect writes a neutral modifier, not unmodifyFlat.
  if (effect) put(state.supplyBonus, 'flat', itemId, 0);
  if (effect && effect.qualityBonus !== null) put({ modifiers: q }, 'flat', 'nanoforge', 0, true);
  if (spec(state.industryId).className === 'HeavyIndustry') for (const index of [0, 1]) put({ modifiers: q }, 'flat', 'ind_' + state.industryId + '_' + index, 0, true);
}
/** Ordered pre-apply unapply effects only; supply/demand and AI/admin bonuses are NOT wiped. */
export function unapplyOriginalProductionIndustry(input) {
  economyShape(input, ['state', 'productionQuality', 'specialItemId'], 'production unapply');
  validateOriginalProductionIndustry(input.state); quality(input.productionQuality);
  const state = structuredClone(input.state), productionQuality = structuredClone(input.productionQuality);
  unapply(state, productionQuality, input.specialItemId);
  return immutableJSON({ state, productionQuality });
}
/** Commodity + quality callbacks, not finance, pollution advance, or economy initialization. Getter inputs must already be resolved. */
function applyProduction(input,runtime=null) {
  economyShape(input, ['state', 'marketSize', 'operating', 'modifiers', 'available', 'illegalCommodityIds', 'conditionIds', 'adminFuelSupplyBonus', 'previousStability', 'productionQuality'], 'production application');
  validateOriginalProductionIndustry(input.state); size(input.marketSize); const active = functional(input.operating);
  const state = runtime?input.state:structuredClone(input.state), productionQuality = runtime?input.productionQuality:structuredClone(input.productionQuality), id = state.industryId, kind = spec(id).className;
  quality(productionQuality);
  for (const name of ['adminFuelSupplyBonus', 'previousStability']) { economyFloat(input[name], name, -65536, 65536); check(input[name] === f(input[name]), name + ' must be a native float'); }
  for (const name of ['conditionIds', 'illegalCommodityIds']) {
    check(Array.isArray(input[name]) && input[name].length <= 128 && new Set(input[name]).size === input[name].length, 'Expected unique ' + name);
    for (const value of input[name]) (name === 'conditionIds' ? identifier : commodity)(value);
  }
  const required = kind === 'LightIndustry' ? ['organics'] : kind === 'Refining' ? ['heavy_machinery', 'ore', 'rare_ore'] : kind === 'HeavyIndustry' ? ['metals', 'rare_metals'] : ['volatiles'];
  if(runtime)check(input.available===null&&typeof runtime.readCommodityAvailable==='function'&&typeof runtime.applyFinances==='function','Actual production runtime callbacks required');
  else{economyShape(input.available, required, 'production availability getter values');for (const value of Object.values(input.available)) { integer(value, 'commodity availability', -65536); check(value <= 65536, 'Availability out of range'); }}
  const available=c=>{const value=runtime?runtime.readCommodityAvailable(c):input.available[c];integer(value,'commodity availability',-65536);check(value<=65536,'Availability out of range');return value;};
  const special = item(input.modifiers.specialItemId, id);
  updateBonuses(state, { ...input.modifiers, specialItemId: null }, { alphaSupplyBonus: true, improvementSupplyBonus: true });
  if(runtime){const finances=runtime.applyFinances();check(finances&&!finances.then,'Actual synchronous industry finance result required');}
  if (special) {
    const enabled = special.requiredCondition === null || input.conditionIds.includes(special.requiredCondition);
    put(state.supplyBonus, 'flat', input.modifiers.specialItemId, enabled ? special.supplyBonus : 0);
    if (special.qualityBonus !== null) put({ modifiers: productionQuality }, 'flat', 'nanoforge', special.qualityBonus, !enabled);
  }
  const n = input.marketSize, prefix = 'ind_' + id + '_';
  if (kind === 'FuelProduction') put(state.supplyBonus, 'flat', prefix + '2', input.adminFuelSupplyBonus);
  const demand = (c, amount) => quantity(state, 'demand', prefix + '0', c, amount);
  const supply = (c, amount) => quantity(state, 'supply', prefix + '0', c, amount);
  const deficit = (...ids) => Math.max(0, ...ids.map(c => Math.trunc(stat(get(state, 'demand', c))) - available(c)));
  const reduce = (index, amount, ids) => { for (const c of ids) if (!unmodified(get(state, 'supply', c))) quantity(state, 'supply', prefix + index, c, -amount); };
  if (kind === 'LightIndustry') {
    demand('organics', n); supply('domestic_goods', n);
    for (const c of ['luxury_goods', 'drugs']) supply(c, input.illegalCommodityIds.includes(c) ? 0 : n - 2);
    reduce(1, deficit('organics'), ['domestic_goods', 'luxury_goods', 'drugs']);
  } else if (kind === 'Refining') {
    demand('heavy_machinery', n - 2); demand('ore', n + 2); demand('rare_ore', n);
    supply('metals', n); supply('rare_metals', n - 2);
    reduce(1, deficit('heavy_machinery', 'ore'), ['metals']); reduce(1, deficit('heavy_machinery', 'rare_ore'), ['rare_metals']);
  } else if (kind === 'HeavyIndustry') {
    demand('metals', n); demand('rare_metals', n - 2);
    const outputs = ['heavy_machinery', 'supplies', 'hand_weapons', 'ships'];
    for (const c of outputs) supply(c, n - 2);
    reduce(2, Math.min(deficit('metals', 'rare_metals'), n - 3), outputs);
    if (id === 'orbitalworks') put({ modifiers: productionQuality }, 'flat', prefix + '1', R.orbitalWorksQualityBonus);
    if (input.previousStability < 5) put({ modifiers: productionQuality }, 'flat', prefix + '0', f(f(f(input.previousStability - 5) / 5) * 0.5));
  } else {
    demand('volatiles', n); demand('heavy_machinery', n - 2); supply('fuel', n - 2);
    reduce(1, deficit('volatiles'), ['fuel']);
  }
  if (!active) { state.supply = {}; if (kind === 'HeavyIndustry') unapply(state, productionQuality, input.modifiers.specialItemId); }
  validateOriginalProductionIndustry(state); quality(productionQuality);
  return immutableJSON({ state, productionQuality });
}
export function applyOriginalProductionIndustry(input){return applyProduction(input);}
/** Shared live instance: finance reads see old quantities; each deficit visits the current lazy network. */
export function applyOriginalLiveProductionIndustry(market,entry,runtime){
 check(market.production,'Actual production context required');
 return applyProduction({...entry,marketSize:market.size,available:null,illegalCommodityIds:market.freePort?[]:market.factionIllegalCommodityIds,conditionIds:market.conditions.map(c=>c.id),adminFuelSupplyBonus:market.production.adminFuelSupplyBonus,previousStability:market.previousStability,productionQuality:market.production.productionQuality},runtime);
}
/** BaseIndustry.setSpecialItem only unapplies the old item, not the old industry's own bonuses. */
export function unapplyOriginalProductionItem(state,productionQuality,specialItemId){
 validateOriginalProductionIndustry(state);quality(productionQuality);const effect=item(specialItemId,state.industryId);
 if(effect)put(state.supplyBonus,'flat',specialItemId,0);
 if(effect&&effect.qualityBonus!==null)put({modifiers:productionQuality},'flat','nanoforge',0,true);
}
export function originalProductionIndustryOutput(state, context) {
  validateOriginalProductionIndustry(state); economyShape(context, ['commodityId', 'illegal'], 'production legality'); commodity(context.commodityId); bool(context.illegal, 'native commodity illegality');
  const legal = ['HeavyIndustry', 'FuelProduction'].includes(spec(state.industryId).className) || !context.illegal;
  return immutableJSON({ id: state.industryId, supply: stat(state.supply[context.commodityId] ?? blank()), demand: stat(state.demand[context.commodityId] ?? blank()), supplyLegal: legal, demandLegal: legal });
}
