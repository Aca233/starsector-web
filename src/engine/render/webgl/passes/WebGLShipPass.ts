import { pulsePusherOffset } from '../../../extensions/ship-systems/PulseDrive';
import { visualRandom } from '../../RenderDeterminism';
import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Ship } from '../../../simulation/Ship';
import type { HulkFragment } from '../../../simulation/CombatTypes';
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
  private ventingRenderers = new Map<Ship, ShipVentingRenderer>();
  private overloadRenderers = new Map<Ship, ShipOverloadRenderer>();
  private hulkHullStates = new WeakMap<HulkFragment, { canvas: HTMLCanvasElement; ready: boolean; instanceId: number }>();
  private damageOverlayStates = new WeakMap<Ship | HulkFragment, {
    instanceId: number;
    baseCanvas: HTMLCanvasElement;
    glowCanvas: HTMLCanvasElement;
    baseRevision: number;
    glowRevision: string;
  }>();
  private damageOverlaySerial = 0;

  public updateVisual(engine: CombatEngine, dt: number, random: VisualRandom): void {
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
  }

  public render(engine: CombatEngine, ctx: WebGLPassContext, nowSec: number) {
    const { batcher, textures, hitGlowTex, alpha } = ctx;
    const activeDamageTextures = new Set<string>();
    // Damage state advances before this synchronous pass. Reuse only its hot/cold
    // decision here, never across RAFs: heat/flash can change without a decal revision.
    // Clipped wreck pieces must not share the whole source hull's decision.
    const hotDamageOwners = new Set<Ship | HulkFragment>();
    const damageId = (ship: Ship, hulk?: HulkFragment) => hulk?.visualBounds ? ship.id + ':piece-' + hulk.id : ship.id;
    const collectDamage = (ship: Ship, hulk?: HulkFragment) => {
      const id = damageId(ship, hulk);
      if (ship.scorchMarks.length > 0) {
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
    textures.retainCanvasTextures(activeDamageTextures);

    // 2. 战舰与挂点渲染函数
    const renderShip = (ship: Ship, shipPos: Vector2, shipFacing: number, hulk?: HulkFragment) => {
      if (ship.isDead && !hulk) return;
      const shipVisual = getShipVisualProfile(ship.spec);

      if (!hulk) renderShipEngines(ship, shipPos, shipFacing, ctx, nowSec);

      // 2.2 舰船主体贴图
      batcher.setBlendMode('NORMAL');
      let shipTex = textures.getTexture(ship.spec.spriteUrl);
      if (hulk?.visualBounds) {
        let state = this.hulkHullStates.get(hulk);
        if (!state) {
          state = { canvas: document.createElement('canvas'), ready: false, instanceId: ++this.damageOverlaySerial };
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
      const shipAlpha = hulkAppearance?.alpha ?? ship.phaseVisualAlpha;
      batcher.drawSprite(
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

      // Cell-centered native damage tiles retain their randomized size and armor-derived opacity.
      // Decals use ship alpha, not the disabled hull RGB tint; pieces keep only overlapping cell decals.
      if (ship.scorchMarks.length > 0) {
        let damageState = this.damageOverlayStates.get(damageOwner);
        if (!damageState) {
          damageState = {
            instanceId: ++this.damageOverlaySerial,
            baseCanvas: document.createElement('canvas'),
            glowCanvas: document.createElement('canvas'),
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
      if (!hulk) this.overloadRenderers.get(ship)?.render(ship, shipPos, shipFacing, ctx);

      // Native non-firing pusher plates are artwork, not fake playable weapons.
      if (!hulk) for (const decoration of ship.spec.decorativeWeapons ?? []) {
        const info = textures.getTextureInfo(decoration.spriteUrl);
        if (!info.texture || info.width <= 0 || info.height <= 0) continue;
        const compression = decoration.tags?.includes('pusherplate') ? pulsePusherOffset(ship.system) : 0;
        const offset = new Vector2(decoration.x+compression,decoration.y).rotate(shipFacing);
        batcher.setBlendMode('NORMAL');
        batcher.drawSprite(info.texture,shipPos.x+offset.x,shipPos.y+offset.y,info.width,info.height,
          shipFacing+decoration.angleDeg*Math.PI/180+Math.PI/2,0,0,tint,tint,tint,shipAlpha);
      }
      // 2.3 旋转武器炮塔与挂点充能光晕 (Turrets & Hardpoints)
      for (const mount of ship.weapons) {
        if (mount.mountType === 'HIDDEN') continue;
        // Ownership is decided once against the collision polygon when it splits.
        if (hulk && !hulk.mountSlotIds.includes(mount.slotId)) continue;
        const isHardpoint = mount.mountType === 'HARDPOINT';
        const mountOffset = new Vector2(mount.relativePos.x, mount.relativePos.y).rotate(shipFacing);
        const mountX = shipPos.x + mountOffset.x;
        const mountY = shipPos.y + mountOffset.y;
        const mountFacing = isHardpoint ? (mount.baseAngleDeg * Math.PI) / 180 + shipFacing : mount.currentAngleRad + (hulk ? shipFacing - ship.facingRad : 0);
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

        const defaultSize = mount.spec.mountSize === 'LARGE' ? 68 : mount.spec.mountSize === 'MEDIUM' ? 42 : 24;
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
              0,
              0,
              tint,
              tint,
              tint,
              alphaVal
            );
          }
        };

        const drawBase = () => {
          if (baseTex) {
            batcher.drawSprite(
              baseTex,
              mountX,
              mountY,
              baseW,
              baseH,
              mountFacing + Math.PI / 2,
              0,
              0,
              tint,
              tint,
              tint,
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

        // 武器充能微震
        if (!hulk && glowImgUrl && mount.glowAlpha > 0.01 && !mount.isDisabled) {
          const [gr, gg, gb] = mount.spec.glowColor || [255, 100, 100];
          const glowInfo = textures.getTextureInfo(glowImgUrl);
          const baseGlowW = glowInfo.width > 0 ? glowInfo.width : baseW;
          const baseGlowH = glowInfo.height > 0 ? glowInfo.height : baseH;
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
            0,
            0,
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
      }

      // Ship.java draws the whole vent animation after hull/weapons, before shields.
      if (!hulk) this.ventRendererFor(ship).render(batcher, ctx.ribbonBatcher, textures, ship, shipPos, shipFacing, shipAlpha);
    };

    for (const ship of engine.ships) if (ship.isVisibleTo(engine.playerShip.teamId)) renderShip(ship, ship.interpolatedPos(alpha), ship.interpolatedFacing(alpha));

    // Retain the actual hull, damage and mounted-weapon composition after death.
    for (const hulk of engine.hulkFragments) {
      const sourceOrigin = hulk.pos.clone().sub(hulk.localOffset.clone().rotate(hulk.facingRad));
      renderShip(hulk.sourceShip, sourceOrigin, hulk.facingRad, hulk);
    }
  }
}
