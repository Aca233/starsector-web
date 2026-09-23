import {requireThat} from '../core/Values.mjs';
import {createOriginalCampaignMessages,originalCampaignMessageFromEffect,addOriginalCampaignMessage} from '../rules/OriginalCampaignMessages.mjs';
const check=(value,message)=>requireThat(value,'INVALID_NATIVE_MESSAGE_PAGE',message);
export function createNativeMessageStream(worldId,playerId,revision){check(typeof worldId==='string'&&typeof playerId==='string'&&Number.isSafeInteger(revision)&&revision>=0,'Actual session baseline required');return {worldId,playerId,cursor:revision,list:createOriginalCampaignMessages(),unhandled:[]};}
/** Atomically validate a whole page before advancing the cursor or changing visible rows. */
export function applyNativeMessagePage(stream,page,ownedDataRefs){
 check(page?.scope==='native-player-frame-events'&&page.worldId===stream.worldId&&Array.isArray(page.events),'Actual private message page required');
 for(const key of ['revision','afterRevision','nextRevision'])check(Number.isSafeInteger(page[key])&&page[key]>=0,'Actual page revision required');
 check(page.afterRevision<=page.nextRevision&&page.nextRevision<=page.revision,'Invalid message cursor range');
 if(page.nextRevision<=stream.cursor)return {accepted:false,added:0,merged:0,sounds:0};
 check(page.afterRevision===stream.cursor,'Message page gap or overlap');
 let previous=page.afterRevision;const ids=new Set(),messages=[],unhandled=new Set(stream.unhandled);
 for(const event of page.events){check(typeof event.id==='string'&&event.id.length>0&&!ids.has(event.id)&&ownedDataRefs.includes(event.dataRef)&&Number.isSafeInteger(event.revision)&&event.revision>page.afterRevision&&event.revision>=previous&&event.revision<=page.nextRevision,'Invalid private event identity/order');ids.add(event.id);previous=event.revision;
  const kind=event.effect?.kind;
  if(kind==='campaign-message'||kind==='repairs-complete')messages.push(originalCampaignMessageFromEffect(event.id,event.dataRef,event.effect));
  else {check(['ability-effect','accident-report'].includes(kind),'Unsupported private event type');unhandled.add(kind);}
 }
 const result={accepted:true,added:0,merged:0,sounds:0};for(const message of messages){const applied=addOriginalCampaignMessage(stream.list,message);result.added+=Number(applied.added);result.merged+=applied.merged;result.sounds+=applied.sounds;}
 stream.cursor=page.nextRevision;stream.unhandled=[...unhandled];return result;
}
