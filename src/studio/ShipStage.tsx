import React from "react";
import type { ShipSpec } from "../engine/content/ShipSpec";
import { contentRegistry } from "../engine/content/ContentRegistry";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import { isBuiltIn, sizes, types, weaponName } from "./DesignModel";

interface Props {
  spec: ShipSpec;
  selectedSlot?: string;
  onSelect?: (id: string) => void;
  slotBindings?: (id: string) => React.ButtonHTMLAttributes<HTMLButtonElement>;
  onRemove?: (id: string) => void;
  highlightSlots?: string[];
  home?: boolean;
  zoom?: number;
  pickingWeapon?: boolean;
}
export function ShipStage({
  spec,
  selectedSlot,
  onSelect,
  slotBindings,
  onRemove,
  highlightSlots,
  home = false,
  zoom = 1,
  pickingWeapon = false,
}: Props) {
  const selected = spec.weaponSlots.find((s) => s.slotId === selectedSlot);
  const point = (s: { x: number; y: number }) => ({
    x: spec.pivotX + s.y,
    y: spec.pivotY - s.x,
  });
  const arc = () => {
    if (!selected) return "";
    const p = point(selected),
      r = spec.spriteWidth * 0.48;
    // A single SVG arc with coincident endpoints draws nothing at 360 degrees.
    if (selected.arcDeg >= 359)
      return `M ${p.x + r} ${p.y} A ${r} ${r} 0 1 0 ${p.x - r} ${p.y} A ${r} ${r} 0 1 0 ${p.x + r} ${p.y}`;
    const a = ((selected.baseAngleDeg - selected.arcDeg / 2) * Math.PI) / 180,
      b = ((selected.baseAngleDeg + selected.arcDeg / 2) * Math.PI) / 180;
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
        className="studio-ship"
        style={
          {
            "--ship-ratio": spec.spriteWidth / spec.spriteHeight,
            "--ship-zoom": zoom,
            aspectRatio: `${spec.spriteWidth}/${spec.spriteHeight}`,
          } as React.CSSProperties
        }
      >
        <img
          className="studio-hull-image"
          src={runtimeAssetUrl(spec.spriteUrl)}
          draggable={false}
          alt={home ? "舰船展示" : "舰体与真实武器挂点"}
        />
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
                  left: (p.x / spec.spriteWidth) * 100 + "%",
                  top: (p.y / spec.spriteHeight) * 100 + "%",
                  width: ((engine.width * 0.7) / spec.spriteWidth) * 100 + "%",
                  height:
                    ((engine.length * 0.2) / spec.spriteHeight) * 100 + "%",
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
                      e.currentTarget.style.width = `${(e.currentTarget.naturalWidth / spec.spriteWidth) * 100}%`;
                    }}
                    style={{
                      left: `${(p.x / spec.spriteWidth) * 100}%`,
                      top: `${(p.y / spec.spriteHeight) * 100}%`,
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
            viewBox={`0 0 ${spec.spriteWidth} ${spec.spriteHeight}`}
            aria-hidden="true"
            data-type={selected.weaponType}
          >
            <path d={arc()} />
            <circle cx={point(selected).x} cy={point(selected).y} r="17" />
          </svg>
        )}
        {!home &&
          onSelect &&
          spec.weaponSlots.map((slot) => {
            const p = point(slot),
              builtIn = isBuiltIn(spec.id, slot.slotId);
            return (
              <button
                {...slotBindings?.(slot.slotId)}
                type="button"
                key={slot.slotId}
                className={`studio-mount studio-mount--${slot.slotSize.toLowerCase()} ${selectedSlot === slot.slotId ? "is-selected" : ""} ${slot.defaultWeaponId ? "is-equipped" : ""} ${highlightSlots?.includes(slot.slotId) ? "is-grouped" : ""}`}
                data-type={slot.weaponType}
                data-slot-id={slot.slotId}
                data-mount={slot.mountType}
                data-built-in={builtIn}
                style={{
                  left: `${(p.x / spec.spriteWidth) * 100}%`,
                  top: `${(p.y / spec.spriteHeight) * 100}%`,
                }}
                aria-label={`挂点 ${slot.slotId}，${sizes[slot.slotSize]}${types[slot.weaponType ?? "UNIVERSAL"]}，${slot.defaultWeaponId ? weaponName(slot.defaultWeaponId) : "空挂点"}${builtIn ? "，内置" : ""}`}
                aria-pressed={selectedSlot === slot.slotId}
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
