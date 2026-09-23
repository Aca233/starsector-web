import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {CampaignError} from '../src/campaign/core/Values.mjs';
import {ORIGINAL_CHARACTER_INDUSTRY_STATS as R,reapplyOriginalCharacterIndustryStats as apply,readOriginalAdministratorIndustryInputs as getters} from '../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
import {ORIGINAL_ADMINISTRATORS} from '../src/campaign/rules/OriginalAdministrator.mjs';
import {nativeCharacterIndustrySnapshots} from './campaign-character-industry-stats-native-oracle.mjs';
import {nativeSaveFixture} from './campaign-native-save-fixtures.mjs';
import {extractNativeSaveEconomy} from './lib/campaign-native-save.mjs';
import {prepareNativeIndustryStorage} from './lib/campaign-native-industry-storage.mjs';
import {newOriginalProductionIndustry,applyOriginalProductionIndustry,originalProductionIndustryOutput} from '../src/campaign/rules/OriginalProductionIndustries.mjs';
const bonus=()=>({flat:[],percent:[],mult:[]}),mod=(id,value)=>({id,value});
const empty=()=>({supplyBonus:null,demandReduction:null,fuelSupplyBonus:null,customProduction:null});
const skills=(level=1)=>[{skillId:'industrial_planning',level}];
const input=(x={})=>({skills:skills(),modifiers:empty(),skipRefresh:false,...x});
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
const sample=()=>({supplyBonus:{flat:[mod('external',1.5),mod('industrial_planning_stats_0',5)],percent:[mod('industrial_planning_stats_0',50)],mult:[mod('outside',2)]},demandReduction:{...bonus(),flat:[mod('event',1)]},fuelSupplyBonus:{...bonus(),flat:[mod('containment_procedures_stats_4',2)]},customProduction:{...bonus(),flat:[mod('external',5)],mult:[mod('industrial_planning_stats_1',7),mod('external',0.5)]}});
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function fixture({owned=false,defaultAdmin=false,adminStats=true,playerStats=true}={}){
 const f=nativeSaveFixture();
 const statXml=(ref,level,supply)=>'<stats z="'+ref+'"><s>'+escape(JSON.stringify(level?{industrial_planning:1,containment_procedures:1}:{}))+'</s><dynamic><stats><e><st>supply_bonus</st><MutableStat b="999"/></e></stats><mods><e><st>supply_bonus</st><SBonus z="'+ref+'1"><fBs s="external" v="'+supply+'"/></SBonus></e><e><st>fuel_supply_bonus</st><SBonus z="'+ref+'2"><fBs s="containment_procedures_stats_4" v="2"/></SBonus></e><e><st>unrelatedPrivate</st><UnsupportedPrivate/></e></mods></dynamic><private>DO_NOT_COPY</private></stats>';
 const people='<Person z="90001" spr="'+escape(defaultAdmin?ORIGINAL_ADMINISTRATORS.defaultPortrait:'custom.png')+'">'+(adminStats?statXml('900011',true,2):'')+'</Person><Person z="90002" spr="player.png">'+(playerStats?statXml('900021',false,4):'')+'</Person>';
 f.campaign=f.campaign.replace('<Market z="10">','<Market z="10"><admin ref="90001"/>').replace('<playerOwned>false</playerOwned>','<playerOwned>'+owned+'</playerOwned>').replace('<pool>','<pool>'+people).replace('</CampaignEngine>','<characterData><person ref="90002"/></characterData></CampaignEngine>');return f;
}
const capture=f=>extractNativeSaveEconomy(f.campaign,f.descriptor),target=c=>c.markets.find(m=>m.objectRef==='10');
test('source catalogue tracks all 23 loaded character callbacks but only two affect industry channels; disabled fuel skill stays absent',()=>{
 const r=spawnSync(process.execPath,['scripts/import-campaign-character-industry-stats.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(Object.keys(R.sources).length,89);assert.equal(R.loadedCharacterEffects.length,23);assert.deepEqual(R.effects.map(e=>[e.skillId,e.index]),[['industrial_planning',0],['industrial_planning',1]]);assert.ok(!R.effects.some(e=>e.script.includes('Containment')));
});
test('nullable getValue is non-creating; skipRefresh leaves all owned and unrelated modifiers unchanged',()=>{
 const modifiers=empty(),before=structuredClone(modifiers);assert.deepEqual(getters(modifiers),{adminSupplyBonus:0,adminDemandReduction:0,adminFuelSupplyBonus:0});assert.deepEqual(modifiers,before);
 const skipped=apply(input({modifiers:sample(),skipRefresh:true}));assert.deepEqual(skipped.modifiers,sample());assert.equal(skipped.execution.unapplied,0);assert.deepEqual(skipped.execution.applied,[]);
 const r=apply(input({skills:[]}));assert.deepEqual(r.modifiers,{supplyBonus:bonus(),demandReduction:null,fuelSupplyBonus:null,customProduction:bonus()});assert.equal(r.execution.unapplied,2);assert.ok(Object.isFrozen(r.modifiers.supplyBonus));
});
test('refresh removes only loaded callback channels, observes float thresholds, preserves disabled fuel and never invents demand reductions',()=>{
 for(const level of [-1,0,Math.fround(0.99999994),1,2]){const i=input({skills:skills(level),modifiers:sample()}),before=structuredClone(i),r=apply(i);assert.deepEqual(i,before);assert.equal(r.industryInputs.adminSupplyBonus,level>=1?5:3);assert.equal(r.industryInputs.adminDemandReduction,1);assert.equal(r.industryInputs.adminFuelSupplyBonus,2);assert.deepEqual(r.modifiers.supplyBonus.percent,sample().supplyBonus.percent);assert.equal(r.execution.applied.length,level>=1?2:0);}
 const containment=apply(input({skills:[{skillId:'containment_procedures',level:1}]}));assert.equal(containment.industryInputs.adminFuelSupplyBonus,0);assert.equal(containment.modifiers.fuelSupplyBonus,null);
 rejects(()=>apply({...input(),skipRefresh:undefined}));rejects(()=>apply(input({skills:[{skillId:'fleet_logistics',level:1}]})));rejects(()=>apply(input({skills:skills(1.00000001)})));rejects(()=>apply(input({skills:[...skills(),...skills()]})));rejects(()=>getters({...empty(),supplyBonus:undefined}));
});
test('native saved person mods become separate administrator/player drafts and feed actual fuel industry callbacks',()=>{
 const c=capture(fixture()),d=target(prepareNativeIndustryStorage(c)).characterIndustryStatsDraft;assert.ok(d.administrator&&d.player);assert.equal(getters(d.administrator.modifiers).adminSupplyBonus,2);assert.equal(getters(d.player.modifiers).adminSupplyBonus,4);assert.ok(!JSON.stringify(c.markets.map(m=>m.administratorCapture)).includes('DO_NOT_COPY'));assert.ok(!JSON.stringify(c.markets.map(m=>m.administratorCapture)).includes('999'));
 const a=apply({...d.administrator,skipRefresh:false}),p=apply({...d.player,skipRefresh:false});assert.equal(a.industryInputs.adminSupplyBonus,3);assert.deepEqual(p.modifiers.customProduction,bonus());assert.deepEqual(a.modifiers.customProduction.mult,[mod('industrial_planning_stats_1',1.5)]);
 const {adminSupplyBonus,adminDemandReduction,adminFuelSupplyBonus}=a.industryInputs,zero={base:0,modifiers:bonus()};
 const industry=applyOriginalProductionIndustry({state:newOriginalProductionIndustry('fuelprod'),marketSize:6,operating:{disrupted:false,building:false,upgradeId:null},modifiers:{aiCoreId:null,improved:false,adminSupplyBonus,adminDemandReduction,supplyBonusFromOther:zero,demandReductionFromOther:zero,specialItemId:null},available:{volatiles:99},illegalCommodityIds:[],conditionIds:[],adminFuelSupplyBonus,previousStability:5,productionQuality:bonus()});
 assert.equal(originalProductionIndustryOutput(industry.state,{commodityId:'fuel',illegal:false}).supply,9);assert.ok(industry.state.supplyBonus.modifiers.flat.some(m=>m.id==='ind_fuelprod_1'&&m.value===3));assert.ok(industry.state.supplyBonus.modifiers.flat.some(m=>m.id==='ind_fuelprod_2'&&m.value===2));
 const owned=target(prepareNativeIndustryStorage(capture(fixture({owned:true,defaultAdmin:true})))).characterIndustryStatsDraft;assert.deepEqual(owned.administrator,owned.player);
});
test('legacy captures and missing CharacterStats are not guessed as empty runtime state; bad type, duplicate and shared-identity conflicts fail closed',()=>{
 const c=capture(fixture()),legacy=structuredClone(c);delete target(legacy).administratorCapture.characterIndustryModifiers;const old=target(prepareNativeIndustryStorage(legacy));assert.equal(old.characterIndustryStatsDraft,null);assert.ok(old.unresolved.includes('character-industry-modifiers-capture'));
 const missing=target(prepareNativeIndustryStorage(capture(fixture({adminStats:false,playerStats:false})))).characterIndustryStatsDraft;assert.deepEqual(missing,{administrator:null,player:null});
 const wrong=structuredClone(c);target(wrong).administratorCapture.characterIndustryModifiers.administrator=null;rejects(()=>prepareNativeIndustryStorage(wrong));
 const f=fixture();assert.throws(()=>capture({...f,campaign:f.campaign.replace('<SBonus z="9000111">','<MutableStat z="9000111">').replace('</SBonus>','</MutableStat>')}),/StatBonus/);
 assert.throws(()=>capture({...f,campaign:f.campaign.replace('<st>unrelatedPrivate</st><UnsupportedPrivate/>','<st>supply_bonus</st><SBonus/>')}),/Duplicate/);
 const conflict=structuredClone(c);conflict.markets[1].administratorCapture.characterIndustryModifiers.player.supplyBonus.flat[0].value=7;rejects(()=>prepareNativeIndustryStorage(conflict));
});
test('actual Java CharacterStats dispatcher, IndustrialPlanning callbacks and DynamicStats/StatBonus agree across 248 cases',()=>{
 const cases=[];for(let n=0;n<248;n++){const modifiers=n%3===0?empty():sample();if(modifiers.supplyBonus){modifiers.supplyBonus.flat[0].value=Math.fround((n%17-8)/7);modifiers.supplyBonus.mult[0].value=Math.fround((n%5)/3);modifiers.fuelSupplyBonus.percent.push(mod('percent',75));}cases.push(input({skills:[{skillId:'containment_procedures',level:1},...skills([-1,0,Math.fround(0.99999994),1,2][n%5]),{skillId:R.knownSkillIds.filter(id=>!['containment_procedures','industrial_planning'].includes(id))[n%56],level:1}],modifiers,skipRefresh:n%4===0}));}
 const native=nativeCharacterIndustrySnapshots(cases);assert.equal(native.length,cases.length);cases.forEach((c,i)=>{const actual=apply(c);assert.deepEqual(actual.modifiers,native[i].modifiers,'modifiers '+i);assert.deepEqual(actual.industryInputs,native[i].industryInputs,'getters '+i);assert.equal(native[i].beforeListeners,c.skipRefresh?0:1);});
});
