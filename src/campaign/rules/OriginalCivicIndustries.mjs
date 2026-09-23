import {isSupportedOriginalMilitaryItem} from './OriginalMilitaryBases.mjs';
import {isSupportedOriginalGroundDefenseItem} from './OriginalGroundDefenses.mjs';
import { isSupportedOriginalPortItem } from './OriginalPortItems.mjs';
import raw from '../data/reference-industry-commodities.json' with { type: 'json' };
import { identifier, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { blank, bool, size, stat, commodity, functional, quantity, updateBonuses, validateIndustryState } from './OriginalIndustryState.mjs';
export const ORIGINAL_INDUSTRY_COMMODITIES = immutableJSON(raw);
function spec(id) {
  identifier(id, 'industry'); const result = ORIGINAL_INDUSTRY_COMMODITIES.industries[id];
  requireThat(Object.hasOwn(ORIGINAL_INDUSTRY_COMMODITIES.industries, id) && result, 'UNSUPPORTED_CIVIC_INDUSTRY', 'Industry commodity plugin is not implemented'); return result;
}
export function validateOriginalCivicIndustry(state) { validateIndustryState(state); spec(state.industryId); }
/** Explicit creation only; existing unknown industry state must not be replaced by this. */
export function newOriginalCivicIndustry(industryId) {
  spec(industryId); return immutableJSON({ schemaVersion: 1, industryId, supplyBonus: blank(), demandReduction: blank(), supply: {}, demand: {} });
}
/** Commodity writes only, NOT stability, accessibility, patrol spawning, income or an economy task. */
export function applyOriginalCivicIndustry(input) {
  economyShape(input, ['state', 'marketSize', 'habitable', 'operating', 'modifiers'], 'civic-industry commodity application');
  validateOriginalCivicIndustry(input.state); size(input.marketSize); bool(input.habitable, 'habitable condition presence');
  const active = functional(input.operating), state = structuredClone(input.state), definition = spec(state.industryId);
  const kind = definition.className, tags = definition.tags, modId = 'ind_' + state.industryId + '_0', n = input.marketSize;
  requireThat(input.modifiers?.specialItemId === null || isSupportedOriginalPortItem(state.industryId, input.modifiers?.specialItemId) || isSupportedOriginalGroundDefenseItem(state.industryId,input.modifiers?.specialItemId) || isSupportedOriginalMilitaryItem(state.industryId,input.modifiers?.specialItemId), 'UNSUPPORTED_INDUSTRY_ITEM', 'Unknown or incompatible civic industry item');
  // Port, defense and military items modify market stats, never commodity bonus stats.
  updateBonuses(state, { ...input.modifiers, specialItemId: null }, { alphaSupplyBonus: kind === 'PopulationAndInfrastructure', improvementSupplyBonus: false });
  const demand = (id, amount) => quantity(state, 'demand', modId, id, amount);
  const supply = (id, amount) => quantity(state, 'supply', modId, id, amount);
  switch (kind) {
    case 'PopulationAndInfrastructure':
      demand('food', n);
      // Native has no else: becoming habitable does not remove a previous named organics demand.
      if (!input.habitable) demand('organics', n - 1);
      demand('domestic_goods', n - 1); demand('luxury_goods', n - 3); demand('drugs', n - 2);
      demand('organs', n - 3); demand('supplies', Math.min(n, 3));
      supply('crew', n - 3); supply('drugs', n - 4); supply('organs', n - 5);
      break;
    case 'Spaceport': {
      const extra = state.industryId === 'megaport' ? 2 : 0;
      for (const c of ['fuel', 'supplies', 'ships']) demand(c, n - 2 + extra);
      supply('crew', n - 1 + extra); break;
    }
    case 'MilitaryBase': {
      const patrol = tags.includes('patrol'), extra = patrol ? 0 : tags.includes('military') ? 2 : tags.includes('command') ? 3 : 0;
      for (const c of ['supplies', 'fuel', 'ships']) demand(c, n - 1 + extra);
      supply('crew', n); if (!patrol) supply('marines', n); break;
    }
    case 'GroundDefenses':
      demand('supplies', n); demand('marines', n); demand('hand_weapons', n - 2); break;
    case 'OrbitalStation': {
      const level = tags.includes('battlestation') ? 5 : tags.includes('starfortress') ? 7 : 3;
      demand('crew', level); demand('supplies', level); break;
    }
    default: requireThat(false, 'UNSUPPORTED_CIVIC_INDUSTRY', 'Unhandled civic plugin');
  }
  // Population.apply deliberately has no such branch in the original.
  if (!active && kind !== 'PopulationAndInfrastructure') state.supply = {};
  validateOriginalCivicIndustry(state); return immutableJSON(state);
}
export function originalCivicIndustryOutput(state, context) {
  validateOriginalCivicIndustry(state); economyShape(context, ['commodityId', 'illegal'], 'commodity legality context');
  commodity(context.commodityId); bool(context.illegal, 'native commodity illegality');
  const kind = spec(state.industryId).className, legal = ['MilitaryBase', 'GroundDefenses'].includes(kind) || !context.illegal;
  return immutableJSON({ id: state.industryId, supply: stat(state.supply[context.commodityId] ?? blank()), demand: stat(state.demand[context.commodityId] ?? blank()), supplyLegal: legal, demandLegal: legal });
}
