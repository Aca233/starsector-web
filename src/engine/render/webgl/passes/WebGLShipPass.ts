import { visualRandom } from '../../RenderDeterminism';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Ship } from '../../../simulation/Ship';
import { Vector2 } from '../../../math/Vector2';
import { ShipVentingRenderer } from '../ShipVentingRenderer';
import { ENGINE_VISUAL_PROFILES, getShipVisualProfile, getWeaponVisualProfile } from '../../../visual/VisualProfiles';
import type { VisualRandom } from '../../../runtime/VisualRandom';

/**
 * 战舰与挂点渲染通道 (WebGLShipPass)
 * 职责:
 * 1. 相位残影 (Phase Ghosts)
 * 2. 舰船主体、装甲受损痕迹与战损焦黑弹坑 (Ship Base & Scorch Marks)
 * 3. 真实物理平滑推进羽流、过载/相位电弧与失速故障黑烟 (Engine Flames)
 * 4. 武器炮塔/内置挂点底座、后坐行程与充能微震 (Turrets & Hardpoints)
 * 5. 空间战损残骸碎片 (Hulk Fragments)
 * 6. 舰载机中队 (Fighters, Bombers & Dogfights)
 */
export class WebGLShipPass {
  private playerVentingRenderer = new ShipVentingRenderer();
  private enemyVentingRenderer = new ShipVentingRenderer();

  public updateVisual(engine: CombatEngine, dt: number, random: VisualRandom): void {
    this.playerVentingRenderer.update(dt, engine.playerShip, engine.playerShip.pos, engine.playerShip.facingRad, random);
    this.enemyVentingRenderer.update(dt, engine.enemyShip, engine.enemyShip.pos, engine.enemyShip.facingRad, random);
  }

  public resetVisualState(): void {
    this.playerVentingRenderer.reset();
    this.enemyVentingRenderer.reset();
  }

