import { visualRandom } from '../../RenderDeterminism';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Ship } from '../../../simulation/Ship';
import { Vector2 } from '../../../math/Vector2';
import { getExplosionVisualProfile, getShipVisualProfile, SHIELD_VISUAL_PROFILES } from '../../../visual/VisualProfiles';

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
  public render(
    engine: CombatEngine,
    ctx: WebGLPassContext,
    nowSec: number,
    enemyPos: Vector2,
    enemyFacing: number,
    playerPos: Vector2,
    playerFacing: number,
    layers: { shield: boolean; explosion: boolean } = { shield: true, explosion: true }
  ) {
    const { batcher, textures, shieldShader, hitGlowTex, whiteTex } = ctx;
    const renderShieldLayer = layers.shield;
    const renderExplosionLayer = layers.explosion;

    // 1. 绘制折跃空间水雷 (Spatial Mines)
    if (renderExplosionLayer && engine.mines.length > 0) {
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

    const enemyShieldPos = engine.enemyShip.getShieldCenter(enemyPos, enemyFacing);
    const playerShieldPos = engine.playerShip.getShieldCenter(playerPos, playerFacing);

    if (renderShieldLayer) {
      shieldShader.renderShield(batcher.currentViewProj, engine.enemyShip, enemyShieldPos, enemyFacing, mainShieldTex, nowSec);
      shieldShader.renderShield(batcher.currentViewProj, engine.playerShip, playerShieldPos, playerFacing, mainShieldTex, nowSec);
    }

    // 恢复 SpriteBatcher 程序与 VAO 状态
    batcher.resumeProgram();

    // 3. 护盾受击接触能量闪光 (1:1 Starsector Official: hit_glow.png 闪光耀斑与粒子，严禁盖章全尺寸圆环)
    const renderShieldImpacts = (ship: Ship, sCenter: Vector2) => {
      const shield = ship.shield;
      if (!shield.isActive || shield.radius <= 0) return;
      const shipVisual = getShipVisualProfile(ship.spec.id);
      const isFortress = ship.system.type === 'FORTRESS_SHIELD' && ship.system.isActive;
      const shieldVisual = SHIELD_VISUAL_PROFILES[isFortress ? (shipVisual.fortressShieldProfile ?? 'fortress') : shipVisual.shieldProfile];
      batcher.setBlendMode('ADDITIVE');
      for (const rip of shield.ripples) {
        const hx = sCenter.x + Math.cos(rip.angle) * shield.radius;
        const hy = sCenter.y + Math.sin(rip.angle) * shield.radius;
        const [rr, rg, rb] = rip.color || [255, 200, 100];
        const gSize = 35 * shieldVisual.hitFlash * (0.8 + rip.intensity * 0.6);

        // 外层能量耀斑
        batcher.drawSprite(hitGlowTex, hx, hy, gSize * 1.5, gSize * 1.5, 0, 0, 0, rr / 255, rg / 255, rb / 255, rip.intensity * 0.85);
        // 白热碰撞核心
        batcher.drawSprite(hitGlowTex, hx, hy, gSize * 0.6, gSize * 0.6, 0, 0, 0, 1.0, 1.0, 1.0, rip.intensity);
      }
    };
    if (renderShieldLayer) {
      renderShieldImpacts(engine.enemyShip, enemyShieldPos);
      renderShieldImpacts(engine.playerShip, playerShieldPos);
    }

    // 4. 全局护盾冲击波 (Global Shield Ripples: 柔和光晕扩散)
    if (renderShieldLayer && engine.shieldRipples.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      for (const rip of engine.shieldRipples) {
        const ripAlpha = Math.max(0, rip.life / rip.maxLife);
        const [rr, rg, rb] = rip.color;
        const s = rip.radius * 1.5;
        batcher.drawSprite(hitGlowTex, rip.pos.x, rip.pos.y, s, s, 0, 0, 0, rr / 255, rg / 255, rb / 255, ripAlpha * 0.6);
      }
    }

    // 5. 绘制 EMP 闪电电弧 (EMP Arcs)
    if (renderExplosionLayer && engine.empArcs.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      for (const arc of engine.empArcs) {
        const progress = Math.max(0, Math.min(1.0, arc.life / (arc.maxLife || 0.22)));
        const flicker = 0.72 + visualRandom('webgl/passes/WebGLFXPass.ts#1') * 0.28;
        const arcAlpha = progress * flicker;
        const glow = arc.glowColor || [0, 225, 255];
        const core = arc.coreColor || [255, 255, 255];
        const baseThick = arc.thickness || 2.0;

        const drawArcChain = (segments: Vector2[], thickness: number, alphaMult = 1) => {
          for (let i = 0; i < segments.length - 1; i++) {
            const p1 = segments[i];
            const p2 = segments[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len <= 0.001) continue;
            const ang = Math.atan2(dy, dx);

            // 原版式两层电弧：柔和蓝色边缘 + 细白热核心。
            batcher.drawSprite(whiteTex, p1.x, p1.y, len, thickness * 3.0, ang, -0.5, 0, glow[0] / 255, glow[1] / 255, glow[2] / 255, arcAlpha * 0.52 * alphaMult);
            batcher.drawSprite(whiteTex, p1.x, p1.y, len, thickness * 0.72, ang, -0.5, 0, core[0] / 255, core[1] / 255, core[2] / 255, arcAlpha * alphaMult);
          }
        };

        drawArcChain(arc.segments, baseThick);
        for (const branch of arc.branches) {
          drawArcChain(branch.segments, branch.thickness, 0.72);
          const branchEnd = branch.segments[branch.segments.length - 1];
          if (branchEnd) {
            batcher.drawSprite(hitGlowTex, branchEnd.x, branchEnd.y, branch.thickness * 5, branch.thickness * 5, 0, 0, 0, glow[0] / 255, glow[1] / 255, glow[2] / 255, arcAlpha * 0.36);
          }
        }

        // 局部接点闪光只贴在放电节点上；避免整舰被大面积蓝色光晕洗白。
        batcher.drawSprite(hitGlowTex, arc.startPos.x, arc.startPos.y, baseThick * 6, baseThick * 6, 0, 0, 0, glow[0] / 255, glow[1] / 255, glow[2] / 255, arcAlpha * 0.32);
        batcher.drawSprite(hitGlowTex, arc.endPos.x, arc.endPos.y, baseThick * 9, baseThick * 9, 0, 0, 0, glow[0] / 255, glow[1] / 255, glow[2] / 255, arcAlpha * 0.62);
        batcher.drawSprite(hitGlowTex, arc.endPos.x, arc.endPos.y, baseThick * 3.2, baseThick * 3.2, 0, 0, 0, 1, 1, 1, arcAlpha * 0.8);
      }
    }

    // 6. 绘制粒子与火星 (1:1 SmoothParticle.java: 必须使用柔和高斯光晕贴图与加色混合，严禁使用硬边单色白方块)
    if (renderExplosionLayer && engine.particles && engine.particles.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      const sparkTex = textures.getTexture('/game-assets/graphics/fx/particlealpha32sq.png');
      for (const part of engine.particles) {
        const [r, g, b] = part.color;
        const pSize = part.size * 2.5;
        batcher.drawSprite(sparkTex, part.pos.x, part.pos.y, pSize, pSize, 0, 0, 0, r / 255, g / 255, b / 255, part.alpha);
      }
    }

    // 6.5 绘制战损青烟与尾迹扩散云团 (Contrails & Smoke Puffs: 1:1 contrail64b.png 柔和带旋转烟雾)
    if (renderExplosionLayer && engine.contrails && engine.contrails.length > 0) {
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

    // 6.75 来源投射物命中辉光：独立于 explosion 翻页书，半径直接来自 .proj hitGlowRadius。
    if (renderExplosionLayer && engine.hitGlows.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      for (const glow of engine.hitGlows) {
        const alpha = Math.max(0, glow.life / glow.maxLife);
        const [r, g, b] = glow.color;
        const diameter = glow.radius * 2;
        batcher.drawSprite(hitGlowTex, glow.pos.x, glow.pos.y, diameter, diameter, 0, 0, 0, r / 255, g / 255, b / 255, alpha);
      }
    }

    // 7. 绘制原版官方爆炸翻页书火光、初始白热耀光与扩散冲击波 (Explosions & Shockwaves)
    const expRingTex = textures.getTexture('/game-assets/graphics/fx/explosion_ring0.png');
    const expSmokeTex = textures.getTexture('/game-assets/graphics/fx/contrail64b.png');
    for (const exp of renderExplosionLayer ? engine.explosions : []) {
      const progress = Math.max(0, Math.min(1.0, 1.0 - exp.life / exp.maxLife));
      const [er, eg, eb] = exp.color;
      const explosionVisual = exp.sourceAuthored
        ? { flash: 1, fireball: 1, shockwave: 0, smoke: 0, debris: 0 }
        : getExplosionVisualProfile(exp.maxRadius, exp.visualKind ?? 'impact', exp.sourceShipId);

      // 7.1 初始爆心剧烈白热耀光
      if (progress < 0.35) {
        const flashAlpha = (1.0 - progress / 0.35) * explosionVisual.flash;
        const flashSize = exp.maxRadius * (exp.sourceAuthored ? 2 : 2.2);
        batcher.setBlendMode('ADDITIVE');
        batcher.drawSprite(hitGlowTex, exp.pos.x, exp.pos.y, flashSize, flashSize, 0, 0, 0, er / 255, eg / 255, eb / 255, flashAlpha);
        batcher.drawSprite(hitGlowTex, exp.pos.x, exp.pos.y, flashSize * 0.55, flashSize * 0.55, 0, 0, 0, 1.0, 1.0, 1.0, flashAlpha * 0.8);
      }

      // 7.2 冲击波环
      if (exp.hasShockwaveRing) {
        const ringAlpha = (1.0 - exp.shockwaveRadius / exp.maxShockwaveRadius) * 0.85 * explosionVisual.shockwave;
        if (ringAlpha > 0.01) {
          const rSize = exp.shockwaveRadius * 2;
          batcher.setBlendMode('ADDITIVE');
          batcher.drawSprite(expRingTex, exp.pos.x, exp.pos.y, rSize, rSize, 0, 0, 0, er / 255, eg / 255, eb / 255, ringAlpha);
        }
      }

      // 7.25 大型爆炸烟云：纯采样当前爆炸进度，不在 render 中推进任何状态。
      if (progress > 0.12 && explosionVisual.smoke > 0) {
        const smokeEnvelope = Math.sin(Math.min(1, (progress - 0.12) / 0.88) * Math.PI) * 0.3 * explosionVisual.smoke;
        if (smokeEnvelope > 0.01) {
          batcher.setBlendMode('NORMAL');
          for (let i = 0; i < 4; i++) {
            const phase = exp.rotation + i * Math.PI * 0.5;
            const wobble = 0.82 + visualRandom(`m3-explosion-smoke-${exp.id}-${i}`) * 0.36;
            const offset = exp.maxRadius * (0.08 + progress * 0.18) * wobble;
            const sx = exp.pos.x + Math.cos(phase) * offset;
            const sy = exp.pos.y + Math.sin(phase) * offset;
            const smokeSize = exp.maxRadius * (0.65 + progress * 0.72) * wobble;
            batcher.drawSprite(expSmokeTex, sx, sy, smokeSize, smokeSize, phase + progress, 0, 0, 0.14, 0.12, 0.11, smokeEnvelope * 0.42);
          }
        }
      }

      // 7.27 早期抛射的白热碎片星点，仍由同一 seed/visual time 决定。
      if (progress < 0.58 && explosionVisual.debris > 0) {
        batcher.setBlendMode('ADDITIVE');
        for (let i = 0; i < 6; i++) {
          const phase = exp.rotation + i * Math.PI / 3 + visualRandom(`m3-explosion-debris-angle-${exp.id}-${i}`) * 0.35;
          const travel = exp.maxRadius * progress * (0.45 + visualRandom(`m3-explosion-debris-speed-${exp.id}-${i}`) * 0.7);
          const dx = exp.pos.x + Math.cos(phase) * travel;
          const dy = exp.pos.y + Math.sin(phase) * travel;
          const spark = 5 + exp.maxRadius * 0.025;
          batcher.drawSprite(hitGlowTex, dx, dy, spark, spark, 0, 0, 0, 1.0, 0.7, 0.24, (1 - progress / 0.58) * 0.7 * explosionVisual.debris);
        }
      }

      // 7.3 翻页书火球
      batcher.setBlendMode('ADDITIVE');
      const expTex = textures.getTexture(`/game-assets/graphics/fx/explosion${exp.frame}.png`);
      const d = exp.radius * 2;
      batcher.drawSprite(expTex, exp.pos.x, exp.pos.y, d, d, exp.rotation, 0, 0, er / 255, eg / 255, eb / 255, 0.95 * explosionVisual.fireball);
      // Missile .proj explicitly states that the visual explosion receives a white additive core.
      // Static data does not define the core scale/envelope, so those remain conservative Web presentation defaults.
      if (exp.sourceAuthored && progress < 0.6) {
        const coreAlpha = (1 - progress / 0.6) * 0.85;
        batcher.drawSprite(expTex, exp.pos.x, exp.pos.y, d * 0.6, d * 0.6, exp.rotation, 0, 0, 1, 1, 1, coreAlpha);
      }
    }

    // 8. 绘制金属装甲战损碎片 (1:1 DebrisParticleSystem.java: 正方形真实金属破片贴图与熔融火光)
    if (renderExplosionLayer && engine.debris && engine.debris.length > 0) {
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
