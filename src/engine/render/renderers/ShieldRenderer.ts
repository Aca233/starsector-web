import { visualNowMs } from '../RenderDeterminism';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../../simulation/Ship';
import { CombatEngine } from '../../simulation/CombatEngine';
import { textureCache } from '../TextureCache';
import { SHIELD_VISUAL_PROFILES } from '../../visual/VisualProfiles';

export class ShieldRenderer {
  constructor() {}

  public drawShield(ctx: CanvasRenderingContext2D, ship: Ship, renderPos: Vector2, shipFacing: number) {
    const shield = ship.shield;
    if (!shield.isActive || shield.currentArcDeg <= 2 || shield.type === 'PHASE' || shield.type === 'NONE') return;

    const isFortress = (ship.system.type === 'FORTRESS_SHIELD' && ship.system.isActive);
    const profile = SHIELD_VISUAL_PROFILES[ship.spec.id === 'onslaught' ? 'lowTech' : 'highTech'];
    const shieldInnerAngle = visualNowMs() * 0.001 * profile.textureRotationSpeed;
    const centerAngle = shield.type === 'FRONT' ? shipFacing : shield.facingAngleRad;
    const halfArcRad = (shield.currentArcDeg * Math.PI) / 360;
    const startAngle = centerAngle - halfArcRad;
    const endAngle = centerAngle + halfArcRad;

    ctx.save();
    ctx.translate(renderPos.x, renderPos.y);

    // 1. 获取阵营官方护盾色彩规范 (严格对齐 G.java 与 high_tech / low_tech 规范)
    const [sr, sg, sb] = isFortress
      ? [255, 255, 210]
      : profile.outerColor;

    // 2. 绘制内部纹理能量结界 (Inner Textured Shield Disc)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, shield.radius, startAngle, endAngle);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.clip(); // 精确剪裁至护盾当前张角

    // 内部微量底光
    ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${isFortress ? 0.06 : 0.02})`;
    ctx.fill();

    // 绘制旋转的 shields256.png
    const shieldTexture = textureCache.getTintedImage('/game-assets/graphics/fx/shields256.png', sr, sg, sb);
    if (shieldTexture) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(shieldInnerAngle);
      ctx.globalAlpha = isFortress ? 0.75 : profile.opacity;
      const tSize = shield.radius * 2.1;
      ctx.drawImage(shieldTexture, -tSize / 2, -tSize / 2, tSize, tSize);
      ctx.restore();
    }

    // 绘制 shields256ringd.png 外围微扰环材质
    const shieldRingTexture = textureCache.getTintedImage('/game-assets/graphics/fx/shields256ringd.png', Math.min(255, sr + 50), Math.min(255, sg + 50), Math.min(255, sb + 50));
    if (shieldRingTexture) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(-shieldInnerAngle * 0.7);
      ctx.globalAlpha = isFortress ? 0.85 : 0.65;
      const tSize = shield.radius * 2.0;
      ctx.drawImage(shieldRingTexture, -tSize / 2, -tSize / 2, tSize, tSize);
      ctx.restore();
    }

    ctx.restore();

    // 3. 护盾外缘正弦波动态振颤环
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 柔和辉光边缘
    ctx.beginPath();
    ctx.arc(0, 0, shield.radius, startAngle, endAngle);
    ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${isFortress ? 0.55 : 0.4})`;
    ctx.lineWidth = isFortress ? 12 : 7;
    ctx.stroke();

    // 锐利高亮外沿 (带有 G.java 的正弦波微扰与高幅能颤抖)
    ctx.beginPath();
    const segments = Math.max(16, Math.floor(shield.currentArcDeg / 4));
    const stepRad = (shield.currentArcDeg * Math.PI / 180) / segments;
    const now = visualNowMs() * 0.005;
    const fluxWobble = (ship.flux.totalFlux / ship.spec.maxFlux) * 2.5;
    for (let i = 0; i <= segments; i++) {
      const a = startAngle + i * stepRad;
      const ripple = Math.sin(i * 0.7 + now) * (1.5 + fluxWobble);
      const rad = shield.radius + ripple;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${Math.min(255, sr + 40)}, ${Math.min(255, sg + 40)}, ${Math.min(255, sb + 40)}, 0.95)`;
    ctx.lineWidth = isFortress ? 3.5 : 2.5;
    ctx.stroke();

    // 4. 护盾周长受击闪光与能量扩散涟漪 (Perimeter Impact Flashes & Expanding Arc)
    for (const rip of shield.ripples) {
      const arcSpan = 0.22 + (1.0 - rip.intensity) * 0.26;

      ctx.save();
      ctx.rotate(rip.angle);

      // A. 彩色主辉光冲击弧
      ctx.strokeStyle = `rgba(${rip.color[0]}, ${rip.color[1]}, ${rip.color[2]}, ${rip.intensity * 0.9})`;
      ctx.lineWidth = 14 * rip.intensity;
      ctx.beginPath();
      ctx.arc(0, 0, shield.radius, -arcSpan, arcSpan);
      ctx.stroke();

      // B. 极高亮度白炽核心闪光线 (白核)
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1.0, rip.intensity * 1.2)})`;
      ctx.lineWidth = Math.max(1.5, 4.5 * rip.intensity);
      ctx.beginPath();
      ctx.arc(0, 0, shield.radius, -arcSpan * 0.6, arcSpan * 0.6);
      ctx.stroke();

