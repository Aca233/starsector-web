import { visualRandom, visualNowMs } from '../RenderDeterminism';
import { Vector2 } from '../../math/Vector2';
import { CombatEngine } from '../../simulation/CombatEngine';
import { textureCache } from '../TextureCache';
import { getWeaponVisualProfile } from '../../visual/VisualProfiles';
import { beamVisualTime, selectRenderableBeams } from '../BeamVisuals';
import { computeCanvasStripSegments } from '../CanvasStripSampling';

export class FXRenderer {
  constructor() {}

  public drawContrails(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    const strips = Array.from(engine.contrailEngine.getStrips());
    if (strips.length === 0 && engine.contrails.length === 0) return;

    ctx.save();

    // Continuous source-authored missile trails live in ContrailEngine. Draw every
    // segment with its aged width/alpha so Canvas consumes the same ownership data
    // as the WebGL ribbon path instead of silently falling back to legacy particles.
    for (const strip of strips) {
      if (strip.points.length < 2) continue;
      const [cr, cg, cb, ca = 255] = strip.color;
      const tintedContrail = textureCache.getTintedImage('/game-assets/graphics/fx/contrail64b.png', cr, cg, cb);
      if (!tintedContrail) continue;
      ctx.globalCompositeOperation = strip.blendMode === 'GLOW' ? 'lighter' : 'source-over';

      for (let i = 1; i < strip.points.length; i++) {
        const p0 = strip.points[i - 1];
        const p1 = strip.points[i];
        const dx = p1.pos.x - p0.pos.x;
        const dy = p1.pos.y - p0.pos.y;
        const length = Math.hypot(dx, dy);
        if (length <= 0.001) continue;
        const width = Math.max(0.01, (p0.currentWidth + p1.currentWidth) * 0.5);
        const segmentAlpha = Math.max(0, Math.min(1, (p0.alpha + p1.alpha) * 0.5 * (ca / 255)));
        if (segmentAlpha <= 0) continue;

        ctx.save();
        ctx.translate(p0.pos.x, p0.pos.y);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.globalAlpha = segmentAlpha;
        ctx.drawImage(tintedContrail, 0, -width * 0.5, length, width);
        ctx.restore();
      }
    }

    // Keep legacy point contrails for older/non-missile effects that still own them.
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

      // 1. 等离子束 / 脉冲类投射物 (BALLISTIC_AS_BEAM)。visualSpawnType 只控制成像，不改变碰撞语义。
      const visualSpawnType = p.visualSpawnType ?? p.spawnType;
      if (visualSpawnType === 'BALLISTIC_AS_BEAM' || p.specId === 'tpc' || p.specId === 'autopulse') {
        const len = p.projLength || (p.specId === 'tpc' ? 100 : 50);
        const wid = p.projWidth || (p.specId === 'tpc' ? 35 : 20);
        const [fr, fg, fb, fa = 255] = p.fringeColor || (p.specId === 'tpc' ? [255, 0, 0, 255] : [0, 0, 255, 255]);
        const [cr, cg, cb, ca = 255] = p.coreColor || [255, 255, 255, 200];

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        const isRough = p.textureType === 'ROUGH' || p.specId === 'tpc';
        const fringeUrl = isRough ? '/game-assets/graphics/fx/beam_rough2_fringe.png' : '/game-assets/graphics/fx/beamfringe.png';
        const tintedFringe = textureCache.getTintedImage(fringeUrl, fr, fg, fb);
        if (tintedFringe) {
          const sourceGeometry = p.pixelsPerTexel !== undefined;
          ctx.globalAlpha = (sourceGeometry ? 1.0 : 0.92) * (fa / 255);
          if (sourceGeometry) {
            const scroll = ((p.elapsedTime ?? engine.combatTime) * (p.textureScrollSpeed ?? 0)) / tintedFringe.width;
            for (const segment of computeCanvasStripSegments(tintedFringe.width, len, p.pixelsPerTexel!, -scroll)) {
              ctx.drawImage(
                tintedFringe,
                segment.sourceX, 0, segment.sourceWidth, tintedFringe.height,
                -len * 0.5 + segment.destX, -wid * 0.5, segment.destWidth, wid
              );
            }
          } else {
            ctx.drawImage(tintedFringe, -len * 0.5, -wid * 0.5, len, wid);
          }
        } else {
          const fGrad = ctx.createRadialGradient(0, 0, wid * 0.1, 0, 0, len * 0.5);
          const fringeAlpha = fa / 255;
          fGrad.addColorStop(0, `rgba(${fr}, ${fg}, ${fb}, ${0.9 * fringeAlpha})`);
          fGrad.addColorStop(0.6, `rgba(${fr}, ${fg}, ${fb}, ${0.6 * fringeAlpha})`);
          fGrad.addColorStop(1, `rgba(${fr}, ${fg}, ${fb}, 0)`);
          ctx.fillStyle = fGrad;
          ctx.beginPath();
          ctx.ellipse(0, 0, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        const coreUrl = isRough ? '/game-assets/graphics/fx/beam_rough2_core.png' : '/game-assets/graphics/fx/beamcore.png';
        const tintedCore = textureCache.getTintedImage(coreUrl, cr, cg, cb);
        if (tintedCore) {
          ctx.globalAlpha = ca / 255;
          if (p.pixelsPerTexel !== undefined) {
            const scroll = ((p.elapsedTime ?? engine.combatTime) * (p.textureScrollSpeed ?? 0)) / tintedCore.width;
            for (const segment of computeCanvasStripSegments(tintedCore.width, len, p.pixelsPerTexel, -scroll)) {
              ctx.drawImage(
                tintedCore,
                segment.sourceX, 0, segment.sourceWidth, tintedCore.height,
                -len * 0.5 + segment.destX, -wid * 0.5, segment.destWidth, wid
              );
            }
          } else {
            ctx.drawImage(tintedCore, -len * 0.5, -wid * 0.5, len, wid);
          }
        } else {
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.95 * (ca / 255)})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Source .proj glowRadius/glowColor define an in-flight halo, independent
        // from hitGlowRadius (impact-only). Heavy Blaster relies on this path.
        if ((p.glowRadius ?? 0) > 0 && p.glowColor) {
          const [gr, gg, gb, ga = 255] = p.glowColor;
          const tintedGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', gr, gg, gb);
          if (tintedGlow) {
            const glowDiameter = p.glowRadius! * 2;
            ctx.globalAlpha = ga / 255;
            ctx.drawImage(tintedGlow, -glowDiameter * 0.5, -glowDiameter * 0.5, glowDiameter, glowDiameter);
          }
        }

        ctx.restore();
      }
      // 2. 动能/高爆实弹
      else if (p.projSpriteUrl && !p.isRocket) {
        const bulletImg = textureCache.getImage(p.projSpriteUrl);
        const len = p.projLength || 45;
        const wid = p.projWidth || 9;
        const [fr, fg, fb, fa = 255] = p.fringeColor || [...p.color, 255];
        const [cr, cg, cb, ca = 255] = p.coreColor || [255, 255, 255, 255];

        const sourceGeometry = p.pixelsPerTexel !== undefined;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (sourceGeometry) {
          const scrollTime = p.elapsedTime ?? engine.combatTime;
          const scrollSpeed = p.textureScrollSpeed ?? 0;
          const tintedTrail = textureCache.getTintedImage('/game-assets/graphics/fx/projtrail.png', fr, fg, fb);
          if (tintedTrail) {
            ctx.globalAlpha = fa / 255;
            const scroll = (scrollTime * scrollSpeed) / tintedTrail.width;
            for (const segment of computeCanvasStripSegments(tintedTrail.width, len, p.pixelsPerTexel!, -scroll)) {
              ctx.drawImage(tintedTrail, segment.sourceX, 0, segment.sourceWidth, tintedTrail.height, -len * 0.5 + segment.destX, -wid * 0.5, segment.destWidth, wid);
            }
          }
          const tintedBody = textureCache.getTintedImage('/game-assets/graphics/fx/projbody.png', cr, cg, cb);
          if (tintedBody) {
            ctx.globalAlpha = ca / 255;
            const scroll = (scrollTime * scrollSpeed) / tintedBody.width;
            for (const segment of computeCanvasStripSegments(tintedBody.width, len, p.pixelsPerTexel!, -scroll)) {
              ctx.drawImage(tintedBody, segment.sourceX, 0, segment.sourceWidth, tintedBody.height, -len * 0.5 + segment.destX, -wid * 0.5, segment.destWidth, wid);
            }
          }
        } else {
          const tracerLen = len * 1.8;
          ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, ${0.65 * (fa / 255)})`;
          ctx.lineWidth = wid * 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-tracerLen, 0);
          ctx.stroke();

          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.95 * (ca / 255)})`;
          ctx.lineWidth = Math.max(1.5, wid * 0.28);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-tracerLen * 0.65, 0);
          ctx.stroke();
        }
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

        if (!sourceGeometry) {
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
      }
      // 3. 导弹 / 火箭
      else if (p.isRocket) {
        const rocketImg = p.projSpriteUrl ? textureCache.getImage(p.projSpriteUrl) : null;
        const len = p.projLength || 21;
        const wid = p.projWidth || 10;
        const sourceEngine = p.missileEngineVisualSpec;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const flameRgba = sourceEngine?.color ?? [...(p.engineFlameColor || [255, 140, 40]), 255] as [number, number, number, number];
        const flameColor: [number, number, number] = [flameRgba[0], flameRgba[1], flameRgba[2]];
        const rocketFlame = textureCache.getTintedImage('/game-assets/graphics/fx/engineflame32.png', flameColor[0], flameColor[1], flameColor[2]);
        if (rocketFlame) {
          const flameLen = sourceEngine?.length ?? (18 + visualRandom('renderers/FXRenderer.ts#2') * 8);
          const flameWid = sourceEngine?.width ?? (wid * 0.85);
          ctx.globalAlpha = flameRgba[3] / 255;
          ctx.save();
          ctx.translate(sourceEngine?.nozzleOffset ?? -len / 2, 0);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(rocketFlame, -flameWid / 2, 0, flameWid, flameLen);
          ctx.restore();
        }
        const rocketGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', flameColor[0], flameColor[1], flameColor[2]);
        if (rocketGlow) {
          const glowSize = sourceEngine?.glowSizeMult !== undefined
            ? (sourceEngine.width * sourceEngine.glowSizeMult * 2)
            : 12;
          const glowX = sourceEngine?.nozzleOffset ?? -len / 2;
          ctx.globalAlpha = flameRgba[3] / 255;
          ctx.drawImage(rocketGlow, glowX - glowSize * 0.5, -glowSize * 0.5, glowSize, glowSize);
          if (sourceEngine?.glowAlternateColor) {
            const alt = sourceEngine.glowAlternateColor;
            const altGlow = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', alt[0], alt[1], alt[2]);
            if (altGlow) {
              const altSize = glowSize * 0.45;
              ctx.globalAlpha = alt[3] / 255;
              ctx.drawImage(altGlow, glowX - altSize * 0.5, -altSize * 0.5, altSize, altSize);
            }
          }
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
    for (const b of selectRenderableBeams(engine.beams)) {
      const visual = getWeaponVisualProfile(b.specId, 'BEAM', false, true);
      const alpha = Math.min(1.0, b.duration / Math.max(visual.fadeSeconds, 0.01));
      const beamDir = b.endPos.clone().sub(b.startPos);
      const beamLen = beamDir.length();
      if (beamLen < 1) continue;
      const angle = beamDir.heading();

      const [fr, fg, fb, fa = 255] = b.fringeColor || [...b.color, 255];
      const [cr, cg, cb, ca = 255] = b.coreColor || [255, 255, 255, 255];
      const [gr, gg, gb, ga = 255] = b.glowColor || [fr, fg, fb, 255];
      const width = b.width * visual.trailScale;
      const isRough = b.textureType === 'ROUGH' || b.specId === 'tachyonlance';
      const sourceGeometry = b.pixelsPerTexel !== undefined;
      const phaseTime = beamVisualTime(b, engine.combatTime);

      ctx.save();
      ctx.translate(b.startPos.x, b.startPos.y);
      ctx.rotate(angle);

      // 1. 外层光冕
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${0.5 * alpha * (ga / 255)})`;
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
        ctx.globalAlpha = (sourceGeometry ? 1.0 : 0.9) * alpha * (fa / 255);
        if (sourceGeometry) {
          const scroll = (phaseTime * (b.textureScrollSpeed ?? 0)) / tintedFringe.width;
          for (const segment of computeCanvasStripSegments(tintedFringe.width, beamLen, b.pixelsPerTexel!, -scroll)) {
            ctx.drawImage(
              tintedFringe,
              segment.sourceX, 0, segment.sourceWidth, tintedFringe.height,
              segment.destX, -width / 2, segment.destWidth, width
            );
          }
        } else {
          const pat = ctx.createPattern(tintedFringe, 'repeat');
          if (pat) {
            const scrollSpeed = b.textureScrollSpeed ?? 200;
            const offset = (phaseTime * scrollSpeed) % tintedFringe.width;
            try {
              pat.setTransform(new DOMMatrix().translate(-offset, 0));
            } catch {}
            ctx.fillStyle = pat;
            ctx.fillRect(0, -width / 2, beamLen, width);
          }
        }
      } else {
        ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, ${0.85 * alpha * (fa / 255)})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(beamLen, 0);
        ctx.stroke();
      }

      // 3. 核心亮纹
      const coreUrl = isRough ? '/game-assets/graphics/fx/beam_rough2_core.png' : '/game-assets/graphics/fx/beam_laser_core.png';
      const tintedCore = textureCache.getTintedImage(coreUrl, cr, cg, cb);
      const coreWidth = sourceGeometry ? width : width * 0.4;
      if (tintedCore) {
        ctx.globalAlpha = 1.0 * alpha * (ca / 255);
        if (sourceGeometry) {
          const scroll = (phaseTime * (b.textureScrollSpeed ?? 0)) / tintedCore.width;
          for (const segment of computeCanvasStripSegments(tintedCore.width, beamLen, b.pixelsPerTexel!, -scroll)) {
            ctx.drawImage(
              tintedCore,
              segment.sourceX, 0, segment.sourceWidth, tintedCore.height,
              segment.destX, -coreWidth / 2, segment.destWidth, coreWidth
            );
          }
        } else {
          const pat = ctx.createPattern(tintedCore, 'repeat');
          if (pat) {
            const scrollSpeed = (b.textureScrollSpeed ?? 200) * 1.35;
            const offset = (phaseTime * scrollSpeed) % tintedCore.width;
            try {
              pat.setTransform(new DOMMatrix().translate(-offset, 0));
            } catch {}
            ctx.fillStyle = pat;
            ctx.fillRect(0, -coreWidth / 2, beamLen, coreWidth);
          }
        }
      } else {
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.95 * alpha * (ca / 255)})`;
        ctx.lineWidth = coreWidth;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(beamLen, 0);
        ctx.stroke();
      }

      // 4. 枪口发射耀斑
      const tintedMuzzle = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', gr, gg, gb);
      if (tintedMuzzle) {
        ctx.globalAlpha = 0.95 * alpha * (ga / 255);
        const mSize = width * 2.5;
        ctx.drawImage(tintedMuzzle, -mSize / 2, -mSize / 2, mSize, mSize);
      }

      // 5. 目标受击灼烧爆鸣耀斑
      if (b.isHitting) {
        const brighten = b.hitGlowBrightenDuration && b.hitGlowBrightenDuration > 0
          ? Math.min(1, b.elapsedTime / b.hitGlowBrightenDuration)
          : 1;
        const tintedImpactGlow = textureCache.getTintedImage('/game-assets/graphics/fx/glow64.png', gr, gg, gb);
        if (tintedImpactGlow) {
          ctx.globalAlpha = 0.65 * alpha * brighten * (ga / 255);
          const impSize = width * 4.0;
          ctx.drawImage(tintedImpactGlow, beamLen - impSize / 2, -impSize / 2, impSize, impSize);
        }
        const tintedImpactFlare = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', cr, cg, cb);
        if (tintedImpactFlare) {
          ctx.globalAlpha = (0.8 + visualRandom('renderers/FXRenderer.ts#3') * 0.2) * alpha * brighten * (ca / 255);
          const impSize = width * 2.8;
          ctx.drawImage(tintedImpactFlare, beamLen - impSize / 2, -impSize / 2, impSize, impSize);
        }
      }

      ctx.restore();
      ctx.restore();
    }
  }

