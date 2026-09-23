import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {CampaignError} from '../src/campaign/core/Values.mjs';
import {ORIGINAL_ADMINISTRATORS as R,restoreOriginalSavedSkillOrder as order,originalPersonDefaultAfterReadResolve as isDefault,readOriginalAdministrator as resolve} from '../src/campaign/rules/OriginalAdministrator.mjs';
import {reapplyOriginalGovernedSkills} from '../src/campaign/rules/OriginalGovernedSkills.mjs';
import {extractNativeSaveEconomy} from './lib/campaign-native-save.mjs';
import {prepareNativeIndustryStorage} from './lib/campaign-native-industry-storage.mjs';
import {nativeSaveFixture} from './campaign-native-save-fixtures.mjs';
import {nativeAdministratorSnapshots} from './campaign-administrator-native-oracle.mjs';
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
const person=(ref='90001',portrait='custom.png',skills=[])=>({objectRef:ref,statsRef:ref+'1',isDefault:isDefault(portrait),aiCoreId:null,savedSkills:order(skills)});
const identity=(extra={})=>({playerOwned:false,administrator:person(),player:person('90002'),...extra});
const stat=(base=0)=>({base,modifiers:{flat:[],percent:[],mult:[]}});
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function fixture({owned=false,portrait='custom.png',skills={hypercognition:1,industrial_planning:1},admin=true,player=true}={}){
 const f=nativeSaveFixture();
 const personXml=(ref,spr,values)=>'<Person z="'+ref+'" spr="'+esc(spr)+'"><name><first>PRIVATE_ADMIN_NAME</first></name><stats z="'+ref+'1"><s>'+esc(JSON.stringify(values))+'</s><private>DO_NOT_COPY_STATS</private></stats></Person>';
 const adminNode=admin?personXml('90001',portrait,skills):'';
 const playerNode=player?personXml('90002','player.png',{space_operations:1}):'';
 const marketStats='<stats z="90030"><dynamic><stats><e><st>combat_fleet_size_mult</st><MutableStat b="999"/></e></stats><mods><e><st>combat_fleet_size_mult</st><SBonus z="90031"><fBs s="external" v="0.5"/></SBonus></e><e><st>unrelatedPrivate</st><UnexecutedClass/></e></mods></dynamic></stats>';
 f.campaign=f.campaign.replace('<Market z="10">','<Market z="10">'+(admin?'<admin ref="90001"/>':'')+marketStats).replace('<playerOwned>false</playerOwned>','<playerOwned>'+owned+'</playerOwned>').replace('<pool>','<pool>'+adminNode+playerNode).replace('</CampaignEngine>',(player?'<characterData><person ref="90002"/></characterData>':'')+'</CampaignEngine>');
 return f;
}
const capture=f=>extractNativeSaveEconomy(f.campaign,f.descriptor);
const target=c=>c.markets.find(m=>m.marketId==='a');

