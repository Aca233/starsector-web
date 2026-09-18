import { lockedCombatTarget } from '../../../runtime/CombatTargeting';
import { combatWeaponRange } from '../../../simulation/WeaponRange';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Vector2 } from '../../../math/Vector2';
import { SpriteBatcher } from '../SpriteBatcher';

/**
 * 战术 HUD 与仪表叠加通道 (WebGLTacticalOverlayPass)
 * 职责:
 * 1. R 锁定目标的导引前置量瞄准点（详情与菱形框由 HUD 绘制）
 * 2. 官方原版战术武器射界与测距弧圈 (1:1 _super.java & E.java: 同心测距圈、边界射线与散布准星括号)
 * 3. 舰载原生环形硬/软幅能槽 (In-World Radial Flux Arc)
 * 4. 战舰浮动血条与幅能条 (Floating Overhead HUD)
 */
export class WebGLTacticalOverlayPass {
  public render(
    engine: CombatEngine,
    ctx: WebGLPassContext,
    nowSec: number,
    _enemyPos: Vector2,
    playerPos: Vector2,
    activeGroupIndex: number,
    arcAnimProgress: number
  ) {
    const { batcher, textures, whiteTex } = ctx;
    // Inspection diamonds are drawn by TargetShipHUD. Lead assistance must use
    // the explicit R lock, never silently select the nearest hostile contact.
    const target = lockedCombatTarget(engine.ships, engine.playerShip);

    // 1.1 射击前置量指示星标 (Target Lead Pip)
    if (!engine.playerShip.isDead && target) {
      let projSpeed = 800;
      let isBeam = false;
      const activeGroup = engine.playerShip.weaponGroups[activeGroupIndex];
      if (activeGroup) {
        const activeMount = engine.playerShip.weapons.find((w) => activeGroup.weaponSlotIds.includes(w.slotId));
        if (activeMount) {
          if (activeMount.spec.isBeam) isBeam = true;
          else if (activeMount.spec.projSpeed > 0) projSpeed = activeMount.spec.projSpeed;
        }
      }
      const dist = engine.playerShip.pos.distanceTo(target.pos);
      const flightTime = isBeam ? 0 : dist / projSpeed;
      const relVel = target.vel.clone().sub(engine.playerShip.vel);
      const leadPos = target.pos.clone().addScaled(relVel, flightTime);

      const pipTex = textures.getTexture('/game-assets/graphics/hud/holo_target.png');
      batcher.setBlendMode('ADDITIVE');
      batcher.drawSprite(pipTex, leadPos.x, leadPos.y, 24, 24, 0, 0, 0, 1.0, 0.35, 0.35, 0.9);
    }

    // 2. 官方原版战术武器射界与测距弧圈 (1:1 _super.java & renderers/E.java)
    if (!engine.playerShip.isDead && engine.playerShip.weapons && engine.playerShip.weaponGroups && arcAnimProgress > 0.001) {
      const p = engine.playerShip;
      const activeGroup = p.weaponGroups[activeGroupIndex];
      if (activeGroup && activeGroup.weaponSlotIds && activeGroup.weaponSlotIds.length > 0) {
        let activeMounts = p.weapons.filter(
          (w) => activeGroup.weaponSlotIds.includes(w.slotId) && w.mountType !== 'HIDDEN'
        );

        // 1:1 _super.java:110-118 交替模式仅绘制当前激活主挂点，齐射模式绘制全部挂点
        if (activeGroup.mode === 'ALTERNATING' && activeMounts.length > 1) {
          const curIdx = (activeGroup.alternatingIndex || 0) % activeMounts.length;
          activeMounts = [activeMounts[curIdx]];
        }

        if (activeMounts.length > 0) {
          const lineTex = whiteTex;
          batcher.setBlendMode('NORMAL');

          for (const mount of activeMounts) {

            const offsetWorld = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(p.facingRad);
            const mountX = playerPos.x + offsetWorld.x;
            const mountY = playerPos.y + offsetWorld.y;

            let f8 = mount.arcDeg;
            if (f8 === 0) f8 = 3.0; // 1:1 _super.java:164: 固定挂点使用 3.0 度

            const pFacingDeg = (p.facingRad * 180) / Math.PI;
            const f9 = pFacingDeg + mount.baseAngleDeg;
            const f10 = combatWeaponRange(p, mount.spec);
            let f11 = Math.floor(f10 / 125.0);
            if (f11 < 1.0) f11 = 1.0;
            let f4 = f11;
            if (f4 > 10.0) f4 = 10.0;
            const f12 = f10 / f11;

            const currAngleDeg = (mount.currentAngleRad * 180) / Math.PI;
            const currSpreadDeg = Math.max(2.0, mount.currentSpreadDeg || 2.0);
            const f13 = currAngleDeg;
            const f14 = currSpreadDeg;
            const f15 = 2.0; // lineWidth

            // 1:1 settings.json: weaponArcColor: [255, 210, 0, 102], weaponArcFFColor: [255, 100, 0, 255]
            const isFF = mount.isDisabled;
            const baseColor: [number, number, number] = [255, 210, 0];
            const ffColor: [number, number, number] = [255, 100, 0];
            const color = isFF ? ffColor : baseColor;

            const masterAlpha = arcAnimProgress * (102 / 255);
            let n2 = 125; // alphaPeak
            if (isFF) {
              n2 = Math.sin(nowSec * 8) > 0 ? 255 : 60;
            }

            // 2.1 各 125px 同心测距弧线圈 (1:1 _super.java:186-191)
            const currentArcDeg = f8 * arcAnimProgress;
            for (let f17 = 1.0; f17 < f4; f17 += 1.0) {
              const f3 = f12 * f17;
              const f2 = Math.max(10.0, (f3 * Math.PI * 2.0) / 50.0);
              this.drawOfficialArc(
                batcher,
                whiteTex,
                mountX,
                mountY,
                f9 - currentArcDeg * 0.5 - 2.0,
                f9 + currentArcDeg * 0.5 + 2.0,
                f2,
                f12 * f17,
                f15,
                color,
                20,
                n2,
                masterAlpha
              );
            }

            // 2.2 最大射程外圈弧 (1:1 _super.java:193-194)
            const f3 = Math.max(10.0, (f10 * Math.PI * 2.0) / 50.0);
            this.drawOfficialArc(
              batcher,
              whiteTex,
              mountX,
              mountY,
              f9 - currentArcDeg * 0.5,
              f9 + currentArcDeg * 0.5,
              f3,
              f10,
              f15,
              color,
              20,
              n2,
              masterAlpha
            );

            // 2.3 左右边界放射线 (1:1 _super.java:195-198)
            if (f8 < 360.0) {
              const halfArc = currentArcDeg * 0.5;
              this.drawOfficialLine(batcher, lineTex, mountX, mountY, f9 - halfArc, true, 8.0, 0.0, f12, f15, color, 40, 75, masterAlpha);
              this.drawOfficialLine(batcher, lineTex, mountX, mountY, f9 + halfArc, true, 8.0, 0.0, f12, f15, color, 40, 75, masterAlpha);
              this.drawOfficialLine(batcher, lineTex, mountX, mountY, f9 - halfArc, false, 0.0, f12, f10 - f12, f15, color, 75, 125, masterAlpha);
              this.drawOfficialLine(batcher, lineTex, mountX, mountY, f9 + halfArc, false, 0.0, f12, f10 - f12, f15, color, 75, 125, masterAlpha);
            }

            // 2.4 沿当前炮塔指向 currAngle 的瞄准散布方括号 (1:1 _super.java:210-221 & E.java:226-273)
            let tickThick = 3.0;
            let tickAlphaBase = 200;
            let tickAnimAlpha = arcAnimProgress;
            if (isFF) {
              tickAnimAlpha *= 0.5 + 0.5 * Math.abs(Math.sin(nowSec * 8));
              tickAlphaBase = 255;
              tickThick = 5.0;
            }

            // 黑色阴影衬底
            for (let f18 = 1.0; f18 < f11; f18 += 1.0) {
              this.drawOfficialTick(batcher, lineTex, mountX, mountY, f13, f14, f12 * f18 + tickThick - 2.0, tickThick + 2.0, [0, 0, 0], tickAlphaBase, tickAnimAlpha);
            }
            this.drawOfficialTick(batcher, lineTex, mountX, mountY, f13, f14, f10 + tickThick - 2.0, tickThick + 2.0, [0, 0, 0], tickAlphaBase, tickAnimAlpha);

            // 亮金色本体刻度
            for (let f18 = 1.0; f18 < f11; f18 += 1.0) {
              this.drawOfficialTick(batcher, lineTex, mountX, mountY, f13, f14, f12 * f18 + tickThick - 3.0, tickThick, color, tickAlphaBase, tickAnimAlpha);
            }
            this.drawOfficialTick(batcher, lineTex, mountX, mountY, f13, f14, f10 + tickThick - 3.0, tickThick, color, tickAlphaBase, tickAnimAlpha);
          }
        }
      }
    }
  }

