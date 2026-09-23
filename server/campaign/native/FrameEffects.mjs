import {createHash} from 'node:crypto';
import {requireThat,immutableJSON,isRecord,integer,identifier} from '../../../src/campaign/core/Values.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_FRAME_EFFECT',message);
const text=value=>{check(typeof value==='string','Actual effect text required');return value;};
const number=value=>{check(Number.isFinite(value),'Finite effect number required');return value;};
const vector=value=>{check(Array.isArray(value)&&value.length===2,'Actual effect vector required');return value.map(number);};
const color=value=>{check(Array.isArray(value)&&value.length===4&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual RGBA required');return [...value];};
const member=value=>{check(value&&typeof value.objectRef==='string','Actual effect member required');return {memberRef:value.objectRef};};
function loss(value){
 check(isRecord(value),'Actual accident loss required');
 if(value.kind==='ship'){check(['DAMAGED','DESTROYED'].includes(value.lossType),'Actual accident ship loss required');return {kind:'ship',lossType:value.lossType,member:member(value.member),crLost:number(value.crLost),title:text(value.title),description:text(value.description)};}
 check(value.kind==='cargo'&&['RESOURCES','WEAPONS','FIGHTER_CHIP'].includes(value.type),'Actual accident cargo loss required');return {kind:'cargo',type:value.type,itemId:text(value.itemId),quantity:number(value.quantity),title:text(value.title),description:text(value.description)};
}
function snapshot(effect,source,player,presentation){
 check(isRecord(effect),'Actual frame effect required');
 if(effect.kind==='sensor-ping'){check(effect.entity===source,'Contact ping source mismatch');return {delivery:'observer-scene',effect:{kind:effect.kind,id:text(effect.id),position:vector(source.position),color:color(effect.color)}};}
 if(effect.kind==='campaign-sound')return {delivery:'observer-scene',effect:{kind:effect.kind,id:text(effect.id),position:vector(effect.position),velocity:vector(effect.velocity),pitch:number(effect.pitch),volume:number(effect.volume)}};
 if(effect.scope==='native-campaign-ability-effect'){
  check(effect.fleetRef===source.objectRef&&['world-sound','ui-sound','world-loop','ui-loop','floating-text'].includes(effect.type),'Actual supported ability effect required');
  const out={kind:'ability-effect',type:effect.type,abilityId:text(effect.abilityId)};
  if(effect.type==='floating-text')Object.assign(out,{text:text(effect.text),duration:number(effect.duration),color:color(effect.color),position:vector(effect.position??source.position)});
  else {Object.assign(out,{soundId:text(effect.soundId),volume:number(effect.volume),pitch:number(effect.pitch)});for(const key of ['position','velocity'])if(Object.hasOwn(effect,key))out[key]=vector(effect[key]);if(Object.hasOwn(effect,'musicSuppression'))out.musicSuppression=number(effect.musicSuppression);}
  // Native ability rules already gate world effects by the real singleton player's visibility.
  return {delivery:'native-player',effect:out};
 }
 if(effect.kind==='accident-report'){
  const r=effect.report;check(typeof effect.showPlayerReport==='boolean'&&r?.scope==='native-low-cr-accident-report'&&r.severity==='MAJOR'&&Array.isArray(r.losses),'Actual accident report required');
  check(!effect.showPlayerReport||source===player,'Cannot redirect another fleet accident to the native player');
  return {delivery:effect.showPlayerReport?'native-player':'host-only',effect:{kind:effect.kind,report:{scope:r.scope,severity:r.severity,prefix:text(r.prefix),cause:text(r.cause),advice:text(r.advice),losses:r.losses.map(loss)}}};
 }
 check(source===player,'Stock player message belongs to actual player fleet');
 if(effect.kind==='campaign-message'){check(effect.colorRole==='enemy','Actual message color role required');return {delivery:'native-player',effect:{kind:effect.kind,text:text(effect.text),colorRole:effect.colorRole}};}
 if(effect.kind==='repairs-complete'){
  check(effect.colorRole==='base-player'&&effect.clickAction==='REFIT_TAB'&&effect.icon?.category==='intel'&&effect.icon.key==='repairs_finished','Actual repair message metadata required');
  check(typeof presentation.readPlayerBaseColor==='function','Actual fixed player faction color service required');
  return {delivery:'native-player',effect:{kind:effect.kind,color:color(presentation.readPlayerBaseColor()),member:member(effect.member),mergeExtraPrefix:text(effect.mergeExtraPrefix),initialExtra:text(effect.initialExtra),initialText:text(effect.initialText),mergedTextPrefix:text(effect.mergedTextPrefix),mergedTextSuffix:text(effect.mergedTextSuffix),colorRole:effect.colorRole,icon:{category:'intel',key:'repairs_finished'},clickAction:effect.clickAction}};
 }
 check(false,'No serializer for native frame effect');
}
/** Trusted transaction output only. No callbacks or external I/O before SQLite commit. */
export function captureNativeFrameEffects(entries,controllers,presentation={}){
 check(Array.isArray(entries),'Ordered native engine effects required');
 return immutableJSON(entries.map(({entity,location,playerFleet,effect})=>{
  check(entity&&location&&typeof entity.objectRef==='string'&&typeof location.objectRef==='string','Actual source/location identities required');
  const captured=snapshot(effect,entity,playerFleet,presentation),owner=playerFleet===null?null:controllers.find(c=>c.fleetDataRefs.includes(playerFleet.dataRef));
  return {...captured,sourceRef:entity.objectRef,locationRef:location.objectRef,recipientPlayerId:captured.delivery==='native-player'?(owner?.playerId??null):null,recipientDataRef:captured.delivery==='native-player'&&owner?playerFleet.dataRef:null};
 }));
}
export function validateNativeFrameEventsRequest(input){
 requireThat(isRecord(input)&&Object.keys(input).every(k=>['worldId','epoch','afterRevision','limit'].includes(k)),'INVALID_REQUEST','Only native frame event cursor fields are accepted');
 identifier(input.worldId);identifier(input.epoch);integer(input.afterRevision,'native frame event cursor');
 const limit=input.limit??100;integer(limit,'native frame event limit',1);requireThat(limit<=100,'QUERY_LIMIT','Native frame event limit too large');return {...input,limit};
}
/** Input batches are committed outbox rows only. Public data never includes source refs or graphs. */
export function projectNativeFrameEventBatches(state,playerId,input,batches){
 const controller=state.controllers.find(c=>c.playerId===playerId);requireThat(controller,'FORBIDDEN','No native controller for session');
 requireThat(input.afterRevision<=state.revision,'INVALID_REQUEST','Frame event cursor is ahead of world');
 const events=[];let nextRevision=input.afterRevision;
 for(const batch of batches){nextRevision=batch.revision;let ordinal=0;for(const event of batch.events){if(event.type!=='native.world.frame')continue;
  for(const row of event.data.effects??[]){const index=ordinal++;if(row.delivery!=='native-player'||row.recipientPlayerId!==playerId||!controller.fleetDataRefs.includes(row.recipientDataRef))continue;
   const id=createHash('sha256').update(JSON.stringify([state.id,batch.revision,index,playerId])).digest('hex');events.push({id,revision:batch.revision,dataRef:row.recipientDataRef,effect:row.effect});
  }
 }}
 return immutableJSON({scope:'native-player-frame-events',worldId:state.id,revision:state.revision,afterRevision:input.afterRevision,nextRevision,events,readyForAuthority:false});
}
