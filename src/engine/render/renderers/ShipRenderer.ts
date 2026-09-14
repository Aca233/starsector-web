import { visualRandom } from '../RenderDeterminism';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../../simulation/Ship';
import { textureCache } from '../TextureCache';

export class ShipRenderer {
  // 装甲战损离屏贴图缓存池 (严格按 ship.id 与 armor.dirtyVersion 缓存)
  private armorCache: Map<string, { canvas: HTMLCanvasElement; version: number }> = new Map();

  constructor() {}

  public drawShip(
    ctx: CanvasRenderingContext2D,
    ship: Ship,
    alpha: number,
    renderPos: Vector2,
    renderFacing: number
  ) {
    if (ship.isDead) return;

    ctx.save();
    ctx.translate(renderPos.x, renderPos.y);
    ctx.rotate(renderFacing);

    // 相位潜航隐形状态 (幽灵幽蓝半透明发光，纯硬件 GPU 加速，绝无软件 ctx.filter 阻塞)
    const isPhased = ship.isPhased;
    if (isPhased) {
      ctx.globalAlpha = 0.45;
      const auraGlow = textureCache.getTintedImage('/game-assets/graphics/fx/glow64.png', 80, 160, 255);
      if (auraGlow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.65;
        const gSize = ship.spec.collisionRadius * 2.3;
        ctx.drawImage(auraGlow, -gSize / 2, -gSize / 2, gSize, gSize);
        ctx.restore();
      }
    }

    // 1. 绘制发动机引擎尾焰
    this.drawEnginePlumes(ctx, ship);

    // 2. 绘制舰船主体贴图
    const img = textureCache.getImage(ship.spec.spriteUrl);
    if (img.complete && img.naturalWidth > 0) {
      ctx.save();
      // Starsector 官方贴图前向朝上 (+Y)，旋转 90 度对其引擎前向 (+X)
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(
        img,
        -ship.spec.pivotX,
        -ship.spec.pivotY,
        ship.spec.spriteWidth,
        ship.spec.spriteHeight
      );
      ctx.restore();
    } else {
      ctx.strokeStyle = ship.spec.id === 'onslaught' ? '#c85a28' : '#30a0ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(-ship.spec.collisionRadius, -ship.spec.collisionRadius * 0.6, ship.spec.collisionRadius * 2, ship.spec.collisionRadius * 1.2);
    }

    // 2.5 绘制装甲受创热斑与焦黑弹坑
    this.drawShipScorchMarks(ctx, ship);

    // 2.6 绘制 2D 装甲网格战损熔蚀与穿透破洞 (严格对齐 ArmorGrid 实际损耗)
    this.drawArmorGridDegradation(ctx, ship);

    // 3. 绘制真实武器炮塔
    this.drawTurrets(ctx, ship, renderFacing);

    // 3.5 绘制过载时舰体表面的电浆流与失控闪烁辉光
    if (ship.flux.isOverloaded) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tintedGlow = textureCache.getTintedImage('/game-assets/graphics/fx/glow64.png', 80, 200, 255);
      if (tintedGlow) {
        ctx.globalAlpha = 0.35 + visualRandom('renderers/ShipRenderer.ts#1') * 0.45;
        const gSize = ship.spec.collisionRadius * 2.2;
        ctx.drawImage(tintedGlow, -gSize / 2, -gSize / 2, gSize, gSize);
      }
      ctx.restore();
    }

    // 3.8 绘制选中武器组的战术射击包络线扇区
    if (ship.isPlayer) {
      this.drawWeaponGroupArcs(ctx, ship);
    }

    if (isPhased) {
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  }

