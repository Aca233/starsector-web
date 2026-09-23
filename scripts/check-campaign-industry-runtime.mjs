import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { originalIndustrySavedClass } from '../src/campaign/rules/OriginalIndustryRestore.mjs';
import { originalIndustryDisruptionKey as key, readOriginalIndustryRuntime as runtime } from '../src/campaign/rules/OriginalIndustryRuntime.mjs';
import { ORIGINAL_IMMIGRATION } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { extractNativeSaveEconomy } from './lib/campaign-native-save.mjs';
import { prepareNativeIndustryStorage } from './lib/campaign-native-industry-storage.mjs';
import { nativeSaveFixture } from './campaign-native-save-fixtures.mjs';
import { nativeIndustryRuntimeSnapshots } from './campaign-industry-runtime-native-oracle.mjs';
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
function input(id='population',value=true,expires=[5]) { return {industryId:id,classAlias:originalIndustrySavedClass(id),building:false,upgradeId:null,improved:null,disruption:{key:key(id),present:true,value,expires}}; }
const xmlEscape = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function fixture({scalar='<bp>true</bp>', expires=[-0.25], special='', pool='', id='population', alias='PopulationAndInfrastructure', flags=true}={}) {
    const f=nativeSaveFixture(),k=key(id);
    const memory='<memory z="90000"><d z="90001">'+(flags?'<e><st>'+k+'</st>'+scalar+'</e>':'')+'<e><st>$unrelatedPrivate</st><SomeUnexecutedObject><secret>DO_NOT_COPY_MEMORY</secret></SomeUnexecutedObject></e></d><e z="90002">'+expires.map((time,i)=>'<MExp z="'+(90100+i)+'" k="'+k+'" t="'+time+'"/>').join('')+'</e></memory>';
    f.campaign=f.campaign.replace('<Market z="10">','<Market z="10">'+memory).replace(/(<PopulationAndInfrastructure[^>]+>)/,'$1'+special).replace('</pool>',pool+'</pool>').replaceAll('id="population"','id="'+id+'"').replaceAll('PopulationAndInfrastructure',alias);
    return f;
}
const capture=f=>extractNativeSaveEconomy(f.campaign,f.descriptor);
const target=c=>c.markets[1].industries[0];

