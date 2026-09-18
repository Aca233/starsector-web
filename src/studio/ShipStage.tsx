import { useMountTargets } from './useMountTargets';
import { ShipModuleTargets } from './ShipModuleTargets';
import './ship-targets.css';
import { assemblyParts } from '../engine/content/ModuleGeometry';
import React from "react";
import type { ShipSpec } from "../engine/content/ShipSpec";
import { contentRegistry } from "../engine/content/ContentRegistry";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import { isBuiltIn, sizes, types, weaponName } from "./DesignModel";

interface Props {
  spec: ShipSpec;
  /** Draw the entire assembly while editing just this attachment path. */
  activeModulePath?: readonly string[];
  selectedSlot?: string;
  onSelect?: (id: string) => void;
  onSelectModule?: (path: string[]) => void;
  slotBindings?: (id: string) => React.ButtonHTMLAttributes<HTMLButtonElement>;
  onRemove?: (id: string) => void;
  highlightSlots?: string[];
  home?: boolean;
  zoom?: number;
  pan?: {x: number; y: number};
  pickingWeapon?: boolean;
}
export function ShipStage({
  spec,
  activeModulePath = [],
  selectedSlot,
  onSelect,
  onSelectModule,
  slotBindings,
  onRemove,
  highlightSlots,
  home = false,
  zoom = 1,
  pan,
  pickingWeapon = false,
}: Props) {
  const parts = assemblyParts(spec).map(part => {
    let parent = spec;
    const path = part.key.split('/').slice(1).map(index => {
      const mount = parent.modules![Number(index)];
      parent = mount.spec;
      return mount.slotId;
    });
    return {...part, path};
  });
  const activePath = JSON.stringify(activeModulePath);
  const stageRef = React.useRef<HTMLDivElement>(null);
  useMountTargets(stageRef, spec, activePath, zoom);
  const active = parts.find(part => JSON.stringify(part.path) === activePath) ?? parts[0];
  const activeSpec = active.spec;
  const corners = parts.flatMap(part => {
    const hull = part.spec, c = Math.cos(part.angle), s = Math.sin(part.angle);
    return [-hull.pivotX, hull.spriteWidth-hull.pivotX].flatMap(x => [-hull.pivotY,hull.spriteHeight-hull.pivotY].map(y => ({
      x:part.y+x*c-y*s, y:-part.x+x*s+y*c,
    })));
  });
  const minX=Math.min(...corners.map(p=>p.x)), minY=Math.min(...corners.map(p=>p.y));
  const stageWidth=Math.max(...corners.map(p=>p.x))-minX, stageHeight=Math.max(...corners.map(p=>p.y))-minY;
  const selected = activeSpec.weaponSlots.find((s) => s.slotId === selectedSlot);
  const point = (s: { x: number; y: number }) => ({
    x: -minX + s.y,
    y: -minY - s.x,
  });
  // Weapon anchors and arcs use the same parent/module rotation as the sprites.
  const activePoint = (local: {x: number; y: number}) => {
    const c = Math.cos(active.angle), s = Math.sin(active.angle);
    return point({x: active.x + local.x*c-local.y*s, y: active.y+local.x*s+local.y*c});
  };
  const arc = () => {
    if (!selected) return "";
    const p = activePoint(selected),
      r = stageWidth * 0.48;
    // A single SVG arc with coincident endpoints draws nothing at 360 degrees.
    if (selected.arcDeg >= 359)
      return `M ${p.x + r} ${p.y} A ${r} ${r} 0 1 0 ${p.x - r} ${p.y} A ${r} ${r} 0 1 0 ${p.x + r} ${p.y}`;
    const a = active.angle + ((selected.baseAngleDeg - selected.arcDeg / 2) * Math.PI) / 180,
      b = active.angle + ((selected.baseAngleDeg + selected.arcDeg / 2) * Math.PI) / 180;
    return `M ${p.x} ${p.y} L ${p.x + Math.sin(a) * r} ${p.y - Math.cos(a) * r} A ${r} ${r} 0 ${selected.arcDeg > 180 ? 1 : 0} 1 ${p.x + Math.sin(b) * r} ${p.y - Math.cos(b) * r} Z`;
  };
  return (
    <div className={`ship-stage ${home ? "ship-stage--home" : ""}`}>
      <div className="ship-stage-rings" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>N</span>
        <b>+</b>
      </div>
      <div
        key={spec.id}
        ref={stageRef}
        className={"studio-ship " + (onSelectModule && parts.length > 1 ? "studio-ship--assembly" : "")}
        data-active-module-path={activePath}
        style={
          {
            "--ship-ratio": stageWidth / stageHeight,
            "--ship-zoom": zoom,
            aspectRatio: `${stageWidth}/${stageHeight}`,
            transform: pan ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : undefined,
          } as React.CSSProperties
        }
      >
        <img
          className="studio-hull-image"
          style={spec.modules?.length ? {position:'absolute',left:(-minX-spec.pivotX)/stageWidth*100+'%',top:(-minY-spec.pivotY)/stageHeight*100+'%',width:spec.spriteWidth/stageWidth*100+'%',height:spec.spriteHeight/stageHeight*100+'%'} : undefined}
          src={runtimeAssetUrl(spec.spriteUrl)}
          draggable={false}
          alt={home ? "舰船展示" : "舰体与真实武器挂点"}
        />
        {parts.slice(1).map(part => (
          <div key={part.key} className="assembly-module" style={{
            position:'absolute', pointerEvents:'none',
            left:(part.y-minX-part.spec.pivotX)/stageWidth*100+'%', top:(-part.x-minY-part.spec.pivotY)/stageHeight*100+'%',
            width:part.spec.spriteWidth/stageWidth*100+'%', height:part.spec.spriteHeight/stageHeight*100+'%',
            transform:`rotate(${part.angle*180/Math.PI}deg)`, transformOrigin:`${part.spec.pivotX/part.spec.spriteWidth*100}% ${part.spec.pivotY/part.spec.spriteHeight*100}%`,
          }}>
            <img src={runtimeAssetUrl(part.spec.spriteUrl)} alt="舰体模块" draggable={false} style={{width:'100%',height:'100%'}} />
            {part.spec.weaponSlots.map(slot => {
              const weapon=slot.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
              if (!weapon || slot.mountType==='HIDDEN' || (slot.mountType==='HARDPOINT' && weapon.hardpointUsesHullSprite)) return null;
              const hard=slot.mountType==='HARDPOINT', body=hard ? weapon.hardpointSpriteUrl ?? weapon.turretSpriteUrl : weapon.turretSpriteUrl;
              const gun=hard ? weapon.hardpointGunSpriteUrl ?? weapon.turretGunSpriteUrl : weapon.turretGunSpriteUrl;
              return (weapon.renderBarrelBelow?[gun,body]:[body,gun]).filter(Boolean).map((url,index)=><img key={slot.slotId+index} src={runtimeAssetUrl(url!)} alt="" draggable={false}
                onLoad={e=>{e.currentTarget.style.width=e.currentTarget.naturalWidth/part.spec.spriteWidth*100+'%';}}
                style={{position:'absolute',left:(part.spec.pivotX+slot.y)/part.spec.spriteWidth*100+'%',top:(part.spec.pivotY-slot.x)/part.spec.spriteHeight*100+'%',transform:`translate(-50%,-50%) rotate(${slot.baseAngleDeg}deg)`}} />);
            })}
          </div>
        ))}
        {!home && onSelectModule && parts.length > 1 && <ShipModuleTargets activePath={activePath} width={stageWidth} height={stageHeight} onSelect={onSelectModule}
          targets={parts.map(part => {
            const radius = part.spec.collisionRadius;
            const bounds = part.spec.bounds.length >= 3 ? part.spec.bounds : [[radius, radius], [-radius, radius], [-radius, -radius], [radius, -radius]];
            return { key: part.key, path: part.path, name: part.spec.i18n?.zh_CN?.[part.spec.nameKey] ?? part.spec.id,
              transform: `translate(${part.y-minX} ${-part.x-minY}) rotate(${part.angle*180/Math.PI})`,
              points: bounds.map(([x,y]) => `${y},${-x}`).join(' ') };
          })} />}
        {spec.engineSlots
          .filter((engine) => !engine.systemActivated)
          .map((engine, index) => {
            const p = point(engine);
            return (
              <i
                key={"engine-" + index}
                className="native-engine-idle"
                aria-hidden="true"
                style={{
                  left: (p.x / stageWidth) * 100 + "%",
                  top: (p.y / stageHeight) * 100 + "%",
                  width: ((engine.width * 0.7) / stageWidth) * 100 + "%",
                  height:
                    ((engine.length * 0.2) / stageHeight) * 100 + "%",
                  transform:
                    "translate(-50%, -20%) rotate(" +
                    (engine.angleDeg - 180) +
                    "deg)",
                }}
              />
            );
          })}
        {spec.weaponSlots.map((slot) => {
          const w = slot.defaultWeaponId
            ? contentRegistry.getWeapon(slot.defaultWeaponId)
            : undefined;
          if (!w) return null;
          const hard = slot.mountType === "HARDPOINT";
          if (hard && w.hardpointUsesHullSprite) return null;
          const body = hard
            ? (w.hardpointSpriteUrl ?? w.turretSpriteUrl)
            : w.turretSpriteUrl;
          const gun = hard
            ? (w.hardpointGunSpriteUrl ?? w.turretGunSpriteUrl)
            : w.turretGunSpriteUrl;
          const p = point(slot);
          return (
            <React.Fragment key={slot.slotId}>
              {[...(w.renderBarrelBelow ? [gun, body] : [body, gun])]
                .filter(Boolean)
                .map((url, i) => (
                  <img
                    key={i}
                    className="studio-weapon-image"
                    src={runtimeAssetUrl(url!)}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      e.currentTarget.style.width = `${(e.currentTarget.naturalWidth / stageWidth) * 100}%`;
                    }}
                    style={{
                      left: `${(p.x / stageWidth) * 100}%`,
                      top: `${(p.y / stageHeight) * 100}%`,
                      transform: `translate(-50%,-50%) rotate(${slot.baseAngleDeg}deg)`,
                    }}
                  />
                ))}
            </React.Fragment>
          );
        })}
        {!home && selected && (
          <svg
            className={"ship-arc " + (pickingWeapon ? "ship-arc-picker" : "")}
            viewBox={`0 0 ${stageWidth} ${stageHeight}`}
            aria-hidden="true"
            data-type={selected.weaponType}
          >
            <path d={arc()} />
            <circle cx={activePoint(selected).x} cy={activePoint(selected).y} r="17" />
          </svg>
        )}
        {!home &&
          onSelect &&
          activeSpec.weaponSlots.map((slot) => {
            const p = activePoint(slot),
              builtIn = isBuiltIn(activeSpec.id, slot.slotId);
            return (
              <button
                {...slotBindings?.(slot.slotId)}
                type="button"
                key={active.key + ":" + slot.slotId}
                className={`studio-mount studio-mount--${slot.slotSize.toLowerCase()} ${selectedSlot === slot.slotId ? "is-selected" : ""} ${slot.defaultWeaponId ? "is-equipped" : ""} ${highlightSlots?.includes(slot.slotId) ? "is-grouped" : ""}`}
                data-type={slot.weaponType}
                data-slot-id={slot.slotId}
                data-owner-path={JSON.stringify(active.path)}
                data-owner-hull={activeSpec.id}
                data-mount={slot.mountType}
                data-built-in={builtIn}
                style={{
                  left: `${(p.x / stageWidth) * 100}%`,
                  top: `${(p.y / stageHeight) * 100}%`,
                }}
                aria-label={`挂点 ${slot.slotId}，${sizes[slot.slotSize]}${types[slot.weaponType ?? "UNIVERSAL"]}，${slot.defaultWeaponId ? weaponName(slot.defaultWeaponId) : "空挂点"}${builtIn ? "，内置" : ""}`}
                aria-pressed={selectedSlot === slot.slotId}
                onPointerDown={(event) => {
                  // A focus-triggered tooltip may cover this mount between down/up.
                  // Keep the same click target even if that interactive card appears.
                  if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onClick={() => onSelect(slot.slotId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onRemove?.(slot.slotId);
                }}
              >
                <span aria-hidden="true">
                  {builtIn
                    ? "·"
                    : slot.slotSize === "LARGE"
                      ? "III"
                      : slot.slotSize === "MEDIUM"
                        ? "II"
                        : "I"}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
