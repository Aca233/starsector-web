import React, { useRef, useEffect } from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { getCachedImage } from './hudUtils';

export interface ShipPaperDollProps {
  ship: Ship;
  isEnemy?: boolean;
  size?: number;
}

/**
 * 100% 还原 Starsector 官方 _new.java / _return.java 战术舰船结构与装甲纸娃娃 (Paper Doll)
 * - 背景: holo_status.png 同心准星底纹
 * - 朝向: ship.facingRad + Math.PI / 2
 * - 遮罩: source-atop 严格将装甲色块剪裁至舰船外廓内
 * - 装甲着色: 完好翠绿 (盟友) / 警戒橙 (敌对) -> 黄色 -> 猩红 -> 剥落暗黑
 * - 表面: 覆绘 0.28 真实舰体贴图，透出船体金属结构与机械细节
 */
export const ShipPaperDoll: React.FC<ShipPaperDollProps> = ({ ship, isEnemy = false, size = 140 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 离屏装甲网格缓冲贴图
    const offCanvas = document.createElement('canvas');
    let lastRenderedVersion = -1;
    let lastDrawW = 0;
    let lastDrawH = 0;

    const updateOffscreenArmor = (drawW: number, drawH: number, shipImg: HTMLImageElement) => {
      const offW = Math.ceil(drawW);
      const offH = Math.ceil(drawH);
      if (offCanvas.width !== offW || offCanvas.height !== offH) {
        offCanvas.width = offW;
        offCanvas.height = offH;
      }
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) return;

      offCtx.clearRect(0, 0, offW, offH);

      // 1. 绘制舰体机械结构底图
      offCtx.save();
      offCtx.globalAlpha = Math.max(0.2, ship.hullHp / ship.spec.hitpoints);
      offCtx.drawImage(shipImg, 0, 0, offW, offH);
      offCtx.restore();

      // 2. 局部装甲网格色彩投影
      offCtx.save();
      offCtx.globalCompositeOperation = 'source-atop';

      const armor = ship.armor;
      const cols = armor.cols;
      const rows = armor.rows;
      const cellW = offW / cols;
      const cellH = offH / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const val = armor.getCell(c, r);
          const ratio = Math.min(1.0, Math.max(0, val / armor.maxCellArmor));

          let fillColor: string;
          if (ratio > 0.75) {
            fillColor = isEnemy
              ? `rgba(240, 140, 30, ${0.38 + ratio * 0.25})`
              : `rgba(25, 230, 25, ${0.35 + ratio * 0.25})`;
          } else if (ratio > 0.35) {
            fillColor = 'rgba(245, 210, 25, 0.65)';
          } else if (ratio > 0.05) {
            fillColor = 'rgba(235, 45, 30, 0.85)';
          } else {
            fillColor = 'rgba(15, 20, 25, 0.9)';
          }

          const cx = c * cellW;
          const cy = r * cellH;
          offCtx.fillStyle = fillColor;
          offCtx.fillRect(cx, cy, cellW - 0.5, cellH - 0.5);
        }
      }
      offCtx.restore();

      // 3. 顶层叠加微弱金属结构反光
      offCtx.save();
      offCtx.globalCompositeOperation = 'source-over';
      offCtx.globalAlpha = 0.28;
      offCtx.drawImage(shipImg, 0, 0, offW, offH);
      offCtx.restore();
    };

    let lastRenderTime = 0;
    const render = (timeMs: number) => {
      if (timeMs - lastRenderTime >= 66) {
        lastRenderTime = timeMs;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // 1. 绘制 holo_status.png 同心准星底图
        const holoImg = getCachedImage('/game-assets/graphics/hud/holo_status.png');
        if (holoImg.complete && holoImg.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.drawImage(holoImg, 0, 0, w, h);
          ctx.restore();
        }

        const shipImg = getCachedImage(ship.spec.spriteUrl);
        if (shipImg.complete && shipImg.naturalWidth > 0) {
          const maxDimension = Math.max(
            ship.spec.spriteWidth || ship.spec.collisionRadius * 2,
            ship.spec.spriteHeight || ship.spec.collisionRadius * 2
          );
          const targetSize = size * 0.72;
          const scale = targetSize / maxDimension;
          const drawW = (ship.spec.spriteWidth || ship.spec.collisionRadius * 2) * scale;
          const drawH = (ship.spec.spriteHeight || ship.spec.collisionRadius * 2) * scale;

          if (lastRenderedVersion !== ship.armor.dirtyVersion || lastDrawW !== drawW || lastDrawH !== drawH) {
            updateOffscreenArmor(drawW, drawH, shipImg);
            lastRenderedVersion = ship.armor.dirtyVersion;
            lastDrawW = drawW;
            lastDrawH = drawH;
          }

          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.rotate(ship.facingRad + Math.PI / 2);
          ctx.drawImage(offCanvas, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [ship, isEnemy, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px` }}
      className="block select-none pointer-events-none"
    />
  );
};
