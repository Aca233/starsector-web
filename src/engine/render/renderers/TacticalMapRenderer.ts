import { visualRandom, visualNowMs } from '../RenderDeterminism';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../../simulation/Ship';
import { CombatEngine } from '../../simulation/CombatEngine';
import { textureCache } from '../TextureCache';

export class TacticalMapRenderer {
  constructor() {}

  public drawTacticalTargetBracket(ctx: CanvasRenderingContext2D, ship: Ship, renderPos: Vector2) {
    if (ship.isDead) return;

    const shipW = ship.spec.spriteWidth;
    const shipH = ship.spec.spriteHeight;
    const halfW = Math.max(shipW, shipH) * 0.45;
    const halfH = halfW;
    const corner = Math.min(28, Math.max(16, halfW * 0.25));

    ctx.save();
    ctx.translate(renderPos.x, renderPos.y);

    // 1. Starsector 官方正统四角战术瞄准括号 [ ] (高对比度纯硬件绘制)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    // 左上角
    ctx.moveTo(-halfW, -halfH + corner);
    ctx.lineTo(-halfW, -halfH);
    ctx.lineTo(-halfW + corner, -halfH);
    // 右上角
    ctx.moveTo(halfW - corner, -halfH);
    ctx.lineTo(halfW, -halfH);
    ctx.lineTo(halfW, -halfH + corner);
    // 左下角
    ctx.moveTo(-halfW, halfH - corner);
    ctx.lineTo(-halfW, halfH);
    ctx.lineTo(-halfW + corner, halfH);
    // 右下角
    ctx.moveTo(halfW - corner, halfH);
    ctx.lineTo(halfW, halfH);
    ctx.lineTo(halfW, halfH - corner);
    ctx.stroke();

    ctx.restore();
  }