  public render(engine: CombatEngine, ctx: WebGLPassContext, nowSec: number) {
    const { batcher, textures, hitGlowTex, alpha } = ctx;

    // 1. 相位潜航时空残影 (Phase Ghosts)
    const drawGhosts = (ship: Ship) => {
      if (!ship.phaseGhosts || ship.phaseGhosts.length === 0) return;
      const phaseColor = getShipVisualProfile(ship.spec.id).phaseColor;
      const ghostTex = textures.getTintedTexture(ship.spec.spriteUrl, Math.round(phaseColor[0] * 255), Math.round(phaseColor[1] * 255), Math.round(phaseColor[2] * 255));
      batcher.setBlendMode('ADDITIVE');
      for (const g of ship.phaseGhosts) {
        batcher.drawSprite(
          ghostTex,
          g.pos.x,
          g.pos.y,
          ship.spec.spriteWidth,
          ship.spec.spriteHeight,
          g.facingRad + Math.PI / 2,
          (ship.spec.pivotX / ship.spec.spriteWidth) - 0.5,
          (ship.spec.pivotY / ship.spec.spriteHeight) - 0.5,
          1.0,
          1.0,
          1.0,
          g.alpha
        );
      }
    };
    drawGhosts(engine.enemyShip);
    drawGhosts(engine.playerShip);

    // 2. 战舰与挂点渲染函数
    const renderShip = (ship: Ship, shipPos: Vector2, shipFacing: number) => {
      if (ship.isDead) return;
      const shipVisual = getShipVisualProfile(ship.spec.id);

      // 2.1 幅能主动排散 1:1 底层放射状能量光晕环 (严格对齐 float.java: o00000 位于舰体下层)
      const ventRenderer = ship.isPlayer ? this.playerVentingRenderer : this.enemyVentingRenderer;
      ventRenderer.renderRadialHalo(batcher, ctx.ribbonBatcher, textures, ship, shipPos, shipFacing);

      // 2.2 发动机引擎尾焰与失速故障黑烟
      if (!ship.isPhased) {
        const isVenting = ship.flux.isVenting;
        const isBurnDrive = !isVenting && ship.system.type === 'BURN_DRIVE' && ship.system.isActive;
        const forwardThrottle = isVenting ? 0 : Math.max(0, ship.throttle);
        const strafeMag = isVenting ? 0 : Math.abs(ship.strafeInput || 0);
        const isMoving = forwardThrottle > 0.05 || strafeMag > 0.05;

        for (let slotIdx = 0; slotIdx < ship.spec.engineSlots.length; slotIdx++) {
          const slot = ship.spec.engineSlots[slotIdx];
          const visualProfile = ENGINE_VISUAL_PROFILES[slot.style] ?? ENGINE_VISUAL_PROFILES.LOW_TECH;
          const engStatus = ship.engineStatuses[slotIdx];
          const slotAngleRad = (slot.angleDeg * Math.PI) / 180 + shipFacing;
          const slotOffset = new Vector2(slot.x, slot.y).rotate(shipFacing);
          const nozzleX = shipPos.x + slotOffset.x;
          const nozzleY = shipPos.y + slotOffset.y;

          if (engStatus?.isFlameout) {
            batcher.setBlendMode('NORMAL');
            const smokeTex = textures.getTexture('/game-assets/graphics/fx/contrail64b.png');
            const smokeSize = slot.width * 1.6;
            batcher.drawSprite(smokeTex, nozzleX, nozzleY, smokeSize, smokeSize, slotAngleRad, 0, 0, 0.15, 0.12, 0.12, 0.65);
            if (visualRandom('webgl/passes/WebGLShipPass.ts#1') < 0.28) {
              batcher.setBlendMode('ADDITIVE');
              const flameTex = textures.getTexture('/game-assets/graphics/fx/engineflame32.png');
              batcher.drawSprite(flameTex, nozzleX, nozzleY, slot.length * 0.4, slot.width * 0.7, slotAngleRad, -0.5, 0, 1.0, 0.3, 0.1, 0.55);
            }
            continue;
          }

          // 亚帧插值平滑推力
          const thrust = engStatus 
            ? (engStatus.prevThrust + (engStatus.currentThrust - engStatus.prevThrust) * alpha)
            : (isBurnDrive ? 2.4 : (isMoving ? 1.0 : 0.0));

          const idleBreath = Math.sin(nowSec * 7.0 + slotIdx * 1.8) * 0.015;
          const flicker = 0.95 + visualRandom('webgl/passes/WebGLShipPass.ts#2') * (0.05 + Math.min(1.0, thrust) * 0.06);

          const lenMult = visualProfile.idleScale + Math.min(1.0, thrust) * (1 - visualProfile.idleScale) + Math.max(0, thrust - 1.0) * (visualProfile.boostScale - 1);
          const widMult = 0.42 + Math.min(1.0, thrust) * 0.58 + Math.max(0, thrust - 1.0) * 0.2;
          const alphaMult = 0.22 + Math.min(1.0, thrust) * 0.68 + Math.max(0, thrust - 1.0) * 0.1;

          const plumeLength = slot.length * (lenMult + idleBreath) * flicker;
          const plumeWidth = slot.width * widMult * visualProfile.widthScale;
          const flameAlpha = Math.min(1.0, alphaMult * flicker);

          const [fr, fg, fb] = visualProfile.flameColor;
          const [gr, gg, gb] = visualProfile.glowColor;
          const [cr, cg, cb] = visualProfile.coreColor;

          batcher.setBlendMode('ADDITIVE');
          const flameTex = textures.getTexture('/game-assets/graphics/fx/engineflame32.png');

          // 1. 发动机喷口无边界柔和圆形辉光
          const throatGlowSize = slot.width * visualProfile.throatScale * (0.85 + Math.min(1.0, thrust) * 0.4 + Math.max(0, thrust - 1.0) * 0.35);
          const throatGlowAlpha = 0.5 + Math.min(1.0, thrust) * 0.35 + Math.max(0, thrust - 1.0) * 0.15;
          batcher.drawSprite(hitGlowTex, nozzleX, nozzleY, throatGlowSize, throatGlowSize, 0, 0, 0, gr, gg, gb, throatGlowAlpha);

          // 2. 主羽流外焰
          batcher.drawSprite(flameTex, nozzleX, nozzleY, plumeLength, plumeWidth, slotAngleRad, -0.5, 0, fr, fg, fb, flameAlpha);

          // 3. 超高能白热焰芯
          const coreLength = plumeLength * 0.65;
          const coreWidth = plumeWidth * 0.45;
          batcher.drawSprite(flameTex, nozzleX, nozzleY, coreLength, coreWidth, slotAngleRad, -0.5, 0, cr, cg, cb, flameAlpha * 0.9);

          // 4. 喷口中心炽热针状点火闪烁点
          const throatSparkSize = slot.width * (0.35 + Math.min(1.0, thrust) * 0.2 + Math.max(0, thrust - 1.0) * 0.15);
          batcher.drawSprite(hitGlowTex, nozzleX, nozzleY, throatSparkSize, throatSparkSize, 0, 0, 0, 1.0, 1.0, 1.0, 0.65 + Math.min(1.0, thrust) * 0.25);
        }
      }

      // 2.2 舰船主体贴图
      batcher.setBlendMode('NORMAL');
      const shipTex = textures.getTexture(ship.spec.spriteUrl);
      const pivotNormX = (ship.spec.pivotX / ship.spec.spriteWidth) - 0.5;
      const pivotNormY = (ship.spec.pivotY / ship.spec.spriteHeight) - 0.5;
      const shipAlpha = ship.isPhased ? 0.45 : 1.0;
      batcher.drawSprite(
        shipTex,
        shipPos.x,
        shipPos.y,
        ship.spec.spriteWidth,
        ship.spec.spriteHeight,
        shipFacing + Math.PI / 2,
        pivotNormX,
        pivotNormY,
        shipVisual.hullTint[0],
        shipVisual.hullTint[1],
        shipVisual.hullTint[2],
        shipAlpha
      );

      // 2.2.1 舰体表面战损焦黑弹坑与炽热熔渣
      if (ship.scorchMarks && ship.scorchMarks.length > 0) {
        for (const sm of ship.scorchMarks) {
          const smOffset = new Vector2(sm.localPos.x, sm.localPos.y).rotate(shipFacing);
          const smX = shipPos.x + smOffset.x;
          const smY = shipPos.y + smOffset.y;
          const craterAlpha = Math.min(0.85, 0.3 + sm.intensity * 0.55);
          batcher.setBlendMode('NORMAL');
          batcher.drawSprite(hitGlowTex, smX, smY, sm.size * 1.1, sm.size * 1.1, 0, 0, 0, 0.08, 0.05, 0.05, craterAlpha);

          if (sm.intensity > 0.15) {
            batcher.setBlendMode('ADDITIVE');
            const glowSize = sm.size * (0.8 + sm.intensity * 0.6);
            batcher.drawSprite(hitGlowTex, smX, smY, glowSize, glowSize, 0, 0, 0, 1.0, 0.45, 0.12, Math.min(1.0, sm.intensity * 1.2));
          }
        }
      }

      // 相位潜航幽蓝光晕
      if (ship.isPhased) {
        batcher.setBlendMode('ADDITIVE');
        const glowTex = textures.getTexture('/game-assets/graphics/fx/glow64.png');
        const gSize = ship.spec.collisionRadius * 2.3;
        batcher.drawSprite(glowTex, shipPos.x, shipPos.y, gSize, gSize, 0, 0, 0, shipVisual.phaseColor[0], shipVisual.phaseColor[1], shipVisual.phaseColor[2], 0.68);
      }

      // 过载电浆辉光
      if (ship.flux.isOverloaded) {
        batcher.setBlendMode('ADDITIVE');
        const glowTex = textures.getTexture('/game-assets/graphics/fx/glow64.png');
        const gSize = ship.spec.collisionRadius * 2.2;
        batcher.drawSprite(glowTex, shipPos.x, shipPos.y, gSize, gSize, 0, 0, 0, shipVisual.overloadColor[0], shipVisual.overloadColor[1], shipVisual.overloadColor[2], 0.42 + visualRandom('webgl/passes/WebGLShipPass.ts#3') * 0.42);
      }

      // 2.3 旋转武器炮塔与挂点充能光晕 (Turrets & Hardpoints)
      for (const mount of ship.weapons) {
        if (mount.mountType === 'HIDDEN') continue;
        const isHardpoint = mount.mountType === 'HARDPOINT';
        const mountOffset = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(shipFacing);
        const mountX = shipPos.x + mountOffset.x;
        const mountY = shipPos.y + mountOffset.y;
        const mountFacing = isHardpoint ? (mount.baseAngleDeg * Math.PI) / 180 + shipFacing : mount.currentAngleRad;
        const weaponVisual = getWeaponVisualProfile(mount.spec.id, mount.spec.spawnType, mount.spec.isRocket, mount.spec.isBeam);

        const baseImgUrl = isHardpoint ? (mount.spec.hardpointSpriteUrl || mount.spec.turretSpriteUrl) : mount.spec.turretSpriteUrl;
        const gunImgUrl = isHardpoint ? (mount.spec.hardpointGunSpriteUrl || mount.spec.turretGunSpriteUrl) : mount.spec.turretGunSpriteUrl;
        const glowImgUrl = isHardpoint ? (mount.spec.hardpointGlowSpriteUrl || mount.spec.glowSpriteUrl) : mount.spec.glowSpriteUrl;

        const defaultSize = mount.spec.mountSize === 'LARGE' ? 68 : mount.spec.mountSize === 'MEDIUM' ? 42 : 24;
        let baseTex: WebGLTexture | null = null;
        let baseW = defaultSize;
        let baseH = defaultSize;
        if (baseImgUrl) {
          const info = textures.getTextureInfo(baseImgUrl);
          baseTex = info.texture;
          if (info.width > 0 && info.height > 0) {
            baseW = info.width;
            baseH = info.height;
          }
        }

        let gunTex: WebGLTexture | null = null;
        let gunW = baseW;
        let gunH = baseH;
        if (gunImgUrl) {
          const info = textures.getTextureInfo(gunImgUrl);
          gunTex = info.texture;
          if (info.width > 0 && info.height > 0) {
            gunW = info.width;
            gunH = info.height;
          }
        }

        const recoilDist = mount.recoil * (mount.spec.visualRecoil || 0);
        const recoilOff = new Vector2(-recoilDist, 0).rotate(mountFacing);
        const alphaVal = mount.isDisabled ? 0.45 : 1.0;

        batcher.setBlendMode('NORMAL');

        const drawGun = () => {
          if (gunTex) {
            batcher.drawSprite(
              gunTex,
              mountX + recoilOff.x,
              mountY + recoilOff.y,
              gunW,
              gunH,
              mountFacing + Math.PI / 2,
              0,
              0,
              1.0,
              1.0,
              1.0,
              alphaVal
            );
          }
        };

        const drawBase = () => {
          if (baseTex) {
            batcher.drawSprite(
              baseTex,
              mountX,
              mountY,
              baseW,
              baseH,
              mountFacing + Math.PI / 2,
              0,
              0,
              1.0,
              1.0,
              1.0,
              alphaVal
            );
          }
        };

        if (mount.spec.renderBarrelBelow) {
          drawGun();
          drawBase();
        } else {
          drawBase();
          drawGun();
        }

        // 武器充能微震
        if (glowImgUrl && mount.glowAlpha > 0.01 && !mount.isDisabled) {
          const [gr, gg, gb] = mount.spec.glowColor || [255, 100, 100];
          const glowInfo = textures.getTextureInfo(glowImgUrl);
          const baseGlowW = glowInfo.width > 0 ? glowInfo.width : baseW;
          const baseGlowH = glowInfo.height > 0 ? glowInfo.height : baseH;
          const glowScale = 1 + (weaponVisual.glowScale - 1) * mount.glowAlpha;
          const gw = baseGlowW * glowScale;
          const gh = baseGlowH * glowScale;
          const jX = mount.glowAlpha >= 0.7 ? (visualRandom('webgl/passes/WebGLShipPass.ts#4') - 0.5) * 2.5 : 0;
          const jY = mount.glowAlpha >= 0.7 ? (visualRandom('webgl/passes/WebGLShipPass.ts#5') - 0.5) * 2.5 : 0;

          batcher.setBlendMode('ADDITIVE');
          batcher.drawSprite(
            glowInfo.texture,
            mountX + jX,
            mountY + jY,
            gw,
            gh,
            mountFacing + Math.PI / 2,
            0,
            0,
            gr / 255,
            gg / 255,
            gb / 255,
            Math.min(1, mount.glowAlpha * weaponVisual.brightness)
          );
          const coronaSize = Math.max(gw, gh) * (0.5 + weaponVisual.glowScale * 0.24);
          batcher.drawSprite(hitGlowTex, mountX + jX, mountY + jY, coronaSize, coronaSize, 0, 0, 0, gr / 255, gg / 255, gb / 255, Math.min(0.5, mount.glowAlpha * 0.34 * weaponVisual.brightness));
          batcher.setBlendMode('NORMAL');
        }
      }

      // 2.3.1 绘制喷涌出舰体装甲上方的等离子羽流 (严格对齐 oOoOOO..._cfr_46.java)
      ventRenderer.renderVentPlumes(batcher, textures, ship);
    };

    // 插值计算玩家与敌舰位置
    const enemyPos = Vector2.lerp(engine.enemyShip.prevPos, engine.enemyShip.pos, alpha);
    let dEnemyAngle = engine.enemyShip.facingRad - engine.enemyShip.prevFacingRad;
    while (dEnemyAngle > Math.PI) dEnemyAngle -= Math.PI * 2;
    while (dEnemyAngle < -Math.PI) dEnemyAngle += Math.PI * 2;
    const enemyFacing = engine.enemyShip.prevFacingRad + dEnemyAngle * alpha;

    const playerPos = Vector2.lerp(engine.playerShip.prevPos, engine.playerShip.pos, alpha);
    let dPlayerAngle = engine.playerShip.facingRad - engine.playerShip.prevFacingRad;
    while (dPlayerAngle > Math.PI) dPlayerAngle -= Math.PI * 2;
    while (dPlayerAngle < -Math.PI) dPlayerAngle += Math.PI * 2;
    const playerFacing = engine.playerShip.prevFacingRad + dPlayerAngle * alpha;

    renderShip(engine.enemyShip, enemyPos, enemyFacing);
    renderShip(engine.playerShip, playerPos, playerFacing);

    // 3. 战损残骸碎片 (Hulk Fragments)
    if (engine.hulkFragments.length > 0) {
      batcher.setBlendMode('NORMAL');
      for (const frag of engine.hulkFragments) {
        const fragTex = textures.getTexture(frag.spriteUrl);
        const pivotNormX = (frag.pivotX / frag.spriteWidth) - 0.5;
        const pivotNormY = (frag.pivotY / frag.spriteHeight) - 0.5;
        batcher.drawSprite(fragTex, frag.pos.x, frag.pos.y, frag.spriteWidth, frag.spriteHeight, frag.facingRad + Math.PI / 2, pivotNormX, pivotNormY, 0.28, 0.24, 0.24, 0.88);
      }
    }

    // 4. 绘制舰载机群与轰炸机 (Fighters & Bombers)
    const flameTex = textures.getTexture('/game-assets/graphics/fx/engineflame32.png');
    const ftrTex = textures.getTexture('/game-assets/graphics/ships/broadsword.png');
    const bmrTex = textures.getTexture('/game-assets/graphics/ships/dagger_trp.png');

    for (const ftr of engine.fighters) {
      if (ftr.isDead) continue;
      const ftrPos = Vector2.lerp(ftr.prevPos, ftr.pos, alpha);

      batcher.setBlendMode('ADDITIVE');
      const [fr, fg, fb] = ftr.isPlayer ? [1.0, 0.55, 0.15] : [1.0, 0.25, 0.15];
      for (let i = 0; i < ftr.spec.engineSlots.length; i++) {
        const slot = ftr.spec.engineSlots[i];
        const eng = ftr.engineStatuses[i];
        const thrust = eng ? (eng.prevThrust + (eng.currentThrust - eng.prevThrust) * alpha) : Math.max(0, ftr.throttle);
        if (thrust < 0.04) continue;

        const slotOffset = new Vector2(slot.x, slot.y).rotate(ftr.facingRad);
        const nozzleX = ftrPos.x + slotOffset.x;
        const nozzleY = ftrPos.y + slotOffset.y;
        const slotAngleRad = (slot.angleDeg * Math.PI) / 180 + ftr.facingRad;
        const fLen = slot.length * thrust * (0.85 + visualRandom('webgl/passes/WebGLShipPass.ts#6') * 0.3);
        const fWid = slot.width * (0.6 + thrust * 0.4);

        batcher.drawSprite(hitGlowTex, nozzleX, nozzleY, fWid * 1.1, fWid * 1.1, 0, 0, 0, fr, fg, fb, thrust * 0.7);
        batcher.drawSprite(flameTex, nozzleX, nozzleY, fLen, fWid, slotAngleRad, -0.5, 0, fr, fg, fb, thrust * 0.85);
        batcher.drawSprite(flameTex, nozzleX, nozzleY, fLen * 0.6, fWid * 0.45, slotAngleRad, -0.5, 0, 1.0, 1.0, 1.0, thrust * 0.9);
      }

      batcher.setBlendMode('NORMAL');
      const [hr, hg, hb] = ftr.isPlayer ? [1.0, 1.0, 1.0] : [1.0, 0.72, 0.72];
      batcher.drawSprite(ftrTex, ftrPos.x, ftrPos.y, ftr.spec.spriteWidth, ftr.spec.spriteHeight, ftr.facingRad + Math.PI / 2, 0, 0, hr, hg, hb, 1.0);
    }

    for (const bmr of engine.bombers) {
      if (bmr.isDead) continue;
      const bmrPos = Vector2.lerp(bmr.prevPos, bmr.pos, alpha);

      batcher.setBlendMode('ADDITIVE');
      for (let i = 0; i < bmr.spec.engineSlots.length; i++) {
        const slot = bmr.spec.engineSlots[i];
        const eng = bmr.engineStatuses[i];
        const thrust = eng ? (eng.prevThrust + (eng.currentThrust - eng.prevThrust) * alpha) : Math.max(0, bmr.throttle);
        if (thrust < 0.04) continue;

        const slotOffset = new Vector2(slot.x, slot.y).rotate(bmr.facingRad);
        const nozzleX = bmrPos.x + slotOffset.x;
        const nozzleY = bmrPos.y + slotOffset.y;
        const slotAngleRad = (slot.angleDeg * Math.PI) / 180 + bmr.facingRad;
        const bLen = slot.length * thrust * (0.85 + visualRandom('webgl/passes/WebGLShipPass.ts#7') * 0.3);
        const bWid = slot.width * (0.6 + thrust * 0.4);

        batcher.drawSprite(hitGlowTex, nozzleX, nozzleY, bWid * 1.1, bWid * 1.1, 0, 0, 0, 0.4, 0.7, 1.0, thrust * 0.7);
        batcher.drawSprite(flameTex, nozzleX, nozzleY, bLen, bWid, slotAngleRad, -0.5, 0, 0.4, 0.7, 1.0, thrust * 0.85);
        batcher.drawSprite(flameTex, nozzleX, nozzleY, bLen * 0.6, bWid * 0.45, slotAngleRad, -0.5, 0, 1.0, 1.0, 1.0, thrust * 0.9);
      }

      batcher.setBlendMode('NORMAL');
      batcher.drawSprite(bmrTex, bmrPos.x, bmrPos.y, bmr.spec.spriteWidth, bmr.spec.spriteHeight, bmr.facingRad + Math.PI / 2, 0, 0);
    }
  }
}
