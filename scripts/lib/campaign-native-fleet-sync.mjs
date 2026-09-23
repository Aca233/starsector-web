import {createOriginalNativeFleetCounts} from '../../src/campaign/rules/OriginalNativeFleetCounts.mjs';
import {parseFactionText} from '../import-campaign-factions.mjs';
import {createOriginalFleetStats,restoreOriginalFleetStats} from '../../src/campaign/rules/OriginalNativeFleetStats.mjs';
import { captureNativeStoredMember } from './campaign-native-retail-inputs.mjs';
const check=(ok,message)=>{if(!ok)throw Error('NATIVE_FLEET_SYNC_INPUT: '+message);};
const float=(s,label)=>{const n=Math.fround(Number(s));check(s!==null&&s!==''&&Number.isFinite(n),'Missing '+label);return n;};
const bool=(s,label)=>{check(s==='true'||s==='false','Missing '+label);return s==='true';};

const scalar=(r,n,k)=>r.attr(n,k)??r.value(n,k);

const integer=(s,label)=>{const n=Number(s);check(s!==null&&s!==''&&Number.isInteger(n)&&n>=0&&n<=2147483647,'Invalid '+label);return n;};
function captureMemberStatus(g,r,node,memberRef,handles){
 if(!node)return null;const objectRef=r.ref(node);
 check(r.ref(g.child(node,'member',true))===memberRef,'Member status owner mismatch');
 if(handles.status.has(objectRef))return handles.status.get(objectRef);
 const modules=r.members(g.child(node,'status',true)).map(n=>{
  const id=r.ref(n);check(r.ref(g.child(n,'s',true))===objectRef,'Module status owner mismatch');
  if(handles.module.has(id))return handles.module.get(id);
  check(r.attr(n,'aCF')===null,'Unsupported scalar armor grid');
  const gridNode=g.child(n,'aCF'),gridWidth=integer(scalar(r,n,'gW')??'0','armor grid width'),gridHeight=integer(scalar(r,n,'gH')??'0','armor grid height');
  check(gridWidth<=4096&&gridHeight<=4096&&gridWidth*gridHeight<=1048576,'Oversized native armor grid');
  const armorCellFractions=gridNode?r.members(gridNode).map(col=>{check(!col.children.length&&['f-a','float-array'].includes(col.attributes.cl??col.name),'Unsupported armor column encoding');return col.text.trim().split('|').map(v=>float(v,'armor cell fraction'));}):null;
  if(armorCellFractions)check(armorCellFractions.length===gridWidth&&armorCellFractions.every(col=>col.length===gridHeight),'Native armor grid dimensions disagree');
  const nullableFlag=key=>{const value=scalar(r,n,key);return value===null?null:bool(value,'module '+key);};
  const result={objectRef:id,hullFraction:float(scalar(r,n,'hF'),'module hull fraction'),armorCellFractions,gridWidth,gridHeight,detached:nullableFlag('d'),permaDetached:nullableFlag('pD'),moduleSlotId:scalar(r,n,'mSI'),inactive:null,hullDamageTaken:float(scalar(r,n,'hullDamageTaken')??'0','hull damage counter'),armorDamageTaken:float(scalar(r,n,'armorDamageTaken')??'0','armor damage counter')};
  handles.module.set(id,result);return result;
 });
 check(modules.length>0,'Empty native member status');const status={objectRef,modules,hullFractions:modules.map(m=>m.hullFraction)};handles.status.set(objectRef,status);return status;
}
function captureRepairTracker(g,r,node,memberRef,events){
 const result={objectRef:node?r.ref(node):'created-repair:'+memberRef,mothballed:false,cr:Math.fround(0.5),crOverride:null,recoveryRate:0,decreaseRate:0,crPriorToMothballing:0,suspendRepairs:false,losingCR:false,crashMothballed:false,recentEvents:[],noSuppliesCRLoss:[]};
 if(!node)return result;check(r.ref(g.child(node,'m',true))===memberRef,'Repair tracker owner mismatch');
 result.cr=float(scalar(r,node,'cr'),'CR');result.crPriorToMothballing=float(scalar(r,node,'crPTM')??'0','CR prior to mothballing');
 for(const [key,alias]of [['mothballed','mo'],['suspendRepairs','sR'],['losingCR','lCR']])result[key]=bool(scalar(r,node,alias)??'false',key);
 for(const key of ['recentEvents','noSuppliesCRLoss'])result[key]=r.members(g.child(node,key)).map(n=>{
  const id=r.ref(n);if(events.has(id))return events.get(id);
  check(['CREvent','com.fs.starfarer.campaign.fleet.RepairTracker$CREvent'].includes((n.attributes.cl??n.name).replaceAll('_-','$')),'Unsupported CR event class');
  const event={objectRef:id,crAmount:float(scalar(r,n,'crAmount'),'CR event amount'),elapsed:float(scalar(r,n,'elapsed')??'0','CR event elapsed'),text:scalar(r,n,'text'),id:scalar(r,n,'id')};events.set(id,event);return event;
 });return result;
}
function captureLogisticsEnvironment(g,r,fleetNode,unresolved){
 const velocityText=scalar(r,fleetNode,'vel'),clock=g.child(g.root,'clock'),secondsText=scalar(r,clock,'secondsPerDay');
 if(velocityText===null||secondsText===null){unresolved.push('missing-native-logistics-environment');return null;}
 const velocity=velocityText.split('|').map(v=>float(v,'fleet velocity'));check(velocity.length===2,'Invalid native fleet velocity');
 const location=g.child(fleetNode,'cL'),secondsPerDay=float(secondsText,'seconds per day');check(secondsPerDay>0,'Invalid native clock day length');
 return {velocity,secondsPerDay,inHyperspace:location?bool(scalar(r,location,'hM')??'false','hyperspace mode'):false};
}

