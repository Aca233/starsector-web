import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, unlinkSync, rmdirSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {CampaignRepository} from '../server/campaign/Repository.mjs';
import {createDevelopmentCampaign} from '../server/campaign/DevelopmentWorld.mjs';
import {createReferenceRuleset} from '../src/campaign/ReferenceRuleset.mjs';
import {CampaignRuleRegistry} from '../src/campaign/core/RuleRegistry.mjs';
import {createCampaignWorld} from '../src/campaign/core/WorldState.mjs';
import {projectCampaignPlayer} from '../server/campaign/PlayerProjection.mjs';
const rules=createReferenceRuleset(), key='reference.calendar:epoch';
function store(t,w=createDevelopmentCampaign()){const s=new CampaignRepository(':memory:',rules);t.after(()=>s.close());s.create(w);return s;}
const advance=s=>s.execute({kind:'system',id:'clock'},{worldId:'development-sector',epoch:s.epoch,requestId:'next-day',type:'world.advance',payload:{fromTick:0,ticks:600},expected:[]});
test('explicit developer epoch reaches the native next civil day through the authority clock',t=>{
  const s=store(t),before=s.read('development-sector');assert.equal(projectCampaignPlayer(before,'captain-a',rules).calendar.shortDate,'206.1.1');
  advance(s);const after=s.read(before.id);assert.equal(after.clock.gameSeconds,10);assert.equal(projectCampaignPlayer(after,'captain-a',rules).calendar.shortDate,'206.1.2');assert.deepEqual(after.extensions[key],before.extensions[key]);
});
test('a missing saved epoch remains unknown instead of silently adopting a native start date',t=>{
  const w=structuredClone(createDevelopmentCampaign());delete w.extensions[key];const s=store(t,w);assert.equal(projectCampaignPlayer(s.read(w.id),'captain-a',rules).calendar,null);advance(s);assert.equal(s.read(w.id).extensions[key],undefined);
});
test('calendar provider rejects corrupt or future epoch state before any new world is written',t=>{
  const s=new CampaignRepository(':memory:',rules);t.after(()=>s.close());
  for(const mutate of [e=>e.data.epoch.date.month=13,e=>e.data.epoch.providerVersion='future',e=>e.schemaVersion=2,e=>e.data.extra=true]){
    const w=structuredClone(createDevelopmentCampaign());mutate(w.extensions[key]);assert.throws(()=>s.create(w));assert.throws(()=>s.read(w.id),{code:'WORLD_NOT_FOUND'});
  }
});
test('file reopen invokes selected-provider validation and cannot replay through an invalid saved epoch',t=>{
  const dir=mkdtempSync(join(tmpdir(),'campaign-calendar-save-')),filename=join(dir,'world.sqlite');let s=new CampaignRepository(filename,rules);s.create(createDevelopmentCampaign());advance(s);s.close();
  s=new CampaignRepository(filename,rules);assert.equal(projectCampaignPlayer(s.read('development-sector'),'captain-a',rules).calendar.shortDate,'206.1.2');s.close();
  const db=new DatabaseSync(filename),w=JSON.parse(db.prepare('SELECT state FROM worlds').get().state);w.extensions[key].data.epoch.date.day=99;db.prepare('UPDATE worlds SET state=?').run(JSON.stringify(w));db.close();
  s=new CampaignRepository(filename,rules);try{assert.throws(()=>s.read('development-sector'),{code:'INVALID_CALENDAR'});}finally{s.close();for(const p of [filename+'-wal',filename+'-shm',filename])if(existsSync(p))unlinkSync(p);rmdirSync(dir);}
});
test('generic provider validation rejects invalid command effects atomically without coupling the kernel to calendar',t=>{
  const p={id:'test.rules',version:'1',service:'custom',apiVersion:1,capabilities:[],methods:{validateWorld(w){if(w.extensions['test.rules:value']?.data.bad)throw Object.assign(Error('bad'),{code:'CUSTOM_INVALID'});}},commands:{'custom.bad':()=>({changes:[{collection:'extensions',id:'test.rules:value',expectedVersion:null,value:{id:'test.rules:value',version:0,schemaVersion:1,data:{bad:true}}}],events:[],result:{}})}};
  const compiled=new CampaignRuleRegistry().register(p).compile({id:'test',version:'1',providers:{custom:p.id}}),s=new CampaignRepository(':memory:',compiled);t.after(()=>s.close());s.create(createCampaignWorld({id:'test',rules:compiled.lock,contentFingerprint:'test'}));const before=s.read('test');
  assert.throws(()=>s.execute({kind:'system',id:'test'},{worldId:'test',epoch:s.epoch,requestId:'bad',type:'custom.bad',payload:{},expected:[]}),{code:'CUSTOM_INVALID'});assert.deepEqual(s.read('test'),before);assert.deepEqual(s.eventsSince('test',0),[]);
  const asyncRules=new CampaignRuleRegistry().register({...p,id:'async.rules',methods:{validateWorld:()=>Promise.resolve()}}).compile({id:'async-test',version:'1',providers:{custom:'async.rules'}});
  assert.throws(()=>asyncRules.validateWorld(createCampaignWorld({id:'async-test',rules:asyncRules.lock,contentFingerprint:'test'})),{code:'ASYNC_RULE'});
});
