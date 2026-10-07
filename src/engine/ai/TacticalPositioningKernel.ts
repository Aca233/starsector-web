import { coordinateLength } from '../math/Vector2';
import { signedAngle } from '../math/Angles';

export interface PositionScore { total: number; clearFire: number; blocked: number; alliedLane: number; danger: number; escape: number }
interface Point { x: number; y: number }
export interface PositionBody extends Point { radius: number }
export interface PositionLane { start: Point; end: Point }
export interface PositionGunRow { x: number; y: number; range: number; power: number; fixed: boolean; halfArc: number;
  turretReach: number; angle: number; base: number }
export interface PositionFoeGun extends Point { range: number; power: number; facing: number; base: number; arc: number }
export interface PositionKernelInput {
  x: number; y: number; vx: number; vy: number; facing: number; target: Point; targetRadius: number;
  radius: number; range: number; relativeBearing: number; ownPower: number; desired: Point;
  acceleration: number; deceleration: number; strafeMultiplier: number; maxTurnRate: number; maxSpeed: number;
  guns: readonly PositionGunRow[]; bodies: readonly PositionBody[]; foes: readonly PositionFoeGun[]; lanes: readonly PositionLane[];
}
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
function crosses(x:number,y:number,dx:number,dy:number,length2:number,cx:number,cy:number,radius:number):boolean {
  if(length2<1)return false;
  const t=((cx-x)*dx+(cy-y)*dy)/length2;
  return t>0&&t<1&&coordinateLength(x+dx*t-cx,y+dy*t-cy)<radius;
}
function circleEntry(sx:number,sy:number,ex:number,ey:number,cx:number,cy:number,radius:number):boolean {
  const dx=ex-sx,dy=ey-sy,fx=sx-cx,fy=sy-cy,c=fx*fx+fy*fy-radius*radius;
  if(c<=0)return true;
  const a=dx*dx+dy*dy;if(a<=1e-12)return false;
  const b=2*(fx*dx+fy*dy),d=b*b-4*a*c;if(d<0)return false;
  const t=(-b-Math.sqrt(d))/(2*a);return t>=0&&t<=1;
}
/** Flat, phase-local ROOT/MODULE advisory computation. No Ship readers, object
 * vector temporaries, RNG, cadence changes, candidate truncation or new policy.
 * Operation/sum/test order deliberately matches the object oracle. */
export function positionScorer(p:PositionKernelInput):(velocity:Point)=>PositionScore {
  const c=Math.cos(p.facing),s=Math.sin(p.facing),dt=3/6;
  return velocity=>{
    let x=p.x,y=p.y,vx=p.vx,vy=p.vy;
    for(let step=0;step<6;step++){
      const dx=velocity.x-vx,dy=velocity.y-vy;
      const ax=clamp((dx*c+dy*s)/.5,-p.deceleration,p.acceleration);
      const ay=clamp((-dx*s+dy*c)/.5,-p.acceleration*p.strafeMultiplier,p.acceleration*p.strafeMultiplier);
      vx+=(ax*c-ay*s)*dt;vy+=(ax*s+ay*c)*dt;x+=vx*dt;y+=vy*dt;
    }
    const tx=p.target.x-x,ty=p.target.y-y,distance=coordinateLength(tx,ty);
    const wantedFacing=Math.atan2(ty,tx)-p.relativeBearing;
    const facing=p.facing+clamp(signedAngle(wantedFacing-p.facing),-p.maxTurnRate*3,p.maxTurnRate*3);
    const fc=Math.cos(facing),fs=Math.sin(facing);
    let clearPower=0,blockedPower=0;
    for(const g of p.guns){
      const ox=g.x*fc-g.y*fs+x,oy=g.x*fs+g.y*fc+y,dx=p.target.x-ox,dy=p.target.y-oy;
      const d=coordinateLength(dx,dy);if(d>g.range+p.targetRadius)continue;
      const heading=Math.atan2(dy,dx),extent=Math.asin(Math.min(1,p.targetRadius/Math.max(1,d)));
      if(Math.abs(signedAngle(heading-facing-g.base))>g.halfArc+extent)continue;
      if(!g.fixed&&Math.abs(signedAngle(heading-g.angle-(facing-p.facing)))>g.turretReach+extent)continue;
      const length2=dx*dx+dy*dy;
      let blocked=false;for(const body of p.bodies)if(crosses(ox,oy,dx,dy,length2,body.x,body.y,body.radius)){blocked=true;break;}
      if(blocked)blockedPower+=g.power;else clearPower+=g.power;
    }
    const clearFire=clearPower/p.ownPower,blocked=blockedPower/p.ownPower;
    let laneCount=0;for(const lane of p.lanes){const dx=lane.end.x-lane.start.x,dy=lane.end.y-lane.start.y;
      if(crosses(lane.start.x,lane.start.y,dx,dy,dx*dx+dy*dy,x,y,p.radius+12))laneCount++;}
    const alliedLane=Math.min(2,laneCount);
    let danger=0;for(const g of p.foes){const dx=x-g.x,dy=y-g.y;if(coordinateLength(dx,dy)>g.range+p.radius)continue;
      if(Math.abs(signedAngle(Math.atan2(dy,dx)-g.facing-g.base))<=g.arc)danger+=g.power/p.ownPower;}
    danger=Math.min(3,danger);
    let ax=x-p.target.x,ay=y-p.target.y;const away=coordinateLength(ax,ay);if(away>.00001){ax/=away;ay/=away;}
    const reach=Math.max(p.radius,p.maxSpeed*1.5),ex=x+ax*reach,ey=y+ay*reach;
    let exits=0;for(const b of p.bodies)if(circleEntry(x,y,ex,ey,b.x,b.y,b.radius+p.radius))exits++;
    const escape=Math.min(2,exits);
    let overlap=false;for(const b of p.bodies)if(coordinateLength(x-b.x,y-b.y)<b.radius+p.radius){overlap=true;break;}
    overlap ||= distance<p.radius+p.targetRadius+8;
    const rangeError=Math.min(2,Math.abs(distance-p.range)/Math.max(100,p.range));
    const deviation=coordinateLength(velocity.x-p.desired.x,velocity.y-p.desired.y)/Math.max(1,p.maxSpeed);
    return {total:3.2*clearFire-1.2*alliedLane-.8*danger-.5*escape-(overlap?6:0)-.65*rangeError-.18*deviation,
      clearFire,blocked,alliedLane,danger,escape};
  };
}