test('administrator source import pins Java17/default portrait and proves no treeification for all loaded skill keys',()=>{
 const r=spawnSync(process.execPath,['scripts/import-campaign-administrators.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(Object.keys(R.sources).length,11);assert.equal(R.javaVersion,'17.0.10');assert.equal(R.knownSkillIds.length,58);assert.deepEqual(R.bucketBounds.map(b=>b.max),[7,5,3,2]);
});
test('isDefault is exact portrait equality after null readResolve, not name, AI status or fuzzy path equality',()=>{
 assert.equal(isDefault(null),true);assert.equal(isDefault(R.defaultPortrait),true);for(const p of ['',R.defaultPortrait.toUpperCase(),R.defaultPortrait+' ','custom.png'])assert.equal(isDefault(p),false);
 rejects(()=>isDefault(undefined));rejects(()=>isDefault(false));
});
test('identity planning preserves nondefault admins, chooses actual player for default owned markets and leaves lifecycle pending',()=>{
 const admin=person(),player=person('90002');admin.aiCoreId='alpha_core';const p=identity({playerOwned:true,administrator:admin,player}),before=structuredClone(p),r=resolve(p);
 assert.deepEqual(p,before);assert.equal(r.selectedPersonRef,admin.objectRef);assert.equal(r.adminIsPlayer,false);assert.equal(r.aiCoreId,'alpha_core');assert.deepEqual(r.lifecycle,[]);
 for(const a of [null,person('90001',null)]){
  const v=resolve(identity({playerOwned:true,administrator:a}));assert.equal(v.selectedPersonRef,'90002');assert.equal(v.adminIsPlayer,true);assert.equal(v.selection,'player-default-replacement');assert.ok(v.lifecycle.includes('set-admin-null'));assert.ok(v.lifecycle.includes('refresh-player-governed-effects'));
 }
 const missing=resolve(identity({administrator:null}));assert.equal(missing.selectedPersonRef,null);assert.equal(missing.governedSkills,null);assert.equal(missing.selection,'default-creation-required');
 rejects(()=>resolve(identity({playerOwned:true,administrator:null,player:null})));
 const same=person('90001',null);const shared=resolve(identity({playerOwned:true,administrator:same,player:same}));assert.equal(shared.selection,'player-default-replacement');assert.ok(shared.lifecycle.length>0);
 const wrong=structuredClone(same);wrong.aiCoreId='alpha_core';rejects(()=>resolve(identity({administrator:same,player:wrong})));
});
test('saved skills retain native float and HashMap order; governed projection does not invent character-stat or missing aptitude restoration',()=>{
 const entries=[{skillId:'space_operations',level:1.2},{skillId:'hypercognition',level:1},{skillId:'industrial_planning',level:1}];const restored=order(entries);assert.equal(restored.find(s=>s.skillId==='space_operations').level,Math.fround(1.2));assert.deepEqual(order(restored),restored);assert.ok(Object.isFrozen(restored));
 const r=resolve(identity({administrator:person('90001','custom.png',entries)}));assert.deepEqual(r.governedSkills,restored.filter(s=>s.skillId!=='industrial_planning'));assert.ok(r.unresolved.includes('character-stats-aptitude-and-listener-refresh'));
 for(const entries of [[{skillId:'fleet_logistics',level:1}],[{skillId:'__proto__',level:1}],[{skillId:'hypercognition',level:'1'}],[{skillId:'hypercognition',level:Infinity}],[{skillId:'hypercognition',level:1},{skillId:'hypercognition',level:2}]])rejects(()=>order(entries));
});
test('actual XML Person references and market DynamicStats.mods feed governed draft without exposing private person data',()=>{
 const c=capture(fixture()),d=prepareNativeIndustryStorage(c),m=target(d),a=target(c).administratorCapture;
 assert.equal(m.administratorReadback.selectedPersonRef,'90001');assert.equal(m.governedSkillsDraft.skills[0].skillId,'hypercognition');assert.deepEqual(m.governedSkillsDraft.combatFleetSize.flat,[{id:'external',value:0.5}]);assert.equal(m.governedSkillsDraft.groundDefenses,null);
 const effect=reapplyOriginalGovernedSkills({skills:m.governedSkillsDraft.skills,state:{stability:stat(),accessibility:stat().modifiers,combatFleetSize:m.governedSkillsDraft.combatFleetSize,groundDefenses:m.governedSkillsDraft.groundDefenses}});
 assert.equal(effect.execution.applied.length,4);assert.equal(effect.state.accessibility.flat[0].value,Math.fround(0.1));assert.equal(effect.state.stability.modifiers.flat[0].value,1);
 assert.ok(!JSON.stringify(a).includes('PRIVATE_ADMIN_NAME'));assert.ok(!JSON.stringify(a).includes('DO_NOT_COPY_STATS'));assert.ok(!JSON.stringify(a).includes('custom.png'));assert.ok(!JSON.stringify(a).includes('999'));
 assert.equal(d.readyForAuthority,false);assert.ok(m.unresolved.includes('character-stats-aptitude-and-listener-refresh'));
 const old=structuredClone(c);delete target(old).administratorCapture;const legacy=target(prepareNativeIndustryStorage(old));assert.equal(legacy.administratorReadback,null);assert.equal(legacy.governedSkillsDraft,null);assert.ok(legacy.unresolved.includes('administrator-capture'));
});
test('owned default XML selects shared player skills; malformed classes, booleans, skill JSON and conflicting ownership fail closed',()=>{
 const f=fixture({owned:true,portrait:R.defaultPortrait});const c=capture(f),r=target(prepareNativeIndustryStorage(c));assert.equal(r.administratorReadback.selectedPersonRef,'90002');assert.deepEqual(r.governedSkillsDraft.skills,[{skillId:'space_operations',level:1}]);
 for(const [a,b]of [['<Person z="90001"','<Person cl="Plnt" z="90001"'],['<stats z="900011">','<stats cl="Unexpected" z="900011">'],['<stats z="900011">','<stats z="900011"><skills/>'],['<s>','<s>[' ]])assert.throws(()=>capture({...f,campaign:f.campaign.replace(a,b)}));
 const wrong=structuredClone(c);target(wrong).administratorCapture.input.playerOwned=false;rejects(()=>prepareNativeIndustryStorage(wrong));
 const missing=capture(fixture({admin:false,player:false}));assert.equal(target(prepareNativeIndustryStorage(missing)).governedSkillsDraft,null);
});
test('semantically equal shared people and skill records do not depend on JSON object key order',()=>{
 const a=person('90001','custom.png',[{skillId:'hypercognition',level:1}]);
 const reordered={savedSkills:a.savedSkills.map(s=>({skillId:s.skillId,level:s.level})),aiCoreId:a.aiCoreId,isDefault:a.isDefault,statsRef:a.statsRef,objectRef:a.objectRef};
 const r=resolve(identity({administrator:a,player:reordered}));assert.equal(r.adminIsPlayer,true);assert.deepEqual(r.governedSkills,a.savedSkills);
 rejects(()=>resolve(identity({administrator:{...a,statsRef:null}})));
});
test('untyped map values cannot silently convert a MutableStat or unknown type to an empty StatBonus',()=>{
 const f=fixture();for(const type of ['MutableStat','UnknownBonus'])assert.throws(()=>capture({...f,campaign:f.campaign.replace('<SBonus z="90031">','<'+type+' z="90031">').replace('</SBonus>','</'+type+'>')}),/StatBonus/);
 const explicit={...f,campaign:f.campaign.replace('<SBonus z="90031">','<value cl="SBonus" z="90031">').replace('</SBonus>','</value>')};assert.deepEqual(target(capture(explicit)).administratorCapture.marketModifiers.combatFleetSize.flat,[{id:'external',value:0.5}]);
});
test('bundled Java17 JSONObject and original Market.getAdmin agree across 318 ordered skill/identity snapshots',()=>{
 const cases=[],inputs=[],ids=R.knownSkillIds;let seed=91234567;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const identities=[identity(),identity({administrator:null}),identity({playerOwned:true,administrator:null}),identity({playerOwned:true,administrator:person('90001',null)}),identity({playerOwned:true,administrator:person('90001',R.defaultPortrait)}),identity({playerOwned:true}),identity({administrator:person('90001',null)})];
 for(let n=0;n<318;n++){
  const keys=[...ids];for(let i=keys.length-1;i>0;i--){const j=random()%(i+1);[keys[i],keys[j]]=[keys[j],keys[i]];}
  const count=n<59?n:n%59,entries=keys.slice(0,count).map((skillId,i)=>({skillId,level:(i%4)+0.123456789}));
  const id=identities[n%identities.length],nativePerson=p=>p?{objectRef:p.objectRef,portrait:p.isDefault?null:'custom.png'}:null;
  cases.push({skillsJSON:JSON.stringify(Object.fromEntries(entries.map(e=>[e.skillId,e.level]))),identity:{playerOwned:id.playerOwned,administrator:nativePerson(id.administrator),player:nativePerson(id.player)}});inputs.push({entries,id});
 }
 const native=nativeAdministratorSnapshots(cases);assert.equal(native.length,cases.length);
 inputs.forEach(({entries,id},i)=>{assert.deepEqual(order(entries),native[i].skills,'native skill order '+i);const r=resolve(id),a=native[i].admin;
  assert.equal(a.created,id.administrator===null?1:0);assert.equal(r.selectedPersonRef,a.selectedRef==='generated-default'?null:a.selectedRef,'native admin '+i);
  assert.equal(a.sets.filter(s=>s==='null').length,r.lifecycle.includes('set-admin-null')?1:0);assert.equal(a.refreshes.length,r.lifecycle.filter(s=>s.startsWith('refresh-')).length);
 });
});