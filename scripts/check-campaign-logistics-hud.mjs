import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { hudInteger, hudSupplies, hudSupplyRate, hudRoundedValue, hudCapacity, hudCargoQuantity } from '../src/campaign/client/LogisticsHudModel.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { projectFleetLogistics } from '../server/campaign/FleetHudProjection.mjs';
import { quoteCargoPreview } from '../server/campaign/CargoPreview.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
const fid='fleet-captain-a',rules=createReferenceRuleset();
test('native HUD quantity rounding differs from supplies truncation and explicitly signals shortage',()=>{
 assert.equal(hudSupplies(30.9),'30');assert.equal(hudSupplies(0),'补给不足');assert.equal(hudSupplies(undefined),'—');
 assert.equal(hudInteger(1.9),'1');assert.equal(hudInteger(1.9,true),'2');
 assert.equal(hudCapacity(10.6,50.9).text,'11 / 50');assert.equal(hudSupplyRate(3.25,5),'-3.3 / 天');
 assert.equal(hudSupplyRate(14.4,5),'-14 / 天');assert.equal(hudSupplyRate(9.96,5),'-10.0 / 天');assert.equal(hudSupplyRate(3.00001,5),'-3 / 天');
 assert.equal(hudRoundedValue(49.4),'49');assert.equal(hudRoundedValue(4.44),'4.4');assert.equal(hudRoundedValue(0.04),'0.0');assert.equal(hudRoundedValue(undefined),'—');
 assert.equal(hudSupplyRate(0,5),'-0 / 天');assert.equal(hudSupplyRate(undefined,5),'— / 天');assert.equal(hudSupplyRate(5,0),'');
});
test('capacity bars preserve overload area instead of clipping the current value to max',()=>{
 assert.deepEqual(hudCapacity(25,100),{text:'25 / 100',known:true,fill:0.25,excess:0,overloaded:false});
 assert.deepEqual(hudCapacity(149,140),{text:'149 / 140',known:true,fill:140/149,excess:9/149,overloaded:true});
 assert.deepEqual(hudCapacity(0,0),{text:'0 / 0',known:true,fill:0,excess:0,overloaded:false});
 assert.deepEqual(hudCapacity(1,0),{text:'1 / 0',known:true,fill:0,excess:1,overloaded:true});
 for(const [value,capacity]of [[undefined,100],[0,undefined],[NaN,10],[3,Infinity],[-1,10],[3,-1]]){
  const bar=hudCapacity(value,capacity);assert.equal(bar.known,false);assert.equal(bar.fill,0);assert.equal(bar.excess,0);assert.equal(bar.overloaded,false);
 }
});
test('missing cargo is unknown; absent item in a valid inventory is really zero',()=>{
 for(const cargo of [null,undefined,[],3])assert.equal(hudCargoQuantity(cargo,'marines'),undefined);
 assert.equal(hudCargoQuantity({},'marines'),0);assert.equal(hudCargoQuantity({marines:7},'marines'),7);
 assert.equal(hudCargoQuantity({marines:NaN},'marines'),undefined);assert.equal(hudCargoQuantity({marines:-1},'marines'),undefined);
});
test('minimum crew comes from effective fleet rules, distinct from personnel capacity and unaffected by cursor cargo',()=>{
 const w=structuredClone(createDevelopmentCampaign()),f=w.fleets[fid],m=w.members[f.memberIds[0]],before=structuredClone(w);
 const stats=rules.services.fleetStats.resolve(f,[m],{world:w});assert.equal(stats.minimumCrew,15);
 const projected=projectFleetLogistics(w,f,rules);assert.equal(projected.logistics.minimumCrew,15);assert.equal(projected.logistics.personnelCapacity,30);
 const input={worldId:w.id,epoch:'e',fleetId:fid,fleetVersion:f.version,memberVersions:[{id:m.id,version:m.version}],cargo:{supplies:30,fuel:20,crew:0}};
 assert.equal(quoteCargoPreview(w,'captain-a',input,rules).logistics.minimumCrew,15);assert.deepEqual(w,before);
 m.logistics={mothballed:true,suspendRepairs:false};assert.equal(projectFleetLogistics(w,f,rules).logistics.minimumCrew,0);
});
test('replacement provider owns minimum crew; omission is null, never reconstructed in projection',()=>{
 const w=structuredClone(createDevelopmentCampaign());let minimumCrew;
 const r=new CampaignRuleRegistry().register({id:'mod.stats',version:'1',service:'fleetStats',apiVersion:1,capabilities:[],methods:{resolve:()=>({minimumCrew,cargo:{spaceUsed:0,capacity:1,fuelCapacity:2,crew:7,marines:8,personnelCapacity:999}})}})
 .register({id:'mod.logistics',version:'1',service:'logistics',apiVersion:1,capabilities:[],methods:{quote:()=>({totalSuppliesPerDay:0,maintenancePerDay:0,recoveryPerDay:0,fuelPerLightYear:0})}})
 .compile({id:'mod.hud',version:'1',providers:{fleetStats:'mod.stats',logistics:'mod.logistics'}});w.rules=r.lock;
 assert.equal(projectFleetLogistics(w,w.fleets[fid],r).logistics.minimumCrew,null);
 assert.equal(projectFleetLogistics(w,w.fleets[fid],r).logistics.repairCompletion,null);
 minimumCrew=78;assert.equal(projectFleetLogistics(w,w.fleets[fid],r).logistics.minimumCrew,78);
 minimumCrew=-1;assert.equal(projectFleetLogistics(w,w.fleets[fid],r).logistics,null);
});
test('native source/asset provenance for HUD layout and colors (not an executable Java probe)',t=>{
 const root=new URL('../../',import.meta.url),source=new URL('decompiled/starfarer_obf/com/fs/starfarer/coreui/Objectnew.java',root);
 if(!existsSync(source)){t.skip('local native source unavailable');return;}
 const text=readFileSync(source,'utf8');
 for(const part of ['campaign_logistics_display_bg_full','icon_logistics_personnel','icon_logistics_marines','getMinCrew()', '185.0f, 24.0f'])assert.ok(text.includes(part),part);
 const settings=readFileSync(new URL('starsector-core/data/config/settings.json',root),'utf8');
 assert.match(settings,/"progressBarCargoColor":\[203,203,144,255\]/);assert.match(settings,/"progressBarCrewColor":\[0,225,160,255\]/);
 for(const [name,height]of [['campaign_infowidget4.png',250],['campaign_infowidget_compact2.png',224]]){
  const bytes=readFileSync(new URL('../public/game-assets/graphics/ui/'+name,import.meta.url));assert.equal(bytes.readUInt32BE(16),280);assert.equal(bytes.readUInt32BE(20),height);
 }
});


