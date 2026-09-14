import { visualRandom } from '../../RenderDeterminism';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Vector2 } from '../../../math/Vector2';
import { getWeaponVisualProfile } from '../../../visual/VisualProfiles';
import { beamVisualTime, selectRenderableBeams } from '../../BeamVisuals';

/**
 * 弹药与光束渲染通道 (WebGLProjectilePass)
 * 职责:
 * 1. 导弹连续烟雾缎带网格 (Contrail Ribbon Strips - 1:1 ContrailEngine.java)
 * 2. 持续高能光束 (Continuous Beams - 1:1 L.java: 双层差速 UV 滚动与三层星芒透镜耀斑)
 * 3. 枪口开火平滑粒子暴风 (Muzzle Flash Particles - 1:1 _class.java & SmoothParticle.java)
 * 4. 诱饵热焰弹 (Decoy Flares)
 * 5. 等离子束脉冲弹丸 (BALLISTIC_AS_BEAM / TPC / Autopulse - 双重白热核心与 UV 滚动)
 * 6. 动能与高爆实弹 (BALLISTIC - projtrail/projbody 带纹理动能尾迹与 _if.java 双层透镜耀斑)
 * 7. 导弹与火箭 (Rocket Flames, 4 尖星芒尾喷与导弹弹体)
 * 8. 通用投射物降级渲染
 */
export class WebGLProjectilePass {
  /**
   * 绘制底图层导弹连续烟雾尾迹带 (位于舰体下方 LAYER_BELOW_SHIPS)
   */
  public renderContrails(engine: CombatEngine, ctx: WebGLPassContext) {
    const { batcher, ribbonBatcher, textures } = ctx;

    // 1. 绘制导弹连续烟雾尾迹带 (1:1 ContrailEngine.java 三角形缎带光栅化)
    if (engine.contrailEngine) {
      batcher.flush();
      const contrailTex = textures.getTexture('/game-assets/graphics/fx/contrail64b.png', true);
      ribbonBatcher.begin(batcher.currentViewProj);
      for (const strip of engine.contrailEngine.getStrips()) {
        if (strip.points.length < 2) continue;
        ribbonBatcher.drawStrip(contrailTex, strip.points, strip.color, strip.blendMode);
      }
      ribbonBatcher.end();
      batcher.resumeProgram();
    }
  }