  public drawHitGlows(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (engine.hitGlows.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const glow of engine.hitGlows) {
      const [r, g, b] = glow.color;
      const alpha = Math.max(0, glow.life / glow.maxLife);
      const image = textureCache.getTintedImage('/game-assets/graphics/fx/hit_glow.png', r, g, b);
      if (!image) continue;
      const diameter = glow.radius * 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, glow.pos.x - glow.radius, glow.pos.y - glow.radius, diameter, diameter);
    }
    ctx.restore();
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
        const flashSize = exp.maxRadius * (exp.sourceAuthored ? 2 : 2.2);
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
        const expSize = exp.radius * (exp.sourceAuthored ? 2 : 2.2);
        ctx.drawImage(tintedFrame, -expSize / 2, -expSize / 2, expSize, expSize);

        const tintedCore = textureCache.getTintedImage(
          `/game-assets/graphics/fx/explosion${frameIndex}.png`,
          255,
          exp.sourceAuthored ? 255 : 235,
          exp.sourceAuthored ? 255 : 170
        );
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
    if (engine.muzzleFlashes.length === 0 && engine.muzzleParticles.length === 0) return;

    ctx.save();

    for (const particle of engine.muzzleParticles) {
      const alpha = Math.max(0, particle.life / particle.maxLife) * (particle.color[3] / 255);
      const [r, g, b] = particle.color;
      ctx.globalCompositeOperation = particle.blendMode === 'NORMAL' ? 'source-over' : 'lighter';
      const tintedParticle = textureCache.getTintedImage('/game-assets/graphics/fx/particlealpha32sq.png', r, g, b);
      if (tintedParticle) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(tintedParticle, particle.pos.x - particle.size / 2, particle.pos.y - particle.size / 2, particle.size, particle.size);
      }
    }

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
