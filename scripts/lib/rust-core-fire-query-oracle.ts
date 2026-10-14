/** Differential fixture only: source-equivalent StageProducer capture, used to
 * invoke the real private planNumericFire and ordered commitFire methods. */
import {bodyKeys,weaponKeys,projectileKeys,beamKeys,BodyFlag,DamageCode,WeaponFlag,ProjectileFlag} from '../../src/engine/ai/batch/StageProtocol';
import type {StageView} from '../../src/engine/ai/batch/StageBridge';
import type {Ship} from '../../src/engine/simulation/Ship';
import type {Projectile} from '../../src/engine/simulation/Weapon';
import type {RustBodyHandle} from '../../src/engine/runtime/rust/RustCoreProtocol';
const columns=<K extends readonly string[]>(keys:K,count:number)=>Object.fromEntries(keys.map(k=>[k,new Float64Array(count)])) as {[P in K[number]]:Float64Array};
export function fireStage(ships:Ship[],shots:Projectile[],handles:RustBodyHandle[],serials:Map<number,number>):StageView{
  const mounts=ships.flatMap(s=>s.weapons),b=columns(bodyKeys,ships.length),w=columns(weaponKeys,mounts.length),p=columns(projectileKeys,shots.length);
  const geometry={xy:new Float64Array(ships.flatMap(s=>s.spec.bounds?.flat()??[])),offset:new Float64Array(ships.length),count:new Float64Array(ships.length),
    minX:new Float64Array(ships.length),minY:new Float64Array(ships.length),maxX:new Float64Array(ships.length),maxY:new Float64Array(ships.length)};
  const teams=[...new Set(ships.map(s=>s.teamId))],visibility=new Float64Array(ships.length*teams.length);let pair=0,first=0;
  ships.forEach((s,i)=>{
    const sh=s.shield,center=s.getShieldCenter(),bounds=s.spec.bounds??[];
    b.handle[i]=handles[i].slot;b.generation[i]=handles[i].generation;b.x[i]=s.pos.x;b.y[i]=s.pos.y;b.vx[i]=s.vel.x;b.vy[i]=s.vel.y;b.facing[i]=s.facingRad;b.angularVelocity[i]=s.angularVelRad;
    b.radius[i]=s.spec.collisionRadius;b.team[i]=s.teamId;b.assemblyRootRow[i]=i;b.geometryRow[i]=bounds.length>=3?i:-1;
    geometry.offset[i]=pair;geometry.count[i]=bounds.length;pair+=bounds.length;
    geometry.minX[i]=Math.min(...bounds.map(p=>p[0]));geometry.minY[i]=Math.min(...bounds.map(p=>p[1]));geometry.maxX[i]=Math.max(...bounds.map(p=>p[0]));geometry.maxY[i]=Math.max(...bounds.map(p=>p[1]));
    b.flags[i]=(s.isDead?BodyFlag.DEAD:0)|(s.isCollisionless?BodyFlag.COLLISIONLESS:0)|(s.spec.hullSize==='FIGHTER'?BodyFlag.FIGHTER:0)|(s.isPhased?BodyFlag.PHASED:0)
      |(s.flux.isOverloaded?BodyFlag.OVERLOADED:0)|(s.flux.isVenting?BodyFlag.VENTING:0)|(s.aiHoldOffensiveFire?BodyFlag.HOLD_FIRE:0);
    b.shieldX[i]=center.x;b.shieldY[i]=center.y;b.shieldRadius[i]=sh.radius;b.shieldArc[i]=sh.currentArcDeg*Math.PI/180;b.shieldFacing[i]=sh.type==='FRONT'?s.facingRad:sh.facingAngleRad;
    b.shieldType[i]=['NONE','FRONT','OMNI','PHASE'].indexOf(sh.type);b.shieldActive[i]=Number(sh.isActive&&sh.currentArcDeg>5&&sh.type!=='NONE'&&sh.type!=='PHASE');b.shieldVoid[i]=Number(!!sh.voidShield);
    b.hp[i]=s.hullHp;b.maxHp[i]=s.maxHullHp;b.fluxPercent[i]=s.flux.fluxPercent;b.overloadTimer[i]=s.flux.overloadTimer;b.ventTime[i]=s.flux.getTimeToVent();b.size[i]=['FIGHTER','FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP'].indexOf(s.spec.hullSize);
    b.weaponFirst[i]=first;b.weaponCount[i]=s.weapons.length;
    teams.forEach((team,t)=>visibility[i*teams.length+t]=Number(s.isVisibleTo(team)));
    s.weapons.forEach(m=>{const r=first++,spec=m.spec,hints=spec.aiHints??[];
      w.ownerRow[r]=i;w.angle[r]=m.currentAngleRad;w.baseAngle[r]=s.facingRad+m.baseAngleDeg*Math.PI/180;w.arc[r]=m.arcDeg*Math.PI/180;
      w.effectiveRange[r]=spec.range;w.speed[r]=spec.projSpeed;w.turnRate[r]=(spec.turnRateDegPerSec??30)*Math.PI/180;w.chargeDelay[r]=m.firingState==='CHARGING'?m.firingStateTimer:spec.isBeam?spec.beamSourceChargeupTime??0:spec.chargeTime??0;
      w.ammo[r]=m.ammo;w.maxAmmo[r]=spec.maxAmmo??Infinity;w.disabled[r]=Number(m.isDisabled);w.cooldown[r]=m.cooldownTimer;w.burstRemaining[r]=m.burstRemaining;
      w.firingState[r]=['IDLE','CHARGING','ACTIVE','CHARGEDOWN'].indexOf(m.firingState);w.projectileRadius[r]=spec.projRadius;w.damageType[r]=DamageCode[spec.type];
      w.flags[r]=(spec.isPointDefense?WeaponFlag.PD:0)|(hints.includes('PD_ONLY')?WeaponFlag.PD_ONLY:0)|(spec.isBeam?WeaponFlag.BEAM:0)|(spec.isGuided?WeaponFlag.GUIDED:0)
        |(m.mountType==='HARDPOINT'?WeaponFlag.HARDPOINT:0)|(spec.alwaysFire?WeaponFlag.ALWAYS_FIRE:0);
    });
  });
  shots.forEach((s,r)=>{p.handle[r]=serials.get(s.id)!;p.generation[r]=1;p.x[r]=s.pos.x;p.y[r]=s.pos.y;p.vx[r]=s.vel.x;p.vy[r]=s.vel.y;p.radius[r]=s.radius;p.sourceRow[r]=ships.findIndex(b=>b.id===s.sourceShipId);
    p.damage[r]=s.damage;p.damageType[r]=DamageCode[s.type];p.rangeRemaining[r]=s.rangeRemaining;p.flags[r]=s.collisionDisabled?ProjectileFlag.NO_COLLISION:0;});
  return {abi:1,active:true,valid:true,epoch:1,revision:1,kind:'FIRE_QUERY',bodyCount:ships.length,weaponCount:mounts.length,projectileCount:shots.length,beamCount:0,
    bodies:b,weapons:w,projectiles:p,beams:columns(beamKeys,0),geometry,ships,mounts,projectileRefs:shots,beamRefs:[],teams,visibility,damagedRows:new Map(),
    rowOf:new Map(ships.map((s,i)=>[s,i])),rowById:new Map(ships.map((s,i)=>[s.id,i])),mountRowOf:new Map(mounts.map((m,i)=>[m,i])),
    projectileRowOf:new Map(shots.map((s,i)=>[s,i])),projectileRowById:new Map(shots.map((s,i)=>[s.id,i])),beamRowOf:new Map(),
    recapture:()=>{throw Error('Not a live production stage');},refreshChanged:()=>{throw Error('Not a live production stage');},refreshProjectile:()=>{throw Error('Not a live production stage');},
    invalidate(){this.valid=false;},close(){this.active=false;this.valid=false;}};
}
