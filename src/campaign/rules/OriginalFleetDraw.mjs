/** Ordered native GL geometry. This is a detached render result, never a live-world checkpoint. */
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FLEET_DRAW',m);
export const NATIVE_FLEET_RGB_MASK=Object.freeze([true,true,true,false]);
export function createOriginalFleetDrawFrame(origin=[0,0]){return {scope:'native-campaign-fleet-draw',origin:[...origin],commands:[]};}
export function originalFleetDrawColor(color,alpha=1){check(Array.isArray(color)&&color.length===4&&color.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual RGBA color required');const a=f(f(color[3])*f(alpha));const i=Number.isNaN(a)?0:a>=2147483647?2147483647:a<=-2147483648?-2147483648:Math.trunc(a);return [color[0],color[1],color[2],i&255];}
export function originalFleetDrawRotate(p,degrees){const r=f(f(degrees)*f(f(Math.PI)/180)),c=f(Math.cos(r)),s=f(Math.sin(r));return [f(f(p[0]*c)-f(p[1]*s)),f(f(p[0]*s)+f(p[1]*c))];}
export function originalFleetDrawMask(frame,mask){check(mask.length===4&&mask.every(v=>typeof v==='boolean'),'Actual colorMask required');frame.commands.push({kind:'mask',mask:[...mask]});}
export function originalFleetDrawQuads(frame,pass,texture,vertices,blendSrc=770,blendDest=771){check(vertices.length%4===0,'Native quads require groups of four vertices');for(const v of vertices)check(v.position?.length===2&&v.uv?.length===2&&[...v.position,...v.uv].every(Number.isFinite)&&v.color?.length===4&&v.color.every(c=>Number.isInteger(c)&&c>=0&&c<=255),'Finite geometry and actual RGBA bytes required');if(!vertices.length)return;frame.commands.push({kind:'quads',pass,texture:texture===null?null:{...texture},blendSrc,blendDest,vertices});}
export function originalFleetDrawSprite(frame,pass,sprite,position=[0,0],outerAngle=0){
 const cx=sprite.centerX!==-1&&sprite.centerY!==-1?sprite.centerX:f(sprite.width/2),cy=sprite.centerX!==-1&&sprite.centerY!==-1?sprite.centerY:f(sprite.height/2),c=originalFleetDrawColor(sprite.color,sprite.alphaMult),t=sprite.texture;
 const tx=sprite.texX??0,ty=sprite.texY??0,tw=sprite.texWidth??t.texWidth,th=sprite.texHeight??t.texHeight;
 check([tx,ty,tw,th].every(Number.isFinite),'Finite native sprite texture rectangle required');
 const corners=[[0,0,tx,ty],[0,sprite.height,tx,f(ty+th)],[sprite.width,sprite.height,f(tx+tw),f(ty+th)],[sprite.width,0,f(tx+tw),ty]];
 const vertices=corners.map(([x,y,u,v])=>{const p=originalFleetDrawRotate(originalFleetDrawRotate([f(x-cx),f(y-cy)],sprite.angle),outerAngle);return {position:[f(p[0]+position[0]),f(p[1]+position[1])],uv:[u,v],color:[...c]};});
 originalFleetDrawQuads(frame,pass,t,vertices,sprite.blendSrc,sprite.blendDest);
}
/** Contrails already carry WORLD positions; fleet member geometry is fleet-local. */
export function appendOriginalFleetContrailDraw(frame,contrails,readTexture){
 check(contrails?.scope==='native-campaign-contrail-quad-strips','Actual native contrail render result required');
 for(const strip of contrails.strips){const texture=readTexture(strip.texturePath);check(texture?.path===strip.texturePath,'Actual contrail texture required');const vertices=[];for(let i=0;i+3<strip.vertices.length;i+=2)for(const at of [i,i+1,i+3,i+2]){const v=strip.vertices[at];vertices.push({position:[f(v.position[0]-frame.origin[0]),f(v.position[1]-frame.origin[1])],uv:[...v.uv],color:[...v.color]});}originalFleetDrawQuads(frame,'contrail',texture,vertices,770,strip.blendDest==='ONE'?1:771);}
}
