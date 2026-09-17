import { requireWeaponEffect } from '../extensions/weapon-effects/Registry';
import { registerUnavailableSourceSystem, systemFromSource } from '../extensions/ship-systems/Registry';
import type { ShipSpec, WeaponMountSlotConfig, EngineSlotConfig } from '../modding/ModManager';
import { WeaponSpec } from '../simulation/Weapon';
import { ShieldType } from '../simulation/Shield';
import { DamageType } from '../simulation/ArmorGrid';
import { assetResolver } from '../assets/AssetResolver';
import { parseStarsectorCsv, parseStarsectorJson } from './StarsectorTextParsers';

export { parseStarsectorCsv, parseStarsectorJson } from './StarsectorTextParsers';

export type StarsectorSourceReader = (relativePath: string) => Promise<string>;
/** Strict by default. Only the offline importer may explicitly opt into lossy conversion. */
export interface SourceImportOptions {
  reportApproximation?: (reason: string) => void;
  shipJson?: Record<string, any>;
  shipRow?: Record<string, string>;
}


function sourceId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid source content ID: ${id}`);
  return id;
}

/**
 * Offline/import converter for original Starsector text formats. A caller must
 * explicitly provide a source reader (Node import scripts can read from disk);
 * the browser runtime never reads the Starsector installation.
 */
export class StarsectorDataLoader {
  private static instance: StarsectorDataLoader;

  private constructor() {}

  public static getInstance(): StarsectorDataLoader {
    if (!StarsectorDataLoader.instance) {
      StarsectorDataLoader.instance = new StarsectorDataLoader();
    }
    return StarsectorDataLoader.instance;
  }

  /**
   * 从本地文件系统异步载入真实的 .ship 与 CSV 舰船规格
   */
  public async loadShipFromSource(hullId: string, readText: StarsectorSourceReader, options: SourceImportOptions = {}): Promise<ShipSpec> {
    sourceId(hullId);
    const shipJson = options.shipJson ?? parseStarsectorJson(await readText(`data/hulls/${hullId}.ship`)) as any;

    // 2. 读取 ship_data.csv 中对应条目的真实基础属性
    const csvText = await readText('data/hulls/ship_data.csv');
    const rows = parseStarsectorCsv(csvText);
    const row = options.shipRow ?? rows.find(r => r['id'] === hullId);
    if (!row) throw new Error(`Missing ship_data.csv row: ${hullId}`);

    const requiredNumber = (key: string) => {
      if (row[key] === undefined || row[key].trim() === '' || !Number.isFinite(Number(row[key]))) throw new Error(hullId + ': missing/invalid source number ' + key);
      return Number(row[key]);
    };
    for (const key of ['width','height','collisionRadius']) if (!Number.isFinite(shipJson[key]) || shipJson[key] <= 0) throw new Error(hullId + ': missing/invalid .ship ' + key);
    if (typeof shipJson.spriteName !== 'string' || !shipJson.spriteName) throw new Error(hullId + ': missing spriteName');
    const hitpoints = requiredNumber('hitpoints');
    const armorRating = requiredNumber('armor rating');
    let maxFlux = requiredNumber('max flux');
    if (maxFlux === 0 && options.reportApproximation) {
      options.reportApproximation('Zero native flux capacity uses a 1-point runtime safety floor; fluxless entity semantics are not implemented.');
      maxFlux = 1;
    }
    const fluxDissipation = requiredNumber('flux dissipation');
    const maxSpeed = requiredNumber('max speed');
    const acceleration = requiredNumber('acceleration');
    const deceleration = requiredNumber('deceleration');
    const maxTurnRate = requiredNumber('max turn rate');
    const turnAcceleration = requiredNumber('turn acceleration');
    const mass = requiredNumber('mass');
    const peakCRSec = parseFloat(row['peak CR sec'] || '720');
    const crLossPerSec = parseFloat(row['CR loss/sec'] || '0.25');
    const designation = row['designation'] || '';

    // 护盾与战术系统
    let shieldType = (row['shield type'] || 'NONE') as ShieldType;
    const defenseId = row['defense id'] || '';
    const resolveSourceSystem = async (id: string, defense = false): Promise<string> => {
      try { return systemFromSource(id, hullId); }
      catch (error) {
        if (!options.reportApproximation) throw error;
        const rows = parseStarsectorCsv(await readText('data/shipsystems/ship_systems.csv'));
        const metadata = rows.find(r => r.id === id);
        if (!metadata) throw new Error(hullId + ': missing source system row ' + id);
        const unavailable = registerUnavailableSourceSystem(id, metadata);
        options.reportApproximation((defense ? 'Secondary defense ' : 'Unimplemented ship system ') + id + ': timing-only unavailable entry; native effects, costs, controls and AI are not simulated.');
        return unavailable.id;
      }
    };
    const defenseSystemType = defenseId && defenseId !== 'phasecloak' ? await resolveSourceSystem(defenseId, true) : undefined;
    if (shieldType === 'PHASE' && defenseSystemType) shieldType = 'NONE';
    const shieldArc = parseFloat(row['shield arc'] || '0');
    const shieldEfficiency = parseFloat(row['shield efficiency'] || '1.0');
    // 原版 ship_data.csv 中护盾维持费与相位成本均为“基础耗散/基础容量”的比例。
    const shieldUpkeepRaw = row['shield upkeep'];
    const shieldUpkeep = shieldUpkeepRaw === undefined || shieldUpkeepRaw === '' ? 0 : parseFloat(shieldUpkeepRaw);
    const phaseCostRaw = row['phase cost'];
    const phaseUpkeepRaw = row['phase upkeep'];
    const phaseCost = phaseCostRaw === undefined || phaseCostRaw === '' ? 0 : parseFloat(phaseCostRaw);
    const phaseUpkeep = phaseUpkeepRaw === undefined || phaseUpkeepRaw === '' ? 0 : parseFloat(phaseUpkeepRaw);
    const systemId = (row['system id'] || '').toLowerCase();
    const systemType = await resolveSourceSystem(systemId);

    // 转换原版 weaponSlots
    const weaponSlots: WeaponMountSlotConfig[] = (shipJson.weaponSlots || []).filter((s: any) =>
      ['TURRET', 'HARDPOINT', 'HIDDEN'].includes(s.mount) && !['SYSTEM', 'DECORATIVE', 'LAUNCH_BAY'].includes(s.type)
    ).map((s: any) => {
      // 原版 .ship 中的 locations 为 [y, x] 或 [x, y]
      const loc = s.locations || [0, 0];
      return {
        slotId: s.id,
        mountType: s.mount,
        weaponType: s.type,
        slotSize: s.size,
        x: loc[0],
        y: loc[1],
        baseAngleDeg: s.angle ?? 0,
        arcDeg: s.arc ?? 10,
        defaultWeaponId: shipJson.builtInWeapons?.[s.id],
        builtIn: !!shipJson.builtInWeapons?.[s.id]
      };
    });

    // 转换原版 engineSlots
    const engineSlots: EngineSlotConfig[] = (shipJson.engineSlots || []).map((e: any) => {
      const loc = e.location || [0, 0];
      let style = e.style || 'LOW_TECH';
      if (!['LOW_TECH','HIGH_TECH','MIDLINE'].includes(style) && options.reportApproximation) {
        options.reportApproximation('Native engine visual style ' + style + ' uses HIGH_TECH Web engine rendering.');
        style = 'HIGH_TECH';
      }
      return {
        x: loc[0],
        y: loc[1],
        angleDeg: e.angle ?? 180,
        width: e.width ?? 15,
        length: e.length ?? 50,
        style,
        // ShipHullSpecLoader encodes native system engines with contrailSize128.
        systemActivated: e.contrailSize === 128 || e.systemActivated === true
      };
    });

    const spriteRel = shipJson.spriteName || `graphics/ships/${hullId}.png`;
    const phaseSpec = shieldType === 'PHASE'
      ? parseStarsectorJson(await readText('data/shipsystems/phasecloak.system')) as Record<string, string>
      : undefined;
    const phaseSprite = (suffix?: string) => suffix
      ? assetResolver.url(spriteRel.replace(/\.[^.]+$/, `${suffix}.png`)) : undefined;
    const hullStyles = parseStarsectorJson(await readText('data/config/hull_styles.json')) as any;
    const hullStyle = hullStyles[shipJson.style ?? 'LOW_TECH'];
    const spriteWidth = shipJson.width;
    const spriteHeight = shipJson.height;
    const center = shipJson.center || [spriteWidth / 2, spriteHeight / 2];
    const pivotX = center[0];
    const pivotY = spriteHeight - center[1]; // OpenGL 坐标系转 Canvas 顶方向坐标

    const bounds: [number, number][] = [];
    if (Array.isArray(shipJson.bounds)) {
      for (let i = 0; i < shipJson.bounds.length; i += 2) {
        bounds.push([shipJson.bounds[i], shipJson.bounds[i + 1]]);
      }
    }

    return {
      id: hullId,
      nameKey: `ship.${hullId}.name`,
      descKey: `ship.${hullId}.desc`,
      designationKey: `ship.${hullId}.designation`,
      spriteUrl: assetResolver.url(spriteRel),
      phaseHighlightSpriteUrl: phaseSprite(phaseSpec?.phaseHighlight),
      phaseDiffuseSpriteUrl: phaseSprite(phaseSpec?.phaseDiffuse),
      explosionColor: hullStyle?.combatExplosionNonFlashColorOverride?.slice(0, 3),
      explosionFlashColor: hullStyle?.baseCombatExplosionColor?.slice(0, 3),
      spriteWidth,
      spriteHeight,
      pivotX,
      pivotY,
      collisionRadius: shipJson.collisionRadius,
      mass,
      hullSize: shipJson.hullSize,
      fighterBays: Number(row['fighter bays'] || 0),
      sourceHullTraits: [...(shipJson.builtInMods ?? []), ...(row.hints ?? '').split(/[,\s]+/).filter(Boolean)],
      builtInHullMods: shipJson.builtInMods ?? [],
      breakProbability: Number(row.breakProb || 0),
      minPieces: Number(row.minPieces || 2),
      maxPieces: Number(row.maxPieces || 2),
      maxSpeed,
      acceleration,
      deceleration,
      maxTurnRateDeg: maxTurnRate,
      turnAccelerationDeg: turnAcceleration,
      hitpoints,
      armorRating,
      armorCols: Math.max(10, Math.round((shipJson.collisionRadius) / 18)),
      armorRows: Math.max(8, Math.round((shipJson.collisionRadius) / 22)),
      maxFlux,
      fluxDissipation,
      peakCRSec,
      crLossPerSec,
      designation,
      shieldType,
      shieldArcDeg: shieldArc,
      shieldRadius: shipJson.shieldRadius || shipJson.collisionRadius,
      shieldCenterX: shipJson.shieldCenter?.[0] ?? 0,
      shieldCenterY: shipJson.shieldCenter?.[1] ?? 0,
      shieldEfficiency,
      shieldUpkeep,
      phaseCost,
      phaseUpkeep,
      systemType,
      ...(defenseSystemType ? { defenseSystemType } : {}),
      weaponSlots,
      systemWeaponSlots: (shipJson.weaponSlots || []).filter((s: any) => s.type === 'SYSTEM').map((s: any) => ({
        slotId:s.id, mountType:s.mount, slotSize:s.size, x:s.locations[0], y:s.locations[1], baseAngleDeg:s.angle??0, arcDeg:s.arc??10,
      })),
      engineSlots,
      bounds
    };
  }

  /**
   * 从本地文件系统异步载入真实的 .wpn 武器规格
   */
  public async loadWeaponFromSource(weaponId: string, readText: StarsectorSourceReader, options: SourceImportOptions = {}): Promise<WeaponSpec> {
    sourceId(weaponId);
    const wpnJson = parseStarsectorJson(await readText(`data/weapons/${weaponId}.wpn`)) as any;

    const rows = parseStarsectorCsv(await readText('data/weapons/weapon_data.csv'));
    const row = rows.find(r => r['id'] === weaponId);
    if (!row) throw new Error(`Missing weapon_data.csv row: ${weaponId}`);
    const proj = wpnJson.projectileSpecId
      ? parseStarsectorJson(await readText(`data/weapons/proj/${sourceId(wpnJson.projectileSpecId)}.proj`)) as any
      : {};
    if (!['beam','projectile'].includes(wpnJson.specClass)) throw new Error(weaponId + ': unsupported weapon specClass ' + wpnJson.specClass);
    if (wpnJson.specClass === 'projectile' && !['projectile','missile'].includes(proj.specClass)) throw new Error(weaponId + ': unsupported projectile specClass ' + proj.specClass);
    const omit = (object: Record<string, any>, key: string, reason: string) => {
      if (!options.reportApproximation) throw new Error(weaponId + ': ' + reason);
      options.reportApproximation(reason);
      delete object[key];
    };
    const effect = (object: Record<string, any>, key: string, hook: 'beam' | 'hit' | 'advance') => {
      if (!object[key]) return;
      try { requireWeaponEffect(object[key], hook, weaponId); }
      catch (error) { if (!options.reportApproximation) throw error; omit(object, key, 'Unimplemented ' + key + ' ' + object[key] + ': special hook omitted; base damage/flux/trajectory retained.'); }
    };
    for (const [key, hook] of [['beamEffect','beam'],['everyFrameEffect','advance']] as const) effect(wpnJson, key, hook);
    effect(proj, 'onHitEffect', 'hit');
    if (proj.onFireEffect) omit(proj, 'onFireEffect', 'Projectile on-fire hook '+proj.onFireEffect+' omitted; no native spawn-time callback.');
    if (proj.everyFrameEffect) omit(proj, 'everyFrameEffect', 'Projectile lifecycle hook ' + proj.everyFrameEffect + ' omitted; base projectile simulation only.');
    const material = wpnJson.specClass === 'beam' ? wpnJson : proj;
    if (material.textureType && !['ROUGH','SMOOTH'].includes(material.textureType)) {
      omit(material, 'textureType', 'Native texture type ' + material.textureType + ' uses the default Web material.');
    }
    if (proj.spawnType && !['BALLISTIC','BALLISTIC_AS_BEAM','MISSILE','BEAM'].includes(proj.spawnType)) {
      if (!options.reportApproximation) throw new Error(weaponId + ': unsupported spawnType ' + proj.spawnType);
      options.reportApproximation('Native spawn type ' + proj.spawnType + ' uses a ballistic energy projectile; special appearance/motion not reproduced.');
      proj.spawnType = 'BALLISTIC';
    }
    if (wpnJson.visualRecoil < 0) {
      if (!options.reportApproximation) throw new Error(weaponId + ': negative visual recoil');
      options.reportApproximation('Negative native visual recoil is not rendered; recoil animation disabled.');
      wpnJson.visualRecoil = 0;
    }
    if (material.hitGlowRadius < 0) {
      if (!options.reportApproximation) throw new Error(weaponId + ': negative hit glow radius');
      options.reportApproximation('Native negative hit-glow sentinel uses a disabled hit glow in Web.');
      material.hitGlowRadius = 0;
    }
    if (wpnJson.muzzleFlashSpec?.length < 0) {
      if (!options.reportApproximation) throw new Error(weaponId + ': negative muzzle flash length');
      options.reportApproximation('Native reverse-length muzzle flash is not rendered; muzzle particle flash omitted.');
      delete wpnJson.muzzleFlashSpec;
    }
    const number = (key: string, fallback = 0) => row[key] === '' || row[key] === undefined ? fallback : Number(row[key]);
    const url = (path: unknown) => typeof path === 'string' && path ? assetResolver.url(path) : undefined;
    const missile = proj.specClass === 'missile';
    if (options.reportApproximation) {
      for (const key of ['applyOnHitEffectWhenPassThrough','collisionClassAfterFlameout','dudProbabilityOnFlameout','fizzleOnReachingWeaponRange','flameoutTime','noCollisionWhileFading','reduceDamageWhileFading','maxFlightTime']) {
        if (proj[key] !== undefined) options.reportApproximation('Native projectile '+key+'='+JSON.stringify(proj[key])+' uses the generic Web flight/collision lifecycle.');
      }
      if (['NONE','RAY','RAY_FIGHTER'].includes(proj.collisionClass)) options.reportApproximation('Native projectile collision class '+proj.collisionClass+' is approximated by the Web projectile collision model.');
    }
    const engine = proj.engineSlots?.[0];
    const style = engine?.styleSpec;
    if (proj.behaviorSpec && !['MIRV','PROXIMITY_FUSE'].includes(proj.behaviorSpec.behavior)) {
      omit(proj, 'behaviorSpec', 'Unimplemented projectile behavior ' + JSON.stringify(proj.behaviorSpec) + ': ordinary projectile/guided-missile trajectory used; special behavior omitted.');
    }
    if (proj.behaviorSpec?.behavior === 'PROXIMITY_FUSE' && proj.behaviorSpec.range < 0) {
      omit(proj, 'behaviorSpec', 'Negative native proximity-fuse range requires a scripted activation; fuse omitted, ordinary impact damage only.');
    }
    let behavior = proj.behaviorSpec;
    let child = behavior?.behavior === 'MIRV' ? parseStarsectorJson(await readText(
      `data/weapons/proj/${sourceId(behavior.projectileSpec)}.proj`)) as any : undefined;

    if (child) effect(child, 'onHitEffect', 'hit');
    if (child?.onFireEffect) omit(child, 'onFireEffect', 'MIRV child on-fire hook '+child.onFireEffect+' omitted.');
    if (child && (child.behaviorSpec || child.everyFrameEffect || child.specClass !== 'projectile')) {
      omit(proj, 'behaviorSpec', 'Nested or missile MIRV child ' + behavior.projectileSpec + ' is not implemented: carrier remains a single base missile; splitting/payload omitted.');
      behavior = undefined; child = undefined;
    }
    for (const key of ['range','type']) if (!row[key]) throw new Error(weaponId + ': missing source ' + key);
    if (wpnJson.specClass !== 'beam' && !row['proj speed']) throw new Error(weaponId + ': missing source projectile speed');
    const damagePerShot = parseFloat(row['damage/shot'] || '0');
    const burstSize = Math.max(1, number('burst size', 1));
    const cycleTime = number('chargeup') + number('chargedown', 0.1) + (burstSize - 1) * number('burst delay');
    const damagePerSecond = number('damage/second', damagePerShot * burstSize / Math.max(0.01, cycleTime));
    const energyPerShot = parseFloat(row['energy/shot'] || '0');
    const energyPerSecond = parseFloat(row['energy/second'] || '0');
    const range = Number(row['range']);
    const type = (row['type'] || 'ENERGY') as DamageType;
    const isBeam = wpnJson.specClass === 'beam';
    const fluxPerShot = isBeam ? 0 : energyPerShot;
    const projSpeed = isBeam ? 0 : Number(row['proj speed']);

    // 默认光晕色与弹药色
    const sourceColor = material.glowColor ?? material.fringeColor ?? material.coreColor;
    const color: [number, number, number] = sourceColor
      ? [sourceColor[0], sourceColor[1], sourceColor[2]]
      : [255, 200, 100];

    return {
      id: weaponId,
      nameKey: `weapon.${weaponId}.name`,
      type,
      mountSize: wpnJson.size || 'MEDIUM',
      weaponType: wpnJson.type,
      mountTypeOverride: wpnJson.mountTypeOverride,
      autofireAccuracyBonus: Number(wpnJson.autofireAccBonus ?? 0),
      aiHints: (row.hints ?? '').split(/[,\s]+/).filter(Boolean),
      tags: (row.tags ?? '').split(/[,\s]+/).filter(Boolean),
      ordnancePointCost: number('OPs'),
      isPointDefense: (row.hints ?? '').split(/[,\s]+/).some(hint => hint === 'PD' || hint === 'PD_ONLY'),
      alwaysFire: (row.hints ?? '').split(/[,\s]+/).some(hint=>['DO_NOT_AIM','GUIDED_POOR'].includes(hint)),
      isBeam,
      beamEffect: wpnJson.beamEffect,
      everyFrameEffect: wpnJson.everyFrameEffect,
      damagePerShot,
      empPerShot: isBeam ? undefined : number('emp'),
      damagePerSecond,
      fluxPerShot,
      range,
      refireDelay: isBeam ? number('burst delay') : number('chargedown', damagePerShot > 0 && damagePerSecond > 0 ? damagePerShot / damagePerSecond : 0.1),
      chargeTime: isBeam ? undefined : number('chargeup'),
      autoCharge: wpnJson.autocharge ?? false,
      interruptibleBurst: wpnJson.interruptibleBurst ?? false,
      soundIntroKey: wpnJson.fireSoundOne,
      soundLoopKey: isBeam && number('burst size') === 0 ? wpnJson.fireSoundTwo : undefined,
      projSpeed,
      projRadius: isBeam ? 0 : proj.collisionRadius ?? (proj.width ? proj.width / 2 : 5),
      color,
      turnRateDegPerSec: parseFloat(row['turn rate'] || '25'),
      minSpread: parseFloat(row['min spread'] || '0'),
      maxSpread: parseFloat(row['max spread'] || '0'),
      spreadPerShot: parseFloat(row['spread/shot'] || '0'),
      spreadDecay: parseFloat(row['spread decay/sec'] || '0'),
      burstSize: isBeam ? undefined : burstSize,
      burstDelay: parseFloat(row['burst delay'] || '0'),
      turretOffsets: wpnJson.turretOffsets,
      hardpointOffsets: wpnJson.hardpointOffsets,
      turretSpriteUrl: wpnJson.turretSprite ? assetResolver.url(wpnJson.turretSprite) : undefined,
      turretGunSpriteUrl: url(wpnJson.turretGunSprite),
      hardpointGunSpriteUrl: url(wpnJson.hardpointGunSprite),
      renderBarrelBelow: wpnJson.renderHints?.includes('RENDER_BARREL_BELOW') ?? false,
      hardpointSpriteUrl: wpnJson.hardpointSprite ? assetResolver.url(wpnJson.hardpointSprite) : undefined,
      glowSpriteUrl: wpnJson.turretGlowSprite ? assetResolver.url(wpnJson.turretGlowSprite) : undefined,
      hardpointGlowSpriteUrl: wpnJson.hardpointGlowSprite ? assetResolver.url(wpnJson.hardpointGlowSprite) : undefined,
      animationType: wpnJson.animationType === 'GLOW_AND_FLASH' ? 'GLOW_AND_FLASH' : undefined,
      hardpointUsesHullSprite: wpnJson.hardpointSprite === '',
      visualRecoil: wpnJson.visualRecoil ?? 0,
      muzzleFlashSpec: wpnJson.muzzleFlashSpec,
      launcherSmokeSpec: wpnJson.smokeSpec,
      spawnType: isBeam ? 'BEAM' : missile ? 'MISSILE' : proj.spawnType,
      renderTargetIndicator: missile ? (proj.renderTargetIndicator ?? true) : undefined,
      textureType: material.textureType,
      textureScrollSpeed: material.textureScrollSpeed,
      fadeTime: material.fadeTime,
      pixelsPerTexel: material.pixelsPerTexel,
      fringeColor: material.fringeColor,
      coreColor: material.coreColor,
      glowColor: material.glowColor,
      hitGlowRadius: material.hitGlowRadius,
      glowRadius: material.glowRadius,
      coreWidthMult: material.coreWidthMult,
      projSpriteUrl: url(proj.bulletSprite ?? proj.sprite),
      projLength: proj.length ?? proj.size?.[1],
      projWidth: proj.width ?? proj.size?.[0],
      maxAmmo: row.ammo ? number('ammo') : undefined,
      ammoRegenPerSec: number('ammo/sec'),
      beamSpeed: isBeam ? number('beam speed', 1400) : undefined,
      beamWidth: isBeam ? wpnJson.width : undefined,
      beamVisualMode: isBeam ? (number('burst size') > 0 ? 'BURST' : 'SUSTAINED') : undefined,
      beamDuration: isBeam ? number('burst size', 1) : undefined,
      beamSourceChargeupTime: isBeam ? number('chargeup') : undefined,
      beamSourceChargedownTime: isBeam ? number('chargedown') : undefined,
      beamBurstDelay: isBeam ? number('burst delay') : undefined,
      fluxPerSecond: isBeam ? energyPerSecond : undefined,
      empPerSecond: isBeam ? number('emp') : undefined,
      hitGlowBrightenDuration: isBeam ? (wpnJson.hitGlowBrightenDuration ?? 1) : wpnJson.hitGlowBrightenDuration,
      useGlowColorForHitGlow: isBeam ? (wpnJson.useGlowColorForHitGlow ?? false) : undefined,
      beamFireOnlyOnFullCharge: isBeam ? (wpnJson.beamFireOnlyOnFullCharge ?? false) : undefined,
      fringeScrollSpeedMult: isBeam ? (wpnJson.fringeScrollSpeedMult ?? 1) : undefined,
      darkCore: isBeam ? (wpnJson.darkCore ?? false) : undefined,
      darkFringeIter: isBeam ? (wpnJson.darkFringeIter ?? 1) : undefined,
      darkCoreIter: isBeam ? (wpnJson.darkCoreIter ?? 1) : undefined,
      onHitEffect: proj.onHitEffect,
      passThroughMissiles: proj.passThroughMissiles ?? false,
      passThroughFighters: proj.passThroughFighters ?? false,
      passThroughFightersOnlyWhenDestroyed: proj.passThroughFightersOnlyWhenDestroyed ?? false,
      proximityFuse: behavior?.behavior === 'PROXIMITY_FUSE' ? {
        range: behavior.range, explosionRadius: behavior.explosionSpec.radius,
        coreRadius: behavior.explosionSpec.coreRadius, soundKey: behavior.explosionSpec.sound
      } : undefined,
      isTwoStage: behavior?.behavior === 'MIRV',
      mirv: child ? {
        splitRange: behavior.splitRange, splitRangeRange: behavior.splitRangeRange ?? 0,
        minTimeToSplit: behavior.minTimeToSplit, canSplitEarly: behavior.canSplitEarly ?? false,
        numShots: behavior.numShots, damage: behavior.damage, emp: behavior.emp ?? 0,
        damageType: behavior.damageType, childHitpoints: behavior.hitpoints,
        evenSpread: behavior.evenSpread ?? false, arcDeg: behavior.arc,
        spreadInaccuracyDeg: behavior.spreadInaccuracy ?? 0, spreadSpeed: behavior.spreadSpeed,
        spreadSpeedRange: behavior.spreadSpeedRange ?? 0, projectileRange: behavior.projectileRange,
        projectileSpec: behavior.projectileSpec, splitSound: behavior.splitSound, smokeSpec: behavior.smokeSpec,
        childProjectile: { spawnType: child.spawnType, onHitEffect: child.onHitEffect,
          projRadius: child.width / 2, projLength: child.length, projWidth: child.width,
          projSpriteUrl: url(child.bulletSprite), fadeTime: child.fadeTime, textureScrollSpeed: child.textureScrollSpeed,
          pixelsPerTexel: child.pixelsPerTexel, fringeColor: child.fringeColor, coreColor: child.coreColor,
          glowColor: child.glowColor, glowRadius: child.glowRadius, hitGlowRadius: child.hitGlowRadius }
      } : undefined,
      isRocket: missile,
      isGuided: missile && (proj.engineSpec?.turnRate ?? 0) > 0,
      launchSpeed: missile ? number('launch speed') : undefined,
      flightTime: missile ? number('flight time') : undefined,
      armingTime: proj.armingTime,
      engineAcceleration: proj.engineSpec?.acc,
      missileDeceleration: proj.engineSpec?.dec,
      maxSpeed: missile ? projSpeed : undefined,
      maxTurnRate: missile ? (proj.engineSpec?.turnRate ?? 0) * (Math.PI / 180) : undefined,
      maxTurnAcceleration: missile ? (proj.engineSpec?.turnAcc ?? 0) * (Math.PI / 180) : undefined,
      missileHp: missile ? number('proj hitpoints') : undefined,
      missileEngineVisualSpec: engine && style?.engineColor ? {
        nozzleOffset: engine.loc?.[0] ?? 0, width: engine.width, length: engine.length,
        color: style.engineColor, glowSizeMult: style.glowSizeMult, glowAlternateColor: style.glowAlternateColor
      } : undefined,
      missileTrailSpec: style?.contrailDuration ? {
        duration: style.contrailDuration, baseWidth: engine.width * (style.contrailWidthMult ?? 1),
        widenMult: style.contrailWidthAddedFractionAtEnd ?? 0, minSeg: style.contrailMinSeg ?? 5,
        spawnOffset: -(engine.length ?? 0) * (style.contrailSpawnDistMult ?? 0), color: style.contrailColor,
        blendMode: style.type === 'GLOW' ? 'GLOW' : 'NORMAL'
      } : undefined,
      projectileExplosionSpec: missile ? proj.explosionSpec : undefined,
      missileExplosionVisualSpec: missile ? {
        radius: proj.explosionRadius ?? 100, color: proj.explosionColor ?? [255, 165, 100, 255],
        useHitGlowWhenDealingDamage: proj.useHitGlowWhenDealingDamage ?? true
      } : undefined,
      soundKey: wpnJson.fireSoundTwo || wpnJson.fireSoundOne
    };
  }
}

export const dataLoader = StarsectorDataLoader.getInstance();
