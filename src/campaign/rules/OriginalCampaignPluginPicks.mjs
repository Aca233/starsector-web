/** ModAndPluginData's CampaignPlugin list and priority picks. This is NOT GenericPluginManager. */
import {requireThat,jsonCopy} from '../core/Values.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CAMPAIGN_PLUGIN',m);
export const ORIGINAL_CAMPAIGN_PICK_PRIORITIES=Object.freeze(['CORE_GENERAL','MOD_GENERAL','CORE_SET','MOD_SET','CORE_SPECIFIC','MOD_SPECIFIC','HIGHEST']);
export function createOriginalCampaignPluginRegistry(){return {scope:'native-campaign-plugin-registry',plugins:[],revision:0};}
function plugin(p){check(p&&typeof p.objectRef==='string'&&p.objectRef.length>0&&typeof p.classId==='string'&&p.classId.length>0&&(p.id===null||typeof p.id==='string')&&typeof p.transient==='boolean'&&Object.hasOwn(p,'data'),'Actual CampaignPlugin descriptor required');jsonCopy(p.data);return p;}
export function validateOriginalCampaignPluginRegistry(state){check(state?.scope==='native-campaign-plugin-registry'&&Array.isArray(state.plugins)&&state.plugins.length<=4096&&Number.isSafeInteger(state.revision)&&state.revision>=0,'Actual CampaignPlugin registration history required');const refs=new Map();for(const p of state.plugins){plugin(p);check(!refs.has(p.objectRef)||refs.get(p.objectRef)===p,'Split CampaignPlugin object identity');refs.set(p.objectRef,p);}return state;}
export function createOriginalCoreCampaignPlugin(objectRef){return plugin({objectRef,classId:'com.fs.starfarer.api.impl.campaign.CoreCampaignPluginImpl',id:'coreCampaignPluginImpl',transient:false,data:null});}
export function removeOriginalCampaignPlugin(state,id){validateOriginalCampaignPluginRegistry(state);check(id===null||typeof id==='string','Actual nullable CampaignPlugin ID required');const at=state.plugins.findIndex(p=>p.id!==null&&p.id===id);if(at>=0){state.plugins.splice(at,1);state.revision++;}}
export function addOriginalCampaignPlugin(state,p){validateOriginalCampaignPluginRegistry(state);plugin(p);check(state.plugins.length<4096&&state.revision<Number.MAX_SAFE_INTEGER-2,'CampaignPlugin work limit');for(const current of state.plugins)check(current.objectRef!==p.objectRef||current===p,'Split CampaignPlugin object identity');if(p.id!==null)removeOriginalCampaignPlugin(state,p.id);state.plugins.push(p);state.revision++;}
function call(s,k,...args){check(typeof s?.[k]==='function','Actual CampaignPlugin service required: '+k);const v=s[k](...args);check(!v||typeof v.then!=='function','CampaignPlugin calls must be synchronous');return v;}
export function pickOriginalCampaignPlugin(state,hook,args,services={}){
 validateOriginalCampaignPluginRegistry(state);const picks=[],revision=state.revision,roster=[...state.plugins];
 for(const p of roster){let pick;
  if(p.classId==='com.fs.starfarer.api.impl.campaign.CoreCampaignPluginImpl'&&!Object.hasOwn(services,'readCampaignPluginPick')){
   if(['navigation','assignment','strategic','tactical'].includes(hook))pick=null; // inherited BaseCampaignPlugin methods
   else if(hook==='fleetInflater')pick=args.params?.className==='com.fs.starfarer.api.impl.campaign.fleets.DefaultFleetInflaterParams'?{plugin:call(services,'createCampaignDefaultInflater',args.fleet,args.params),priority:'CORE_GENERAL'}:null;
   else check(false,'Unported CoreCampaignPlugin hook: '+hook);
  }else pick=call(services,'readCampaignPluginPick',p,hook,args);
  check(state.revision===revision&&state.plugins.length===roster.length&&state.plugins.every((entry,i)=>entry===roster[i]),'CampaignPlugin roster changed during native iterator');
  check(pick===null||pick&&typeof pick==='object'&&Object.hasOwn(pick,'plugin'),'Actual PluginPick or known null required');if(pick!==null)picks.push(pick);
 }
 if(!picks.length)return null;if(picks.length===1)return picks[0].plugin;
 for(const pick of picks)check(ORIGINAL_CAMPAIGN_PICK_PRIORITIES.includes(pick.priority),'Actual PickPriority enum required');
 // Java's stable sort then get(last), not GenericPluginManager's first-wins rule.
 picks.sort((a,b)=>ORIGINAL_CAMPAIGN_PICK_PRIORITIES.indexOf(a.priority)-ORIGINAL_CAMPAIGN_PICK_PRIORITIES.indexOf(b.priority));return picks.at(-1).plugin;
}