  /**
   * 绘制高能持续光束与死光射线 (位于舰体上方 LAYER_ABOVE_SHIPS_AND_ASTEROIDS - 1:1 BeamWeaponRay.java)
   */
  public renderBeams(engine: CombatEngine, ctx: WebGLPassContext) {
    const { batcher, textures, hitGlowTex } = ctx;

    // 绘制高能持续光束 (1:1 L.java & BeamWeaponRay.java)
    if (engine.beams.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      const roughFringe = textures.getTexture('/game-assets/graphics/fx/beam_rough2_fringe.png', true);
      const smoothFringe = textures.getTexture('/game-assets/graphics/fx/beam_laser_fringe.png', true);
      const roughCore = textures.getTexture('/game-assets/graphics/fx/beam_rough2_core.png', true);
      const smoothCore = textures.getTexture('/game-assets/graphics/fx/beam_laser_core.png', true);

      for (const b of selectRenderableBeams(engine.beams)) {
        const beamDir = b.endPos.clone().sub(b.startPos);
        const beamLen = beamDir.length();
        if (beamLen < 1) continue;
        const angle = beamDir.heading();

        const [fr, fg, fb, fa = 255] = b.fringeColor || [...b.color, 255];
        const [cr, cg, cb, ca = 255] = b.coreColor || [255, 255, 255, 255];
        const [gr, gg, gb, ga = 255] = b.glowColor || [fr, fg, fb, 255];
        const visual = getWeaponVisualProfile(b.specId, 'BEAM', false, true);
        const bAlpha = Math.min(1.0, b.duration / Math.max(visual.fadeSeconds, 0.01));
        const width = b.width * visual.trailScale;
        const isRough = b.textureType === 'ROUGH' || b.specId === 'tachyonlance';
        const sourceGeometry = b.pixelsPerTexel !== undefined;
        const phaseTime = beamVisualTime(b, engine.combatTime);

        // 1. 动态高速流动羽流层 (Fringe UV Scroll: 1:1 L.java:56, 377)
        const scrollSpeed = b.textureScrollSpeed ?? 292;
        const fringeScroll = (phaseTime * scrollSpeed) / 128.0;
        const repeatWorldSpan = 128.0 * (b.pixelsPerTexel ?? (isRough ? 5.0 : 1.0));
        const repeatCount = beamLen / repeatWorldSpan;

        const fringeTex = isRough ? roughFringe : smoothFringe;
        batcher.drawSprite(
          fringeTex,
          b.startPos.x,
          b.startPos.y,
          beamLen,
          sourceGeometry ? width : width * (isRough ? 1.25 : 1.0) * visual.glowScale,
          angle,
          -0.5,
          0,
          Math.min(1, fr / 255 * visual.brightness),
          Math.min(1, fg / 255 * visual.brightness),
          Math.min(1, fb / 255 * visual.brightness),
          (sourceGeometry ? 1.0 : 0.95) * bAlpha * (fa / 255),
          -fringeScroll,
          0,
          -fringeScroll + repeatCount,
          1
        );

        // 2. 白热高能流动核心。来源 .wpn 只有一组 width/scroll；纹理自身 alpha 足迹负责收窄核心。
        const coreTex = isRough ? roughCore : smoothCore;
        const coreScroll = sourceGeometry ? fringeScroll : fringeScroll * 1.35;
        batcher.drawSprite(
          coreTex,
          b.startPos.x,
          b.startPos.y,
          beamLen,
          sourceGeometry ? width : width * visual.coreScale,
          angle,
          -0.5,
          0,
          cr / 255,
          cg / 255,
          cb / 255,
          1.0 * bAlpha * (ca / 255),
          -coreScroll,
          0,
          -coreScroll + repeatCount,
          1
        );

        // 3. 炮口紧凑真实辉光 (1:1 BeamWeaponRay: 紧贴炮管口部，严禁百像素刺眼球体)
        const muzzleGlowSize = Math.max(10, width * 1.2) * visual.muzzleScale;
        batcher.drawSprite(hitGlowTex, b.startPos.x, b.startPos.y, muzzleGlowSize, muzzleGlowSize, 0, 0, 0, gr / 255, gg / 255, gb / 255, 0.55 * bAlpha * (ga / 255));

        // 4. 目标受击装甲/护盾灼烧光斑 (1:1 BeamWeaponRay.java:124-144)
        // 严格遵循原版机制：仅当光束实际命中目标时才在碰撞点绘制受击光晕
        if (b.isHitting) {
          const hitRadius = (b.hitGlowRadius || Math.max(14, width * 1.8)) * visual.impactScale;
          const brighten = b.hitGlowBrightenDuration && b.hitGlowBrightenDuration > 0
            ? Math.min(1, b.elapsedTime / b.hitGlowBrightenDuration)
            : 1;
          batcher.drawSprite(hitGlowTex, b.endPos.x, b.endPos.y, hitRadius * 2.0, hitRadius * 2.0, 0, 0, 0, fr / 255, fg / 255, fb / 255, 0.85 * bAlpha * brighten * (fa / 255));
          batcher.drawSprite(hitGlowTex, b.endPos.x, b.endPos.y, hitRadius * 0.6, hitRadius * 0.6, 0, 0, 0, cr / 255, cg / 255, cb / 255, 1.0 * bAlpha * brighten * (ca / 255));
        }
      }
    }
  }

