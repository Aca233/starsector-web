import art from './rocinante-armory-art.json';
import type { WeaponSpec, MissileLifecycleSpec } from '../simulation/Weapon';
import { rocinantePdcArt } from './RocinanteInstallation';

export const ROCINANTE_WEAPONS = {
  pdc: 'web_expanse_rocinante_pdc',
  railgun: 'web_expanse_rocinante_railgun',
  torpedo_agile: 'web_expanse_rocinante_torpedo_agile',
  torpedo_heavy: 'web_expanse_rocinante_torpedo_heavy',
} as const;
export type RocinanteWeaponKind = keyof typeof ROCINANTE_WEAPONS;

const missileLifecycle: MissileLifecycleSpec = {
  flameoutTime: 1, noEngineGlowTime: .25, fadeTime: .5,
  dudProbabilityOnFlameout: 1, collisionClassAfterFlameout: 'NONE',
  fizzleOnReachingWeaponRange: true, noCollisionWhileFading: true, reduceDamageWhileFading: true,
};
const common = {
  isBeam: false, burstSize: 1, burstDelay: 0, minSpread: 0, maxSpread: 0,
  spreadPerShot: 0, spreadDecay: 0, color: [226, 215, 191] as [number, number, number],
};
const torpedo = {
  ...common, mountSize: 'MEDIUM' as const, weaponType: 'MISSILE' as const, type: 'HIGH_EXPLOSIVE' as const,
  spawnType: 'MISSILE' as const, isRocket: true, isGuided: true, isTwoStage: false,
  range: 1600, turnRateDegPerSec: 0, armingTime: .2, ammoRegenPerSec: 0,
  missileLifecycleSpec: missileLifecycle, ordnancePointCost: 10, aiHints: ['AVOID_SHIELDS'],
  // Contact warheads only in v1: no pretend area damage or invisible proximity fuse.
};

/** Web balance rules, NOT canon performance. Kept separate from production
 * media so authority probes do not depend on a renderer. Registration is owned
 * by ModManager; rocinanteWeapons() below assembles the shipped armory. */
const rules: Record<RocinanteWeaponKind, WeaponSpec> = {
  pdc: {
    ...common, id: ROCINANTE_WEAPONS.pdc, nameKey: '罗西南特 · 快射近防炮',
    mountSize: 'SMALL', weaponType: 'BALLISTIC', type: 'FRAGMENTATION', isPointDefense: true,
    damagePerShot: 10, damagePerSecond: 150, fluxPerShot: 3, range: 550, refireDelay: 1 / 15,
    projSpeed: 1600, projRadius: .7, spawnType: 'BALLISTIC', fadeTime: .12, projLength: 13, projWidth: 1.2,
    turnRateDegPerSec: 210, minSpread: .25, maxSpread: 2, spreadPerShot: .12, spreadDecay: 5,
    maxAmmo: 60, ammoRegenPerSec: 6, ordnancePointCost: 0, aiHints: ['PD'],
  },
  railgun: {
    ...common, id: ROCINANTE_WEAPONS.railgun, nameKey: '罗西南特 · 改装轴向轨炮',
    mountSize: 'MEDIUM', weaponType: 'BALLISTIC', type: 'KINETIC',
    damagePerShot: 700, damagePerSecond: 700 / 4.5, fluxPerShot: 480, range: 1350,
    chargeTime: .35, refireDelay: 4.15, projSpeed: 2600, projRadius: 1.5,
    spawnType: 'BALLISTIC', fadeTime: .18, projLength: 60, projWidth: 1.8,
    turnRateDegPerSec: 0, fireRecoilSpeed: 6, ordnancePointCost: 0,
    passThroughMissiles: true, passThroughFighters: true, passThroughFightersOnlyWhenDestroyed: true,
    terrainPenetration: { maxRadius: 10, minDamageCost: 150, wreckDamagePerRadius: 15 },
  },
  torpedo_agile: {
    ...torpedo, id: ROCINANTE_WEAPONS.torpedo_agile, nameKey: '罗西南特 · 灵活追踪鱼雷',
    damagePerShot: 900, damagePerSecond: 450, fluxPerShot: 80, refireDelay: 2,
    projSpeed: 320, projRadius: 3, launchSpeed: 90, maxSpeed: 320, engineAcceleration: 240,
    missileDeceleration: 160, maxTurnRate: 100 * Math.PI / 180, maxTurnAcceleration: 220 * Math.PI / 180,
    flightTime: 5.8, maxAmmo: 8, missileHp: 100,
  },
  torpedo_heavy: {
    ...torpedo, id: ROCINANTE_WEAPONS.torpedo_heavy, nameKey: '罗西南特 · 重战斗部鱼雷',
    damagePerShot: 1500, damagePerSecond: 500, fluxPerShot: 100, refireDelay: 3,
    projSpeed: 250, projRadius: 4, launchSpeed: 70, maxSpeed: 250, engineAcceleration: 160,
    missileDeceleration: 100, maxTurnRate: 45 * Math.PI / 180, maxTurnAcceleration: 100 * Math.PI / 180,
    flightTime: 7.4, maxAmmo: 5, missileHp: 160,
  },
};

/** A fresh authority spec per consumer; probes/modifiers cannot mutate the defaults. */
export function createRocinanteWeaponRules(kind: RocinanteWeaponKind): WeaponSpec {
  return structuredClone(rules[kind]);
}

