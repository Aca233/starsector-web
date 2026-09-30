import { ShipSurfaceFeedbackRenderer } from '../ShipSurfaceFeedbackRenderer';
import { renderArkAircraftCharge } from '../ArkAircraftFXRenderer';
import { ArkSystemMaterialRenderer } from '../ArkSystemMaterialRenderer';
import { renderArkWeaponCharge } from '../ArkWeaponFXRenderer';
import { ArkDamageRenderer } from '../ArkDamageRenderer';
import { arkOwner } from '../../../content/AdunArkIds';
import { renderArkBody } from '../AdunArkRenderer';
import { weaponArtLayout } from '../../../content/WeaponInstallation';
import { renderWeaponInstallations } from '../WeaponInstallationRenderer';
import { WEAPON_SIZE_FALLBACK_PIXELS } from '../../../content/WeaponSizes';
import { renderHyperionSystems } from '../HyperionSystemRenderer';
import { renderGravity } from '../GravityRenderer';
import { renderGlorianaOrderReceiver, renderGlorianaCharge, renderGlorianaRecoil, renderGlorianaTorpedo } from '../GlorianaWeaponRenderer';
import { createRenderCanvas, type RenderCanvas } from '../../RenderSurface';
import { presentationPulseOffset } from '../../ShipSystemPresentation';
import { hullOverlayInViewport } from '../HullOverlayVisibility';
import { activeSystemVisuals, renderSystemHull, weaponSystemGlows, systemTeleportCopies, systemTeleportBodyAlpha } from '../ShipSystemRenderer';
import { renderPulseOffset, renderWeaponAngle } from '../../ShipRenderQueries';
import { visualRandom } from '../../RenderDeterminism';
import type { CombatRenderView } from '../../CombatRenderView';
import { WebGLPassContext } from '../WebGLPassContext';
import type { ShipRenderState as Ship } from '../../../render/ShipRenderState';
import type { RenderHulk as HulkFragment } from '../../../render/ShipRenderState';
import { getHulkAppearance } from '../../../visual/HulkVisuals';
import { renderHulkHullCanvas } from '../../HulkSpriteMask';
import { Vector2 } from '../../../math/Vector2';
import { ShipVentingRenderer } from '../ShipVentingRenderer';
import { ShipOverloadRenderer } from '../ShipOverloadRenderer';
import { getShipVisualProfile, getWeaponVisualProfile } from '../../../visual/VisualProfiles';
import { renderShipEngines } from '../ShipEngineRenderer';
import type { VisualRandom } from '../../../runtime/VisualRandom';
import {
  getDamageGlowRevision,
  hasHotDamageGlow,
  renderShipDamageOverlayCanvas
} from '../../ShipDamageVisuals';

/**
 * 战舰与挂点渲染通道 (WebGLShipPass)
 * 职责:
 * 1. 相位残影 (Phase Ghosts)
 * 2. 舰船主体、装甲受损痕迹与战损焦黑弹坑 (Ship Base & Scorch Marks)
 * 3. 真实物理平滑推进羽流、过载/相位电弧与失速故障黑烟 (Engine Flames)
 * 4. 武器炮塔/内置挂点底座、后坐行程与充能微震 (Turrets & Hardpoints)
 * 5. 空间战损残骸碎片 (Hulk Fragments)
 * 6. 舰载机中队 (Fighters, Bombers & Dogfights)
 */
export class WebGLShipPass {
  public culledDamageOverlays = 0;
  private ventingRenderers = new Map<Ship, ShipVentingRenderer>();
  private overloadRenderers = new Map<Ship, ShipOverloadRenderer>();
  private hulkHullStates = new WeakMap<HulkFragment, { canvas: RenderCanvas; ready: boolean; instanceId: number }>();
  private damageOverlayStates = new WeakMap<Ship | HulkFragment, {
    instanceId: number;
    baseCanvas: RenderCanvas;
    glowCanvas: RenderCanvas;
    baseRevision: number;
    glowRevision: string;
  }>();
  private damageOverlaySerial = 0;
  private arkDamageRenderer = new ArkDamageRenderer();
  private arkSystemMaterial?: ArkSystemMaterialRenderer;
  private surfaceFeedbackRenderer?: ShipSurfaceFeedbackRenderer;
  public get arkMaterialDrawCalls(): number { return this.arkSystemMaterial?.drawCalls ?? 0; }
  public disposeArkMaterial(): void {
    this.surfaceFeedbackRenderer?.dispose(); this.surfaceFeedbackRenderer = undefined;
    this.arkSystemMaterial?.dispose(); this.arkSystemMaterial = undefined;
  }

