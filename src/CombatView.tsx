import { DEFAULT_PLAYER_HULL } from "./engine/data/SandboxDefaults";
import { readBattleSize } from "./engine/runtime/BattleSizeSettings";
import { battleTeamLimit } from "./shared/battle-size.mjs";
import { readMouseSteering, saveMouseSteering } from "./engine/runtime/CombatControlSettings";
import { stopSystemAudio } from "./engine/audio/SystemAudio";
import React, { useRef, useState } from "react";
import { Vector2 } from "./engine/math/Vector2";
import { FleetDeployment } from "./ui/tactical/FleetDeployment";
import { SimulationDeployment } from "./ui/tactical/SimulationDeployment";
import { TacticalHUD } from "./ui/TacticalHUD";
import { ModManagerModal } from "./ui/ModManagerModal";
import { CombatResultsModal } from "./ui/CombatResultsModal";
import { i18n } from "./engine/i18n/LocalizationManager";
import { zh_CN } from "./engine/i18n/locales/zh_CN";
import { en_US } from "./engine/i18n/locales/en_US";
import { sound } from "./engine/audio/SoundManager";
import { useCombatInput } from "./hooks/useCombatInput";
import { useCombatLoop } from "./hooks/useCombatLoop";
import { type CombatPresentationState } from "./engine/runtime/CombatSession";
import { VisualLabPanel } from "./visual-lab/VisualLabPanel";
import { VisualScenarioController } from "./visual-lab/VisualScenarioController";
import { runtimeAssetUrl } from "./engine/runtime/RuntimePaths";
import { CombatAvailabilityOverlay } from "./ui/CombatAvailabilityOverlay";
import { GameSession } from "./engine/game/GameSession";
import { GameSaveStore } from "./engine/game/GameSaveStore";
import { GameStatePanel } from "./ui/GameStatePanel";
import { Notice } from "./ui/core/UI";
import { CombatPauseMenu, CombatSettingsMenu } from "./ui/CombatPauseMenu";
import { preloadNativeMenuFonts } from "./ui/native-fonts";

i18n.registerStrings("zh_CN", zh_CN);
i18n.registerStrings("en_US", en_US);

