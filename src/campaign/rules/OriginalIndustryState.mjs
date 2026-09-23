/** Internal native commodity-state operations. Callers validate a concrete supported industry before mutation. */
import raw from '../data/reference-resource-industries.json' with { type: 'json' };
import { identifier, integer, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY, economyShape, economyFloat, resolveOriginalEconomyMutable } from './OriginalMarketEconomy.mjs';
const R = immutableJSON(raw), f = Math.fround;
export const blank = () => ({ base: 0, modifiers: { flat: [], percent: [], mult: [] } });
export const bool = (v, name) => requireThat(typeof v === 'boolean', 'UNSUPPORTED_RESOURCE_INDUSTRY', `Expected explicit ${name}`);
export const size = n => { integer(n, 'market size'); requireThat(n <= 10, 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Market size exceeds supported native range'); };
export function stat(input) {
  const result = resolveOriginalEconomyMutable(input);
  for (const value of [input.base, ...Object.values(input.modifiers).flat().map(m => m.value)]) {
    requireThat(value === f(value), 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Captured stat values must retain native float precision');
  }
  economyFloat(result, 'industry stat value', -65536, 65536); return result;
}
export const unmodified = s => Object.values(s.modifiers).every(mods => mods.length === 0);
export function put(s, channel, id, value, remove = false) {
  const mods = s.modifiers[channel], i = mods.findIndex(m => m.id === id);
  if (remove) { if (i >= 0) mods.splice(i, 1); }
  else if (i >= 0) mods[i] = { id, value };
  else if (value !== (channel === 'mult' ? 1 : 0)) mods.push({ id, value });
}
function copyMods(target, source) {
  // MutableStat.applyMods uses putAll (including explicit neutral entries), not modifyFlat.
  for (const channel of ['flat', 'percent', 'mult']) for (const mod of source.modifiers[channel]) {
    const i = target.modifiers[channel].findIndex(m => m.id === mod.id);
    if (i < 0) target.modifiers[channel].push({ ...mod }); else target.modifiers[channel][i] = { ...mod };
  }
}
export function commodity(id) {
  identifier(id, 'commodity');
  requireThat(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, id), 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Unknown native commodity');
}
export function validateIndustryState(state) {
  economyShape(state, ['schemaVersion', 'industryId', 'supplyBonus', 'demandReduction', 'supply', 'demand'], 'resource industry state');
  requireThat(state.schemaVersion === 1, 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Unknown resource industry state schema'); identifier(state.industryId);
  stat(state.supplyBonus); stat(state.demandReduction);
  for (const channel of ['supply', 'demand']) {
    requireThat(isRecord(state[channel]) && Object.keys(state[channel]).length <= 128, 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Expected bounded native commodity stats');
    for (const [id, s] of Object.entries(state[channel])) { commodity(id); stat(s); }
  }
}
export function functional(operating) {
  economyShape(operating, ['disrupted', 'building', 'upgradeId'], 'industry operating state');
  bool(operating.disrupted, 'disrupted state'); bool(operating.building, 'building state');
  if (operating.upgradeId !== null) identifier(operating.upgradeId, 'upgrade target');
  return !operating.disrupted && (!operating.building || operating.upgradeId !== null);
}
export const get = (state, channel, id) => state[channel][id] ??= blank();
export function quantity(state, channel, modId, id, amount) {
  const target = get(state, channel, id);
  put(target, 'flat', modId, amount, amount === 0);
  // Negative/zero writes do NOT clear or refresh a previously applied bonus.
  if (amount > 0) {
    const bonus = channel === 'supply' ? state.supplyBonus : state.demandReduction;
    const key = channel === 'supply' ? 'ind_sb' : 'ind_dr';
    const value = Math.floor(stat(bonus) + 0.5) * (channel === 'supply' ? 1 : -1);
    put(target, 'flat', key, value, unmodified(bonus));
  }
}
export function updateBonuses(state, modifiers, policy) {
  economyShape(modifiers, ['aiCoreId', 'improved', 'adminSupplyBonus', 'adminDemandReduction', 'supplyBonusFromOther', 'demandReductionFromOther', 'specialItemId'], 'resource-industry modifiers');
  requireThat([null, 'alpha_core', 'beta_core', 'gamma_core'].includes(modifiers.aiCoreId), 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Unknown AI core');
  requireThat(modifiers.specialItemId === null, 'UNSUPPORTED_INDUSTRY_ITEM', 'Installable industry item effects require their own native resolver');
  bool(modifiers.improved, 'improvement state');
  stat(modifiers.supplyBonusFromOther); stat(modifiers.demandReductionFromOther);
  for (const v of [modifiers.adminSupplyBonus, modifiers.adminDemandReduction]) {
    economyFloat(v, 'resolved administrator modifier', -65536, 65536);
    requireThat(v === f(v), 'UNSUPPORTED_RESOURCE_INDUSTRY', 'Administrator values must be native floats');
  }
  const supply = { ...blank(), base: state.supplyBonus.base }, demand = { ...blank(), base: state.demandReduction.base };
  const prefix = 'ind_' + state.industryId;
  if (modifiers.aiCoreId === 'alpha_core' && policy.alphaSupplyBonus) put(supply, 'flat', prefix + '_0', R.settings.SUPPLY_BONUS);
  if (modifiers.aiCoreId !== null) put(demand, 'flat', prefix + '_0', R.settings.DEMAND_REDUCTION);
  if (modifiers.improved && policy.improvementSupplyBonus) put(supply, 'flat', prefix + '_3', R.settings.DEFAULT_IMPROVE_SUPPLY_BONUS);
  put(supply, 'flat', prefix + '_1', modifiers.adminSupplyBonus);
  put(demand, 'flat', prefix + '_1', modifiers.adminDemandReduction);
  copyMods(supply, modifiers.supplyBonusFromOther); copyMods(demand, modifiers.demandReductionFromOther);
  stat(supply); stat(demand); state.supplyBonus = supply; state.demandReduction = demand;
}
