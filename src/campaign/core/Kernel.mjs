import { COLLECTIONS, validateCampaignWorld } from './WorldState.mjs';
import { identifier, integer, isRecord, requireThat, jsonCopy, immutableJSON, canonicalJSON } from './Values.mjs';

export function validateCommand(command) {
  const c=jsonCopy(command);requireThat(isRecord(c),'INVALID_COMMAND','Expected a command');
  identifier(c.requestId,'request');identifier(c.worldId,'world');identifier(c.epoch,'authority epoch');identifier(c.type,'command type');
  requireThat(isRecord(c.payload)&&Array.isArray(c.expected),'INVALID_COMMAND','Missing payload or entity versions');
  const keys=new Set();for(const entry of c.expected){
    requireThat(isRecord(entry)&&COLLECTIONS.includes(entry.collection),'INVALID_COMMAND','Invalid expected collection');identifier(entry.id);integer(entry.version,'expected version');
    const key=entry.collection+':'+entry.id;requireThat(!keys.has(key),'INVALID_COMMAND','Duplicate expected version');keys.add(key);
  }
  requireThat(c.expected.length<=256,'COMMAND_LIMIT','Too many entity versions');return immutableJSON(c);
}
export function authorizePrincipal(world,principal) {
  requireThat(isRecord(principal)&&['player','system'].includes(principal.kind),'AUTH_REQUIRED','Unrecognized principal');
  identifier(principal.id,'principal');
  if(principal.kind==='player')requireThat(Object.hasOwn(world.players,principal.id),'AUTH_REQUIRED','Player does not belong to world');
  return immutableJSON({kind:principal.kind,id:principal.id});
}
export function planCampaignCommand(world, command, principal, ruleset) {
  world=validateCampaignWorld(world);
  requireThat(ruleset.acceptsLock(world.rules),'RULESET_MISMATCH','Saved rules do not match selected providers');
  ruleset.validateWorld(world);
  const c=validateCommand(command), actor=authorizePrincipal(world,principal);
  requireThat(c.worldId===world.id,'WRONG_WORLD','Command is for another world');
  const handler=ruleset.handler(c.type);requireThat(handler,'UNSUPPORTED_COMMAND',`Unsupported command: ${c.type}`);
  for(const entry of c.expected){
    requireThat(world[entry.collection][entry.id]?.version===entry.version,'VERSION_CONFLICT',`Stale ${entry.collection}/${entry.id}`);
  }
  const context=Object.freeze({world,actor,settings:world.rules.settings,
    requireVersion(collection,id){const row=world[collection]?.[id];requireThat(row,'NOT_FOUND',`Missing ${collection}/${id}`);
      requireThat(c.expected.some(e=>e.collection===collection&&e.id===id&&e.version===row.version),'VERSION_REQUIRED',`Expected version required: ${collection}/${id}`);return row;},
    services:ruleset.services});
  const plan=handler(context,c.payload,c.requestId);
  requireThat(plan && typeof plan.then!=='function','ASYNC_RULE','Rules must return a synchronous plan');
  const p=jsonCopy(plan);requireThat(Array.isArray(p.changes)&&Array.isArray(p.events),'INVALID_PLAN','Expected changes and events');
  requireThat(p.changes.length<=512&&p.events.length<=128,'PLAN_LIMIT','Rule plan exceeds budget');
  const next=jsonCopy(world), touched=new Set();
  for(const change of p.changes){
    requireThat(isRecord(change)&&COLLECTIONS.includes(change.collection),'INVALID_PLAN','Invalid change collection');identifier(change.id);
    const key=change.collection+':'+change.id;requireThat(!touched.has(key),'INVALID_PLAN','Multiple writes to same entity');touched.add(key);
    if(change.collection==='extensions') {
      requireThat(ruleset.canWriteExtension(c.type,change.id,actor.kind),'EXTENSION_OWNER','Extension writes need ownership or an explicit owner-granted system command');
    }
    const before=world[change.collection][change.id];
    requireThat((before?.version??null)===change.expectedVersion,'VERSION_CONFLICT',`Plan has stale ${key}`);
    if(change.value===null){requireThat(before,'NOT_FOUND',`Cannot remove ${key}`);delete next[change.collection][change.id];}
    else {requireThat(isRecord(change.value)&&change.value.id===change.id&&change.value.version===(before?before.version+1:0),'INVALID_PLAN',`Invalid next entity version: ${key}`);next[change.collection][change.id]=change.value;}
  }
  for(const event of p.events){requireThat(isRecord(event)&&isRecord(event.data),'INVALID_PLAN','Invalid event');identifier(event.type,'event type');}
  if(p.clock!==undefined){
    const provider=ruleset.providerForCommand(c.type);
    requireThat(actor.kind==='system'&&provider.service==='simulation'&&provider.capabilities.includes('world-clock-writer'),
      'FORBIDDEN','Only the selected authoritative simulation can advance the world clock');
    requireThat(isRecord(p.clock)&&canonicalJSON(p.clock.expected)===canonicalJSON(world.clock),'TIME_CONFLICT','World clock changed');
    const value=p.clock.value;
    requireThat(isRecord(value)&&value.ticksPerSecond===world.clock.ticksPerSecond&&value.tick>world.clock.tick,
      'INVALID_CLOCK','Simulation cannot rewind or change clock rate');
    next.clock=value;
  }
  integer(world.revision+1,'next revision');next.revision=world.revision+1;
  const validated = validateCampaignWorld(next); ruleset.validateWorld(validated);
  return Object.freeze({world:validated,events:immutableJSON(p.events),result:immutableJSON(p.result??{})});
}
