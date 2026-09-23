/** CampaignFleetMemberView.renderSingle and CampaignShipEngineGlow.render, in native order. */
import {requireThat} from '../core/Values.mjs';
import {originalMemberViewHull} from './OriginalMemberViewResources.mjs';
import {renderOriginalMemberViewModules} from './OriginalMemberViewModules.mjs';
import {renderOriginalMemberViewWeapons} from './OriginalMemberViewWeapons.mjs';
import {originalJitterOffsets} from './OriginalJitterRenderer.mjs';
import {ORIGINAL_FLEET_VIEW_INPUTS as R} from './OriginalCampaignFleetMemberView.mjs';
import {createOriginalFleetDrawFrame,originalFleetDrawColor as rgba,originalFleetDrawRotate as rotate,originalFleetDrawSprite as sprite,originalFleetDrawQuads as quads,originalFleetDrawMask as mask} from './OriginalFleetDraw.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MEMBER_RENDER',m);
const invoke=(s,k,...a)=>{check(typeof s[k]==='function','Actual member-render service required: '+k);const v=s[k](...a);check(!v||typeof v.then!=='function','Render services must be synchronous');return v;};
const add=(a,b)=>[f(a[0]+b[0]),f(a[1]+b[1])];
function modules(v,frame,position,services){if(v.member.spriteOverride!==null||v.moduleIcons.length===0)return;if(services.renderMemberViewModules)invoke(services,'renderMemberViewModules',v,frame,position);else renderOriginalMemberViewModules(v,frame,position,services);}
function weapons(v,frame,position,alpha,services){
 if(!services.renderMemberViewDecorativeWeapons){renderOriginalMemberViewWeapons(v,frame,position,alpha,services);return;}
 const slots=originalMemberViewHull(v.member.variant.hullId,services).slots,decorative=[];
 for(const [slot,id]of v.member.variant.weapons){const spec=slots.find(s=>s.id===slot);check(spec,'Fitted slot missing on actual hull: '+slot);if(spec.type==='DECORATIVE')decorative.push([slot,id]);}
 // Default force=false: native zoom expression skips ALL non-decorative weapons, at every zoom.
 if(decorative.length)invoke(services,'renderMemberViewDecorativeWeapons',v,decorative,frame,position,alpha);
}
const lightSource=(v,services)=>services.readMemberViewLightSource?invoke(services,'readMemberViewLightSource',v.fleet):v.fleet.campaign.view.lightSource;
function ambient(v,services){const light=lightSource(v,services);if(light===null)return false;if(services.memberViewLightHasTag)return invoke(services,'memberViewLightHasTag',light,'ambient_ls');const tags=light.tags??light.campaign?.entity?.tags;check(Array.isArray(tags),'Actual light-source tags required');return tags.includes('ambient_ls');}
function wind(v,frame,position,alpha){
 if(!v.windEffectColor.data.length)return;const wind=[v.windEffectDirX.curr,v.windEffectDirY.curr],m=f(Math.sqrt(f(f(wind[0]*wind[0])+f(wind[1]*wind[1]))));if(m<1)return;
 const angle=f(f(Math.atan2(wind[1],wind[0]))*f(57.295784));let delta=Math.abs(f(angle-v.facing))%360;if(delta>180)delta=f(360-delta);if(delta>90)delta=f(180-delta);
 const r=f(delta*f(f(Math.PI)/180)),cross=f(f(f(Math.cos(r))*v.sprite.width)+f(f(Math.sin(r))*v.sprite.height)),radius=f(Math.min(v.sprite.width,v.sprite.height)/2),length=f(radius*m),width=f(cross*f(.6)),u=f(length/v.windEffect.texture.width),lead=f(f(width/v.windEffect.texture.width)*.5),offset=v.windOffset;
 const center=rotate([f(f(v.sprite.width/2)-v.sprite.centerX),f(f(v.sprite.height/2)-v.sprite.centerY)],f(v.facing-90));
 const color=v.windEffectColor.curr,bright=rgba(color,f(alpha*f(.67))),dark=rgba(color,0),middle=f(offset+u),end=f(middle+lead);
 const quad=(points)=>quads(frame,'wind',v.windEffect.texture,points.map(([x,y,tx,ty,b])=>({position:add(position,add(center,rotate([x,y],f(angle+180)))),uv:[tx,ty],color:[...(b?bright:dark)]})),770,1);
 quad([[0,0,middle,.5,1],[0,width,middle,1,0],[-length,f(length/2),offset,1,0],[-length,0,offset,0,0]]);
 quad([[0,0,middle,.5,1],[0,-width,middle,0,0],[-length,f(-length/2),offset,1,0],[-length,0,offset,0,0]]);
 quad([[0,0,middle,.5,1],[0,width,middle,1,0],[f(width/2),f(width/2),end,1,0],[f(width/2),0,end,0,0]]);
 quad([[0,0,middle,.5,1],[0,-width,middle,1,0],[f(width/2),f(-width/2),end,1,0],[f(width/2),0,end,0,0]]);
}
export function renderOriginalCampaignEngineGlow(v,frame,position,alpha){
 const g=v.engineGlow,full=g.fullFader.currBrightness,accel=g.accelFader.currBrightness,mult=f(.5+f(.5*full)),sizeFactor=f(f(1+f(.75*f(1-accel)))*mult),lengthFactor=f(f(1+f(accel-.75))*mult);g.hitGlow.alphaMult=alpha;
 const bright=rgba(v.engineColor.curr,alpha),dark=rgba(v.engineColor.curr,0),vertices=[];
 for(const slot of g.slots){let widthMult=v.engineWidthMult.curr;if(widthMult>1)widthMult=f(1+f(f(widthMult-1)*full));const half=f(f(slot.width/2)*widthMult),length=f(f(slot.baseLength*lengthFactor)*v.engineHeightMult.curr),dir=rotate([0,1],f(slot.angle-90)),front=add(slot.offset,[f(dir[0]*-3),f(dir[1]*-3)]),tail=add(slot.offset,[f(dir[0]*length),f(dir[1]*length)]),o=slot.offset;
  for(const [x,y,u,w,b]of [[front[0],f(front[1]+f(half/2)),1,1,0],[front[0],f(front[1]-f(half/2)),1,0,0],[o[0],f(o[1]-half),0,0,1],[o[0],f(o[1]+half),0,1,1],[o[0],f(o[1]-half),0,0,1],[o[0],f(o[1]+half),0,1,1],[tail[0],f(tail[1]+f(half/2)),1,1,0],[tail[0],f(tail[1]-f(half/2)),1,0,0]])vertices.push({position:add(position,rotate([x,y],v.facing)),uv:[u,w],color:[...(b?bright:dark)]});
 }
 quads(frame,'engine',g.texture,vertices,770,1);
 for(const slot of g.slots){g.hitGlow.color=v.engineGlowColor.curr;const size=f(f(slot.glowSize*sizeFactor)*v.engineGlowSizeMult.curr);g.hitGlow.width=size;g.hitGlow.height=size;sprite(frame,'engine-hit-glow',g.hitGlow,add(position,rotate(slot.offset,v.facing)),v.facing);}
}
function single(v,frame,position,lightAngle,lightColor,alpha,lightMult,services){
 const s=v.sprite,h=R.hulls[v.member.variant.hullId];check(h,'Actual current hull required');check(!v.useLight||lightColor!==null,'Actual light color required');s.color=v.useLight?lightColor:[255,255,255,255];
 let jitterMult=1;if(v.jitterFader!==null){jitterMult=f(1-v.jitterFader.currBrightness);jitterMult=f(jitterMult*jitterMult);}const faded=f(alpha*jitterMult);
 s.blendSrc=770;s.blendDest=771;s.alphaMult=faded;if(h.station)v.facing=v.fleet.facing;s.angle=f(v.facing-90);sprite(frame,'hull',s,position);
 if(v.glowColor.data.length){s.color=v.glowColor.curr;s.blendDest=1;s.alphaMult=faded;sprite(frame,'hull-glow',s,position);modules(v,frame,position,services);s.color=v.useLight?lightColor:[255,255,255,255];}
 wind(v,frame,position,faded);
 if(v.useLight&&v.member.type!=='FIGHTER_WING'&&lightSource(v,services)!==null&&!ambient(v,services)){
  const extent=f(v.shadowMask.width*f(1.41)),min=f(f(-extent/2)-1),max=f(min+f(extent+2));mask(frame,[false,false,false,true]);
  quads(frame,'shadow-clear',null,[[min,min],[min,max],[max,max],[max,min]].map(p=>({position:add(position,rotate(p,s.angle)),uv:[0,0],color:[0,0,0,0]})),770,0);
  s.blendSrc=1;s.blendDest=0;const saved=s.alphaMult;s.alphaMult=Math.min(f(saved*100),1);sprite(frame,'shadow-hull-mask',s,position);s.alphaMult=saved;
  mask(frame,[true,true,true,true]);weapons(v,frame,position,faded,services);s.blendSrc=770;s.blendDest=771;modules(v,frame,position,services);
  const shadow=v.shadowMask;mask(frame,[false,false,false,true]);shadow.alphaMult=Math.min(f(f(f(alpha*lightMult)*jitterMult)*100),1);shadow.angle=lightAngle;shadow.blendSrc=0;shadow.blendDest=770;sprite(frame,'shadow-multiply-alpha',shadow,position);
  mask(frame,[true,true,true,false]);shadow.blendSrc=772;shadow.blendDest=773;sprite(frame,'shadow-rgb',shadow,position);
 }else{weapons(v,frame,position,faded,services);s.blendSrc=770;s.blendDest=771;modules(v,frame,position,services);}
 renderOriginalCampaignEngineGlow(v,frame,position,faded);
 if(v.jitterFader!==null){check(v.jr!==null,'Actual JitterRenderer required');const old=s.color;s.color=v.jitterColor;s.alphaMult=f(alpha*f(1-jitterMult));s.blendSrc=770;s.blendDest=1;const range=f(v.jitterFader.currBrightness*v.maxJitterRange),offsets=services.readMemberViewJitterOffsets?invoke(services,'readMemberViewJitterOffsets',v.jr,range,v.jitterCopies):originalJitterOffsets(v.jr,range,v.jitterCopies);check(Array.isArray(offsets)&&offsets.length===v.jitterCopies,'Actual jitter copies required');for(const p of offsets)sprite(frame,'jitter',s,add(position,p));s.color=old;}
}
/** Performs native render-side sprite writes once; detached vertices are consumed by WebGL. */
export function renderOriginalCampaignFleetMemberView(view,lightAngle,lightColor,alpha,lightMult,services={},frame=createOriginalFleetDrawFrame()){
 check(view?.scope==='native-campaign-fleet-member-view','Actual native member view required');check([lightAngle,alpha,lightMult].every(Number.isFinite),'Finite render arguments required');const v=view;alpha=f(f(f(alpha)*v.fader.currBrightness)*v.extraAlphaMult);
 if(v.member.type==='FIGHTER_WING'){const w=R.wings[v.member.specId];check(w,'Actual current fighter wing required');for(let i=1;i<w.numFighters;i++){const status=v.member.status?.modules[i];check(status&&Number.isFinite(status.hullFraction),'Actual fighter hull status required');if(status.hullFraction<=0)continue;single(v,frame,add(v.originLoc,v.fighterMovement[i].position),lightAngle,lightColor,alpha,lightMult,services);}}
 single(v,frame,add(v.originLoc,v.movementModule.position),lightAngle,lightColor,alpha,lightMult,services);return frame;
}
