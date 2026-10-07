import { coordinateLength } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { interceptTimeComponents } from './FireControlGeometry';

export const ACQUISITION_WIDTH=16;
export enum AcquisitionField { X,Y,VX,VY,Facing,Cos,Sin,Radius,Extent,ShieldX,ShieldY,ShieldRadius,ShieldArc,ShieldFacing,Team,Size }
export enum AcquisitionRole { PDOnly=1,AntiFighter=2,PassFighters=4,Strike=8,LimitedMissile=16,UseFrigates=32,PD=64 }
export interface AcquisitionInput {
  x:number;y:number;delay:number;speed:number;range:number;base:number;arc:number;beam:boolean;guided:boolean;alwaysAim:boolean;roles:number;
}
export interface AcquisitionMesh { vertices:Float64Array;minX:number;minY:number;maxX:number;maxY:number;extent:number }
export interface AcquisitionHit { row:number;x:number;y:number }
const F=AcquisitionField;
export function circleEntry(sx:number,sy:number,ex:number,ey:number,cx:number,cy:number,radius:number):number|null {
  const dx=ex-sx,dy=ey-sy,fx=sx-cx,fy=sy-cy,c=fx*fx+fy*fy-radius*radius;
  if(c<=0)return 0;
  const a=dx*dx+dy*dy;if(a<=1e-12)return null;
  const b=2*(fx*dx+fy*dy),discriminant=b*b-4*a*c;
  if(discriminant<0)return null;
  const t=(-b-Math.sqrt(discriminant))/(2*a);return t>=0&&t<=1?t:null;
}
function contains(x:number,y:number,v:Float64Array):boolean {
  let inside=false;
  for(let i=0,j=v.length-2;i<v.length;j=i,i+=2) {
    const xi=v[i],yi=v[i+1],xj=v[j],yj=v[j+1];
    if(((yi>y)!==(yj>y)) && x<((xj-xi)*(y-yi))/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
function polygonEntry(sx:number,sy:number,ex:number,ey:number,mesh:AcquisitionMesh):number|null {
  if(contains(sx,sy,mesh.vertices))return 0;
  const dx1=ex-sx,dy1=ey-sy,v=mesh.vertices;
  let first=1,found=false;
  for(let i=0,j=v.length-2;i<v.length;j=i,i+=2) {
    const ax=v[j],ay=v[j+1],dx2=v[i]-ax,dy2=v[i+1]-ay,denom=dx1*dy2-dy1*dx2;
    if(Math.abs(denom)<1e-8)continue;
    const dx3=sx-ax,dy3=sy-ay,t=(dx2*dy3-dy2*dx3)/denom,u=(dx1*dy3-dy1*dx3)/denom;
    if(t>=0&&t<=1&&u>=0&&u<=1&&t<=first){first=t;found=true;}
  }
  return found?first:contains(ex,ey,v)?1:null;
}
/** Exact current-frame hull/deployed-shield trace. No Ship/Vector2 allocation or callback. */
export function acquisitionSegmentEntry(a:Float64Array,row:number,mesh:AcquisitionMesh|undefined,
  sx:number,sy:number,ex:number,ey:number,ignoreShield=false):number|null {
  const b=row*ACQUISITION_WIDTH,x=a[b+F.X],y=a[b+F.Y];let first=Infinity;
  if(mesh) {
    const pad=1e-7*Math.max(1,Math.abs(sx),Math.abs(sy),Math.abs(ex),Math.abs(ey),Math.abs(x),Math.abs(y),mesh.extent);
    const extent=mesh.extent+pad;
    if(!(Math.max(sx,ex)<x-extent||Math.min(sx,ex)>x+extent||Math.max(sy,ey)<y-extent||Math.min(sy,ey)>y+extent)) {
      const c=a[b+F.Cos],s=a[b+F.Sin],dx=sx-x,dy=sy-y,dx2=ex-x,dy2=ey-y;
      const lx=dx*c-dy*s,ly=dx*s+dy*c,rx=dx2*c-dy2*s,ry=dx2*s+dy2*c;
      const localPad=1e-7*Math.max(1,Math.abs(lx),Math.abs(ly),Math.abs(rx),Math.abs(ry),Math.abs(mesh.minX),Math.abs(mesh.minY),Math.abs(mesh.maxX),Math.abs(mesh.maxY));
      if(!(Math.max(lx,rx)<mesh.minX-localPad||Math.min(lx,rx)>mesh.maxX+localPad||Math.max(ly,ry)<mesh.minY-localPad||Math.min(ly,ry)>mesh.maxY+localPad))
        first=polygonEntry(lx,ly,rx,ry,mesh)??Infinity;
    }
  } else first=circleEntry(sx,sy,ex,ey,x,y,a[b+F.Radius])??Infinity;
  const arc=a[b+F.ShieldArc];
  if(!ignoreShield&&arc>5) {
    const cx=a[b+F.ShieldX],cy=a[b+F.ShieldY],t=circleEntry(sx,sy,ex,ey,cx,cy,a[b+F.ShieldRadius]);
    if(t!==null) {
      const hitX=sx+(ex-sx)*t,hitY=sy+(ey-sy)*t;
      let diff=Math.atan2(hitY-cy,hitX-cx)-a[b+F.ShieldFacing];
      while(diff>Math.PI)diff-=Math.PI*2;while(diff< -Math.PI)diff+=Math.PI*2;
      if(Math.abs(diff)<=arc*Math.PI/360)first=Math.min(first,t);
    }
  }
  return Number.isFinite(first)?first:null;
}
function permitted(size:number,roles:number):boolean {
  if(roles&AcquisitionRole.PDOnly && !(size===1&&roles&AcquisitionRole.AntiFighter))return false;
  if(size===1) {
    if(roles&AcquisitionRole.PassFighters)return false;
    if(!(roles&(AcquisitionRole.PD|AcquisitionRole.AntiFighter)) && roles&(AcquisitionRole.Strike|AcquisitionRole.LimitedMissile))return false;
  }
  return !(size===2&&roles&AcquisitionRole.Strike&&!(roles&AcquisitionRole.UseFrigates));
}
/** Whole ship acquisition: conservative rejection, stable intercept, range/arc,
 * and exact contact. Returns a point only for accepted targets. */
export function acquireNumericShip(a:Float64Array,meshes:readonly (AcquisitionMesh|undefined)[],own:number,other:number,
  input:AcquisitionInput,eligible:Uint8Array,qualify=true):AcquisitionHit|null {
  const b=other*ACQUISITION_WIDTH,o=own*ACQUISITION_WIDTH;
  if(qualify&&(!eligible[other]||!permitted(a[b+F.Size],input.roles)))return null;
  const vx=a[b+F.VX]-a[o+F.VX],vy=a[b+F.VY]-a[o+F.VY],radius=a[b+F.Extent],limit=input.range+radius;
  const horizon=input.delay+(input.beam?0:limit/input.speed),reach=limit+(Math.abs(vx)+Math.abs(vy))*horizon;
  const distance=Math.max(Math.abs(a[b+F.X]-input.x),Math.abs(a[b+F.Y]-input.y));
  const pad=1e-6*Math.max(1,Math.abs(a[b+F.X]),Math.abs(a[b+F.Y]),Math.abs(input.x),Math.abs(input.y),Math.abs(reach));
  if(input.speed>0&&input.delay>=0&&limit>=0&&horizon>=0&&Number.isFinite(reach)&&distance>reach+pad)return null;
  const px=a[b+F.X]-input.x+vx*input.delay,py=a[b+F.Y]-input.y+vy*input.delay;
  const time=input.beam?0:interceptTimeComponents(px,py,vx,vy,input.speed);if(time===null)return null;
  const x=input.x+px+vx*time,y=input.y+py+vy*time;if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const dx=x-input.x,dy=y-input.y,d=Math.hypot(dx,dy);
  if(d>input.range+radius)return null;
  const half=Math.asin(Math.min(1,radius/Math.max(1,d))),angle=Math.atan2(dy,dx);
  if(!input.alwaysAim&&input.arc<360&&Math.abs(signedAngle(angle-input.base))>input.arc*Math.PI/360+half)return null;
  if(!input.guided) {
    // Original traceTarget constructs own-minus-target relative velocity.
    const rvx=a[o+F.VX]-a[b+F.VX],rvy=a[o+F.VY]-a[b+F.VY];
    const sx=input.x+rvx*input.delay,sy=input.y+rvy*input.delay,t=input.beam?0:input.range/Math.max(1e-6,input.speed);
    const ex=sx+Math.cos(angle)*input.range+rvx*t,ey=sy+Math.sin(angle)*input.range+rvy*t;
    if(acquisitionSegmentEntry(a,other,meshes[other],sx,sy,ex,ey)===null)return null;
  }
  return {row:other,x,y};
}
export function nearestNumericPreAim(a:Float64Array,meshes:readonly (AcquisitionMesh|undefined)[],own:number,
  scope:Uint32Array,current:number|undefined,input:AcquisitionInput,eligible:Uint8Array):AcquisitionHit|null {
  if(current!==undefined) {const hit=acquireNumericShip(a,meshes,own,current,input,eligible);if(hit)return hit;}
  let best:AcquisitionHit|null=null,distance=Infinity;
  for(const row of scope) {
    if(!eligible[row])continue;
    const b=row*ACQUISITION_WIDTH,d=coordinateLength(input.x-a[b+F.X],input.y-a[b+F.Y]);if(d>=distance)continue;
    const hit=acquireNumericShip(a,meshes,own,row,input,eligible);if(hit){best=hit;distance=d;}
  }
  return best;
}