test('runtime getters use Java Boolean/string semantics rather than JS truthiness and native trim differs from Unicode trim',()=>{
    for(const [v,expected]of [[true,true],[false,false],[' TRUE ',true],['\u0000true\u001f',true],['\u00a0true\u00a0',false],['yes',false],['1',false],[1,false],[0,false]]) assert.equal(runtime(input('population',v)).operating.disrupted,expected,JSON.stringify(v));
    const p=input();p.disruption.present=false;p.disruption.value=null;assert.equal(runtime(p).operating.disrupted,false);
    p.disruption.present=true;rejects(()=>runtime(p));
});
test('expiration getters do not advance or clear flags; first duplicate timer wins and negative zero is retained',()=>{
    for(const time of [-2,0,3]){const r=runtime(input('population',true,[time]));assert.equal(r.operating.disrupted,true);assert.equal(r.disruptedDays,time<0?0:time);}
    const r=runtime(input('population',true,[7,-5]));assert.equal(r.expiresIn,7);assert.equal(r.disruptedDays,7);
    assert.ok(Object.is(runtime(input('population',true,[-0])).disruptedDays,-0));
    const p=input();p.disruption.present=false;p.disruption.value=null;assert.equal(runtime(p).disruptedDays,5); // getExpire does not require a data entry.
    assert.equal(runtime(input('population',true,[])).expiresIn,-1);
});
test('native class key differs from saved alias; nullable improvement, construction and upgrade captures are preserved',()=>{
    assert.equal(key('commerce'),'$core_disrupted_TradeCenter');
    const p=input('commerce');p.building=true;p.upgradeId='megaport';p.improved=true;
    const r=runtime(p);assert.deepEqual(r.operating,{building:true,disrupted:true,upgradeId:'megaport'});assert.equal(r.improved,true);
    assert.equal(runtime(input('commerce')).improved,false);
    p.disruption.key='$core_disrupted_TradeCenter2';rejects(()=>runtime(p));
});
test('XML capture resolves Memory aliases and projects only the exact runtime key, not private unrelated values',()=>{
    const c=capture(fixture()),i=target(c),r=runtime(i.runtimeInput);
    assert.equal(i.wasDisrupted,false);assert.equal(r.operating.disrupted,true);assert.equal(r.disruptedDays,0);
    assert.deepEqual(i.runtimeInput.disruption.expires,[-0.25]);assert.ok(!JSON.stringify(c).includes('DO_NOT_COPY_MEMORY'));
    const alias=target(capture(fixture({id:'commerce',alias:'TradeCenter2',expires:[6,2]})));
    assert.equal(alias.runtimeInput.disruption.key,'$core_disrupted_TradeCenter');assert.equal(runtime(alias.runtimeInput).disruptedDays,6);
});
test('SpID attributes and references decode exactly; captured data remains metadata and is never executed or automatically applied',()=>{
    const data='  blueprint:<opaque>  ',f=fixture({id:'spaceport',alias:'Spaceport',special:'<special ref="91000"/>',pool:'<SpID z="91000" i="fullerene_spool" d="'+xmlEscape(data)+'"/>'});
    const c=capture(f),i=target(c);assert.deepEqual(i.specialItem,{objectRef:'91000',id:'fullerene_spool',data});assert.equal(i.specialItemRef,'91000');
    const prepared=prepareNativeIndustryStorage(c).markets[1].industries[0];
    assert.deepEqual(prepared.specialItem,i.specialItem);assert.equal(prepared.specialItemCaptured,true);assert.ok(prepared.unresolved.includes('installed-item-runtime'));
    assert.equal(prepared.runtimeReadback.operating.disrupted,true);assert.equal(prepared.storage.readyForAuthority,false);
});
test('new captures supply real runtime evidence; older captures remain explicitly pending instead of defaulting to functional',()=>{
    const c=capture(fixture({flags:false,expires:[5]})),r=prepareNativeIndustryStorage(c).markets[1].industries[0];assert.equal(r.runtimeReadback.operating.disrupted,false);assert.equal(r.runtimeReadback.disruptedDays,5);
    const i=target(c);delete i.runtimeInput;delete i.specialItem;
    const old=prepareNativeIndustryStorage(c).markets[1].industries[0];assert.equal(old.runtimeReadback,null);assert.equal(old.specialItemCaptured,false);assert.ok(old.unresolved.includes('current-disruption-memory-getter'));
});
test('unsupported scalar/class/timer/item encodings and contradictory draft inputs reject without guessing',()=>{
    for(const f of [fixture({scalar:'<null/>'}),fixture({scalar:'<Object/>'}),fixture({scalar:'<bp>yes</bp>'}),fixture({expires:['NaN']}),fixture({special:'<special z="91000"/>'}),fixture({special:'<special z="91000" cl="ArbitraryPlugin" i="x"/>'})]) assert.throws(()=>capture(f));
    const d=fixture();d.campaign=d.campaign.replace('</d><e z="90002">','<e><st>'+key('population')+'</st><bp>false</bp></e></d><e z="90002">');assert.throws(()=>capture(d));
    for(const mutate of [p=>p.building='yes',p=>p.improved=1,p=>p.disruption.expires=[NaN],p=>p.disruption.value={},p=>p.classAlias='Unknown']){const p=input();mutate(p);rejects(()=>runtime(p));}
    const c=capture(fixture());target(c).runtimeInput.building=true;rejects(()=>prepareNativeIndustryStorage(c));
});
test('original Java Memory/BaseIndustry getters match 152 ordered scalar/expiry snapshots across 30 industry identities',()=>{
    const cases=[];for(const id of Object.keys(ORIGINAL_IMMIGRATION.industries)) for(let n=0;n<5;n++){const p=input(id,[true,false,' TRUE ','\u00a0true\u00a0',1][n],[[-2],[-0],[0],[10,-1],[]][n]);p.building=n%2===0;p.improved=[null,true,false,null,true][n];p.upgradeId=n===3?'megaport':null;cases.push(p);}
    for(const id of ['spaceport','commerce']) {const p=input(id,null,[5]);p.disruption.present=false;cases.push(p);}
    const native=nativeIndustryRuntimeSnapshots(cases);assert.equal(native.length,152);cases.forEach((p,i)=>assert.deepEqual(runtime(p),native[i],'native industry getters '+i));
});
