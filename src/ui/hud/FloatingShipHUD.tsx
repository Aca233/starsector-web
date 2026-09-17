import React, { useEffect, useRef } from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { Vector2 } from '../../engine/math/Vector2';
import { HudMeter } from './HudMeter';
import { updateHudMeter } from './hudUtils';
import { contactAnchor } from './ContactLayout';

export interface FloatingShipHUDProps {
  ship: Ship;
  isEnemy: boolean;
  observerTeamId: number;
  alphaRef?: React.MutableRefObject<number>;
  cameraPosRef?: React.MutableRefObject<Vector2>;
  zoomRef?: React.MutableRefObject<number>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

/** Source meter geometry with readable system text; label spacing and edge clamping are Web policy. */
export const FloatingShipHUD: React.FC<FloatingShipHUDProps> = ({ ship, isEnemy, observerTeamId, cameraPosRef, zoomRef, canvasRef, alphaRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<SVGPolylineElement>(null);
  const contentBoxRef = useRef<HTMLDivElement>(null);
  const fluxMeterRef = useRef<HTMLSpanElement>(null);
  const hullMeterRef = useRef<HTMLSpanElement>(null);
  const color = isEnemy ? '#ff6400' : '#9bff00';

  useEffect(() => {
    let animId = 0;
    const updatePosition = () => {
      const el = containerRef.current;
      if (!el) return;
      const { x: sx, y: sy, width: cw, height: ch, radius } = contactAnchor(
        ship, canvasRef?.current, cameraPosRef?.current, zoomRef?.current, alphaRef?.current);
      // Moving the camera is not sensor contact: never leave a label over an invisible hull.
      if (ship.isDead || ship.hullHp <= 0 || ship.isRetreated || ship.isDocked || !ship.isVisibleTo(observerTeamId) || sx < -200 || sx > cw + 200 || sy < -200 || sy > ch + 200) {
        el.style.display = 'none';
      } else {
        el.style.display = 'block';
        el.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0)`;
        // Preserve the existing Web leader placement until the native placement/fader is ported.
        const shipRadiusPx = Math.max(32, radius);
        const startX = Math.round(shipRadiusPx * 0.55);
        const startY = Math.round(-shipRadiusPx * 0.55);
        const cornerX = Math.round(Math.max(8 - sx, Math.min(startX + 38, cw - sx - 123)));
        const cornerY = Math.round(Math.max(36 - sy, startY - 38));
        polylineRef.current?.setAttribute('points', `${startX},${startY} ${cornerX},${cornerY} ${cornerX + 115},${cornerY}`);
        if (contentBoxRef.current) {
          contentBoxRef.current.style.left = `${cornerX}px`;
          contentBoxRef.current.style.top = `${cornerY - 27}px`;
        }
        if (fluxMeterRef.current) updateHudMeter(fluxMeterRef.current, 60, ship.flux.totalFlux / ship.flux.maxFlux, ship.flux.hardFlux / ship.flux.maxFlux);
        if (hullMeterRef.current) updateHudMeter(hullMeterRef.current, 60, ship.hullHp / ship.maxHullHp);
      }
      animId = requestAnimationFrame(updatePosition);
    };
    animId = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(animId);
  }, [ship, observerTeamId, cameraPosRef, zoomRef, canvasRef, alphaRef]);

  return (
    <div ref={containerRef} className="hud-floating-tag pointer-events-none absolute top-0 left-0 select-none z-20"
      data-contact-kind="hover" data-ship-id={ship.id} data-affiliation={isEnemy ? 'enemy' : 'friendly'} style={{ display: 'none', willChange: 'transform', color }}>
      <svg className="overflow-visible absolute top-0 left-0 pointer-events-none">
        <polyline ref={polylineRef} points="24,-20 56,-52 171,-52" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
      <div ref={contentBoxRef} className="hud-floating-content absolute w-[115px]" style={{ left: 56, top: -79 }}>
        <div className="hud-floating-meter-row">
          <span className="hud-text">幅能</span>
          <HudMeter ref={fluxMeterRef} label="幅能" value={ship.flux.totalFlux / ship.flux.maxFlux} minimum={ship.flux.hardFlux / ship.flux.maxFlux} width={60} height={5} />
        </div>
        <div className="hud-floating-meter-row">
          <span className="hud-text">结构</span>
          <HudMeter ref={hullMeterRef} label="结构" value={ship.hullHp / ship.maxHullHp} width={60} height={5} />
        </div>
        <div className="hud-floating-status-row">
          <span className="hud-text">{isEnemy ? '敌对' : '友好'}</span>
          <span className="hud-text">战备：{Math.round(ship.currentCR * 100)}%</span>
        </div>
      </div>
    </div>
  );
};
