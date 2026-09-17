import { applyPlayerControls, clientToCombatWorld } from '../engine/runtime/PlayerControls';
import { WeaponLoopAudio } from '../engine/audio/WeaponLoopAudio';
import { syncSystemAudio } from '../engine/audio/SystemAudio';
import { useEffect } from 'react';
import { CombatSession } from '../engine/runtime/CombatSession';
import { Vector2 } from '../engine/math/Vector2';
import { sound } from '../engine/audio/SoundManager';

export interface UseCombatLoopParams {
  sessionRef: React.MutableRefObject<CombatSession>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraPosRef: React.MutableRefObject<Vector2>;
  zoomRef: React.MutableRefObject<number>;
  isAutopilotRef: React.MutableRefObject<boolean>;
  defaultMouseSteeringRef: React.MutableRefObject<boolean>;
  keysPressed: React.MutableRefObject<{ [key: string]: boolean }>;
  mouseScreenPos: React.MutableRefObject<Vector2>;
  isMouseDown: React.MutableRefObject<boolean>;
  visualScenarioController?: { tick: (dt: number) => boolean };
}

const weaponLoopAudio = new WeakMap<CombatSession, WeaponLoopAudio>();

export function syncCombatPresentationAudio(session: CombatSession, presentationReady: boolean): void {
  const player = session.engine.playerShip;
  let weaponAudio = weaponLoopAudio.get(session);
  if (!weaponAudio) {
    weaponAudio = new WeaponLoopAudio();
    weaponLoopAudio.set(session, weaponAudio);
  }
  weaponAudio.sync(session.engine.ships, presentationReady && session.state === 'running', sound);
  syncSystemAudio(player.system, presentationReady && session.state === 'running' && !player.isDead);
  if (!presentationReady || session.state !== 'running') {
    sound.stopLoop('flux_flush_loop');
    return;
  }

  if (player.flux.isVenting) sound.startLoop('flux_flush_loop', 0.65);
}

export function useCombatLoop({
  sessionRef,
  canvasRef,
  cameraPosRef,
  zoomRef,
  isAutopilotRef,
  defaultMouseSteeringRef,
  keysPressed,
  mouseScreenPos,
  isMouseDown,
  visualScenarioController
}: UseCombatLoopParams) {

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    const session = sessionRef.current;
    const unsubscribePresentation = session.subscribePresentation((state) => {
      syncCombatPresentationAudio(session, state.status === 'ready');
    });
    syncCombatPresentationAudio(session, session.isPresentationReady());

    const updatePlayerControls = (fixedDt: number) => {
      const engine = session.engine;
      if (isAutopilotRef.current) {
        engine.updateShipAI(session.playerAI, fixedDt);
        return;
      }

      engine.playerShip.fireControlMode = 'MANUAL';
      engine.playerShip.defenseFacingRad = undefined;
      engine.playerShip.aiHoldOffensiveFire = false;
      engine.playerShip.tacticalAI = undefined;
      if (engine.isTacticalMap) { engine.playerShip.clearInput(); return; }
      const curCanvas = canvasRef.current;
      if (!curCanvas) return;
      const aim = clientToCombatWorld(mouseScreenPos.current, curCanvas, cameraPosRef.current, zoomRef.current);
      applyPlayerControls(engine.playerShip, keysPressed.current, aim, isMouseDown.current, defaultMouseSteeringRef.current);
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
              if (session.state === 'running') updatePlayerControls(fixedDt);
              session.fixedUpdate(fixedDt);
            }
          },
          (alpha) => {
            const renderAlpha = session.state === 'running' ? alpha : 1;
            const targetCam = Vector2.lerp(engine.playerShip.prevPos, engine.playerShip.pos, renderAlpha);
            if (!session.visualOptions.cameraLocked) {
              session.cameraController.follow(cameraPosRef.current, targetCam, session.scheduler.renderDeltaTime);
            }
            session.render(renderAlpha, cameraPosRef.current, zoomRef.current);
          }
        );
      } else {
        // Keep the wall-clock baseline current while presentation is unavailable so
        // context loss/loading time is never replayed as combat simulation backlog.
        session.scheduler.resync(nowSec);
      }

      syncCombatPresentationAudio(session, session.isPresentationReady());
      if (!engine.playerShip.flux.isVenting) sound.stopLoop('flux_flush_loop');

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => {
      unsubscribePresentation();
      syncCombatPresentationAudio(session, false);
      cancelAnimationFrame(animId);
    };
  }, [sessionRef, canvasRef, cameraPosRef, zoomRef, isAutopilotRef, defaultMouseSteeringRef, keysPressed, mouseScreenPos, isMouseDown, visualScenarioController]);
}
