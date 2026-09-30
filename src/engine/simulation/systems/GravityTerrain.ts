import { Vector2 } from '../../math/Vector2';
import { distanceToSegment, polygonArea } from '../../visual/HulkGeometry';
import { getHullCircleContact, type HullCircleContact, type HullCollisionSurface } from '../collision/HullGeometry';
import { getShieldCircleContact } from '../collision/ShieldCollisionGeometry';
import { applyComponentDamage } from './weapon/ComponentDamage';
import type { Ship } from '../Ship';
import type { HulkFragment } from '../CombatTypes';
import type { AsteroidFXCallbacks } from './AsteroidSystem';

function intersection(a:Vector2,b:Vector2,c:Vector2,d:Vector2):Vector2|undefined {
  const ab=b.clone().sub(a),cd=d.clone().sub(c),cross=ab.x*cd.y-ab.y*cd.x;
  if(Math.abs(cross)<1e-9)return;
  const ac=c.clone().sub(a),t=(ac.x*cd.y-ac.y*cd.x)/cross,u=(ac.x*ab.y-ac.y*ab.x)/cross;
  if(t>=0 && t<=1 && u>=0 && u<=1)return a.clone().addScaled(ab,t);
}
function polygonContact(ship:Ship,surface:HullCollisionSurface,points:Vector2[]):HullCircleContact|undefined {
  let best:HullCircleContact|undefined;
  const add=(next:HullCircleContact|null,reverse=false)=>{
    if(next && (!best || next.penetration>best.penetration))best={...next,normal:next.normal.clone().scale(reverse?-1:1)};
  };
  for(const p of points)add(getHullCircleContact(ship,p,0));
  const shipPoints=ship.spec.bounds.map(([x,y])=>new Vector2(x,y).rotate(ship.facingRad).add(ship.pos));
  for(const p of shipPoints)add(getHullCircleContact(surface,p,0),true);
  if(best)return best;
  // Crossing thin polygons can overlap without containing either set of vertices.
  const crossings:Vector2[]=[];
  for(let i=0;i<points.length;i++)for(let j=0;j<shipPoints.length;j++){
    const p=intersection(points[i],points[(i+1)%points.length],shipPoints[j],shipPoints[(j+1)%shipPoints.length]);if(p)crossings.push(p);
  }
  if(crossings.length>=2){
    const center=crossings.reduce((p,q)=>p.add(q),new Vector2()).scale(1/crossings.length);
    add(getHullCircleContact(ship,center,0));add(getHullCircleContact(surface,center,0),true);
  }
  return best;
}
/** Only gravity-managed wrecks gain this extension. Their real polygon, motion,
 * projectile blocker and AI obstacle share the same owner and live position. */
export function advanceGravityTerrain(dt:number,ships:readonly Ship[],hulks:readonly HulkFragment[],fx:AsteroidFXCallbacks):void {
  for(const h of hulks){
    if(!h.gravityManaged && !h.gravityFixed)continue;
    if(!h.gravityFixed){h.pos.addScaled(h.vel,dt);h.facingRad+=h.angularVel*dt;}
    const bounds=h.bounds.map(p=>[p.x-h.localOffset.x,p.y-h.localOffset.y] as [number,number]);
    const surface:HullCollisionSurface={pos:h.pos,facingRad:h.facingRad,spec:{bounds,collisionRadius:h.collisionRadius}};
    const hMass=Math.max(50,h.sourceShip.spec.mass*Math.abs(polygonArea(h.bounds))/Math.max(1,Math.abs(polygonArea(h.sourceShip.spec.bounds.map(([x,y])=>new Vector2(x,y))))));
    for(const ship of ships){
      if(ship.isDead || ship.isCollisionless || ship.isRetreated || ship.isDocked)continue;
      const hullRadius=Math.max(ship.spec.collisionRadius,...ship.spec.bounds.map(([x,y])=>Math.hypot(x,y)));
      const shieldRadius=ship.shield.isActive?ship.shield.radius+ship.getShieldCenter().distanceTo(ship.pos):0;
      if(ship.pos.distanceTo(h.pos)>Math.max(hullRadius,shieldRadius)+h.collisionRadius)continue;
      const points=bounds.map(([x,y])=>new Vector2(x,y).rotate(h.facingRad).add(h.pos));
      const shieldPoints=[...points];
      if(ship.shield.isActive){
        const center=ship.getShieldCenter();
        for(let i=0;i<points.length;i++){
          const a=points[i],b=points[(i+1)%points.length],t=distanceToSegment(center,a,b).t;
          shieldPoints.push(a.clone().addScaled(b.clone().sub(a),t));
        }
      }
      const shield=shieldPoints.map(p=>getShieldCircleContact(ship,p,0)).filter(c=>!!c).sort((a,b)=>b.penetration-a.penetration)[0];
      const contact=shield??polygonContact(ship,surface,points);if(!contact)continue;
      const root=ship.assemblyRoot,invShip=root.isStation?0:1/Math.max(1,root.assemblyShips.reduce((n,s)=>n+s.spec.mass,0)),invH=h.gravityFixed?0:1/hMass;
      if(invShip+invH<=0)continue;
      const share=invShip/(invShip+invH),normal=contact.normal,closing=ship.vel.clone().sub(h.vel).dot(normal);
      root.pos.subScaled(normal,contact.penetration*share);h.pos.addScaled(normal,contact.penetration*(1-share));root.syncModuleTree();
      if(closing<=0)continue;
      root.vel.subScaled(normal,closing*.8*share);if(!h.gravityFixed)h.vel.addScaled(normal,closing*.8*(1-share));
      if(closing<=20)continue;
      let raw=Math.min(600,closing*8*share);
      if(shield){
        const angle=contact.point.clone().sub(ship.getShieldCenter()).heading(),impact=ship.shield.absorbImpact(raw*ship.crDamageTakenMultiplier,'KINETIC',angle);
        ship.flux.increaseShieldFlux(impact.flux,true);raw*=impact.remainingFraction;fx.spawnShieldRipple(contact.point,30,[90,190,230]);
      }
      if(raw>0){
        const local=contact.point.clone().sub(ship.pos).rotate(-ship.facingRad),damage=ship.armor.takeDamage(local,raw*ship.crDamageTakenMultiplier,'KINETIC',raw,false);
        applyComponentDamage(ship,local,damage,0);ship.applyHullDamage(damage.hullDamage);fx.spawnArmorDamageSparks(ship,local,damage.armorDamage);
        if(damage.hullDamage>0)fx.addFloatingDamage(contact.point,damage.hullDamage,[255,90,70]);
      }
    }
  }
}