  /** Visual-Lab-only geometry probes for V04 pivot, hardpoint, muzzle and nozzle validation. */
  public renderDebugMarkers(
    engine: CombatEngine,
    ctx: WebGLPassContext,
    enemyPos: Vector2,
    playerPos: Vector2
  ) {
    const { batcher, whiteTex, hitGlowTex } = ctx;
    const drawLine = (x: number, y: number, angle: number, length: number, width: number, color: [number, number, number], alpha = 0.95) => {
      batcher.drawSprite(whiteTex, x, y, length, width, angle, -0.5, 0, color[0], color[1], color[2], alpha);
    };
    const drawShip = (ship: typeof engine.playerShip, pos: Vector2) => {
      // Debug probes must follow hull visibility too, or hidden/reserve contacts
      // look like untextured ships (and expose their mounts through sensor fog).
      if (ship.isDead || ship.isDocked || ship.isRetreated
        || !ship.isVisibleTo(engine.playerShip.teamId) || !engine.ships.includes(ship)) return;
      batcher.setBlendMode('ADDITIVE');
      // Rotation/pivot center cross.
      drawLine(pos.x - 11, pos.y, 0, 22, 1.5, [0.25, 1.0, 0.55]);
      drawLine(pos.x, pos.y - 11, Math.PI / 2, 22, 1.5, [0.25, 1.0, 0.55]);
      batcher.drawSprite(hitGlowTex, pos.x, pos.y, 12, 12, 0, 0, 0, 0.25, 1.0, 0.55, 0.55);

      // Weapon mount center and current muzzle/facing vector.
      for (const mount of ship.weapons) {
        const offset = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(ship.facingRad);
        const mx = pos.x + offset.x;
        const my = pos.y + offset.y;
        const hardpoint = mount.mountType === 'HARDPOINT';
        const color: [number, number, number] = hardpoint ? [1.0, 0.78, 0.18] : [0.2, 0.85, 1.0];
        batcher.drawSprite(hitGlowTex, mx, my, hardpoint ? 10 : 8, hardpoint ? 10 : 8, 0, 0, 0, color[0], color[1], color[2], 0.7);
        drawLine(mx, my, mount.currentAngleRad, 30, hardpoint ? 2.0 : 1.4, color, 0.9);
      }

      // Engine nozzle center and exhaust direction.
      for (const slot of ship.spec.engineSlots) {
        const offset = new Vector2(slot.x, slot.y).rotate(ship.facingRad);
        const nx = pos.x + offset.x;
        const ny = pos.y + offset.y;
        const angle = (slot.angleDeg * Math.PI) / 180 + ship.facingRad;
        batcher.drawSprite(hitGlowTex, nx, ny, Math.max(7, slot.width * 0.45), Math.max(7, slot.width * 0.45), 0, 0, 0, 1.0, 0.35, 0.12, 0.72);
        drawLine(nx, ny, angle, Math.max(24, slot.length * 0.45), 1.5, [1.0, 0.35, 0.12], 0.82);
      }
      batcher.setBlendMode('NORMAL');
    };

    drawShip(engine.enemyShip, enemyPos);
    drawShip(engine.playerShip, playerPos);
  }