/** The PDC already has approved, calibrated art; this still does not register it. */
export function createRocinantePdcWeapon(): WeaponSpec {
  return { ...createRocinanteWeaponRules('pdc'), ...structuredClone(rocinantePdcArt) };
}

/** Production media: self-owned generated bodies; native host ballistic/engine
 * textures and audio, with explicitly authored scale. No dependency on another ship. */
export function rocinanteWeapons(): WeaponSpec[] {
  const gun = (kind: 'pdc' | 'railgun'): WeaponSpec => {
    const a = art.art.railgun;
    const spec = kind === 'pdc' ? createRocinantePdcWeapon() : {...createRocinanteWeaponRules(kind),
      spriteWidth:a.spriteWidth,spriteHeight:a.spriteHeight,spritePivotX:a.spritePivotX,spritePivotY:a.spritePivotY,
      turretSpriteUrl:a.spriteUrl,hardpointSpriteUrl:a.spriteUrl,turretOffsets:a.turretOffsets,hardpointOffsets:a.turretOffsets};
    return {...spec,displayIconUrl:spec.turretSpriteUrl,
      soundKey:kind==='pdc'?'vulcan_cannon_fire':'railgun_fire',
      projSpriteUrl:'/game-assets/graphics/missiles/shell_gauss_cannon.png',
      fringeColor:kind==='pdc'?[255,222,150,255]:[185,202,230,255],coreColor:[255,250,226,255],
      hitGlowRadius:kind==='pdc'?8:32,glowColor:[245,203,153,150],
      muzzleFlashSpec:{length:kind==='pdc'?9:20,spread:3,particleSizeMin:2,particleSizeRange:3,particleDuration:.07,particleCount:3,particleColor:[255,229,173,190]},
      visualRecoil:0};
  };
  const missiles = (['torpedo_agile','torpedo_heavy'] as const).map(kind => {
    const tube = art.art.tube, projectile = art.art[kind==='torpedo_agile'?'agile':'heavy'];
    return {...createRocinanteWeaponRules(kind),
      turretSpriteUrl:tube.spriteUrl,hardpointSpriteUrl:tube.spriteUrl,displayIconUrl:projectile.spriteUrl,
      spriteWidth:tube.spriteWidth,spriteHeight:tube.spriteHeight,spritePivotX:tube.spritePivotX,spritePivotY:tube.spritePivotY,
      turretOffsets:tube.turretOffsets,hardpointOffsets:tube.turretOffsets,
      projSpriteUrl:projectile.spriteUrl,projLength:projectile.spriteHeight,projWidth:projectile.spriteWidth,
      soundKey:'harpoon_fire',impactFamily:'HEAVY_TORPEDO' as const,
      missileEngineVisualSpec:{nozzleOffset:kind==='torpedo_agile'?-6:-7.5,width:2.4,length:18,color:[150,190,255,255] as [number,number,number,number]},
      missileExplosionVisualSpec:{radius:kind==='torpedo_agile'?60:85,color:[255,177,98,255] as [number,number,number,number]},
      launcherSmokeSpec:{particleSizeMin:3,particleSizeRange:4,cloudParticleCount:2,cloudDuration:.3,cloudRadius:4,blowbackParticleCount:2,blowbackDuration:.3,blowbackLength:8,blowbackSpread:3,particleColor:[160,157,149,150] as [number,number,number,number]},
    };
  });
  return [gun('pdc'),gun('railgun'),...missiles];
}
const descriptions: Record<RocinanteWeaponKind,string> = {
  pdc:'内置S近防，10破片×15发/秒，基础射程550，本舰六联拦截矩阵提升至700。60发弹匣、每秒补6发。护航优先拦截；压制优先舰体。弹匣耗空时每门持续供弹只有60纸面DPS，不是无限弹幕。',
  railgun:'内置M固定轴炮，700动能/480载荷，射程1350；0.35秒准备＋4.15秒冷却，总射界6°。开火产生6速度反冲。穿过导弹，战机只有击毁才穿过；小障碍耗损穿透预算，大障碍和护盾照常拦截。',
  torpedo_agile:'M鱼雷，单发900高爆，8发不可再生。射程1600、最高速度320、高转向率；0.2秒武装期，可被近防拦截。适合追击与逼盾。有效航程结束后失效滑行1秒并淡出，不再造成伤害。',
  torpedo_heavy:'M鱼雷，单发1500高爆，5发不可再生。射程1600、最高速度250、较慢转向；160弹体HP不等于无敌。适合破甲与惩罚失去机动的目标。0.2秒武装期；到程失效滑行1秒，无无故自爆。',
};
export const rocinanteArmoryRefit = {
  weapons:Object.fromEntries((Object.keys(ROCINANTE_WEAPONS) as RocinanteWeaponKind[]).map(kind=>[ROCINANTE_WEAPONS[kind],{
    op:rules[kind].ordnancePointCost,name:rules[kind].nameKey,manufacturer:'罗西南特军械 · Web改编',
    builtInOnly:kind==='pdc'||kind==='railgun',role:kind==='pdc'?'近防':kind==='railgun'?'固定轴炮':'制导鱼雷',description:descriptions[kind],
  }])),
  weaponStatus:Object.fromEntries(Object.values(ROCINANTE_WEAPONS).map(id=>[id,{level:'supported',reasons:['独立军械规则与正式素材；同档换装。']}]))
};
