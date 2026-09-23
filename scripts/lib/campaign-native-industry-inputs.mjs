import {captureNativeMilitaryMemory} from './campaign-native-military.mjs';
/** Getter dependencies for offline commodity-industry restoration, not runtime economy publication. */
const ensure = (v, message) => { if (!v) throw Error('NATIVE_SAVE_INDUSTRY_INPUTS: ' + message); };
function float(text, label = 'previous stability') {
    ensure(typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text), 'Invalid ' + label);
    const value = Math.fround(Number(text)); ensure(Number.isFinite(value), 'Nonfinite ' + label); return value;
}
function dynamicValue(g, r, market, container, key, type) {
    let value = null, seen = false;
    for (const e of r.members(g.child(g.child(g.child(market, 'stats'), 'dynamic'), container))) {
        ensure(e.name === 'e' && e.children.length === 2, 'Invalid dynamic map entry');
        if (g.resolve(e.children[0]).text.trim() !== key) continue;
        const node = g.resolve(e.children[1]);
        ensure(!seen && (node.attributes.cl ?? node.name) === type, 'Wrong/duplicate dynamic statistic type'); seen = true;
        value = type === 'SBonus' ? r.bonus(node) : r.stat(node);
        if (type === 'MStat') ensure(value.temporary.length === 0, 'Plain dynamic stat cannot have temporary modifiers');
    }
    return value;
}
/** Null fields are native nulls, not unknown capture inputs. Preserve order and saved weight modifiers. */
export function captureNativePopulationState(g, r, market) {
    const composition = field => {
        const node = g.child(market, field);
        if (node === null) return null;
        ensure(!node.attributes.cl || node.attributes.cl === 'com.fs.starfarer.api.impl.campaign.population.PopulationComposition', 'Unsupported population class');
        ensure(node.children.every(c => ['comp', 'weight'].includes(c.name)), 'Unknown saved population field');
        const seen = new Set();
        const rows = r.members(g.child(node, 'comp', true)).map(entry => {
            ensure(entry.name === 'e' && entry.children.length === 2, 'Invalid population composition entry');
            const key = g.resolve(entry.children[0]), value = g.resolve(entry.children[1]);
            const factionId = key.text.trim();
            ensure(key.name === 'st' && factionId.length > 0 && factionId.length <= 256 && !seen.has(factionId), 'Invalid/duplicate population faction');
            ensure(value.name === 'fp' && value.children.length === 0, 'Invalid population faction weight');
            seen.add(factionId);
            return { factionId, amount: float(value.text.trim(), 'population faction amount') };
        });
        const weight = r.stat(g.child(node, 'weight'));
        ensure(weight === null || weight.temporary.length === 0, 'Population weight is not a temporary stat');
        // PopulationComposition.readResolve repairs a missing weight only; it never recomputes comp.
        return { composition: rows, weight: weight?.state ?? { base: 0, modifiers: { flat: [], percent: [], mult: [] } } };
    };
    return { scope: 'native-saved-population-state', population: composition('population'), incoming: composition('incoming') };
}
export function captureNativeIndustryInputs(g, r, market) {
    const factionId = r.value(market, 'factionId', true), unresolved = [];
    let faction = null;
    const seen = new Set();
    for (const entry of r.members(g.child(g.child(g.root, 'factionManager'), 'factions'))) {
        ensure(entry.name === 'e' && entry.children.length === 2, 'Invalid faction registry map');
        const key = g.resolve(entry.children[0]), object = g.resolve(entry.children[1]);
        ensure(key.name === 'st' && !seen.has(key.text), 'Invalid/duplicate faction registry key'); seen.add(key.text);
        if (key.text !== factionId) continue;
        ensure((!object.attributes.cl || object.attributes.cl === 'Faction') && r.value(object, 'id', true) === factionId, 'Faction registry identity differs');
        const illegal = g.child(object, 'illegal');
        if (illegal === null) { unresolved.push('faction-spec-illegal-default-requires-restoration'); continue; }
        const illegalCommodityIds = r.names(illegal);
        ensure(new Set(illegalCommodityIds).size === illegalCommodityIds.length, 'Duplicate saved illegal commodity');
        faction = { factionId, objectRef: r.ref(object), illegalCommodityIds };
    }
    if (!faction) unresolved.push('registered-faction-legality');
    const previousStabilityText = r.value(market, 'prevStability');
    if (previousStabilityText === null) unresolved.push('previous-stability');
    const portText = r.value(market, 'hasSpaceport');
    ensure(portText === null || portText === 'true' || portText === 'false', 'Invalid saved hasSpaceport');
    const constructionQueueNode=g.child(market,'constructionQueue');
    const constructionQueueState={objectRef:constructionQueueNode?r.ref(constructionQueueNode):'created-construction-queue:'+r.ref(market),items:r.members(g.child(constructionQueueNode,'items')).map(item=>{
        const id=r.value(item,'id',true),costText=r.value(item,'cost',true),cost=Number(costText);
        ensure(id.length>0&&/^-?\d+$/.test(costText)&&Number.isInteger(cost)&&cost>=-2147483648&&cost<=2147483647,'Invalid native construction queue item');return {objectRef:r.ref(item),industryId:id,cost};
    })};
    const constructionQueue=constructionQueueState.items.map(item=>item.industryId);
    const incentives = r.value(market,'incentives'), credits = r.value(market,'incentiveCredits');
    ensure(incentives === null || incentives === 'true' || incentives === 'false', 'Invalid saved incentive switch');
    return { scope: 'native-industry-commodity-getter-inputs',
        militaryCapture:{scope:'native-military-market-inputs',memory:captureNativeMilitaryMemory(g,r,market),officerProbability:dynamicValue(g,r,market,'mods','officer_prob','SBonus')??{flat:[],percent:[],mult:[]}},
        economyBonuses:Object.fromEntries(['production_quality_mod','fleet_quality_mod','combat_fleet_size_mult','patrol_num_light_mod','patrol_num_medium_mod','patrol_num_heavy_mod','additional_officer_prob_mult','officer_is_merc_prob','admin_prob'].map(key=>[key,dynamicValue(g,r,market,'mods',key,'SBonus')])),
        immigration: {maxMarketSize:dynamicValue(g,r,market,'mods','max_market_size','SBonus'), incentives:{on:incentives === 'true',credits:credits === null ? 0 : float(credits,'incentive credits')}},
        marketEffects: { tags:g.child(market,'tags')===null?null:r.names(g.child(market,'tags')), constructionQueueState, hasSpaceport: portText === 'true', constructionQueue, maxIndustries: dynamicValue(g, r, market, 'mods', 'max_industries', 'SBonus') },
        previousStability: previousStabilityText === null ? null : float(previousStabilityText),
        productionQuality: dynamicValue(g, r, market, 'mods', 'production_quality_mod', 'SBonus'),
        techMiningMult: dynamicValue(g, r, market, 'stats', 'tech_mining_mult', 'MStat'),
        faction, unresolved,
    };
}
