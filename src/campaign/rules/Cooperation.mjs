import { identifier, finite, requireThat } from '../core/Values.mjs';
import { canCommandFleet } from './FleetControl.mjs';
const put=(collection,before,value)=>({collection,id:value.id,expectedVersion:before?.version??null,value:{...value,version:before?before.version+1:0}});
const remove=(collection,row)=>({collection,id:row.id,expectedVersion:row.version,value:null});
function ownFleet(ctx,id){
  identifier(id,'fleet');requireThat(ctx.actor.kind==='player','FORBIDDEN','A player must issue this command');
  const fleet=ctx.requireVersion('fleets',id);
  requireThat(canCommandFleet(ctx.world,fleet,ctx.actor.id),'FORBIDDEN','No fleet command permission');
  requireThat(fleet.encounterId===null,'ASSET_LOCKED','Fleet is committed to an encounter');
  requireThat(!fleet.navigation?.transition,'IN_TRANSITION','Cannot change cooperation during a jump');return fleet;
}
const event=(type,data)=>({type,data});
function invite(ctx,payload){
  const from=ownFleet(ctx,payload.fromFleetId);identifier(payload.toFleetId);
  const to=ctx.world.fleets[payload.toFleetId];requireThat(to&&to.id!==from.id,'NOT_FOUND','Target fleet is unavailable');
  requireThat(to.partyId===null&&to.encounterId===null,'ASSET_LOCKED','Target fleet cannot join now');
  requireThat(!to.navigation?.transition,'IN_TRANSITION','Target fleet is jumping');
  if(from.partyId!==null){const party=ctx.requireVersion('parties',from.partyId);requireThat(party.leaderFleetId===from.id,'FORBIDDEN','Only party leader can invite');}
  requireThat(Object.values(ctx.world.invitations).filter(i=>i.createdBy===ctx.actor.id).length<32,'INVITE_LIMIT','Too many outstanding invitations');
  const lifetime=finite(ctx.settings.cooperation.invitationLifetimeGameSeconds,'invitation lifetime',1,86400);
  const invitation={id:'invitation:'+String(ctx.world.revision+1),version:0,fromFleetId:from.id,toFleetId:to.id,
    partyId:from.partyId,createdBy:ctx.actor.id,expiresAt:ctx.world.clock.gameSeconds+lifetime};
  return {changes:[put('invitations',null,invitation)],events:[event('party.invited',{invitationId:invitation.id})],result:{invitationId:invitation.id}};
}
function accept(ctx,payload){
  identifier(payload.invitationId);const invitation=ctx.requireVersion('invitations',payload.invitationId);
  requireThat(invitation.expiresAt>ctx.world.clock.gameSeconds,'INVITE_EXPIRED','Invitation has expired');
  const to=ownFleet(ctx,invitation.toFleetId),from=ctx.requireVersion('fleets',invitation.fromFleetId);
  requireThat(to.partyId===null&&from.encounterId===null&&from.partyId===invitation.partyId,'INVITE_STALE','Cooperation state changed');
  requireThat(!from.navigation?.transition,'IN_TRANSITION','Inviter is jumping');
  requireThat(canCommandFleet(ctx.world,from,invitation.createdBy),'INVITE_STALE','Inviter no longer commands this fleet');
  const radius=finite(ctx.settings.cooperation.rendezvousDistance,'rendezvous distance',0,1e6);
  requireThat(from.locationId===to.locationId&&Math.hypot(from.position[0]-to.position[0],from.position[1]-to.position[1])<=radius,'TOO_FAR','Fleets must rendezvous before joining');
  let party=from.partyId===null?null:ctx.requireVersion('parties',from.partyId);
  requireThat(!party||party.leaderFleetId===from.id,'INVITE_STALE','Party leadership changed');
  const max=ctx.settings.cooperation.maxPartyFleets;requireThat(Number.isSafeInteger(max)&&max>=2,'RULE_SETTINGS','Invalid party capacity');
  requireThat(!party||party.fleetIds.length<max,'PARTY_FULL','Party is full');
  const id=party?.id??'party:'+String(ctx.world.revision+1);
  const next={id,version:party?.version??0,leaderFleetId:from.id,fleetIds:party?[...party.fleetIds,to.id]:[from.id,to.id]};
  const changes=[put('parties',party,next),put('fleets',to,{...to,partyId:id}),remove('invitations',invitation)];
  if(!party)changes.push(put('fleets',from,{...from,partyId:id}));
  return {changes,events:[event('party.joined',{partyId:id,fleetId:to.id})],result:{partyId:id}};
}
function leave(ctx,payload){
  const fleet=ownFleet(ctx,payload.fleetId);requireThat(fleet.partyId!==null,'NOT_IN_PARTY','Fleet is not in a party');
  const party=ctx.requireVersion('parties',fleet.partyId),remaining=party.fleetIds.filter(id=>id!==fleet.id);
  requireThat(party.fleetIds.every(id=>!ctx.world.fleets[id].navigation?.transition),'IN_TRANSITION','Party has a jumping fleet');
  const changes=[put('fleets',fleet,{...fleet,partyId:null})];
  if(remaining.length<2){
    for(const id of remaining){const other=ctx.world.fleets[id];requireThat(other.encounterId===null,'ASSET_LOCKED','Party has an active encounter');changes.push(put('fleets',other,{...other,partyId:null}));}
    changes.push(remove('parties',party));
  }else changes.push(put('parties',party,{...party,fleetIds:remaining,leaderFleetId:party.leaderFleetId===fleet.id?remaining[0]:party.leaderFleetId}));
  // Invitations belong to a particular leader/party, not a transferable bearer role.
  for(const i of Object.values(ctx.world.invitations))if(i.partyId===party.id&&(remaining.length<2||i.fromFleetId===fleet.id))changes.push(remove('invitations',i));
  return {changes,events:[event('party.left',{partyId:party.id,fleetId:fleet.id,dissolved:remaining.length<2})],result:{fleetId:fleet.id}};
}
function decline(ctx,payload){
  const row=ctx.requireVersion('invitations',identifier(payload.invitationId));
  // Either recipient's fleet commander or the original sender may dismiss it.
  if(ctx.actor.id!==row.createdBy)ownFleet(ctx,row.toFleetId);
  else requireThat(!ctx.world.fleets[row.fromFleetId].navigation?.transition,'IN_TRANSITION','Cannot dismiss an invitation while its sender is jumping');
  requireThat(ctx.actor.kind==='player','FORBIDDEN','Player required');
  return {changes:[remove('invitations',row)],events:[event('party.invitation-dismissed',{invitationId:row.id})],result:{}};
}
export const cooperationProvider=Object.freeze({id:'cooperative.parties',version:'0.3.0',service:'cooperation',apiVersion:1,
  capabilities:['independent-ownership','rendezvous-parties','consensual-invitations'],
  evidence:[{source:'Web cooperative policy',scope:'Explicit multiplayer extension, not a vanilla mechanic'}],
  methods:{},commands:{'party.invite':invite,'party.accept':accept,'party.leave':leave,'party.decline':decline}});
