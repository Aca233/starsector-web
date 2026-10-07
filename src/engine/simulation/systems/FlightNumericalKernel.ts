import { coordinateLength } from '../../math/Vector2';
import { cursorTurnCommand } from '../../runtime/PlayerControls';
export interface FlightBody { x:number;y:number;vx:number;vy:number;radius:number }
/** Same existing vector arithmetic, without transient Vector2 objects. */
export function numericFlightSteering(x:number,y:number,vx:number,vy:number,facing:number,angular:number,deceleration:number,px:number,py:number,pvx:number,pvy:number,stop:number) {
  const dx=px-x,dy=py-y,distance=coordinateLength(dx,dy),heading=Math.atan2(dy,dx);
  const angle=Math.atan2(Math.sin(heading-facing),Math.cos(heading-facing));
  const turn=cursorTurnCommand(facing,angular,heading,deceleration),closing=distance>1?((vx-pvx)*dx+(vy-pvy)*dy)/distance:0;
  const brake=distance<stop||(closing>30&&distance<stop+closing*.7);
  return {turn,brake,throttle:brake?0:Math.abs(angle)<.85?Math.min(1,distance/180):.12};
}
export function numericFlightThreatScore(px:number,py:number,pvx:number,pvy:number,radius:number,protectedShip:FlightBody,distance:number):number {
  const dx=px-protectedShip.x,dy=py-protectedShip.y,vx=pvx-protectedShip.vx,vy=pvy-protectedShip.vy;
  const speed2=vx*vx+vy*vy,time=speed2>1?-(dx*vx+dy*vy)/speed2:0;
  if(time<0||time>4)return Infinity;
  const clearance=coordinateLength(dx+vx*time,dy+vy*time)-protectedShip.radius-radius;
  return clearance>140?Infinity:time*180+distance+Math.max(0,clearance)*2;
}
