import { ORIGINAL_MARKET_ECONOMY } from '../../src/campaign/rules/OriginalMarketEconomy.mjs';
const ensure = (v, message) => { if (!v) throw Error('NATIVE_SAVE_NETWORK: ' + message); };
const float = (text, label) => {
    ensure(typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text), 'Invalid ' + label);
    const value = Math.fround(Number(text)); ensure(Number.isFinite(value), 'Nonfinite ' + label); return value;
};
export function captureNativeNetworkLocation(g, r, market) {
    const primary = g.child(market, 'primaryEntity'), location = g.child(primary, 'cL');
    const unresolved = [];
    if (primary && !['Plnt', 'CampaignPlanet', 'CCEnt', 'CustomCampaignEntity'].includes(primary.attributes.cl ?? primary.name)) unresolved.push('unreviewed-primary-location-getter');
    const vector = primary ? g.child(location && location !== g.child(g.root, 'hyperspace') ? location : primary, location && location !== g.child(g.root, 'hyperspace') ? 'l' : 'loc') : g.child(market, 'location');
    let position = null;
    if (!vector) unresolved.push('missing-hyperspace-position');
    else {
        ensure(!vector.children.length, 'Unknown Vector2f encoding');
        const parts = vector.text.trim().split('|'); ensure(parts.length === 2, 'Invalid hyperspace vector');
        position = { x: float(parts[0], 'hyperspace x'), y: float(parts[1], 'hyperspace y') };
    }
    return { scope: 'native-market-hyperspace-getter-input', primaryRef: primary ? r.ref(primary) : null, locationRef: location ? r.ref(location) : null, position, unresolved };
}
export function captureNativeNetworkState(g, r, markets) {
    const manager = g.child(g.root, 'factionManager'), registry = g.child(manager, 'factions'), relations = g.child(manager, 'relations');
    const registeredFactionIds = registry ? r.members(registry).map(e => {
        ensure(e.name === 'e' && e.children.length === 2, 'Malformed faction registry');
        const key = g.resolve(e.children[0]), faction = g.resolve(e.children[1]);
        ensure(key.name === 'st' && (!faction.attributes.cl || faction.attributes.cl === 'Faction') && r.value(faction,'id',true) === key.text, 'Faction registry identity differs'); return key.text;
    }) : null;
    ensure(registeredFactionIds === null || new Set(registeredFactionIds).size === registeredFactionIds.length, 'Duplicate registered faction');
    const factionIds = [...new Set([...markets.map(m => m.factionId), ...(registeredFactionIds ?? [])])];
    const map = new Map(), hostility = {}, relationReadbacks = [], unresolved = [];
    if (!relations) unresolved.push('faction-relations-capture-required');
    for (const e of r.members(relations)) {
        ensure(e.name === 'e' && e.children.length === 2, 'Malformed faction relation map');
        const key = g.resolve(e.children[0]), value = g.resolve(e.children[1]);
        ensure(key.name === 'st' && !map.has(key.text), 'Duplicate relation key'); map.set(key.text, value);
    }
    for (const from of factionIds) {
        hostility[from] = {};
        for (const to of factionIds) {
            if (from === to) continue;
            const key = from + '_' + to, node = map.get(key); let value = 0;
            if (node) {
                ensure((node.attributes.cl ?? node.name) === 'FMRelation', 'Unknown relation class');
                const one = r.value(node, 'factionIdOne', true), two = r.value(node, 'factionIdTwo', true);
                ensure((one === from && two === to) || (one === to && two === from), 'Relation endpoint identity differs');
                value = float(r.value(node, 'value', true), 'relation');
            }
            // RepLevel.getLevelFor uses getRepInt, not isHostileToFast's raw float threshold.
            const hostile = value < 0 && Math.floor(Math.fround(Math.fround(-value) * 100) + 0.5) > 49;
            hostility[from][to] = hostile;
            relationReadbacks.push({ from, to, objectRef: node ? r.ref(node) : null, value, hostile });
        }
    }
    const playerStats = g.child(g.child(g.child(g.root, 'characterData'), 'person'), 'stats');
    if (!playerStats && markets.some(m => m.playerOwned)) unresolved.push('player-export-stats-required');
    const playerExportModifiers = Object.fromEntries(Object.keys(ORIGINAL_MARKET_ECONOMY.commodities).map(id => [id, null])), seen = new Set();
    for (const e of r.members(g.child(g.child(playerStats, 'dynamic'), 'stats'))) {
        ensure(e.name === 'e' && e.children.length === 2, 'Invalid player dynamic map');
        const key = g.resolve(e.children[0]).text.trim(), prefix = 'commodity_export_credits_mult';
        if (!key.startsWith(prefix)) continue;
        const id = key.slice(prefix.length); if (!Object.hasOwn(playerExportModifiers, id)) continue;
        const value = g.resolve(e.children[1]);
        ensure(!seen.has(id) && (value.attributes.cl ?? value.name) === 'MStat', 'Wrong/duplicate player export statistic'); seen.add(id);
        playerExportModifiers[id] = r.stat(value);
        ensure(playerExportModifiers[id].temporary.length === 0, 'Untimed player export stat expected');
    }
    return { scope: 'native-economy-network-getter-inputs', registeredFactionIds, hostility, relationReadbacks, playerStatsRef: playerStats ? r.ref(playerStats) : null, playerExportModifiers, unresolved };
}
