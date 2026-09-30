import { EngineExhaustPreview } from './EngineExhaustPreview';
import { arkStaticDraws } from '../engine/visual/AdunArkArt';
import { ArkPreview } from './ArkPreview';
import { InstalledWeaponArt } from './InstalledWeaponArt';
import { WEAPON_SIZE_MARKERS } from '../engine/content/WeaponSizes';
import { useMountTargets } from './useMountTargets';
import { ShipModuleTargets } from './ShipModuleTargets';
import './ship-targets.css';
import { assemblyParts } from '../engine/content/ModuleGeometry';
import React from "react";
import type { ShipSpec } from "../engine/content/ShipSpec";
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
  const parts = React.useMemo(() => assemblyParts(spec).map(part => {
    let parent = spec;
    const path = part.key.split('/').slice(1).map(index => {
      const mount = parent.modules![Number(index)];
      parent = mount.spec;
      return mount.slotId;
    });
    return {...part, path};
  }), [spec]);
  const arkDraws=arkStaticDraws(spec);
  const activePath = JSON.stringify(activeModulePath);
  const stageRef = React.useRef<HTMLDivElement>(null);
  useMountTargets(stageRef, spec, activePath, zoom);
  const active = parts.find(part => JSON.stringify(part.path) === activePath) ?? parts[0];
  const activeSpec = active.spec;
  // Web depth-layer mounts can share one projection. Keep physical anchors intact;
  // pointer clicks cycle the shared target, keyboard/AT activation keeps its own ID.
  const projectedSlots = React.useMemo(() => {
    const groups = new Map<string, typeof activeSpec.weaponSlots>();
    for (const slot of activeSpec.weaponSlots) {
      const key = `${slot.x},${slot.y}`;
      const group = groups.get(key) ?? [];
      group.push(slot); groups.set(key, group);
    }
    return groups;
  }, [activeSpec]);
  const {minX, minY, stageWidth, stageHeight} = React.useMemo(() => {
    const corners = parts.flatMap(part => {
      const hull = part.spec, c = Math.cos(part.angle), s = Math.sin(part.angle);
      return [-hull.pivotX, hull.spriteWidth-hull.pivotX].flatMap(x => [-hull.pivotY,hull.spriteHeight-hull.pivotY].map(y => ({
        x:part.y+x*c-y*s, y:-part.x+x*s+y*c,
      })));
    });
    const minX=Math.min(...corners.map(p=>p.x)), minY=Math.min(...corners.map(p=>p.y));
    const stageWidth=Math.max(...corners.map(p=>p.x))-minX, stageHeight=Math.max(...corners.map(p=>p.y))-minY;
    return {minX, minY, stageWidth, stageHeight};
  }, [parts]);
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
        {spec.weaponSlots.some(slot => slot.renderLayer === 'BELOW_HULL') && <div data-weapon-layer="BELOW_HULL" style={{position:'absolute',inset:0,zIndex:-1,pointerEvents:'none'}}>
          {spec.weaponSlots.filter(slot => slot.renderLayer === 'BELOW_HULL').map(slot => <InstalledWeaponArt key={slot.slotId} slot={slot}
            x={point(slot).x} y={point(slot).y} width={stageWidth} height={stageHeight} />)}
        </div>}
        {arkDraws && <ArkPreview draws={arkDraws} minX={minX} minY={minY} stageWidth={stageWidth} stageHeight={stageHeight} animate={!home} />}
        {!arkDraws && <img
          className="studio-hull-image"
          style={spec.modules?.length ? {position:'absolute',left:(-minX-spec.pivotX)/stageWidth*100+'%',top:(-minY-spec.pivotY)/stageHeight*100+'%',width:spec.spriteWidth/stageWidth*100+'%',height:spec.spriteHeight/stageHeight*100+'%'} : undefined}
          src={runtimeAssetUrl(spec.spriteUrl)}
          draggable={false}
          alt={home ? "舰船展示" : "舰体与真实武器挂点"}
        />}
        {parts.slice(1).map(part => (
          <div key={part.key} className="assembly-module" style={{
            position:'absolute', pointerEvents:'none', isolation:'isolate',
            left:(part.y-minX-part.spec.pivotX)/stageWidth*100+'%', top:(-part.x-minY-part.spec.pivotY)/stageHeight*100+'%',
            width:part.spec.spriteWidth/stageWidth*100+'%', height:part.spec.spriteHeight/stageHeight*100+'%',
            transform:`rotate(${part.angle*180/Math.PI}deg)`, transformOrigin:`${part.spec.pivotX/part.spec.spriteWidth*100}% ${part.spec.pivotY/part.spec.spriteHeight*100}%`,
          }}>
            {part.spec.weaponSlots.some(slot => slot.renderLayer === 'BELOW_HULL') && <div data-weapon-layer="BELOW_HULL" style={{position:'absolute',inset:0,zIndex:-1,pointerEvents:'none'}}>
              {part.spec.weaponSlots.filter(slot => slot.renderLayer === 'BELOW_HULL').map(slot => <InstalledWeaponArt key={slot.slotId} slot={slot}
                x={part.spec.pivotX+slot.y} y={part.spec.pivotY-slot.x} width={part.spec.spriteWidth} height={part.spec.spriteHeight} />)}
            </div>}
            {!arkDraws && <img src={runtimeAssetUrl(part.spec.spriteUrl)} alt="舰体模块" draggable={false} style={{width:'100%',height:'100%'}} />}
            {part.spec.weaponSlots.filter(slot => slot.renderLayer !== 'BELOW_HULL').map(slot => <InstalledWeaponArt key={slot.slotId} slot={slot}
              x={part.spec.pivotX+slot.y} y={part.spec.pivotY-slot.x} width={part.spec.spriteWidth} height={part.spec.spriteHeight} />)}
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
        <EngineExhaustPreview parts={parts} minX={minX} minY={minY} width={stageWidth} height={stageHeight} animate={!home} />
        {spec.weaponSlots.filter(slot => slot.renderLayer !== 'BELOW_HULL').map(slot => <InstalledWeaponArt key={slot.slotId} slot={slot}
          x={point(slot).x} y={point(slot).y} width={stageWidth} height={stageHeight} />)}
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
              builtIn = slot.builtIn || isBuiltIn(activeSpec.id, slot.slotId);
            const coincident = projectedSlots.get(`${slot.x},${slot.y}`)!;
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
                data-render-layer={slot.renderLayer ?? "ABOVE_HULL"}
                data-built-in={builtIn}
                style={{
                  left: `${(p.x / stageWidth) * 100}%`,
                  top: `${(p.y / stageHeight) * 100}%`,
                }}
                aria-label={`${slot.renderLayer === "BELOW_HULL" ? "船壳下层挂点" : "挂点"} ${slot.slotId}，${sizes[slot.slotSize]}${types[slot.weaponType ?? "UNIVERSAL"]}，${slot.defaultWeaponId ? weaponName(slot.defaultWeaponId) : "空挂点"}${builtIn ? "，内置" : ""}`}
                aria-pressed={selectedSlot === slot.slotId}
                onPointerDown={(event) => {
                  // A focus-triggered tooltip may cover this mount between down/up.
                  // Keep the same click target even if that interactive card appears.
                  if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
                }}
                title={coincident.length > 1 ? `此处有${coincident.length}个重叠挂点，再次点击切换` : undefined}
                onClick={(event) => {
                  if (event.detail === 0 || coincident.length === 1) { onSelect(slot.slotId); return; }
                  const current = coincident.findIndex(candidate => candidate.slotId === selectedSlot);
                  onSelect(coincident[(current + 1) % coincident.length].slotId);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const target = coincident.find(candidate => candidate.slotId === selectedSlot) ?? slot;
                  onRemove?.(target.slotId);
                }}
              >
                <span aria-hidden="true">
                  {builtIn
                    ? "·"
                    : WEAPON_SIZE_MARKERS[slot.slotSize]}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