  private drawOfficialArc(
    batcher: SpriteBatcher,
    whiteTex: WebGLTexture,
    cx: number,
    cy: number,
    startDeg: number,
    endDeg: number,
    stepLength: number,
    radius: number,
    lineWidth: number,
    color: [number, number, number],
    alphaStart: number,
    alphaPeak: number,
    masterAlpha: number
  ) {
    let diffDeg = endDeg - startDeg;
    if (diffDeg < 0) diffDeg += 360;
    if (diffDeg > 360) diffDeg = 360;
    const startRad = (startDeg * Math.PI) / 180;
    const totalRad = (diffDeg * Math.PI) / 180;
    const arcLength = totalRad * radius;
    let numSegs = Math.ceil(arcLength / stepLength);
    if (numSegs % 4 !== 0) {
      numSegs = Math.floor(numSegs / 4) * 4 + 4;
    }
    if (numSegs < 4) numSegs = 4;
    const segRad = totalRad / numSegs;

    const [cr, cg, cb] = color;

    for (let i = 0; i < numSegs; i++) {
      const t = 1.0 - 2.0 * Math.min(i / numSegs, (numSegs - i) / numSegs);
      const segAlpha = (((alphaPeak - alphaStart) * t + alphaStart) * masterAlpha) / 255;
      if (segAlpha <= 0.001) continue;

      const a1 = startRad + i * segRad;
      const a2 = startRad + (i + 1) * segRad;

      const x1 = cx + Math.cos(a1) * radius;
      const y1 = cy + Math.sin(a1) * radius;
      const x2 = cx + Math.cos(a2) * radius;
      const y2 = cy + Math.sin(a2) * radius;

      const mx = (x1 + x2) * 0.5;
      const my = (y1 + y2) * 0.5;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const rot = Math.atan2(y2 - y1, x2 - x1);

      batcher.drawSprite(whiteTex, mx, my, len + 0.5, lineWidth, rot, 0, 0, cr, cg, cb, segAlpha);
    }
  }

