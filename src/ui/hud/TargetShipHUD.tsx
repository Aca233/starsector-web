import { useEffect, useRef } from 'react';
import type { Ship } from '../../engine/simulation/Ship';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { isInspectableShip } from '../../engine/runtime/CombatTargeting';
import type { FloatingShipHUDProps } from './FloatingShipHUD';
import { HudMeter } from './HudMeter';
import { ShipPaperDoll } from './ShipPaperDoll';
import { buildWeaponHudGroups } from './WeaponHudModel';
import { summarizeGroupAmmo, updateHudMeter } from './hudUtils';
import { contactAnchor, clampContact } from './ContactLayout';
import './target-ship-hud.css';

const damageLabels = { KINETIC: '动能', HIGH_EXPLOSIVE: '高爆', ENERGY: '能量', FRAGMENTATION: '破片' };
interface Props extends Pick<FloatingShipHUDProps, 'ship' | 'cameraPosRef' | 'zoomRef' | 'canvasRef' | 'alphaRef'> { observer: Ship }

/** Locked-contact inspection is deliberately read-only, never an enemy WeaponGroupConsole. */
export function TargetShipHUD({ ship, observer, cameraPosRef, zoomRef, canvasRef, alphaRef }: Props) {
  const root = useRef<HTMLDivElement>(null), diamond = useRef<SVGPolygonElement>(null);
  const weapons = useRef<HTMLDivElement>(null), summary = useRef<HTMLDivElement>(null), identity = useRef<HTMLDivElement>(null);
  const leftLeader = useRef<SVGPolylineElement>(null), rightLeader = useRef<SVGPolylineElement>(null), nameLeader = useRef<SVGPolylineElement>(null);
  const flux = useRef<HTMLSpanElement>(null), hull = useRef<HTMLSpanElement>(null), distance = useRef<HTMLSpanElement>(null), speed = useRef<HTMLSpanElement>(null);
  const rows = buildWeaponHudGroups(ship).flatMap(({ group, entries }) => entries.map(entry => ({ group, ...entry })));
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const el = root.current;
      if (!el) return;
      const a = contactAnchor(ship, canvasRef?.current, cameraPosRef?.current, zoomRef?.current, alphaRef?.current);
      const { x, y, radius: r, width, height } = a;
      const visible = observer.playerTargetId === ship.id && isInspectableShip(ship, observer)
        && x >= -r && x <= width + r && y >= -r && y <= height + r;
      el.style.display = visible ? 'block' : 'none';
      if (visible) {
        el.style.transform = `translate3d(${x}px,${y}px,0)`;
        diamond.current?.setAttribute('points', `0,${-r} ${r},0 0,${r} ${-r},0`);
        const compact = width < 760;
        const weaponWidth = Math.min(286, compact ? Math.max(130, width - 188) : width - 16);
        const weaponHeight = Math.min(weapons.current?.offsetHeight ?? 120, height - 90);
        const wx = compact ? 8 : clampContact(x - r - weaponWidth - 28, 8, width - weaponWidth - 8);
        const wy = compact ? 40 : clampContact(y - r - weaponHeight - 12, 38, height - weaponHeight - 20);
        const sx = compact ? width - 166 : clampContact(x + r + 22, 8, width - 166);
        const sy = compact ? 40 : clampContact(y - r - 44, 38, height - 206);
        const nx = compact ? 8 : clampContact(x - r - 155, 8, width - 172);
        const ny = compact ? wy + weaponHeight + 16 : clampContact(Math.max(y + 12, wy + weaponHeight + 14), 38, height - 68);
        for (const [ref, px, py] of [[weapons, wx, wy], [summary, sx, sy], [identity, nx, ny]] as const) {
          if (ref.current) { ref.current.style.left = `${px - x}px`; ref.current.style.top = `${py - y}px`; }
        }
        if (weapons.current) { weapons.current.style.width = `${weaponWidth}px`; weapons.current.style.maxHeight = `${Math.max(60, height - 90)}px`; }
        leftLeader.current?.setAttribute('points', `${-r * .45},${-r * .55} ${wx + weaponWidth - x},${wy + weaponHeight - y} ${wx - x},${wy + weaponHeight - y}`);
        rightLeader.current?.setAttribute('points', `${r * .55},${-r * .45} ${sx - x},${sy + 41 - y} ${sx + 150 - x},${sy + 41 - y}`);
        nameLeader.current?.setAttribute('points', `${-r * .7},${r * .3} ${nx - x},${ny - y} ${nx - x},${ny + 39 - y}`);
        if (flux.current) updateHudMeter(flux.current, 76, ship.flux.fluxPercent, ship.flux.hardFlux / ship.flux.maxFlux);
        if (hull.current) updateHudMeter(hull.current, 76, ship.hullHp / ship.maxHullHp);
        if (distance.current) distance.current.textContent = ship.pos.distanceTo(observer.pos).toFixed(0);
        if (speed.current) speed.current.textContent = ship.vel.length().toFixed(1);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [ship, observer, cameraPosRef, zoomRef, canvasRef, alphaRef]);

  return <div ref={root} className="hud-target-inspection" data-target-ship-id={ship.id} aria-label="R 锁定目标详情" style={{ display: 'none' }}>
    <svg className="hud-target-lines" aria-hidden="true">
      <polygon ref={diamond} data-target-bracket="true" />
      <polyline ref={leftLeader} /><polyline ref={rightLeader} /><polyline ref={nameLeader} />
    </svg>
    <div ref={weapons} className="hud-target-weapons" aria-label="目标武器组（只读）">
      {rows.slice(0, 12).map(({ group, specId, mounts }) => {
        const spec = mounts[0].spec, ammo = summarizeGroupAmmo(mounts);
        const status = mounts.every(m => m.isDisabled) ? '离线' : ammo.allEmpty ? '耗尽'
          : mounts.some(m => m.firingState === 'ACTIVE') ? '开火' : mounts.every(m => m.cooldownTimer > 0) ? '冷却' : '就绪';
        return <div className="hud-target-weapon" key={`${group.index}:${specId}`} data-target-weapon-id={specId}>
          <span>{group.index + 1}.</span>
          <span className="hud-target-weapon-name">{mounts.length}× {i18n.t(spec.nameKey).split(' (')[0]}</span>
          <span>{group.mode === 'LINKED' ? '齐射' : '交替'}</span>
          <span className="hud-target-weapon-type">伤害类型：{damageLabels[spec.type]}</span>
          <span className="hud-target-weapon-auto">自动开火：{group.isAutofire ? '■' : '□'}</span>
          <span className="hud-target-weapon-state">{status}{ammo.limited ? ` · ${ammo.remaining}` : ''}</span>
        </div>;
      })}
      {!rows.length && <div>无已装备武器</div>}
      {rows.length > 12 && <div>另有 {rows.length - 12} 项武器配置</div>}
      <div className="hud-target-lock-hint">已锁定目标 · R 取消 / 切换</div>
    </div>
    <div ref={summary} className="hud-target-summary">
      <div className="hud-target-meter"><span>幅能</span><HudMeter ref={flux} label="目标幅能" value={ship.flux.fluxPercent} minimum={ship.flux.hardFlux / ship.flux.maxFlux} width={76} height={5} /></div>
      <div className="hud-target-meter"><span>结构</span><HudMeter ref={hull} label="目标结构" value={ship.hullHp / ship.maxHullHp} width={76} height={5} /></div>
      <div>敌对　战备：{Math.round(ship.currentCR * 100)}%</div>
      <div className="hud-target-state">{ship.flux.isOverloaded ? '幅能过载' : ship.flux.isVenting ? '排散幅能' : ship.isPhased ? '相位潜航' : ''}</div>
      <div>距离 <span ref={distance} /> SU</div>
      <div>航速 <span ref={speed} /> SU/S</div>
      <ShipPaperDoll ship={ship} isEnemy size={106} />
    </div>
    <div ref={identity} className="hud-target-identity">
      <div>{ship.shipName}</div><div>{i18n.t(ship.spec.nameKey)}</div>
      <div>{ship.spec.designation || (ship.spec.designationKey ? i18n.t(ship.spec.designationKey) : '')}</div>
    </div>
  </div>;
}
