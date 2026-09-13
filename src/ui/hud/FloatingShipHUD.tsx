import React, { useEffect, useRef } from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { Vector2 } from '../../engine/math/Vector2';

export interface FloatingShipHUDProps {
  ship: Ship;
  isEnemy: boolean;
  cameraPosRef?: React.MutableRefObject<Vector2>;
  zoomRef?: React.MutableRefObject<number>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

/**
 * 1:1 原版舰载近空悬浮战况标牌 (Floating Overhead HUD)
 * 严格对齐官方实机原版照片 (media_1789200834134.png & ship_tag_crop.png):
 * - 45 度军规折角标线从舰船右上边缘向外引出
 * - 第一行: 幅能 : [槽位进度条与右侧 | 限位刻度]
 * - 第二行: 结构 : [实心明亮荧光绿生命槽]
 * - 水平分隔高亮绿线
 * - 第三行: 友好/敌对    战备: 70%
 * - requestAnimationFrame 60fps 硬件级平滑追踪，零 React 重绘开销
 */
export const FloatingShipHUD: React.FC<FloatingShipHUDProps> = ({
  ship,
  isEnemy,
  cameraPosRef,
  zoomRef,
  canvasRef
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<SVGPolylineElement>(null);
  const contentBoxRef = useRef<HTMLDivElement>(null);
  const fluxBarRef = useRef<HTMLDivElement>(null);
  const hullBarRef = useRef<HTMLDivElement>(null);
  const crTextRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let animId = 0;

    const updatePosition = () => {
      const el = containerRef.current;
      if (!el) return;

      if (ship.isDead) {
        el.style.display = 'none';
        animId = requestAnimationFrame(updatePosition);
        return;
      }

      const cam = cameraPosRef?.current ?? new Vector2(0, 0);
      const zoom = zoomRef?.current ?? 1.0;
      const canvas = canvasRef?.current;
      const cw = canvas ? canvas.width : window.innerWidth;
      const ch = canvas ? canvas.height : window.innerHeight;

      // 舰船世界坐标投影至当前视口屏幕像素
      const sx = (ship.pos.x - cam.x) * zoom + cw / 2;
      const sy = (ship.pos.y - cam.y) * zoom + ch / 2;

      // 视口边缘剔除
      if (sx < -200 || sx > cw + 200 || sy < -200 || sy > ch + 200) {
        el.style.display = 'none';
      } else {
        el.style.display = 'block';
        el.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0)`;

        // 动态根据舰体碰撞半径与缩放计算标牌偏置，保证标牌永远位于舰体右上空域外侧
        const shipRadiusPx = Math.max(32, ship.spec.collisionRadius * zoom);
        const startX = Math.round(shipRadiusPx * 0.55);
        const startY = Math.round(-shipRadiusPx * 0.55);
        const cornerX = startX + 38;
        const cornerY = startY - 38;
        const endX = cornerX + 115;

        if (polylineRef.current) {
          polylineRef.current.setAttribute('points', `${startX},${startY} ${cornerX},${cornerY} ${endX},${cornerY}`);
        }

        if (contentBoxRef.current) {
          contentBoxRef.current.style.left = `${cornerX}px`;
          contentBoxRef.current.style.top = `${cornerY - 26}px`;
        }

        // 动态更新血量与幅能槽
        const maxFlux = ship.spec.maxFlux || 10000;
        const fluxRatio = Math.min(1.0, Math.max(0, ship.flux.totalFlux / maxFlux));
        const maxHull = ship.spec.hitpoints || 15000;
        const hullRatio = Math.min(1.0, Math.max(0, ship.hullHp / maxHull));

        if (fluxBarRef.current) {
          fluxBarRef.current.style.width = `${(fluxRatio * 100).toFixed(1)}%`;
          if (ship.flux.isOverloaded) {
            fluxBarRef.current.style.backgroundColor = '#ef4444';
          } else {
            fluxBarRef.current.style.backgroundColor = '#94ff00';
          }
        }

        if (hullBarRef.current) {
          hullBarRef.current.style.width = `${(hullRatio * 100).toFixed(1)}%`;
        }

        if (crTextRef.current) {
          const crVal = Math.round(ship.currentCR * 100);
          crTextRef.current.textContent = `战备: ${crVal}%`;
        }
      }

      animId = requestAnimationFrame(updatePosition);
    };

    animId = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(animId);
  }, [ship, cameraPosRef, zoomRef, canvasRef]);

  return (
    <div
      ref={containerRef}
      className="hud-floating-tag pointer-events-none absolute top-0 left-0 select-none font-mono text-[#94ff00] text-[11px] leading-tight tracking-tight z-20"
      style={{
        willChange: 'transform',
        textShadow: '0 0 2px rgba(148, 255, 0, 0.7)'
      }}
    >
      {/* 45 度原版军规导引折线与水平基线 */}
      <svg className="overflow-visible absolute top-0 left-0 pointer-events-none">
        <polyline
          ref={polylineRef}
          points="24,-20 56,-52 171,-52"
          stroke="#94ff00"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>

      {/* 标牌文本与槽位 (精确对齐水平基线) */}
      <div
        ref={contentBoxRef}
        className="absolute flex flex-col"
        style={{
          left: '56px',
          top: '-78px',
          width: '115px'
        }}
      >
        {/* 第一行: 幅能 : [槽位与限位竖线] */}
        <div className="flex items-center justify-between text-[10px] mb-[2px]">
          <span className="font-bold">幅能&nbsp;:</span>
          <div className="relative w-[65px] h-[6px] bg-black/70 border border-[#94ff00]/50 overflow-hidden">
            <div
              ref={fluxBarRef}
              className="h-full bg-[#94ff00] transition-all duration-75"
              style={{ width: '0%' }}
            />
            {/* 右端 100% 限位指示竖线 */}
            <div className="absolute right-0 top-0 bottom-0 w-[1.5px] bg-[#94ff00]" />
          </div>
        </div>

        {/* 第二行: 结构 : [实心生命槽] */}
        <div className="flex items-center justify-between text-[10px] mb-[3px]">
          <span className="font-bold">结构&nbsp;:</span>
          <div className="relative w-[65px] h-[6px] bg-black/70 border border-[#94ff00]/50 overflow-hidden">
            <div
              ref={hullBarRef}
              className="h-full bg-[#94ff00] transition-all duration-75"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* 第三行: 友好/敌对    战备: xx% (位于水平下划线正下方) */}
        <div className="flex items-center justify-between text-[10px] pt-[3px]">
          <span className="font-bold">{isEnemy ? '敌对' : '友好'}</span>
          <span ref={crTextRef} className="text-[#94ff00]/90">
            战备: 70%
          </span>
        </div>
      </div>
    </div>
  );
};
