/** Starsector 0.98a-RC8 ContrailEngineV2. State plus render-time quad strips, not a GPU renderer.
 * Campaign keys are Java Strings. Arbitrary plugin keys/tree bins require an actual native map adapter.
 * No writeReplace rounding: Web checkpoints preserve the live graph rather than mutate it like XStream. */
import {requireThat} from '../core/Values.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CAMPAIGN_CONTRAILS',m);
const scalar=n=>{check(typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(f(n)),'Finite native contrail input required');return f(n);};
const vec=v=>{check(Array.isArray(v)&&v.length===2,'Actual Vector2f required');scalar(v[0]);scalar(v[1]);return v;};
const sub=(a,b)=>[f(a[0]-b[0]),f(a[1]-b[1])],dot=(a,b)=>f(f(a[0]*b[0])+f(a[1]*b[1]));
const len=v=>f(Math.sqrt(dot(v,v))),distance=(a,b)=>len(sub(a,b));
const copy=v=>[f(v[0]),f(v[1])];
const hash=s=>{let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(h,31)+s.charCodeAt(i))|0;return (h^(h>>>16))>>>0;};
const key=k=>{check(typeof k==='string','Campaign contrail key must be an actual Java String');return k;};
const bucket=(s,c)=>hash(s)&(c-1);
const find=(engine,source)=>engine.contrails.find(c=>c.source===key(source));
function config(c,p){
 check(p&&Array.isArray(p.color)&&p.color.length===4&&p.color.every(x=>Number.isInteger(x)&&x>=0&&x<=255),'Actual contrail RGBA required');
 check(['WIDEN','NARROW','CONSTANT'].includes(p.mode)&&['GLOW','SMOKE'].includes(p.blendMode),'Actual contrail width/blend enum required');
 c.color=p.color;for(const k of ['width','duration','minSegLength','maxSegLength','widthMultiplier'])c[k]=scalar(p[k]);c.mode=p.mode;c.blendMode=p.blendMode;
}
export function createOriginalCampaignContrails(){return {scope:'native-campaign-contrail-engine-v2',capacity:0,contrails:[]};}
export function initOriginalCampaignContrail(engine,source,params){
 key(source);const c={source,texturePath:'graphics/fx/contrail64b.png',remove:false,points:[],totalLength:0,lastPoint:null};config(c,params);check(typeof params.autoCleanup==='boolean','Actual autoCleanup flag required');c.autoCleanup=params.autoCleanup;
 const at=engine.contrails.findIndex(row=>row.source===source);if(at>=0){engine.contrails[at]=c;return c;}
 let cap=engine.capacity||16;const count=engine.contrails.filter(row=>bucket(row.source,cap)===bucket(source,cap)).length+1;
 if(count>8){check(cap<64,'Treeified contrail map requires native comparator restoration');cap*=2;}
 if(engine.contrails.length+1>cap*.75)cap*=2;
 engine.capacity=cap;engine.contrails.push(c);engine.contrails.sort((a,b)=>bucket(a.source,cap)-bucket(b.source,cap));return c;
}
export function updateOriginalCampaignContrail(engine,source,params){const c=find(engine,source);if(c)config(c,params);return c??null;}
export function getOriginalCampaignContrail(engine,source){return find(engine,source)??null;}
export function clearOriginalCampaignContrails(engine){engine.contrails.length=0;}
function newPoint(){return {point:null,dirToNext:null,perp:null,vel:null,width:0,duration:3,maxWidth:0,maxBrightness:0,elapsed:0,progress:0,distToPrev:0,texCoord:0,fadeOut:false,origMax:1,lastProximityMult:1,elapsedWhenFadeOut:1000};}
const append=(c,p)=>{c.totalLength=f(c.totalLength+p.distToPrev);c.points.push(p);};
export function addOriginalCampaignContrailPoint(engine,source,position,velocity,brightness){
 const c=find(engine,source);if(!c)return;vec(position);vec(velocity);brightness=scalar(brightness);
 const last=c.points.at(-1);if(last&&dot(sub(last.point,position),sub(last.point,position))<f(c.minSegLength*c.minSegLength))return;
 const previousSource=c.lastPoint===null?null:copy(c.lastPoint);c.lastPoint=copy(position);
 const p=newPoint();p.point=copy(position);p.width=c.width;p.maxWidth=c.width;p.maxBrightness=brightness;p.vel=velocity;p.duration=c.duration;
 if(!last){p.perp=[0,1];p.maxBrightness=0;append(c,p);return;}
 const dist=distance(last.point,position);if(c.points.length>=2&&dist<c.minSegLength)return;
 const direction=sub(p.point,last.point);p.distToPrev=len(direction);
 if(dot(direction,direction)>2**-149){const inv=f(1/len(direction));direction[0]=f(direction[0]*inv);direction[1]=f(direction[1]*inv);}
 const perp=[direction[1],f(-direction[0])];last.dirToNext=direction;p.perp=perp;p.texCoord=f(last.texCoord+f(p.distToPrev/256));
 if(c.points.length===1)p.maxBrightness=0;
 else if(dist>c.maxSegLength){
  if(previousSource!==null){const end=newPoint();Object.assign(end,{point:previousSource,width:f(last.width*.5),maxWidth:f(last.width*.5),maxBrightness:0,vel:copy(last.vel),duration:last.duration,perp:copy(last.perp),dirToNext:copy(last.dirToNext),texCoord:last.texCoord});append(c,end);}
  const start=newPoint();Object.assign(start,{point:copy(position),width:c.width,maxWidth:c.width,maxBrightness:0,vel:copy(last.vel),duration:c.duration,perp:copy(perp),dirToNext:copy(last.dirToNext)});append(c,start);
 }
 append(c,p);
}
export function terminateOriginalCampaignContrail(engine,source){
 const c=find(engine,source);if(!c||c.points.length<2)return;const last=c.points.at(-1),previous=c.points.at(-2);
 addOriginalCampaignContrailPoint(engine,source,[f(f(previous.dirToNext[0]*20)+last.point[0]),f(f(previous.dirToNext[1]*20)+last.point[1])],last.vel,0);
}
export function removeOriginalCampaignContrail(engine,source){const c=find(engine,source);if(!c)return;c.remove=true;terminateOriginalCampaignContrail(engine,source);}
export function advanceOriginalCampaignContrails(engine,seconds){
 seconds=scalar(seconds);const remove=[];
 for(const c of engine.contrails){
  for(const p of c.points){
   p.elapsed=f(p.elapsed+seconds);if(c.remove)p.elapsed=f(p.elapsed+f(seconds/3));if(p.elapsed>p.duration)p.elapsed=p.duration;p.progress=f(p.elapsed/p.duration);
   if(p.fadeOut)p.maxBrightness=Math.max(0,f(p.maxBrightness-f(seconds*2)));
   if(c.mode==='WIDEN')p.width=f(p.maxWidth*f(f(p.progress*c.widthMultiplier)+1));
   else if(c.mode==='NARROW')p.width=f(p.maxWidth*f(.25+f(f(1-p.progress)*.75)));
   if(!c.remove){p.point[0]=f(p.point[0]+f(p.vel[0]*seconds));p.point[1]=f(p.point[1]+f(p.vel[1]*seconds));}
  }
  while(c.points.length>=3){const [a,b,d]=c.points;if(a.elapsed>=a.duration&&b.elapsed>=b.duration&&d.elapsed>=d.duration){c.points.shift();c.totalLength=f(c.totalLength-b.distToPrev);b.distToPrev=0;}else{a.maxBrightness=0;break;}}
  if((c.remove||c.autoCleanup)&&c.points.length<3&&!c.points.some(p=>p.elapsed<p.duration))remove.push(c);
 }
 for(const c of remove)engine.contrails.splice(engine.contrails.indexOf(c),1);
}
// fs.common util/oOOO: preserve its asymmetric collinear endpoint check (not a generic segment library).
function intersects(a,b,c,d){
 const den=f(f(f(d[1]-c[1])*f(b[0]-a[0]))-f(f(d[0]-c[0])*f(b[1]-a[1])));
 const u=f(f(f(d[0]-c[0])*f(a[1]-c[1]))-f(f(d[1]-c[1])*f(a[0]-c[0])));
 const v=f(f(f(b[0]-a[0])*f(a[1]-c[1]))-f(f(b[1]-a[1])*f(a[0]-c[0])));
 if(den===0){if(u!==0||v!==0)return false;return [c,d].some(p=>p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]));}
 const t=f(u/den),s=f(v/den);return t>=0&&t<=1&&s>=0&&s<=1;
}
function edges(p){const scale=f(f(p.width/2)*1.5),x=f(p.perp[0]*scale),y=f(p.perp[1]*scale);return [[f(p.point[0]-x),f(p.point[1]-y)],[f(p.point[0]+x),f(p.point[1]+y)]];}
const fade=p=>{if(!p.fadeOut){p.origMax=p.maxBrightness;p.elapsedWhenFadeOut=p.elapsed;}p.fadeOut=true;};
const byte=n=>(Number.isNaN(n)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(n))))&255;
function pair(strip,p,position,divisor,alpha){
 const rgba=[...strip.color.slice(0,3),alpha];
 for(const sign of [-1,1])strip.vertices.push({position:[f(position[0]+f(sign*f(f(p.perp[0]*p.width)/divisor))),f(position[1]+f(sign*f(f(p.perp[1]*p.width)/divisor)))],uv:[p.texCoord,f(sign<0?.01:.99)],color:rgba});
}
/** Native render mutates fade/proximity state. Call once per actual render, never as a read-only digest.
 * Produces GL_QUAD_STRIP vertex pairs; the Web GPU adapter still has to submit them. */