function captureInflater(g,r,node){
 if(!node)return null;const className=(node.attributes.cl??node.name).replaceAll('_-','$'),result={objectRef:r.ref(node),className,parameters:null};
 if(className==='com.fs.starfarer.api.impl.campaign.fleets.DefaultFleetInflater'){
  const p=g.child(node,'p',true),text=scalar(r,p,'averageSMods'),average=text===null?null:Number(text);check(text===null||text!==''&&Number.isInteger(average)&&average>=-2147483648&&average<=2147483647,'Invalid average S-mod count');
  result.parameters={objectRef:r.ref(p),quality:float(scalar(r,p,'quality')??'0','inflater quality'),averageSMods:average};
 }
 return result;
}

function captureBuffManager(g,r,node,memberRef,handles){
 if(!node)return {objectRef:'created-buff-manager:'+memberRef,memberRef,buffs:[]};
 check(r.ref(g.child(node,'member',true))===memberRef,'BuffManager owner mismatch');
 const buffs=r.members(g.child(node,'buffs',true)).map(b=>{
  const objectRef=r.ref(b);if(handles.has(objectRef))return handles.get(objectRef);
  const className=(b.attributes.cl??b.name).replaceAll('_-', '$');
  const tow=className==='com.fs.starfarer.api.impl.campaign.TowCable$TowCableBuff';
  const fields={'com.fs.starfarer.api.impl.campaign.terrain.CRRecoveryBuff':'mult','com.fs.starfarer.api.impl.campaign.terrain.CRLossPerSecondBuff':'mult','com.fs.starfarer.api.impl.campaign.terrain.MaxBurnBuff':'delta','com.fs.starfarer.api.impl.campaign.terrain.PeakPerformanceBuff':'mult'};
  check(tow||Object.hasOwn(fields,className),'Unported saved member buff class: '+className);
  const value={objectRef:r.ref(b),className,id:scalar(r,b,tow?'buffId':'id')};
  if(tow){const text=scalar(r,b,'frames'),n=Number(text);check(text!==null&&Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Invalid tow buff frame count');value.frames=n;}
  else{value.dur=float(scalar(r,b,'dur'),'buff duration');value[fields[className]]=float(scalar(r,b,fields[className]),'buff modifier');}
  handles.set(objectRef,value);return value;
 });
 return {objectRef:r.ref(node),memberRef,buffs};
}
export function captureFleetStats(g,r,node){
 if(!node)return null;const s=createOriginalFleetStats(r.ref(node)),known=new Map(),used=new Set();
 const target=(n,kind)=>{
  const objectRef=r.ref(n);if(known.has(objectRef)){const t=known.get(objectRef);check(t.kind===kind,'Fleet target type mismatch');return t;}
  const value=kind==='mutable'?r.stat(n):null,t={objectRef,kind,value:kind==='mutable'?value.state:r.bonus(n),temporary:value?.temporary??[]};t.descriptions={flat:{},percent:{},mult:{}};for(const [i,channel]of ['flat','percent','mult'].entries())for(const child of n.children.filter(c=>c.name===(kind==='mutable'?['fMs','pMs','mMs']:['fBs','pBs','mBs'])[i])){const mod=g.resolve(child);t.descriptions[channel][mod.attributes.s]=r.attr(mod,'d')??r.value(mod,'d');}
  known.set(objectRef,t);s.targets.push(t);return t;
 };
 for(const [key,alias]of Object.entries({accelerationMult:'aM',fuelUseHyperMult:'fUHM',fuelUseNormalMult:'fUNM',movementSpeedMod:'mSM',fleetwideMaxBurnMod:'fMBM',sensorStrengthMod:'sSM',sensorProfileMod:'sPM',sensorRangeMod:'sRM',detectedRangeMod:'dRM'})){
  const n=g.child(node,alias);if(n){const t=target(n,s[key].modifiers?'mutable':'bonus');s[key]=t.value;s.fields[key]=t.objectRef;}used.add(s.fields[key]);
 }
 const dynamic=g.child(node,'dynamic');for(const [space,kind]of [['stats','mutable'],['mods','bonus']])for(const entry of r.members(g.child(dynamic,space))){
  check(entry.name==='e'&&entry.children.length===2,'Invalid fleet dynamic map');const key=g.resolve(entry.children[0]).text.trim();check(key.length>0&&!['__proto__','prototype','constructor'].includes(key)&&!Object.hasOwn(s.dynamicRefs[space],key),'Invalid fleet dynamic key');
  const t=target(g.resolve(entry.children[1]),kind);(space==='mods'?s.dynamic:s.dynamicStats)[key]=t.value;s.dynamicRefs[space][key]=t.objectRef;used.add(t.objectRef);
 }
 for(const item of node.children.filter(c=>c.name==='tempMod')){
  const n=g.resolve(item),t={objectRef:r.ref(n),source:scalar(r,n,'source'),timeRemaining:float(scalar(r,n,'timeRemaining'),'temporary fleet duration')};
  for(const [key,kind]of [['stat','bonus'],['mStat','mutable']]){const child=g.child(n,key),handle=child?target(child,kind):null;t[key]=handle?.value??null;t[key+'Ref']=handle?.objectRef??null;if(handle)used.add(handle.objectRef);}
  s.tempMods.push(t);
 }
 s.targets=s.targets.filter(t=>used.has(t.objectRef));return restoreOriginalFleetStats(s);
}

/** Member readResolve inputs only. No saved stat cache is imported as a completed updateStats. */
export function captureNativeFleetSync(g,r,fleetNode,data){
 const syncUnresolved=[],ref=n=>n?r.ref(n):null,memberList=g.child(data,'m');if(!memberList)syncUnresolved.push('missing-or-compressed-native-member-roster');
 const buffHandles=new Map(),statusHandles={status:new Map(),module:new Map()},eventHandles=new Map();
 const members=r.members(memberList).map(node=>{
  const member=captureNativeStoredMember(g,r,node);check(member!==null,'Native fleet contains a null object rather than NULL_MEMBER');
  if(member.type==='NULL')return {...member,fleetDataRef:null,stats:null,repairTracker:null,crewComposition:null,buffManagerRef:null,buffManager:null};
  const tracker=g.child(node,'rT'),buffs=g.child(node,'buffManager'),statusNode=g.child(node,'status');
  const status=captureMemberStatus(g,r,statusNode,member.objectRef,statusHandles);
  const buffManager=captureBuffManager(g,r,buffs,member.objectRef,buffHandles);
  return {...member,id:r.attr(node,'id'),shipName:scalar(r,node,'sN'),isFlagship:bool(scalar(r,node,'iF')??'false','member flagship'),buffManager,fleetDataRef:ref(g.child(node,'fD')),captainRef:ref(g.child(node,'c')),fleetCommanderForStatsRef:null,
   stats:null,statUpdateNeeded:true,cachedStrength:-1,forceNoMoreStatsUpdates:false,status,repairTracker:captureRepairTracker(g,r,tracker,member.objectRef,eventHandles),
   crewComposition:{objectRef:'created-read-resolve-crew:'+member.objectRef,crew:100000,marines:0},buffManagerRef:buffManager.objectRef};
 });
 const stats=captureFleetStats(g,r,g.child(fleetNode,'s')),text=r.value(fleetNode,'j0'),entity=text===null?{}:parseFactionText(text,'BaseCampaignEntity.j0');
 check(entity&&typeof entity==='object'&&!Array.isArray(entity)&&(!Object.hasOwn(entity,'f5')||typeof entity.f5==='boolean'),'Invalid transponder encoding');
 const transponderOn=entity.f5??false;
 const ai=r.attr(fleetNode,'aM');if(ai===null)syncUnresolved.push('missing-native-ai-mode');
 const logistics=g.child(fleetNode,'lgst');if(logistics)check(g.child(logistics,'f',true)===fleetNode,'Logistics owner mismatch');
 const logisticsEnvironment=captureLogisticsEnvironment(g,r,fleetNode,syncUnresolved),isPlayerFleet=g.child(g.root,'playerFleet')===fleetNode;
 const nullableBool=key=>{const text=scalar(r,fleetNode,key);return text===null?null:bool(text,key);};
 const nullableFloat=key=>{const text=scalar(r,fleetNode,key);return text===null?null:float(text,key);};
 const battleNode=g.child(fleetNode,'b');if(battleNode)check((battleNode.attributes.cl??battleNode.name)==='Battle','Unsupported battle class');
 const battle=battleNode?{objectRef:ref(battleNode),memberSource:[]}:null;
 const inflater=captureInflater(g,r,g.child(fleetNode,'inflater')),inflated=nullableBool('inflated')===true,counts=createOriginalNativeFleetCounts();
 return {nativeSyncScope:'native-fleet-data-sync-inputs',stats,transponderOn,logisticsEnvironment,isPlayerFleet,counts,battle,inflater,inflated,despawning:nullableBool('fAI')===true,forceNoSensorProfileUpdate:nullableBool('forceNoSensorProfileUpdate'),sensorProfile:nullableFloat('sP'),sensorStrength:nullableFloat('sS'),syncUnresolved,attachedToCampaignFleet:true,aiMode:ai===null?null:bool(ai,'AI mode'),members,
  commanderRef:ref(g.child(data,'c')),fleetStatsRef:ref(g.child(fleetNode,'s')),logisticsRef:ref(g.child(fleetNode,'lgst')),
  membersWithoutNull:null,sortedMembersWithoutNull:null,sortedMembersWithoutNullWithFighters:null,cacheClearedOnSync:{},crewSerial:0,
  fleetwideMaxBurnMod:stats?.fleetwideMaxBurnMod??null,commanderTravelSpeedBonus:null,minCrew:null,fuelPerLightYear:null,travelSpeed:null,fleetPointsUsed:null,effectiveStrength:null};
}