  public drawEnginePlumes(ctx: CanvasRenderingContext2D, ship: Ship) {
    if (ship.isPhased) return;
    const isVenting = ship.flux.isVenting;
    const isBurnDrive = !isVenting && ship.system.type === 'BURN_DRIVE' && ship.system.isActive;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let slotIdx = 0; slotIdx < ship.spec.engineSlots.length; slotIdx++) {
      const slot = ship.spec.engineSlots[slotIdx];
      const engStatus = ship.engineStatuses[slotIdx];
      const isFlameout = engStatus?.isFlameout;

      if (isFlameout) {
        ctx.save();
        ctx.translate(slot.x, slot.y);
        ctx.rotate((slot.angleDeg * Math.PI) / 180);

        if (visualRandom('renderers/ShipRenderer.ts#2') < 0.28) {
          const tintedFlame = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', 255, 70, 20);
          if (tintedFlame) {
            ctx.globalAlpha = 0.55;
            ctx.save();
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(tintedFlame, -slot.width * 0.35, 0, slot.width * 0.7, slot.length * 0.4);
            ctx.restore();
          }
        }
        const hitGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', 60, 50, 45);
        if (hitGlow) {
          ctx.globalAlpha = 0.6;
          const smokeSize = slot.width * 1.5;
          ctx.drawImage(hitGlow, -smokeSize / 2, -smokeSize / 2, smokeSize, smokeSize);
        }
        ctx.restore();
        continue;
      }

      const throttleFactor = Math.max(0.18, ship.throttle > 0 ? ship.throttle : 0.12);
      let plumeLength = slot.length * throttleFactor * (0.88 + visualRandom('renderers/ShipRenderer.ts#3') * 0.24);
      let plumeWidth = slot.width;

      if (isBurnDrive) {
        plumeLength *= 3.6;
        plumeWidth *= 1.7;
      }

      ctx.save();
      ctx.translate(slot.x, slot.y);
      ctx.rotate((slot.angleDeg * Math.PI) / 180);

      const isHighTech = slot.style === 'HIGH_TECH';
      const isMidline = slot.style === 'MIDLINE';

      const flameColor: [number, number, number] = isHighTech
        ? [100, 180, 255]
        : isMidline
        ? [255, 225, 165]
        : [255, 120, 30];

      const glowColor: [number, number, number] = isHighTech
        ? [50, 140, 255]
        : isMidline
        ? [255, 180, 100]
        : [255, 90, 20];

      const coreFlameColor: [number, number, number] = isHighTech
        ? [220, 245, 255]
        : isMidline
        ? [255, 255, 230]
        : [255, 230, 160];

      const tintedGlow = textureCache.getTintedImage('/game-assets/graphics/fx/engineglow32.png', glowColor[0], glowColor[1], glowColor[2]);
      const tintedFlame = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', flameColor[0], flameColor[1], flameColor[2]);
      const tintedCoreFlame = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', coreFlameColor[0], coreFlameColor[1], coreFlameColor[2]);
      const hitGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', 255, 255, 255);

      if (tintedGlow) {
        ctx.globalAlpha = isBurnDrive ? 0.95 : 0.75;
        const glowSize = plumeWidth * 2.0;
        ctx.drawImage(tintedGlow, -glowSize * 0.5, -glowSize * 0.5, glowSize, glowSize);
      }

      if (tintedFlame) {
        ctx.globalAlpha = isBurnDrive ? 1.0 : 0.9;
        ctx.save();
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(tintedFlame, -plumeWidth / 2, 0, plumeWidth, plumeLength);
        ctx.restore();
      }

      if (tintedCoreFlame) {
        ctx.globalAlpha = isBurnDrive ? 1.0 : 0.85;
        const coreW = plumeWidth * 0.45;
        const coreL = plumeLength * 0.6;
        ctx.save();
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(tintedCoreFlame, -coreW / 2, 0, coreW, coreL);
        ctx.restore();
      }

      if (hitGlow) {
        ctx.globalAlpha = isBurnDrive ? 1.0 : 0.85;
        const throatSize = plumeWidth * 0.65;
        ctx.drawImage(hitGlow, -throatSize / 2, -throatSize / 2, throatSize, throatSize);
      }

      ctx.restore();
    }

