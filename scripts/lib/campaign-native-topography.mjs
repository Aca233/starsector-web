/** Actual event stages, sector locations and sensor-array entities; no event activation is invented. */
import R from '../../src/campaign/data/reference-fleet-sync.json' with {type:'json'};
const check=(v,m)=>{if(!v)throw Error('NATIVE_TOPOGRAPHY_CAPTURE: '+m);};
const scalar=(g,r,n,key)=>r.attr(n,key)??r.value(n,key);
const int=(text,label)=>{const n=Number(text);check(text!==null&&text!==''&&Number.isInteger(n)&&n>=-2147483648&&n<=2147483647,'Invalid '+label);return n;};
function vector(node){check(node&&!node.children.length,'Actual hyperspace Vector2f required');const parts=node.text.trim().split('|');check(parts.length===2&&parts.every(s=>s.trim()!==''&&Number.isFinite(Number(s))),'Invalid position');const [x,y]=parts.map(n=>Math.fround(Number(n)));check(Number.isFinite(x)&&Number.isFinite(y),'Nonfinite position');return {x,y};}
export function captureNativeTopographyEvent(g,r,node){
 const stages=g.child(node,'stages');check(stages,'Missing topography stage list');
 return {scope:'native-hyperspace-topography-effects',objectRef:r.ref(node),progress:int(scalar(g,r,node,'progress')??'0','event progress'),stages:r.members(stages).map(n=>{
  const stage=g.child(n,'id'),id=stage?.text.trim()??null;check(id===null||R.topography.stageIds.includes(id),'Unknown native topography stage');
  if(stage)check((stage.attributes.cl??stage.name)==='com.fs.starfarer.api.impl.campaign.intel.events.ht.HyperspaceTopographyEventIntel$Stage','Unreviewed stage enum');
  return {objectRef:r.ref(n),id,progress:int(scalar(g,r,n,'progress')??'0','stage progress')};
 })};
}
export function captureNativeTopographyMarketStat(g,r,market){
 const stats=g.child(market,'stats'),mods=g.child(g.child(stats,'dynamic'),'mods');let bonus=null;
 for(const entry of r.members(mods)){check(entry.name==='e'&&entry.children.length===2,'Invalid market dynamic map');if(g.resolve(entry.children[0]).text.trim()!=='slipstream_reveal_range_ly_mod')continue;check(bonus===null,'Duplicate detection stat');const node=g.resolve(entry.children[1]);check((node.attributes.cl??node.name)==='SBonus','Detection stat must be a StatBonus');bonus={objectRef:r.ref(node),kind:'bonus',value:r.bonus(node),temporary:[],descriptions:{flat:{},percent:{},mult:{}}};
  for(const [i,channel]of ['flat','percent','mult'].entries())for(const child of node.children.filter(c=>c.name===['fBs','pBs','mBs'][i])){const mod=g.resolve(child);bonus.descriptions[channel][mod.attributes.s]=r.attr(mod,'d')??r.value(mod,'d');}
 }
 return {scope:'native-slipstream-detection-stat',statsRef:stats?r.ref(stats):'created-market-stats:'+r.ref(market),bonus};
}
export function captureNativeTopographyWorld(g,r){
 const unresolved=[],systems=g.child(g.root,'starSystems'),current=g.child(g.root,'currentLocation'),hyperspace=g.child(g.root,'hyperspace');
 if(!systems)unresolved.push('missing-registered-star-systems');if(!current||!hyperspace)unresolved.push('missing-sector-current-location');
 const typedFleets=new Set(),typedJumps=new Set();for(const node of g.objects.values()){const kind=node.attributes.cl??node.name;
  if(['CCEnt','CustomCampaignEntity'].includes(kind)){const fleet=g.child(node,'fleetForVisual');if(fleet)typedFleets.add(fleet);}
  for(const [owner,key]of [['StrategicModule','cJP'],['TacticalModule','jp']])if(kind===owner){const plan=g.child(node,key),point=g.child(plan,'point');if(point)typedJumps.add(point);}
 }
 const handles=new Map(),entityKinds=new Set(['Plnt','CampaignPlanet','CampaignTerrain','CCEnt','CustomCampaignEntity','Flt','CampaignFleet','JumpPoint','LocationToken','RingBand']);
 const rows=r.members(systems).map(node=>{check(['Sstm','StarSystem'].includes(node.attributes.cl??node.name),'Unknown registered system type');const repository=g.child(node,'o'),saved=g.child(repository,'saved');if(!repository||!saved)unresolved.push('missing-star-system-entity-repository');const seen=new Set(),sensorArrays=[];
  for(const entity of r.members(saved)){const objectRef=r.ref(entity);if(seen.has(objectRef))continue;seen.add(objectRef);const kind=entity.attributes.cl??entity.name;
   if(!entityKinds.has(kind)&&!typedFleets.has(entity)&&!typedJumps.has(entity)){unresolved.push('unclassified-system-entity:'+kind);continue;}
   const tags=r.members(g.child(entity,'tags')).map(n=>{check((n.attributes.cl??n.name)==='st','Invalid entity tag');return n.text;});if(!tags.includes('sensor_array'))continue;
   if(!handles.has(objectRef)){const faction=g.child(entity,kind==='LocationToken'?'faction':'ow');check(!faction||!faction.attributes.cl||faction.attributes.cl==='Faction','Unsupported array faction class');handles.set(objectRef,{objectRef,tags,factionRef:faction?r.ref(faction):null,factionId:faction?r.value(faction,'id',true):null});}
   sensorArrays.push(handles.get(objectRef));
  }
  return {objectRef:r.ref(node),location:vector(g.child(node,'l')),sensorArrays};
 });
 return {scope:'native-topography-world-inputs',location:current&&hyperspace?{currentLocationRef:r.ref(current),hyperspaceRef:r.ref(hyperspace)}:null,systems:systems?rows:null,unresolved:[...new Set(unresolved)]};
}
