/** IntelManager's ordered IntelInfoPlugin views, not a general Java ObjectRepository port.
 * Message intents are server-private pending presentation, never proof of UI/audio delivery. */
import {requireThat} from '../core/Values.mjs';
const check=(ok,message)=>requireThat(ok,'UNSUPPORTED_NATIVE_INTEL_MANAGER',message);
const object=item=>{check(item&&typeof item==='object'&&typeof item.objectRef==='string'&&item.objectRef.length>0,'Actual intel plugin identity required');return item;};
const bool=value=>{check(typeof value==='boolean','Actual intel Boolean result required');return value;};
const call=(services,name,...args)=>{check(typeof services[name]==='function','Actual intel plugin service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Intel services must be synchronous');return value;};
const remove=(list,item)=>{const at=list.indexOf(item);if(at<0)return false;list.splice(at,1);return true;};
const counter=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value);
/** Only for a genuinely new manager. Unknown saved queues must not be synthesized. */
export function createOriginalIntelManager(){return {scope:'native-intel-manager',commQueue:[],intel:[],messageIntents:[],nextMessageSequence:'1',nextSummaryIdentity:'1'};}
export function validateOriginalIntelManager(state,related=[]){
 check(state?.scope==='native-intel-manager','Actual intel manager state required');const identities=new Map();
 const identity=item=>{object(item);check(!identities.has(item.objectRef)||identities.get(item.objectRef)===item,'Lost shared intel identity');identities.set(item.objectRef,item);};
 for(const key of ['commQueue','intel']){const list=state[key];check(Array.isArray(list)&&new Set(list).size===list.length,'Actual deduplicated ordered intel view required: '+key);list.forEach(identity);}
 check(counter(state.nextMessageSequence)&&counter(state.nextSummaryIdentity)&&Array.isArray(state.messageIntents),'Actual persistent message-intent sequence required');let previous=0n;
 for(const intent of state.messageIntents){check(intent?.scope==='native-intel-message-intent'&&counter(intent.sequence)&&BigInt(intent.sequence)>previous&&BigInt(intent.sequence)<BigInt(state.nextMessageSequence)&&intent.action==='INTEL_TAB','Invalid pending intel message intent');identity(intent.item);check(intent.target===intent.item||intent.target==='New','Lost message click-target identity');previous=BigInt(intent.sequence);}
 for(const item of related)identity(item);return state;
}
export function enqueueOriginalIntelMessageIntent(state,item,target){object(item);check(target===item||target==='New','Actual intel message click target required');const intent={scope:'native-intel-message-intent',sequence:state.nextMessageSequence,item,action:'INTEL_TAB',target};state.nextMessageSequence=String(BigInt(state.nextMessageSequence)+1n);state.messageIntents.push(intent);return intent;}
export function unqueueOriginalIntel(state,item){return remove(state.commQueue,item);}
/** The stock delay argument is intentionally unused. Requeue moves an existing item to the tail. */
export function queueOriginalIntel(state,item,_delay=3.4028234663852886e38){object(item);unqueueOriginalIntel(state,item);state.commQueue.push(item);}
export function addOriginalIntel(state,item,silent=false,textPanel=null,services){
 object(item);bool(silent);if(bool(call(services,'isIntelEnded',item)))return;
 if(!state.intel.includes(item)){
  call(services,'setIntelTimestamp',item,call(services,'readIntelClockTimestamp'));state.intel.push(item);call(services,'reportIntelMadeVisible',item);
  if(!silent){if(textPanel===null&&bool(call(services,'autoAddIntelCampaignMessage',item)))call(services,'addIntelCampaignMessage',item,item);else if(textPanel!==null)call(services,'addIntelToTextPanel',item,textPanel);}
 }
}
export function removeOriginalIntel(state,item,services){const removed=remove(state.intel,item),unqueued=unqueueOriginalIntel(state,item);if(removed||unqueued)call(services,'reportIntelRemoved',item);}
export function clearOriginalIntelManager(state){state.commQueue.length=0;state.intel.length=0;}
export function notifyOriginalIntelScreenOpening(state,services){for(const item of [...state.intel])call(services,'notifyIntelScreenOpening',item);for(const item of [...state.commQueue])call(services,'notifyIntelScreenOpening',item);}
export function removeOriginalExpiredIntel(state,services){for(const item of [...state.intel])if(bool(call(services,'shouldRemoveIntel',item)))removeOriginalIntel(state,item,services);for(const item of [...state.commQueue])if(bool(call(services,'shouldRemoveIntel',item)))removeOriginalIntel(state,item,services);}
export function advanceOriginalIntelManager(state,_seconds,context,services){
 if(bool(context.paused)||context.playerFleet===null)return;
 const inRelay=bool(call(services,'isPlayerInIntelRelayRange',context.playerFleet)),visible=[];
 for(const item of [...state.commQueue]){const can=bool(call(services,'canMakeIntelVisible',item,inRelay))||bool(call(services,'forceAddIntelNextFrame',item));if(can&&!state.intel.includes(item))visible.push(item);}
 if(visible.length){const aggregate=visible.length>4;let index=0;
  for(const item of visible){addOriginalIntel(state,item,index>=3&&aggregate,null,services);call(services,'setIntelForceAddNextFrame',item,false);index++;while(remove(state.commQueue,item)){/* also removes requeues made by callbacks */}}
  if(aggregate)call(services,'addIntelCampaignMessage',call(services,'createNewMessagesIntel',visible.length-3),'New');
 }
 removeOriginalExpiredIntel(state,services);
}
