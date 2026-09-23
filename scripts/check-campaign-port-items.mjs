import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_PORT_ITEMS as R, isSupportedOriginalPortItem as supports, originalPortItemRequirements as requirements, applyOriginalPortItemAccessibility as itemPhase } from '../src/campaign/rules/OriginalPortItems.mjs';
import { reapplyOriginalIndustryAccessibility as access, reapplyOriginalLocalAccessibility as local } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
import { applyOriginalCivicIndustry as civic } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { newOriginalIndustryFinances as fresh, updateOriginalIndustryFinances as finance } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { computeOriginalIncoming } from '../src/campaign/rules/OriginalImmigration.mjs';
import { nativeAccessibilityOracle } from './campaign-accessibility-native-oracle.mjs';
import { f, mod, stat, industry, operating, request, condition } from './campaign-immigration-fixtures.mjs';
const rejects = fn => assert.throws(fn, e => e instanceof CampaignError);
const spool = 'fullerene_spool';
const context = (planetIsGasGiant = false, conditionIds = []) => ({ planetIsGasGiant, conditionIds });
const port = (industryId = 'spaceport', extra = {}) => ({ industryId, operating: operating(), aiCoreId: null, improved: false, specialItemId: spool, ...extra });
const input = (extra = {}) => ({ marketSize: 5, hasSpaceport: false, firstQueuedIndustryHasSpaceportTag: false, accessibility: stat().modifiers, industries: [port()], portItemContext: context(), ...extra });
const item = (extra = {}) => ({ industryId: 'spaceport', itemId: spool, action: 'apply', context: context(), accessibility: stat().modifiers, ...extra });
const flat = (a, id) => a.flat.find(m => m.id === id)?.value;

