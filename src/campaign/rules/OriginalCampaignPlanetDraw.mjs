/** CampaignPlanet.render + terrain/Planet, normal-space geometry only (0.98a-RC8).
 * Reads authority state; never advances phases, light faders, contacts or RNG. */
import R from '../data/reference-campaign-planet-textures.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {validateOriginalCampaignPlanet} from './OriginalCampaignPlanet.mjs';
import {createOriginalFleetDrawFrame,originalFleetDrawColor,originalFleetDrawQuads,originalFleetDrawSprite} from './OriginalFleetDraw.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_PLANET_DRAW',m),white=[255,255,255,255];
const textures=new Map(R.textures.map(t=>[t.path,Object.freeze({...t})]));
export function originalCampaignPlanetTexture(path){const t=textures.get(path);check(t,'Reviewed planet texture required: '+path);return {...t};}
const normalize=a=>f(f(f(a%360)+360)%360),angleDistance=(a,b)=>{const d=normalize(f(a-b));return d>180?f(360-d):d;};
const sub=(a,b)=>a.map((n,i)=>f(n-b[i]));
const dist=(a,b)=>{const d=sub(a,b);return f(Math.sqrt(d.reduce((s,n)=>f(s+f(n*n)),0)));};
const colorFloat=(c,alpha,lit)=>lit?c.map((n,i)=>i===3?f(f(n/255)*alpha):f(n/255)):originalFleetDrawColor(c,alpha).map(n=>f(n/255));
function tintAtmosphere(base,override){
 if(override===null)return [...base];const [r,g,b,a]=override,deficit=Math.min(1,f(f(f(f(f(255-r)+f(255-g))+f(255-b))+f(255-a))/765));
 if(deficit<=0)return [...base];const luminance=Math.min(1,f(f(f(f(f(.299)*r)+f(f(.587)*g))+f(f(.114)*b))/255)),mix=f(f(.8)*deficit);
 const color=base.map((n,i)=>Math.max(0,Math.min(255,Math.trunc(f(n+f(f(override[i]-n)*mix))))));
 for(let i=0;i<3;i++)color[i]=Math.max(0,Math.min(255,Math.trunc(f(color[i]*luminance))));color[3]=Math.max(0,Math.min(255,Math.trunc(f(255*a))));return color;
}
function atmosphere(frame,g,cache,light,override,alpha,thickness,reverse,readTexture){
 const spec=g.spec,color=tintAtmosphere(reverse?cache.glowColor:spec.atmosphereColor,spec.isStar?null:override),inner=f(g.radius-f(thickness*f(.4))),outer=f(inner+thickness),step=f(normalize(f(2*Math.PI))/64);
 if(reverse)alpha=f(alpha*f(.2));let ratio=0,direction=0;
 if(light!==null&&!spec.isStar){const flat=[light[0],light[1]];ratio=f(dist(g.position,flat)/Math.max(1,dist([...g.position,0],light)));direction=f(f(Math.atan2(f(flat[1]-g.position[1]),f(flat[0]-g.position[0])))*f(180/f(Math.PI)));}
 if(reverse)direction=normalize(f(direction+180));
 const ring=[];for(let i=0;i<=64;i++){
  const angle=i===64?0:f(step*i),cos=f(Math.cos(angle)),sin=f(Math.sin(angle));let factor=1;
  if(light!==null){const weight=f(1-f(angleDistance(f(angle*180/Math.PI),direction)/180)),power=f(Math.pow(weight,reverse&&i!==64?2:1.5));factor=f(f(1-ratio)+f(ratio*power));}
  const tint=[color[0],color[1],color[2],Math.trunc(f(f(color[3]*alpha)*factor))&255];ring.push([{position:[f(cos*inner),f(sin*inner)],uv:[0,0],color:tint},{position:[f(cos*outer),f(sin*outer)],uv:[0,f(.99)],color:tint}]);
 }
 const vertices=[];for(let i=0;i<64;i++)vertices.push(ring[i][0],ring[i][1],ring[i+1][1],ring[i+1][0]);
 originalFleetDrawQuads(frame,reverse?'planet-atmosphere-glow':'planet-atmosphere',readTexture(R.atmosphereTexture),vertices,770,spec.isStar?1:771);
}
/** Cache-less Web checkpoints predate drawing. Their applied spec is the only retained
 * resource snapshot; derive it read-only, never reinterpret pending planet.spec. */
