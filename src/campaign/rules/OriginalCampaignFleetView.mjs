/** CampaignFleetView/CollectionView lifecycle and native default member draw frames.
 * NativeFleetRenderer submits frames to WebGL; reached module/weapon/jitter services remain explicit. */
import {createOriginalCampaignFleetMemberView,advanceOriginalCampaignFleetMemberView,validateOriginalCampaignFleetMemberView,ORIGINAL_FLEET_VIEW_INPUTS} from './OriginalCampaignFleetMemberView.mjs';
import {renderOriginalCampaignFleetMemberView} from './OriginalCampaignFleetMemberRender.mjs';
import {createOriginalFleetDrawFrame,originalFleetDrawMask,NATIVE_FLEET_RGB_MASK,appendOriginalFleetContrailDraw} from './OriginalFleetDraw.mjs';
import {requireThat} from '../core/Values.mjs';
import {synchronizeOriginalFleet} from './OriginalFleetData.mjs';
import {fadeOriginalFader,validateOriginalFader} from './OriginalFader.mjs';
import {createOriginalCampaignContrails,advanceOriginalCampaignContrails,clearOriginalCampaignContrails,validateOriginalCampaignContrails,renderOriginalCampaignContrails} from './OriginalCampaignContrails.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_VIEW',m);
const invoke=(services,name,...args)=>{check(typeof services[name]==='function','Actual member-view service required: '+name);const value=services[name](...args);check(!value||typeof value.then!=='function','Member-view services must be synchronous');return value;};
const current=(fleet,view=fleet?.campaign?.view)=>{check(fleet?.campaign?.scope==='native-constructed-campaign-fleet','Actual CampaignFleet required');check(view?.fleetRef===fleet.objectRef,'Fleet view belongs to another fleet');return view;};
const remove=(list,item)=>{const at=list.indexOf(item);if(at>=0)list.splice(at,1);};
const order=view=>10-Math.trunc(view.shipSizeOrdinal);
const compare=(a,b)=>(order(a)-order(b))|0;
const sortedRemove=(list,view)=>{const at=list.findIndex(v=>compare(v,view)===0);if(at>=0)list.splice(at,1);};
export function createOriginalFleetView(fleetRef){const objectRef=fleetRef+':view';return {objectRef,fleetRef,lightSource:null,lightColor:null,contrails:createOriginalCampaignContrails(),shipViews:{delegateRef:objectRef,views:[],sortedViews:[],orphaned:[],notified:[],comparator:'native-render-order-int-subtraction'}};}
export function originalFleetSortedMembers(fleet,services={}){
 fleet.synchronization.onlySyncMemberLists=true;synchronizeOriginalFleet(fleet,services);fleet.synchronization.onlySyncMemberLists=false;
 check(Array.isArray(fleet.sortedMembersWithoutNull),'Actual sorted member list required');return fleet.sortedMembersWithoutNull;
}
export function originalFleetViewForMember(fleet,member,viewOverride){return current(fleet,viewOverride).shipViews.views.find(row=>row.item===member)?.view??null;}
export function originalFleetMemberViews(fleet,viewOverride){return current(fleet,viewOverride).shipViews.views.map(row=>row.view);}
export function originalFleetViewContrails(fleet,viewOverride){const view=current(fleet,viewOverride);if(view.contrails===null)view.contrails=createOriginalCampaignContrails();return view.contrails;}
export function clearOriginalFleetView(fleet,viewOverride){
 const view=current(fleet,viewOverride);for(const k of ['orphaned','notified','views','sortedViews'])view.shipViews[k].length=0;
 if(view.contrails!==null){clearOriginalCampaignContrails(view.contrails);view.contrails=null;}
}
function memberIdentity(view,fleet,member){check(view&&view.fleet===fleet&&view.member===member,'Member view must retain actual fleet/member identity');validateOriginalFader(view.fader);check(Number.isInteger(view.shipSizeOrdinal)&&view.shipSizeOrdinal>=0&&view.shipSizeOrdinal<=5,'Actual HullSize ordinal required');}
export function advanceOriginalFleetView(fleet,seconds,context,globalRandom,services={},viewOverride){
 check(Number.isFinite(seconds)&&Number.isFinite(f(seconds)),'Finite fleet-view dt required');seconds=f(seconds);const view=current(fleet,viewOverride),collection=view.shipViews;
 const sorted=()=>services.readSortedFleetViewMembers?invoke(services,'readSortedFleetViewMembers',fleet):originalFleetSortedMembers(fleet,services);
 const members=sorted(),skip=Math.max(0,sorted().length-20),selected=[];
 for(let i=0;i<members.length;i++){selected.push(members[i]);if(i===7)i+=skip;}
 for(const member of selected){
  if(!collection.views.some(row=>row.item===member)){
   const child=services.createFleetMemberView?invoke(services,'createFleetMemberView',fleet,member,context,globalRandom):createOriginalCampaignFleetMemberView(fleet,member,context,globalRandom,services);memberIdentity(child,fleet,member);collection.views.push({item:member,view:child});
   if(!collection.sortedViews.some(v=>compare(v,child)===0)){collection.sortedViews.push(child);collection.sortedViews.sort(compare);}
  }
  remove(collection.orphaned,member);
 }
 // Native HashSet notification order is irrelevant to these independent fadeOut calls.
 // No plugin callbacks are reordered; the actual member advance order below is LinkedHashMap order.
 for(const member of collection.orphaned){const child=collection.views.find(row=>row.item===member)?.view;if(!child||collection.notified.includes(child))continue;fadeOriginalFader(child.fader,'OUT');collection.notified.push(child);}
 for(let i=0;i<collection.views.length;){const child=collection.views[i].view;if(child.fader.state==='IDLE'&&child.fader.currBrightness===0){remove(collection.notified,child);collection.views.splice(i,1);sortedRemove(collection.sortedViews,child);}else i++;}
 collection.orphaned.length=0;for(const row of collection.views)collection.orphaned.push(row.item);
 for(const row of collection.views){if(services.advanceFleetMemberView)invoke(services,'advanceFleetMemberView',row.view,seconds,view,context,globalRandom);else advanceOriginalCampaignFleetMemberView(row.view,seconds,view,context,globalRandom,services);}
 if(view.contrails!==null)advanceOriginalCampaignContrails(view.contrails,seconds);
 return {selectedMembers:selected,visibleViews:collection.views.length};
}
/** Render-time origin/light writes belong here, NOT in advance. */
export function renderOriginalFleetView(fleet,alpha,services={},viewOverride){
 const view=current(fleet,viewOverride),facing=fleet.facing,useLight=view.lightSource!==null,frame=createOriginalFleetDrawFrame(fleet.position);originalFleetDrawMask(frame,NATIVE_FLEET_RGB_MASK);let angle=0,lightMult=1;
 if(useLight){const p=invoke(services,'readFleetViewLightPosition',view.lightSource),dx=f(p[0]-fleet.position[0]),dy=f(p[1]-fleet.position[1]);angle=f(f(Math.atan2(dy,dx))*f(57.295784));const distance=f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));if(distance<500)lightMult=f(distance/500);}
 const renderServices={...services,readMemberViewLightSource:()=>view.lightSource};
 for(const {view:child} of view.shipViews.views){child.originLoc[0]=0;child.originLoc[1]=0;child.originFacing=facing;child.useLight=useLight;if(services.renderFleetMemberView)invoke(services,'renderFleetMemberView',child,angle,view.lightColor,alpha,lightMult,frame);else renderOriginalCampaignFleetMemberView(child,angle,view.lightColor,alpha,lightMult,renderServices,frame);}
 return frame;
}
export function renderOriginalFleetViewContrails(fleet,alpha=1,viewOverride){const c=current(fleet,viewOverride).contrails;return c===null?{scope:'native-campaign-contrail-quad-strips',strips:[]}:renderOriginalCampaignContrails(c,alpha);}
/** Caller supplies the native sensor/contact-adjusted alpha. Draw order matches Fleet.render. */
export function renderOriginalFleetGraphics(fleet,alpha,services={},viewOverride){
 const frame=createOriginalFleetDrawFrame(fleet.position);originalFleetDrawMask(frame,NATIVE_FLEET_RGB_MASK);
 const trails=renderOriginalFleetViewContrails(fleet,alpha,viewOverride);appendOriginalFleetContrailDraw(frame,trails,p=>ORIGINAL_FLEET_VIEW_INPUTS.textures[p]??invoke(services,'readMemberViewTexture',p));
 const ships=renderOriginalFleetView(fleet,alpha,services,viewOverride);frame.commands.push(...ships.commands);return frame;
}
export function validateOriginalFleetView(fleet,viewOverride){
 const view=current(fleet,viewOverride),c=view.shipViews;check(view.fleetRef===fleet.objectRef&&c.delegateRef===view.objectRef&&c.comparator==='native-render-order-int-subtraction','Lost FleetView/delegate identity');
 for(const k of ['views','sortedViews','orphaned','notified'])check(Array.isArray(c[k]),'Invalid CollectionView '+k);
 const members=new Set(),children=new Set();for(const row of c.views){check(row&&!members.has(row.item)&&!children.has(row.view),'Duplicate collection identity');memberIdentity(row.view,fleet,row.item);if(row.view.scope==='native-campaign-fleet-member-view')validateOriginalCampaignFleetMemberView(row.view);members.add(row.item);children.add(row.view);}
 for(const k of ['orphaned','notified']){check(new Set(c[k]).size===c[k].length,'Invalid set identity');for(const value of c[k])check((k==='orphaned'?members:children).has(value),'Lost collection set identity');}
 for(let i=0;i<c.sortedViews.length;i++){check(children.has(c.sortedViews[i]),'Lost sorted view identity');if(i>0)check(compare(c.sortedViews[i-1],c.sortedViews[i])<0,'Invalid native TreeSet order');}
 if(view.contrails!==null)validateOriginalCampaignContrails(view.contrails);return view;
}
