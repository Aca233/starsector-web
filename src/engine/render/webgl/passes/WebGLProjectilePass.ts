import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Vector2 } from '../../../math/Vector2';

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
      const contrailTex = textures.getTexture('/api/asset?path=graphics/fx/contrail64b.png', true);
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
      const roughFringe = textures.getTexture('/api/asset?path=graphics/fx/beam_rough2_fringe.png', true);
      const smoothFringe = textures.getTexture('/api/asset?path=graphics/fx/beam_laser_fringe.png', true);
      const roughCore = textures.getTexture('/api/asset?path=graphics/fx/beam_rough2_core.png', true);
      const smoothCore = textures.getTexture('/api/asset?path=graphics/fx/beam_laser_core.png', true);

      for (const b of engine.beams) {
        const beamDir = b.endPos.clone().sub(b.startPos);
        const beamLen = beamDir.length();
        if (beamLen < 1) continue;
        const angle = beamDir.heading();

        const [fr, fg, fb] = b.fringeColor || b.color;
        const [cr, cg, cb] = b.coreColor || [255, 255, 255];
        const [gr, gg, gb] = b.glowColor || [fr, fg, fb];
        const bAlpha = Math.min(1.0, b.duration / 0.1);
        const width = b.width;
        const isRough = b.textureType === 'ROUGH' || b.specId === 'tachyonlance';

        // 1. 动态高速流动羽流层 (Fringe UV Scroll: 1:1 L.java:56, 377)
        const scrollSpeed = b.textureScrollSpeed || 292;
        const fringeScroll = ((b.elapsedTime || engine.combatTime) * scrollSpeed) / 128.0;
        const repeatCount = beamLen / (isRough ? 640.0 : 128.0);

        const fringeTex = isRough ? roughFringe : smoothFringe;
        batcher.drawSprite(
          fringeTex,
          b.startPos.x,
          b.startPos.y,
          beamLen,
          width * (isRough ? 1.25 : 1.0),
          angle,
          -0.5,
          0,
          fr / 255,
          fg / 255,
          fb / 255,
          0.95 * bAlpha,
          -fringeScroll,
          0,
          -fringeScroll + repeatCount,
          1
        );

        // 2. 白热高能流动核心 (Core UV Scroll: 1:1 L.java:381 coreScroll = fringeScroll * 1.35)
        const coreTex = isRough ? roughCore : smoothCore;
        const coreScroll = fringeScroll * 1.35;
        batcher.drawSprite(
          coreTex,
          b.startPos.x,
          b.startPos.y,
          beamLen,
          width * 0.42,
          angle,
          -0.5,
          0,
          cr / 255,
          cg / 255,
          cb / 255,
          1.0 * bAlpha,
          -coreScroll,
          0,
          -coreScroll + repeatCount,
          1
        );

        // 3. 炮口紧凑真实辉光 (1:1 BeamWeaponRay: 紧贴炮管口部，严禁百像素刺眼球体)
        const muzzleGlowSize = Math.max(10, width * 1.2);
        batcher.drawSprite(hitGlowTex, b.startPos.x, b.startPos.y, muzzleGlowSize, muzzleGlowSize, 0, 0, 0, gr / 255, gg / 255, gb / 255, 0.55 * bAlpha);

        // 4. 目标受击装甲/护盾灼烧光斑 (1:1 BeamWeaponRay.java:124-144)
        // 严格遵循原版机制：仅当光束实际命中目标时才在碰撞点绘制受击光晕
        if (b.isHitting) {
          const hitRadius = b.hitGlowRadius || Math.max(14, width * 1.8);
          batcher.drawSprite(hitGlowTex, b.endPos.x, b.endPos.y, hitRadius * 2.0, hitRadius * 2.0, 0, 0, 0, fr / 255, fg / 255, fb / 255, 0.85 * bAlpha);
          batcher.drawSprite(hitGlowTex, b.endPos.x, b.endPos.y, hitRadius * 0.6, hitRadius * 0.6, 0, 0, 0, cr / 255, cg / 255, cb / 255, 1.0 * bAlpha);
        }
      }
    }
  }

  /**
   * 绘制上图层投射物与枪口粒子 (位于舰体上方)
   */
  public renderProjectilesAndMuzzle(engine: CombatEngine, ctx: WebGLPassContext) {
    const { batcher, textures, hitGlowTex, glowTex, whiteTex, alpha } = ctx;

    // 3. 绘制枪口开火粒子与火光 (1:1 _class.java:29-54 & SmoothParticle.java)
    if (engine.muzzleParticles && engine.muzzleParticles.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      const muzzlePartTex = textures.getTexture('/api/asset?path=graphics/fx/particlealpha32sq.png');
      for (const p of engine.muzzleParticles) {
        const brightness = Math.max(0, p.life / p.maxLife);
        const [r, g, b, a] = p.color;
        const alphaVal = brightness * (a / 255);
        batcher.drawSprite(muzzlePartTex, p.pos.x, p.pos.y, p.size, p.size, 0, 0, 0, r / 255, g / 255, b / 255, alphaVal);
      }
    }
    if (engine.muzzleFlashes.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      const mFlashTex = textures.getTexture('/api/asset?path=graphics/fx/muzzleflash32.1.png');
      for (const flash of engine.muzzleFlashes) {
        const mAlpha = Math.max(0, flash.life / flash.maxLife);
        const [mr, mg, mb] = flash.color;
        batcher.drawSprite(mFlashTex, flash.pos.x, flash.pos.y, flash.size, flash.size, flash.angleRad + Math.PI / 2, 0, 0, mr / 255, mg / 255, mb / 255, mAlpha);
      }
    }

    // 4. 绘制实弹与等离子投射物 (Projectiles: 1:1 N.java, BallisticProjectile.java, MovingRay.java, _if.java)
    const roughFringe = textures.getTexture('/api/asset?path=graphics/fx/beam_rough2_fringe.png', true);
    const smoothFringe = textures.getTexture('/api/asset?path=graphics/fx/beamfringe.png', true);
    const roughCore = textures.getTexture('/api/asset?path=graphics/fx/beam_rough2_core.png', true);
    const smoothCore = textures.getTexture('/api/asset?path=graphics/fx/beamcore.png', true);
    const projTrailTex = textures.getTexture('/api/asset?path=graphics/fx/projtrail.png', true);
    const projBodyTex = textures.getTexture('/api/asset?path=graphics/fx/projbody.png', true);
    const rocketFlameTex = textures.getTexture('/api/asset?path=graphics/fx/engineflame32.png');

    for (const p of engine.projectiles) {
      const pPos = Vector2.lerp(p.prevPos, p.pos, alpha);
      const pAngle = p.facingRad !== undefined ? p.facingRad : p.vel.heading();
      const fwd = Vector2.fromAngle(pAngle);

      // 4.1 诱饵热焰弹 (Decoy Flare)
      if (p.isFlare) {
        batcher.setBlendMode('ADDITIVE');
        const flicker = 0.75 + Math.random() * 0.5;
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, 42 * flicker, 42 * flicker, 0, 0, 0, 1.0, 0.7, 0.28, Math.min(1.0, 0.85 * flicker));
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, 14 * flicker, 14 * flicker, 0, 0, 0, 1.0, 0.98, 0.95, 0.95);
      }
      // 4.2 等离子束 / 脉冲类投射物 (BALLISTIC_AS_BEAM / TPC / Autopulse: 1:1 MovingRay.java & N.java & _if.java)
      else if (p.spawnType === 'BALLISTIC_AS_BEAM' || p.specId === 'tpc' || p.specId === 'autopulse') {
        const isRough = p.textureType === 'ROUGH' || p.specId === 'tpc';
        const len = p.projLength || (p.specId === 'tpc' ? 100 : 50);
        const wid = p.projWidth || (p.specId === 'tpc' ? 35 : 20);
        const [fr, fg, fb] = p.fringeColor || (p.specId === 'tpc' ? [255, 0, 0] : [0, 80, 255]);
        const [cr, cg, cb] = p.coreColor || [255, 255, 255];
        const [gr, gg, gb] = p.glowColor || (p.specId === 'tpc' ? [255, 60, 60] : [80, 140, 255]);

        const scrollSpeed = p.textureScrollSpeed || -256;
        const scroll = ((p.elapsedTime || engine.combatTime) * Math.abs(scrollSpeed)) / 128.0;
        const repeatCount = len / (isRough ? 640.0 : 128.0);

        batcher.setBlendMode('ADDITIVE');
        const fTex = isRough ? roughFringe : smoothFringe;
        batcher.drawSprite(fTex, pPos.x, pPos.y, len, wid, pAngle, 0, 0, fr / 255, fg / 255, fb / 255, 0.95, -scroll, 0, -scroll + repeatCount, 1);

        const cTex = isRough ? roughCore : smoothCore;
        const coreScroll = scroll * 1.35;
        const coreWid = wid * (p.coreWidthMult || 0.44);
        batcher.drawSprite(cTex, pPos.x, pPos.y, len * 0.95, coreWid, pAngle, 0, 0, cr / 255, cg / 255, cb / 255, 1.0, -coreScroll, 0, -coreScroll + repeatCount, 1);

        // 尖端紧凑高能冲击微光 (1:1 _if.java: 紧贴弹头，严禁百像素大圆球)
        const tipPos = pPos.clone().addScaled(fwd, len * 0.42);
        const tipGlowSize = Math.max(14, wid * 1.1);
        batcher.drawSprite(hitGlowTex, tipPos.x, tipPos.y, tipGlowSize, tipGlowSize, 0, 0, 0, gr / 255, gg / 255, gb / 255, 0.85);
        batcher.drawSprite(hitGlowTex, tipPos.x, tipPos.y, tipGlowSize * 0.45, tipGlowSize * 0.45, 0, 0, 0, 1.0, 1.0, 1.0, 0.95);
      }
      // 4.3 动能 / 高爆实弹 (BALLISTIC: 1:1 BallisticProjectile.java & N.java & _if.java)
      else if (p.projSpriteUrl && !p.isRocket) {
        const len = p.projLength || 40;
        const wid = p.projWidth || 8;
        const [fr, fg, fb] = p.fringeColor || p.color || [235, 255, 215];
        const [cr, cg, cb] = p.coreColor || [225, 255, 205];
        const tracerLen = len * 1.5;

        batcher.setBlendMode('ADDITIVE');
        const tracerCenter = pPos.clone().addScaled(fwd, -tracerLen * 0.5);
        batcher.drawSprite(projTrailTex, tracerCenter.x, tracerCenter.y, tracerLen, wid * 1.3, pAngle, 0, 0, fr / 255, fg / 255, fb / 255, 0.85);

        const coreTracerLen = tracerLen * 0.75;
        const coreTracerCenter = pPos.clone().addScaled(fwd, -coreTracerLen * 0.5);
        batcher.drawSprite(projBodyTex, coreTracerCenter.x, coreTracerCenter.y, coreTracerLen, wid * 0.55, pAngle, 0, 0, cr / 255, cg / 255, cb / 255, 0.95);

        const bulletTex = textures.getTexture(p.projSpriteUrl);
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(bulletTex, pPos.x, pPos.y, wid, len, pAngle + Math.PI / 2, 0, 0, 1.0, 1.0, 1.0, 1.0);

        // 弹头硬朗动能针状微光 (1:1 _if.java: 严禁百像素大圆球，还原原版高速金属弹头真实质感)
        batcher.setBlendMode('ADDITIVE');
        const tipPos = pPos.clone().addScaled(fwd, len * 0.4);
        const glintSize = Math.max(8, Math.min(20, wid * 1.6));
        batcher.drawSprite(hitGlowTex, tipPos.x, tipPos.y, glintSize, glintSize, 0, 0, 0, fr / 255, fg / 255, fb / 255, 0.8);
        batcher.drawSprite(hitGlowTex, tipPos.x, tipPos.y, glintSize * 0.45, glintSize * 0.45, 0, 0, 0, 1.0, 1.0, 1.0, 0.95);
      }
      // 4.4 导弹 / 火箭 (火箭推进喷口羽流 + 4 尖透镜星芒耀斑 + 导弹弹体)
      else if (p.isRocket) {
        const len = p.projLength || 32;
        const wid = p.projWidth || 14;
        const flameColor = p.engineFlameColor || [255, 140, 40];

        batcher.setBlendMode('ADDITIVE');
        const flameMult = p.specId === 'typhoon' ? 1.6 : 1.0;
        const flameLen = (18 + Math.random() * 8) * flameMult;
        const flameWid = wid * 0.75;
        const flamePos = pPos.clone().addScaled(fwd, -len * 0.5);
        batcher.drawSprite(rocketFlameTex, flamePos.x, flamePos.y, flameLen, flameWid, pAngle + Math.PI, -0.5, 0, flameColor[0] / 255, flameColor[1] / 255, flameColor[2] / 255, 0.9);
        batcher.drawSprite(rocketFlameTex, flamePos.x, flamePos.y, flameLen * 0.55, flameWid * 0.4, pAngle + Math.PI, -0.5, 0, 1.0, 1.0, 0.9, 0.95);

        const starSize = (p.specId === 'typhoon' ? 48 : 36) * flameMult;
        batcher.drawSprite(hitGlowTex, flamePos.x, flamePos.y, starSize, starSize, 0, 0, 0, flameColor[0] / 255, flameColor[1] / 255, flameColor[2] / 255, 0.95);
        const coreStarSize = starSize * 0.45;
        batcher.drawSprite(hitGlowTex, flamePos.x, flamePos.y, coreStarSize, coreStarSize, 0, 0, 0, 1.0, 1.0, 1.0, 1.0);

        const rocketTex = textures.getTexture(p.projSpriteUrl || '/api/asset?path=graphics/missiles/missile_harpoon.png');
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(rocketTex, pPos.x, pPos.y, wid, len, pAngle + Math.PI / 2, 0, 0, 1.0, 1.0, 1.0, 1.0);
      }
      // 4.5 其余标准投射物
      else {
        const [r, g, b] = p.color || [255, 200, 100];
        batcher.setBlendMode('ADDITIVE');
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, p.radius * 4, p.radius * 2, pAngle, 0, 0, r / 255, g / 255, b / 255, 0.9);
        batcher.drawSprite(hitGlowTex, pPos.x, pPos.y, p.radius * 2, p.radius * 1.0, pAngle, 0, 0, 1.0, 1.0, 1.0, 0.95);
      }
    }
  }
}
