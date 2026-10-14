import React from 'react';
import { contentRegistry } from '../engine/content/ContentRegistry';
import type { WeaponMountSlotConfig } from '../engine/content/ShipSpec';
import { weaponArtLayout } from '../engine/content/WeaponInstallation';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';

const naturalWeaponSizes = new Map<string, { width: number; height: number }>();

/** Shared for main hulls and attached modules. Same dimensions/pivot as WebGL. */
export function InstalledWeaponArt({slot,x,y,width,height}: {slot: WeaponMountSlotConfig; x:number; y:number; width:number; height:number}) {
  if (slot.mountType === 'HIDDEN') return null;
  const w = slot.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
  const art = slot.installation, hard = slot.mountType === 'HARDPOINT';
  const body = w && !(hard && w.hardpointUsesHullSprite) ? (hard ? w.hardpointSpriteUrl ?? w.turretSpriteUrl : w.turretSpriteUrl) : undefined;
  const gun = w && !(hard && w.hardpointUsesHullSprite) ? (hard ? w.hardpointGunSpriteUrl ?? w.turretGunSpriteUrl : w.turretGunSpriteUrl) : undefined;
  const style = (w:number|undefined,h:number|undefined,px:number,py:number,angle:number): React.CSSProperties => ({
    position:'absolute', pointerEvents:'none', left:x/width*100+'%', top:y/height*100+'%',
    width:w === undefined ? undefined : w/width*100+'%', height:h === undefined ? undefined : h/height*100+'%',
    transform:`translate(${-px*100}%,${-py*100}%) rotate(${angle}deg)`, transformOrigin:`${px*100}% ${py*100}%`,
  });
  return <>
    {art && <img className="studio-installation-image" data-installation-slot={slot.slotId} alt="" draggable={false}
      src={runtimeAssetUrl(art.spriteUrl)} style={style(art.width,art.height,art.pivotX,art.pivotY,slot.baseAngleDeg+art.angleDeg)} />}
    {w && (w.renderBarrelBelow ? [gun,body] : [body,gun]).filter(Boolean).map((url,index) => {
      const src = runtimeAssetUrl(url!);
      const cached = naturalWeaponSizes.get(src);
      const measured = (w.spriteWidth !== undefined && w.spriteHeight !== undefined)
        ? weaponArtLayout(w, w.spriteWidth, w.spriteHeight)
        : cached
          ? weaponArtLayout(w, cached.width, cached.height)
          : undefined;
      const syncSize = (el: HTMLImageElement) => {
        if (el.naturalWidth <= 0 || el.naturalHeight <= 0) return;
        naturalWeaponSizes.set(src, { width: el.naturalWidth, height: el.naturalHeight });
        const p = weaponArtLayout(w, el.naturalWidth, el.naturalHeight);
        el.style.width = p.width / width * 100 + '%';
        el.style.height = p.height / height * 100 + '%';
        el.style.visibility = '';
      };
      return <img className="studio-weapon-image" data-weapon-art-slot={slot.slotId} key={index} alt="" draggable={false} src={src}
        ref={el => { if (el && !measured && el.complete && el.naturalWidth > 0) syncSize(el); }}
        style={{ ...style(measured?.width, measured?.height, w.spritePivotX ?? .5, w.spritePivotY ?? .5, slot.baseAngleDeg), ...(measured ? null : { visibility: 'hidden' }) }}
        onLoad={e => syncSize(e.currentTarget)} />;
    })}
    {art?.foreground && <img className="studio-installation-foreground" data-installation-foreground-slot={slot.slotId} alt="" draggable={false}
      src={runtimeAssetUrl(art.foreground.spriteUrl)} style={{...style(art.foreground.width,art.foreground.height,art.foreground.pivotX,art.foreground.pivotY,slot.baseAngleDeg+art.angleDeg),zIndex:2}} />}
  </>;
}

