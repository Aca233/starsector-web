import { captureNativeResourceCargo } from './campaign-native-retail-inputs.mjs';
/** Read-only MonthlyReport import. Never instantiate XStream classes or follow FDNode.parent backlinks. */
const check=(ok,message)=>{if(!ok)throw Error('NATIVE_MONTHLY_REPORT_INPUT: '+message);};
const number=(text,label)=>{check(typeof text==='string'&&text.trim()!==''&&Number.isFinite(Number(text)),'Missing/invalid '+label);const n=Math.fround(Number(text));check(Number.isFinite(n),'Float overflow '+label);return n;};
const integer=(text,label)=>{const n=Number(text);check(text!==null&&text!==''&&Number.isSafeInteger(n),'Invalid '+label);return n;};
export function captureNativeMonthlyReports(g,r){
 const unresolved=[],persistent=g.child(g.child(g.root,'modAndPluginData'),'persistentData');
 const missing=reason=>({scope:'native-saved-monthly-accounts',state:null,sharedRef:null,coreRef:null,unresolved:[reason]});
 if(!persistent)return missing('persistent-data-not-captured');
 let shared=null;
 for(const entry of r.members(persistent)){
  check(entry.name==='e'&&entry.children.length===2,'Invalid persistent entry');const key=g.resolve(entry.children[0]);
  if(key.text==='core_CEFSSharedDataKey'){check(shared===null,'Duplicate shared account state');shared=g.resolve(entry.children[1]);}
 }
 if(!shared||shared.name==='null')return missing('shared-data-not-created');
 check((shared.attributes.cl??shared.name)==='SharedData','Unsupported shared account class');
 const cores=r.members(g.child(g.root,'listeners')).filter(n=>(n.attributes.cl??n.name)==='CoreScript');
 if(cores.length!==1||g.child(cores[0],'shared')!==shared)unresolved.push('core-script-shared-reference-not-resolved');
 const fleet=g.child(g.root,'playerFleet'),data=g.child(fleet,'fD'),cargo=g.child(data,'cargo'),credits=g.child(cargo,'c');
 if(!credits)return missing('player-credit-object-not-captured');
 const metadataObjects=new Map();
 const metadata=node=>{
  if(!node||node.name==='null')return null;
  const type=node.attributes.cl??node.name;
  if(type==='float'||type==='java.lang.Float')return {kind:'float',value:number(node.text,'report quantity')};
  if(type==='CargoData'){const ref=r.ref(node);if(!metadataObjects.has(ref))metadataObjects.set(ref,{kind:'resource-cargo',objectRef:ref,value:captureNativeResourceCargo(g,r,node)});return metadataObjects.get(ref);}
  if(type==='st'||!node.children.length&&!node.attributes.z)return {kind:'string',value:node.text};
  return {kind:'reference',objectRef:r.ref(node),classAlias:type};
 };
 const nodes=new Map(),reports=new Map();let count=0;
 const parseNode=(raw,parent,depth)=>{
  check(raw&&depth<=48&&++count<=20000,'Report tree limit');check(g.child(raw,'p')===parent,'Report parent does not match ordered tree');
  const ref=r.ref(raw);check(!nodes.has(ref),'Shared/cyclic report node');
  const children=g.child(raw,'c'),result={objectRef:ref,name:r.attr(raw,'n'),icon:r.attr(raw,'i'),income:number(r.attr(raw,'in'),'node income'),upkeep:number(r.attr(raw,'up'),'node upkeep'),totalIncome:number(r.attr(raw,'tI'),'cached total income'),totalUpkeep:number(r.attr(raw,'tU'),'cached total upkeep'),
   custom:metadata(g.child(raw,'c1')),custom2:metadata(g.child(raw,'c2')),mapEntity:metadata(g.child(raw,'mE')),tooltipCreator:metadata(g.child(raw,'tC')),tooltipParam:metadata(g.child(raw,'tP')),children:children?[]:null,
   retainedMetadata:Object.fromEntries(raw.children.filter(c=>!['c','p','c1','c2','mE','tC','tP'].includes(c.name)).map(c=>[c.name,metadata(g.resolve(c))]))};
  nodes.set(ref,result);const keys=new Set();
  for(const entry of r.members(children)){
   check(entry.name==='e'&&entry.children.length===2,'Invalid ordered report child');const key=g.resolve(entry.children[0]);check((key.attributes.cl??key.name)==='st'&&!keys.has(key.text),'Invalid/duplicate report child key');keys.add(key.text);
   result.children.push([key.text,parseNode(g.resolve(entry.children[1]),raw,depth+1)]);
  }
  return result;
 };
 const parseReport=raw=>{
  if(!raw||raw.name==='null')return null;const ref=r.ref(raw);if(reports.has(ref))return reports.get(ref);
  const result={objectRef:ref,root:parseNode(g.child(raw,'root',true),null,0),timestamp:integer(r.value(raw,'timestamp',true),'report timestamp'),debt:integer(r.value(raw,'debt',true),'debt'),previousDebt:integer(r.value(raw,'previousDebt',true),'previous debt'),monthlyReportTooltip:metadata(g.child(raw,'monthlyReportTooltip'))};reports.set(ref,result);return result;
 };
 const state={scope:'native-core-monthly-accounts',schemaVersion:1,serial:0,current:parseReport(g.child(shared,'currentReport')),previous:parseReport(g.child(shared,'previousReport')),credits:{objectRef:r.ref(credits),value:number(r.value(credits,'value',true),'player credits')},messages:[]};
 const memory=g.child(g.root,'memory'),memoryData=g.child(memory,'d');
 const tutorialInProgress=memoryData?r.members(memoryData).some(e=>e.children.length===2&&g.resolve(e.children[0]).text==='$tutorialRespawn'):null;
 const playerFaction=g.child(g.child(g.root,'factionManager'),'playerFaction'),production=g.child(playerFaction,'production'),gathering=production?g.child(production,'gatheringPoint'):null;
 const runtimeEvidence={tutorialInProgress,playerProduction:production?{objectRef:r.ref(production),gatheringPointRef:gathering?r.ref(gathering):null}:null};
 return {scope:'native-saved-monthly-accounts',sharedRef:r.ref(shared),coreRef:cores.length===1?r.ref(cores[0]):null,state,runtimeEvidence,unresolved};
}
