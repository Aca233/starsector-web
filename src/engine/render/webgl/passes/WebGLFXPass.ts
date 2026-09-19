import { getGraphicsSettings } from '../../../runtime/GraphicsSettings';
import { nativeMineSpec } from '../../../extensions/NativeMines';
import { visualRandom, visualObjectRandom } from '../../RenderDeterminism';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Vector2 } from '../../../math/Vector2';
import { getExplosionVisualProfile } from '../../../visual/VisualProfiles';
import { hitParticleDuration } from '../../../visual/ExplosionVisuals';

/**
 * 特效与护盾渲染通道 (WebGLFXPass)
 * 职责:
 * 1. 折跃空间水雷 (Spatial Mines)
 * 2. 能量护盾扇形网格 (WebGLShieldShader: 分段受击亮度与纹理边缘)
 * 3. 武器接触闪光与冲击效果 (Weapon Contact FX)
 * 4. EMP 闪电电弧 (EMP Arcs)
 * 5. 粒子与火星 (Sparks & Dust Particles)
 * 6. 固定纹理爆炸粒子、闪光与冲击波 (Explosions & Shockwaves)
 * 7. 金属装甲战损碎片 (Debris Particles)
 */
export class WebGLFXPass {
  public render(
    engine: CombatEngine,
    ctx: WebGLPassContext,
    nowSec: number,
    _enemyPos: Vector2,
    _enemyFacing: number,
    _playerPos: Vector2,
    _playerFacing: number,
    layers: { shield: boolean; explosion: boolean } = { shield: true, explosion: true }
  ) {
    const { batcher, textures, shieldShader, hitGlowTex, whiteTex } = ctx;
    const renderShieldLayer = layers.shield;
    const renderExplosionLayer = layers.explosion;
    // Cosmetic only: never suppress projectiles, mines, shields, EMP arcs or explosion cores.
    const detail = getGraphicsSettings().detailedParticles;

    // 1. 绘制折跃空间水雷 (Spatial Mines)
    if (renderExplosionLayer && engine.mines.length > 0) {
      for (const m of engine.mines) {
        const mineSpec = nativeMineSpec(m.weaponId);
        const mineBase = textures.getTexture('/game-assets/' + mineSpec.sprite);
        const mineGlow = textures.getTexture('/game-assets/' + mineSpec.glowSprite);
        batcher.setBlendMode('NORMAL');
        const alpha = Math.min(1, m.age / Math.max(.001, m.fadeInSeconds ?? .5));
        batcher.drawSprite(mineBase, m.pos.x, m.pos.y, ...mineSpec.size as [number, number], m.rotation, 0, 0, 1, 1, 1, alpha);

        batcher.setBlendMode('ADDITIVE');
        const c = mineSpec.glowColor;
        const primedAge = mineSpec.behaviorSpec.delay - m.detonatingTimer;
        const progress = 1 - Math.max(0.1, m.detonatingTimer) / mineSpec.behaviorSpec.delay;
        // GuidedProximityFuseAI source flash function; no unrelated idle pulse.
        const flash = m.isDetonating ? Math.max(0, Math.min(1, 2 * Math.cos(progress * progress * 100) * Math.min(1, primedAge / 0.5))) : 0;
        batcher.drawSprite(mineGlow, m.pos.x, m.pos.y, ...mineSpec.size as [number, number], m.rotation, 0, 0, c[0] / 255, c[1] / 255, c[2] / 255, alpha * (m.isDetonating ? flash : 1));
      }
    }

    // 2. 绘制能量护盾 (Shields: 分段扇形网格与纹理边缘)
    batcher.flush();
    const shieldRimTex = textures.getTexture('/game-assets/graphics/hud/line8x8.png');

    if (renderShieldLayer) {
      for (const ship of engine.ships) {
        if (ship.isDead || !ship.isVisibleTo(engine.playerShip.teamId)) continue;
        const facing = ship.interpolatedFacing(ctx.alpha);
        const center = ship.getShieldCenter(ship.interpolatedPos(ctx.alpha), facing);
        const mainShieldTex = textures.getTexture(ship.shield.radius >= 128
          ? '/game-assets/graphics/fx/shields256.png'
          : ship.shield.radius >= 64 ? '/game-assets/graphics/fx/shields128c.png' : '/game-assets/graphics/fx/shields64.png');
        shieldShader.renderShield(batcher.currentViewProj, ship, center, facing, mainShieldTex, nowSec, shieldRimTex);
      }
    }

    // 恢复 SpriteBatcher 程序与 VAO 状态
    batcher.resumeProgram();

    // Shield-local response is already in the surface mesh; weapon contact FX remain below.

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
        if (arc.native) {
          const state = arc.native;
          batcher.flush();
          ctx.ribbonBatcher.begin(batcher.currentViewProj);
          ctx.ribbonBatcher.drawNativeEmpArc(
            textures.getTexture('/game-assets/graphics/fx/beamfringeb.png', true),
            textures.getTexture('/game-assets/graphics/fx/beamcoreb.png', true), arc);
          ctx.ribbonBatcher.end();
          batcher.resumeProgram();
          batcher.setBlendMode('ADDITIVE');
          const glow = (point: Vector2, diameter: number, white: boolean) => {
            const color = white ? [255, 255, 255, 255] : state.fringe;
            batcher.drawSprite(hitGlowTex, point.x, point.y, diameter, diameter, 0, 0, 0,
              color[0] / 255, color[1] / 255, color[2] / 255, Math.trunc(color[3] * state.brightness) / 255);
          };
          glow(arc.endPos, 100, false); glow(arc.endPos, 25, true);
          glow(arc.startPos, 50, false); glow(arc.startPos, 12.5, true);
          continue;
        }
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

    // 6. 通用现代粒子层：按材质分组以减少纹理/Blend 切换，并让火花、辉光、烟尘拥有不同的形状语义。
    if (detail && renderExplosionLayer && engine.particles && engine.particles.length > 0) {
      const sparkTex = textures.getTexture('/game-assets/graphics/fx/particlealpha32sq.png');
      const smokeTex = textures.getTexture('/game-assets/graphics/fx/contrail64b.png');

      // 6.1 柔光能量团：单独成批，避免和高速火花来回切 hit_glow 纹理。
      batcher.setBlendMode('ADDITIVE');
      for (const part of engine.particles) {
        if (part.material !== 'GLOW' || part.alpha <= 0.001) continue;
        const [r, g, b] = part.color;
        const size = part.size * 2.15;
        batcher.drawSprite(hitGlowTex, part.pos.x, part.pos.y, size, size, part.rotation ?? 0, 0, 0, r / 255, g / 255, b / 255, part.alpha);
      }

      // 6.2 火花/旧粒子：高速粒子沿速度方向拉伸，并叠一条更细的白热芯。
      // 这比增加粒子数量更能提升细节，同时仍保持一个纹理批次。
      for (const part of engine.particles) {
        if (part.material === 'GLOW' || part.material === 'SMOKE' || part.alpha <= 0.001) continue;
        const [r, g, b] = part.color;
        if (part.material === 'SPARK') {
          const speed = part.vel.length();
          const angle = speed > 0.001 ? part.vel.heading() : (part.rotation ?? 0);
          const width = Math.max(1, part.size * 1.25);
          const stretch = part.stretch ?? 1;
          const length = width * Math.min(8.5, 1.25 + speed * 0.012 * stretch);
          batcher.drawSprite(sparkTex, part.pos.x, part.pos.y, length, width, angle, 0, 0, r / 255, g / 255, b / 255, part.alpha);
          batcher.drawSprite(sparkTex, part.pos.x, part.pos.y, length * 0.58, Math.max(0.8, width * 0.34), angle, 0, 0, 1, 1, 1, part.alpha * 0.86);
        } else {
          // Native SmoothParticle renders exactly its authored size, without stretch or a white core.
          const pSize = part.material === 'SOURCE_SMOOTH' ? part.size : part.size * 2.5;
          batcher.drawSprite(sparkTex, part.pos.x, part.pos.y, pSize, pSize, part.rotation ?? 0, 0, 0, r / 255, g / 255, b / 255, part.alpha);
        }
      }

      // 6.3 烟尘使用 source-over；生命周期曲线已经在 CombatFXSystem 中完成，渲染层只负责批量采样。
      batcher.setBlendMode('NORMAL');
      for (const part of engine.particles) {
        if (part.material !== 'SMOKE' || part.alpha <= 0.001) continue;
        const [r, g, b] = part.color;
        batcher.drawSprite(smokeTex, part.pos.x, part.pos.y, part.size, part.size, part.rotation ?? 0, 0, 0, r / 255, g / 255, b / 255, part.alpha);
      }
    }

    // 6.5 绘制战损青烟与尾迹扩散云团 (Contrails & Smoke Puffs: 1:1 contrail64b.png 柔和带旋转烟雾)
    if (detail && renderExplosionLayer && engine.contrails && engine.contrails.length > 0) {
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

    // Native addHitParticle: independent constant-size sprites with linear, byte-quantized alpha.
    if (renderExplosionLayer && engine.hitGlows.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      for (const glow of engine.hitGlows) {
        const remaining = Math.max(0, glow.life / glow.maxLife);
        const alpha = Math.trunc(glow.peakAlpha * 255 * remaining) / 255;
        const [r, g, b] = glow.color;
        batcher.drawSprite(hitGlowTex, glow.pos.x, glow.pos.y, glow.diameter, glow.diameter,
          0, 0, 0, r / 255, g / 255, b / 255, alpha);
      }
    }

    // 7. 绘制原版官方爆炸翻页书火光、初始白热耀光与扩散冲击波 (Explosions & Shockwaves)
    const expRingTex = textures.getTexture('/game-assets/graphics/fx/explosion_ring0.png');
    const expSmokeTex = textures.getTexture('/game-assets/graphics/fx/contrail64b.png');
    for (const exp of renderExplosionLayer ? engine.explosions : []) {
      const progress = Math.max(0, Math.min(1.0, 1.0 - exp.life / exp.maxLife));
      const [er, eg, eb] = exp.color;
      const elapsed = exp.maxLife - exp.life;
      if (exp.puffs) {
        batcher.setBlendMode('ADDITIVE');
        const puffDuration = exp.puffDuration ?? exp.maxLife;
        const puffProgress = Math.min(1, elapsed / puffDuration);
        for (const puff of puffProgress < 1 ? exp.puffs : []) {
          const tex = puff.texture === 3 ? expRingTex : textures.getTexture(`/game-assets/graphics/fx/explosion${puff.texture}.png`);
          const size = puff.startSize + (puff.endSize - puff.startSize) * puffProgress;
          batcher.drawSprite(tex, exp.pos.x + puff.offset.x + puff.velocity.x * elapsed,
            exp.pos.y + puff.offset.y + puff.velocity.y * elapsed, size, size, puff.rotation,
            0, 0, er / 255, eg / 255, eb / 255, (1 - puffProgress) * 50 / 255);
        }
        if (exp.flash && elapsed < exp.flash.duration) {
          const flash = exp.flash;
          batcher.drawSprite(hitGlowTex, exp.pos.x + flash.velocity.x * elapsed, exp.pos.y + flash.velocity.y * elapsed,
            flash.diameter, flash.diameter, 0, 0, 0, flash.color[0] / 255, flash.color[1] / 255, flash.color[2] / 255,
            1 - elapsed / flash.duration);
          if (flash.coreDiameter) {
            batcher.drawSprite(hitGlowTex, exp.pos.x + flash.velocity.x * elapsed, exp.pos.y + flash.velocity.y * elapsed,
              flash.coreDiameter, flash.coreDiameter, 0, 0, 0, 1, 1, 1, 1 - elapsed / flash.duration);
          }
        }
        if (exp.flare && elapsed < 2.25) {
          const flare = exp.flare;
          const brightness = elapsed < 0.25 ? Math.sqrt(elapsed / 0.25) : Math.pow(1 - (elapsed - 0.25) / 2, 2);
          const tex = textures.getTexture('/game-assets/graphics/fx/starburst_glow1.png');
          const x = exp.pos.x + flare.velocity.x * elapsed;
          const y = exp.pos.y + flare.velocity.y * elapsed;
          batcher.drawSprite(tex, x, y, flare.width, flare.height, 0, 0, 0,
            flare.color[0] / 255, flare.color[1] / 255, flare.color[2] / 255, brightness);
          batcher.drawSprite(tex, x, y, flare.width, flare.height * 0.33, 0, 0, 0, 1, 1, 1, brightness);
        }
        continue;
      }
      if (exp.sourceAuthored) {
        // Missile.explode -> ship/A/class.java: colored diameter 2r, white diameter .5r.
        const diameter = exp.maxRadius * 2;
        const core = exp.maxRadius * 0.5;
        batcher.setBlendMode('ADDITIVE');
        batcher.drawSprite(hitGlowTex, exp.pos.x, exp.pos.y, diameter, diameter, 0, 0, 0,
          er / 255, eg / 255, eb / 255, Math.max(0, 1 - elapsed / hitParticleDuration(diameter)));
        batcher.drawSprite(hitGlowTex, exp.pos.x, exp.pos.y, core, core, 0, 0, 0,
          1, 1, 1, Math.max(0, 1 - elapsed / hitParticleDuration(core)));
        continue;
      }
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

      // 7.2 冲击波环      }

      // 7.15 多层爆炸簇：主翻页书负责识别度，程序层负责热气、碎片和二次膨胀。
      // 所有随机量来自稳定 seed，避免 render 帧率影响视觉。
      if (exp.clusterSeed !== undefined && progress < 0.95) {
        const cluster = exp.clusterSeed;
        const fireAlpha = (1 - progress) * 0.5;
        batcher.setBlendMode('ADDITIVE');
        const inner = exp.maxRadius * (0.28 + progress * 0.18);
        batcher.drawSprite(hitGlowTex, exp.pos.x, exp.pos.y, inner * 2, inner * 2, 0, 0, 0, er / 255, eg / 255, eb / 255, fireAlpha);

        for (let i = 0; i < (exp.debrisCount ?? 0); i++) {
          const angle = exp.rotation + i * 2.399 + visualObjectRandom(`cluster-${cluster}-${i}`) * 0.5;
          const distance = exp.maxRadius * progress * (0.35 + visualObjectRandom(`cluster-speed-${cluster}-${i}`) * 0.8);
          const px = exp.pos.x + Math.cos(angle) * distance;
          const py = exp.pos.y + Math.sin(angle) * distance;
          const size = 2 + exp.maxRadius * 0.018;
          batcher.drawSprite(hitGlowTex, px, py, size, size, angle, 0, 0, 1, 0.62, 0.25, fireAlpha * 0.8);
        }

        if ((exp.smokeDensity ?? 0) > 0 && progress > 0.18) {
          batcher.setBlendMode('NORMAL');
          const smokeAlpha = Math.sin(Math.min(1, (progress - 0.18) / 0.82) * Math.PI) * exp.smokeDensity * 0.2;
          const smokeSize = exp.maxRadius * (0.8 + progress * 0.8);
          batcher.drawSprite(expSmokeTex, exp.pos.x, exp.pos.y, smokeSize, smokeSize, exp.rotation + progress, 0, 0, 0.12, 0.1, 0.08, smokeAlpha);
        }
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
            const wobble = 0.82 + visualObjectRandom(`m3-explosion-smoke-${exp.id}-${i}`) * 0.36;
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
          const phase = exp.rotation + i * Math.PI / 3 + visualObjectRandom(`m3-explosion-debris-angle-${exp.id}-${i}`) * 0.35;
          const travel = exp.maxRadius * progress * (0.45 + visualObjectRandom(`m3-explosion-debris-speed-${exp.id}-${i}`) * 0.7);
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
    if (detail && renderExplosionLayer && engine.debris && engine.debris.length > 0) {
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