export function renderOriginalCampaignContrails(engine,alpha=1){
 alpha=scalar(alpha);const strips=[];let lastFaded=null;
 for(const c of engine.contrails){
  if(c.points.length<=1){for(const p of c.points)p.maxBrightness=0;continue;}
  const strip={source:c.source,texturePath:c.texturePath,blendSrc:'SRC_ALPHA',blendDest:c.blendMode==='GLOW'?'ONE':'ONE_MINUS_SRC_ALPHA',primitive:'QUAD_STRIP',color:c.color,vertices:[]};let previous=null;
  for(let i=0;i<c.points.length;i++){
   const p=c.points[i],next=c.points[i+1]??null;let elapsed=Math.min(p.elapsed,p.elapsedWhenFadeOut),fadeIn=f(.1);if(fadeIn>f(p.duration/2))fadeIn=f(p.duration/2);
   let brightness=elapsed<fadeIn?f(elapsed/fadeIn):f(f(p.duration-elapsed)/f(p.duration-fadeIn));if(brightness>1)brightness=1;brightness=f(brightness*alpha);
   if(next){const e=edges(p);if(intersects(...e,...edges(next)))fade(p);else if(previous){if(intersects(...e,...edges(previous)))fade(p);if(brightness>0&&dot(sub(previous.point,p.point),sub(next.point,p.point))>0)fade(p);}}
   if(i===0)brightness=0;if(p.fadeOut)lastFaded=p;
   if(lastFaded!==null){const mult=lastFaded.origMax>0?f(1-f(lastFaded.maxBrightness/lastFaded.origMax)):1;let proximity=f(f(1-mult)+f(mult*Math.min(1,f(distance(p.point,lastFaded.point)/50))));if(proximity>p.lastProximityMult)proximity=p.lastProximityMult;p.lastProximityMult=proximity;brightness=f(brightness*proximity);}
   pair(strip,p,p.point,2,byte(f(f(c.color[3]*p.maxBrightness)*brightness)));previous=p;
  }
  if(c.lastPoint!==null&&previous!==null)pair(strip,previous,c.lastPoint,4,0);strips.push(strip);
 }
 return {scope:'native-campaign-contrail-quad-strips',strips};
}
export function validateOriginalCampaignContrails(engine){
 check(engine?.scope==='native-campaign-contrail-engine-v2'&&Array.isArray(engine.contrails),'Actual native contrail engine required');
 const cap=engine.capacity;check(Number.isInteger(cap)&&(cap===0||cap>=16&&cap<=2**30&&(cap&(cap-1))===0),'Invalid contrail HashMap capacity');
 check(cap!==0||engine.contrails.length===0,'Unallocated nonempty contrail map');const seen=new Set();let previous=-1;
 for(const c of engine.contrails){key(c.source);check(!seen.has(c.source),'Duplicate contrail source');seen.add(c.source);const at=bucket(c.source,cap);check(at>=previous,'Lost native contrail bucket order');previous=at;check(c.texturePath==='graphics/fx/contrail64b.png'&&typeof c.remove==='boolean'&&typeof c.autoCleanup==='boolean'&&Array.isArray(c.points),'Invalid contrail state');config({...c},c);scalar(c.totalLength);if(c.lastPoint!==null)vec(c.lastPoint);
  for(const p of c.points){vec(p.point);vec(p.vel);vec(p.perp);if(p.dirToNext!==null)vec(p.dirToNext);check(typeof p.fadeOut==='boolean','Invalid point fadeOut');for(const k of ['width','duration','maxWidth','maxBrightness','elapsed','distToPrev','texCoord','origMax','lastProximityMult','elapsedWhenFadeOut'])scalar(p[k]);check(typeof p.progress==='number','Invalid point progress');}
 }
 return engine;
}