  public updateVisual(engine: CombatRenderView, dt: number, random: VisualRandom): void {
    const ships = new Set(engine.ships);
    for (const ship of this.ventingRenderers.keys()) if (!ships.has(ship)) this.ventingRenderers.delete(ship);
    for (const ship of this.overloadRenderers.keys()) if (!ships.has(ship) || ship.isDead) this.overloadRenderers.delete(ship);
    for (const ship of ships) {
      this.ventRendererFor(ship).update(dt, ship, random);
      if (ship.isDead) continue;
      let overload = this.overloadRenderers.get(ship);
      if (!overload) { overload = new ShipOverloadRenderer(ship); this.overloadRenderers.set(ship, overload); }
      overload.update(dt, ship, random);
    }
  }

  private ventRendererFor(ship: Ship): ShipVentingRenderer {
    let renderer = this.ventingRenderers.get(ship);
    if (!renderer) {
      renderer = new ShipVentingRenderer();
      this.ventingRenderers.set(ship, renderer);
    }
    return renderer;
  }

  public resetVisualState(): void {
    this.ventingRenderers.clear();
    this.overloadRenderers.clear();
    this.damageOverlayStates = new WeakMap();
    this.hulkHullStates = new WeakMap();
    this.arkDamageRenderer.reset();
    this.disposeArkMaterial();
  }

