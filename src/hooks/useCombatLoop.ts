import { useEffect, useRef } from 'react';
import { CombatSession } from '../engine/runtime/CombatSession';
import { Vector2 } from '../engine/math/Vector2';
import { sound } from '../engine/audio/SoundManager';

export interface UseCombatLoopParams {
  sessionRef: React.MutableRefObject<CombatSession>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraPosRef: React.MutableRefObject<Vector2>;
  zoomRef: React.MutableRefObject<number>;
  isAutopilotRef: React.MutableRefObject<boolean>;
  keysPressed: React.MutableRefObject<{ [key: string]: boolean }>;
  mouseScreenPos: React.MutableRefObject<Vector2>;
  visualScenarioController?: { tick: (dt: number) => boolean };
}

export function syncCombatPresentationAudio(session: CombatSession, presentationReady: boolean): void {
  const player = session.engine.playerShip;
  if (!presentationReady) {
    sound.stopLoop('burn_drive_loop');
    sound.stopLoop('fortress_shield_loop');
    sound.stopLoop('flux_flush_loop');
    return;
  }

  if (player.flux.isVenting) sound.startLoop('flux_flush_loop', 0.65);
  if (player.system.isActive && player.system.type === 'BURN_DRIVE') sound.startLoop('burn_drive_loop', 0.65);
  if (player.system.isActive && player.system.type === 'FORTRESS_SHIELD') sound.startLoop('fortress_shield_loop', 0.7);
}

export function useCombatLoop({
  sessionRef,
  canvasRef,
  cameraPosRef,
  zoomRef,
  isAutopilotRef,
  keysPressed,
  mouseScreenPos,
  visualScenarioController
}: UseCombatLoopParams) {
  const prevSystemActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    const session = sessionRef.current;
    const unsubscribePresentation = session.subscribePresentation((state) => {
      syncCombatPresentationAudio(session, state.status === 'ready');
      if (state.status !== 'ready') prevSystemActiveRef.current = session.engine.playerShip.system.isActive;
    });
    syncCombatPresentationAudio(session, session.isPresentationReady());

    const updatePlayerControls = (fixedDt: number) => {
      const engine = session.engine;
      if (isAutopilotRef.current) {
        session.playerAI.update(fixedDt);
        return;
      }

      const curCanvas = canvasRef.current;
      if (!curCanvas) return;
      const worldMouseX = (mouseScreenPos.current.x - curCanvas.width / 2) / zoomRef.current + cameraPosRef.current.x;
      const worldMouseY = (mouseScreenPos.current.y - curCanvas.height / 2) / zoomRef.current + cameraPosRef.current.y;
      const player = engine.playerShip;
      player.aimTargetWorld.set(worldMouseX, worldMouseY);

      let throttle = 0;
      if (keysPressed.current['KeyW'] || keysPressed.current['ArrowUp']) throttle += 1.0;
      if (keysPressed.current['KeyS'] || keysPressed.current['ArrowDown']) throttle -= 0.5;
      player.throttle = throttle;

      let strafe = 0;
      if (keysPressed.current['KeyA'] || keysPressed.current['ArrowLeft']) strafe -= 1.0;
      if (keysPressed.current['KeyD'] || keysPressed.current['ArrowRight']) strafe += 1.0;
      player.strafeInput = strafe;

      if (player.isDead) {
        player.turnInput = 0;
        player.strafeInput = 0;
        player.throttle = 0;
        return;
      }

      const dx = player.aimTargetWorld.x - player.pos.x;
      const dy = player.aimTargetWorld.y - player.pos.y;
      const distToCursor = Math.hypot(dx, dy);
      if (distToCursor <= 25 || player.flux.isOverloaded) {
        player.turnInput = 0;
        return;
      }

      const targetAngle = Math.atan2(dy, dx);
      let angleDiff = targetAngle - player.facingRad;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const flameoutRatio = player.getFlameoutRatio();
      const engineMult = Math.max(0.18, 1.0 - flameoutRatio * 0.72) * player.terrainSpeedMult;
      const turnAccelRad = ((player.spec.turnAccelerationDeg * Math.PI) / 180) * engineMult;
      const steerMult = (player.system.isActive && player.system.type === 'BURN_DRIVE') ? 0.15 : 1.0;
      const effectiveTurnAccel = Math.max(0.001, turnAccelRad * steerMult);
      const w = player.angularVelRad;
      const stopAngle = (w * Math.abs(w)) / (2 * effectiveTurnAccel);

      if (Math.abs(angleDiff) < 0.006 && Math.abs(w) < 0.02) {
        player.turnInput = 0;
      } else if (angleDiff > 0) {
        player.turnInput = stopAngle >= angleDiff
          ? -1.0
          : Math.max(0.15, Math.min(1.0, (angleDiff - stopAngle) / (effectiveTurnAccel * 0.2)));
      } else {
        player.turnInput = stopAngle <= angleDiff
          ? 1.0
          : -Math.max(0.15, Math.min(1.0, (stopAngle - angleDiff) / (effectiveTurnAccel * 0.2)));
      }
    };

    const gameLoop = (currentTimeMs: number) => {
      const nowSec = currentTimeMs / 1000;
      const engine = session.engine;

      if (session.isPresentationReady()) {
        session.scheduler.update(
          nowSec,
          (fixedDt) => {
            const handledByVisualLab = visualScenarioController?.tick(fixedDt) ?? false;
            if (!handledByVisualLab) {
              updatePlayerControls(fixedDt);
              session.fixedUpdate(fixedDt);
            }
          },
          (alpha) => {
            const targetCam = Vector2.lerp(engine.playerShip.prevPos, engine.playerShip.pos, alpha);
            if (!session.visualOptions.cameraLocked) {
              session.cameraController.follow(cameraPosRef.current, targetCam, session.scheduler.renderDeltaTime);
            }
            session.render(alpha, cameraPosRef.current, zoomRef.current);
          }
        );
      } else {
        // Keep the wall-clock baseline current while presentation is unavailable so
        // context loss/loading time is never replayed as combat simulation backlog.
        session.scheduler.resync(nowSec);
      }

      if (!engine.playerShip.flux.isVenting) sound.stopLoop('flux_flush_loop');
      if (!engine.playerShip.system.isActive && prevSystemActiveRef.current) {
        sound.stopLoop('burn_drive_loop');
        sound.stopLoop('fortress_shield_loop');
        if (engine.playerShip.system.type === 'BURN_DRIVE') sound.play('burn_drive_deactivate', 0.8);
      }
      prevSystemActiveRef.current = engine.playerShip.system.isActive;

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => {
      unsubscribePresentation();
      syncCombatPresentationAudio(session, false);
      cancelAnimationFrame(animId);
    };
  }, [sessionRef, canvasRef, cameraPosRef, zoomRef, isAutopilotRef, keysPressed, mouseScreenPos, visualScenarioController]);
}