  public drawAimLeadPip(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    const player = engine.playerShip;
    const enemy = engine.enemyShip;
    if (player.isDead || enemy.isDead) return;

    let projSpeed = 800;
    let isBeam = false;
    const activeGroup = player.weaponGroups[player.selectedGroupIndex];
    if (activeGroup) {
      const activeMount = player.weapons.find((w) => activeGroup.weaponSlotIds.includes(w.slotId));
      if (activeMount) {
        if (activeMount.spec.isBeam) {
          isBeam = true;
        } else if (activeMount.spec.projSpeed > 0) {
          projSpeed = activeMount.spec.projSpeed;
        }
      }
    }

    const dist = player.pos.distanceTo(enemy.pos);
    const flightTime = isBeam ? 0 : dist / projSpeed;

    const relVel = enemy.vel.clone().sub(player.vel);
    const leadPos = enemy.pos.clone().addScaled(relVel, flightTime);

    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(enemy.pos.x, enemy.pos.y);
    ctx.lineTo(leadPos.x, leadPos.y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(leadPos.x, leadPos.y);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();

    const tick = 6;
    ctx.beginPath();
    ctx.moveTo(-14 - tick, 0); ctx.lineTo(-14, 0);
    ctx.moveTo(14, 0); ctx.lineTo(14 + tick, 0);
    ctx.moveTo(0, -14 - tick); ctx.lineTo(0, -14);
    ctx.moveTo(0, 14); ctx.lineTo(0, 14 + tick);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  public drawFloatingTexts(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.floatingTexts.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const ft of engine.floatingTexts) {
      const alpha = Math.min(1.0, Math.max(0, ft.life / (ft.maxLife * 0.35)));
      if (alpha <= 0.01) continue;

      ctx.font = `bold ${Math.round(ft.size)}px "Consolas", "Orbitron", "Lucida Console", monospace`;

      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.9})`;
      ctx.strokeText(ft.text, ft.pos.x, ft.pos.y);

      ctx.fillStyle = `rgba(${ft.color[0]}, ${ft.color[1]}, ${ft.color[2]}, ${alpha})`;
      ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
    }

    ctx.restore();
  }

  public drawFighters(ctx: CanvasRenderingContext2D, engine: CombatEngine, alpha: number) {
    const ftrImg = textureCache.getImage('/game-assets/graphics/ships/broadsword.png');
    const flameImg = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', 255, 140, 30);

    for (const ftr of engine.fighters) {
      if (ftr.isDead) continue;
      const renderPos = Vector2.lerp(ftr.prevPos, ftr.pos, alpha);

      let dAngle = ftr.facingRad - ftr.prevFacingRad;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      const renderFacing = ftr.prevFacingRad + dAngle * alpha;

      ctx.save();
      ctx.translate(renderPos.x, renderPos.y);
      ctx.rotate(renderFacing);

      if (flameImg && Math.abs(ftr.throttle) > 0.1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const slot of ftr.spec.engineSlots) {
          const flameLen = 14 + visualRandom('renderers/TacticalMapRenderer.ts#1') * 8;
          ctx.save();
          ctx.translate(slot.x, slot.y);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(flameImg, -3, 0, 6, flameLen);
          ctx.restore();
        }
        ctx.restore();
      }

      if (ftrImg.complete && ftrImg.naturalWidth > 0) {
        ctx.save();
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(ftrImg, -ftr.spec.pivotX, -ftr.spec.pivotY, ftr.spec.spriteWidth, ftr.spec.spriteHeight);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      if (ftr.shield.isActive) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(80, 200, 255, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, ftr.shield.radius, -Math.PI / 4, Math.PI / 4);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    const bmrImg = textureCache.getImage('/game-assets/graphics/ships/dagger_trp.png');
    const bmrFlameImg = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', 80, 180, 255);

    for (const bmr of engine.bombers) {
      if (bmr.isDead) continue;
      const renderPos = Vector2.lerp(bmr.prevPos, bmr.pos, alpha);

      let dAngle = bmr.facingRad - bmr.prevFacingRad;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      const renderFacing = bmr.prevFacingRad + dAngle * alpha;

      ctx.save();
      ctx.translate(renderPos.x, renderPos.y);
      ctx.rotate(renderFacing);

      if (bmrFlameImg && Math.abs(bmr.throttle) > 0.1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const slot of bmr.spec.engineSlots) {
          const flameLen = 16 + visualRandom('renderers/TacticalMapRenderer.ts#2') * 8;
          ctx.save();
          ctx.translate(slot.x, slot.y);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(bmrFlameImg, -slot.width / 2, 0, slot.width, flameLen);
          ctx.restore();
        }
        ctx.restore();
      }

      if (bmrImg.complete && bmrImg.naturalWidth > 0) {
        ctx.save();
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(bmrImg, -bmr.spec.pivotX, -bmr.spec.pivotY, bmr.spec.spriteWidth, bmr.spec.spriteHeight);
        ctx.restore();
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      if (bmr.shield.isActive) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(60, 220, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, bmr.shield.radius, -Math.PI * 0.3, Math.PI * 0.3);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  public drawTacticalMap(
    ctx: CanvasRenderingContext2D,
    engine: CombatEngine,
    cameraPos: Vector2,
    zoom: number,
    width: number,
    height: number
  ) {
    ctx.save();

    // 1. 全屏战术雷达黑板深色蒙版
    ctx.fillStyle = 'rgba(3, 7, 15, 0.82)';
    const viewHalfW = (width / 2) / zoom;
    const viewHalfH = (height / 2) / zoom;
    ctx.fillRect(cameraPos.x - viewHalfW, cameraPos.y - viewHalfH, viewHalfW * 2, viewHalfH * 2);

    // 2. 战术标尺网格线
    const gridSize = 1000;
    const startX = Math.floor((cameraPos.x - viewHalfW) / gridSize) * gridSize;
    const endX = Math.ceil((cameraPos.x + viewHalfW) / gridSize) * gridSize;
    const startY = Math.floor((cameraPos.y - viewHalfH) / gridSize) * gridSize;
    const endY = Math.ceil((cameraPos.y + viewHalfH) / gridSize) * gridSize;

    ctx.strokeStyle = 'rgba(30, 95, 120, 0.4)';
    ctx.lineWidth = 1 / zoom;
    ctx.font = `${Math.round(11 / zoom)}px Orbitron, monospace`;
    ctx.fillStyle = 'rgba(70, 160, 180, 0.7)';

    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, cameraPos.y - viewHalfH);
      ctx.lineTo(x, cameraPos.y + viewHalfH);
      ctx.stroke();
      ctx.fillText(`${x > 0 ? '+' : ''}${x}`, x + 5 / zoom, cameraPos.y - viewHalfH + 20 / zoom);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(cameraPos.x - viewHalfW, y);
      ctx.lineTo(cameraPos.x + viewHalfW, y);
      ctx.stroke();
      ctx.fillText(`${y > 0 ? '+' : ''}${y}`, cameraPos.x - viewHalfW + 10 / zoom, y - 5 / zoom);
    }

    // 3. 旗舰主雷达扫描圆环
    const radarCircle = textureCache.getImage('/game-assets/graphics/icons/radar_circle.png');
    if (radarCircle.complete && radarCircle.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      const rSize = 2400;
      ctx.drawImage(radarCircle, engine.playerShip.pos.x - rSize / 2, engine.playerShip.pos.y - rSize / 2, rSize, rSize);
      ctx.restore();
    }

    // 3.4 星云离子雾区战术雷达投影
    for (const neb of engine.nebulae) {
      ctx.save();
      ctx.translate(neb.pos.x, neb.pos.y);
      const isAmber = neb.type === 'AMBER';
      const grad = ctx.createRadialGradient(0, 0, neb.radius * 0.12, 0, 0, neb.radius);
      if (isAmber) {
        grad.addColorStop(0, 'rgba(240, 140, 30, 0.28)');
        grad.addColorStop(0.7, 'rgba(180, 80, 20, 0.12)');
        grad.addColorStop(1, 'rgba(100, 40, 10, 0)');
      } else {
        grad.addColorStop(0, 'rgba(40, 130, 240, 0.28)');
        grad.addColorStop(0.7, 'rgba(20, 80, 180, 0.12)');
        grad.addColorStop(1, 'rgba(10, 40, 120, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, neb.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isAmber ? 'rgba(255, 180, 80, 0.75)' : 'rgba(90, 190, 255, 0.75)';
      ctx.font = `${Math.round(11 / zoom)}px Orbitron, sans-serif`;
      ctx.fillText(isAmber ? 'IONIC NEBULA (-25% SPD)' : 'HYDROGEN NEBULA (-25% SPD)', -65 / zoom, 0);
      ctx.restore();
    }

    // 3.5 小行星地形雷达回波
    for (const ast of engine.asteroids) {
      if (ast.hp <= 0) continue;
      ctx.save();
      ctx.translate(ast.pos.x, ast.pos.y);
      ctx.fillStyle = 'rgba(100, 85, 70, 0.55)';
      ctx.strokeStyle = 'rgba(160, 140, 110, 0.4)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.arc(0, 0, ast.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (ast.radius > 35) {
        ctx.fillStyle = 'rgba(200, 180, 150, 0.6)';
        ctx.font = `${Math.round(9 / zoom)}px Orbitron, sans-serif`;
        ctx.fillText('ASTEROID', -20 / zoom, 3 / zoom);
      }
      ctx.restore();
    }

    // 4. 战舰与战机战术矢量图标与状态卡
    const allShips = [engine.playerShip, engine.enemyShip, ...engine.fighters, ...engine.bombers];
    for (const ship of allShips) {
      if (ship.isDead) continue;
      const isPlayer = ship.id === engine.playerShip.id || ship.id.startsWith('player_');
      const isCapital = ship.spec.collisionRadius > 140;
      const isCruiser = ship.spec.collisionRadius > 80 && ship.spec.collisionRadius <= 140;

      const iconPath = isCapital
        ? '/game-assets/graphics/icons/fleet3.png'
        : isCruiser
        ? '/game-assets/graphics/icons/fleet2.png'
        : '/game-assets/graphics/icons/fleet_triangle.png';

      const iconImg = textureCache.getImage(iconPath);

      ctx.save();
      ctx.translate(ship.pos.x, ship.pos.y);

      // A. 武器射程虚线圈
      if (isCapital || isCruiser) {
        ctx.strokeStyle = isPlayer ? 'rgba(60, 180, 255, 0.45)' : 'rgba(255, 90, 70, 0.45)';
        ctx.lineWidth = 1.2 / zoom;
        ctx.setLineDash([8 / zoom, 6 / zoom]);
        ctx.beginPath();
        ctx.arc(0, 0, 1000, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // B. 速度矢量线
      if (ship.vel.length() > 5) {
        ctx.strokeStyle = isPlayer ? '#38bdf8' : '#fb7185';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const vLen = ship.vel.length() * 1.5;
        const vDir = ship.vel.clone().normalize().scale(vLen);
        ctx.lineTo(vDir.x, vDir.y);
        ctx.stroke();
      }

      // C. 战术矢量图标
      ctx.save();
      ctx.rotate(ship.facingRad + Math.PI / 2);
      const iconSize = isCapital ? 38 / zoom : isCruiser ? 30 / zoom : 18 / zoom;
      if (iconImg.complete && iconImg.naturalWidth > 0) {
        ctx.drawImage(iconImg, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
      } else {
        ctx.fillStyle = isPlayer ? '#38bdf8' : '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, iconSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // C.2 战术选中高亮角标与雷达圈
      if (engine.selectedUnitId === ship.id || (engine.selectedUnitId === 'fleet' && isPlayer)) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / zoom;
        const bSize = (ship.spec.collisionRadius + 22) / zoom;
        const bLen = 14 / zoom;

        ctx.beginPath();
        ctx.moveTo(-bSize, -bSize + bLen);
        ctx.lineTo(-bSize, -bSize);
        ctx.lineTo(-bSize + bLen, -bSize);

        ctx.moveTo(bSize - bLen, -bSize);
        ctx.lineTo(bSize, -bSize);
        ctx.lineTo(bSize, -bSize + bLen);

        ctx.moveTo(-bSize, bSize - bLen);
        ctx.lineTo(-bSize, bSize);
        ctx.lineTo(-bSize + bLen, bSize);

        ctx.moveTo(bSize - bLen, bSize);
        ctx.lineTo(bSize, bSize);
        ctx.lineTo(bSize, bSize - bLen);
        ctx.stroke();

        ctx.save();
        ctx.rotate(visualNowMs() * 0.001);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.beginPath();
        ctx.arc(0, 0, bSize * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
      }

      // D. 战术状态卡片
      if (isCapital || isCruiser) {
        const cardOffX = 45 / zoom;
        const cardOffY = -35 / zoom;
        const cardW = 150 / zoom;
        const cardH = 65 / zoom;

        ctx.fillStyle = 'rgba(10, 20, 32, 0.9)';
        ctx.strokeStyle = isPlayer ? 'rgba(56, 189, 248, 0.7)' : 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 1.2 / zoom;
        ctx.fillRect(cardOffX, cardOffY, cardW, cardH);
        ctx.strokeRect(cardOffX, cardOffY, cardW, cardH);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(11 / zoom)}px Orbitron, sans-serif`;
        const shipTitle = isPlayer
          ? (ship.spec.id === 'onslaught' ? '攻势级 (Onslaught)' : '厄运级 (Doom)')
          : '典范级 (Paragon)';
        ctx.fillText(shipTitle, cardOffX + 8 / zoom, cardOffY + 16 / zoom);

        const hpRatio = Math.max(0, ship.hullHp / ship.spec.hitpoints);
        ctx.fillStyle = 'rgba(30, 40, 50, 0.8)';
        ctx.fillRect(cardOffX + 8 / zoom, cardOffY + 22 / zoom, cardW - 16 / zoom, 6 / zoom);
        ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(cardOffX + 8 / zoom, cardOffY + 22 / zoom, (cardW - 16 / zoom) * hpRatio, 6 / zoom);

        const fluxRatio = Math.min(1.0, ship.flux.totalFlux / ship.spec.maxFlux);
        ctx.fillStyle = 'rgba(30, 40, 50, 0.8)';
        ctx.fillRect(cardOffX + 8 / zoom, cardOffY + 32 / zoom, cardW - 16 / zoom, 6 / zoom);
        ctx.fillStyle = ship.flux.isOverloaded ? '#ef4444' : '#38bdf8';
        ctx.fillRect(cardOffX + 8 / zoom, cardOffY + 32 / zoom, (cardW - 16 / zoom) * fluxRatio, 6 / zoom);

        let statusText = 'COMBAT READY';
        let statusColor = '#22c55e';
        const shipOrder = engine.orders.get(ship.id);
        if (shipOrder) {
          statusText = shipOrder.type === 'ENGAGE' ? 'ORDER: ENGAGE' : 'ORDER: WAYPOINT';
          statusColor = shipOrder.type === 'ENGAGE' ? '#ef4444' : '#38bdf8';
        } else if (ship.flux.isOverloaded) {
          statusText = `OVERLOAD (${ship.flux.overloadDuration.toFixed(1)}s)`;
          statusColor = '#ef4444';
        } else if (ship.flux.isVenting) {
          statusText = 'VENTING FLUX';
          statusColor = '#38bdf8';
        } else if (ship.isPhased) {
          statusText = 'PHASE SHIFTED';
          statusColor = '#c084fc';
        } else if (ship.system.isActive) {
          statusText = ship.spec.systemType;
          statusColor = '#f59e0b';
        }

        ctx.fillStyle = statusColor;
        ctx.font = `bold ${Math.round(9 / zoom)}px Orbitron, sans-serif`;
        ctx.fillText(`STATUS: ${statusText}`, cardOffX + 8 / zoom, cardOffY + 52 / zoom);
      }