export const CombatView: React.FC<{
  prototypeId?: string;
  designName?: string;
  deploymentCost?: number;
  onExit?: () => void;
}> = ({ prototypeId, designName, deploymentCost = 0, onExit }) => {
  const isDesignTrial = !!prototypeId;
  const [isDeploymentOpen, setIsDeploymentOpen] = useState(isDesignTrial);
  React.useEffect(() => { preloadNativeMenuFonts(); }, []);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(() => {
    try {
      const stored = localStorage.getItem("starsector-web:muted");
      return stored === null ? sound.getMuted() : stored === "true";
    } catch {
      return sound.getMuted();
    }
  });
  React.useEffect(() => {
    sound.setMuted(isSoundMuted);
    try {
      localStorage.setItem("starsector-web:muted", String(isSoundMuted));
    } catch {
      /* Session setting still works. */
    }
  }, [isSoundMuted]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialShipId =
    prototypeId ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("ship") ||
        DEFAULT_PLAYER_HULL
      : DEFAULT_PLAYER_HULL);
  const isVisualLab =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "visual-lab";
  const [game] = useState(
    () => {
      const next = new GameSession(
        isVisualLab || isDesignTrial
          ? null
          : new GameSaveStore(
              () => window.localStorage,
              "starsector-web:game:v1:" +
                new URL(import.meta.env.BASE_URL, window.location.href)
                  .pathname,
            ),
        initialShipId,
        isVisualLab || isDesignTrial,
      );
      if (isDesignTrial) next.combat.engine.beginSimulationDeployment(deploymentCost, battleTeamLimit(readBattleSize()));
      return next;
    },
  );
  const session = game.combat;
  const [visualScenarioController] = useState(
    () => new VisualScenarioController(session),
  );
  const stableSessionRef = useRef(session);

  const cameraPosRef = useRef<Vector2>(game.combat.engine.playerShip.pos.clone());
  const zoomRef = useRef<number>(0.65);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const mouseScreenPos = useRef<Vector2>(
    new Vector2(
      typeof window !== "undefined" ? window.innerWidth * 0.75 : 1200,
      typeof window !== "undefined" ? window.innerHeight * 0.5 : 500,
    ),
  );
  const isMouseDown = useRef<boolean>(false);
  const mouseAimActiveRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const [defaultMouseSteering, setDefaultMouseSteering] = useState(() => readMouseSteering());
  const defaultMouseSteeringRef = useRef(defaultMouseSteering);
  React.useEffect(() => {
    defaultMouseSteeringRef.current = defaultMouseSteering;
    saveMouseSteering(defaultMouseSteering);
  }, [defaultMouseSteering]);
  const inputBlockedRef = useRef(false);

  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isGamePanelOpen, setIsGamePanelOpen] = useState(false);
  const [gameActionError, setGameActionError] = useState<string | null>(null);
  const [isResultsModalDismissed, setIsResultsModalDismissed] = useState(false);
  const [isAutopilot, setIsAutopilot] = useState(() => {
    if (typeof window === "undefined") return false;
    const url = new URLSearchParams(window.location.search);
    return url.has("autopilot") || url.has("demo");
  });
  const [presentationState, setPresentationState] =
    useState<CombatPresentationState>(() => session.getPresentationState());
  const [battleResult, setBattleResult] = useState(session.engine.battleResult);
  const isAutopilotRef = useRef(false);
  const [, setTickState] = useState(0);

  const isResultModalOpen =
    !!battleResult && !isResultsModalDismissed && !isGamePanelOpen;

  React.useEffect(() => {
    const unsubscribe = game.subscribe(() => setTickState((tick) => tick + 1));
    game.activate();
    return unsubscribe;
  }, [game]);

  React.useEffect(() => {
    isAutopilotRef.current = isAutopilot;
  }, [isAutopilot]);

  React.useEffect(() => {
    inputBlockedRef.current =
      isDeploymentOpen ||
      isModModalOpen ||
      isHelpOpen ||
      isGamePanelOpen ||
      isResultModalOpen ||
      isPauseMenuOpen ||
      isSettingsOpen ||
      presentationState.status !== "ready";
    if (inputBlockedRef.current) {
      keysPressed.current = {}; isMouseDown.current = false; mouseAimActiveRef.current = false;
      session.engine.playerShip.clearInput();
      session.cameraController.suspendPointer();
    }
  }, [
    isDeploymentOpen,
    isModModalOpen,
    isHelpOpen,
    isGamePanelOpen,
    isResultModalOpen,
    isPauseMenuOpen,
    isSettingsOpen,
    presentationState.status,
    session,
  ]);

  // Deployment blocks cockpit input without pausing the simulation. Other dialogs
  // share one pause owner and must preserve the player's explicit Space-pause.
  const pauseRequested =
    isPaused ||
    isPauseMenuOpen ||
    isSettingsOpen ||
    isModModalOpen ||
    isHelpOpen ||
    isGamePanelOpen ||
    isResultModalOpen;
  React.useLayoutEffect(() => {
    if (!pauseRequested) { if (!isVisualLab) session.start(); return; }
    const wasRunning = session.state === "running";
    session.pause();
    for (const key of Object.keys(keysPressed.current))
      keysPressed.current[key] = false;
    isMouseDown.current = false;
    session.engine.playerShip.clearInput();
    return () => {
      if (wasRunning) session.start();
    };
  }, [pauseRequested, session, isVisualLab]);

  React.useEffect(() => {
    const openMenu = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      // An open dialog owns Escape itself: dismiss the top layer, not the game.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]'))
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      event.preventDefault();
      inputBlockedRef.current = true;
      setIsPauseMenuOpen(true);
    };
    window.addEventListener("keydown", openMenu);
    return () => window.removeEventListener("keydown", openMenu);
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const next = session.engine.isBattleResultReady
        ? session.engine.battleResult
        : null;
      setBattleResult((current) => (current === next ? current : next));
    }, 150);
    return () => window.clearInterval(timer);
  }, [session]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const unsubscribePresentation =
      session.subscribePresentation(setPresentationState);
    void session.prepare(canvas).catch((error: unknown) => {
      console.error(
        "[Starsector] Combat presentation initialization failed:",
        error,
      );
    });
    if (isVisualLab) session.pause();
    else session.start();
    (window as any).__gameSession = game;
    (window as any).__combatSession = session;
    (window as any).__combatEngine = session.engine;
    (window as any).__combatRenderer = session.renderer;
    (window as any).__combatPerformanceReport = () =>
      session.getPerformanceReport();

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      unsubscribePresentation();
      session.detachPresentation();
      game.dispose();
      stopSystemAudio();
      sound.stopLoop("flux_flush_loop");
      delete (window as any).__gameSession;
      delete (window as any).__combatSession;
      delete (window as any).__combatEngine;
      delete (window as any).__combatRenderer;
      delete (window as any).__combatPerformanceReport;
    };
  }, [game, session, isVisualLab, isDesignTrial]);

  const stopTransientAudio = () => {
    stopSystemAudio();
    sound.stopLoop("flux_flush_loop");
  };

  const handleGameAction = (action: () => void) => {
    try {
      action();
      setIsPaused(false);
      setGameActionError(null);
      setIsResultsModalDismissed(false);
      setIsGamePanelOpen(false);
      setIsSettingsOpen(false);
      setIsPauseMenuOpen(false);
      stopTransientAudio();
      setBattleResult(null);
      for (const key of Object.keys(keysPressed.current))
        keysPressed.current[key] = false;
      isMouseDown.current = false;
      mouseAimActiveRef.current = false;
      cameraPosRef.current.copy(session.engine.playerShip.pos);
      setTickState((tick) => tick + 1);
    } catch (error) {
      setGameActionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleReset = () => {
    if (isDesignTrial) {
      handleGameAction(() => {
        session.restart(prototypeId);
        session.engine.beginSimulationDeployment(deploymentCost, battleTeamLimit(readBattleSize()));
        session.refreshPresentationAssets();
      });
      setIsAutopilot(false);
      isAutopilotRef.current = false;
      setIsDeploymentOpen(true);
      return;
    }
    if (game.mode === "fleet" && !game.getSnapshot().pendingCombat) return;
    handleGameAction(() => game.restartCombat());
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
    mouseAimActiveRef,
    isMouseDown,
    setIsAutopilot,
    onTogglePause: () => setIsPaused((value) => !value),
  });

  useCombatLoop({
    sessionRef: stableSessionRef,
    canvasRef,
    cameraPosRef,
    zoomRef,
    isAutopilotRef,
    keysPressed,
    mouseScreenPos,
    mouseAimActiveRef,
    isMouseDown,
    inputBlockedRef,
    defaultMouseSteeringRef,
    visualScenarioController:
      isVisualLab && !isAutopilot ? visualScenarioController : undefined,
  });

  const endSimulation = () => {
    // Design trials are ephemeral; this never writes battle damage to the draft.
    if (onExit) onExit();
    else
      window.location.assign(
        new URL(import.meta.env.BASE_URL, window.location.href).href,
      );
  };

  const observeBattlefield = () => {
    setIsResultsModalDismissed(true);
    setIsPaused(false);
    setIsAutopilot(false);
    isAutopilotRef.current = false;
    session.start();
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
  };

  const handleSwitchShip = (shipId: string) =>
    handleGameAction(() => game.startSandbox(shipId));

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-slate-950"
      data-view={isVisualLab ? "visual-lab" : "combat"}
      data-design-trial={isDesignTrial || undefined}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        style={{
          outline: "none",
          cursor: `url('${runtimeAssetUrl("graphics/cursors/cursor_green.png")}') 16 16, crosshair`,
        }}
        className="w-full h-full block"
      />

      {isDesignTrial && (
        <div className="studio-combat-identity">
          <span>模拟战斗</span>
          <strong>{designName}</strong>
          <small>本次损伤不改变设计方案</small>
        </div>
      )}
      {isPauseMenuOpen && (
        <CombatPauseMenu
          spec={session.engine.playerShip.spec}
          shipName={designName}
          endLabel={game.mode === "fleet" ? "结束战斗" : "结束模拟"}
          onSettings={() => setIsSettingsOpen(true)}
          onEnd={endSimulation}
          restartLabel={isDesignTrial ? "重新模拟" : "重新开始"}
          onRestart={game.mode !== "fleet" || !!game.getSnapshot().pendingCombat ? handleReset : undefined}
          onResume={() => setIsPauseMenuOpen(false)}
        />
      )}
      {isSettingsOpen && (
        <CombatSettingsMenu
          spec={session.engine.playerShip.spec}
          defaultMouseSteering={defaultMouseSteering}
          onDefaultMouseSteeringChange={setDefaultMouseSteering}
          muted={isSoundMuted}
          onMutedChange={setIsSoundMuted}
          hasFighters={session.engine.fighterSystem.playerWings.length > 0}
          canRestart={
            game.mode !== "fleet" || !!game.getSnapshot().pendingCombat
          }
          shipActionLabel={isDesignTrial ? "打开暂停菜单" : undefined}
          onClose={() => setIsSettingsOpen(false)}
          onOpenFleet={
            !isVisualLab && !isDesignTrial
              ? () => {
                  setIsSettingsOpen(false);
                  setIsGamePanelOpen(true);
                }
              : undefined
          }
          onOpenShips={
            !isVisualLab && !isDesignTrial
              ? () => {
                  setIsSettingsOpen(false);
                  setIsModModalOpen(true);
                }
              : undefined
          }
        />
      )}
      <CombatAvailabilityOverlay
        state={presentationState}
        onReturnDesign={isDesignTrial ? onExit : undefined}
        onRefresh={() => window.location.reload()}
      />

      {isDeploymentOpen && presentationState.status === "ready" && isDesignTrial && <SimulationDeployment engine={session.engine}
        onClose={() => setIsDeploymentOpen(false)}
        onDeployed={() => {
          if (session.engine.isTacticalMap) session.engine.toggleTacticalMap();
          setIsDeploymentOpen(false);
          session.refreshPresentationAssets();
        }} />}

      {isDeploymentOpen && !isDesignTrial && session.engine.deployment.enabled && <FleetDeployment engine={session.engine} team={session.engine.playerShip.teamId}
        onClose={()=>setIsDeploymentOpen(false)} onDeployed={()=>{if(session.engine.isTacticalMap)session.engine.toggleTacticalMap();setIsDeploymentOpen(false);}} />}

      <TacticalHUD
        paused={pauseRequested}
        onPausedChange={setIsPaused}
        autopilot={isAutopilot}
        onAutopilotChange={(enabled) => {
          keysPressed.current = {}; isMouseDown.current = false; session.engine.playerShip.clearInput();
          isAutopilotRef.current = enabled; setIsAutopilot(enabled);
        }}
        engine={session.engine}
        hudVisuals={session.hudVisuals}
        scheduler={session.scheduler}
        defaultMouseSteering={defaultMouseSteering}
        onDefaultMouseSteeringChange={setDefaultMouseSteering}
        onOpenModManager={
          isDesignTrial
            ? () => setIsPauseMenuOpen(true)
            : () => setIsModModalOpen(true)
        }
        shipActionLabel={isDesignTrial ? "打开暂停菜单" : undefined}
        debug={isVisualLab}
        canRestart={game.mode !== "fleet" || !!game.getSnapshot().pendingCombat}
        cameraPosRef={cameraPosRef}
        zoomRef={zoomRef}
        canvasRef={canvasRef}
        onHelpChange={setIsHelpOpen}
        onOpenDeployment={isDesignTrial || session.engine.deployment.enabled ? () => setIsDeploymentOpen(true) : undefined}
        inputBlocked={
          isDeploymentOpen ||
          isModModalOpen ||
          isGamePanelOpen ||
          isResultModalOpen ||
          isPauseMenuOpen ||
          isSettingsOpen ||
          presentationState.status !== "ready"
        }
      />

      {battleResult && isResultsModalDismissed && !isPauseMenuOpen && !isSettingsOpen && !isGamePanelOpen && !isModModalOpen && !isHelpOpen && (
        <div className="combat-observation-bar" data-combat-input-block>
          <span>{isPaused ? "观察已暂停" : "观察战场"} · WASD / 方向键移动视角 · 滚轮缩放 · 空格{isPaused ? "继续" : "暂停"}</span>
          <button type="button" onClick={() => setIsResultsModalDismissed(false)}>查看战果</button>
        </div>
      )}

      {!isVisualLab &&
        !isDesignTrial &&
        !isGamePanelOpen &&
        (gameActionError ||
          game.error ||
          game.saveStatus.state !== "saved") && (
          <div className="ui-toast" data-combat-input-block>
            <Notice
              tone={gameActionError || game.error ? "danger" : "warning"}
              onDismiss={
                gameActionError ? () => setGameActionError(null) : undefined
              }
            >
              {gameActionError || game.error || game.saveStatus.message}
            </Notice>
          </div>
        )}
      {isGamePanelOpen && (
        <GameStatePanel
          game={game}
          onClose={() => setIsGamePanelOpen(false)}
          onAction={handleGameAction}
          actionError={gameActionError}
          onClearError={() => setGameActionError(null)}
        />
      )}

      {isVisualLab && (
        <VisualLabPanel
          session={session}
          controller={visualScenarioController}
          assetsReady={presentationState.status === "ready"}
          assetsError={
            presentationState.status === "failed"
              ? i18n.t("combat.availability.failed_detail")
              : null
          }
          isAutopilot={isAutopilot}
          setIsAutopilot={setIsAutopilot}
          onZoomChange={(zoom) => {
            zoomRef.current = zoom;
          }}
          onCameraLockChange={(enabled) => {
            session.setCameraLocked(enabled);
            if (enabled)
              cameraPosRef.current.copy(session.engine.playerShip.pos);
          }}
          onDamageChange={(enabled) => session.setDamageEnabled(enabled)}
          onMotionChange={(enabled) => session.setMotionEnabled(enabled)}
          onLayerChange={(layer, enabled) =>
            session.setLayerEnabled(layer, enabled)
          }
          onRefresh={() => setTickState((tick) => tick + 1)}
        />
      )}

      {isResultModalOpen && (
        <CombatResultsModal
          battleResult={session.engine.battleResult!}
          gameMode={game.mode}
          onOpenGameState={() => {
            setIsResultsModalDismissed(true);
            setIsGamePanelOpen(true);
          }}
          onRestart={handleReset}
          shipActionLabel={isDesignTrial ? "返回设计" : undefined}
          onOpenModManager={() => {
            if (isDesignTrial) {
              onExit?.();
              return;
            }
            setIsResultsModalDismissed(true);
            setIsModModalOpen(true);
          }}
          onClose={observeBattlefield}
        />
      )}

      {isModModalOpen && (
        <ModManagerModal
          currentShipId={session.engine.playerShip.spec.id}
          isOpen={isModModalOpen}
          allowSandboxSwitch={
            game.getSnapshot().pendingCombat?.kind !== "fleet"
          }
          onClose={() => setIsModModalOpen(false)}
          onSelectShip={handleSwitchShip}
        />
      )}
    </div>
  );
};

export default CombatView;
