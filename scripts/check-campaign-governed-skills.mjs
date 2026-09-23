import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_GOVERNED_SKILLS as R, reapplyOriginalGovernedSkills as reapply } from '../src/campaign/rules/OriginalGovernedSkills.mjs';
import { reapplyOriginalIndustryCommodityPass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { nativeGovernedSkillSnapshots } from './campaign-governed-skills-native-oracle.mjs';
import { stat, mod, f, financialInput } from './campaign-immigration-fixtures.mjs';
const rejects=fn=>assert.throws(fn,e=>e instanceof CampaignError);
const skill=(skillId,level=1)=>({skillId,level:f(level)});
function state(stale=true){const out={accessibility:stat(0,[mod('external',0.7),mod('fleet_logistics_GO_1',0.15)]).modifiers,stability:stat(2,[mod('external',0.1)]),combatFleetSize:null,groundDefenses:null};if(stale)for(const e of R.effects){const id=e.skillId+'_GO_'+e.index,t=e.operation.target;out[t]??=stat().modifiers;const s=t==='stability'?out[t].modifiers:out[t];for(const ch of ['flat','percent','mult'])s[ch].push(mod(id,ch==='mult'?0.5:9));}return out;}
const request=(skills=[],stale=true)=>({skills,state:state(stale)});

test('loaded skill catalogue follows CSV/aptitude registration: 58 loaded skills, eight governed effects, no deprecated fleet logistics',()=>{
 const r=spawnSync(process.execPath,['scripts/import-campaign-governed-skills.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(Object.keys(R.sources).length,70);assert.equal(R.knownSkillIds.length,58);assert.equal(R.effects.length,8);
 assert.ok(!R.knownSkillIds.includes('fleet_logistics'));assert.ok(R.knownSkillIds.includes('industrial_planning'));
 assert.deepEqual([...new Set(R.effects.map(e=>e.skillId))],['hypercognition','planetary_operations','space_operations']);
});
test('full loaded cache unapplies even with no skills, creates dynamic mods, preserves unrelated channels/legacy unloaded IDs',()=>{
 const p=request(),before=structuredClone(p),r=reapply(p);assert.deepEqual(p,before);assert.equal(r.execution.unapplied,8);assert.deepEqual(r.execution.applied,[]);
 for(const e of R.effects){const mods=e.operation.target==='stability'?r.state.stability.modifiers:r.state[e.operation.target];const id=e.skillId+'_GO_'+e.index;
  assert.equal(mods[e.operation.channel].some(m=>m.id===id),false);for(const ch of ['flat','percent','mult'].filter(c=>c!==e.operation.channel))assert.ok(mods[ch].some(m=>m.id===id));
 }
 assert.ok(r.state.accessibility.flat.some(m=>m.id==='fleet_logistics_GO_1'));
 const empty=reapply(request([],false));assert.deepEqual(empty.state.combatFleetSize,stat().modifiers);assert.deepEqual(empty.state.groundDefenses,stat().modifiers);assert.ok(Object.isFrozen(empty.state.groundDefenses));
});
test('thresholds use native floats, apply order follows actual administrator skill order and levels do not multiply effects',()=>{
 const ids=['space_operations','hypercognition','planetary_operations'];
 for(const level of [-1,0,f(0.99999994),1,2]){
  const r=reapply(request(ids.map(id=>skill(id,level)),false));assert.equal(r.execution.applied.length,level<1?0:8);
  if(level>=1){assert.deepEqual(r.state.accessibility.flat.map(m=>m.id),['external','fleet_logistics_GO_1','space_operations_GO_0','hypercognition_GO_0']);assert.equal(r.state.accessibility.flat.at(-1).value,f(0.1));assert.equal(r.state.combatFleetSize.flat[0].value,f(0.25));assert.equal(r.state.groundDefenses.mult[0].value,f(1.5));assert.equal(r.state.groundDefenses.mult[1].value,2);}
 }
 assert.equal(reapply(request(ids.toReversed().map(id=>skill(id)),false)).state.accessibility.flat.at(-1).id,'space_operations_GO_0');
});
test('character stats and UI scope must not masquerade as governed callbacks; no ownership gate is invented',()=>{
 const r=reapply(request([skill('industrial_planning'),skill('aptitude_industry')],false));assert.deepEqual(r.execution.applied,[]);assert.equal(r.state.stability.base,2);
 const q=request([skill('hypercognition')],false);assert.equal(reapply(q).execution.applied.length,4);
 rejects(()=>reapply({...q,playerOwned:true}));rejects(()=>reapply(request([skill('fleet_logistics')])));
});
test('unsupported contexts reject before mutation and governed pass requires the common condition boundary',()=>{
 for(const mutate of [p=>p.skills.push(skill('no_such_skill')),p=>p.skills=[skill('hypercognition'),skill('hypercognition')],p=>p.skills=[{skillId:'hypercognition',level:0.1}],p=>delete p.state.groundDefenses,p=>p.state.combatFleetSize=false]){const p=request();mutate(p);const before=structuredClone(p);rejects(()=>reapply(p));assert.deepEqual(p,before);}
 const p=financialInput().commodityPass;p.governedSkills={skills:[],combatFleetSize:null,groundDefenses:null};rejects(()=>reapplyOriginalIndustryCommodityPass(p));
});
test('native original callback and CharacterStats dispatcher differential: 308 ordered/default/threshold states',()=>{
 const cases=[],levels=[-1,0,f(0.99999994),1,2];
 for(const a of levels)for(const b of levels)for(const c of levels)for(const reverse of [false,true]){const skills=[skill('hypercognition',a),skill('planetary_operations',b),skill('space_operations',c)];if(reverse)skills.reverse();cases.push(request(skills,cases.length%3!==0));}
 for(const id of R.knownSkillIds)cases.push(request([skill(id)],false));
 assert.equal(cases.length,308);const native=nativeGovernedSkillSnapshots(cases);assert.equal(native.length,cases.length);
 cases.forEach((p,i)=>assert.deepEqual(reapply(p).state,native[i],'native governed '+i));
});