test('port item import is reproducible from eight original files and retains exact CSV bindings', () => {
    const r = spawnSync(process.execPath, ['scripts/import-campaign-port-items.mjs', '--check'], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(Object.keys(R.sources).length, 8);
    assert.equal(R.items.fullerene_spool.accessibilityBonus, f(0.3));
    assert.deepEqual(R.items.fullerene_spool.industryIds, ['spaceport', 'megaport']);
    for (const id of ['spaceport', 'megaport']) assert.equal(supports(id, spool), true);
    for (const id of ['population', 'heavyindustry', 'farming', 'spaceport_mod']) assert.equal(supports(id, spool), false);
    for (const id of [null, undefined, '__proto__', 'corrupted_nanoforge']) assert.equal(supports('spaceport', id), false);
});
test('requirements use actual planet getter/null and condition presence in original label order', () => {
    for (const gas of [null, false, true]) for (let mask = 0; mask < 4; mask++) {
        const ids = ['gas_giant', ...(mask & 1 ? ['extreme_weather'] : []), ...(mask & 2 ? ['extreme_tectonic_activity'] : [])];
        const expected = [gas === true ? R.requirementNames.NOT_A_GAS_GIANT : null, mask & 1 ? R.requirementNames.NOT_EXTREME_WEATHER : null, mask & 2 ? R.requirementNames.NOT_EXTREME_TECTONIC_ACTIVITY : null].filter(Boolean);
        const c = context(gas, ids), r = itemPhase(item({ context: c }));
        assert.deepEqual(requirements({ industryId: 'megaport', itemId: spool, context: c }), expected);
        assert.deepEqual(r.unmetRequirements, expected); assert.equal(r.applied, expected.length === 0);
        assert.equal(flat(r.accessibility, spool), expected.length ? undefined : f(0.3));
    }
});
test('apply and unapply write only the item flat channel and never mutate captured state', () => {
    const a = stat(0, [mod('before', 1), mod(spool, 99), mod('after', -1)], [mod(spool, 20)], [mod(spool, 0.5)]).modifiers;
    const p = item({ accessibility: a }), before = structuredClone(p), r = itemPhase(p);
    assert.deepEqual(p, before); assert.equal(r.scope, 'port-installed-item-accessibility-only'); assert.ok(Object.isFrozen(r.accessibility.flat));
    assert.deepEqual(r.accessibility.flat, [mod('before', 1), mod(spool, 0.3), mod('after', -1)]);
    assert.deepEqual(r.accessibility.percent, a.percent); assert.deepEqual(r.accessibility.mult, a.mult);
    const removed = itemPhase({ ...p, action: 'unapply', context: null });
    assert.equal(removed.applied, false); assert.deepEqual(removed.unmetRequirements, []);
    assert.deepEqual(removed.accessibility.flat, [mod('before', 1), mod('after', -1)]);
    assert.deepEqual(removed.accessibility, itemPhase({ ...p, context: context(true) }).accessibility);
    rejects(() => itemPhase({ ...p, action: 'unapply' }));
});
test('explicit item context is required, validated and forbidden when no supported item exists', () => {
    for (const c of [undefined, null, {}, { conditionIds: [] }, context(0), context(false, ['x','x']), { ...context(), surveyed: false }]) rejects(() => access(input({ portItemContext: c })));
    const p = input(); delete p.portItemContext; rejects(() => access(p));
    rejects(() => access(input({ industries: [port('spaceport', { specialItemId: null })] })));
    rejects(() => access(input({ industries: [port('population')] })));
    rejects(() => access(input({ industries: [port('spaceport', { specialItemId: 'synchrotron' })] })));
    rejects(() => itemPhase(item({ industryId: 'population' })));
    rejects(() => itemPhase(item({ itemId: 'synchrotron' })));
});
test('combined access checks exact condition roster; suppressed or unsurveyed weather still blocks', () => {
    for (const id of ['extreme_weather', 'extreme_tectonic_activity']) for (const surveyed of [false,true]) for (const suppressed of [false,true]) {
        const p = { ...input({ portItemContext: context(false, [id]) }), conditions: [{...condition(id), surveyed, suppressed}], freeMarketDaysByModId: {} };
        assert.equal(flat(local(p).accessibility, spool), undefined);
        rejects(() => local({ ...p, portItemContext: context(false, []) }));
        rejects(() => local({ ...p, portItemContext: context(false, [id, 'habitable']) }));
    }
    const p = { ...input({ portItemContext: context(null, ['habitable']) }), conditions: [condition('habitable','one'),condition('habitable','two')], freeMarketDaysByModId: {} };
    assert.equal(flat(local(p).accessibility, spool), f(0.3));
});
test('port lifecycle preserves native modifier insertion order and removes spool when nonfunctional', () => {
    const p = input({ accessibility: stat(0, [mod('external', 0.7),mod(spool,99)]).modifiers, industries: [port('spaceport',{aiCoreId:'alpha_core',improved:true})] });
    const r = access(p);
    assert.deepEqual(r.accessibility.flat.map(m=>m.id), ['external','ind_spaceport_2','spaceport_improve',spool,'ind_spaceport_0']);
    for (const op of [{...operating(),disrupted:true},{...operating(),building:true}]) {
        const disabled=access({...p,industries:[port('spaceport',{operating:op,aiCoreId:'alpha_core',improved:true})]});
        assert.deepEqual(disabled.accessibility.flat,[mod('external',0.7)]); assert.equal(disabled.hasSpaceport,true);
    }
    assert.equal(flat(access({...p,industries:[port('spaceport',{operating:{...operating(),building:true,upgradeId:'megaport'}})]}).accessibility,spool),f(0.3));
});
test('shared item ID is not stacked/refcounted; later disabled port removes earlier contribution', () => {
    assert.equal(access(input({industries:[port(),port('megaport')]})).accessibility.flat.filter(m=>m.id===spool).length,1);
    const disabled=port('megaport',{operating:{...operating(),disrupted:true}});
    assert.equal(flat(access(input({industries:[port(),disabled]})).accessibility,spool),undefined);
    assert.equal(flat(access(input({industries:[disabled,port()]})).accessibility,spool),f(0.3));
});
test('no installed item must not erase an old spool modifier; removal is an explicit lifecycle step', () => {
    const p=input({accessibility:stat(0,[mod(spool,0.8)]).modifiers,industries:[port('spaceport',{specialItemId:null})]});delete p.portItemContext;
    assert.equal(flat(access(p).accessibility,spool),f(0.8));
    const removed=itemPhase(item({accessibility:p.accessibility,action:'unapply',context:null}));
    assert.equal(flat(access({...p,accessibility:removed.accessibility}).accessibility,spool),undefined);
});
test('spool is neutral to commodity, financial and incoming callbacks at identical access; wrong bindings reject', () => {
    for (const id of ['spaceport','megaport']) for (const disabled of [false,true]) {
        const e=industry(id);e.operating.disrupted=disabled;
        const q={...e,marketSize:5,habitable:true},without=civic(q);
        e.modifiers.specialItemId=spool; assert.deepEqual(civic(q),without);
        const fin={state:fresh(id),marketSize:5,phase:'industry-apply',marketIncomeMult:f(0.8),marketUpkeepMult:f(1.5),operating:e.operating,aiCoreId:'alpha_core',specialItemId:null,portInputs:{demand:{fuel:stat(4),supplies:stat(4),ships:stat(4)},available:{fuel:1,supplies:2,ships:3}}};
        assert.deepEqual(finance({...fin,specialItemId:spool}),finance(fin));
        const incoming=request(['population',id]);incoming.industries[1].operating.disrupted=disabled;const before=computeOriginalIncoming(incoming);incoming.industries[1].modifiers.specialItemId=spool;
        assert.deepEqual(computeOriginalIncoming(incoming),before);
        rejects(()=>finance({...fin,state:fresh('population'),specialItemId:spool,portInputs:null}));
    }
    const e=industry('population');e.modifiers.specialItemId=spool;rejects(()=>civic({...e,marketSize:5,habitable:true}));
    const incoming=request();incoming.industries[0].modifiers.specialItemId=spool;rejects(()=>computeOriginalIncoming(incoming));
});
test('native differential: 240 original item/requirements/port phases including planet, weather, order and disruption', () => {
    const cases=[];
    for (const gas of [null,false,true]) for(let mask=0;mask<4;mask++) for(const id of ['spaceport','megaport']) for(let mode=0;mode<5;mode++) {
        const p=input({marketSize:3+mode,hasSpaceport:mode%2===0,firstQueuedIndustryHasSpaceportTag:mode%3===0,portItemContext:context(gas,[...(mask&1?['extreme_weather']:[]),...(mask&2?['extreme_tectonic_activity']:[])]),accessibility:stat(0,[mod('external',0.71),mod(spool,-0.2),mod('spaceport_improve',0.1),mod('ind_'+id+'_2',0.2)],[mod(spool,25)],[mod(spool,0.7)]).modifiers});
        const b=port(id,{aiCoreId:mode%2?'alpha_core':null,improved:mode%3===0,operating:{disrupted:mode===1,building:mode>=2,upgradeId:mode===3?'megaport':null}});
        const pop=port('population',{specialItemId:null});p.industries=mode%2?[pop,b]:[b,pop];cases.push(p);
        const other=port(id==='spaceport'?'megaport':'spaceport',{operating:{...operating(),disrupted:mode%2===0}});
        cases.push({...p,industries:mode%2?[b,other,pop]:[other,b,pop]});
    }
    assert.equal(cases.length,240);
    const native=nativeAccessibilityOracle([],[],cases);assert.equal(native.length,cases.length);
    cases.forEach((p,i)=>{const r=access(p);assert.deepEqual({accessibility:r.accessibility,hasSpaceport:r.hasSpaceport,value:r.value},native[i],'native port case '+i);});
});
