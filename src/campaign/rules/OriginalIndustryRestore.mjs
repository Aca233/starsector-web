import { identifier, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { blank, put, validateIndustryState, commodity } from './OriginalIndustryState.mjs';
import { financeFloat, financeStat } from './OriginalMarketFinance.mjs';
import { ORIGINAL_INDUSTRY_COMMODITIES } from './OriginalCivicIndustries.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES } from './OriginalProductionIndustries.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES } from './OriginalSpecialIndustries.mjs';
const check = (v, message) => requireThat(v, 'UNSUPPORTED_INDUSTRY_RESTORE', message);
export function originalIndustrySavedClass(industryId) {
    identifier(industryId);
    if (Object.hasOwn(ORIGINAL_INDUSTRY_COMMODITIES.industries, industryId)) return ORIGINAL_INDUSTRY_COMMODITIES.industries[industryId].className;
    if (Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries, industryId)) return ORIGINAL_PRODUCTION_INDUSTRIES.industries[industryId].className;
    if (Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, industryId)) return ORIGINAL_SPECIAL_INDUSTRIES.industries[industryId].savedClassAlias;
    if (['farming', 'aquaculture'].includes(industryId)) return 'Farming';
    if (industryId === 'mining') return 'Mining';
    check(false, 'Unsupported saved industry plugin');
}
function nullableStat(input) { if (input !== null) financeStat(input); }
function quantities(input) {
    if (input === null) return;
    check(isRecord(input) && Object.keys(input).length <= 128, 'Expected decoded industry commodity map or explicit null');
    for (const [id, amount] of Object.entries(input)) { commodity(id); financeStat(amount); }
}
/** BaseIndustry.readResolve then doPostSaveRestore, storage effects only.
 * Does not run conditions/industries, recreate administrator/listener state, compute a network,
 * or certify that an empty map represents actual production. All loaded industries must finish
 * this storage phase before the lifecycle starts any market reapplication.
 */
export function restoreOriginalIndustryStorage(input) {
    economyShape(input, ['industryId', 'classAlias', 'buildTime', 'supplyBonus', 'demandReduction', 'supply', 'demand', 'income', 'upkeep'], 'native industry serialized storage');
    check(input.classAlias === originalIndustrySavedClass(input.industryId), 'Saved industry class does not match the supported native plugin');
    financeFloat(input.buildTime, 'saved industry build time');
    for (const key of ['supplyBonus', 'demandReduction', 'income', 'upkeep']) nullableStat(input[key]);
    quantities(input.supply); quantities(input.demand);
    const readResolved = structuredClone(input);
    readResolved.buildTime = Math.max(1, readResolved.buildTime);
    readResolved.supplyBonus ??= blank();
    readResolved.demandReduction ??= blank();
    for (const amount of Object.values(readResolved.supply ?? {})) put(amount, 'flat', 'ind_sb', 0, true);
    for (const amount of Object.values(readResolved.demand ?? {})) put(amount, 'flat', 'ind_dr', 0, true);
    const state = { schemaVersion: 1, industryId: input.industryId, supplyBonus: readResolved.supplyBonus, demandReduction: readResolved.demandReduction, supply: {}, demand: {} };
    validateIndustryState(state);
    const finances = { industryId: input.industryId, income: blank(), upkeep: blank() };
    const modId = 'ind_' + input.industryId;
    return immutableJSON({ scope: 'native-industry-storage-initialized-only', readResolved, state, finances, buildTime: readResolved.buildTime, modId, indexedModIds: Array.from({ length: 10 }, (_, n) => modId + '_' + n), pending: ['conditions-and-industries-reapply'], readyForAuthority: false });
}
