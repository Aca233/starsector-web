import { visualRandom } from '../../RenderDeterminism';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Ship } from '../../../simulation/Ship';
import { Vector2 } from '../../../math/Vector2';
import { DEFAULT_EXPLOSION_PROFILE } from '../../../visual/VisualProfiles';

/**
 * 特效与护盾渲染通道 (WebGLFXPass)
 * 职责:
 * 1. 折跃空间水雷 (Spatial Mines)
 * 2. 能量护盾极坐标着色器 (WebGLShieldShader: 极坐标扇区剪裁与受击动态涟漪)
 * 3. 护盾受击扩张光环与冲击波 (Shield Impact Ripples & Global Ripples)
 * 4. EMP 闪电电弧 (EMP Arcs)
 * 5. 粒子与火星 (Sparks & Dust Particles)
 * 6. 原版官方爆炸翻页书火球与白热冲击波环 (Explosions & Shockwaves)
 * 7. 金属装甲战损碎片 (Debris Particles)
 */
export class WebGLFXPass {
  public render(engine: CombatEngine, ctx: WebGLPassContext, nowSec: number, enemyPos: Vector2, enemyFacing: number, playerPos: Vector2, playerFacing: number) {
    const { batcher, textures, shieldShader, hitGlowTex, whiteTex } = ctx;

    // 1. 绘制折跃空间水雷 (Spatial Mines)
    if (engine.mines.length > 0) {
      const mineBase = textures.getTexture('/game-assets/graphics/missiles/heavy_mine2.png');
      const mineGlow = textures.getTexture('/game-assets/graphics/missiles/heavy_mine2_glow.png');
      for (const m of engine.mines) {
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(mineBase, m.pos.x, m.pos.y, 48, 48, m.rotation, 0, 0);

        batcher.setBlendMode('ADDITIVE');
        const glowAlpha = m.isDetonating ? 0.95 : 0.65;
        batcher.drawSprite(mineGlow, m.pos.x, m.pos.y, 48, 48, m.rotation, 0, 0, 1.0, 0.35, 0.35, glowAlpha);
      }
    }

    // 2. 绘制能量护盾 (Shields: 专用 GPU 极坐标扇区剪裁 Shader)
    batcher.flush();
    const mainShieldTex = textures.getTexture('/game-assets/graphics/fx/shields256.png');
    const shieldRingTex = textures.getTexture('/game-assets/graphics/fx/shields256ringd.png');

    const enemyShieldPos = engine.enemyShip.getShieldCenter(enemyPos, enemyFacing);
    const playerShieldPos = engine.playerShip.getShieldCenter(playerPos, playerFacing);

    shieldShader.renderShield(batcher.currentViewProj, engine.enemyShip, enemyShieldPos, enemyFacing, mainShieldTex, shieldRingTex, nowSec);
    shieldShader.renderShield(batcher.currentViewProj, engine.playerShip, playerShieldPos, playerFacing, mainShieldTex, shieldRingTex, nowSec);

    // 恢复 SpriteBatcher 程序与 VAO 状态
    batcher.resumeProgram();

    // 3. 护盾受击接触能量闪光 (1:1 Starsector Official: hit_glow.png 闪光耀斑与粒子，严禁盖章全尺寸圆环)
    const renderShieldImpacts = (ship: Ship, sCenter: Vector2) => {
      const shield = ship.shield;
      if (!shield.isActive || shield.radius <= 0) return;
      batcher.setBlendMode('ADDITIVE');
      for (const rip of shield.ripples) {
        const hx = sCenter.x + Math.cos(rip.angle) * shield.radius;
        const hy = sCenter.y + Math.sin(rip.angle) * shield.radius;
        const [rr, rg, rb] = rip.color || [255, 200, 100];
        const gSize = 35 * (0.8 + rip.intensity * 0.6);

        // 外层能量耀斑
        batcher.drawSprite(hitGlowTex, hx, hy, gSize * 1.5, gSize * 1.5, 0, 0, 0, rr / 255, rg / 255, rb / 255, rip.intensity * 0.85);
        // 白热碰撞核心
        batcher.drawSprite(hitGlowTex, hx, hy, gSize * 0.6, gSize * 0.6, 0, 0, 0, 1.0, 1.0, 1.0, rip.intensity);
      }
    };
    renderShieldImpacts(engine.enemyShip, enemyShieldPos);
    renderShieldImpacts(engine.playerShip, playerShieldPos);

    // 4. 全局护盾冲击波 (Global Shield Ripples: 柔和光晕扩散)
    if (engine.shieldRipples.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      for (const rip of engine.shieldRipples) {
        const ripAlpha = Math.max(0, rip.life / rip.maxLife);
        const [rr, rg, rb] = rip.color;
        const s = rip.radius * 1.5;
        batcher.drawSprite(hitGlowTex, rip.pos.x, rip.pos.y, s, s, 0, 0, 0, rr / 255, rg / 255, rb / 255, ripAlpha * 0.6);
      }
    }

    // 5. 绘制 EMP 闪电电弧 (EMP Arcs)
    if (engine.empArcs.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      for (const arc of engine.empArcs) {
        const progress = Math.max(0, Math.min(1.0, arc.life / (arc.maxLife || 0.22)));
        const flicker = 0.72 + visualRandom('webgl/passes/WebGLFXPass.ts#1') * 0.28;
        const arcAlpha = progress * flicker;
        const glow = arc.glowColor || [0, 225, 255];
        const core = arc.coreColor || [255, 255, 255];
        const baseThick = arc.thickness || 2.0;

        for (let i = 0; i < arc.segments.length - 1; i++) {
          const p1 = arc.segments[i];
          const p2 = arc.segments[i + 1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx);

          // 外层电弧晕光
          batcher.drawSprite(whiteTex, p1.x, p1.y, len, baseThick * 3.2, ang, -0.5, 0, glow[0] / 255, glow[1] / 255, glow[2] / 255, arcAlpha * 0.65);
          // 白热电弧核心
          batcher.drawSprite(whiteTex, p1.x, p1.y, len, baseThick * 0.9, ang, -0.5, 0, core[0] / 255, core[1] / 255, core[2] / 255, arcAlpha);
        }

        // 终点电浆击穿高光
        batcher.drawSprite(hitGlowTex, arc.endPos.x, arc.endPos.y, baseThick * 8, baseThick * 8, 0, 0, 0, glow[0] / 255, glow[1] / 255, glow[2] / 255, arcAlpha * 0.85);
      }
    }

    // 6. 绘制粒子与火星 (1:1 SmoothParticle.java: 必须使用柔和高斯光晕贴图与加色混合，严禁使用硬边单色白方块)
    if (engine.particles && engine.particles.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      const sparkTex = textures.getTexture('/game-assets/graphics/fx/particlealpha32sq.png');
      for (const part of engine.particles) {
        const [r, g, b] = part.color;
        const pSize = part.size * 2.5;
        batcher.drawSprite(sparkTex, part.pos.x, part.pos.y, pSize, pSize, 0, 0, 0, r / 255, g / 255, b / 255, part.alpha);
      }
    }

    // 6.5 绘制战损青烟与尾迹扩散云团 (Contrails & Smoke Puffs: 1:1 contrail64b.png 柔和带旋转烟雾)
    if (engine.contrails && engine.contrails.length > 0) {
      const smokeTex = textures.getTexture('/game-assets/graphics/fx/contrail64b.png');
      for (const c of engine.contrails) {
        const progress = Math.min(1.0, c.life / c.maxLife);
        if (progress <= 0.01) continue;
        const curSize = c.size + (c.maxSize - c.size) * (1.0 - progress);
        const [cr, cg, cb] = c.color;
        const isDark = (cr + cg + cb) < 250;
        batcher.setBlendMode(isDark ? 'NORMAL' : 'ADDITIVE');
        batcher.drawSprite(
          smokeTex,
          c.pos.x,
          c.pos.y,
          curSize,
          curSize,
          c.rotation,
          0,
          0,
          cr / 255,
          cg / 255,
          cb / 255,
          c.alpha * progress * 0.75
        );
      }
    }

    // 7. 绘制原版官方爆炸翻页书火光、初始白热耀光与扩散冲击波 (Explosions & Shockwaves)
    const expRingTex = textures.getTexture('/game-assets/graphics/fx/explosion_ring0.png');
    for (const exp of engine.explosions) {
      const progress = Math.max(0, Math.min(1.0, 1.0 - exp.life / exp.maxLife));
      const [er, eg, eb] = exp.color;

      // 7.1 初始爆心剧烈白热耀光
      if (progress < 0.35) {
        const flashAlpha = (1.0 - progress / 0.35) * DEFAULT_EXPLOSION_PROFILE.flash;
        const flashSize = exp.maxRadius * 2.2;
        batcher.setBlendMode('ADDITIVE');
        batcher.drawSprite(hitGlowTex, exp.pos.x, exp.pos.y, flashSize, flashSize, 0, 0, 0, er / 255, eg / 255, eb / 255, flashAlpha);
        batcher.drawSprite(hitGlowTex, exp.pos.x, exp.pos.y, flashSize * 0.55, flashSize * 0.55, 0, 0, 0, 1.0, 1.0, 1.0, flashAlpha * 0.8);
      }

      // 7.2 冲击波环
      if (exp.hasShockwaveRing) {
        const ringAlpha = (1.0 - exp.shockwaveRadius / exp.maxShockwaveRadius) * 0.85 * DEFAULT_EXPLOSION_PROFILE.shockwave;
        if (ringAlpha > 0.01) {
          const rSize = exp.shockwaveRadius * 2;
          batcher.setBlendMode('ADDITIVE');
          batcher.drawSprite(expRingTex, exp.pos.x, exp.pos.y, rSize, rSize, 0, 0, 0, er / 255, eg / 255, eb / 255, ringAlpha);
        }
      }

      // 7.3 翻页书火球
      batcher.setBlendMode('ADDITIVE');
      const expTex = textures.getTexture(`/game-assets/graphics/fx/explosion${exp.frame}.png`);
      const d = exp.radius * 2;
      batcher.drawSprite(expTex, exp.pos.x, exp.pos.y, d, d, exp.rotation, 0, 0, er / 255, eg / 255, eb / 255, 0.95 * DEFAULT_EXPLOSION_PROFILE.fireball);
    }

    // 8. 绘制金属装甲战损碎片 (1:1 DebrisParticleSystem.java: 正方形真实金属破片贴图与熔融火光)
    if (engine.debris && engine.debris.length > 0) {
      for (const d of engine.debris) {
        const alphaVal = Math.min(1.0, Math.max(0, d.life / (d.maxLife * 0.35)));
        if (alphaVal <= 0.01) continue;
        const [dr, dg, db] = d.color || [140, 130, 120];
        const texUrl = d.spriteUrl ? `/game-assets/${d.spriteUrl}` : '/game-assets/graphics/debris/debris_sml0.png';
        const debrisTex = textures.getTexture(texUrl);

        if (d.isGlowing) {
          batcher.setBlendMode('ADDITIVE');
          batcher.drawSprite(debrisTex, d.pos.x, d.pos.y, d.size, d.size, d.rotation, 0, 0, dr / 255, dg / 255, db / 255, alphaVal);
        } else {
          batcher.setBlendMode('NORMAL');
          batcher.drawSprite(debrisTex, d.pos.x, d.pos.y, d.size, d.size, d.rotation, 0, 0, dr / 255, dg / 255, db / 255, alphaVal * 0.9);
        }
      }
    }
  }
}
