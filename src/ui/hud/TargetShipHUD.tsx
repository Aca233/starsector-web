import { useEffect, useRef } from 'react';
import type { HudShip as Ship } from '../../engine/runtime/CombatHudView';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { isInspectableShip } from '../../engine/runtime/CombatTargeting';
import type { FloatingShipHUDProps } from './FloatingShipHUD';
import { HudMeter } from './HudMeter';
import { ShipPaperDoll } from './ShipPaperDoll';
import { buildWeaponHudGroups } from './WeaponHudModel';
import { summarizeGroupAmmo, updateHudMeter } from './hudUtils';
import { contactAnchor } from './ContactLayout';
import './target-ship-hud.css';
import './combat-interface.css';

const damageLabels = { KINETIC: '动能', HIGH_EXPLOSIVE: '高爆', ENERGY: '能量', FRAGMENTATION: '破片' };
interface Props extends Pick<FloatingShipHUDProps, 'cameraPosRef' | 'zoomRef' | 'canvasRef' | 'alphaRef'> { ship: Ship; observer: Ship }

/** A stable read-only inspection panel; only the targeting bracket follows the ship. */
export function TargetShipHUD({ ship, observer, cameraPosRef, zoomRef, canvasRef, alphaRef }: Props) {
  const root = useRef<HTMLDivElement>(null), diamond = useRef<SVGPolygonElement>(null), bracket = useRef<SVGSVGElement>(null);
  const flux = useRef<HTMLSpanElement>(null), hull = useRef<HTMLSpanElement>(null), distance = useRef<HTMLSpanElement>(null), speed = useRef<HTMLSpanElement>(null);
  const rows = buildWeaponHudGroups(ship).flatMap(({ group, entries }) => entries.map(entry => ({ group, ...entry })));
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const el = root.current;
      if (!el) return;
      const { x, y, radius: r, width, height } = contactAnchor(ship, canvasRef?.current, cameraPosRef?.current, zoomRef?.current, alphaRef?.current);
      const visible = observer.playerTargetId === ship.id && isInspectableShip(ship, observer)
        && x >= -r && x <= width + r && y >= -r && y <= height + r;
      el.style.display = visible ? 'block' : 'none';
      if (visible) {
        if (bracket.current) bracket.current.style.transform = `translate3d(${x}px,${y}px,0)`;
        diamond.current?.setAttribute('points', `0,${-r} ${r},0 0,${r} ${-r},0`);
        if (flux.current) updateHudMeter(flux.current, flux.current.clientWidth, ship.flux.fluxPercent, ship.flux.hardFlux / ship.flux.maxFlux);
        if (hull.current) updateHudMeter(hull.current, hull.current.clientWidth, ship.hullHp / ship.maxHullHp);
        if (distance.current) distance.current.textContent = ship.pos.distanceTo(observer.pos).toFixed(0);
        if (speed.current) speed.current.textContent = ship.vel.length().toFixed(1);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [ship, observer, cameraPosRef, zoomRef, canvasRef, alphaRef]);

  return <div ref={root} className="hud-target-inspection" data-target-ship-id={ship.id} aria-label="R 锁定目标详情" style={{ display: 'none' }}>
    <svg ref={bracket} className="hud-target-lines" aria-hidden="true"><polygon ref={diamond} data-target-bracket="true" /></svg>
    <section className="hud-target-card" aria-label="目标详情" data-combat-input-block data-many-weapons={rows.length > 8}>
      <header className="hud-target-heading"><strong>锁定目标</strong><kbd>R</kbd></header>
      <div className="hud-target-identity">
        <strong>{ship.shipName === ship.spec.nameKey ? i18n.t(ship.spec.nameKey) : ship.shipName}</strong>
        <span>{ship.spec.designation || (ship.spec.designationKey ? i18n.t(ship.spec.designationKey) : '')}</span>
      </div>
      <div className="hud-target-summary">
        <div className="hud-target-readouts">
          <div className="hud-target-meter"><span>载荷</span><HudMeter ref={flux} label="目标载荷" fluid value={ship.flux.fluxPercent} minimum={ship.flux.hardFlux / ship.flux.maxFlux} height={5} /></div>
          <div className="hud-target-meter"><span>结构</span><HudMeter ref={hull} label="目标结构" fluid value={ship.hullHp / ship.maxHullHp} height={5} /></div>
          <div className="hud-target-data"><span>战备</span><b>{Math.round(ship.currentCR * 100)}%</b></div>
          <div className="hud-target-data"><span>距离</span><b><span ref={distance} /> SU</b></div>
          <div className="hud-target-data"><span>航速</span><b><span ref={speed} /> SU/S</b></div>
        </div>
        <ShipPaperDoll ship={ship} isEnemy size={86} />
      </div>
      <div className="hud-target-state">{ship.flux.isOverloaded ? '载荷过载' : ship.flux.isVenting ? '排散载荷' : ship.isPhased ? '相位潜航' : ''}</div>
      <section className="hud-target-armament" aria-label="武器详情"><h3 className="hud-detail-heading">武器详情</h3>
      <div className="hud-target-weapons" aria-label="目标武器组（只读）">
        {rows.map(({ group, specId, mounts }) => {
          const spec = mounts[0].spec, ammo = summarizeGroupAmmo(mounts);
          const status = mounts.every(m => m.isDisabled) ? '离线' : ammo.allEmpty ? '耗尽'
            : mounts.some(m => m.firingState === 'ACTIVE') ? '开火' : mounts.every(m => m.cooldownTimer > 0) ? '冷却' : '就绪';
          return <div className="hud-target-weapon" key={`${group.index}:${specId}`} data-target-weapon-id={specId}>
            <span className="hud-target-group">{group.index + 1}</span>
            <span className="hud-target-weapon-name">{mounts.length}× {i18n.t(spec.nameKey).split(' (')[0]}</span>
            <span className="hud-target-weapon-state">{status}{ammo.limited ? ` · ${ammo.remaining}` : ''}</span>
            <span className="hud-target-weapon-type">{damageLabels[spec.type]} · {group.mode === 'LINKED' ? '齐射' : '交替'}{group.isAutofire ? ' · 自动' : ''}</span>
          </div>;
        })}
        {!rows.length && <div>未装备武器</div>}
      </div></section>
    </section>
  </div>;
}