  /**
   * 绘制上图层投射物与枪口粒子 (位于舰体上方)
   */
  public renderProjectilesAndMuzzle(engine: CombatEngine, ctx: WebGLPassContext) {
    const { batcher, textures, hitGlowTex, alpha } = ctx;

    // 3. 绘制枪口开火粒子与火光 (1:1 _class.java:29-54 & SmoothParticle.java)
    if (engine.muzzleParticles && engine.muzzleParticles.length > 0) {
      const muzzlePartTex = textures.getTexture('/game-assets/graphics/fx/particlealpha32sq.png');
      for (const mode of ['NORMAL', 'ADDITIVE'] as const) {
        batcher.setBlendMode(mode);
        for (const p of engine.muzzleParticles) {
          if ((p.blendMode ?? 'ADDITIVE') !== mode) continue;
          const brightness = Math.max(0, p.life / p.maxLife);
          const [r, g, b, a] = p.color;
          const alphaVal = brightness * (a / 255);
          batcher.drawSprite(muzzlePartTex, p.pos.x, p.pos.y, p.size, p.size, 0, 0, 0, r / 255, g / 255, b / 255, alphaVal);
        }
      }
    }
    if (engine.muzzleFlashes.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      const mFlashTex = textures.getTexture('/game-assets/graphics/fx/muzzleflash32.1.png');
      for (const flash of engine.muzzleFlashes) {
        const mAlpha = Math.max(0, flash.life / flash.maxLife);
        const visual = getWeaponVisualProfile(flash.specId ?? '', undefined, false, false);
        const [mr, mg, mb] = flash.color;
        const muzzleSize = flash.size * visual.muzzleScale;
        batcher.drawSprite(mFlashTex, flash.pos.x, flash.pos.y, muzzleSize, muzzleSize, flash.angleRad + Math.PI / 2, 0, 0, mr / 255, mg / 255, mb / 255, Math.min(1, mAlpha * visual.brightness));
      }
    }

    // 4. 绘制实弹与等离子投射物 (Projectiles: 1:1 N.java, BallisticProjectile.java, MovingRay.java, _if.java)
    const roughFringe = textures.getTexture('/game-assets/graphics/fx/beam_rough2_fringe.png', true);
    const smoothFringe = textures.getTexture('/game-assets/graphics/fx/beamfringe.png', true);
    const roughCore = textures.getTexture('/game-assets/graphics/fx/beam_rough2_core.png', true);
    const smoothCore = textures.getTexture('/game-assets/graphics/fx/beamcore.png', true);
    const projTrailTex = textures.getTexture('/game-assets/graphics/fx/projtrail.png', true);
    const projBodyTex = textures.getTexture('/game-assets/graphics/fx/projbody.png', true);
    const rocketFlameTex = textures.getTexture('/game-assets/graphics/fx/engineflame32.png');

    for (const p of engine.projectiles) {
      const pPos = Vector2.lerp(p.prevPos, p.pos, alpha);
      const pAngle = p.facingRad !== undefined ? p.facingRad : p.vel.heading();
      const fwd = Vector2.fromAngle(pAngle);
      const visualSpawnType = p.visualSpawnType ?? p.spawnType;
      const visual = getWeaponVisualProfile(p.specId, visualSpawnType, !!p.isRocket, false);

      // 4.1 诱饵热焰弹 (Decoy Flare)
      if (p.isFlare) {
        batcher.setBlendMode('ADDITIVE');
        const flicker = 0.75 + visualRandom('webgl/passes/WebGLProjectilePass.ts#1') * 0.5;
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, 42 * flicker, 42 * flicker, 0, 0, 0, 1.0, 0.7, 0.28, Math.min(1.0, 0.85 * flicker));
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, 14 * flicker, 14 * flicker, 0, 0, 0, 1.0, 0.98, 0.95, 0.95);
      }
      // 4.2 等离子束 / 脉冲类投射物 (BALLISTIC_AS_BEAM / TPC / Autopulse: 1:1 MovingRay.java & N.java & _if.java)
      else if (visualSpawnType === 'BALLISTIC_AS_BEAM' || p.specId === 'tpc' || p.specId === 'autopulse') {
        const isRough = p.textureType === 'ROUGH' || p.specId === 'tpc';
        const len = (p.projLength || (p.specId === 'tpc' ? 100 : 50)) * visual.trailScale;
        const wid = (p.projWidth || (p.specId === 'tpc' ? 35 : 20)) * visual.glowScale;
        const [fr, fg, fb, fa = 255] = p.fringeColor || (p.specId === 'tpc' ? [255, 0, 0, 255] : [0, 0, 255, 255]);
        const [cr, cg, cb, ca = 255] = p.coreColor || [255, 255, 255, 255];

        const scrollSpeed = p.textureScrollSpeed ?? -256;
        const scrollTime = p.elapsedTime ?? engine.combatTime;
        const scroll = (scrollTime * scrollSpeed) / 128.0;
        // 现有纹理周期基准为 128 texel；原版 pixelsPerTexel=5 对应旧 rough 路径 640，
        // TPC/Autopulse 的来源值为 1，因此不应继续固定套用 640。
        const texelSpan = 128.0 * (p.pixelsPerTexel ?? (isRough ? 5.0 : 1.0));
        const repeatCount = len / texelSpan;

        batcher.setBlendMode('ADDITIVE');
        const fTex = isRough ? roughFringe : smoothFringe;
        const fringeAlphaScale = p.pixelsPerTexel !== undefined ? 1.0 : 0.95;
        batcher.drawSprite(fTex, pPos.x, pPos.y, len, wid, pAngle, 0, 0, fr / 255, fg / 255, fb / 255, fringeAlphaScale * (fa / 255), -scroll, 0, -scroll + repeatCount, 1);

        const cTex = isRough ? roughCore : smoothCore;
        // .proj 只提供一组 length/width/textureScrollSpeed；core 纹理自身的 alpha
        // 已经定义了更窄的亮芯，因此这里与 fringe 使用同一几何尺寸和 UV 速度。
        batcher.drawSprite(cTex, pPos.x, pPos.y, len, wid, pAngle, 0, 0, cr / 255, cg / 255, cb / 255, ca / 255, -scroll, 0, -scroll + repeatCount, 1);

        // Source .proj glowRadius/glowColor are an independent in-flight halo.
        // Keep this separate from hitGlowRadius, which belongs to impact FX only.
        if ((p.glowRadius ?? 0) > 0 && p.glowColor) {
          const [gr, gg, gb, ga = 255] = p.glowColor;
          const glowDiameter = p.glowRadius! * 2;
          batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, glowDiameter, glowDiameter, 0, 0, 0, gr / 255, gg / 255, gb / 255, ga / 255);
        }
      }
      // 4.3 动能 / 高爆实弹 (BALLISTIC: 1:1 BallisticProjectile.java & N.java & _if.java)
      else if (p.projSpriteUrl && !p.isRocket) {
        const len = p.projLength || 40;
        const wid = p.projWidth || 8;
        const [fr, fg, fb, fa = 255] = p.fringeColor || [...(p.color || [235, 255, 215]), 255];
        const [cr, cg, cb, ca = 255] = p.coreColor || [225, 255, 205, 255];
        const sourceGeometry = p.pixelsPerTexel !== undefined;

        batcher.setBlendMode('ADDITIVE');
        if (sourceGeometry) {
          const scrollTime = p.elapsedTime ?? engine.combatTime;
          const scrollSpeed = p.textureScrollSpeed ?? 0;
          const trailTextureWidth = 64.0;
          const bodyTextureWidth = 32.0;
          const trailScroll = (scrollTime * scrollSpeed) / trailTextureWidth;
          const bodyScroll = (scrollTime * scrollSpeed) / bodyTextureWidth;
          const trailRepeat = len / (trailTextureWidth * p.pixelsPerTexel!);
          const bodyRepeat = len / (bodyTextureWidth * p.pixelsPerTexel!);
          batcher.drawSprite(projTrailTex, pPos.x, pPos.y, len, wid, pAngle, 0, 0, fr / 255, fg / 255, fb / 255, fa / 255, -trailScroll, 0, -trailScroll + trailRepeat, 1);
          batcher.drawSprite(projBodyTex, pPos.x, pPos.y, len, wid, pAngle, 0, 0, cr / 255, cg / 255, cb / 255, ca / 255, -bodyScroll, 0, -bodyScroll + bodyRepeat, 1);
        } else {
          const tracerLen = len * 1.5 * visual.trailScale;
          const tracerCenter = pPos.clone().addScaled(fwd, -tracerLen * 0.5);
          batcher.drawSprite(projTrailTex, tracerCenter.x, tracerCenter.y, tracerLen, wid * 1.3 * Math.max(0.82, visual.glowScale), pAngle, 0, 0, fr / 255, fg / 255, fb / 255, 0.85 * (fa / 255));

          const coreTracerLen = tracerLen * 0.75;
          const coreTracerCenter = pPos.clone().addScaled(fwd, -coreTracerLen * 0.5);
          batcher.drawSprite(projBodyTex, coreTracerCenter.x, coreTracerCenter.y, coreTracerLen, wid * 0.55, pAngle, 0, 0, cr / 255, cg / 255, cb / 255, 0.95 * (ca / 255));
        }

        const bulletTex = textures.getTexture(p.projSpriteUrl);
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(bulletTex, pPos.x, pPos.y, wid, len, pAngle + Math.PI / 2, 0, 0, 1.0, 1.0, 1.0, 1.0);

        if (!sourceGeometry) {
          // Legacy fallback for projectiles that do not provide source strip geometry.
          batcher.setBlendMode('ADDITIVE');
          const tipPos = pPos.clone().addScaled(fwd, len * 0.4);
          const glintSize = Math.max(8, Math.min(24, wid * 1.6 * visual.impactScale));
          batcher.drawSprite(hitGlowTex, tipPos.x, tipPos.y, glintSize, glintSize, 0, 0, 0, fr / 255, fg / 255, fb / 255, 0.8);
          batcher.drawSprite(hitGlowTex, tipPos.x, tipPos.y, glintSize * 0.45, glintSize * 0.45, 0, 0, 0, 1.0, 1.0, 1.0, 0.95);
        }
      }
      // 4.4 导弹 / 火箭 (火箭推进喷口羽流 + 4 尖透镜星芒耀斑 + 导弹弹体)
      else if (p.isRocket) {
        const len = p.projLength || 32;
        const wid = p.projWidth || 14;
        const sourceEngine = p.missileEngineVisualSpec;
        const flameRgba = sourceEngine?.color ?? [...(p.engineFlameColor || [255, 140, 40]), 255] as [number, number, number, number];
        const flameColor: [number, number, number] = [flameRgba[0], flameRgba[1], flameRgba[2]];

        batcher.setBlendMode('ADDITIVE');
        const flameLen = sourceEngine?.length ?? ((18 + visualRandom('webgl/passes/WebGLProjectilePass.ts#2') * 8) * visual.trailScale);
        const flameWid = sourceEngine?.width ?? (wid * 0.75 * visual.glowScale);
        const flamePos = pPos.clone().addScaled(fwd, sourceEngine?.nozzleOffset ?? -len * 0.5);
        const flameAlpha = 0.9 * (flameRgba[3] / 255);
        batcher.drawSprite(rocketFlameTex, flamePos.x, flamePos.y, flameLen, flameWid, pAngle + Math.PI, -0.5, 0, flameColor[0] / 255, flameColor[1] / 255, flameColor[2] / 255, flameAlpha);
        batcher.drawSprite(rocketFlameTex, flamePos.x, flamePos.y, flameLen * 0.55, flameWid * 0.4, pAngle + Math.PI, -0.5, 0, 1.0, 1.0, 0.9, Math.min(0.95, flameAlpha + 0.05));

        const starSize = sourceEngine?.glowSizeMult !== undefined
          ? flameWid * sourceEngine.glowSizeMult * 2
          : 36 * visual.glowScale;
        batcher.drawSprite(hitGlowTex, flamePos.x, flamePos.y, starSize, starSize, 0, 0, 0, flameColor[0] / 255, flameColor[1] / 255, flameColor[2] / 255, 0.95 * (flameRgba[3] / 255));
        const coreStarSize = starSize * 0.45;
        const alt = sourceEngine?.glowAlternateColor;
        batcher.drawSprite(hitGlowTex, flamePos.x, flamePos.y, coreStarSize, coreStarSize, 0, 0, 0, (alt?.[0] ?? 255) / 255, (alt?.[1] ?? 255) / 255, (alt?.[2] ?? 255) / 255, (alt?.[3] ?? 255) / 255);

        const rocketTex = textures.getTexture(p.projSpriteUrl || '/game-assets/graphics/missiles/missile_harpoon.png');
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(rocketTex, pPos.x, pPos.y, wid, len, pAngle + Math.PI / 2, 0, 0, 1.0, 1.0, 1.0, 1.0);
      }
      // 4.5 其余标准投射物
      else {
        const [r, g, b] = p.color || [255, 200, 100];
        batcher.setBlendMode('ADDITIVE');
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, p.radius * 4 * visual.glowScale, p.radius * 2 * visual.glowScale, pAngle, 0, 0, r / 255, g / 255, b / 255, 0.9);
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, p.radius * 2 * visual.coreScale, p.radius * visual.coreScale, pAngle, 0, 0, 1.0, 1.0, 1.0, 0.95);
      }
    }
  }
}
