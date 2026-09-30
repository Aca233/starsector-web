import type { WeaponSpec } from '../simulation/Weapon';
import type { ShipSpec } from './ShipSpec';
/** Independent authored defaults. No native weapon or hull is cloned. Shared projectile art/audio is retained by user request. */
export function originalWeapon(kind: 'gun' | 'energy' | 'beam' | 'missile' = 'gun'): WeaponSpec {
  return { id:'unassigned', nameKey:'unassigned', type:kind==='gun'?'KINETIC':kind==='missile'?'HIGH_EXPLOSIVE':'ENERGY',
    mountSize:'SMALL', weaponType:kind==='gun'?'BALLISTIC':kind==='missile'?'MISSILE':'ENERGY',
    isBeam:kind==='beam', spawnType:kind==='beam'?'BEAM':kind==='missile'?'MISSILE':kind==='energy'?'PLASMA':'BALLISTIC',
    damagePerShot:0,damagePerSecond:0,fluxPerShot:0,range:500,refireDelay:1,projSpeed:900,projRadius:3,
    color:[135,215,255],burstSize:1,burstDelay:0,turnRateDegPerSec:90,
    turretOffsets:[0,0],hardpointOffsets:[0,0],soundKey:'web_fire',
    ...(kind==='gun'?{fadeTime:.35,projLength:24}:kind==='energy'?{fadeTime:.45}:{}),
    ...(kind==='beam'?{fluxPerSecond:0,beamWidth:5,beamSpeed:3000}:{}),
    ...(kind==='missile'?{missileHp:100,maxSpeed:400,launchSpeed:120,engineAcceleration:350,maxTurnRate:1,maxTurnAcceleration:2,flightTime:6,
      projSpriteUrl:'/game-assets/graphics/missiles/missile_torpedo.png',proximityFuse:{range:15,explosionRadius:70},missileLifecycleSpec:{flameoutTime:.5,noEngineGlowTime:0,fadeTime:.5,dudProbabilityOnFlameout:0,collisionClassAfterFlameout:'MISSILE_NO_FF',fizzleOnReachingWeaponRange:false,noCollisionWhileFading:true,reduceDamageWhileFading:true}}:{}),
  };
}
export function originalCraft(): ShipSpec {
  return {id:'unassigned',nameKey:'unassigned',descKey:'unassigned',designationKey:'unassigned',hullSize:'FIGHTER',
    spriteUrl:'',spriteWidth:64,spriteHeight:64,pivotX:32,pivotY:32,collisionRadius:30,mass:50,
    maxSpeed:200,acceleration:250,deceleration:250,maxTurnRateDeg:120,turnAccelerationDeg:240,
    hitpoints:500,armorRating:100,armorCols:5,armorRows:5,maxFlux:500,fluxDissipation:100,
    shieldType:'NONE',shieldArcDeg:0,shieldRadius:30,shieldEfficiency:1,systemType:'NONE',weaponSlots:[],engineSlots:[],bounds:[]};
}
