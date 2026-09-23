/** FighterWingFormation.getFormationOffset. These coordinates are y-up, not Web screen coordinates. */
import {requireThat} from '../core/Values.mjs';
const f=Math.fround;
function offset(origin,angle,x,y){const rad=f(angle*(Math.PI/180)),sin=f(Math.sin(rad)),cos=f(Math.cos(rad));return [f(origin[0]+f(f(x*cos)-f(y*sin))),f(origin[1]+f(f(x*sin)+f(y*cos)))];}
export function originalFighterFormationOffset(type,origin,facing,leaderSpacing,spacing,index){
 requireThat(['DIAMOND','BOX','V','CLAW'].includes(type)&&Array.isArray(origin)&&origin.length===2&&Number.isInteger(index)&&index>=0,'INVALID_NATIVE_FORMATION','Actual native formation inputs required');facing=f(facing);leaderSpacing=f(leaderSpacing);spacing=f(spacing);
 if(type==='DIAMOND'||type==='BOX'){
  const positions=type==='DIAMOND'?[[0,0],[-1,1],[-1,-1],[-2,0],[-2,2],[-2,-2],[-3,1],[-3,-1],[-4,0]]:[[0,0],[0,-1],[-1,0],[-1,-1],[0,-2],[-1,-2],[-2,0],[-2,-1],[-2,-2],[0,-3],[-1,-3],[-2,-3]];
  if(index===0||index>=positions.length)return origin;if(type==='DIAMOND')spacing=f(spacing/f(1.41));return offset(origin,facing,f(positions[index][0]*spacing),f(positions[index][1]*spacing));
 }
 let location=[...origin],distance=index>0?leaderSpacing:0;const side=index%2===1?1:-1;
 if(leaderSpacing>spacing){location=offset(location,f(facing+side*90),distance,0);distance=0;}
 const half=Math.trunc((index+1)/2),angle=type==='V'?f(facing+side*130):f(f(facing+f(90*side))-f(f(half*side)*15));
 distance=f(distance+f((half>0?half-1:0)*spacing));return offset(location,angle,distance,0);
}
