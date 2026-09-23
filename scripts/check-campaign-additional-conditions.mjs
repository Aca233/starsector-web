import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ORIGINAL_ADDITIONAL_CONDITIONS as R, applyOriginalAdditionalCondition as apply, applyOriginalAdditionalIncoming as incoming, matchesOriginalLuddicMajority as matches, originalShippingLossPenalty as penalty } from '../src/campaign/rules/OriginalAdditionalConditions.mjs';
import { reapplyOriginalMarketConditions as reapply } from '../src/campaign/rules/OriginalMarketConditions.mjs';
import { put } from '../src/campaign/rules/OriginalIndustryState.mjs';
import { nativeAdditionalConditionsOracle } from './campaign-additional-conditions-native-oracle.mjs';
const f = Math.fround, blank = (base = 0) => ({ base, modifiers: { flat: [], percent: [], mult: [] } });
const industry = industryId => ({ industryId, supplyBonusFromOther: blank() });
const church = (extra = {}) => ({ playerOwned: true, madeChurchDeal: false, habitable: true, adminId: null, defeatedExpedition: false, constructionQueue: [], ...extra });
function state() { return { hazard: blank(1), accessibility: blank().modifiers, stability: blank(5), industries: [industry('farming'), industry('aquaculture'), industry('lightindustry')], suppressedConditionIds: [], transientModifiers: [], commodities: [] }; }
const callback = (conditionId, s = state(), context = null, action = 'apply', modId = 'condition_1') => apply({ conditionId, modId, action, state: s, context }).state;
const value = (s, id = 'condition_1', channel = 'flat') => s.modifiers[channel].find(m => m.id === id)?.value;
function hostFor(conditions, initial) {
    const holder = { state: structuredClone(initial), conditions };
    const effect = (c, id, action) => { if (['hot', 'poor_light'].includes(c.conditionId)) {
        put(holder.state.hazard, 'flat', id, 0.25, action === 'unapply');
        return;
    } holder.state = structuredClone(callback(c.conditionId, holder.state, c.context, action, id)); };
    const host = { listConditions: () => holder.conditions, getSpecificCondition: id => holder.conditions.find(c => c.modId === id) ?? null, getConditionId: c => c.conditionId, getModId: c => c.modId, isSurveyed: c => c.surveyed, isSuppressed: id => holder.state.suppressedConditionIds.includes(id), apply: (c, id) => effect(c, id, 'apply'), unapply: (c, id) => effect(c, id, 'unapply') };
    return { holder, host };
}
test('additional-condition catalogue is pinned to original source/config hashes', () => {
    const result = spawnSync('node', ['scripts/import-campaign-additional-conditions.mjs', '--check'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(Object.keys(R.conditions).length, 12);
    assert.deepEqual(R.productionOverrides, {});
});
test('historical world farming constructors do not add obsolete food, hazard or machinery effects', () => {
    const s = state();
    put(s.hazard, 'flat', 'condition_1', 0.75);
    for (const id of ['arid', 'ice', 'barren_marginal', 'tundra'])
        for (const action of ['apply', 'unapply'])
            assert.deepEqual(callback(id, s, null, action), s);
});
test('gravity writes both hazard and accessibility but unapply leaves other channels', () => {
    for (const id of ['low_gravity', 'high_gravity']) {
        let s = state();
        put(s.hazard, 'percent', 'condition_1', 25);
        s = callback(id, s);
        assert.equal(value(s.hazard), id === 'high_gravity' ? 0.5 : 0.25);
        assert.equal(s.accessibility.flat[0].value, id === 'high_gravity' ? f(-0.1) : f(0.1));
        s = callback(id, s, null, 'unapply');
        assert.equal(value(s.hazard), undefined);
        assert.equal(value(s.hazard, 'condition_1', 'percent'), 25);
        assert.deepEqual(s.accessibility.flat, []);
    }
});
test('solar array uses existing farming before aquaculture and unconditionally removes suppression on unapply', () => {
    let s = state();
    s.suppressedConditionIds = ['hot', 'other'];
    s = callback('solar_array', s);
    assert.equal(value(s.industries[0].supplyBonusFromOther), 2);
    assert.equal(value(s.industries[1].supplyBonusFromOther), undefined);
    assert.deepEqual(s.suppressedConditionIds, ['hot', 'other', 'poor_light']);
    s = callback('solar_array', s, null, 'unapply');
    assert.deepEqual(s.suppressedConditionIds, ['other']);
    s = structuredClone(s);
    s.industries.splice(0, 1);
    s = callback('solar_array', s);
    assert.equal(value(s.industries[0].supplyBonusFromOther), 2);
});
test('church eligibility examines first queued industry only, but needs an existing rural industry', () => {
    const s = state(), rural = { industryId: 'lightindustry', specExists: true }, heavy = { industryId: 'heavyindustry', specExists: true };
    assert.equal(matches(s.industries, church({ constructionQueue: [rural, heavy] })), true);
    assert.equal(matches(s.industries, church({ constructionQueue: [heavy, rural] })), false);
    assert.equal(matches([], church({ constructionQueue: [rural] })), false);
    assert.equal(matches(s.industries, church({ constructionQueue: [{ industryId: 'missing', specExists: false }, heavy] })), true);
    for (const id of ['mining', 'militarybase', 'highcommand', 'lionsguard'])
        assert.equal(matches([...s.industries, industry(id)], church()), false);
    for (const extra of [{ madeChurchDeal: true }, { habitable: false }, { adminId: 'dardan_kato' }])
        assert.equal(matches(s.industries, church(extra)), false);
    assert.equal(matches(s.industries, church({ playerOwned: false, madeChurchDeal: true, defeatedExpedition: true })), true);
});
test('church bonuses and removal match native modifier-channel behavior', () => {
    let s = state();
    put(s.stability, 'percent', 'condition_1', 20);
    put(s.stability, 'mult', 'condition_1', 2);
    put(s.industries[0].supplyBonusFromOther, 'percent', 'condition_1', 25);
    s = callback('luddic_majority', s, church({ defeatedExpedition: true }));
    assert.equal(value(s.stability), 2);
    assert.equal(value(s.industries[0].supplyBonusFromOther), 2);
    assert.equal(s.transientModifiers.length, 1);
    s = callback('luddic_majority', s, church({ madeChurchDeal: true }));
    assert.deepEqual(s.stability.modifiers, { flat: [], percent: [], mult: [] });
    assert.equal(value(s.industries[0].supplyBonusFromOther, 'condition_1', 'percent'), 25);
    assert.equal(s.transientModifiers.length, 0);
});
test('registered incoming callbacks preserve composition order and do not rerun church eligibility', () => {
    const seed = { composition: [{ factionId: 'luddic_church', amount: f(0.1) }, { factionId: 'independent', amount: 20 }], weight: blank() };
    const result = incoming({ conditionId: 'luddic_majority', modId: 'growth', marketSize: 6, playerOwned: true, defeatedExpedition: true, incoming: seed });
    assert.equal(result.composition[0].amount, f(f(0.1) + 60));
    assert.equal(value(result.weight, 'growth'), 60);
    const mild = incoming({ conditionId: 'mild_climate', modId: 'mild', marketSize: 6, playerOwned: false, defeatedExpedition: false, incoming: result });
    assert.equal(value(mild.weight, 'mild'), 6);
    assert.equal(mild.composition[0].amount, f(result.composition[0].amount + 30));
    assert.equal(seed.weight.modifiers.flat.length, 0);
});
test('pather agreement checks intel market faction, not ownership, and sleeping apply leaves old flat intact', () => {
    let s = state();
    s = callback('pather_cells', s, { intelMarketFactionId: 'independent', savedSleeper: false, playerHasPatherAgreement: true });
    assert.equal(value(s.stability), -1);
    s = callback('pather_cells', s, { intelMarketFactionId: 'player', savedSleeper: false, playerHasPatherAgreement: true });
    assert.equal(value(s.stability), -1);
    s = callback('pather_cells', s, { intelMarketFactionId: 'player', savedSleeper: false, playerHasPatherAgreement: true }, 'unapply');
    assert.equal(value(s.stability), undefined);
});
test('shipping loss recovery removes only rounded nonzero prefixed flat values after native available rounding', () => {
    const s = state(), available = blank(8);
    for (const [id, v] of [['sh_loss_a', -2], ['sh_loss_b', f(-0.49)], ['sh_loss_positive', 0.5], ['unrelated', -1]])
        put(available, 'flat', id, v);
    put(available, 'percent', 'sh_loss_p', 10);
    s.commodities = [{ commodityId: 'food', maxSupply: 8, available }];
    const out = callback('shipping_disruption', s, { marketSize: 6, playerOwned: true, shippingLost: blank(0) });
    assert.equal(out.accessibility.flat[0].value, f(-0.01));
    assert.deepEqual(out.commodities[0].available.modifiers.flat.map(m => m.id), ['sh_loss_b', 'unrelated']);
    assert.equal(value(out.commodities[0].available, 'sh_loss_p', 'percent'), 10);
    assert.equal(s.commodities[0].available.modifiers.flat.length, 4);
    const npc = callback('shipping_disruption', s, { marketSize: 6, playerOwned: false, shippingLost: blank(5) });
    assert.deepEqual(npc.commodities, s.commodities);
});
test('ordered pass changes later suppressed conditions, never retroactively redoes earlier ones', () => {
    const hot = { conditionId: 'hot', modId: 'hot_1', surveyed: true, context: null }, solar = { conditionId: 'solar_array', modId: 'solar_1', surveyed: true, context: null };
    const first = hostFor([hot, solar], state());
    reapply(first.host);
    assert.equal(value(first.holder.state.hazard, 'hot_1'), 0.25);
    const last = hostFor([solar, hot], state());
    reapply(last.host);
    assert.equal(value(last.holder.state.hazard, 'hot_1'), undefined);
});
test('single-condition reapply ignores survey flag and looks up plugin mod identity, not condition type', () => {
    const c = { conditionId: 'low_gravity', modId: 'specific_3', surveyed: false, context: null }, x = hostFor([c], state());
    assert.equal(reapply(x.host).applied, 0);
    assert.equal(reapply(x.host, 'low_gravity').visited, 0);
    assert.equal(reapply(x.host, 'specific_3').applied, 1);
    assert.equal(value(x.holder.state.hazard, 'specific_3'), 0.25);
});
test('runner snapshots live object identities once and checks dynamic survey after each unapply', () => {
    const a = { conditionId: 'arid', modId: 'a', surveyed: true, context: null }, b = { conditionId: 'ice', modId: 'b', surveyed: false, context: null }, later = { ...a, modId: 'later' };
    const x = hostFor([a, b], state()), trace = [];
    x.host.unapply = (c, id) => { trace.push('unapply:' + id); if (c === a) {
        x.holder.conditions.splice(1, 1, later);
        b.surveyed = true;
        b.modId = 'changed';
    } };
    x.host.apply = (c, id) => { trace.push('apply:' + id); assert.ok(c === a || c === b); };
    reapply(x.host);
    assert.deepEqual(trace, ['unapply:a', 'apply:a', 'unapply:changed', 'apply:changed']);
});
test('missing or asynchronous host operations cannot silently certify a condition pass', () => {
    const x = hostFor([], state());
    delete x.host.apply;
    assert.throws(() => reapply(x.host), /Missing synchronous/);
    x.host.apply = async () => { };
    assert.throws(() => reapply(x.host), /Missing synchronous/);
    x.host.apply = () => { };
    x.host.listConditions = () => Promise.resolve([]);
    assert.throws(() => reapply(x.host), /synchronously/);
    const y = hostFor([{ conditionId: 'arid', modId: 'arid_1', surveyed: true, context: null }], state());
    y.host.apply = function* () { yield 'not executed'; };
    assert.throws(() => reapply(y.host), /deferred or returned/);
});
test('malformed condition state fails closed and successful output cannot mutate inputs', () => {
    const s = state();
    assert.throws(() => callback('luddic_majority', s, null));
    assert.throws(() => callback('pirate_activity', s, { tier: 'fake' }));
    s.accessibility.flat.push({ id: 'bad', value: 0.1 });
    assert.throws(() => callback('solar_array', s), /float/);
    const out = callback('solar_array');
    assert.throws(() => out.suppressedConditionIds.push('extra'), TypeError);
    assert.throws(() => callback('solar_array', { ...state(), readyForAuthority: true }), /exact/);
});
function seed(n) {
    const s = state();
    s.industries = [[], ['farming'], ['aquaculture'], ['lightindustry', 'spaceport'], ['farming', 'aquaculture'], ['farming', 'mining'], ['farming', 'militarybase'], ['farming', 'highcommand']][n % 8].map(industry);
    for (const target of [s.hazard, { modifiers: s.accessibility }, s.stability, ...s.industries.map(i => i.supplyBonusFromOther)]) {
        put(target, 'flat', 'external', f(0.125));
        if (n % 2 === 0)
            put(target, 'flat', 'condition_1', 3);
        if (n % 3 === 0) {
            put(target, 'percent', 'condition_1', 10);
            put(target, 'mult', 'condition_1', f(0.9));
        }
    }
    s.transientModifiers = [{ kind: 'industry', id: 'population' }, { kind: 'condition', id: 'outside' }];
    if (n % 2 === 0)
        s.transientModifiers.push({ kind: 'condition', id: 'condition_1' });
    s.suppressedConditionIds = n % 3 === 0 ? ['hot', 'poor_light'] : n % 3 === 1 ? ['other'] : [];
    for (const [index, commodityId] of ['food', 'ore', 'supplies'].entries()) {
        const available = blank(n % 5 + index + 3);
        for (const [id, v] of [['sh_loss_timer', -2], ['sh_loss_half', f(-0.49999997)], ['sh_loss_positive', 0.5], ['external', n % 2 ? -1 : 0]])
            put(available, 'flat', id, v);
        if (n % 3 === 0)
            put(available, 'percent', 'sh_loss_percent', 20);
        if (n % 4 === 0)
            put(available, 'mult', 'sh_loss_mult', f(0.8));
        s.commodities.push({ commodityId, maxSupply: n % 8 + index, available });
    }
    return s;
}
function context(id, n) {
    if (id === 'luddic_majority')
        return church({ playerOwned: n % 2 === 0, madeChurchDeal: n % 5 === 0, defeatedExpedition: n % 3 === 0, habitable: n % 7 !== 0, adminId: n % 11 === 0 ? 'dardan_kato' : null, constructionQueue: [null, [], [{ industryId: 'heavyindustry', specExists: true }], [{ industryId: 'lightindustry', specExists: true }, { industryId: 'heavyindustry', specExists: true }], [{ industryId: 'missing', specExists: false }, { industryId: 'militarybase', specExists: true }]][n % 5] });
    if (id === 'pirate_activity')
        return { tier: Object.keys(R.pirateTiers)[n % 5] };
    if (id === 'pather_cells')
        return { intelMarketFactionId: n % 2 ? 'independent' : 'player', savedSleeper: n % 3 === 0, playerHasPatherAgreement: n % 4 < 2 };
    if (id === 'shipping_disruption') {
        const shippingLost = blank(n % 6);
        put(shippingLost, 'flat', 'lost', f(n / 10));
        if (n % 3 === 0)
            put(shippingLost, 'mult', 'partial', 0.5);
        return { marketSize: 3 + n % 7, playerOwned: n % 2 === 0, shippingLost };
    }
    return null;
}
test('differential: actual original condition methods, native stats, incoming callbacks and engine ordered pass', t => {
    const cases = [], expected = [];
    for (const conditionId of Object.keys(R.conditions))
        for (let n = 0; n < 20; n++) {
            let s = seed(n);
            for (const action of ['apply', 'apply', 'unapply', 'apply']) {
                const c = context(conditionId, n), input = { conditionId, modId: 'condition_1', action, state: s, context: c };
                const out = apply(input);
                const e = { state: out.state };
                if (conditionId === 'luddic_majority')
                    e.eligible = matches(s.industries, c);
                if (['mild_climate', 'luddic_majority'].includes(conditionId)) {
                    const extra = { marketSize: n % 10, playerOwned: n % 2 === 0, defeatedExpedition: n % 3 === 0, incoming: { composition: [{ factionId: 'independent', amount: 50 }, { factionId: 'luddic_church', amount: f(0.1) }], weight: blank(5) } };
                    if (n % 2 === 0)
                        put(extra.incoming.weight, 'flat', 'condition_1', 4);
                    Object.assign(input, extra);
                    e.incoming = incoming({ conditionId, modId: input.modId, ...extra });
                }
                cases.push(input);
                expected.push(e);
                s = out.state;
            }
        }
    for (const marketSize of [0, 1, 3, 6, 10])
        for (const unitsLost of [0, f(0.00001), f(0.14999999), f(0.15), f(0.3), 1, 3, 65536, -1]) {
            cases.push({ mode: 'penalty', marketSize, unitsLost });
            expected.push(penalty(marketSize, unitsLost));
        }
    const ids = ['hot', 'solar_array', 'poor_light', 'low_gravity', 'mild_climate'];
    for (let n = 0; n < 30; n++) {
        const order = n % 2 ? [...ids].reverse() : ids, conditions = order.map((conditionId, i) => ({ conditionId, modId: 'c_' + i, surveyed: n % 3 !== 0 || i % 2 === 0, context: null }));
        const s = seed(n), specificModId = n % 4 === 0 ? 'c_' + (n % 5) : n % 4 === 1 ? 'absent' : null;
        cases.push({ mode: 'pass', conditions, state: s, specificModId });
        const x = hostFor(conditions, s);
        reapply(x.host, specificModId);
        expected.push(x.holder.state);
    }
    const actual = nativeAdditionalConditionsOracle(cases);
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++)
        assert.deepEqual(actual[i], expected[i], 'native case ' + i + ' ' + JSON.stringify(cases[i]));
    t.diagnostic(actual.length + ' original Java callback/penalty/pass snapshots matched');
});