  public render(engine: CombatRenderView, ctx: WebGLPassContext, nowSec: number, renderUnderHullEffects?: (ship: Ship) => void) {
    this.culledDamageOverlays = 0;
    if (this.arkSystemMaterial) this.arkSystemMaterial.drawCalls = 0;
    const { batcher, textures, hitGlowTex, alpha } = ctx;
    const activeDamageTextures = new Set<string>();
    // Damage state advances before this synchronous pass. Reuse only its hot/cold
    // decision here, never across RAFs: heat/flash can change without a decal revision.
    // Clipped wreck pieces must not share the whole source hull's decision.
    const hotDamageOwners = new Set<Ship | HulkFragment>();
    const damageId = (ship: Ship, hulk?: HulkFragment) => hulk?.visualBounds ? ship.id + ':piece-' + hulk.id : ship.id;
    const collectDamage = (ship: Ship, hulk?: HulkFragment) => {
      const id = damageId(ship, hulk);
      if (ship.scorchMarks.length > 0 && (hulk || !arkOwner(ship.spec.sourceHullId ?? ship.spec.id))) {
        activeDamageTextures.add('ship-damage-base:' + id);
        if (hasHotDamageGlow(ship, hulk?.visualBounds ?? undefined)) {
          activeDamageTextures.add('ship-damage-glow:' + id);
          hotDamageOwners.add(hulk?.visualBounds ? hulk : ship);
        }
      }
      if (hulk?.visualBounds) activeDamageTextures.add('hulk-hull:' + hulk.id);
    };
    for (const ship of engine.ships) if (!ship.isDead) collectDamage(ship);
    for (const hulk of engine.hulkFragments) collectDamage(hulk.sourceShip, hulk);
    for (const [ship, renderer] of this.overloadRenderers) if (ship.flux.isOverloaded) activeDamageTextures.add(renderer.textureId);
    this.arkDamageRenderer.retainTextures(engine.ships, engine.combatTime, activeDamageTextures);
    textures.retainCanvasTextures(activeDamageTextures);

    // 2. 战舰与挂点渲染函数
    const renderShip = (ship: Ship, shipPos: Vector2, shipFacing: number, hulk?: HulkFragment, copyAlpha?: number) => {
      if (ship.isDead && !hulk) return;
      const shipVisual = getShipVisualProfile(ship.spec);
      const systemVisuals = hulk ? [] : activeSystemVisuals(ship);

      const teleportAlpha = copyAlpha ?? (hulk ? 1 : systemTeleportBodyAlpha(ship));
      if (!hulk) renderShipEngines(ship, shipPos, shipFacing, ctx, nowSec, teleportAlpha, engine.combatTime);

      // 2.2 舰船主体贴图
      batcher.setBlendMode('NORMAL');
      let shipTex = textures.getTexture(ship.spec.spriteUrl);
      if (hulk?.visualBounds) {
        let state = this.hulkHullStates.get(hulk);
        if (!state) {
          state = { canvas: createRenderCanvas(), ready: false, instanceId: ++this.damageOverlaySerial };
          this.hulkHullStates.set(hulk, state);
        }
        if (!state.ready) state.ready = renderHulkHullCanvas(state.canvas, hulk);
        if (!state.ready) return;
        shipTex = textures.getCanvasTexture('hulk-hull:' + hulk.id, state.canvas, state.instanceId);
      }
      const decalId = damageId(ship, hulk);
      const damageOwner = hulk?.visualBounds ? hulk : ship;
      const pivotNormX = (ship.spec.pivotX / ship.spec.spriteWidth) - 0.5;
      const height = ship.spec.spriteHeight;
      const pivotNormY = ship.spec.pivotY / height - 0.5;
      const hulkAppearance = hulk ? getHulkAppearance(hulk) : null;
      const tint = hulkAppearance?.tint ?? 1;
      const shipAlpha = hulkAppearance?.alpha ?? ship.phaseVisualAlpha * teleportAlpha;
      const belowSlots = new Set(ship.spec.weaponSlots.filter(slot => slot.renderLayer === 'BELOW_HULL').map(slot => slot.slotId));
      const renderWeapons = (depth: 'ABOVE_HULL' | 'BELOW_HULL') => {
        renderWeaponInstallations(ctx, ship.spec.weaponSlots, shipPos.x, shipPos.y, shipFacing,
          [tint,tint,tint], shipAlpha, hulk?.mountSlotIds, 'base', depth);
        // 2.3 旋转武器炮塔与挂点充能光晕 (Turrets & Hardpoints)
        for (const mount of ship.weapons) {
          if ((belowSlots.has(mount.slotId) ? 'BELOW_HULL' : 'ABOVE_HULL') !== depth) continue;
          const weaponTint = tint * (!hulk && ship.surfaceFeedback?.mode === 'SEALED' ? 1 - .42 * ship.surfaceFeedback.level : 1);
          if (mount.mountType === 'HIDDEN') continue;
          // Ownership is decided once against the collision polygon when it splits.
          if (hulk && !hulk.mountSlotIds.includes(mount.slotId)) continue;
          const isHardpoint = mount.mountType === 'HARDPOINT';
          const mountOffset = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(shipFacing);
          const mountX = shipPos.x + mountOffset.x;
          const mountY = shipPos.y + mountOffset.y;
          const predictedAngle = !hulk && copyAlpha === undefined ? renderWeaponAngle(mount, shipFacing) : undefined;
          const mountFacing = isHardpoint ? (mount.baseAngleDeg * Math.PI) / 180 + shipFacing : predictedAngle ?? mount.currentAngleRad + (hulk || copyAlpha !== undefined ? shipFacing - ship.facingRad : 0);
          const weaponVisual = getWeaponVisualProfile(mount.spec.id, mount.spec.spawnType, mount.spec.isRocket, mount.spec.isBeam);

          // Some built-in hardpoints (notably Onslaught's TPC) deliberately specify hardpointSprite:"".
          // Their fixed gun body is already baked into the hull art; falling back to turretSprite here
          // incorrectly draws a second weapon body over the ship.
          const usesHullHardpointSprite = isHardpoint && mount.spec.hardpointUsesHullSprite === true;
          const baseImgUrl = isHardpoint
            ? (usesHullHardpointSprite ? undefined : (mount.spec.hardpointSpriteUrl || mount.spec.turretSpriteUrl))
            : mount.spec.turretSpriteUrl;
          const gunImgUrl = isHardpoint
            ? (usesHullHardpointSprite ? undefined : (mount.spec.hardpointGunSpriteUrl || mount.spec.turretGunSpriteUrl))
            : mount.spec.turretGunSpriteUrl;
          const glowImgUrl = isHardpoint ? (mount.spec.hardpointGlowSpriteUrl || mount.spec.glowSpriteUrl) : mount.spec.glowSpriteUrl;

          const defaultSize = WEAPON_SIZE_FALLBACK_PIXELS[mount.spec.mountSize];
          let baseTex: WebGLTexture | null = null;
          let baseW = defaultSize;
          let baseH = defaultSize;
          if (baseImgUrl) {
            const info = textures.getTextureInfo(baseImgUrl);
            baseTex = info.texture;
            if (info.width > 0 && info.height > 0) {
              baseW = info.width;
              baseH = info.height;
            }
          }

          let gunTex: WebGLTexture | null = null;
          let gunW = baseW;
          let gunH = baseH;
          if (gunImgUrl) {
            const info = textures.getTextureInfo(gunImgUrl);
            gunTex = info.texture;
            if (info.width > 0 && info.height > 0) {
              gunW = info.width;
              gunH = info.height;
            }
          }

          const layout = weaponArtLayout(mount.spec, baseW, baseH);
          const gunLayout = weaponArtLayout(mount.spec, gunW, gunH);
          baseW = layout.width; baseH = layout.height;
          gunW = gunLayout.width; gunH = gunLayout.height;
          const pivotX = layout.pivotX-.5, pivotY = layout.pivotY-.5;
          const recoilDist = mount.recoil * (mount.spec.visualRecoil || 0);
          const recoilOff = new Vector2(-recoilDist, 0).rotate(mountFacing);
          const alphaVal = (!hulk && mount.isDisabled ? 0.45 : 1.0) * shipAlpha;

          batcher.setBlendMode('NORMAL');

          const drawGun = () => {
            if (gunTex) {
              batcher.drawSprite(
                gunTex,
                mountX + recoilOff.x,
                mountY + recoilOff.y,
                gunW,
                gunH,
                mountFacing + Math.PI / 2,
                pivotX,
                pivotY,
                weaponTint,
                weaponTint,
                weaponTint,
                alphaVal
              );
            }
          };

          const drawBase = () => {
            if (baseTex) {
              if (renderGlorianaTorpedo(ctx, mount, mountX, mountY, mountFacing, weaponTint, alphaVal)) return;
              if (!hulk && renderGlorianaRecoil(ctx, mount, baseTex, mountX, mountY, mountFacing, weaponTint, alphaVal)) return;
              batcher.drawSprite(
                baseTex,
                mountX,
                mountY,
                baseW,
                baseH,
                mountFacing + Math.PI / 2,
                pivotX,
                pivotY,
                weaponTint,
                weaponTint,
                weaponTint,
                alphaVal
              );
            }
          };

          if (mount.spec.renderBarrelBelow) {
            drawGun();
            drawBase();
          } else {
            drawBase();
            drawGun();
          }

          // Skill glow is independent of firing glowAlpha: an idle gun still shows
          // Ammo Feed/HEF. Prefer its native mask; otherwise tint the actual mount,
          // never invent a large corona on weapons with no source glow sprite.
          if (!hulk && !mount.isDisabled) for (const glow of weaponSystemGlows(systemVisuals, mount.spec.weaponType)) {
            const [r, g, b, a] = glow.color;
            const glowAlpha = a / 255 * glow.level * shipAlpha;
            batcher.setBlendMode('ADDITIVE');
            if (glowImgUrl) {
              const info = textures.getTextureInfo(glowImgUrl);
              batcher.drawSprite(info.texture, mountX, mountY, mount.spec.spriteWidth ?? (info.width || baseW), mount.spec.spriteHeight ?? (info.height || baseH),
                mountFacing + Math.PI / 2, pivotX, pivotY, r / 255, g / 255, b / 255, glowAlpha);
            } else {
              if (baseTex) batcher.drawSprite(baseTex, mountX, mountY, baseW, baseH, mountFacing + Math.PI / 2,
                pivotX, pivotY, r / 255, g / 255, b / 255, glowAlpha);
              if (gunTex) batcher.drawSprite(gunTex, mountX + recoilOff.x, mountY + recoilOff.y, gunW, gunH,
                mountFacing + Math.PI / 2, pivotX, pivotY, r / 255, g / 255, b / 255, glowAlpha);
            }
            batcher.setBlendMode('NORMAL');
          }

          if (!hulk && ship.surfaceFeedback?.mode === 'ORDER' && baseTex)
            renderGlorianaOrderReceiver(ctx, mount, baseTex, mountX, mountY, mountFacing, shipAlpha, ship.surfaceFeedback.level);
          if (!hulk) renderGlorianaCharge(ctx, mount, mountX, mountY, mountFacing, shipAlpha);

          // The native XL mechanism and its charge light are baked into the FORE layer.

          // 武器充能微震
          if (!hulk && glowImgUrl && mount.glowAlpha > 0.01 && !mount.isDisabled) {
            const [gr, gg, gb] = mount.spec.glowColor || [255, 100, 100];
            const glowInfo = textures.getTextureInfo(glowImgUrl);
            const baseGlowW = mount.spec.spriteWidth ?? (glowInfo.width > 0 ? glowInfo.width : baseW);
            const baseGlowH = mount.spec.spriteHeight ?? (glowInfo.height > 0 ? glowInfo.height : baseH);
            const isGlowAndFlash = mount.spec.animationType === 'GLOW_AND_FLASH';
            // Source-authored GLOW_AND_FLASH is a literal glow-mask flash. Do not distort the tiny
            // hardpoint mask with generic scaling/jitter that belongs to our fallback weapon visuals.
            const glowScale = isGlowAndFlash ? 1 : 1 + (weaponVisual.glowScale - 1) * mount.glowAlpha;
            const gw = baseGlowW * glowScale;
            const gh = baseGlowH * glowScale;
            const jX = !isGlowAndFlash && mount.glowAlpha >= 0.7 ? (visualRandom('webgl/passes/WebGLShipPass.ts#4') - 0.5) * 2.5 : 0;
            const jY = !isGlowAndFlash && mount.glowAlpha >= 0.7 ? (visualRandom('webgl/passes/WebGLShipPass.ts#5') - 0.5) * 2.5 : 0;

            batcher.setBlendMode('ADDITIVE');
            batcher.drawSprite(
              glowInfo.texture,
              mountX + jX,
              mountY + jY,
              gw,
              gh,
              mountFacing + Math.PI / 2,
              pivotX,
              pivotY,
              gr / 255,
              gg / 255,
              gb / 255,
              Math.min(1, mount.glowAlpha * weaponVisual.brightness) * shipAlpha
            );
            if (!isGlowAndFlash) {
              const coronaSize = Math.max(gw, gh) * (0.5 + weaponVisual.glowScale * 0.24);
              batcher.drawSprite(hitGlowTex, mountX + jX, mountY + jY, coronaSize, coronaSize, 0, 0, 0, gr / 255, gg / 255, gb / 255, Math.min(0.5, mount.glowAlpha * 0.34 * weaponVisual.brightness) * shipAlpha);
            }
            batcher.setBlendMode('NORMAL');
          }
          if (!hulk && copyAlpha === undefined) renderArkAircraftCharge(ctx, mount, { x: mountX, y: mountY },
            ship.isDead || ship.hullHp <= 0 || ship.flux.isOverloaded || ship.flux.isVenting, shipAlpha, engine.combatTime);
          if (!hulk && copyAlpha === undefined) renderArkWeaponCharge(ctx, mount, { x: mountX, y: mountY }, mountFacing,
            ship.isDead || ship.hullHp <= 0 || ship.flux.isOverloaded || ship.flux.isVenting, shipAlpha);
        }

        // Hull-fixed root lips occlude only authored bearing edges, including empty sockets/hulks.
        renderWeaponInstallations(ctx, ship.spec.weaponSlots, shipPos.x, shipPos.y, shipFacing,
          [tint,tint,tint], shipAlpha, hulk?.mountSlotIds, 'foreground', depth);
      };
      // Real hull alpha masks the lower gun and its launch FX. Copies never duplicate shots.
      if (belowSlots.size) renderWeapons('BELOW_HULL');
      if (!hulk && copyAlpha === undefined) renderUnderHullEffects?.(ship);
      batcher.setBlendMode('NORMAL');
      if (systemVisuals.length) renderSystemHull(systemVisuals, 'under', ship, shipPos, shipFacing, shipTex, shipAlpha, ctx);
      // Construct before a batch starts drawing: creation binds another VAO.
      if (!hulk && arkOwner(ship.spec.sourceHullId ?? ship.spec.id) === 'CORE' && !this.arkSystemMaterial) {
        batcher.flush(); this.arkSystemMaterial = new ArkSystemMaterialRenderer(ctx.gl); batcher.resumeProgram();
      }
      if (hulk || !renderArkBody(ctx,ship,engine.ships,shipPos,shipFacing,engine.combatTime,shipAlpha,this.arkDamageRenderer,this.arkSystemMaterial)) batcher.drawSprite(
        shipTex,
        shipPos.x,
        shipPos.y,
        ship.spec.spriteWidth,
        height,
        shipFacing + Math.PI / 2,
        pivotNormX,
        pivotNormY,
        shipVisual.hullTint[0] * tint,
        shipVisual.hullTint[1] * tint,
        shipVisual.hullTint[2] * tint,
        shipAlpha
      );

      if (!hulk && ship.surfaceFeedback) {
        if (!this.surfaceFeedbackRenderer) { batcher.flush(); this.surfaceFeedbackRenderer = new ShipSurfaceFeedbackRenderer(ctx.gl); batcher.resumeProgram(); }
        this.surfaceFeedbackRenderer.render(ctx, ship, shipTex, shipPos, shipFacing, engine.combatTime, shipAlpha);
      }
      if (systemVisuals.length) renderSystemHull(systemVisuals, 'over', ship, shipPos, shipFacing, shipTex, shipAlpha, ctx);

      const overlayVisible = import.meta.env.VITE_CULL_DAMAGE_OVERLAYS === "false" || hullOverlayInViewport(shipPos.x, shipPos.y, shipFacing, ship.spec, ctx.viewport, ctx.zoom);
      if (!overlayVisible && (ship.scorchMarks.length > 0 || ship.flux.isOverloaded)) this.culledDamageOverlays++;
      // Cell-centered native damage tiles retain their randomized size and armor-derived opacity.
      // Decals use ship alpha, not the disabled hull RGB tint; pieces keep only overlapping cell decals.
      if (overlayVisible && ship.scorchMarks.length > 0 && (hulk || !arkOwner(ship.spec.sourceHullId ?? ship.spec.id))) {
        let damageState = this.damageOverlayStates.get(damageOwner);
        if (!damageState) {
          damageState = {
            instanceId: ++this.damageOverlaySerial,
            baseCanvas: createRenderCanvas(),
            glowCanvas: createRenderCanvas(),
            baseRevision: -1,
            glowRevision: ''
          };
          this.damageOverlayStates.set(damageOwner, damageState);
        }

        const baseSizeChanged = damageState.baseCanvas.width !== ship.spec.spriteWidth
          || damageState.baseCanvas.height !== ship.spec.spriteHeight;
        if (damageState.baseRevision !== ship.scorchMarkVersion || baseSizeChanged) {
          if (renderShipDamageOverlayCanvas(damageState.baseCanvas, ship, 'base', hulk?.visualBounds ?? undefined)) {
            damageState.baseRevision = ship.scorchMarkVersion;
          }
        }
        if (damageState.baseRevision >= 0) {
          const damageTex = textures.getCanvasTexture(
            `ship-damage-base:${decalId}`,
            damageState.baseCanvas,
            `${damageState.instanceId}:${damageState.baseRevision}`
          );
          batcher.setBlendMode('NORMAL');
          batcher.drawSprite(
            damageTex,
            shipPos.x,
            shipPos.y,
            ship.spec.spriteWidth,
            height,
            shipFacing + Math.PI / 2,
            pivotNormX,
            pivotNormY,
            1,
            1,
            1,
            shipAlpha
          );
        }

        if (hotDamageOwners.has(damageOwner)) {
          const nextGlowRevision = getDamageGlowRevision(ship, hulk?.visualBounds ?? undefined);
          const glowSizeChanged = damageState.glowCanvas.width !== ship.spec.spriteWidth
            || damageState.glowCanvas.height !== ship.spec.spriteHeight;
          if (damageState.glowRevision !== nextGlowRevision || glowSizeChanged) {
            if (renderShipDamageOverlayCanvas(damageState.glowCanvas, ship, 'glow', hulk?.visualBounds ?? undefined)) {
              damageState.glowRevision = nextGlowRevision;
            }
          }
          if (damageState.glowRevision !== '') {
            const glowTex = textures.getCanvasTexture(
              `ship-damage-glow:${decalId}`,
              damageState.glowCanvas,
              `${damageState.instanceId}:${damageState.glowRevision}`
            );
            batcher.setBlendMode('ADDITIVE');
            batcher.drawSprite(
              glowTex,
              shipPos.x,
              shipPos.y,
              ship.spec.spriteWidth,
              height,
              shipFacing + Math.PI / 2,
              pivotNormX,
              pivotNormY,
              1.0,
              1.0,
              1.0,
              shipAlpha
            );
          }
        }
      }

      // I.java renders the hull-masked EMP texture before weapons; it follows the hull.
      if (!hulk && overlayVisible) this.overloadRenderers.get(ship)?.render(ship, shipPos, shipFacing, ctx);

      // Native non-firing pusher plates are artwork, not fake playable weapons.
      if (!hulk) for (const decoration of ship.spec.decorativeWeapons ?? []) {
        const info = textures.getTextureInfo(decoration.spriteUrl);
        if (!info.texture || info.width <= 0 || info.height <= 0) continue;
        const compression = decoration.tags?.includes('pusherplate') ? Math.max(0, ...ship.allSystems.map(system => presentationPulseOffset(system) ?? renderPulseOffset(system))) : 0;
        const offset = new Vector2(decoration.x+compression,decoration.y).rotate(shipFacing);
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(info.texture,shipPos.x+offset.x,shipPos.y+offset.y,info.width,info.height,
          shipFacing+decoration.angleDeg*Math.PI/180+Math.PI/2,0,0,tint,tint,tint,shipAlpha);
      }
      renderWeapons('ABOVE_HULL');

      // Ship.java draws the whole vent animation after hull/weapons, before shields.
      if (!hulk) this.ventRendererFor(ship).render(batcher, ctx.ribbonBatcher, textures, ship, shipPos, shipFacing, shipAlpha);
    };

    for (const ship of engine.ships) if (ship.isVisibleTo(engine.playerShip.teamId)) {
      renderShip(ship, ship.interpolatedPos(alpha), ship.interpolatedFacing(alpha));
      // Ark system power is rendered inside its native depth layers, not as cross-hull beams.
      // Reuse hull/decorations/turrets/engines at the ghost pose, without mutating
      // the simulation ship. Do not recursively produce copies of copies.
      for (const copy of systemTeleportCopies(ship)) renderShip(ship, copy.position, copy.facing, undefined, copy.alpha);
      renderHyperionSystems(ctx, ship, ship.interpolatedPos(alpha), ship.interpolatedFacing(alpha), engine.combatTime);
      if (ctx.gravityEffects !== false) renderGravity(ctx, ship, engine.combatTime);
    }

    // Retain the actual hull, damage and mounted-weapon composition after death.
    for (const hulk of engine.hulkFragments) {
      const sourceOrigin = hulk.pos.clone().sub(hulk.localOffset.clone().rotate(hulk.facingRad));
      renderShip(hulk.sourceShip, sourceOrigin, hulk.facingRad, hulk);
    }
  }
}