test('Fleet completion uses full-crew repair time and recovery cost, updates with policies, and distinguishes N/A from unknown',()=>{
 const w=structuredClone(createDevelopmentCampaign()),f=w.fleets[fid],m=w.members[f.memberIds[0]];
 const get=()=>projectFleetLogistics(w,f,rules).logistics.repairCompletion;
 assert.deepEqual(get(),{supplyCost:0,applicable:true});
 m.condition.hullFraction=0.5;m.condition.combatReadiness=0.4;const before=structuredClone(w);
 assert.ok(Math.abs(get().supplyCost-12.5)<0.0001);assert.equal(get().applicable,true);assert.deepEqual(w,before);
 m.condition.hullFraction=1;m.condition.combatReadiness=0.7;m.condition.armor={cols:4,rows:4,fractions:Array(16).fill(0.25)};
 assert.ok(Math.abs(get().supplyCost-18.75)<0.0001);
 m.logistics={mothballed:true,suspendRepairs:false};assert.deepEqual(get(),{supplyCost:0,applicable:true});
 m.logistics={mothballed:false,suspendRepairs:true};assert.deepEqual(get(),{supplyCost:0,applicable:true});
 m.logistics.suspendRepairs=false;f.cargo.crew=0;assert.equal(get().applicable,false);
 m.logistics.suspendRepairs=true;assert.deepEqual(get(),{supplyCost:0,applicable:true});
 m.logistics.suspendRepairs=false;f.cargo.crew=15;f.cargo.supplies=0;assert.ok(get().supplyCost>0); // estimate is not current supply availability
 const stats=rules.services.fleetStats.resolve(f,[m],{world:w});delete stats.members[0].repairCompletionState;
 const quote=rules.services.logistics.quote(stats);assert.equal(quote.repairCompletion,null);assert.ok(Number.isFinite(quote.totalSuppliesPerDay));
});
