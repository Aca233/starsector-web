/** Read-only receiver classification and PlaythroughLog readResolve data. Never instantiate saved classes. */
import { inflateSync } from 'node:zlib';
const check=(ok,message)=>{if(!ok)throw Error('NATIVE_ECONOMY_NOTIFICATIONS: '+message);};
const long=(value,label)=>{check(typeof value==='string'&&/^[+-]?\d+$/.test(value),'Invalid '+label);const n=BigInt(value);check(BigInt.asIntN(64,n)===n,'Long overflow '+label);return n.toString();};
const timestamp=value=>{const n=Number(long(value,'timestamp'));check(Number.isSafeInteger(n),'Inexact timestamp');return n;};
const stats={PLStatLevel:'level',PLStatFleet:'fleet',PLStatCredits:'credits',PLStatSupplies:'supplies',PLStatFuel:'fuel',PLStatCargo:'cargo',PLStatCrew:'crew',PLStatMarines:'marines',PLStatColonies:'colonies'};
const ignored=new Set(['com.fs.starfarer.api.impl.campaign.terrain.HyperspaceAbyssPluginImpl','com.fs.starfarer.api.impl.campaign.HullModItemManager','PlayerFleetPersonnelTracker','EncounterManager','OfficerManagerEvent','WarSimScript','com.fs.starfarer.api.impl.combat.threat.DisposableThreatFleetManager','LuddicPathBaseIntel','PirateBaseIntel','SystemBountyIntel']);
const emptySector=new Set(['CoreEventProbabilityManager','RepTrackerEvent','NearbyEventsEvent']);
function history(encoded){
 check(typeof encoded==='string'&&encoded.length<=16*1024*1024,'Playthrough history input limit');
 const text=encoded.replace(/\s/g,'');check(text.length>0&&/^[A-Za-z0-9+/=]+$/.test(text),'Invalid compressed history');
 // Native encodes each 100-byte deflate chunk separately, including its own padding.
 const chunks=[];let cursor=0;
 while(cursor<text.length){const pad=text.indexOf('=',cursor),end=pad<0?text.length:pad+(text[pad+1]==='='?2:1),part=text.slice(cursor,end);const bytes=Buffer.from(part,'base64');check(bytes.length>0&&bytes.toString('base64')===part,'Invalid Base64 chunk');chunks.push(bytes);cursor=end;}
 const bytes=Buffer.concat(chunks),decoded=inflateSync(bytes,{maxOutputLength:16*1024*1024,info:true});check(decoded.engine.bytesWritten===bytes.length,'Trailing compressed history');
 let output='';const decoder=new TextDecoder('utf-8');for(let offset=0;offset<decoded.buffer.length;offset+=100)output+=decoder.decode(decoded.buffer.subarray(offset,offset+100));const result=[];
 for(const line of output.split('\n')){
  if(line==='')continue;check(result.length<65536,'Playthrough snapshot limit');const parts=line.split('|');while(parts.at(-1)==='')parts.pop();const time=timestamp(parts.shift()),data=new Map();
  for(const part of parts){const fields=part.split(':');check(fields.length===2&&fields[0].length>0&&fields[0].length<=4096,'Invalid snapshot entry');data.set(fields[0],long(fields[1],'snapshot value'));}
  result.push({timestamp:time,data:[...data]});
 }
 return result;
}
export function captureNativeEconomyNotifications(g,r,economyListeners,monthly){
 const objects={},unresolved=[],sectorRoster=[];
 const classify=(node,channel)=>{
  const objectRef=r.ref(node),classAlias=node.attributes.cl??node.name;
  if(Object.hasOwn(objects,objectRef))return objectRef;
  const o={objectRef,classAlias,kind:'unsupported'};objects[objectRef]=o;
  if(channel==='sector'){
   if(classAlias==='CoreScript'){o.kind='core';if(objectRef!==monthly.coreRef)unresolved.push('core-shared-account-identity-mismatch');}
   else if(emptySector.has(classAlias))o.kind='native-empty-sector';
  }else if(economyListeners.objects[objectRef]?.kind==='local-resources')o.kind='local-resources';
  else if(classAlias==='PlaythroughLog'){
   o.kind='playthrough-log';const list=g.child(node,'stats');o.stats=[];
   if(list){const seen=new Set();for(const entry of r.members(list)){
    check(entry.name==='e'&&entry.children.length===2,'Invalid log stat map');const id=g.resolve(entry.children[0]).text,stat=g.resolve(entry.children[1]),alias=stat.attributes.cl??stat.name,kind=stats[alias];
    check(!seen.has(id),'Duplicate log stat');seen.add(id);if(kind!==id)unresolved.push('unsupported-playthrough-stat:'+alias);
    o.stats.push({objectRef:r.ref(stat),id,kind:kind??'unsupported',accrued:r.members(g.child(stat,'accrued')).map(n=>long(n.text,'accrued value'))});
   }}else for(const id of Object.values(stats))o.stats.push({objectRef:'read-resolve:'+objectRef+':'+id,id,kind:id,accrued:[]});
   o.data=history(r.value(node,'saved',true));
   o.retainedMetadata=node.children.filter(c=>!['stats','saved'].includes(c.name)).map(c=>{const value=g.resolve(c);return {field:c.name,objectRef:value.attributes.z?r.ref(value):null,classAlias:value.attributes.cl??value.name,scalar:value.attributes.z?null:value.text};});
  }else if(classAlias==='GalatianAcademyStipend'){
   o.kind='academy-stipend';o.startTime=timestamp(r.value(node,'startTime',true));
  }else if(ignored.has(classAlias)||['pirate-base','pather-base'].includes(economyListeners.objects[objectRef]?.kind))o.kind='not-economy-tick';
  if(o.kind==='unsupported')unresolved.push('unclassified-'+channel+'-listener:'+classAlias);
  return objectRef;
 };
 const sector=g.child(g.root,'listeners');if(!sector)unresolved.push('missing-sector-listeners');
 for(const node of r.members(sector))sectorRoster.push(classify(node,'sector'));
 // CampaignEngine.readResolve clears transientListeners; callbacks registered by later engine initialization are not imported here.
 const timed=g.child(g.root,'listenersWithTimeout'),items=timed?g.child(timed,'items'):null;
 if(!timed||!items)unresolved.push('missing-sector-timeout-roster');else if(r.members(items).length)unresolved.push('nonempty-sector-timeout-listeners-require-clock-lifecycle');
 const manager=g.child(g.root,'listenerManager'),repository=manager?g.child(manager,'listeners'):null,saved=repository?g.child(repository,'saved'):null;
 if(!saved)unresolved.push('missing-managed-listeners');else for(const node of r.members(saved))classify(node,'managed');
 const memory=g.child(g.root,'memory'),entries=memory?g.child(memory,'d'):null;let academyFlag=null;
 if(!entries)unresolved.push('missing-academy-memory');else{academyFlag={key:'$playerReceivingGAStipend',present:false,value:null};for(const entry of r.members(entries)){
  if(entry.children.length!==2||g.resolve(entry.children[0]).text!==academyFlag.key)continue;
  const value=g.resolve(entry.children[1]);check(!academyFlag.present&&['true','false'].includes(value.text),'Invalid academy memory flag');academyFlag.present=true;academyFlag.value=value.text==='true';
 }}
 return {scope:'native-saved-economy-notifications',schemaVersion:1,sectorRoster,managedRoster:economyListeners.managedRoster,objects,academyFlag,unresolved};
}
