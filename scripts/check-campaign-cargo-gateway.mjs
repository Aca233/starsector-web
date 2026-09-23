import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { listenCampaignGateway } from '../server/campaign/HttpGateway.mjs';
async function setup(t, nearby=true) {
  const service=new CampaignService({filename:':memory:'});
  const world=structuredClone(createDevelopmentCampaign());world.fleets['fleet-captain-b'].position=nearby?[0,0]:[9000,9000];
  await service.create(world);
  const gateway=await listenCampaignGateway({service,worldId:world.id,port:0,grants:[{playerId:'captain-a',token:'A'.repeat(43)},{playerId:'captain-b',token:'B'.repeat(43)}]});
  t.after(async()=>{await gateway.close();await service.close();});
  const api=async(who,type,payload,fleetId,podId)=>{
    const w=await service.read(world.id),f=w.fleets[fleetId],epoch=(await service.ready()).epoch;
    const command={worldId:world.id,epoch,requestId:crypto.randomUUID(),type,payload,expected:[{collection:'fleets',id:f.id,version:f.version},...f.memberIds.map(id=>({collection:'members',id,version:w.members[id].version})),...(podId?[{collection:'spaceEntities',id:podId,version:w.spaceEntities[podId].version}]:[])]};
    const send=async()=>{const r=await fetch(gateway.origin+'/campaign-api/command',{method:'POST',headers:{Authorization:'Bearer '+who.repeat(43),'Content-Type':'application/json'},body:JSON.stringify(command)});return {status:r.status,value:await r.json()};};
    return {reply:await send(),send};
  };
  const read=async who=>{const r=await fetch(gateway.origin+'/campaign-api/session',{headers:{Authorization:'Bearer '+who.repeat(43)}});assert.equal(r.status,200);return r.json();};
  return {service,world,api,read};
}
test('HTTP bulk repair uses granted identity and updates the whole roster without cargo mutations',async t=>{
  const {service,world,api,read}=await setup(t);
  assert.equal((await api('B','logistics.set-fleet-repairs',{fleetId:'fleet-captain-a',suspended:true},'fleet-captain-a')).reply.status,403);
  const {reply,send}=await api('A','logistics.set-fleet-repairs',{fleetId:'fleet-captain-a',suspended:true},'fleet-captain-a');
  assert.equal(reply.status,200);assert.deepEqual(await send(),reply);
  const view=(await read('A')).view;assert.equal(view.fleets[0].private.members[0].repairsSuspended,true);
  assert.deepEqual((await service.read(world.id)).fleets['fleet-captain-a'].cargo,{crew:15,fuel:20,supplies:30});
});
test('jettison and another nearby player collecting are conserved and replay-safe through HTTP',async t=>{
  const {service,world,api,read}=await setup(t);
  const {reply,send}=await api('A','cargo.jettison',{fleetId:'fleet-captain-a',items:{supplies:4,fuel:3,crew:2}},'fleet-captain-a');assert.equal(reply.status,200);assert.deepEqual(await send(),reply);
  const view=(await read('B')).view;assert.equal(view.cargoPods.length,1);const pod=view.cargoPods[0];assert.deepEqual(pod.items,{crew:2,fuel:3,supplies:4});assert.ok(pod.accessibleToFleetIds.includes('fleet-captain-b'));assert.equal('createdBy' in pod,false);assert.equal('sourceFleetId' in pod,false);
  const take=await api('B','cargo.collect',{fleetId:'fleet-captain-b',podId:pod.id},'fleet-captain-b',pod.id);assert.equal(take.reply.status,200);assert.deepEqual(await take.send(),take.reply);
  const w=await service.read(world.id);assert.equal(w.spaceEntities[pod.id],undefined);for(const key of ['crew','fuel','supplies'])assert.equal(w.fleets['fleet-captain-a'].cargo[key]+w.fleets['fleet-captain-b'].cargo[key],world.fleets['fleet-captain-a'].cargo[key]*2);
  assert.equal((await read('A')).view.cargoPods.length,0);
});
test('out-of-range pod markers disclose no inventory and forged pickup changes nothing',async t=>{
  const {service,world,api,read}=await setup(t,false);
  const drop=await api('A','cargo.jettison',{fleetId:'fleet-captain-a',items:{supplies:4}},'fleet-captain-a');assert.equal(drop.reply.status,200);
  const pod=(await read('B')).view.cargoPods[0];assert.equal(pod.items,null);assert.deepEqual(pod.accessibleToFleetIds,[]);
  const before=await service.read(world.id);const take=await api('B','cargo.collect',{fleetId:'fleet-captain-b',podId:pod.id},'fleet-captain-b',pod.id);assert.notEqual(take.reply.status,200);assert.deepEqual(await service.read(world.id),before);
});
