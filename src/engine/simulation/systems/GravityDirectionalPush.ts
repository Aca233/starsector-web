import { Vector2 } from '../../math/Vector2';
import { sameTeam } from '../CombatTeams';
import type { Ship } from '../Ship';
import type { ShipSystem } from '../ShipSystem';
import type { GravityWorld, GravityBody } from './GravityTractor';
import { resolveGravityBody, liveGravityShip, sameGravityTarget, pickGravityPushBody, gravityPushLineValid } from './GravityTractor';
import { cursorGravityOwnsAim } from './GravityControlInput';
/** Called only in the authoritative external-force phase. */
export function updateDirectionalGravity(owner: Ship, system: ShipSystem, world: GravityWorld, dt: number): GravityBody | undefined {
  const spec=system.definition.gravityDirectionalPush;
  if (!spec) return;
  if (!liveGravityShip(owner) || owner.isAttachedModule || owner.retreating || owner.fireControlMode!=='MANUAL'
    || owner.flux.isVenting || owner.flux.isOverloaded || system.disabled || (owner.runtimeModifiers.value.disableSystems??0)>0
    || !system.gravityControlHeld || system.state!=='ACTIVE') { system.deactivate(); return; }
  const state=system.gravityPush??={x:owner.pos.x,y:owner.pos.y,radius:0,dx:0,dy:0,age:0,status:'对准实体推送'};
  const mount=owner.weapons.find(m=>m.spec.gravityTractor&&!m.isDisabled);
  if(!mount){state.target=undefined;state.status='主场投射器离线';return;}
  const held=owner.weapons.flatMap(m=>m.gravityTractor?.phase==='HOLD' && m.gravityTractor.target ? [m.gravityTractor.target] : []);
  const range=spec.range*owner.hullStats.systemRangeMultiplier;
  const valid=(body?:GravityBody)=>{
    if(!body||!gravityPushLineValid(owner,body,range,world))return false;
    return body.ship!==owner.assemblyRoot && !held.some(target=>sameGravityTarget(target,body.target))
      && !(body.ship&&sameTeam(owner,body.ship)) && !(body.projectile&&sameTeam(owner,body.projectile));
  };
  let body=state.target?resolveGravityBody(state.target,world):undefined;
  if(!valid(body)) body=undefined;
  const fieldOwnsAim=cursorGravityOwnsAim(owner);
  if(!body&&!fieldOwnsAim) body=pickGravityPushBody(owner,mount,owner.aimTargetWorld,range,world,held);
  if(!body){state.target=undefined;state.status=fieldOwnsAim?'区域操纵中':'对准实体推送';return;}
  if(!fieldOwnsAim){
    const direction=owner.aimTargetWorld.clone().sub(owner.pos);
    if(Number.isFinite(direction.x)&&Number.isFinite(direction.y)&&direction.length()>1e-6){direction.normalize();state.dx=direction.x;state.dy=direction.y;}
  }
  if(Math.hypot(state.dx,state.dy)<1e-6){const forward=Vector2.fromAngle(owner.facingRad);state.dx=forward.x;state.dy=forward.y;}
  state.target=body.target;state.x=body.pos.x;state.y=body.pos.y;state.radius=body.radius;state.age+=dt;
  state.status='定向推送';
  return body;
}
