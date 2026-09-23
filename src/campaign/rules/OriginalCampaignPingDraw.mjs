/** Original ActionIndicator render + textured campaign.util._super circle. No CSS approximation. */
import R from '../data/reference-campaign-pings.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {validateOriginalActionIndicator} from './OriginalCampaignPings.mjs';
import {originalLocationEntityState} from './OriginalLocationOrbits.mjs';
import {originalFleetSensorRadius} from './OriginalSensors.mjs';
import {createOriginalFleetDrawFrame,originalFleetDrawQuads} from './OriginalFleetDraw.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_PING_DRAW',m);
const scalar=v=>{check(typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(f(v)),'Actual finite ping render scalar required');return f(v);};
const rgba=c=>{check(Array.isArray(c)&&c.length===4&&c.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual ping render RGBA required');return c;};
function radius(entity,services){if(services.readPingRadius)return scalar(services.readPingRadius(entity));return scalar(entity.campaign?originalFleetSensorRadius(entity):entity.radius);}
/** Local vertices preserve the continuous native QUAD_STRIP, including the two ring joins. */
function ringStrip(points,r,width,color){
 const count=Math.max(Math.trunc(f(f(f(f(Math.PI)*r)*2)/15)),36)*2,step=f(f(f(Math.PI)*2)/f(count));
 for(let i=0;i<=count;i++){const angle=f(step*f(i)),cos=f(Math.cos(angle)),sin=f(Math.sin(angle));points.push({position:[f(cos*r),f(sin*r)],uv:[0,0],color:[color[0],color[1],color[2],0]},{position:[f(cos*f(r-width)),f(sin*f(r-width))],uv:[0,1],color:[...color]});}
}
export function renderOriginalActionIndicator(indicator,context,services={}){
 validateOriginalActionIndicator(indicator);const entity=originalLocationEntityState(indicator.entity,services),frame=createOriginalFleetDrawFrame(entity.position);check(Object.hasOwn(context,'currentLocation'),'Actual ping render location required');if(entity.containingLocation!==context.currentLocation)return frame;
 const spec=indicator.spec;let alpha=f(scalar(context.alpha)*spec.alphaMult),progress=indicator.fader.currBrightness;if(spec.invert)progress=f(1-progress);
 const growth=spec.invert?f(progress*progress):f(Math.sqrt(progress)),entityRadius=radius(indicator.entity,services);let minimum=Math.max(spec.minRange,entityRadius);if(spec.minRange<=0)minimum=entityRadius;if(minimum>10000)minimum=10000;
 const range=f(minimum+f(spec.range*growth));check(typeof context.isNearViewport==='function','Actual ping render viewport required');if(!context.isNearViewport(entity.position,f(range+100)))return frame;
 const inFraction=spec.invert?f(.5):spec.inFraction;let strength=progress<inFraction?f(progress/inFraction):f(1-f(f(progress-inFraction)/f(1-inFraction)));if(strength<0)strength=0;alpha=f(alpha*strength);if(alpha<=0)return frame;
 const sourceFaction=indicator.entity.campaign?.faction??indicator.entity.faction;
 const selected=indicator.colorOverride!==null?indicator.colorOverride:spec.useFactionColor?(services.readPingFactionColor?services.readPingFactionColor(indicator.entity):sourceFaction?.specColor):spec.color;
 const color=rgba(selected===null?[155,155,155,155]:selected); // Native null uses gray; missing faction state must not be guessed.
 const alphaByte=Math.trunc(f(color[3]*alpha));if(alphaByte<=0)return frame;
 const requestedWidth=f(spec.width*Math.min(f(f(.1)+strength),1)),width=requestedWidth>0?requestedWidth:f(1.75),actualRange=range>0?range:entityRadius,strip=[];
 const half=[color[0],color[1],color[2],Math.trunc(f(alphaByte*f(.5)))&255],full=[color[0],color[1],color[2],alphaByte&255];
 ringStrip(strip,f(actualRange-f(.5)),width,half);ringStrip(strip,f(actualRange+f(.5)),width,half);ringStrip(strip,actualRange,width,full);
 const vertices=[];for(let i=0;i+3<strip.length;i+=2)vertices.push(strip[i],strip[i+1],strip[i+3],strip[i+2]);originalFleetDrawQuads(frame,'campaign-ping',R.indicatorTexture,vertices,770,771);return frame;
}