    this.drawRcsPlumes(ctx, ship);
    ctx.restore();
  }

  public drawTurrets(ctx: CanvasRenderingContext2D, ship: Ship, shipWorldFacing: number) {
    for (const mount of ship.weapons) {
      if (mount.mountType !== 'TURRET') continue;

      ctx.save();
      ctx.translate(mount.relativePos.x, mount.relativePos.y);
      const relAngle = mount.currentAngleRad - shipWorldFacing;
      ctx.rotate(relAngle);

      // 故障短路挂点受创变暗 (使用硬件 globalAlpha，杜绝 ctx.filter 软件回退)
      if (mount.isDisabled) {
        ctx.globalAlpha = 0.45;
      }

      const recoilDist = mount.recoil * (mount.spec.visualRecoil || 0);
      const baseImg = mount.spec.turretSpriteUrl ? textureCache.getImage(mount.spec.turretSpriteUrl) : null;
      const gunImg = mount.spec.turretGunSpriteUrl ? textureCache.getImage(mount.spec.turretGunSpriteUrl) : null;

      const drawGun = () => {
        if (gunImg && gunImg.complete && gunImg.naturalWidth > 0) {
          const gw = gunImg.naturalWidth;
          const gh = gunImg.naturalHeight;
          ctx.save();
          ctx.translate(-recoilDist, 0);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(gunImg, -gw / 2, -gh / 2, gw, gh);
          ctx.restore();
        }
      };

      const drawBase = () => {
        if (baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
          const bw = baseImg.naturalWidth;
          const bh = baseImg.naturalHeight;
          ctx.save();
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(baseImg, -bw / 2, -bh / 2, bw, bh);
          ctx.restore();
        } else if (!gunImg) {
          ctx.fillStyle = '#2a333d';
          ctx.strokeStyle = '#4b5563';
          ctx.lineWidth = 1.5;
          const size = mount.spec.mountSize === 'LARGE' ? 18 : (mount.spec.mountSize === 'MEDIUM' ? 12 : 8);
          ctx.fillRect(-recoilDist, -size * 0.2, size * 1.8, size * 0.4);
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      };

      if (mount.spec.renderBarrelBelow) {
        drawGun();
        drawBase();
      } else {
        drawBase();
        drawGun();
      }

      if (mount.spec.glowSpriteUrl && mount.glowAlpha > 0.01 && !mount.isDisabled) {
        const [gr, gg, gb] = mount.spec.glowColor || [255, 100, 100];
        const tintedGlow = textureCache.getTintedImage(mount.spec.glowSpriteUrl, gr, gg, gb);
        if (tintedGlow) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = mount.glowAlpha;
          const glw = tintedGlow.width;
          const glh = tintedGlow.height;
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(tintedGlow, -glw / 2, -glh / 2, glw, glh);
          ctx.restore();
        }
      }

      // 故障挂点冒电弧火花
      if (mount.isDisabled) {
        if (visualRandom('renderers/ShipRenderer.ts#4') < 0.25) {
          ctx.save();
          ctx.strokeStyle = visualRandom('renderers/ShipRenderer.ts#5') < 0.5 ? 'rgba(100, 200, 255, 0.9)' : 'rgba(255, 180, 60, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo((visualRandom('renderers/ShipRenderer.ts#6') - 0.5) * 16, (visualRandom('renderers/ShipRenderer.ts#7') - 0.5) * 16);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();
    }

    // 2. 绘制硬挂点充能/开火光晕
    for (const mount of ship.weapons) {
      const hardpointGlowUrl = mount.spec.hardpointGlowSpriteUrl || mount.spec.glowSpriteUrl;
      if (mount.mountType === 'HARDPOINT' && hardpointGlowUrl && mount.glowAlpha > 0.01 && !mount.isDisabled) {
        const [gr, gg, gb] = mount.spec.glowColor || [255, 100, 100];
        const tintedGlow = textureCache.getTintedImage(hardpointGlowUrl, gr, gg, gb);
        if (tintedGlow) {
          ctx.save();
          ctx.translate(mount.relativePos.x, mount.relativePos.y);
          ctx.rotate((mount.baseAngleDeg * Math.PI) / 180);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = mount.glowAlpha;
          const gw = tintedGlow.width;
          const gh = tintedGlow.height;
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(tintedGlow, -gw / 2, -gh / 2, gw, gh);
          ctx.restore();
        }
      }
    }
  }

  public drawRcsPlumes(ctx: CanvasRenderingContext2D, ship: Ship) {
    const isTurningLeft = ship.turnInput < -0.05;
    const isTurningRight = ship.turnInput > 0.05;
    const isStrafingLeft = ship.strafeInput < -0.05;
    const isStrafingRight = ship.strafeInput > 0.05;
    const isBraking = ship.throttle < -0.05;
    const isAccelerating = ship.throttle > 0.05;

    if (!isTurningLeft && !isTurningRight && !isStrafingLeft && !isStrafingRight && !isBraking && !isAccelerating) return;

    const tintedFlame = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', 100, 200, 255);
    const tintedGlow = textureCache.getTintedImage('/game-assets/graphics/fx/engineglow32.png', 60, 150, 255);
    if (!tintedFlame) return;

    const rcsSlots = [
      { x: ship.spec.collisionRadius * 0.45, y: -ship.spec.collisionRadius * 0.4, outwardAngle: -Math.PI / 2 },
      { x: ship.spec.collisionRadius * 0.45, y: ship.spec.collisionRadius * 0.4, outwardAngle: Math.PI / 2 },
      { x: -ship.spec.collisionRadius * 0.5, y: -ship.spec.collisionRadius * 0.45, outwardAngle: -Math.PI / 2 },
      { x: -ship.spec.collisionRadius * 0.5, y: ship.spec.collisionRadius * 0.45, outwardAngle: Math.PI / 2 }
    ];

    const activePuffs: { x: number; y: number; angle: number; power: number }[] = [];

    if (isTurningRight) {
      activePuffs.push({ x: rcsSlots[0].x, y: rcsSlots[0].y, angle: rcsSlots[0].outwardAngle, power: 1.0 });
      activePuffs.push({ x: rcsSlots[3].x, y: rcsSlots[3].y, angle: rcsSlots[3].outwardAngle, power: 1.0 });
    }
    if (isTurningLeft) {
      activePuffs.push({ x: rcsSlots[1].x, y: rcsSlots[1].y, angle: rcsSlots[1].outwardAngle, power: 1.0 });
      activePuffs.push({ x: rcsSlots[2].x, y: rcsSlots[2].y, angle: rcsSlots[2].outwardAngle, power: 1.0 });
    }
    if (isStrafingLeft) {
      activePuffs.push({ x: rcsSlots[1].x, y: rcsSlots[1].y, angle: rcsSlots[1].outwardAngle, power: Math.min(1.0, Math.abs(ship.strafeInput)) });
      activePuffs.push({ x: rcsSlots[3].x, y: rcsSlots[3].y, angle: rcsSlots[3].outwardAngle, power: Math.min(1.0, Math.abs(ship.strafeInput)) });
    }
    if (isStrafingRight) {
      activePuffs.push({ x: rcsSlots[0].x, y: rcsSlots[0].y, angle: rcsSlots[0].outwardAngle, power: Math.min(1.0, Math.abs(ship.strafeInput)) });
      activePuffs.push({ x: rcsSlots[2].x, y: rcsSlots[2].y, angle: rcsSlots[2].outwardAngle, power: Math.min(1.0, Math.abs(ship.strafeInput)) });
    }
    if (isBraking) {
      activePuffs.push({ x: rcsSlots[0].x, y: rcsSlots[0].y, angle: 0, power: Math.min(1.0, Math.abs(ship.throttle) * 2) });
      activePuffs.push({ x: rcsSlots[1].x, y: rcsSlots[1].y, angle: 0, power: Math.min(1.0, Math.abs(ship.throttle) * 2) });
    }

    for (const puff of activePuffs) {
      ctx.save();
      ctx.translate(puff.x, puff.y);
      ctx.rotate(puff.angle);

      const rcsWidth = 8;
      const rcsLength = 20 * puff.power * (0.8 + visualRandom('renderers/ShipRenderer.ts#8') * 0.4);

      if (tintedGlow) {
        ctx.globalAlpha = 0.75 * puff.power;
        ctx.drawImage(tintedGlow, -rcsWidth, -rcsWidth, rcsWidth * 2, rcsWidth * 2);
      }

      ctx.globalAlpha = 0.9 * puff.power;
      ctx.save();
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(tintedFlame, -rcsWidth / 2, 0, rcsWidth, rcsLength);
      ctx.restore();

      ctx.restore();
    }
  }

  public drawWeaponGroupArcs(ctx: CanvasRenderingContext2D, ship: Ship) {
    if (!ship.weaponGroups || ship.weaponGroups.length === 0) return;
    const activeGroup = ship.weaponGroups[ship.selectedGroupIndex];
    if (!activeGroup) return;

    ctx.save();

    for (const slotId of activeGroup.weaponSlotIds) {
      const mount = ship.weapons.find((w) => w.slotId === slotId);
      if (!mount) continue;

      const range = mount.spec.spawnType === 'MISSILE'
        ? mount.spec.range
        : mount.spec.range * (ship.spec.weaponRangeMult || 1.0);
      const baseAngle = (mount.baseAngleDeg * Math.PI) / 180;
      const arcRad = (mount.arcDeg * Math.PI) / 180;

      ctx.save();
      ctx.translate(mount.relativePos.x, mount.relativePos.y);

      // 1. 扇区浅色填充
      ctx.fillStyle = 'rgba(0, 220, 255, 0.05)';
      ctx.beginPath();
      if (mount.arcDeg >= 355) {
        ctx.arc(0, 0, range, 0, Math.PI * 2);
      } else {
        const startA = baseAngle - arcRad / 2;
        const endA = baseAngle + arcRad / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(startA) * range, Math.sin(startA) * range);
        ctx.arc(0, 0, range, startA, endA);
        ctx.closePath();
      }
      ctx.fill();

      // 2. 扇面边界线
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(0, 235, 255, 0.65)';
      if (mount.arcDeg < 355) {
        const startA = baseAngle - arcRad / 2;
        const endA = baseAngle + arcRad / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(startA) * range, Math.sin(startA) * range);
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(endA) * range, Math.sin(endA) * range);
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  public drawShipScorchMarks(ctx: CanvasRenderingContext2D, ship: Ship) {
    if (!ship.scorchMarks || ship.scorchMarks.length === 0) return;

    const hitGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', 255, 120, 30);

    for (const sm of ship.scorchMarks) {
      ctx.save();
      ctx.translate(sm.localPos.x, sm.localPos.y);

      const craterAlpha = Math.min(0.85, 0.3 + sm.intensity * 0.55);
      ctx.fillStyle = `rgba(18, 12, 12, ${craterAlpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, sm.size * 0.55, 0, Math.PI * 2);
      ctx.fill();

      if (sm.intensity > 0.15 && hitGlow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1.0, sm.intensity * 1.3);
        const glowSize = sm.size * (0.8 + sm.intensity * 0.6);
        ctx.drawImage(hitGlow, -glowSize / 2, -glowSize / 2, glowSize, glowSize);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  /**
   * 绘制舰体表面真实 2D 装甲网格战损与击穿熔蚀
   * 根据每个网格单元的剩余装甲比例，渲染局部剥落、金属刮痕、深坑与炽热熔融外缘
   */
  public drawArmorGridDegradation(ctx: CanvasRenderingContext2D, ship: Ship) {
    const armor = ship.armor;
    if (!armor || !armor.cells || armor.dirtyVersion === 0) return;

    const maxCell = armor.maxCellArmor;
    if (maxCell <= 0) return;

    const totalW = armor.cols * armor.cellWidth;
    const totalH = armor.rows * armor.cellHeight;
    const halfW = totalW / 2;
    const halfH = totalH / 2;

    let cacheEntry = this.armorCache.get(ship.id);
    if (!cacheEntry) {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = Math.ceil(totalW);
      offCanvas.height = Math.ceil(totalH);
      cacheEntry = { canvas: offCanvas, version: -1 };
      this.armorCache.set(ship.id, cacheEntry);
    }

    // 仅当装甲承受新伤害产生版本更新时，才重新光栅化 160 单元格与多边形裁剪
    if (cacheEntry.version !== armor.dirtyVersion) {
      cacheEntry.version = armor.dirtyVersion;
      const offCtx = cacheEntry.canvas.getContext('2d');
      if (offCtx) {
        offCtx.clearRect(0, 0, totalW, totalH);
        offCtx.save();
        offCtx.translate(halfW, halfH);

        // 若舰船定义了精确物理轮廓 bounds，严格将战损图层剪裁在舰体范围内
        if (ship.spec.bounds && ship.spec.bounds.length >= 3) {
          offCtx.beginPath();
          offCtx.moveTo(ship.spec.bounds[0][0], ship.spec.bounds[0][1]);
          for (let i = 1; i < ship.spec.bounds.length; i++) {
            offCtx.lineTo(ship.spec.bounds[i][0], ship.spec.bounds[i][1]);
          }
          offCtx.closePath();
          offCtx.clip();
        }

        const cellW = armor.cellWidth * 1.05;
        const cellH = armor.cellHeight * 1.05;

        for (let r = 0; r < armor.rows; r++) {
          for (let c = 0; c < armor.cols; c++) {
            const val = armor.getCell(c, r);
            const ratio = val / maxCell;
            if (ratio >= 0.88) continue; // 装甲完好无损

            const cx = -halfW + (c + 0.5) * armor.cellWidth;
            const cy = -halfH + (r + 0.5) * armor.cellHeight;

            // 1. 基础战损破损焦黑层
            const damageSeverity = 1.0 - ratio;
            offCtx.fillStyle = `rgba(12, 10, 10, ${Math.min(0.9, damageSeverity * 0.95)})`;
            offCtx.fillRect(cx - cellW / 2, cy - cellH / 2, cellW, cellH);

            // 2. 严重破损：暴露结构与炽热金属熔渣 (ratio <= 0.45)
            if (ratio <= 0.45) {
              offCtx.strokeStyle = 'rgba(55, 45, 40, 0.75)';
              offCtx.lineWidth = 1.2;
              offCtx.beginPath();
              offCtx.moveTo(cx - cellW * 0.35, cy - cellH * 0.35);
              offCtx.lineTo(cx + cellW * 0.35, cy + cellH * 0.35);
              offCtx.stroke();

              const glowAlpha = Math.min(0.85, (0.45 - ratio) * 2.0);
              offCtx.strokeStyle = `rgba(255, 95, 25, ${glowAlpha})`;
              offCtx.lineWidth = 1.5;
              offCtx.strokeRect(cx - cellW * 0.45, cy - cellH * 0.45, cellW * 0.9, cellH * 0.9);

              // 3. 彻底击穿深坑 (ratio <= 0.15)
              if (ratio <= 0.15) {
                offCtx.fillStyle = '#050303';
                offCtx.fillRect(cx - cellW * 0.28, cy - cellH * 0.28, cellW * 0.56, cellH * 0.56);
                offCtx.fillStyle = `rgba(255, 140, 35, ${glowAlpha * 0.55})`;
                offCtx.beginPath();
                offCtx.arc(cx, cy, Math.min(cellW, cellH) * 0.2, 0, Math.PI * 2);
                offCtx.fill();
              }
            }
          }
        }

        offCtx.restore();
      }
    }

    // 核心渲染：单次 GPU 硬件贴图绘制，彻底消除每帧 160 循环与多边形裁剪
    ctx.drawImage(cacheEntry.canvas, -halfW, -halfH);
  }

  public drawPhaseGhosts(ctx: CanvasRenderingContext2D, ship: Ship) {
    if (!ship.phaseGhosts || ship.phaseGhosts.length === 0) return;
    const ghostImg = textureCache.getTintedImage(ship.spec.spriteUrl, 60, 160, 255);
    if (!ghostImg) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const ghost of ship.phaseGhosts) {
      ctx.save();
      ctx.translate(ghost.pos.x, ghost.pos.y);
      ctx.rotate(ghost.facingRad + Math.PI / 2);
      ctx.globalAlpha = ghost.alpha;
      ctx.drawImage(
        ghostImg,
        -ship.spec.pivotX,
        -ship.spec.pivotY,
        ship.spec.spriteWidth,
        ship.spec.spriteHeight
      );
      ctx.restore();
    }
    ctx.restore();
  }
}
