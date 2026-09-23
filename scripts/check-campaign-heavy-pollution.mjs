import test from 'node:test';
import assert from 'node:assert/strict';
import { newOriginalHeavyIndustryPollution as fresh, updateOriginalHeavyIndustryPollution as update, applyOriginalPollutionCondition as condition } from '../src/campaign/rules/OriginalHeavyIndustryPollution.mjs';
import { newOriginalMarketHazard, reapplyOriginalColonyEnvironment } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { computeOriginalIncoming } from '../src/campaign/rules/OriginalImmigration.mjs';
import { request, stat } from './campaign-immigration-fixtures.mjs';
import { nativeHeavyPollutionOracle } from './campaign-heavy-pollution-native-oracle.mjs';
const input=(x={})=>({state:fresh(),event:'advance',specialItemId:'pristine_nanoforge',days:1,habitable:true,pollutionPresent:false,...x});
test('pollution appears immediately but becomes permanent strictly after 90 native days',()=>{
 const first=update(input({event:'special-item-set',days:null}));assert.equal(first.state.addedPollution,true);assert.equal(first.state.permaPollution,false);assert.deepEqual(first.conditionEffects,[{action:'add',conditionId:'pollution'}]);
 const at90=update(input({state:first.state,pollutionPresent:true,days:90}));assert.equal(at90.state.permaPollution,false);
 const next=update(input({state:at90.state,pollutionPresent:true,days:Math.fround(0.00001)}));assert.equal(next.state.permaPollution,true);
 const removed=update(input({state:at90.state,pollutionPresent:true,event:'special-item-set',specialItemId:null,days:null}));assert.equal(removed.pollutionPresent,false);assert.equal(removed.state.daysWithNanoforge,90);
 const reinstalled=update(input({state:removed.state,days:1}));assert.equal(reinstalled.state.permaPollution,true);
});
test('pollution respects ownership, loss of habitability and the difference between no-item advance and item setter',()=>{
 const existing=update(input({pollutionPresent:true}));assert.equal(existing.state.permaPollution,true);assert.equal(existing.state.addedPollution,false);assert.deepEqual(existing.conditionEffects,[]);
 const owned={daysWithNanoforge:30,permaPollution:false,addedPollution:true};const noItem=update(input({state:owned,specialItemId:null,pollutionPresent:true}));assert.equal(noItem.pollutionPresent,true);assert.equal(noItem.state.daysWithNanoforge,30);
 const offworld=update(input({state:owned,specialItemId:null,pollutionPresent:true,habitable:false,event:'special-item-set',days:null}));assert.equal(offworld.pollutionPresent,true);
 const released=update(input({state:owned,specialItemId:null,pollutionPresent:true,event:'special-item-set',days:null}));assert.equal(released.pollutionPresent,false);
});
test('pollution condition callbacks preserve identities, add native hazard and Path attraction, and unapply before object removal',()=>{
 let r=condition({action:'apply',modId:'pollution_actual_1',hazard:newOriginalMarketHazard(),transientModifiers:[{kind:'industry',id:'population'}]});assert.equal(r.hazard.modifiers.flat.at(-1).value,0.25);
 const repeat=condition({action:'apply',modId:'pollution_actual_1',...r});assert.deepEqual(repeat,r);
 const p=request(['population']);p.conditions=[{id:'pollution',modId:'pollution_actual_1',surveyed:true,suppressed:false}];p.modifiers.transient=r.transientModifiers;p.hazard=1.25;const incoming=computeOriginalIncoming(p);assert.ok(incoming.incoming.composition.some(c=>c.factionId==='luddic_path'&&c.amount>0));
 const env=reapplyOriginalColonyEnvironment({conditions:p.conditions,industries:[{industryId:'population',operating:{building:false,disrupted:false,upgradeId:null}}],hazard:newOriginalMarketHazard(),modifiers:{permanent:[],transient:[]}});assert.equal(env.hazardValue,1.25);
 r=condition({action:'unapply',modId:'pollution_actual_1',...r});assert.deepEqual(r.hazard,newOriginalMarketHazard());assert.deepEqual(r.transientModifiers,[{kind:'industry',id:'population'}]);
 const suppressed=reapplyOriginalColonyEnvironment({conditions:[{...p.conditions[0],suppressed:true}],industries:[],hazard:stat(1),modifiers:{permanent:[],transient:[]}});assert.equal(suppressed.hazardValue,1);assert.deepEqual(suppressed.modifiers.transient,[]);
});
test('native HeavyIndustry methods match a matrix of pollution flags, thresholds, presence, events and items',()=>{
 const cases=[];for(const daysWithNanoforge of [0,Math.fround(0.1),89,90,Math.fround(90.00001),100,2**24])for(const permaPollution of [false,true])for(const addedPollution of [false,true])for(const habitable of [false,true])for(const pollutionPresent of [false,true])for(const specialItemId of [null,'corrupted_nanoforge','pristine_nanoforge'])for(const event of ['advance','special-item-set','update-status'])cases.push(input({state:{daysWithNanoforge,permaPollution,addedPollution},habitable,pollutionPresent,specialItemId,event,days:event==='advance'?Math.fround(0.01):null}));
 const expected=nativeHeavyPollutionOracle(cases);assert.equal(expected.length,1008);for(let i=0;i<cases.length;i++){const p=cases[i],before=structuredClone(p),r=update(p);assert.deepEqual({state:r.state,pollutionPresent:r.pollutionPresent,conditionEffects:r.conditionEffects},expected[i],'native pollution '+i);assert.deepEqual(p,before);}
});
test('pollution callbacks reject ambiguous timing, unknown items, non-native floats and duplicate transient identities',()=>{
 for(const x of [{event:'unknown'},{days:0.1},{specialItemId:'synchrotron'},{event:'special-item-set',days:1},{state:{...fresh(),daysWithNanoforge:-1}}])assert.throws(()=>update(input(x)));
 assert.throws(()=>condition({action:'apply',modId:'pollution',hazard:stat(1),transientModifiers:[{kind:'condition',id:'same'},{kind:'condition',id:'same'}]}));
});
