import { useEffect, useRef } from 'react';
import { CombatEngine } from '../engine/simulation/CombatEngine';
import { Vector2 } from '../engine/math/Vector2';
import { Ship } from '../engine/simulation/Ship';
import { sound } from '../engine/audio/SoundManager';
import { CapitalShipAI } from '../engine/ai/CapitalShipAI';

export interface UseCombatInputParams {
  engineRef: React.MutableRefObject<CombatEngine>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraPosRef: React.MutableRefObject<Vector2>;
  zoomRef: React.MutableRefObject<number>;
  isAutopilotRef: React.MutableRefObject<boolean>;
  playerAIRef: React.MutableRefObject<CapitalShipAI | null>;
  keysPressed: React.MutableRefObject<{ [key: string]: boolean }>;
  mouseScreenPos: React.MutableRefObject<Vector2>;
  isMouseDown: React.MutableRefObject<boolean>;
  setIsAutopilot: React.Dispatch<React.SetStateAction<boolean>>;
  onActivateSystem: () => void;
}

export function useCombatInput({
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
  onActivateSystem
}: UseCombatInputParams) {
  const onActivateSystemRef = useRef(onActivateSystem);
  onActivateSystemRef.current = onActivateSystem;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 鼠标位移监听
    const onMouseMove = (e: MouseEvent) => {
      mouseScreenPos.current.set(e.clientX, e.clientY);
    };

    // 鼠标按下监听
    const onMouseDown = (e: MouseEvent) => {
      mouseScreenPos.current.set(e.clientX, e.clientY);
      sound.preloadSounds(); // 首次交互解锁浏览器 Web Audio

      const engine = engineRef.current;
      const curCanvas = canvasRef.current;
      if (!curCanvas) return;

      // 如果处于战术地图模式 (Tactical Map) - 处理战术指挥交互
      if (engine.isTacticalMap) {
        const canvasW = curCanvas.width;
        const canvasH = curCanvas.height;
        const worldMouseX = (e.clientX - canvasW / 2) / zoomRef.current + cameraPosRef.current.x;
        const worldMouseY = (e.clientY - canvasH / 2) / zoomRef.current + cameraPosRef.current.y;
        const clickWorldPos = new Vector2(worldMouseX, worldMouseY);

        const allUnits = [engine.playerShip, ...engine.fighters, ...engine.bombers];

        if (e.button === 0) {
          // 左键：选中友舰/战机，或点击空地取消选中
          let clickedUnit: Ship | null = null;
          for (const u of allUnits) {
            if (u.isDead) continue;
            const clickDist = clickWorldPos.distanceTo(u.pos);
            if (clickDist < Math.max(50, u.spec.collisionRadius * 1.5)) {
              clickedUnit = u;
              break;
            }
          }
          if (clickedUnit) {
            engine.selectUnit(clickedUnit.id);
          } else {
            engine.selectUnit(null);
          }
        } else if (e.button === 2) {
          // 右键：下达指令 (集火敌舰或航路点移动)
          e.preventDefault();
          const selectedId = engine.selectedUnitId || 'fleet';

          const toEnemy = clickWorldPos.distanceTo(engine.enemyShip.pos);
          if (toEnemy < Math.max(80, engine.enemyShip.spec.collisionRadius * 1.5) && !engine.enemyShip.isDead) {
            engine.issueOrder(selectedId, {
              id: Math.random().toString(),
              type: 'ENGAGE',
              targetShipId: engine.enemyShip.id,
              issuedTime: Date.now()
            });
          } else {
            engine.issueOrder(selectedId, {
              id: Math.random().toString(),
              type: 'WAYPOINT',
              targetPos: clickWorldPos,
              issuedTime: Date.now()
            });
          }
        }
        return;
      }

      if (e.button === 0) {
        // 鼠标左键：开火
        isMouseDown.current = true;
        engineRef.current.playerShip.isFiringMain = true;
      } else if (e.button === 2) {
        // 鼠标右键：启闭能量护盾 / 相位潜航并播放官方对应音效
        e.preventDefault();
        const player = engineRef.current.playerShip;
        if (!player.canUseShields()) {
          // 排散或过载期间绝对严禁开启护盾
          return;
        }
        const active = player.shield.toggle();
        if (player.shield.type === 'PHASE') {
          if (active) {
            sound.play('phase_activate', 0.9);
          } else {
            sound.play('phase_deactivate', 0.9);
          }
        } else {
          if (active) {
            sound.play('shield_up', 0.65);
          } else {
            sound.play('shield_down', 0.65);
          }
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = false;
        engineRef.current.playerShip.isFiringMain = false;
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomRef.current = Math.max(0.3, Math.min(1.5, zoomRef.current * zoomFactor));
    };

    // 键盘输入处理
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      sound.preloadSounds();

      // [Tab]: 切换战术指挥全景地图 (Tactical Map)
      if (e.code === 'Tab') {
        e.preventDefault();
        engineRef.current.toggleTacticalMap();
      }

      // [Z]: 战机全员召回 / 自由交战切换 (Fighter Recall)
      if (e.code === 'KeyZ') {
        engineRef.current.toggleFighterRecall();
      }

      // [U]: 切换自动巡航托管 (Autopilot)
      if (e.code === 'KeyU') {
        setIsAutopilot((prev) => !prev);
        sound.play('autofire_toggle', 0.8);
      }

      // [V] 或 [空格]: 紧急主动散热排散幅能 (严格对齐原版 V 键与空格 Vent)
      if (e.code === 'KeyV' || e.code === 'Space') {
        engineRef.current.playerShip.startVenting();
      }

      // [F]: 激活战术系统 (冲刺推进 / 堡垒护盾 / 空雷突袭)
      if (e.code === 'KeyF') {
        onActivateSystemRef.current();
      }

      // [C]: 发射诱饵热焰弹 / 主动防御对抗 (Active Flares / Countermeasures)
      if (e.code === 'KeyC') {
        engineRef.current.launchCountermeasures();
      }

      // [R]: 换弹/重置战场
      if (e.code === 'KeyR') {
        sound.stopLoop('burn_drive_loop');
        sound.stopLoop('fortress_shield_loop');
        sound.stopLoop('flux_flush_loop');
        engineRef.current.resetBattle();
        playerAIRef.current = new CapitalShipAI(engineRef.current.playerShip, engineRef.current.enemyShip);
      }

      // [1] - [5]: 切换武器编组 / [Ctrl + 1~5]: 切换自动开火 (Autofire)
      const digitMatch = e.code.match(/^(?:Digit|Numpad)([1-5])$/);
      if (digitMatch) {
        const groupIndex = parseInt(digitMatch[1], 10) - 1;
        if (e.ctrlKey) {
          e.preventDefault();
          engineRef.current.playerShip.toggleAutofire(groupIndex);
        } else {
          engineRef.current.playerShip.selectWeaponGroup(groupIndex);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    engineRef,
    canvasRef,
    cameraPosRef,
    zoomRef,
    isAutopilotRef,
    playerAIRef,
    keysPressed,
    mouseScreenPos,
    isMouseDown,
    setIsAutopilot
  ]);
}
