import { useEffect, useRef } from 'react';
import { CombatEngine } from '../engine/simulation/CombatEngine';
import { FixedTimestepScheduler } from '../engine/simulation/FixedTimestepScheduler';
import { ICombatRenderer } from '../engine/render/ICombatRenderer';
import { CapitalShipAI } from '../engine/ai/CapitalShipAI';
import { Vector2 } from '../engine/math/Vector2';
import { sound } from '../engine/audio/SoundManager';

export interface UseCombatLoopParams {
  engineRef: React.MutableRefObject<CombatEngine>;
  schedulerRef: React.MutableRefObject<FixedTimestepScheduler>;
  rendererRef: React.MutableRefObject<ICombatRenderer | null>;
  playerAIRef: React.MutableRefObject<CapitalShipAI | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraPosRef: React.MutableRefObject<Vector2>;
  zoomRef: React.MutableRefObject<number>;
  isAutopilotRef: React.MutableRefObject<boolean>;
  keysPressed: React.MutableRefObject<{ [key: string]: boolean }>;
  mouseScreenPos: React.MutableRefObject<Vector2>;
  setTickState: React.Dispatch<React.SetStateAction<number>>;
}

export function useCombatLoop({
  engineRef,
  schedulerRef,
  rendererRef,
  playerAIRef,
  canvasRef,
  cameraPosRef,
  zoomRef,
  isAutopilotRef,
  keysPressed,
  mouseScreenPos,
  setTickState
}: UseCombatLoopParams) {
  const prevSystemActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let lastHudSyncTime = 0;

    const gameLoop = (currentTimeMs: number) => {
      const nowSec = currentTimeMs / 1000;
      const engine = engineRef.current;
      const scheduler = schedulerRef.current;
      const renderer = rendererRef.current;
      const curCanvas = canvasRef.current;

      // 玩家控制：自动驾驶 (Autopilot) 或 手动键盘鼠标
      if (isAutopilotRef.current && playerAIRef.current) {
        playerAIRef.current.update(1 / 60);
      } else if (curCanvas) {
        // 1. 将屏幕鼠标坐标解投影至世界坐标
        const canvasW = curCanvas.width;
        const canvasH = curCanvas.height;
        const worldMouseX = (mouseScreenPos.current.x - canvasW / 2) / zoomRef.current + cameraPosRef.current.x;
        const worldMouseY = (mouseScreenPos.current.y - canvasH / 2) / zoomRef.current + cameraPosRef.current.y;
        engine.playerShip.aimTargetWorld.set(worldMouseX, worldMouseY);

        // 2. 更新玩家操纵杆输入
        let throttle = 0;
        if (keysPressed.current['KeyW'] || keysPressed.current['ArrowUp']) throttle += 1.0;
        if (keysPressed.current['KeyS'] || keysPressed.current['ArrowDown']) throttle -= 0.5;
        engine.playerShip.throttle = throttle;

        // 转向键 (A / D / 方向左 / 方向右) 执行左右侧向平移 (Strafe Left / Right)
        let strafe = 0;
        if (keysPressed.current['KeyA'] || keysPressed.current['ArrowLeft']) strafe -= 1.0;
        if (keysPressed.current['KeyD'] || keysPressed.current['ArrowRight']) strafe += 1.0;
        engine.playerShip.strafeInput = strafe;

        // 鼠标引导舰船自动转向指针 (Mouse-aim automatic steering)
        const p = engine.playerShip;
        if (!p.isDead) {
          const dx = p.aimTargetWorld.x - p.pos.x;
          const dy = p.aimTargetWorld.y - p.pos.y;
          const distToCursor = Math.hypot(dx, dy);

          if (distToCursor > 25 && !p.flux.isOverloaded) {
            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = targetAngle - p.facingRad;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Starsector 官方动力学阻尼制动算法 (Time-Optimal Deceleration)
            const flameoutRatio = p.getFlameoutRatio();
            const engineMult = Math.max(0.18, 1.0 - flameoutRatio * 0.72) * p.terrainSpeedMult;
            const turnAccelRad = ((p.spec.turnAccelerationDeg * Math.PI) / 180) * engineMult;
            const steerMult = (p.system.isActive && p.system.type === 'BURN_DRIVE') ? 0.15 : 1.0;
            const effectiveTurnAccel = Math.max(0.001, turnAccelRad * steerMult);

            // 依据当前角速度精算无超调临界制动角: stopAngle = w * |w| / (2 * alpha)
            const w = p.angularVelRad;
            const stopAngle = (w * Math.abs(w)) / (2 * effectiveTurnAccel);

            if (Math.abs(angleDiff) < 0.006 && Math.abs(w) < 0.02) {
              p.turnInput = 0;
              p.angularVelRad *= 0.5;
            } else if (angleDiff > 0) {
              if (stopAngle >= angleDiff) {
                p.turnInput = -1.0; // 预判反冲制动
              } else {
                const ramp = Math.min(1.0, (angleDiff - stopAngle) / (effectiveTurnAccel * 0.2));
                p.turnInput = Math.max(0.15, ramp);
              }
            } else {
              if (stopAngle <= angleDiff) {
                p.turnInput = 1.0; // 预判反冲制动
              } else {
                const ramp = Math.min(1.0, (stopAngle - angleDiff) / (effectiveTurnAccel * 0.2));
                p.turnInput = -Math.max(0.15, ramp);
              }
            }
          } else {
            p.turnInput = 0;
          }
        } else {
          p.turnInput = 0;
          p.strafeInput = 0;
          p.throttle = 0;
        }
      }

      // 3. 核心双轨解耦调用：确定性 60Hz 物理步长与亚帧插值渲染
      scheduler.update(
        nowSec,
        (fixedDt) => {
          engine.fixedUpdate(fixedDt);
        },
        (alpha) => {
          // 摄像机平滑追踪玩家战列舰
          const targetCam = Vector2.lerp(engine.playerShip.prevPos, engine.playerShip.pos, alpha);
          cameraPosRef.current.x += (targetCam.x - cameraPosRef.current.x) * 0.1;
          cameraPosRef.current.y += (targetCam.y - cameraPosRef.current.y) * 0.1;

          if (renderer) {
            renderer.render(engine, alpha, cameraPosRef.current, zoomRef.current);
          }
        }
      );

      // 监测排散是否完成，自动停止排散循环音效
      if (!engine.playerShip.flux.isVenting) {
        sound.stopLoop('flux_flush_loop');
      }

      // 监测战术系统状态，在自然到期、被过载或熄火打断时自动停止系统音效循环
      if (!engine.playerShip.system.isActive && prevSystemActiveRef.current) {
        sound.stopLoop('burn_drive_loop');
        sound.stopLoop('fortress_shield_loop');
        if (engine.playerShip.system.type === 'BURN_DRIVE') {
          sound.play('burn_drive_deactivate', 0.8);
        }
      }
      prevSystemActiveRef.current = engine.playerShip.system.isActive;

      // 每 100ms 触发一次 React HUD 状态同步 (10Hz)，削减 50% 的 React VDOM 重构主线程阻塞
      if (nowSec - lastHudSyncTime > 0.10) {
        setTickState(nowSec);
        lastHudSyncTime = nowSec;
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [
    engineRef,
    schedulerRef,
    rendererRef,
    playerAIRef,
    canvasRef,
    cameraPosRef,
    zoomRef,
    isAutopilotRef,
    keysPressed,
    mouseScreenPos,
    setTickState
  ]);
}
