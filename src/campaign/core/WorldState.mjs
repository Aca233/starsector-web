import { identifier, slotIdentifier, integer, finite, isRecord, requireThat, jsonCopy, deepFreeze } from './Values.mjs';
export const COLLECTIONS = Object.freeze(['players','factions','locations','spaceEntities','fleets','members','accounts','parties','invitations','encounters','markets','colonies','extensions']);
const record = (v,label) => requireThat(isRecord(v),'INVALID_WORLD',`Expected ${label}`);
const optionalId = (v,label) => { if(v !== null) identifier(v,label); };
const list = (v,label) => {
  requireThat(Array.isArray(v) && new Set(v).size === v.length,'INVALID_WORLD',`Expected unique ${label}`);
  v.forEach(id=>identifier(id,label)); return v;
};
export function createCampaignWorld({id,rules,contentFingerprint}) {
  identifier(id,'world'); identifier(contentFingerprint,'content fingerprint');
  return validateCampaignWorld({schemaVersion:1,id,revision:0,clock:{tick:0,ticksPerSecond:rules.settings?.simulation?.ticksPerSecond??60,gameSeconds:0},rules,contentFingerprint,
    ...Object.fromEntries(COLLECTIONS.map(key=>[key,{}]))});
}
/** Reject malformed/future saves before replacing any authoritative bytes. */
export function validateCampaignWorld(value) {
  const w=jsonCopy(value); record(w,'world');
  requireThat(w.schemaVersion===1,'SAVE_VERSION','Unsupported campaign save schema');
  const keys=new Set(['schemaVersion','id','revision','clock','rules','contentFingerprint','extensions',...COLLECTIONS]);
  requireThat(Object.keys(w).every(k=>keys.has(k)),'SAVE_VERSION','Unknown top-level field; use versioned extension state');
  identifier(w.id); integer(w.revision,'world revision'); record(w.clock,'clock'); integer(w.clock.tick,'world tick');integer(w.clock.ticksPerSecond,'clock rate',1);
  finite(w.clock.gameSeconds,'game seconds',0);
  requireThat(w.clock.ticksPerSecond<=1000&&w.clock.gameSeconds===w.clock.tick/w.clock.ticksPerSecond,'INVALID_CLOCK','Clock fields disagree');
  record(w.rules,'rules lock'); identifier(w.rules.id); identifier(w.rules.version);
  requireThat(w.rules.apiVersion===1,'RULE_API','Unsupported rules lock');
  identifier(w.contentFingerprint); record(w.extensions,'extension state'); record(w.rules.providers,'selected providers');
  for(const [key,state]of Object.entries(w.extensions)){
    identifier(key);record(state,'extension');integer(state.schemaVersion,'extension schema',1);record(state.data,'extension data');
    requireThat(Object.values(w.rules.providers).some(p=>isRecord(p)&&typeof p.id==='string'&&key.startsWith(p.id+':')),
      'EXTENSION_OWNER','Extension namespace must belong to a selected provider');
  }
  for(const name of COLLECTIONS){record(w[name],name);for(const [id,row]of Object.entries(w[name])){
    identifier(id);record(row,name);requireThat(row.id===id,'INVALID_WORLD',`Mismatched ${name} key`);integer(row.version,'entity version');
  }}
  const ref=(collection,id)=>{identifier(id);requireThat(Object.hasOwn(w[collection],id),'BROKEN_REFERENCE',`Missing ${collection}/${id}`);};
  const owner=o=>{record(o,'owner');requireThat(o.kind==='player'||o.kind==='faction','INVALID_WORLD','Invalid owner kind');ref(o.kind==='player'?'players':'factions',o.id);};
  for(const p of Object.values(w.players)){
    requireThat(typeof p.name==='string' && p.name.trim().length>0 && p.name.length<=80,'INVALID_WORLD','Invalid player name');
    optionalId(p.factionId,'faction');if(p.factionId!==null)ref('factions',p.factionId);
  }
  for(const f of Object.values(w.factions)){
    requireThat(typeof f.name==='string'&&f.name.trim().length>0&&f.name.length<=80,'INVALID_WORLD','Invalid faction name');
    record(f.playerRoles,'faction roles');for(const [id,role]of Object.entries(f.playerRoles)){ref('players',id);requireThat(['leader','manager','member'].includes(role),'INVALID_WORLD','Invalid role');}
  }
  for(const location of Object.values(w.locations)) {
    requireThat(typeof location.name==='string','INVALID_WORLD','Invalid location');
    if(location.tags!==undefined)list(location.tags,'location tags');
    if(location.navigation!==undefined){record(location.navigation,'location navigation');
      requireThat(Object.keys(location.navigation).every(k=>['space','terrain','jumpTopology'].includes(k)),'INVALID_WORLD','Unknown location navigation field');
      requireThat(['normal','hyperspace'].includes(location.navigation.space),'INVALID_WORLD','Invalid space kind');
      list(location.navigation.terrain,'terrain');
      if(location.navigation.jumpTopology!==undefined)requireThat(['complete','unavailable'].includes(location.navigation.jumpTopology),'INVALID_WORLD','Unknown topology coverage');
    }
  }
  for(const e of Object.values(w.spaceEntities)){
    requireThat(typeof e.name==='string','INVALID_WORLD','Invalid space entity name');ref('locations',e.locationId);
    requireThat(Array.isArray(e.position)&&e.position.length===2,'INVALID_WORLD','Invalid entity position');e.position.forEach(n=>finite(n,'entity coordinate',-1e12,1e12));
    finite(e.radius,'entity radius',0,1e6);list(e.tags,'entity tags');
    if(e.jump!==undefined){record(e.jump,'jump point');requireThat([null,'star','gas-giant'].includes(e.jump.anchor),'INVALID_WORLD','Invalid jump anchor');
      requireThat(Array.isArray(e.jump.destinations),'INVALID_WORLD','Invalid jump destinations');
      for(const d of e.jump.destinations){record(d,'jump destination');ref('spaceEntities',d.targetId);finite(d.minDistance,'minimum arrival distance',0,1e6);finite(d.maxDistance,'maximum arrival distance',d.minDistance,1e6);}
    }
  }
  for(const f of Object.values(w.fleets)){
    owner(f.owner);ref('locations',f.locationId);
    record(f.control,'fleet control');
    requireThat(['player','faction','npc'].includes(f.control.kind),'INVALID_CONTROL','Invalid fleet controller');
    requireThat(Object.keys(f.control).every(k=>k==='kind'||(f.control.kind!=='npc'&&k==='id')),'INVALID_CONTROL','Invalid controller fields');
    if(f.control.kind!=='npc')ref(f.control.kind==='player'?'players':'factions',f.control.id);
    if(f.navigation!==undefined){record(f.navigation,'fleet navigation');
      requireThat(Object.keys(f.navigation).every(k=>['velocity','destination','rngState','transition','accelerationUntilTick','noEngageUntilTick','interaction'].includes(k)),'INVALID_WORLD','Unknown fleet navigation field');
      if(f.navigation.interaction!==undefined){const i=f.navigation.interaction;record(i,'interaction intent');
        requireThat(Object.keys(i).every(k=>['targetId','orderId','arrived'].includes(k))&&typeof i.arrived==='boolean','INVALID_WORLD','Invalid interaction intent');
        ref('spaceEntities',i.targetId);identifier(i.orderId,'interaction order');
        requireThat(w.spaceEntities[i.targetId].locationId===f.locationId&&f.navigation.destination!==null&&!f.navigation.transition,'INVALID_WORLD','Interaction target must be local and cannot coexist with a jump');
        requireThat(!i.arrived||(Array.isArray(f.navigation.velocity)&&f.navigation.velocity.every(n=>n===0)),'INVALID_WORLD','Arrived interaction must hold its fleet');
      }
      if(f.navigation.rngState!==undefined){integer(f.navigation.rngState,'random state',1);requireThat(f.navigation.rngState<=4294967295,'INVALID_WORLD','Random state exceeds uint32');}
      for(const key of ['accelerationUntilTick','noEngageUntilTick'])if(f.navigation[key]!==undefined)integer(f.navigation[key],key);
      if(f.navigation.transition!==undefined){const t=f.navigation.transition;record(t,'jump transition');requireThat(t.schemaVersion===1,'SAVE_VERSION','Unsupported jump transition');
        ref('spaceEntities',t.sourceId);ref('spaceEntities',t.targetId);list(t.shipIds,'jump members');
        requireThat(JSON.stringify(t.shipIds)===JSON.stringify(f.memberIds),'INVALID_WORLD','Transition roster changed');
        requireThat(['start','approach','warp-out','fade-out','fade-in','warp-in'].includes(t.phase),'INVALID_WORLD','Unknown jump phase');
        for(const key of ['startedTick','phaseTick','moveTicks','warpedCount','jitterUntilTick'])integer(t[key],key);
        ref('locations',t.sourceLocationId);ref('locations',t.targetLocationId);
        requireThat(w.spaceEntities[t.sourceId].locationId===t.sourceLocationId&&w.spaceEntities[t.targetId].locationId===t.targetLocationId,'INVALID_WORLD','Jump endpoints changed locations');
        const arrived=['fade-in','warp-in'].includes(t.phase);
        requireThat(f.locationId===(arrived?t.targetLocationId:t.sourceLocationId),'INVALID_WORLD','Jump phase and fleet location disagree');
        requireThat(t.startedTick<=t.phaseTick&&t.phaseTick<=w.clock.tick,'INVALID_WORLD','Invalid jump phase time');
        requireThat(t.warpedCount<=t.shipIds.length,'INVALID_WORLD','Too many warping ships');
        finite(t.intervalProgress,'warp interval progress',0);finite(t.nextInterval,'warp interval',0.05,0.2);finite(t.warpRate,'warp rate',1,1e12);
        finite(t.paidFuel,'jump fuel paid',0);finite(t.minDistance,'minimum arrival distance',0,1e6);finite(t.maxDistance,'maximum arrival distance',t.minDistance,1e6);
        requireThat(f.encounterId===null&&f.navigation.destination!==null,'INVALID_WORLD','Jumping fleet cannot also be battle locked or idle');
      }
      for(const [key,value]of Object.entries({velocity:f.navigation.velocity,destination:f.navigation.destination})){
        if(key==='destination'&&value===null)continue;
        requireThat(Array.isArray(value)&&value.length===2,'INVALID_WORLD','Invalid navigation vector');
        value.forEach(n=>finite(n,'navigation coordinate',-1e12,1e12));
      }
      requireThat(f.navigation.destination!==null||f.navigation.velocity.every(n=>n===0),'INVALID_WORLD','An idle fleet cannot retain unintegrated velocity');
    }
    requireThat(Array.isArray(f.position)&&f.position.length===2,'INVALID_WORLD','Invalid fleet position');f.position.forEach(n=>finite(n,'position',-1e12,1e12));
    record(f.cargo,'cargo');for(const [id,n]of Object.entries(f.cargo)){identifier(id);finite(n,'cargo quantity',0);}
    list(f.memberIds,'fleet members');for(const id of f.memberIds){ref('members',id);requireThat(w.members[id].fleetId===f.id,'BROKEN_REFERENCE','Fleet member mismatch');}
    optionalId(f.partyId,'party');optionalId(f.encounterId,'encounter');
    if(f.partyId!==null){ref('parties',f.partyId);requireThat(Array.isArray(w.parties[f.partyId].fleetIds)&&w.parties[f.partyId].fleetIds.includes(f.id),'BROKEN_REFERENCE','Party membership mismatch');}
    if(f.encounterId!==null){ref('encounters',f.encounterId);requireThat(Array.isArray(w.encounters[f.encounterId].fleetIds)&&w.encounters[f.encounterId].fleetIds.includes(f.id),'BROKEN_REFERENCE','Encounter membership mismatch');}
  }
  for(const m of Object.values(w.members)){
    if(m.logistics!==undefined){record(m.logistics,'member logistics');requireThat(typeof m.logistics.mothballed==='boolean'&&typeof m.logistics.suspendRepairs==='boolean','INVALID_WORLD','Invalid logistics flags');if(m.logistics.crPriorToMothballing!==undefined)finite(m.logistics.crPriorToMothballing,'CR before mothballing',0,1);}
    owner(m.owner);ref('fleets',m.fleetId);requireThat(w.fleets[m.fleetId].memberIds.includes(m.id),'BROKEN_REFERENCE','Member absent from fleet');
    record(m.loadout,'loadout');identifier(m.loadout.hullId,'base hull');record(m.condition,'condition');
    finite(m.condition.hullFraction,'hull',0,1);finite(m.condition.combatReadiness,'CR',0,1);
    const armor=m.condition.armor;
    if(armor!==null){record(armor,'armor grid');integer(armor.cols,'armor columns',1);integer(armor.rows,'armor rows',1);
      requireThat(Array.isArray(armor.fractions)&&armor.fractions.length===armor.cols*armor.rows,'INVALID_WORLD','Invalid armor cells');armor.fractions.forEach(n=>finite(n,'armor fraction',0,1));}
    record(m.condition.ammunition,'ammunition');for(const [slot,ammo]of Object.entries(m.condition.ammunition)){slotIdentifier(slot);if(ammo!==null)integer(ammo,'ammo');}
    requireThat(['ready','destroyed'].includes(m.condition.status) && ((m.condition.status==='destroyed')===(m.condition.hullFraction===0)), 'INVALID_WORLD','Hull status mismatch');
  }
  for(const a of Object.values(w.accounts)){owner(a.owner);finite(a.balance,'account balance');identifier(a.currency,'currency');}
  for(const p of Object.values(w.parties)){
    list(p.fleetIds,'party fleets');requireThat(p.fleetIds.length>=2,'INVALID_WORLD','A party needs at least two fleets');
    requireThat(p.fleetIds.includes(p.leaderFleetId),'BROKEN_REFERENCE','Party leader absent');
    for(const id of p.fleetIds){ref('fleets',id);requireThat(w.fleets[id].partyId===p.id,'BROKEN_REFERENCE','Fleet party mismatch');}
  }
  for(const invite of Object.values(w.invitations)){
    ref('fleets',invite.fromFleetId);ref('fleets',invite.toFleetId);ref('players',invite.createdBy);
    requireThat(invite.fromFleetId!==invite.toFleetId,'INVALID_WORLD','Cannot invite own fleet');
    optionalId(invite.partyId,'invited party');if(invite.partyId!==null)ref('parties',invite.partyId);
    finite(invite.expiresAt,'invitation expiry',0);
  }
  for(const e of Object.values(w.encounters)){
    list(e.fleetIds,'encounter fleets');requireThat(e.fleetIds.length>0,'INVALID_WORLD','Empty encounter');integer(e.battleAttempt,'battle attempt',1);
    requireThat(['forming','preparing','running','settling','committed','cancelled','recovery-required'].includes(e.status),'INVALID_WORLD','Invalid encounter state');
    for(const id of e.fleetIds){ref('fleets',id);if(!['committed','cancelled'].includes(e.status))requireThat(w.fleets[id].encounterId===e.id,'BROKEN_REFERENCE','Encounter lock mismatch');}
    if(['committed','cancelled'].includes(e.status))requireThat(e.fleetIds.every(id=>w.fleets[id].encounterId!==e.id),'BROKEN_REFERENCE','Terminal encounter retains locks');
  }
  for(const c of Object.values(w.colonies)){owner(c.owner);ref('locations',c.locationId);ref('markets',c.marketId);}
  for(const m of Object.values(w.markets)){owner(m.owner);ref('locations',m.locationId);}
  return deepFreeze(w);
}