      ctx.restore();

      // C. 撞击点周围扩张光环与接触光晕
      const ringTex = textureCache.getTintedImage('/game-assets/graphics/fx/shields256ringd.png', rip.color[0], rip.color[1], rip.color[2]);
      if (ringTex) {
        ctx.save();
        const hx = Math.cos(rip.angle) * shield.radius;
        const hy = Math.sin(rip.angle) * shield.radius;
        ctx.translate(hx, hy);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = rip.intensity * 0.85;
        const rSize = (1.0 - rip.intensity) * 75 + 30;
        ctx.drawImage(ringTex, -rSize / 2, -rSize / 2, rSize, rSize);

        // 强接触闪光点 (Glow Bloom)
        const glowTex = textureCache.getTintedImage('/game-assets/graphics/fx/glow64.png', 255, 255, 255);
        if (glowTex && rip.intensity > 0.4) {
          ctx.globalAlpha = (rip.intensity - 0.4) * 1.4;
          const gSize = 25 * rip.intensity;
          ctx.drawImage(glowTex, -gSize / 2, -gSize / 2, gSize, gSize);
        }

        ctx.restore();
      }
    }

    ctx.restore();
    ctx.restore();
  }

  public drawInWorldRadialFluxArc(ctx: CanvasRenderingContext2D, ship: Ship, renderPos: Vector2) {
    const r = ship.spec.collisionRadius + 45;
    const flux = ship.flux;
    const maxFlux = ship.spec.maxFlux;

    const hardRatio = Math.min(1.0, flux.hardFlux / maxFlux);
    const softRatio = Math.min(1.0, flux.softFlux / maxFlux);
    const totalRatio = Math.min(1.0, (flux.softFlux + flux.hardFlux) / maxFlux);

    const startAngle = Math.PI * 0.28;
    const endAngle = Math.PI * 0.72;
    const totalAngleSpan = endAngle - startAngle;

    ctx.save();
    ctx.translate(renderPos.x, renderPos.y);

    // 1. 底层暗色刻度槽
    ctx.strokeStyle = 'rgba(15, 25, 45, 0.7)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, r, startAngle, endAngle);
    ctx.stroke();

    // 2. 刻度线
    ctx.strokeStyle = 'rgba(100, 160, 220, 0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 5; i++) {
      const a = startAngle + (totalAngleSpan * i) / 5;
      const x1 = Math.cos(a) * (r - 5);
      const y1 = Math.sin(a) * (r - 5);
      const x2 = Math.cos(a) * (r + 5);
      const y2 = Math.sin(a) * (r + 5);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // 3. 硬幅能弧面
    if (hardRatio > 0.001) {
      const hardEnd = startAngle + totalAngleSpan * hardRatio;
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, r, startAngle, hardEnd);
      ctx.stroke();
    }

    // 4. 软幅能弧面
    if (softRatio > 0.001) {
      const softStart = startAngle + totalAngleSpan * hardRatio;
      const softEnd = startAngle + totalAngleSpan * totalRatio;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, r, softStart, softEnd);
      ctx.stroke();
    }

    // 5. 危险过载高亮指示
    if (totalRatio > 0.85 || flux.isOverloaded) {
      ctx.strokeStyle = flux.isOverloaded ? '#f59e0b' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, startAngle, endAngle);
      ctx.stroke();
    }

    ctx.restore();
  }

  public drawShieldRipples(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.shieldRipples.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const rip of engine.shieldRipples) {
      const alpha = Math.max(0, rip.life / rip.maxLife);
      const tinted = textureCache.getTintedImage('/game-assets/graphics/fx/shields256ringd.png', rip.color[0], rip.color[1], rip.color[2]);
      if (tinted) {
        ctx.save();
        ctx.translate(rip.pos.x, rip.pos.y);
        ctx.globalAlpha = alpha * 0.85;
        const size = rip.radius * 2;
        ctx.drawImage(tinted, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