  private drawOfficialLine(
    batcher: SpriteBatcher,
    lineTex: WebGLTexture,
    cx: number,
    cy: number,
    angleDeg: number,
    dashed: boolean,
    dashCycle: number,
    startRadius: number,
    length: number,
    lineWidth: number,
    color: [number, number, number],
    alphaStart: number,
    alphaEnd: number,
    masterAlpha: number
  ) {
    const numSteps = 8;
    const stepLen = length / numSteps;
    const angleRad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const [cr, cg, cb] = color;

    for (let i = 0; i < numSteps; i++) {
      if (dashed && i % 2 === 0) continue;

      const t = i / numSteps;
      const segAlpha = (((alphaEnd - alphaStart) * t + alphaStart) * masterAlpha) / 255;
      if (segAlpha <= 0.001) continue;

      const r1 = startRadius + i * stepLen;
      const r2 = startRadius + (i + 1) * stepLen;
      const midR = (r1 + r2) * 0.5;
      const segMidX = cx + cosA * midR;
      const segMidY = cy + sinA * midR;

      batcher.drawSprite(lineTex, segMidX, segMidY, stepLen + 0.5, lineWidth, angleRad, 0, 0, cr, cg, cb, segAlpha);
    }
  }

  private drawOfficialTick(
    batcher: SpriteBatcher,
    whiteTex: WebGLTexture,
    cx: number,
    cy: number,
    currAngleDeg: number,
    currSpreadDeg: number,
    outerRadius: number,
    thickness: number,
    color: [number, number, number],
    alphaBase: number,
    animAlpha: number
  ) {
    const currAngleRad = (currAngleDeg * Math.PI) / 180;
    let currSpreadRad = (currSpreadDeg * Math.PI) / 180;
    let arcLen = currSpreadRad * outerRadius;
    if (arcLen < 15.0) {
      arcLen = 15.0;
      currSpreadRad = arcLen / outerRadius;
    }
    const tickAlpha = (alphaBase / 255) * animAlpha;
    if (tickAlpha <= 0.001) return;

    const [cr, cg, cb] = color;
    // 1:1 renderers/E.java:226-273 刻度沿圆弧短切线延伸
    const tickLen = Math.max(7.0, thickness * 2.2);
    const deltaRad = tickLen / outerRadius;
    const midR = outerRadius - thickness * 0.5;

    // 左刻度: 位于 (currAngleRad - currSpreadRad * 0.5)，顺时针向内侧弧度延伸
    const leftAngle = currAngleRad - currSpreadRad * 0.5;
    const leftMidAngle = leftAngle + deltaRad * 0.5;
    const lx = cx + Math.cos(leftMidAngle) * midR;
    const ly = cy + Math.sin(leftMidAngle) * midR;
    batcher.drawSprite(whiteTex, lx, ly, tickLen, thickness, leftMidAngle + Math.PI * 0.5, 0, 0, cr, cg, cb, tickAlpha);

    // 右刻度: 位于 (currAngleRad + currSpreadRad * 0.5)，逆时针向内侧弧度延伸
    const rightAngle = currAngleRad + currSpreadRad * 0.5;
    const rightMidAngle = rightAngle - deltaRad * 0.5;
    const rx = cx + Math.cos(rightMidAngle) * midR;
    const ry = cy + Math.sin(rightMidAngle) * midR;
    batcher.drawSprite(whiteTex, rx, ry, tickLen, thickness, rightMidAngle + Math.PI * 0.5, 0, 0, cr, cg, cb, tickAlpha);
  }
}
