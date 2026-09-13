import React, { useRef, useEffect } from 'react';
import { CombatEngine } from '../../engine/simulation/CombatEngine';
import { Vector2 } from '../../engine/math/Vector2';

export interface CombatRadarProps {
  engine: CombatEngine;
}

/**
 * 1:1 官方正统战术雷达小地图 (CombatRadar)
 * 严格对齐 Starsector H.java & minimap_bg2.png / holo_grid.png
 * 尺寸: 204x204 军规外框，内部 198x198 极坐标雷达显示区
 */
export const CombatRadar: React.FC<CombatRadarProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;

    const renderRadar = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radarRange = 4000; // 雷达探测最大半径 (SU)
      const scale = (w / 2) / radarRange;

      ctx.clearRect(0, 0, w, h);

      const player = engine.playerShip;
      if (!player) return;

      // 1. 战舰与目标投影映射函数 (以玩家为中心)
      const toRadarPos = (worldPos: Vector2) => {
        const dx = worldPos.x - player.pos.x;
        const dy = worldPos.y - player.pos.y;
        return {
          rx: cx + dx * scale,
          ry: cy + dy * scale
        };
      };

      // 2. 绘制交战边界限制圈 (Boundary Ring)
      ctx.strokeStyle = 'rgba(70, 200, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, (w / 2) * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. 绘制敌舰 (红色三角箭头，对齐 iconEnemyColor: [255, 0, 0])
      const enemy = engine.enemyShip;
      if (enemy && !enemy.isDead) {
        const { rx, ry } = toRadarPos(enemy.pos);
        if (rx >= 0 && rx <= w && ry >= 0 && ry <= h) {
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(enemy.facingRad);

          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#fca5a5';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-4, -3.5);
          ctx.lineTo(-2, 0);
          ctx.lineTo(-4, 3.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.restore();
        }
      }

      // 4. 绘制舰载机群与轰炸机小点
      if (engine.fighters) {
        ctx.fillStyle = '#4ade80';
        for (const ftr of engine.fighters) {
          if (ftr.isDead) continue;
          const { rx, ry } = toRadarPos(ftr.pos);
          if (rx >= 2 && rx <= w - 2 && ry >= 2 && ry <= h - 2) {
            ctx.fillRect(rx - 1, ry - 1, 2, 2);
          }
        }
      }
      if (engine.bombers) {
        ctx.fillStyle = '#60a5fa';
        for (const bmr of engine.bombers) {
          if (bmr.isDead) continue;
          const { rx, ry } = toRadarPos(bmr.pos);
          if (rx >= 2 && rx <= w - 2 && ry >= 2 && ry <= h - 2) {
            ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
          }
        }
      }

      // 5. 绘制玩家旗舰 (翠绿三角箭头，对齐 iconFriendColor: [0, 255, 0])
      if (!player.isDead) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(player.facingRad);

        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -4);
        ctx.lineTo(-2.5, 0);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      animId = requestAnimationFrame(renderRadar);
    };

    animId = requestAnimationFrame(renderRadar);
    return () => cancelAnimationFrame(animId);
  }, [engine]);

  return (
    <div 
      className="relative w-[204px] h-[204px] select-none shadow-2xl"
      style={{
        backgroundImage: 'url(/api/asset?path=graphics/hud/minimap_bg2.png)',
        backgroundSize: '204px 204px',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* 内部 198x198 全息网格背景 holo_grid.png */}
      <div 
        className="absolute top-[3px] left-[3px] w-[198px] h-[198px] pointer-events-none opacity-40"
        style={{
          backgroundImage: 'url(/api/asset?path=graphics/hud/holo_grid.png)',
          backgroundSize: '198px 198px',
          backgroundRepeat: 'no-repeat'
        }}
      />
      {/* 雷达动态实体投影 Canvas */}
      <canvas
        ref={canvasRef}
        width={198}
        height={198}
        className="absolute top-[3px] left-[3px] w-[198px] h-[198px] pointer-events-none"
      />
    </div>
  );
};