export function renderOriginalCampaignPlanetLayers(planet,context,services={}){
 validateOriginalCampaignPlanet(planet);check(typeof context.isNearViewport==='function'&&Number.isFinite(context.alpha),'Actual planet viewport required');
 const g=planet.graphics,s=g.spec,cache=g.renderCache??s,readTexture=services.readTexture??originalCampaignPlanetTexture,alpha=f(context.alpha),planets=createOriginalFleetDrawFrame(g.position),above=createOriginalFleetDrawFrame(g.position),result={planets,above};
 if(!s.isStar&&!context.isNearViewport(planet.position,f(planet.radius+1000)))return result;
 let light=null,override=null;
 if(planet.entity.lightSource!==null&&!s.isStar){
  check(typeof services.readLightEntity==='function','Actual light entity reader required');const source=services.readLightEntity(planet.entity.lightSource);check(Array.isArray(source.position)&&source.position.length===2&&source.position.every(Number.isFinite)&&Array.isArray(source.tags),'Actual light position/tags required');
  let height=1;if(context.lightHeightBrightness!==null&&context.lightHeightBrightness!==undefined){check(Number.isFinite(context.lightHeightBrightness),'Actual light-height brightness required');height=f(f(f(1.5)*f(context.lightHeightBrightness))-f(.5));}
  light=source.tags.includes('ambient_ls')?[...planet.position,f(planet.radius*2)]:[...source.position,f(f(dist(planet.position,source.position)*f(.75))*height)];override=planet.entity.lightColor;
 }
 const primaryWorld=light??[f(g.position[0]+f(g.lightPosition[0]*g.radius)),f(g.position[1]+f(g.lightPosition[1]*g.radius)),f(g.lightPosition[2]*g.radius)],center=[...g.position,0];
 const primary={position:sub(primaryWorld,center),diffuse:(override??white).slice(0,3).map(n=>f(n/255))};
 let secondary=null;if(planet.secondLightLocation!==null){check(planet.secondLightColor!==null,'Second light location requires actual color');secondary={position:sub(planet.secondLightLocation,center),diffuse:planet.secondLightColor.slice(0,3).map(n=>f(n/255))};}
 const addSphere=(pass,path,radius,z,angle,color,mult,blendDest=771,ambient=f(.2),lamp=primary,lit=!s.isStar)=>{
  const texture=readTexture(path);check(texture?.path===path,'Actual loaded planet texture required');
  planets.commands.push({kind:'planet-sphere',pass,texture:{...texture},radius:f(radius),z,rotation:[g.tilt,g.pitch,angle],color:colorFloat(color,f(alpha*mult),lit),materialAmbient:ambient,lighting:lit?{primary:lamp,secondary}:null,blendSrc:770,blendDest});
 };
 const thickness=f(Math.max(f(g.radius*s.atmosphereThickness),s.atmosphereThicknessMin));
 if(context.isNearViewport(g.position,f(g.radius+thickness))){
  if(cache.texture!==null){
   addSphere('planet-surface',cache.texture,g.radius,0,g.angle,s.planetColor,1);
   addSphere('planet-surface-edge-1',cache.texture,f(g.radius+f(.25)),0,g.angle,s.planetColor,f(.37));
   addSphere('planet-surface-edge-2',cache.texture,f(g.radius+f(.5)),0,g.angle,s.planetColor,f(.37));
   if(cache.glowTexture!==null&&!s.isStar){
    const reverse=s.useReverseLightForGlow,reverseWorld=light?[f(f(g.position[0]*2)-light[0]),f(f(g.position[1]*2)-light[1]),f(-light[2]*f(.75))]:primaryWorld.map(n=>f(-n)),lamp={...primary,position:sub(reverseWorld,center)};
    addSphere('planet-glow',cache.glowTexture,g.radius,50,g.angle,cache.glowColor,1,1,0,lamp,reverse);
    if(reverse)addSphere('planet-glow-repeat',cache.glowTexture,g.radius,50,g.angle,cache.glowColor,1,1,0,lamp,true);
   }
   if(cache.cloudTexture!==null)addSphere('planet-clouds',cache.cloudTexture,g.radius,100,g.cloudAngle,s.cloudColor,1,s.isStar?1:771);
   for(const [path,color,thick,pass]of [[cache.shieldTexture,s.shieldColor,s.shieldThickness,'planet-shield'],[cache.shieldTexture2,s.shieldColor2,s.shieldThickness2,'planet-shield-2']])if(path!==null)addSphere(pass,path,f(g.radius*f(1+thick)),100,g.angle,s.isStar?white:(color??white),1,1,f(.2),{...primary,position:[0,0,f(g.radius*100)]});
  }
  if(s.atmosphereThickness>0){atmosphere(planets,g,cache,light,override,alpha,thickness,false,readTexture);if(cache.glowTexture!==null)atmosphere(planets,g,cache,light,override,alpha,thickness,true,readTexture);}
 }
 const halo=f(g.radius*s.coronaSize);
 if(s.isStar&&halo>g.radius&&context.isNearViewport(g.position,f(halo+550))){
  const texture=readTexture(cache.coronaTexture);originalFleetDrawSprite(above,'planet-star-corona',{texture,width:f(halo*2),height:f(halo*2),centerX:-1,centerY:-1,angle:0,alphaMult:alpha,color:s.coronaColor,blendSrc:770,blendDest:1});
 }
 return result;
}
