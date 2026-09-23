import R from '../data/reference-campaign-messages.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {createOriginalFader,fadeOriginalFader,forceOriginalFader,advanceOriginalFader,originalFaderIsOut} from './OriginalFader.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'INVALID_NATIVE_MESSAGE',m);
export const ORIGINAL_CAMPAIGN_MESSAGES=R;
const rgba=value=>{check(Array.isArray(value)&&value.length===4&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual message color required');return [...value];};
const text=value=>{check(typeof value==='string','Actual message text required');return value;};
export function createOriginalCampaignMessages(){return {scope:'native-campaign-message-list',rows:[]};}
/** Validate before changing the list; no sound, network or world mutation. */
export function originalCampaignMessageFromEffect(id,dataRef,effect){
 check(typeof id==='string'&&typeof dataRef==='string'&&effect,'Actual message identity required');
 if(effect.kind==='campaign-message'){check(effect.colorRole==='enemy','Actual message role required');return {id,dataRef,text:text(effect.text),color:rgba(effect.color??R.colors.enemy),icon:null,memberRef:null,extra:null,count:null,highlight:null,merge:null};}
 check(effect.kind==='repairs-complete'&&effect.colorRole==='base-player'&&effect.clickAction==='REFIT_TAB'&&effect.member&&typeof effect.member.memberRef==='string','Actual repairs message required');
 return {id,dataRef,text:text(effect.initialText),color:rgba(effect.color),icon:R.repairsIcon,memberRef:effect.member.memberRef,extra:text(effect.initialExtra),count:1,highlight:null,merge:{prefix:text(effect.mergeExtraPrefix),textPrefix:text(effect.mergedTextPrefix),textSuffix:text(effect.mergedTextSuffix)}};
}
export function addOriginalCampaignMessage(list,message){
 check(list.scope==='native-campaign-message-list'&&Array.isArray(list.rows),'Actual message list required');let merged=0;
 if(message.merge)for(const row of list.rows){if(row.extra===null||!row.extra.startsWith(message.merge.prefix))continue;const field=row.extra.split(':')[1];if(!/^[+-]?[0-9]+$/.test(field??''))continue;const n=Number(field);if(!Number.isInteger(n)||n< -2147483648||n>2147483647)continue;
  row.count=(n+1)|0;row.highlight=String(row.count);row.extra=message.merge.prefix+':'+row.count;row.text=message.merge.textPrefix+row.count+message.merge.textSuffix;row.color=[...message.color];row.memberRef=message.memberRef;row.dataRef=message.dataRef;row.elapsed=0;forceOriginalFader(row.fader,'IN');merged++;
 }
 if(merged)return {added:false,merged,sounds:merged};
 const fader=createOriginalFader(0,R.layout.fadeIn,R.layout.fadeOut);fadeOriginalFader(fader,'IN');list.rows.unshift({...message,elapsed:0,fader});return {added:true,merged:0,sounds:1};
}
/** UI clock, independent of world pause; CampaignState clamps its own dt. */
export function advanceOriginalCampaignMessages(list,seconds){
 check(Number.isFinite(seconds)&&seconds>=0,'Nonnegative message frame time required');const dt=f(Math.min(seconds,R.layout.maxFrameSeconds));
 for(const row of list.rows){advanceOriginalFader(row.fader,dt);row.elapsed=f(row.elapsed+dt);if(row.elapsed>R.layout.showDuration)fadeOriginalFader(row.fader,'OUT');}
 list.rows=list.rows.filter(row=>!originalFaderIsOut(row.fader));return list;
}
export function hoverOriginalCampaignMessageIcon(list,id){const row=list.rows.find(row=>row.id===id);if(row?.icon&&!originalFaderIsOut(row.fader))forceOriginalFader(row.fader,'IN');}
