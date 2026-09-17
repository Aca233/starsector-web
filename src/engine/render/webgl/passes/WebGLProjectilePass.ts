import { renderMissileEngines, type MissileEngineRenderItem } from '../MissileEngineRenderer';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Vector2 } from '../../../math/Vector2';
import { getWeaponVisualProfile } from '../../../visual/VisualProfiles';
import { beamGlowAlpha, beamHitGlowRadius } from '../../../visual/BeamVisuals';
import { getMovingRaySourceRenderState, getMovingRayVisualState } from '../../MovingRayVisuals';

/**
 * 弹药与光束渲染通道 (WebGLProjectilePass)
 * 职责:
 * 1. 导弹连续烟雾缎带网格 (Contrail Ribbon Strips - 1:1 ContrailEngine.java)
 * 2. 持续光束 (L.java 束端几何、双层 UV 与 BeamWeaponRay 接触辉光)
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
    const { batcher, ribbonBatcher, textures, hitGlowTex } = ctx;
    if (engine.beams.length === 0) return;
    const roughFringe = textures.getTexture('/game-assets/graphics/fx/beam_rough2_fringe.png', true);
    const smoothFringe = textures.getTexture('/game-assets/graphics/fx/beam_laser_fringe.png', true);
    const roughCore = textures.getTexture('/game-assets/graphics/fx/beam_rough2_core.png', true);
    const smoothCore = textures.getTexture('/game-assets/graphics/fx/beam_laser_core.png', true);
    // One authoritative beam per mounted firing cycle; don't hide duplicate simulation entities.
    for (const beam of engine.beams) {
      if (beam.startPos.distanceTo(beam.endPos) <= 0 || (beam.brightness ?? 1) <= 0) continue;
      const rough = beam.textureType === 'ROUGH';
      batcher.flush();
      ribbonBatcher.begin(batcher.currentViewProj);
      ribbonBatcher.drawBeam(rough ? roughFringe : smoothFringe, rough ? roughCore : smoothCore,
        beam.startPos, beam.endPos, beam);
      ribbonBatcher.end();
      batcher.resumeProgram();
      batcher.setBlendMode('ADDITIVE');
      // The glow can outlive contact and moves to the ray's current endpoint, as BeamWeaponRay does.
      if ((beam.hitGlowBrightness ?? 0) <= 0) continue;
      const radius = beamHitGlowRadius(beam) * (beam.scaleGlowBasedOnDamageEffectiveness === false ? 1 : (beam.hitGlowSizeMult ?? 1));
      const fringe = beam.fringeColor ?? [...beam.color, 255];
      const core = beam.useGlowColorForHitGlow ? (beam.glowColor ?? [255, 255, 255, 255]) : (beam.coreColor ?? [255, 255, 255, 255]);
      batcher.drawSprite(hitGlowTex, beam.endPos.x, beam.endPos.y, radius * 2, radius * 2,
        0, 0, 0, fringe[0] / 255, fringe[1] / 255, fringe[2] / 255, beamGlowAlpha(beam, fringe[3]));
      batcher.drawSprite(hitGlowTex, beam.endPos.x, beam.endPos.y, radius * 0.5, radius * 0.5,
        0, 0, 0, core[0] / 255, core[1] / 255, core[2] / 255, beamGlowAlpha(beam, core[3]));
    }
  }

  /**
   * 绘制上图层投射物与枪口粒子 (位于舰体上方)
   */
  public renderProjectilesAndMuzzle(engine: CombatEngine, ctx: WebGLPassContext) {
    const { batcher, ribbonBatcher, textures, hitGlowTex, alpha } = ctx;

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
    const ballisticProjectiles: { projectile: (typeof engine.projectiles)[number]; pos: Vector2 }[] = [];
    const projBodyTex = textures.getTexture('/game-assets/graphics/fx/projbody.png', true);
    const missileEngines: MissileEngineRenderItem[] = [];

    const movingRayProjectiles: Array<{ projectile: (typeof engine.projectiles)[number]; pos: Vector2 }> = [];

    for (const p of engine.projectiles) {
      if (p.isMine) continue; // Native mine sprite/glow are drawn once in the FX pass.
      const pPos = Vector2.lerp(p.prevPos, p.pos, alpha);
      const pAngle = p.facingRad !== undefined ? p.facingRad : p.vel.heading();
      const fwd = Vector2.fromAngle(pAngle);
      const visualSpawnType = p.visualSpawnType ?? p.spawnType;
      const visual = getWeaponVisualProfile(p.specId, visualSpawnType, !!p.isRocket, false);

      // Source flares use their missile sprite and authored engine geometry, not fixed-size halos.
      if (!p.projSpriteUrl && (visualSpawnType === 'BALLISTIC_AS_BEAM' || p.specId === 'tpc' || p.specId === 'autopulse')) {
        movingRayProjectiles.push({ projectile: p, pos: pPos });
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
          ballisticProjectiles.push({ projectile: p, pos: pPos });
          continue;
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
        missileEngines.push({ projectile: p, pos: pPos });

        const rocketTex = textures.getTexture(p.projSpriteUrl || '/game-assets/graphics/missiles/missile_harpoon.png');
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(rocketTex, pPos.x, pPos.y, wid, len, pAngle + Math.PI / 2, 0, 0, 1.0, 1.0, 1.0, 1 - (p.fadeProgress ?? 0));
      }
      // 4.5 其余标准投射物
      else {
        const [r, g, b] = p.color || [255, 200, 100];
        batcher.setBlendMode('ADDITIVE');
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, p.radius * 4 * visual.glowScale, p.radius * 2 * visual.glowScale, pAngle, 0, 0, r / 255, g / 255, b / 255, 0.9);
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, p.radius * 2 * visual.coreScale, p.radius * visual.coreScale, pAngle, 0, 0, 1.0, 1.0, 1.0, 0.95);
      }
    }

    renderMissileEngines(missileEngines, ctx);

    if (ballisticProjectiles.length > 0) {
      batcher.flush();
      ribbonBatcher.begin(batcher.currentViewProj);
      ribbonBatcher.setAlphaDensityScale(1);
      for (const { projectile: p, pos } of ballisticProjectiles) {
        const sprite = textures.getTextureInfo(p.projSpriteUrl!);
        if (sprite.width <= 0 || sprite.height <= 0) continue;
        const width = p.projWidth ?? 7.5;
        const tail = p.ballisticTail
          ? Vector2.lerp(p.prevBallisticTail ?? p.ballisticTail, p.ballisticTail, ctx.alpha)
          : pos.clone().addScaled(Vector2.fromAngle(p.facingRad ?? p.vel.heading()),
            -Math.min(p.projLength ?? 0, p.elapsedTime * p.vel.length()));
        const fade = (p.prevFadeProgress ?? p.fadeProgress ?? 0) * (1 - alpha) + (p.fadeProgress ?? 0) * alpha;
        const brightness = (1 - fade) * Math.min(1, pos.distanceTo(tail) / Math.max(.001, p.projLength ?? 0));
        const phase = getMovingRaySourceRenderState(0, width, brightness, p.elapsedTime, p.textureScrollSpeed ?? 0).texturePhase;
        ribbonBatcher.drawBallisticProjectile(sprite.texture, projTrailTex, pos, tail, width,
          sprite.height / sprite.width * width, p.coreWidthMult ?? 1,
          p.fringeColor ?? [...p.color, 255], p.coreColor ?? [255, 255, 255, 255], brightness, phase);
      }
      ribbonBatcher.end();
      batcher.resumeProgram();
    }

    for (const { projectile: p, pos } of ballisticProjectiles) {
      if ((p.glowRadius ?? 0) <= 0 || !p.glowColor) continue;
      const length = p.ballisticTail ? pos.distanceTo(p.ballisticTail) : p.projLength ?? 0;
      const brightness = (1 - (p.fadeProgress ?? 0)) * Math.min(1, length / Math.max(.001, p.projLength ?? 0));
      const [r, g, b, a] = p.glowColor;
      batcher.setBlendMode('ADDITIVE');
      batcher.drawSprite(hitGlowTex, pos.x, pos.y, p.glowRadius! * 2, p.glowRadius! * 2,
        0, 0, 0, r / 255, g / 255, b / 255, a / 255 * brightness);
    }

    // 5. Source-faithful BALLISTIC_AS_BEAM mesh pass (MovingRay.java -> renderers/N.java).
    // TPC keeps its authored 100x35 data; tapering, transparent half-width ends and a twice-drawn
    // white core are what make the original projectile read as a sharp red energy needle.
    if (movingRayProjectiles.length > 0 || engine.fxSystem.movingRayFades.length > 0) {
      batcher.flush();
      ribbonBatcher.begin(batcher.currentViewProj);
      ribbonBatcher.setAlphaDensityScale(1.0);

      for (const { projectile: p, pos: pPos } of movingRayProjectiles) {
        const pAngle = p.facingRad !== undefined ? p.facingRad : p.vel.heading();
        const fwd = Vector2.fromAngle(pAngle);
        const visual = getWeaponVisualProfile(p.specId, p.visualSpawnType ?? p.spawnType, !!p.isRocket, false);
        const authoredLen = (p.projLength || (p.specId === 'tpc' ? 100 : 50)) * visual.trailScale;
        const width = (p.projWidth || (p.specId === 'tpc' ? 35 : 20)) * visual.glowScale;
        const ray = getMovingRayVisualState(authoredLen, p.elapsedTime ?? 0, p.movingRayMoveSpeed ?? p.vel.length());
        if (ray.length <= 0.1) continue;

        const tail = p.ballisticTail ? Vector2.lerp(p.prevBallisticTail ?? p.ballisticTail, p.ballisticTail, alpha)
          : pPos.clone().addScaled(fwd, -ray.length);
        const fade = (p.prevFadeProgress ?? p.fadeProgress ?? 0) * (1 - alpha) + (p.fadeProgress ?? 0) * alpha;
        ray.length = pPos.distanceTo(tail);
        ray.brightness = (1 - fade) * Math.min(1, ray.length / Math.max(.001, authoredLen));
        const sourceState = getMovingRaySourceRenderState(
          ray.length,
          width,
          ray.brightness,
          p.elapsedTime ?? engine.combatTime,
          p.textureScrollSpeed ?? -256
        );
        const fringe = p.fringeColor || (p.specId === 'tpc' ? [255, 0, 0, 255] : [0, 0, 255, 255]);
        const core = p.coreColor || [255, 255, 255, 255];
        const isRough = p.textureType === 'ROUGH' || p.specId === 'tpc';
        ribbonBatcher.drawMovingRayPulse(
          isRough ? roughFringe : smoothFringe,
          isRough ? roughCore : smoothCore,
          pPos,
          tail,
          width,
          fringe,
          core,
          ray.brightness,
          sourceState.texturePhase
        );
      }

      // Solid impacts keep the head at contact while the tail catches up. MovingRay.render()
      // also multiplies brightness by currentLength/maxPulseLength as the segment collapses.
      for (const fade of engine.fxSystem.movingRayFades) {
        const len = fade.headPos.distanceTo(fade.tailPos);
        if (len <= 0.1) continue;
        const lifeBrightness = Math.max(0, Math.min(1, fade.life / fade.maxLife));
        const lengthBrightness = Math.min(1, len / Math.max(0.1, fade.maxPulseLength));
        const brightness = lifeBrightness * lengthBrightness;
        const sourceState = getMovingRaySourceRenderState(
          len,
          fade.width,
          brightness,
          fade.elapsedTime,
          fade.textureScrollSpeed
        );
        const isRough = fade.textureType === 'ROUGH';
        ribbonBatcher.drawMovingRayPulse(
          isRough ? roughFringe : smoothFringe,
          isRough ? roughCore : smoothCore,
          fade.headPos,
          fade.tailPos,
          fade.width,
          fade.fringeColor,
          fade.coreColor,
          brightness,
          sourceState.texturePhase
        );
      }

      ribbonBatcher.end();
      batcher.resumeProgram();

      // Source glowRadius is a separate head halo; TPC itself does not define one.
      for (const { projectile: p, pos: pPos } of movingRayProjectiles) {
        if ((p.glowRadius ?? 0) <= 0 || !p.glowColor) continue;
        const ray = getMovingRayVisualState(p.projLength ?? 0, p.elapsedTime ?? 0, p.movingRayMoveSpeed ?? p.vel.length());
        const [gr, gg, gb, ga = 255] = p.glowColor;
        const glowDiameter = p.glowRadius! * 2;
        batcher.setBlendMode('ADDITIVE');
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, glowDiameter, glowDiameter, 0, 0, 0, gr / 255, gg / 255, gb / 255, (ga / 255) * ray.brightness * (1 - (p.fadeProgress ?? 0)));
      }
    }
  }
}
