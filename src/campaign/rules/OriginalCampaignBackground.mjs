/** BackgroundAndStars/OOOo normal-space rendering; observer transients never advance authority. */
import R from '../data/reference-campaign-background.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {createOriginalViewShifter,validateOriginalViewShifter} from './OriginalFleetViewShifters.mjs';
import {createOriginalJavaRandom,originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {createOriginalFleetDrawFrame,originalFleetDrawQuads} from './OriginalFleetDraw.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_BACKGROUND',m),int=n=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(n)));
const num=n=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native background float required');return f(n);};
const rgba=c=>{check(Array.isArray(c)&&c.length===4&&c.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual background RGBA required');return c;};
export function originalCampaignBackgroundTexture(path){const t=R.textures.find(t=>t.path===path);check(t,'Unverified background texture: '+path);return {...t};}
/** A genuinely NEW normal-space BackgroundAndStars, not an inferred imported background. */
export function createOriginalNormalSpaceBackground(texturePath=R.defaultSpaceBackground){
 originalCampaignBackgroundTexture(texturePath);
 return {scope:'native-location-background-advance',warpingRenderer:null,colorShifter:createOriginalViewShifter([255,255,255,255]),particleColorShifter:createOriginalViewShifter([191,191,191,200]),visual:{scope:'native-normal-space-background-source',texturePath}};
}
export function validateOriginalCampaignBackgroundSource(bg){
 check(bg?.scope==='native-location-background-advance'&&bg.visual?.scope==='native-normal-space-background-source'&&bg.warpingRenderer===null,'Actual normal-space background source required; warp rendering is separate');
 originalCampaignBackgroundTexture(bg.visual.texturePath);for(const key of ['colorShifter','particleColorShifter']){validateOriginalViewShifter(bg[key]);check(bg[key].kind==='color','Actual background color shifter required');}
 return bg;
}
export function replaceOriginalCampaignBackgroundTexture(bg,path){validateOriginalCampaignBackgroundSource(bg);path??=R.defaultSpaceBackground;originalCampaignBackgroundTexture(path);bg.visual.texturePath=path;}
/** setBackgroundOffset belongs to this observer's transient BackgroundAndStars, not the shared world. */
export function setOriginalCampaignBackgroundOffset(view,x,y){check(view?.scope==='native-observer-background','Actual observer background required');view.offset=[num(x),num(y)];}
const random=view=>originalJavaNextDouble(view.random);
function count(view,area){if(area===0)return 0;const n=f(f(area/10000)*f(.25)),fraction=f(n-f(int(n)));return int(n)+(random(view)<=fraction?1:0);}
function populate(view,field,x,y,width,height){
 const n=count(view,f(width*height));
 for(let i=0;i<n;i++){
  const size=f(f(f(f(random(view))*f(random(view)))*f(4.5))+f(6.5)),px=f(int(random(view)*width+x)),py=f(int(random(view)*height+y));
  random(view); // The original still picks a color from a one-entry white palette.
  const brightness=f(Math.max(1,f(random(view)))*f(.75)),v=int(f(255*brightness)),pick=f(random(view)),texture=pick<f(.25)?0:pick<f(.5)?1:pick<f(.75)?2:3;
  field.groups[texture].push({x:px,y:py,size,color:[v,v,v,200]});
 }
}
function starfield(view,width,height){const field={bounds:{x:0,y:0,width,height},groups:[[],[],[],[]]};populate(view,field,0,0,width,height);return field;}
function spriteUpdated(view,source,width,height,pixelScale){
 const texture=originalCampaignBackgroundTexture(source.visual.texturePath);let w=f(texture.width/pixelScale),h=f(texture.height/pixelScale);
 if(width>w){h=f(f(h*width)/w);w=width;}if(height>h){w=f(f(w*height)/h);h=height;}
 view.sprite={texture,width:w,height:h};view.offset=[f(f(random(view))*f(w-width)),f(f(random(view))*f(h-height))];view.width=width;view.height=height;view.pixelScale=pixelScale;
}
/** Matches transient readResolve initialization, with a per-observer visual Math.random branch. */
export function createOriginalCampaignBackgroundView(source,width,height,seed,pixelScale=1){
 validateOriginalCampaignBackgroundSource(source);width=num(width);height=num(height);pixelScale=num(pixelScale);check(width>0&&height>0&&pixelScale>0,'Positive background viewport required');
 const view={scope:'native-observer-background',random:createOriginalJavaRandom(seed),fields:[],sprite:null,offset:[0,0],width,height,pixelScale,wasShifted:false};
 view.fields=[starfield(view,width,height),starfield(view,width,height),starfield(view,1,1)];spriteUpdated(view,source,width,height,pixelScale);return view;
}
/** Original strip growth order and 20-unit bounds, not a new screenful on every camera move. */
function updateStars(view,field,x,y,width,height){
 const b=field.bounds,edge=n=>f(n+19)<0?0:Math.max(n,20);let left=edge(f(b.x-x)),right=edge(f(f(x+width)-f(b.x+b.width))),bottom=edge(f(b.y-y)),top=edge(f(f(y+height)-f(b.y+b.height)));
 if(left===0&&right===0&&bottom===0&&top===0)return;
 if(left>0){left=Math.min(left,width);populate(view,field,f(b.x-left),b.y,left,b.height);}
 if(right>0){right=Math.min(right,width);populate(view,field,f(b.x+b.width),b.y,right,b.height);}
 if(top>0){top=Math.min(top,height);populate(view,field,f(b.x-left),f(b.y+b.height),f(f(b.width+left)+right),top);}
 if(bottom>0){bottom=Math.min(bottom,height);populate(view,field,f(b.x-left),f(b.y-bottom),f(f(b.width+left)+right),bottom);}
 b.x=f(b.x-left);b.y=f(b.y-bottom);b.width=f(b.width+f(left+right));b.height=f(b.height+f(top+bottom));
 const lowX=f(x-20),lowY=f(y-20),highX=f(f(x+width)+20),highY=f(f(y+height)+20),oldX=b.x,oldY=b.y;
 for(const group of field.groups)for(let i=group.length-1;i>=0;i--){const p=group[i];if(p.x<lowX||p.x>highX||p.y<lowY||p.y>highY)group.splice(i,1);}
 b.x=Math.max(lowX,b.x);b.y=Math.max(lowY,b.y);b.width=f(Math.min(highX,f(oldX+b.width))-b.x);b.height=f(Math.min(highY,f(oldY+b.height))-b.y);
}
function quad(x,y,width,height,color,u0=0,v0=0,u1=1,v1=1){return [[x,y,u0,v0],[x,f(y+height),u0,v1],[f(x+width),f(y+height),u1,v1],[f(x+width),y,u1,v0]].map(([px,py,u,v])=>({position:[px,py],uv:[u,v],color:[...color]}));}
export function renderOriginalCampaignBackground(source,view,camera,pixelScale=1){
 validateOriginalCampaignBackgroundSource(source);check(view?.scope==='native-observer-background','Actual observer background required');validateOriginalJavaRandom(view.random);
 const width=num(camera.width),height=num(camera.height);pixelScale=num(pixelScale);check(width>0&&height>0&&pixelScale>0&&camera.zoom===1,'Actual current 1:1 campaign viewport required');
 if(view.width!==width||view.height!==height||view.pixelScale!==pixelScale||view.sprite.texture.path!==source.visual.texturePath)spriteUpdated(view,source,width,height,pixelScale);
 const center=camera.center.map(num),ll=[f(center[0]-f(width/2)),f(center[1]-f(height/2))],frame=createOriginalFleetDrawFrame(center),offset=view.offset;
 const s=view.sprite,e=f(.001);originalFleetDrawQuads(frame,'campaign-background',s.texture,quad(f(f(-width/2)-offset[0]),f(f(-height/2)-offset[1]),s.width,s.height,rgba(source.colorShifter.curr),e,e,f(s.texture.texWidth-e),f(s.texture.texHeight-e)),1,0);
 for(let i=0;i<3;i++)updateStars(view,view.fields[i],f(ll[0]/(2**i)),f(ll[1]/(2**i)),width,height);
 const shifted=source.particleColorShifter.data.length>0;
 if(shifted||view.wasShifted){const color=rgba(source.particleColorShifter.curr);if(color[3]<=0)return frame;for(const field of view.fields)for(const group of field.groups)for(const particle of group)particle.color=[...color];view.wasShifted=shifted;}
 for(let i=0;i<3;i++){
  const dx=i===0?0:i===1?f(ll[0]/2):f(ll[0]*f(.75)),dy=i===0?0:i===1?f(ll[1]/2):f(ll[1]*f(.75));
  for(let j=0;j<4;j++){const vertices=[];for(const p of view.fields[i].groups[j]){const half=f(-p.size/2),x=f(f(p.x+half)+dx),y=f(f(p.y+half)+dy);vertices.push(...quad(f(x-center[0]),f(y-center[1]),p.size,p.size,p.color));}originalFleetDrawQuads(frame,'campaign-stars-'+i+'-'+j,originalCampaignBackgroundTexture(R.stars[j]),vertices,770,1);}
 }
 return frame;
}
