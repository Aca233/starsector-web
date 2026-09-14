import React, { useRef, useState } from 'react';
import { Vector2 } from './engine/math/Vector2';
import { TacticalHUD } from './ui/TacticalHUD';
import { ModManagerModal } from './ui/ModManagerModal';
import { CombatResultsModal } from './ui/CombatResultsModal';
import { i18n, Locale } from './engine/i18n/LocalizationManager';
import { zh_CN } from './engine/i18n/locales/zh_CN';
import { en_US } from './engine/i18n/locales/en_US';
import { sound } from './engine/audio/SoundManager';
import { useCombatInput } from './hooks/useCombatInput';
import { useCombatLoop } from './hooks/useCombatLoop';
import { CombatSession, type CombatPresentationState } from './engine/runtime/CombatSession';
import { VisualLabPanel } from './visual-lab/VisualLabPanel';
import { VisualScenarioController } from './visual-lab/VisualScenarioController';
import { runtimeAssetUrl } from './engine/runtime/RuntimePaths';
import { CombatAvailabilityOverlay } from './ui/CombatAvailabilityOverlay';

i18n.registerStrings('zh_CN', zh_CN);
i18n.registerStrings('en_US', en_US);

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialShipId = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('ship') || 'onslaught') : 'onslaught';
  const initialEnemyId = initialShipId === 'paragon' ? 'onslaught' : 'paragon';

  const [session] = useState(() => new CombatSession(initialShipId, initialEnemyId));
  const isVisualLab = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'visual-lab';
  const [visualScenarioController] = useState(() => new VisualScenarioController(session));
  const stableSessionRef = useRef(session);

  const cameraPosRef = useRef<Vector2>(new Vector2(-300, 0));
  const zoomRef = useRef<number>(0.65);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const mouseScreenPos = useRef<Vector2>(new Vector2(typeof window !== 'undefined' ? window.innerWidth * 0.75 : 1200, typeof window !== 'undefined' ? window.innerHeight * 0.5 : 500));
  const isMouseDown = useRef<boolean>(false);
  const inputBlockedRef = useRef(false);

  const [currentLocale, setCurrentLocale] = useState<Locale>('zh_CN');
  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [isResultsModalDismissed, setIsResultsModalDismissed] = useState(false);
  const [isAutopilot, setIsAutopilot] = useState(() => {
    if (typeof window === 'undefined') return false;
    const url = new URLSearchParams(window.location.search);
    return url.has('autopilot') || url.has('demo');
  });
  const [presentationState, setPresentationState] = useState<CombatPresentationState>(() => session.getPresentationState());
  const [battleResult, setBattleResult] = useState(session.engine.battleResult);
  const isAutopilotRef = useRef(false);
  const [, setTickState] = useState(0);

  const isResultModalOpen = !!battleResult && !isResultsModalDismissed;

  React.useEffect(() => {
    isAutopilotRef.current = isAutopilot;
  }, [isAutopilot]);

  React.useEffect(() => {
    inputBlockedRef.current = isModModalOpen || isResultModalOpen || presentationState.status !== 'ready';
  }, [isModModalOpen, isResultModalOpen, presentationState.status]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const next = session.engine.battleResult;
      setBattleResult((current) => current === next ? current : next);
    }, 150);
    return () => window.clearInterval(timer);
  }, [session]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const unsubscribePresentation = session.subscribePresentation(setPresentationState);
    void session.prepare(canvas).catch((error: unknown) => {
      console.error('[Starsector] Combat presentation initialization failed:', error);
    });
    if (isVisualLab) session.pause();
    else session.start();
    (window as any).__combatSession = session;
    (window as any).__combatEngine = session.engine;
    (window as any).__combatRenderer = session.renderer;
    (window as any).__combatPerformanceReport = () => session.getPerformanceReport();

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      unsubscribePresentation();
      session.dispose();
      delete (window as any).__combatSession;
      delete (window as any).__combatEngine;
      delete (window as any).__combatRenderer;
      delete (window as any).__combatPerformanceReport;
    };
  }, [session, isVisualLab]);

  const stopTransientAudio = () => {
    sound.stopLoop('burn_drive_loop');
    sound.stopLoop('fortress_shield_loop');
    sound.stopLoop('flux_flush_loop');
  };

  const handleActivateSystem = () => {
    const player = session.engine.playerShip;
    const sys = player.system;
    const activated = sys.activate();
    if (activated) {
      if (sys.type === 'BURN_DRIVE') {
        sound.play('burn_drive_activate', 0.9);
        sound.startLoop('burn_drive_loop', 0.65);
      } else if (sys.type === 'FORTRESS_SHIELD') {
        sound.startLoop('fortress_shield_loop', 0.7);
      } else if (sys.type === 'MINE_STRIKE') {
        const canvas = canvasRef.current;
        if (canvas) {
          const worldX = (mouseScreenPos.current.x - canvas.width / 2) / zoomRef.current + cameraPosRef.current.x;
          const worldY = (mouseScreenPos.current.y - canvas.height / 2) / zoomRef.current + cameraPosRef.current.y;
          session.engine.deployMine(new Vector2(worldX, worldY), player);
        }
      }
    } else if (sys.type === 'BURN_DRIVE') {
      sound.stopLoop('burn_drive_loop');
      sound.play('burn_drive_deactivate', 0.8);
    } else if (sys.type === 'FORTRESS_SHIELD') {
      sound.stopLoop('fortress_shield_loop');
    }
  };

  useCombatInput({
    sessionRef: stableSessionRef,
    canvasRef,
    cameraPosRef,
    zoomRef,
    isAutopilotRef,
    inputBlockedRef,
    keysPressed,
    mouseScreenPos,
    isMouseDown,
    setIsAutopilot,
    onActivateSystem: handleActivateSystem
  });

  useCombatLoop({
    sessionRef: stableSessionRef,
    canvasRef,
    cameraPosRef,
    zoomRef,
    isAutopilotRef,
    keysPressed,
    mouseScreenPos,
    visualScenarioController: isVisualLab && !isAutopilot ? visualScenarioController : undefined
  });

  const handleToggleLocale = () => {
    const next: Locale = currentLocale === 'zh_CN' ? 'en_US' : 'zh_CN';
    i18n.setLocale(next);
    setCurrentLocale(next);
  };

  const handleSwitchShip = (shipId: string) => {
    setIsResultsModalDismissed(false);
    stopTransientAudio();
    session.switchPlayerShip(shipId);
    setBattleResult(null);
    cameraPosRef.current.copy(session.engine.playerShip.pos);
    setTickState((tick) => tick + 1);
  };

  const handleReset = () => {
    setIsResultsModalDismissed(false);
    stopTransientAudio();
    session.restart();
    setBattleResult(null);
    cameraPosRef.current.copy(session.engine.playerShip.pos);
    setTickState((tick) => tick + 1);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <canvas
        ref={canvasRef}
        style={{ cursor: `url('${runtimeAssetUrl('graphics/cursors/cursor_green.png')}') 16 16, crosshair` }}
        className="w-full h-full block"
      />

      <CombatAvailabilityOverlay
        state={presentationState}
        onRefresh={() => window.location.reload()}
      />

      <TacticalHUD
        engine={session.engine}
        scheduler={session.scheduler}
        onSwitchShip={handleSwitchShip}
        onReset={handleReset}
        onOpenModManager={() => setIsModModalOpen(true)}
        currentLocale={currentLocale}
        onToggleLocale={handleToggleLocale}
        isAutopilot={isAutopilot}
        onToggleAutopilot={() => {
          setIsAutopilot((prev) => !prev);
          sound.play('autofire_toggle', 0.8);
        }}
        onActivateSystem={handleActivateSystem}
        cameraPosRef={cameraPosRef}
        zoomRef={zoomRef}
        canvasRef={canvasRef}
      />

      {isVisualLab && (
        <VisualLabPanel
          session={session}
          controller={visualScenarioController}
          assetsReady={presentationState.status === 'ready'}
          assetsError={presentationState.status === 'failed' ? i18n.t('combat.availability.failed_detail') : null}
          isAutopilot={isAutopilot}
          setIsAutopilot={setIsAutopilot}
          onZoomChange={(zoom) => { zoomRef.current = zoom; }}
          onCameraLockChange={(enabled) => {
            session.setCameraLocked(enabled);
            if (enabled) cameraPosRef.current.copy(session.engine.playerShip.pos);
          }}
          onDamageChange={(enabled) => session.setDamageEnabled(enabled)}
          onMotionChange={(enabled) => session.setMotionEnabled(enabled)}
          onLayerChange={(layer, enabled) => session.setLayerEnabled(layer, enabled)}
          onRefresh={() => setTickState((tick) => tick + 1)}
        />
      )}

      {isResultModalOpen && (
        <CombatResultsModal
          battleResult={session.engine.battleResult!}
          onRestart={handleReset}
          onOpenModManager={() => {
            setIsResultsModalDismissed(true);
            setIsModModalOpen(true);
          }}
          onClose={() => setIsResultsModalDismissed(true)}
        />
      )}

      <ModManagerModal
        isOpen={isModModalOpen}
        onClose={() => setIsModModalOpen(false)}
        onSelectShip={handleSwitchShip}
      />
    </div>
  );
};

export default App;
