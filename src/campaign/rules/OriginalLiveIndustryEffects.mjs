/** Ordered economic effects on one shared transaction. NOT full industry entity/listener lifecycle. */
import {applyOriginalMilitaryBase,unapplyOriginalMilitaryBase} from './OriginalMilitaryBases.mjs';
import {unapplyOriginalGroundDefenseEffects,applyOriginalGroundDefenseBaseEffects,applyOriginalGroundDefenseEffects} from './OriginalGroundDefenses.mjs';
import { immutableJSON, requireThat } from '../core/Values.mjs';
import { blank, put, stat, functional } from './OriginalIndustryState.mjs';
import { applyOriginalResourceIndustry,applyOriginalLiveResourceIndustry,unapplyOriginalLiveResourceIndustry } from './OriginalResourceIndustries.mjs';
import { applyOriginalCivicIndustry } from './OriginalCivicIndustries.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES as P, unapplyOriginalProductionIndustry, applyOriginalLiveProductionIndustry } from './OriginalProductionIndustries.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES as X, applyOriginalSpecialIndustry, originalSpecialIndustryFunctional } from './OriginalSpecialIndustries.mjs';
import { ORIGINAL_MARKET_STABILITY as S, countOriginalIndustries } from './OriginalMarketStability.mjs';
import { reapplyOriginalIndustryAccessibility } from './OriginalMarketAccessibility.mjs';
const f = Math.fround, check = (v, message) => requireThat(v, 'UNSUPPORTED_LIVE_INDUSTRY_EFFECTS', message);
const erase = (s, channel, id) => put(s, channel, id, 0, true);
const eraseAll = (s, id) => { for (const channel of ['flat', 'percent', 'mult']) erase(s, channel, id); };
function always(s, channel, id, value) {
    const list = s.modifiers[channel], at = list.findIndex(row => row.id === id), mod = { id, value };
    if (at < 0) list.push(mod); else list[at] = mod;
}
export function reapplyOriginalLiveIndustryEffects(runtime) {
    const { market: m, context } = runtime;
    for (const method of ['modifyPopulationStability', 'applyFinances', 'reapplyImmigrationRegistrations']) check(typeof runtime[method] === 'function', 'Missing live industry callback');
    const count = countOriginalIndustries(m.industries.map(i => ({ industryId: i.state.industryId, operating: i.operating })), context.constructionQueue);
    const habitable = m.conditions.some(c => c.id === 'habitable'), conditionIds = m.conditions.map(c => c.id), financialReads = [], deficitReads = [], groundDefenseReads=[], militaryReads=[];
    const available = id => { check(m.commodities[id], 'Missing live commodity availability'); return Math.max(0, Math.floor(stat(m.commodities[id].available) + 0.5)); };
    const selected = ids => Object.fromEntries(ids.map(id => [id, available(id)]));
    const deficit = (state, ids, phase) => {
        let value = 0, commodityId = null;
        for (const id of ids) {
            const next = Math.max(0, Math.trunc(stat(state.demand[id] ?? blank())) - available(id));
            if (next > value) { value = next; commodityId = id; }
        }
        deficitReads.push({ industryId: state.industryId, phase, commodityId, deficit: value }); return value;
    };
    const accessStat = () => ({ base: 0, modifiers: m.accessibility });
    const maxStat = () => ({ base: 0, modifiers: m.maxIndustries });
    let population = null;
    for (const entry of m.industries) {
        const id = entry.state.industryId, d = S.industries[id]; check(d, 'Unsupported economic industry plugin');
        const kind = d.className, prefix = 'ind_' + id, station = kind === 'OrbitalStation';
        if(runtime.reapplyCivicIndustry&&['PopulationAndInfrastructure','Spaceport','GroundDefenses'].includes(kind)){
            const result=runtime.reapplyCivicIndustry(entry);check(result&&!result.then,'Actual synchronous civic reapply required');const finance=result.finance;
            financialReads.push({industryId:id,incomeMult:stat(m.incomeMult),upkeepMult:stat(m.upkeepMult),income:finance.income,upkeep:finance.upkeep});
            if(result.population)population=result.population;
            if(result.defense){groundDefenseReads.push(result.defense);deficitReads.push({industryId:id,phase:'after-demand',...result.defense.stabilityDeficit});}continue;
        }
        if(runtime.reapplyResourceIndustry&&['farming','aquaculture','mining'].includes(id)){
            const result=runtime.reapplyResourceIndustry(entry);check(result&&!result.then,'Actual synchronous resource reapply required');const finance=result.finance;
            financialReads.push({industryId:id,incomeMult:stat(m.incomeMult),upkeepMult:stat(m.upkeepMult),income:finance.income,upkeep:finance.upkeep});continue;
        }
        const oldDemand = structuredClone(entry.state);
        // Economic channels of native unapply happen BEFORE a population lazy network getter.
        if (kind === 'PopulationAndInfrastructure') {
            erase(m.stability, 'flat', 'PAI_improve');
            for (const n of [0, 1, 2]) eraseAll(m.stability, prefix + '_' + n);
            for (const n of [0, 1]) erase(accessStat(), 'flat', prefix + '_' + n);
            erase(maxStat(), 'flat', prefix);
            const modId = prefix + '_3';
            for (const key of [modId, modId + 'ifi']) erase(m.upkeepMult, 'mult', key);
            erase(m.incomeMult, 'mult', modId);
            for (const key of [modId, '_' + modId + '_mm', '_' + modId + '_ms', '_' + modId + '_overmax']) erase(m.stability, 'flat', key);
            if (!conditionIds.includes('comm_relay')) erase(m.stability, 'flat', 'core_comm_relay');
            population = runtime.modifyPopulationStability();
            check(!population?.then, 'Population callback must be synchronous');
        } else if (kind === 'TradeCenter') {
            erase(m.stability, 'flat', prefix);
            for (const n of [0, 1, 2]) erase(m.incomeMult, 'percent', prefix + '_' + n);
            if (entry.modifiers.specialItemId === 'dealmaker_holosuite') erase(m.incomeMult, 'percent', 'dealmaker_holosuite');
        } else if(kind==='MilitaryBase'&&m.military) {
            unapplyOriginalMilitaryBase(m,entry);
        } else if(kind==='GroundDefenses') {
            unapplyOriginalGroundDefenseEffects(m,entry);
        } else if (['MilitaryBase', 'OrbitalStation', 'LionsGuardHQ'].includes(kind)) {
            erase(m.stability, 'flat', prefix);
            if (station) erase(m.stability, 'flat', 'orbital_station_improve');
        }
        const updateAdministratorInputs=()=>{
            if(!runtime.readAdministratorIndustryInputs)return; // Explicit legacy economic projection only.
            const values=runtime.readAdministratorIndustryInputs(id);check(values&&!values.then,'Current administrator getter must return synchronously');
            for(const key of ['adminSupplyBonus','adminDemandReduction',...(kind==='FuelProduction'?['adminFuelSupplyBonus']:[])])check(typeof values[key]==='number'&&Number.isFinite(values[key])&&f(values[key])===values[key],'Actual current administrator float required: '+key);
            entry.modifiers.adminSupplyBonus=values.adminSupplyBonus;entry.modifiers.adminDemandReduction=values.adminDemandReduction;
            if(kind==='FuelProduction'){check(m.production,'Fuel production context required');m.production.adminFuelSupplyBonus=values.adminFuelSupplyBonus;}
        };
        if(['farming','aquaculture','mining'].includes(id)&&runtime.updateResourceImmigration){
            runtime.updateResourceImmigration(entry,false);unapplyOriginalLiveResourceIndustry(entry);updateAdministratorInputs();
            applyOriginalLiveResourceIndustry(m,entry,{registerImmigration:()=>runtime.updateResourceImmigration(entry,true),readPlanetIsGasGiant:runtime.readPlanetIsGasGiant,readCommodityAvailable:c=>runtime.readCommodityAvailable(c),applyFinances:()=>{
                const finance=runtime.applyFinances(id);check(finance&&!finance.then,'Financial callback must return synchronously');financialReads.push({industryId:id,incomeMult:stat(m.incomeMult),upkeepMult:stat(m.upkeepMult),income:finance.income,upkeep:finance.upkeep});return finance;
            }});continue;
        }
        if(kind==='MilitaryBase'&&m.military){
            updateAdministratorInputs();
            const result=applyOriginalMilitaryBase(m,entry,{readCommodityAvailable:c=>runtime.readCommodityAvailable(c),applyFinances:()=>{
                const finance=runtime.applyFinances(id);check(finance&&!finance.then,'Financial callback must return synchronously');
                financialReads.push({industryId:id,incomeMult:stat(m.incomeMult),upkeepMult:stat(m.upkeepMult),income:finance.income,upkeep:finance.upkeep});return finance;
            }});
            militaryReads.push(result);deficitReads.push({industryId:id,phase:'after-demand',...result.stabilityDeficit});continue;
        }
        // These kernels touch commodity quantities only; no eager maxima/network refresh follows them.
        if (Object.hasOwn(P.industries, id)) {
            check(m.production, 'Production context required');
            const un = unapplyOriginalProductionIndustry({state: entry.state, productionQuality: m.production.productionQuality, specialItemId: entry.modifiers.specialItemId});
            for(const channel of ['flat','percent','mult'])m.production.productionQuality[channel].splice(0,m.production.productionQuality[channel].length,...structuredClone(un.productionQuality[channel]));
            updateAdministratorInputs();
            entry.state=structuredClone(un.state);
            applyOriginalLiveProductionIndustry(m,entry,{readCommodityAvailable:c=>runtime.readCommodityAvailable(c),applyFinances:()=>{
                const finance=runtime.applyFinances(id);check(finance&&!finance.then,'Financial callback must return synchronously');financialReads.push({industryId:id,incomeMult:stat(m.incomeMult),upkeepMult:stat(m.upkeepMult),income:finance.income,upkeep:finance.upkeep});return finance;
            }});continue;
        } else if (Object.hasOwn(X.industries, id)) {
            check(m.special, 'Special industry context required');
            updateAdministratorInputs();
            const needed = id === 'lionsguard' ? ['hand_weapons'] : id === 'cryosanctum' ? ['organics','supplies'] : [];
            const result = applyOriginalSpecialIndustry({...entry, marketSize: m.size, available: selected(needed), factionId: m.factionId, techMiningMult: m.special.techMiningMult});
            entry.state = structuredClone(result.state); m.special.techMiningMult = structuredClone(result.techMiningMult);
        } else {
            updateAdministratorInputs();
            entry.state = structuredClone(['farming','aquaculture','mining'].includes(id)
                ? applyOriginalResourceIndustry({...entry, marketSize: m.size, available: selected(['heavy_machinery'])})
                : applyOriginalCivicIndustry({...entry, marketSize: m.size, habitable}));
        }
        // Commerce's Base financial read precedes its market-income bonuses. Port shortage uses NEW demand.
        const finance = runtime.applyFinances(id);
        check(finance && !finance.then, 'Financial callback must return synchronously');
        financialReads.push({industryId: id, incomeMult: stat(m.incomeMult), upkeepMult: stat(m.upkeepMult), income: finance.income, upkeep: finance.upkeep});
        if(kind==='GroundDefenses'){
            check(typeof runtime.readCommodityAvailable==='function','Ground defenses require the actual lazy commodity getter');
            applyOriginalGroundDefenseBaseEffects(m,entry);
            const defense=applyOriginalGroundDefenseEffects(m,entry,c=>runtime.readCommodityAvailable(c));
            groundDefenseReads.push(defense);deficitReads.push({industryId:id,phase:'after-demand',...defense.stabilityDeficit});
        } else if (kind === 'TradeCenter') {
            const c = X.constants;
            if (entry.modifiers.aiCoreId === 'alpha_core') put(m.incomeMult, 'percent', prefix + '_1', c.ALPHA_CORE_BONUS);
            if (entry.modifiers.improved) put(m.incomeMult, 'percent', prefix + '_2', c.IMPROVE_BONUS);
            if (entry.modifiers.specialItemId === 'dealmaker_holosuite') put(m.incomeMult, 'percent', 'dealmaker_holosuite', c.DEALMAKER_INCOME_PERCENT_BONUS);
            put(m.stability, 'flat', prefix, -c.STABILITY_PENALTY); put(m.incomeMult, 'percent', prefix + '_0', c.BASE_BONUS);
            if (!functional(entry.operating)) {
                erase(m.stability, 'flat', prefix);
                for (const n of [0,1,2]) erase(m.incomeMult, 'percent', prefix + '_' + n);
                if (entry.modifiers.specialItemId === 'dealmaker_holosuite') erase(m.incomeMult, 'percent', 'dealmaker_holosuite');
            }
        } else if (kind === 'PopulationAndInfrastructure') {
            if (entry.modifiers.improved) put(m.stability, 'flat', 'PAI_improve', S.population.IMPROVE_STABILITY_BONUS);
            if (deficit(entry.state, ['domestic_goods'], 'after-demand') <= 0) put(m.stability, 'flat', prefix + '_0', 1);
            if (deficit(entry.state, ['luxury_goods'], 'after-demand') <= 0 && m.size > 3) put(m.stability, 'flat', prefix + '_1', 1);
            const food = deficit(entry.state, habitable ? ['food'] : ['food','organics'], 'after-demand');
            if (food > 0) put(m.stability, 'flat', prefix + '_2', -food);
            put(maxStat(), 'flat', prefix, S.maxIndustries[Math.max(0, Math.min(9, m.size - 1))]);
            if (count > Math.floor(stat(maxStat()) + 0.5)) put(m.stability, 'flat', '_' + prefix + '_3_overmax', -S.settings.overMaxIndustriesPenalty);
        } else if (['MilitaryBase', 'OrbitalStation', 'LionsGuardHQ'].includes(kind)) {
            if (station && entry.modifiers.improved) put(m.stability, 'flat', 'orbital_station_improve', S.station.IMPROVE_STABILITY_BONUS);
            const base = station ? d.tags.includes('battlestation') ? 2 : d.tags.includes('starfortress') ? 3 : 1 : kind === 'LionsGuardHQ' ? 2 : kind === 'MilitaryBase' ? d.tags.includes('patrol') ? 1 : 2 : 1;
            const ids = station ? ['supplies','crew'] : kind === 'LionsGuardHQ' ? ['supplies','fuel','ships','hand_weapons'] : kind === 'MilitaryBase' ? ['supplies','fuel','ships'] : ['supplies','marines','hand_weapons'];
            const bonus = base - Math.min(base, deficit(station ? oldDemand : entry.state, ids, station ? 'before-demand' : 'after-demand'));
            if (bonus > 0) put(m.stability, 'flat', prefix, bonus);
            if (!(kind === 'LionsGuardHQ' ? originalSpecialIndustryFunctional(id, entry.operating, m.factionId) : functional(entry.operating))) {
                if (station) erase(m.stability, 'flat', 'orbital_station_improve'); erase(m.stability, 'flat', prefix);
            }
        }
        if (id === 'population' || kind === 'Spaceport') {
            const first = context.constructionQueue[0], constructing = m.industries.some(i => i.state.industryId !== 'population' && i.operating.building && i.operating.upgradeId === null);
            const result = reapplyOriginalIndustryAccessibility({accessibility: m.accessibility, hasSpaceport: m.hasSpaceport, marketSize: m.size,
                firstQueuedIndustryHasSpaceportTag: Boolean(first && S.industries[first]?.tags.includes('spaceport')) && !constructing,
                industries: [{industryId:id, operating:entry.operating, aiCoreId:entry.modifiers.aiCoreId, improved:entry.modifiers.improved, specialItemId:entry.modifiers.specialItemId}],
                ...(entry.modifiers.specialItemId === 'fullerene_spool' ? {portItemContext:context.portItemContext} : {}),
            });
            m.accessibility = structuredClone(result.accessibility); m.hasSpaceport = result.hasSpaceport;
        }
    }
    const immigration = runtime.reapplyImmigrationRegistrations();
    check(immigration && !immigration.then && Array.isArray(immigration.permanent) && Array.isArray(immigration.transient), 'Immigration registration must return synchronous object sets');
    always(m.upkeepMult, 'mult', 'upkeep_hazard_mod', Math.max(stat(m.hazard), f(S.settings.minUpkeepMult)));
    return immutableJSON({scope:'ordered-live-industry-economic-effects-only', industryCount:count, financialReads, deficitReads, groundDefenseReads, militaryReads, population,
        pending:['fleet-and-defense-runtime','industry-listeners','player-commerce-submarket-lifecycle']});
}
