import { clientToCombatWorld } from '../engine/runtime/PlayerControls';
import { hasCombatInputFocus } from '../engine/runtime/CombatInputFocus';

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
  mouseAimActiveRef: React.MutableRefObject<boolean>;
  isMouseDown: React.MutableRefObject<boolean>;
  inputBlockedRef: React.MutableRefObject<boolean>;
  visualScenarioController?: { tick: (dt: number) => boolean };
}

const weaponLoopAudio = new WeakMap<CombatSession, Set<string>>();

export function syncCombatPresentationAudio(session: CombatSession, presentationReady: boolean): void {
  const player = session.read.playerShip;
  let weaponAudio = weaponLoopAudio.get(session);
  if (!weaponAudio) {
    weaponAudio = new Set<string>();
    weaponLoopAudio.set(session, weaponAudio);
  }
  const next = new Set(presentationReady && session.state === 'running' && !session.read.battleResult ? session.read.weaponAudioLoops : []);
  for (const key of weaponAudio) if (!next.has(key)) sound.stopLoop(key);
  for (const key of next) sound.startLoop(key, .7);
  weaponLoopAudio.set(session, next);
  syncSystemAudio(player.allSystems, presentationReady && session.state === 'running' && !player.isDead && !session.read.battleResult);
  if (!presentationReady || session.state !== 'running' || session.read.battleResult) {
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
  mouseAimActiveRef,
  isMouseDown,
  inputBlockedRef,
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

    const gameLoop = (currentTimeMs: number) => {
      const nowSec = currentTimeMs / 1000;
      const engine = session.read;

      if (session.isPresentationReady()) {
        session.scheduler.update(
          nowSec,
          (fixedDt) => {
            const handledByVisualLab = visualScenarioController?.tick(fixedDt) ?? false;
            if (!handledByVisualLab) {
              const blocked = engine.isTacticalMap || inputBlockedRef.current || !hasCombatInputFocus();
              const livePilot = !engine.battleResult && !engine.playerShip.isDead && !engine.playerShip.isRetreated;
              if (livePilot && !isAutopilotRef.current && blocked) {
                keysPressed.current = {}; isMouseDown.current = false; mouseAimActiveRef.current = false;
              }
              const aim = livePilot && !isAutopilotRef.current && !blocked
                ? clientToCombatWorld(mouseScreenPos.current, canvas, cameraPosRef.current, zoomRef.current) : { x: 0, y: 0 };
              return session.fixedUpdateControlled(fixedDt, {
                autopilot: isAutopilotRef.current, blocked, keys: keysPressed.current,
                aim: [aim.x, aim.y], firing: isMouseDown.current && !session.jumpTargeting.active,
                mouseSteering: defaultMouseSteeringRef.current, pointerActive: mouseAimActiveRef.current
              });
            }
          },
          (alpha) => {
            const renderAlpha = session.state === 'running' ? alpha : 1;
            const targetCam = Vector2.lerp(engine.playerShip.prevPos, engine.playerShip.pos, renderAlpha);
            if (!session.visualOptions.cameraLocked) {
              const canObserve = !inputBlockedRef.current && !engine.isTacticalMap && hasCombatInputFocus();
              if (engine.battleResult || engine.playerShip.isDead || engine.playerShip.isRetreated) {
                session.cameraController.observe(cameraPosRef.current, keysPressed.current, zoomRef.current, session.scheduler.renderDeltaTime, canObserve);
              } else {
                session.cameraController.follow(cameraPosRef.current, targetCam, canvas, zoomRef.current, session.scheduler.renderDeltaTime,
                  !inputBlockedRef.current && !engine.isTacticalMap && document.visibilityState === 'visible', engine.playerShip);
              }
            }
            if (inputBlockedRef.current || engine.isTacticalMap || isAutopilotRef.current || !hasCombatInputFocus()) session.jumpTargeting.cancel();
            if (session.jumpTargeting.active) session.updateJumpTargeting(mouseAimActiveRef.current
              ? clientToCombatWorld(mouseScreenPos.current, canvas, cameraPosRef.current, zoomRef.current) : undefined);
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
  }, [sessionRef, canvasRef, cameraPosRef, zoomRef, isAutopilotRef, defaultMouseSteeringRef, keysPressed, mouseScreenPos, mouseAimActiveRef, isMouseDown, inputBlockedRef, visualScenarioController]);
}
