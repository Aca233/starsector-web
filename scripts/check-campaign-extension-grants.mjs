import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { createCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { planCampaignCommand } from '../src/campaign/core/Kernel.mjs';
const grant=()=>({service:'maintenance',capabilities:['stock-write'],commands:['writer.update']});
function setup({grants=[grant()],capabilities=['stock-write'],writerService='maintenance',writerGrants}={}) {
 const effect=(ctx,payload)=>{const id=payload.target??'test.owner:state',before=ctx.world.extensions[id];return {changes:[{collection:'extensions',id,expectedVersion:before.version,value:{...before,version:before.version+1,data:{count:before.data.count+1}}}],events:[]};};
 const owner={id:'test.owner',service:'store',version:'1',apiVersion:1,capabilities:[],extensionWriteGrants:grants,commands:{'owner.update':effect}};
 const writer={id:'test.writer',service:writerService,version:'1',apiVersion:1,capabilities,commands:{'writer.update':effect,'writer.other':effect},...(writerGrants?{extensionWriteGrants:writerGrants}:{})};
 const other={id:'test.ownerish',service:'other',version:'1',apiVersion:1,capabilities:[]};
 const rules=new CampaignRuleRegistry().register(owner).register(writer).register(other).compile({id:'grants',version:'1',providers:{store:owner.id,[writerService]:writer.id,other:other.id}});
 const world=structuredClone(createCampaignWorld({id:'world',rules:rules.lock,contentFingerprint:'test'}));
 world.players.a={id:'a',version:0,name:'a',factionId:null};
 for(const id of ['test.owner:state','test.ownerish:state'])world.extensions[id]={id,version:0,schemaVersion:1,data:{count:0}};
 const command=(type='writer.update',payload={})=>({worldId:world.id,epoch:'test',requestId:'write',type,payload,expected:[]});
 return {rules,world,command};
}
test('owner-declared exact command/capability/service grant permits system plan, not a player or another command',()=>{
 const {rules,world,command}=setup(),before=structuredClone(world);
 const next=planCampaignCommand(world,command(),{kind:'system',id:'scheduler'},rules).world;assert.equal(next.extensions['test.owner:state'].data.count,1);assert.deepEqual(world,before);
 for(const [cmd,actor]of [[command(),{kind:'player',id:'a'}],[command('writer.other'),{kind:'system',id:'scheduler'}],[command('writer.update',{target:'test.ownerish:state'}),{kind:'system',id:'scheduler'}]])assert.throws(()=>planCampaignCommand(world,cmd,actor,rules),{code:'EXTENSION_OWNER'});
 assert.equal(rules.canWriteExtension('writer.update','test.ownerish:state','system'),false);assert.equal(rules.canWriteExtension('missing','test.owner:state','system'),false);
});
test('no implicit system bypass, absent owner grants, wrong capability and wrong service remain denied',()=>{
 for(const config of [{grants:[]},{capabilities:[]},{writerService:'impostor'},{grants:[],writerGrants:[grant()]}]){
  const {rules,world,command}=setup(config);assert.throws(()=>planCampaignCommand(world,command(),{kind:'system',id:'scheduler'},rules),{code:'EXTENSION_OWNER'});
 }
 const {rules,world,command}=setup({grants:[]});assert.equal(planCampaignCommand(world,command('owner.update'),{kind:'player',id:'a'},rules).world.extensions['test.owner:state'].data.count,1);
});
test('grant definitions reject wildcards, empty contracts, duplicates, unknown fields and oversize lists',()=>{
 const bad=[null,{},[{...grant(),commands:['*']}],[{...grant(),commands:[]}],[{...grant(),capabilities:[]}],[grant(),grant()],[{...grant(),allowAll:true}],Array(33).fill(grant()),[{...grant(),commands:['writer.update','writer.update']}]];
 for(const grants of bad)assert.throws(()=>setup({grants}));
});
test('grants are immutable part of rules lock; changing or removing permission does not silently accept a save',()=>{
 const grants=[grant()],{rules}=setup({grants});grants[0].commands.push('writer.other');
 assert.equal(rules.canWriteExtension('writer.other','test.owner:state','system'),false);assert.ok(Object.isFrozen(rules.lock.providers.store.extensionWriteGrants[0].commands));
 const changed=setup({grants:[{...grant(),commands:['writer.update','writer.other']}]}).rules;assert.equal(changed.acceptsLock(rules.lock),false);assert.equal(setup({grants:[]}).rules.acceptsLock(rules.lock),false);
});