      ctx.restore();
    }

    // 4.8 战术指令导引线与目标指示标
    for (const [unitId, order] of engine.orders.entries()) {
      const unit = allShips.find((s) => s.id === unitId) || (unitId === 'fleet' ? engine.playerShip : null);
      if (!unit) continue;

      if (order.type === 'WAYPOINT' && order.targetPos) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 1.8 / zoom;
        ctx.setLineDash([8 / zoom, 6 / zoom]);
        ctx.beginPath();
        ctx.moveTo(unit.pos.x, unit.pos.y);
        ctx.lineTo(order.targetPos.x, order.targetPos.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.translate(order.targetPos.x, order.targetPos.y);
        ctx.fillStyle = 'rgba(14, 165, 233, 0.25)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / zoom;
        const wpSize = 16 / zoom;
        ctx.beginPath();
        ctx.moveTo(0, -wpSize);
        ctx.lineTo(wpSize, 0);
        ctx.lineTo(0, wpSize);
        ctx.lineTo(-wpSize, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.round(10 / zoom)}px Orbitron, sans-serif`;
        ctx.fillText('WAYPOINT', wpSize + 6 / zoom, 4 / zoom);
        ctx.restore();
      } else if (order.type === 'ENGAGE') {
        const targetShip = engine.enemyShip;
        if (targetShip && !targetShip.isDead) {
          ctx.save();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([10 / zoom, 5 / zoom]);
          ctx.beginPath();
          ctx.moveTo(unit.pos.x, unit.pos.y);
          ctx.lineTo(targetShip.pos.x, targetShip.pos.y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.translate(targetShip.pos.x, targetShip.pos.y);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2 / zoom;
          const retSize = (targetShip.spec.collisionRadius + 30) / zoom;
          ctx.beginPath();
          ctx.arc(0, 0, retSize, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(0, -retSize - 12 / zoom);
          ctx.lineTo(0, -retSize + 8 / zoom);
          ctx.moveTo(0, retSize - 8 / zoom);
          ctx.lineTo(0, retSize + 12 / zoom);
          ctx.moveTo(-retSize - 12 / zoom, 0);
          ctx.lineTo(-retSize + 8 / zoom, 0);
          ctx.moveTo(retSize - 8 / zoom, 0);
          ctx.lineTo(retSize + 12 / zoom, 0);
          ctx.stroke();

          ctx.fillStyle = '#ef4444';
          ctx.font = `bold ${Math.round(11 / zoom)}px Orbitron, sans-serif`;
          ctx.fillText('DIRECT ENGAGE', retSize + 8 / zoom, 4 / zoom);
          ctx.restore();
        }
      }
    }

    // 5. 折跃水雷雷达标记
    for (const mine of engine.mines) {
      ctx.save();
      ctx.translate(mine.pos.x, mine.pos.y);
      ctx.strokeStyle = mine.isArmed ? '#ef4444' : '#fb923c';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      const mSize = 14 / zoom;
      ctx.moveTo(0, -mSize);
      ctx.lineTo(mSize, 0);
      ctx.lineTo(0, mSize);
      ctx.lineTo(-mSize, 0);
      ctx.closePath();
      ctx.stroke();

      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.arc(0, 0, mine.triggerRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
