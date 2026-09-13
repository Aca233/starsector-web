import React, { useRef, useState } from 'react';
import { CombatEngine } from './engine/simulation/CombatEngine';
import { FixedTimestepScheduler } from './engine/simulation/FixedTimestepScheduler';
import { CombatRenderer } from './engine/render/CombatRenderer';
import { WebGLCombatRenderer } from './engine/render/webgl/WebGLCombatRenderer';
import { ICombatRenderer } from './engine/render/ICombatRenderer';
import { Vector2 } from './engine/math/Vector2';
import { TacticalHUD } from './ui/TacticalHUD';
import { ModManagerModal } from './ui/ModManagerModal';
import { CombatResultsModal } from './ui/CombatResultsModal';
import { i18n, Locale } from './engine/i18n/LocalizationManager';
import { zh_CN } from './engine/i18n/locales/zh_CN';
import { en_US } from './engine/i18n/locales/en_US';
import { sound } from './engine/audio/SoundManager';
import { CapitalShipAI } from './engine/ai/CapitalShipAI';
import { useCombatInput } from './hooks/useCombatInput';
import { useCombatLoop } from './hooks/useCombatLoop';

// 初始化加载核心语言字典
i18n.registerStrings('zh_CN', zh_CN);
i18n.registerStrings('en_US', en_US);

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 引擎单例引用 (支持 URL query 参数快速设定驾驶舰)
  const initialShipId = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('ship') || 'onslaught') : 'onslaught';
  const initialEnemyId = initialShipId === 'paragon' ? 'onslaught' : 'paragon';
  const engineRef = useRef<CombatEngine>(new CombatEngine(initialShipId, initialEnemyId));
  const schedulerRef = useRef<FixedTimestepScheduler>(new FixedTimestepScheduler(60));
  const rendererRef = useRef<ICombatRenderer | null>(null);
  const playerAIRef = useRef<CapitalShipAI | null>(null);

  const cameraPosRef = useRef<Vector2>(new Vector2(-300, 0));
  const zoomRef = useRef<number>(0.65);

  const [currentLocale, setCurrentLocale] = useState<Locale>('zh_CN');
  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [isResultsModalDismissed, setIsResultsModalDismissed] = useState(false);
  const [isAutopilot, setIsAutopilot] = useState(() => {
    if (typeof window !== 'undefined') {
      const url = new URLSearchParams(window.location.search);
      return url.has('autopilot') || url.has('demo');
    }
    return false;
  });
  const isAutopilotRef = useRef(false);
  isAutopilotRef.current = isAutopilot;
  const [, setTickState] = useState(0);

  // 键盘与鼠标按键状态
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const mouseScreenPos = useRef<Vector2>(new Vector2(typeof window !== 'undefined' ? window.innerWidth * 0.75 : 1200, typeof window !== 'undefined' ? window.innerHeight * 0.5 : 500));
  const isMouseDown = useRef<boolean>(false);

  // 初始化渲染器与诊断对象
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 优先尝试 WebGL2 高性能硬件加速模式 (专为 RTX 独显 GPU 打造)
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
        desynchronized: true
      });
      if (gl) {
        console.log('[Starsector] 🚀 WebGL2 硬件实例化加速管线已启用 (RTX 5060 Direct3D11 批处理模式)');
        rendererRef.current = new WebGLCombatRenderer(canvas, gl);
      } else {
        console.warn('[Starsector] ⚠️ 浏览器未提供 WebGL2 上下文，降级至 Canvas2D 渲染器');
        rendererRef.current = new CombatRenderer(canvas);
      }
    } catch (e) {
      console.warn('[Starsector] WebGL2 初始化异常，回退至 Canvas2D:', e);
      rendererRef.current = new CombatRenderer(canvas);
    }

    playerAIRef.current = new CapitalShipAI(engineRef.current.playerShip, engineRef.current.enemyShip);
    (window as any).__combatEngine = engineRef.current;
    (window as any).__combatRenderer = rendererRef.current;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const handleActivateSystem = () => {
    const player = engineRef.current.playerShip;
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
          const canvasW = canvas.width;
          const canvasH = canvas.height;
          const worldX = (mouseScreenPos.current.x - canvasW / 2) / zoomRef.current + cameraPosRef.current.x;
          const worldY = (mouseScreenPos.current.y - canvasH / 2) / zoomRef.current + cameraPosRef.current.y;
          engineRef.current.deployMine(new Vector2(worldX, worldY), player);
        }
      }
    } else {
      if (sys.type === 'BURN_DRIVE') {
        sound.stopLoop('burn_drive_loop');
        sound.play('burn_drive_deactivate', 0.8);
      } else if (sys.type === 'FORTRESS_SHIELD') {
        sound.stopLoop('fortress_shield_loop');
      }
    }
  };

  // 解耦的输入与战斗循环 Hooks
  useCombatInput({
    engineRef,
    canvasRef,
    cameraPosRef,
    zoomRef,
    isAutopilotRef,
    playerAIRef,
    keysPressed,
    mouseScreenPos,
    isMouseDown,
    setIsAutopilot,
    onActivateSystem: handleActivateSystem
  });

  useCombatLoop({
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
  });

  const handleToggleLocale = () => {
    const next: Locale = currentLocale === 'zh_CN' ? 'en_US' : 'zh_CN';
    i18n.setLocale(next);
    setCurrentLocale(next);
  };

  const handleSwitchShip = (shipId: string) => {
    setIsResultsModalDismissed(false);
    sound.stopLoop('burn_drive_loop');
    sound.stopLoop('fortress_shield_loop');
    sound.stopLoop('flux_flush_loop');
    engineRef.current.switchPlayerShip(shipId);
    playerAIRef.current = new CapitalShipAI(engineRef.current.playerShip, engineRef.current.enemyShip);
    cameraPosRef.current.copy(engineRef.current.playerShip.pos);
  };

  const handleReset = () => {
    setIsResultsModalDismissed(false);
    sound.stopLoop('burn_drive_loop');
    sound.stopLoop('fortress_shield_loop');
    sound.stopLoop('flux_flush_loop');
    engineRef.current.resetBattle();
    playerAIRef.current = new CapitalShipAI(engineRef.current.playerShip, engineRef.current.enemyShip);
    cameraPosRef.current.copy(engineRef.current.playerShip.pos);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* 2D/WebGL 硬件加速 Canvas 视口 */}
      <canvas
        ref={canvasRef}
        style={{ cursor: "url('/api/asset?path=graphics/cursors/cursor_green.png') 16 16, crosshair" }}
        className="w-full h-full block"
      />

      {/* 现代化科幻战术 HUD 覆盖层 */}
      <TacticalHUD
        engine={engineRef.current}
        scheduler={schedulerRef.current}
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

            {/* 战后全息战术结算模态窗 */}
      {engineRef.current.battleResult && !isResultsModalDismissed && (
        <CombatResultsModal
          battleResult={engineRef.current.battleResult}
          onRestart={() => {
            setIsResultsModalDismissed(false);
            handleReset();
          }}
          onOpenModManager={() => {
            setIsResultsModalDismissed(true);
            setIsModModalOpen(true);
          }}
          onClose={() => setIsResultsModalDismissed(true)}
        />
      )}

      {/* 模块化舰船 Mod 工作台弹窗 */}
      <ModManagerModal
        isOpen={isModModalOpen}
        onClose={() => setIsModModalOpen(false)}
        onSelectShip={handleSwitchShip}
      />
    </div>
  );
};

export default App;
