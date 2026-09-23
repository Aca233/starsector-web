import { ORIGINAL_SPECIAL_INDUSTRIES, newOriginalSpecialIndustry } from '../src/campaign/rules/OriginalSpecialIndustries.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES, newOriginalProductionIndustry } from '../src/campaign/rules/OriginalProductionIndustries.mjs';
import { newOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { newOriginalResourceIndustry } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
export const f = Math.fround;
export const mod = (id, value) => ({ id, value: f(value) });
export const stat = (base = 0, flat = [], percent = [], mult = []) => ({ base: f(base), modifiers: { flat, percent, mult } });
export const operating = () => ({ disrupted: false, building: false, upgradeId: null });
export const condition = (id, modId = id) => ({ id, modId, surveyed: true, suppressed: false });
export const callback = (kind, id) => ({ kind, id });
export const value = (s, id) => s.modifiers.flat.find(m => m.id === id)?.value;
export function industry(industryId) { return structuredClone({ state: ['farming','aquaculture','mining'].includes(industryId) ? newOriginalResourceIndustry(industryId) : Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries,industryId) ? newOriginalProductionIndustry(industryId) : Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries,industryId) ? newOriginalSpecialIndustry(industryId) : newOriginalCivicIndustry(industryId), operating: operating(), modifiers: { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: stat(), demandReductionFromOther: stat(), specialItemId: null } }); }
export function request(ids = ['population','spaceport','mining']) {
  const market = { marketId: 'm', factionId: 'player', size: 4, stability: 5, hostileToIndependent: false };
  return { market, hazard: 1, accessibility: stat(0,[mod('access',0.7)]).modifiers, industries: ids.map(industry), constructionQueue: [], conditions: [], modifiers: { permanent: [], transient: ids.filter(id=>['population','spaceport','megaport','mining','farming','aquaculture','commerce','techmining'].includes(id)).map(id=>callback('industry',id)) }, freeMarketDaysByModId: {}, adminAiCoreId: null, drugsAvailable: 0, factionIds: ['player','pirates','poor','independent','luddic_church','luddic_path','tritachyon'], neighbors: { econGroup: null, roster: [{marketId:'m',econGroup:null}], markets: [{marketId:'m',factionId:'player',size:4,location:{x:0,y:0},hostileToTarget:false}] }, maxMarketSize: stat().modifiers, incentives: { on: false, credits: 0 }, days: 1, uiUpdateOnly: false };
}
export function financialInput(ids = ['population','spaceport','farming']) {
  const commodities = ['food','organics','domestic_goods','luxury_goods','drugs','organs','supplies','fuel','ships','crew','marines','hand_weapons','heavy_machinery'];
  return { commodityPass: { marketSize: 5, freePort: false, factionIllegalCommodityIds: [], conditions: [condition('habitable')], industries: ids.map(industry), available: {heavy_machinery:20}, commodities: commodities.map(commodityId=>({commodityId,previousSupplyLegal:true,previousDemandLegal:true})) }, stability: stat(), incomeMult: stat(1), upkeepMult: stat(1,[],[],[mod('upkeep_hazard_mod',2)]), maxIndustries: stat().modifiers, previousStability: 4, governance: {marketId:'m',markets:[{marketId:'m',playerOwned:false,adminIsPlayer:false}],maxOutposts:2}, constructionQueue: [], conditionStateByModId: {}, marketCommodities: commodities.map(commodityId=>({commodityId,maxSupply:4,maxDemand:4,available:20,shippingFaction:4,maxExportFaction:4})) };
}
