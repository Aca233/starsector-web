import { visualRandom, visualNowMs } from '../RenderDeterminism';
import { Vector2 } from '../../math/Vector2';
import { CombatEngine } from '../../simulation/CombatEngine';
import { textureCache } from '../TextureCache';

export class FXRenderer {
  constructor() {}

  public drawContrails(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.contrails.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const c of engine.contrails) {
      const [cr, cg, cb] = c.color || [220, 180, 140];
      const tintedContrail = textureCache.getTintedImage('/game-assets/graphics/fx/contrail64b.png', cr, cg, cb);
      if (tintedContrail) {
        ctx.globalAlpha = c.alpha * 0.75;
        const halfS = c.size * 0.5;
        ctx.drawImage(tintedContrail, c.pos.x - halfS, c.pos.y - halfS, c.size, c.size);
      }
    }
    ctx.restore();
  }

  public drawProjectiles(ctx: CanvasRenderingContext2D, engine: CombatEngine, alpha: number) {
    for (const p of engine.projectiles) {
      const pos = Vector2.lerp(p.prevPos, p.pos, alpha);
      const angle = p.facingRad !== undefined ? p.facingRad : p.vel.heading();

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(angle);

      // 0. 诱饵热焰弹渲染 (Decoy Flare)
      if (p.isFlare) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const flicker = 0.75 + visualRandom('renderers/FXRenderer.ts#1') * 0.5;
        const tintedGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', 255, 180, 70);
        if (tintedGlow) {
          ctx.globalAlpha = Math.min(1.0, 0.85 * flicker);
          const gSize = 42 * flicker;
          ctx.drawImage(tintedGlow, -gSize / 2, -gSize / 2, gSize, gSize);
        }
        // 白炽高亮光球核心
        ctx.fillStyle = `rgba(255, 255, 245, ${Math.min(1.0, 0.95 * flicker)})`;
        ctx.beginPath();
        ctx.arc(0, 0, 5.0 * flicker, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 200, 100, 0.8)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 7.5 * flicker, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
        ctx.restore();
        continue;
      }

      // 1. 等离子束 / 脉冲类投射物 (BALLISTIC_AS_BEAM)
      if (p.spawnType === 'BALLISTIC_AS_BEAM' || p.specId === 'tpc' || p.specId === 'autopulse') {
        const len = p.projLength || (p.specId === 'tpc' ? 100 : 50);
        const wid = p.projWidth || (p.specId === 'tpc' ? 35 : 20);
        const [fr, fg, fb] = p.fringeColor || (p.specId === 'tpc' ? [255, 0, 0, 255] : [0, 80, 255, 255]);
        const [cr, cg, cb] = p.coreColor || [255, 255, 255, 220];
        const [gr, gg, gb] = p.glowColor || (p.specId === 'tpc' ? [255, 100, 100, 255] : [100, 100, 255, 225]);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        const tintedGlow = textureCache.getTintedImage('/game-assets/graphics/fx/glow64.png', gr, gg, gb);
        if (tintedGlow) {
          ctx.globalAlpha = 0.45;
          ctx.drawImage(tintedGlow, -len * 0.55, -wid * 0.9, len * 1.1, wid * 1.8);
        }

        const isRough = p.textureType === 'ROUGH' || p.specId === 'tpc';
        const fringeUrl = isRough ? '/game-assets/graphics/fx/beam_rough2_fringe.png' : '/game-assets/graphics/fx/beamfringe.png';
        const tintedFringe = textureCache.getTintedImage(fringeUrl, fr, fg, fb);
        if (tintedFringe) {
          ctx.globalAlpha = 0.92;
          ctx.drawImage(tintedFringe, -len * 0.5, -wid * 0.5, len, wid);
        } else {
          const fGrad = ctx.createRadialGradient(0, 0, wid * 0.1, 0, 0, len * 0.5);
          fGrad.addColorStop(0, `rgba(${fr}, ${fg}, ${fb}, 0.9)`);
          fGrad.addColorStop(0.6, `rgba(${fr}, ${fg}, ${fb}, 0.6)`);
          fGrad.addColorStop(1, `rgba(${fr}, ${fg}, ${fb}, 0)`);
          ctx.fillStyle = fGrad;
          ctx.beginPath();
          ctx.ellipse(0, 0, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        const coreUrl = isRough ? '/game-assets/graphics/fx/beam_rough2_core.png' : '/game-assets/graphics/fx/beamcore.png';
        const tintedCore = textureCache.getTintedImage(coreUrl, cr, cg, cb);
        if (tintedCore) {
          ctx.globalAlpha = 1.0;
          ctx.drawImage(tintedCore, -len * 0.42, -wid * 0.22, len * 0.85, wid * 0.44);
        } else {
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.95)`;
          ctx.beginPath();
          ctx.ellipse(0, 0, len * 0.38, wid * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        const tintedTip = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', cr, cg, cb);
        if (tintedTip) {
          ctx.globalAlpha = 0.95;
          const tipSize = wid * 1.1;
          ctx.drawImage(tintedTip, len * 0.45 - tipSize * 0.5, -tipSize * 0.5, tipSize, tipSize);
        }

        ctx.restore();
      }
      // 2. 动能/高爆实弹
      else if (p.projSpriteUrl && !p.isRocket) {
        const bulletImg = textureCache.getImage(p.projSpriteUrl);
        const len = p.projLength || 45;
        const wid = p.projWidth || 9;
        const [fr, fg, fb] = p.fringeColor || p.color;
        const [cr, cg, cb] = p.coreColor || [255, 255, 255, 255];

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const tracerLen = len * 1.8;

        // 1. 外层发光尾迹 (零 GC 开销，硬件直接光栅化)
        ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, 0.65)`;
        ctx.lineWidth = wid * 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-tracerLen, 0);
        ctx.stroke();

        // 2. 内层高能白热核心
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.95)`;
        ctx.lineWidth = Math.max(1.5, wid * 0.28);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-tracerLen * 0.65, 0);
        ctx.stroke();
        ctx.restore();

        if (bulletImg.complete && bulletImg.naturalWidth > 0) {
          ctx.save();
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(bulletImg, -wid / 2, -len / 2, wid, len);
          ctx.restore();
        } else {
          ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, len / 2, wid / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        const tipImg = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow_small.png', cr, cg, cb)
          || textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', cr, cg, cb);
        if (tipImg) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const tipSize = wid * 1.8;
          ctx.drawImage(tipImg, len / 2 - tipSize * 0.4, -tipSize / 2, tipSize, tipSize);
          ctx.restore();
        }
      }
      // 3. 导弹 / 火箭
      else if (p.isRocket) {
        const rocketImg = p.projSpriteUrl ? textureCache.getImage(p.projSpriteUrl) : null;
        const len = p.projLength || 21;
        const wid = p.projWidth || 10;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const flameColor = p.engineFlameColor || [255, 140, 40];
        const rocketFlame = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', flameColor[0], flameColor[1], flameColor[2]);
        if (rocketFlame) {
          const flameMult = p.specId === 'typhoon' ? 1.8 : 1.0;
          const flameLen = (18 + visualRandom('renderers/FXRenderer.ts#2') * 8) * flameMult;
          const flameWid = wid * 0.85;
          ctx.save();
          ctx.translate(-len / 2, 0);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(rocketFlame, -flameWid / 2, 0, flameWid, flameLen);
          ctx.restore();
        }
        const rocketGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', flameColor[0], flameColor[1], flameColor[2]);
        if (rocketGlow) {
          const glowSize = p.specId === 'typhoon' ? 22 : 12;
          ctx.drawImage(rocketGlow, -len / 2 - glowSize * 0.5, -glowSize * 0.5, glowSize, glowSize);
        }
        ctx.restore();

        if (rocketImg && rocketImg.complete && rocketImg.naturalWidth > 0) {
          ctx.save();
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(rocketImg, -wid / 2, -len / 2, wid, len);
          ctx.restore();
        } else {
          ctx.fillStyle = '#f97316';
          ctx.fillRect(-len / 2, -wid / 2, len, wid);
        }
      }
      // 4. 其余标准投射物
      else {
        const [r, g, b] = p.color;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.radius * 2.2, p.radius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  public drawBeams(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    for (const b of engine.beams) {
      const alpha = Math.min(1.0, b.duration / 0.1);
      const beamDir = b.endPos.clone().sub(b.startPos);
      const beamLen = beamDir.length();
      if (beamLen < 1) continue;
      const angle = beamDir.heading();

      const [fr, fg, fb] = b.fringeColor || b.color;
      const [cr, cg, cb] = b.coreColor || [255, 255, 255, 255];
      const [gr, gg, gb] = b.glowColor || [fr, fg, fb, 255];
      const width = b.width;
      const isRough = b.textureType === 'ROUGH' || b.specId === 'tachyonlance';

      ctx.save();
      ctx.translate(b.startPos.x, b.startPos.y);
      ctx.rotate(angle);

      // 1. 外层光冕
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${0.5 * alpha})`;
      ctx.lineWidth = width * 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(beamLen, 0);
      ctx.stroke();

      // 2. 纹理羽流层
      const fringeUrl = isRough ? '/game-assets/graphics/fx/beam_rough2_fringe.png' : '/game-assets/graphics/fx/beam_laser_fringe.png';
      const tintedFringe = textureCache.getTintedImage(fringeUrl, fr, fg, fb);
      if (tintedFringe) {
        ctx.globalAlpha = 0.9 * alpha;
        const pat = ctx.createPattern(tintedFringe, 'repeat');
        if (pat) {
          const scrollSpeed = b.textureScrollSpeed || 200;
          const offset = (b.elapsedTime * scrollSpeed) % tintedFringe.width;
          try {
            pat.setTransform(new DOMMatrix().translate(-offset, 0));
          } catch {}
          ctx.fillStyle = pat;
          ctx.fillRect(0, -width / 2, beamLen, width);
        }
      } else {
        ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, ${0.85 * alpha})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(beamLen, 0);
        ctx.stroke();
      }

      // 3. 核心亮纹
      const coreUrl = isRough ? '/game-assets/graphics/fx/beam_rough2_core.png' : '/game-assets/graphics/fx/beam_laser_core.png';
      const tintedCore = textureCache.getTintedImage(coreUrl, cr, cg, cb);
      const coreWidth = width * 0.4;
      if (tintedCore) {
        ctx.globalAlpha = 1.0 * alpha;
        const pat = ctx.createPattern(tintedCore, 'repeat');
        if (pat) {
          const scrollSpeed = (b.textureScrollSpeed || 200) * 1.35;
          const offset = (b.elapsedTime * scrollSpeed) % tintedCore.width;
          try {
            pat.setTransform(new DOMMatrix().translate(-offset, 0));
          } catch {}
          ctx.fillStyle = pat;
          ctx.fillRect(0, -coreWidth / 2, beamLen, coreWidth);
        }
      } else {
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.95 * alpha})`;
        ctx.lineWidth = coreWidth;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(beamLen, 0);
        ctx.stroke();
      }

      // 4. 枪口发射耀斑
      const tintedMuzzle = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', gr, gg, gb);
      if (tintedMuzzle) {
        ctx.globalAlpha = 0.95 * alpha;
        const mSize = width * 2.5;
        ctx.drawImage(tintedMuzzle, -mSize / 2, -mSize / 2, mSize, mSize);
      }

      // 5. 目标受击灼烧爆鸣耀斑
      const tintedImpactGlow = textureCache.getTintedImage('/game-assets/graphics/fx/glow64.png', gr, gg, gb);
      if (tintedImpactGlow) {
        ctx.globalAlpha = 0.65 * alpha;
        const impSize = width * 4.0;
        ctx.drawImage(tintedImpactGlow, beamLen - impSize / 2, -impSize / 2, impSize, impSize);
      }
      const tintedImpactFlare = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', cr, cg, cb);
      if (tintedImpactFlare) {
        ctx.globalAlpha = (0.8 + visualRandom('renderers/FXRenderer.ts#3') * 0.2) * alpha;
        const impSize = width * 2.8;
        ctx.drawImage(tintedImpactFlare, beamLen - impSize / 2, -impSize / 2, impSize, impSize);
      }

      ctx.restore();
      ctx.restore();
    }
  }

  public drawExplosions(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.explosions.length === 0) return;

    for (const exp of engine.explosions) {
      const progress = Math.max(0, Math.min(1.0, 1.0 - exp.life / exp.maxLife));
      const [r, g, b] = exp.color;

      ctx.save();
      ctx.translate(exp.pos.x, exp.pos.y);

      // 1. 初始爆心剧烈耀光
      if (progress < 0.35) {
        const flashAlpha = 1.0 - progress / 0.35;
        const flashSize = exp.maxRadius * 2.2;
        const tintedFlash = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', r, g, b);
        if (tintedFlash) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = flashAlpha;
          ctx.drawImage(tintedFlash, -flashSize / 2, -flashSize / 2, flashSize, flashSize);
          ctx.restore();
        }
        const whiteFlash = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', 255, 255, 255);
        if (whiteFlash) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = flashAlpha * 0.8;
          const wSize = flashSize * 0.55;
          ctx.drawImage(whiteFlash, -wSize / 2, -wSize / 2, wSize, wSize);
          ctx.restore();
        }
      }

      // 2. 冲击波扩散环
      if (exp.hasShockwaveRing) {
        const ringAlpha = (1.0 - exp.shockwaveRadius / exp.maxShockwaveRadius) * 0.85;
        if (ringAlpha > 0.01) {
          const tintedRing = textureCache.getTintedImage('/game-assets/graphics/fx/explosion_ring0.png', r, g, b);
          if (tintedRing) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = ringAlpha;
            const rSize = exp.shockwaveRadius * 2;
            ctx.drawImage(tintedRing, -rSize / 2, -rSize / 2, rSize, rSize);
            ctx.restore();
          }
        }
      }

      // 3. 官方 7 帧火球动画翻页书
      const frameIndex = Math.min(6, Math.max(0, exp.frame));
      const tintedFrame = textureCache.getTintedImage(`/game-assets/graphics/fx/explosion${frameIndex}.png`, r, g, b);
      if (tintedFrame) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1.0, 1.0 - progress * 0.85);
        ctx.rotate(exp.rotation);
        const expSize = exp.radius * 2.2;
        ctx.drawImage(tintedFrame, -expSize / 2, -expSize / 2, expSize, expSize);

        const tintedCore = textureCache.getTintedImage(`/game-assets/graphics/fx/explosion${frameIndex}.png`, 255, 235, 170);
        if (tintedCore && progress < 0.6) {
          ctx.globalAlpha = (1.0 - progress / 0.6) * 0.85;
          const coreSize = expSize * 0.6;
          ctx.drawImage(tintedCore, -coreSize / 2, -coreSize / 2, coreSize, coreSize);
        }
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${1.0 - progress})`;
        ctx.beginPath();
        ctx.arc(0, 0, exp.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  public drawEmpArcs(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.empArcs.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const arc of engine.empArcs) {
      const progress = Math.max(0, Math.min(1.0, arc.life / (arc.maxLife || 0.22)));
      const flicker = 0.72 + visualRandom('renderers/FXRenderer.ts#4') * 0.28;
      const alpha = progress * flicker;
      const glow = arc.glowColor || [0, 225, 255];
      const core = arc.coreColor || [255, 255, 255];
      const baseThick = arc.thickness || 2.0;

      // 1. 外层青蓝电浆晕光 (双层 lighter 混合，零高斯模糊开销)
      ctx.strokeStyle = `rgba(${glow[0]}, ${glow[1]}, ${glow[2]}, ${alpha * 0.75})`;
      ctx.lineWidth = baseThick * 3.2;
      ctx.beginPath();
      for (let i = 0; i < arc.segments.length; i++) {
        const pt = arc.segments[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      if (arc.branches && arc.branches.length > 0) {
        for (const branch of arc.branches) {
          ctx.lineWidth = branch.thickness * 2.6;
          ctx.beginPath();
          for (let b = 0; b < branch.segments.length; b++) {
            const bPt = branch.segments[b];
            if (b === 0) ctx.moveTo(bPt.x, bPt.y);
            else ctx.lineTo(bPt.x, bPt.y);
          }
          ctx.stroke();
        }
      }

      // 2. 核心高能白热闪电
      ctx.strokeStyle = `rgba(${core[0]}, ${core[1]}, ${core[2]}, ${alpha})`;
      ctx.lineWidth = Math.max(1.2, baseThick * 0.9);
      ctx.beginPath();
      for (let i = 0; i < arc.segments.length; i++) {
        const pt = arc.segments[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      if (arc.branches && arc.branches.length > 0) {
        for (const branch of arc.branches) {
          ctx.lineWidth = Math.max(0.8, branch.thickness * 0.85);
          ctx.beginPath();
          for (let b = 0; b < branch.segments.length; b++) {
            const bPt = branch.segments[b];
            if (b === 0) ctx.moveTo(bPt.x, bPt.y);
            else ctx.lineTo(bPt.x, bPt.y);
          }
          ctx.stroke();
        }
      }

      // 3. 终点击穿光球
      const flashRadius = Math.max(2, baseThick * 2.2 * progress);
      ctx.fillStyle = `rgba(${core[0]}, ${core[1]}, ${core[2]}, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(arc.endPos.x, arc.endPos.y, flashRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${glow[0]}, ${glow[1]}, ${glow[2]}, ${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(arc.startPos.x, arc.startPos.y, flashRadius * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  public drawParticles(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    for (const p of engine.particles) {
      const [r, g, b] = p.color;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public drawDebris(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.debris.length === 0) return;

    ctx.save();
    for (const d of engine.debris) {
      const alpha = Math.min(1.0, Math.max(0, d.life / (d.maxLife * 0.3)));
      if (alpha <= 0.01 || !d.points || d.points.length < 3) continue;

      ctx.save();
      ctx.translate(d.pos.x, d.pos.y);
      ctx.rotate(d.rotation);

      ctx.beginPath();
      ctx.moveTo(d.points[0].x, d.points[0].y);
      for (let j = 1; j < d.points.length; j++) {
        ctx.lineTo(d.points[j].x, d.points[j].y);
      }
      ctx.closePath();

      ctx.fillStyle = `rgba(${d.color[0]}, ${d.color[1]}, ${d.color[2]}, ${alpha * 0.9})`;
      ctx.fill();

      ctx.strokeStyle = `rgba(${Math.min(255, d.color[0] + 65)}, ${Math.min(255, d.color[1] + 65)}, ${Math.min(255, d.color[2] + 65)}, ${alpha * 0.65})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }

  public drawMuzzleFlashes(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.muzzleFlashes.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const flash of engine.muzzleFlashes) {
      const alpha = Math.max(0, flash.life / flash.maxLife);
      const [r, g, b] = flash.color;

      ctx.save();
      ctx.translate(flash.pos.x, flash.pos.y);
      ctx.rotate(flash.angleRad + Math.PI / 2);

      const tintedFlash = textureCache.getTintedImage('/game-assets/graphics/fx/muzzleflash32.1.png', r, g, b);
      if (tintedFlash) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(tintedFlash, -flash.size / 2, -flash.size / 2, flash.size, flash.size);
      } else {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(0, 0, flash.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  public drawMines(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.mines.length === 0) return;

    const mineBase = textureCache.getImage('/game-assets/graphics/missiles/heavy_mine2.png');
    const mineGlow = textureCache.getImage('/game-assets/graphics/missiles/heavy_mine2_glow.png');

    for (const m of engine.mines) {
      ctx.save();
      ctx.translate(m.pos.x, m.pos.y);
      ctx.rotate(m.rotation);

      if (mineBase.complete && mineBase.naturalWidth > 0) {
        ctx.drawImage(mineBase, -24, -24, 48, 48);
      } else {
        ctx.fillStyle = '#445566';
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (mineGlow.complete && mineGlow.naturalWidth > 0) {
        ctx.globalAlpha = m.isDetonating
          ? 0.7 + Math.sin(visualNowMs() * 0.03) * 0.3
          : 0.5 + Math.sin(visualNowMs() * 0.008) * 0.3;
        ctx.drawImage(mineGlow, -24, -24, 48, 48);
      }
      ctx.restore();

      if (m.isDetonating) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, m.triggerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 60, 60, ${0.4 + Math.sin(visualNowMs() * 0.04) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  public drawHulkFragments(ctx: CanvasRenderingContext2D, engine: CombatEngine, _alpha: number) {
    for (const frag of engine.hulkFragments) {
      const img = textureCache.getImage(frag.spriteUrl);
      if (!img.complete || img.naturalWidth <= 0) continue;

      ctx.save();
      ctx.translate(frag.pos.x, frag.pos.y);
      ctx.rotate(frag.facingRad);

      ctx.save();
      ctx.beginPath();
      if (frag.clipPart === 'FRONT') {
        ctx.rect(-frag.spriteWidth, -frag.spriteHeight * 2, frag.spriteWidth * 2, frag.spriteHeight * 2);
      } else if (frag.clipPart === 'REAR') {
        ctx.rect(-frag.spriteWidth, 0, frag.spriteWidth * 2, frag.spriteHeight * 2);
      } else {
        ctx.rect(-frag.spriteWidth, -frag.spriteHeight, frag.spriteWidth * 2, frag.spriteHeight * 2);
      }
      ctx.clip();

      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -frag.pivotX, -frag.pivotY, frag.spriteWidth, frag.spriteHeight);

      // 快速焦黑残骸着色 (source-atop 纯 GPU 硬件变暗，杜绝 ctx.filter 软件回退)
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(15, 12, 12, 0.78)';
      ctx.fillRect(-frag.pivotX, -frag.pivotY, frag.spriteWidth, frag.spriteHeight);
      ctx.restore();

      if (frag.clipPart !== 'FULL') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 100, 20, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-frag.collisionRadius * 0.8, 0);
        ctx.lineTo(frag.collisionRadius * 0.8, 0);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }
}
