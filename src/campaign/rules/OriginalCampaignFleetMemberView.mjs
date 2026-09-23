/** Native CampaignFleetMemberView construction + advance. Rendering lives in MemberRender/FleetDraw.
 * Host-provided seeds and resource services remain replaceable for modified rulesets. */
import {ORIGINAL_FLEET_VIEW_INPUTS,createOriginalMemberViewSprite as sprite} from './OriginalMemberViewResources.mjs';
import {createOriginalMemberViewModules} from './OriginalMemberViewModules.mjs';
import {createOriginalJitterRenderer,updateOriginalJitterSeed,validateOriginalJitterRenderer} from './OriginalJitterRenderer.mjs';
import {canonicalJSON,requireThat} from '../core/Values.mjs';
import {createOriginalFader,fadeOriginalFader,advanceOriginalFader,originalFaderIsOut,validateOriginalFader} from './OriginalFader.mjs';
import {createOriginalSmoothMovement,advanceOriginalSmoothMovement,createOriginalSmoothFacing,advanceOriginalSmoothFacing,getOriginalMovementFacing} from './OriginalMovement.mjs';
import {originalJavaNextDouble} from './OriginalJavaRandom.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
import {synchronizeOriginalFleet,updateOriginalFleetTravelSpeed} from './OriginalFleetData.mjs';
import {resolveOriginalEconomyMutable} from './OriginalMarketEconomy.mjs';
import {createOriginalViewShifter,advanceOriginalViewShifter,validateOriginalViewShifter} from './OriginalFleetViewShifters.mjs';
import {originalFighterFormationOffset} from './OriginalFighterFormation.mjs';
import {createOriginalCampaignContrails,getOriginalCampaignContrail,initOriginalCampaignContrail,updateOriginalCampaignContrail,addOriginalCampaignContrailPoint} from './OriginalCampaignContrails.mjs';
export {ORIGINAL_FLEET_VIEW_INPUTS};
const R=ORIGINAL_FLEET_VIEW_INPUTS,f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MEMBER_VIEW',m);
const num=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Actual finite view input required');return f(n);};
const invoke=(services,name,...args)=>{check(typeof services[name]==='function','Actual member-view service required: '+name);const v=services[name](...args);check(!v||typeof v.then!=='function','Member-view services must be synchronous');return v;};
const current=v=>{check(v?.scope==='native-campaign-fleet-member-view','Actual native CampaignFleetMemberView required');return v;};
const sizes=['DEFAULT','FIGHTER','FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP'];
const length=v=>f(Math.sqrt(f(f(v[0]*v[0])+f(v[1]*v[1])))),distance=(a,b)=>length([f(a[0]-b[0]),f(a[1]-b[1])]);
const angle=a=>f(f(a%360)+360)%360,unit=a=>{const rad=f(a*f(f(Math.PI)/180));return [f(Math.cos(rad)),f(Math.sin(rad))];};
function rotate(v,a){const [cos,sin]=unit(a);return [f(f(v[0]*cos)-f(v[1]*sin)),f(f(v[0]*sin)+f(v[1]*cos))];}
const set=(target,source)=>{target[0]=source[0];target[1]=source[1];};
const sizeNum=size=>({CAPITAL_SHIP:5,CRUISER:3,DESTROYER:2})[size]??1;
const hull=member=>{const h=R.hulls[member.variant?.hullId];check(h,'Actual current hull-view input required: '+member.variant?.hullId);return h;};
const wing=member=>{const w=R.wings[member.specId];check(w&&w.numFighters<=10&&w.numFighters>=0,'Actual wing formation within native fixed array required');return w;};
function makeSprite(v,h,services){
 const member=v.member;check(Object.hasOwn(member,'spriteOverride')&&Object.hasOwn(member,'overrideSpriteSize'),'Actual member sprite override state required');
 const icon=sprite(member.spriteOverride??h.sprite.path,services);
 if(member.spriteOverride!==null){if(member.overrideSpriteSize!==null){v.scaleMult=1;icon.width=num(member.overrideSpriteSize[0]);icon.height=num(member.overrideSpriteSize[1]);}}
 else{icon.width=f(h.sprite.width*v.scaleMult);icon.height=f(h.sprite.height*v.scaleMult);icon.centerX=f(h.sprite.center[0]*v.scaleMult);icon.centerY=f(h.sprite.center[1]*v.scaleMult);}
 return icon;
}
function setupSprites(v,h,services,createIcons=true){
 v.sprite=makeSprite(v,h,services);const modules=v.member.variant.effects?.stationModules;check(Array.isArray(modules),'Actual variant module roster required');let size=h.sprite;v.moduleIcons=[];
 if(modules.length){const input=services.readMemberViewModules?invoke(services,'readMemberViewModules',v.member,v.scaleMult,createIcons):createOriginalMemberViewModules(v.member,services,createIcons);check(input&&Array.isArray(input.icons)&&input.size,'Actual module icons and sizeWithModules required');if(createIcons)v.moduleIcons=input.icons;size=input.size;}
 const shadowSize=f(Math.max(f(num(size.width)*v.scaleMult),f(num(size.height)*v.scaleMult))*(h.station?2:f(1.7)));
 v.shadowMask=sprite(R.assets.shadow,services);v.shadowMask.width=shadowSize;v.shadowMask.height=shadowSize;v.windEffect=sprite(R.assets.wind,services);
}
export function regenerateOriginalMemberViewOffset(view,random){
 const v=current(view);if(v.offsetOverridden)return;const h=hull(v.member),counts=v.fleet.counts;check(counts,'Actual fleet size counts required');
 const largest=sizeNum(counts.largestShipSize),own=sizeNum(h.hullSize);let radius=f(f(f(f(f(largest-own)/largest)*.5)+.5)*originalFleetSensorRadius(v.fleet));
 if(counts.isOnlyOneLargestShip&&counts.largestShipSize===h.hullSize)radius=0;
 const next=v.prevAngle===-1?f(f(originalJavaNextDouble(random))*360):f(f(v.prevAngle+120)+f(f(originalJavaNextDouble(random))*120));
 const radial=f(f(Math.sqrt(originalJavaNextDouble(random)))*radius),u=unit(next);set(v.desiredOffset,[f(u[0]*radial),f(u[1]*radial)]);v.prevAngle=angle(next);
}
function engineGlow(member,h,scale,services){
 const glow={member,scaleMult:scale,lengthMult:{base:1,modifiers:{flat:[],percent:[],mult:[]}},slots:[],clusters:[],accelFader:createOriginalFader(0,.5),fullFader:createOriginalFader(0,1),color:[255,255,255,255],contrailColor:[255,255,255,255],texture:R.textures[R.assets.engine],hitGlow:sprite(R.assets.hitGlow,services)};
 glow.hitGlow.blendDest=1;
 if(h.engines.length){glow.color=h.engines[0].color;if(h.hullStyle.engineGlowColor!==null)glow.color=h.hullStyle.engineGlowColor;glow.contrailColor=h.engines[0].contrailColor;if(h.hullStyle.engineTrailColor!==null)glow.color=h.hullStyle.engineTrailColor;glow.hitGlow.color=glow.color;
  for(const engine of h.engines){if(engine.skip)continue;glow.slots.push({angle:engine.angle,baseLength:f(engine.length*scale),glowSize:f(f(engine.length*scale)*(h.hullSize==='FIGHTER'?1:.75)),width:Math.max(1,f(engine.width*scale)),weight:1,offset:engine.offset.map(n=>f(n*scale))});}
  glow.slots.sort((a,b)=>Math.sign(f(b.width-a.width)));
 }
 if(glow.slots.length){const c={angle:180,baseLength:0,glowSize:0,width:0,weight:1,offset:[0,0]};let total=0;for(const slot of [...glow.slots].sort((a,b)=>Math.sign(f(b.offset[1]-a.offset[1])))){c.baseLength=f(c.baseLength+f(slot.baseLength*slot.width));c.glowSize=f(c.glowSize+f(slot.glowSize*slot.width));for(let i=0;i<2;i++)c.offset[i]=f(c.offset[i]+f(slot.offset[i]*slot.width));total=f(total+slot.width);c.width=Math.max(c.width,slot.width);}c.baseLength=f(c.baseLength/total);c.glowSize=f(c.glowSize/total);c.offset=c.offset.map(n=>f(n/total));glow.clusters.push(c);}
 return glow;
}
const shifters=['engineColor','engineWidthMult','engineHeightMult','engineGlowColor','engineGlowSizeMult','contrailColor','contrailWidthMult','contrailDurMult','glowColor','windEffectDirX','windEffectDirY','windEffectColor'];
export function createOriginalCampaignFleetMemberView(fleet,member,context,random,services={}){
 check(fleet?.campaign?.scope==='native-constructed-campaign-fleet'&&member.type!=='NULL','Actual fleet/member required');const h=hull(member),params={CAPITAL_SHIP:[h.station?0.1:0.07,6,40],CRUISER:[.08,8,60],DESTROYER:[.09,10,80],FRIGATE:[.11,14,120],FIGHTER:[.15,15,200],DEFAULT:[.1,6,60]}[h.hullSize];check(params,'Actual native HullSize required');
 const v={scope:'native-campaign-fleet-member-view',fleet,member,fader:createOriginalFader(0,1,1.5),originLoc:[0,0],originFacing:0,desiredOffset:[0,0],turnRate:0,maxTurnRate:params[2],moveSpeed:params[1],scaleMult:f(params[0]),shipSizeOrdinal:sizes.indexOf(h.hullSize),formation:null,desiredFighterOffsets:null,fighterMovement:null,facing:0,jitterFader:null,jitterCopies:10,maxJitterRange:10,jitterColor:[255,255,255,255],jr:null,prevAngle:-1,zero:[0,0],offsetOverridden:false,useLight:false,extraAlphaMult:1,windOffset:0};fadeOriginalFader(v.fader,'IN');
 // Initial sprite overrides can change scale BEFORE engine construction and formation.
 setupSprites(v,h,services,false);regenerateOriginalMemberViewOffset(v,random);v.engineGlow=engineGlow(member,h,v.scaleMult,services);
 if(member.type==='FIGHTER_WING'){const w=wing(member),spacing=f(f(h.sprite.collisionRadius*4)*v.scaleMult),origin=[f(v.originLoc[0]+v.desiredOffset[0]),f(v.originLoc[1]+v.desiredOffset[1])];v.formation={type:w.formation};v.desiredFighterOffsets=Array(10).fill(null);v.fighterMovement=Array(10).fill(null);for(let i=0;i<w.numFighters;i++){v.fighterMovement[i]=createOriginalSmoothMovement(v.moveSpeed,f(v.moveSpeed*1.25));v.desiredFighterOffsets[i]=originalFighterFormationOffset(w.formation,origin,v.facing,spacing,spacing,i);set(v.fighterMovement[i].position,v.desiredFighterOffsets[i]);}}
 v.movementModule=createOriginalSmoothMovement(f(v.moveSpeed*.5),v.moveSpeed);set(v.movementModule.position,v.desiredOffset);v.facingModule=createOriginalSmoothFacing(f(v.maxTurnRate*.5),v.maxTurnRate);v.facingModule.facing=fleet.facing;
 for(const k of shifters){let base=1;if(k==='engineColor'||k==='engineGlowColor')base=v.engineGlow.color;else if(k==='contrailColor')base=v.engineGlow.contrailColor;else if(k==='glowColor'||k==='windEffectColor')base=[0,0,0,0];else if(k==='windEffectDirX'||k==='windEffectDirY')base=0;v[k]=createOriginalViewShifter(base);}
 // readResolve repeats sprite/module construction but does not invoke engineGlow.readResolve.
 setupSprites(v,h,services);return v;
}
function formationOrigin(v){return [f(v.originLoc[0]+v.movementModule.position[0]),f(v.originLoc[1]+v.movementModule.position[1])];}
export function overrideOriginalMemberViewOffset(view,x,y){const v=current(view);set(v.desiredOffset,[num(x),num(y)]);set(v.movementModule.position,v.desiredOffset);if(v.member.type==='FIGHTER_WING'){const h=hull(v.member),w=wing(v.member),spacing=f(f(h.sprite.collisionRadius*4)*v.scaleMult),origin=formationOrigin(v);for(let i=1;i<w.numFighters;i++){v.desiredFighterOffsets[i]=originalFighterFormationOffset(v.formation.type,origin,v.facing,spacing,spacing,i);set(v.fighterMovement[i].position,v.desiredFighterOffsets[i]);}}v.offsetOverridden=true;}
export function originalMemberViewAbsoluteLocation(view){const v=current(view);return [f(v.fleet.position[0]+v.movementModule.position[0]),f(v.fleet.position[1]+v.movementModule.position[1])];}
export function originalMemberViewAbsoluteVelocity(view){const v=current(view),base=v.fleet.campaign.movement.velocity;return [f(base[0]+v.movementModule.velocity[0]),f(base[1]+v.movementModule.velocity[1])];}
function memberFleet(v,services){if(v.member.fleetDataRef===null)return null;if(v.member.fleetDataRef===v.fleet.dataRef)return v.fleet;return invoke(services,'readMemberViewFleet',v.member);}
function trails(v,parent,h,wind,context,services){
 if(v.jitterFader!==null||v.member.type==='FIGHTER_WING')return;const owner=memberFleet(v,services);
 if(owner){if(owner.campaign.entity.containingLocation!==context.currentLocation)return;const visibility=invoke(services,'readVisibilityToPlayer',owner);check(['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(visibility),'Actual visibility required');if(visibility==='NONE')return;}
 const c=v.fleet.campaign;for(let i=0;i<v.engineGlow.clusters.length;i++){
  if(parent.contrails===null)parent.contrails=createOriginalCampaignContrails();const slot=v.engineGlow.clusters[i],key=String(v.member.id)+'_1_'+i,duration=({CAPITAL_SHIP:2,CRUISER:1.5,DESTROYER:1.25,FRIGATE:.75,FIGHTER:.5})[h.hullSize]??1;
  // Cluster weight is reset to 1 in the native getAverage; preserve Color's alpha multiply for overrides.
  const color=[...v.contrailColor.curr];color[3]=Math.trunc(Math.max(0,Math.min(255,f(color[3]*slot.weight))));const params={color,width:f(f(slot.width*3)*v.contrailWidthMult.curr),duration:f(duration*v.contrailDurMult.curr),minSegLength:5,maxSegLength:50,widthMultiplier:7.5,mode:'WIDEN',blendMode:'GLOW',autoCleanup:true};
  if(!getOriginalCampaignContrail(parent.contrails,key))initOriginalCampaignContrail(parent.contrails,key,params);const trail=updateOriginalCampaignContrail(parent.contrails,key,params),last=trail.points.at(-1);
  if(last){const dx=f(last.point[0]-v.fleet.position[0]),dy=f(last.point[1]-v.fleet.position[1]);if(f(f(dx*dx)+f(dy*dy))<f(trail.minSegLength*trail.minSegLength))continue;}
  const velocity=unit(f(v.facingModule.facing+slot.angle));let travelSpeed;
  if(services.readFleetViewTravelSpeed)travelSpeed=num(invoke(services,'readFleetViewTravelSpeed',v.fleet));else{synchronizeOriginalFleet(v.fleet,services);travelSpeed=updateOriginalFleetTravelSpeed(v.fleet);}
  const speed=f(travelSpeed*.25);for(let axis=0;axis<2;axis++)velocity[axis]=f(velocity[axis]*speed);
  const position=[f(v.movementModule.position[0]+v.fleet.position[0]),f(v.movementModule.position[1]+v.fleet.position[1])];if(wind)for(let axis=0;axis<2;axis++)velocity[axis]=f(velocity[axis]+f(wind[axis]*10));
  const offset=rotate(slot.offset,angle(v.facingModule.facing));for(let axis=0;axis<2;axis++)position[axis]=f(position[axis]+offset[axis]);let brightness=Math.max(0,v.engineGlow.accelFader.currBrightness);if(length(c.entity.velocity)<=15)brightness=0;addOriginalCampaignContrailPoint(parent.contrails,key,position,velocity,brightness);
 }
}
/** CampaignFleetMemberView.setJitter preserves existing fader durations and seed. */
export function setOriginalMemberViewJitter(view,durationIn,durationOut,color,copies,maxRange,services={}){
 const v=current(view);durationIn=num(durationIn);durationOut=num(durationOut);maxRange=num(maxRange);check(Array.isArray(color)&&color.length===4&&color.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual jitter RGBA required');check(Number.isInteger(copies)&&copies>=0&&copies<=2147483647,'Actual jitter copy count required');
 v.jitterColor=color;v.jitterCopies=copies;v.maxJitterRange=maxRange;
 if(v.jitterFader!==null)fadeOriginalFader(v.jitterFader,'IN');else{v.jitterFader=createOriginalFader(0,durationIn,durationOut,false,true);fadeOriginalFader(v.jitterFader,'IN');v.jr=createOriginalJitterRenderer(invoke(services,'newMemberViewJitterSeed'));}
}
export function endOriginalMemberViewJitter(view){const v=current(view);v.jr=null;v.jitterFader=null;}
export function setOriginalMemberViewJitterDirection(view,direction){const v=current(view);if(v.jr!==null){check(direction===null||Array.isArray(direction)&&direction.length===2&&direction.every(n=>num(n)===n),'Actual nullable jitter direction required');v.jr.jitterDirection=direction;}}
export function setOriginalMemberViewJitterLength(view,length){const v=current(view);if(v.jr!==null)v.jr.jitterLength=num(length);}
export function setOriginalMemberViewCircularJitter(view,circular){const v=current(view);if(v.jr!==null){check(typeof circular==='boolean','Actual circular jitter flag required');v.jr.circular=circular;}}
export function setOriginalMemberViewJitterBrightness(view,brightness){const v=current(view);if(v.jitterFader!==null)v.jitterFader.currBrightness=num(brightness);}
export function advanceOriginalCampaignFleetMemberView(view,seconds,parent,context,random,services={}){
 const v=current(view),fleet=v.fleet,c=fleet.campaign,h=hull(v.member);seconds=num(seconds);advanceOriginalFader(v.fader,seconds);advanceOriginalFader(v.engineGlow.accelFader,seconds);
 const destDistance=()=>c.moveDestination===null?0:distance(c.movement.position,c.moveDestination);fadeOriginalFader(v.engineGlow.fullFader,destDistance()>100?'IN':'OUT');advanceOriginalFader(v.engineGlow.fullFader,seconds);
 if(seconds>0&&v.jr!==null){if(services.updateMemberViewJitterSeed)invoke(services,'updateMemberViewJitterSeed',v.jr);else updateOriginalJitterSeed(v.jr,invoke(services,'newMemberViewJitterSeed'));}if(v.jitterFader!==null){advanceOriginalFader(v.jitterFader,seconds);if(originalFaderIsOut(v.jitterFader)){v.jitterFader=null;v.jr=null;}}
 advanceOriginalSmoothMovement(v.movementModule,v.desiredOffset,v.zero,seconds);for(const k of shifters)advanceOriginalViewShifter(v[k],seconds);
 let wind=null;if(v.windEffectColor.data.length){wind=[v.windEffectDirX.curr,v.windEffectDirY.curr];const magnitude=Math.max(length(wind),f(.1)),days=services.convertMemberViewSecondsToDays?invoke(services,'convertMemberViewSecondsToDays',seconds):f(seconds/fleet.logisticsEnvironment.secondsPerDay),radius=f(Math.min(v.sprite.width,v.sprite.height)/2),ratio=f(f(radius*magnitude)/v.windEffect.texture.width);v.windOffset=f(v.windOffset+f(f(f(f(.1)*ratio)*days)*100));if(v.windOffset>1)v.windOffset=f(v.windOffset-1);}
 v.facingModule.maxTurnRate=f(v.maxTurnRate*3);v.facingModule.turnAcceleration=f(v.maxTurnRate*10);if(parent!==null)trails(v,parent,h,wind,context,services);
 if(v.member.type==='FIGHTER_WING'){const w=wing(v.member),spacing=f(f(h.sprite.collisionRadius*4)*v.scaleMult),origin=formationOrigin(v);for(let i=1;i<w.numFighters;i++){v.desiredFighterOffsets[i]=originalFighterFormationOffset(v.formation.type,origin,v.facing,spacing,spacing,i);advanceOriginalSmoothMovement(v.fighterMovement[i],v.desiredFighterOffsets[i],v.movementModule.velocity,seconds);}}
 if(distance(v.movementModule.position,v.desiredOffset)<3)regenerateOriginalMemberViewOffset(v,random);
 // The native code overwrites its size-dependent follow flag with true.
 const remaining=destDistance();advanceOriginalSmoothFacing(v.facingModule,v.originFacing,seconds);if(h.station)v.facingModule.facing=fleet.facing;v.facing=v.facingModule.facing;
 let accelerating=false,direction=fleet.facing;if(length(c.entity.velocity)>5){accelerating=true;direction=getOriginalMovementFacing(c.entity.velocity);}
 if(length(c.movement.accel)>f(12*resolveOriginalEconomyMutable(fleet.stats.accelerationMult))){accelerating=true;direction=getOriginalMovementFacing(c.movement.accel);}
 if(remaining<10)accelerating=false;let delta=angle(f(v.facing-direction));if(delta>180)delta=f(360-delta);
 fadeOriginalFader(v.engineGlow.accelFader,delta>120||!accelerating||fleet.battle!==null?'OUT':'IN');
}
export function validateOriginalCampaignFleetMemberView(view){
 const v=current(view);check(v.engineGlow?.member===v.member,'Lost engine/member identity');validateOriginalFader(v.fader);validateOriginalFader(v.engineGlow.accelFader);validateOriginalFader(v.engineGlow.fullFader);if(v.jitterFader!==null)validateOriginalFader(v.jitterFader);for(const k of shifters)validateOriginalViewShifter(v[k]);if(v.jr?.scope==='native-jitter-renderer')validateOriginalJitterRenderer(v.jr);
 for(const s of [v.sprite,v.shadowMask,v.windEffect,...v.moduleIcons.filter(i=>i.scope==='native-campaign-module-icon').map(i=>i.sprite)]){check(s&&s.texture&&s.width>=0&&s.height>=0,'Missing native sprite state');const known=R.textures[s.texture.path];if(known)check(canonicalJSON(known)===canonicalJSON(s.texture),'Unverified member texture descriptor');}
 check(v.movementModule&&v.facingModule&&Array.isArray(v.desiredOffset)&&v.desiredOffset.length===2&&Array.isArray(v.moduleIcons),'Missing actual member movement/resources');
 for(const icon of v.moduleIcons)if(icon.scope==='native-campaign-module-icon')check(icon.slotId===icon.slot?.id&&icon.variant?.objectRef&&icon.variant.hullId,'Missing actual module icon variant/slot');
 if(v.member.type==='FIGHTER_WING'){check(v.fighterMovement?.length===10&&v.desiredFighterOffsets?.length===10&&v.formation,'Invalid fixed fighter formation arrays');const w=wing(v.member);for(let i=0;i<w.numFighters;i++)check(v.fighterMovement[i]&&v.desiredFighterOffsets[i],'Missing actual fighter movement');}else check(v.fighterMovement===null&&v.desiredFighterOffsets===null,'Non-wing fighter movement must be null');return v;
}
