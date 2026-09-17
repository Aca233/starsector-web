import { useCallback, useEffect, useRef, useState } from "react";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { WebGLCombatRenderer } from "../engine/render/webgl/WebGLCombatRenderer";
import { Vector2 } from "../engine/math/Vector2";
import { sound } from "../engine/audio/SoundManager";
import { VisualRandom } from "../engine/runtime/VisualRandom";
import { clientToCombatWorld } from "../engine/runtime/PlayerControls";
import { assetManager } from "../engine/assets/AssetResolver";
import { contentManifestManager } from "../engine/content/ContentManifest";
import { NativeButton, NativeFrame } from "../ui/NativeChrome";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import { Modal } from "../ui/core/UI";
import { ShipStage } from "../studio/ShipStage";
import { AuthenticTacticalConsole } from "../ui/hud/AuthenticTacticalConsole";
import { CombatRadar } from "../ui/hud/CombatRadar";
import { FloatingShipHUD } from "../ui/hud/FloatingShipHUD";
import { getHudDensity } from "../ui/hud/HudLayout";
import "../ui/combat-pause-menu.css";
import { applyCombatSnapshot } from "./CombatSnapshot";
import type { CombatSnapshot } from "./CombatSnapshot";
import { KEY_CODES } from "./protocol";
import type { Action, LanConnection, Match, Seat } from "./protocol";

const LAYERS = new Set([
  "background",
  "nebula",
  "asteroid",
  "trail",
  "hull",
  "weapon",
  "beam",
  "shield",
  "explosion",
  "markers",
  "identification",
]);
interface HUD {
  hp: number;
  max: number;
  enemy: number;
  enemyMax: number;
  flux: number;
  capacity: number;
  group: number;
  tick: number;
  sim: number;
  bytes: number;
  px: number;
  py: number;
}
export function LanBattle({
  connection,
  match,
  seat,
  ended,
  onReturn,
}: {
  connection: LanConnection;
  match: Match;
  seat: Seat;
  ended: string;
  onReturn: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("正在准备战斗资源…"),
    [error, setError] = useState("");
  const [hud, setHud] = useState<HUD | null>(null);
  const [displayEngine, setDisplayEngine] = useState<CombatEngine | null>(null);
  const [menu, setMenu] = useState<"menu" | "help" | "leave" | null>(null);
  const [density, setDensity] = useState(() =>
    getHudDensity(window.innerWidth, window.innerHeight),
  );
  const cameraRef = useRef(new Vector2());
  const hudZoomRef = useRef(0.65);
  const inputBlockedRef = useRef(false);
  const clearInputRef = useRef<() => void>(() => {});
  const actionRef = useRef<(kind: Action["kind"], value?: number) => void>(
    () => {},
  );
  const openMenu = useCallback((view: "menu" | "help" | "leave") => {
    inputBlockedRef.current = true;
    clearInputRef.current();
    setMenu(view);
  }, []);
  const closeMenu = () => {
    inputBlockedRef.current = false;
    setMenu(null);
  };
  useEffect(() => {
    const resize = () =>
      setDensity(getHudDensity(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const endedRef = useRef(ended);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => {
    endedRef.current = ended;
    if (ended) stopRef.current();
  }, [ended]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    let disposed = false,
      ready = false,
      launched = false,
      workerReady = seat !== 0,
      worker: Worker | null = null,
      renderer: WebGLCombatRenderer | null = null;
    let engine: CombatEngine,
      latest: CombatSnapshot | null = null,
      pending: CombatSnapshot | null = null,
      appliedTick = -1,
      receivedAt = 0,
      bytes = 0,
      frameId = 0,
      seq = 0,
      stateSeq = 0,
      actionId = 0,
      lastFrame = performance.now(),
      lastHUD = 0,
      lastInput = 0,
      lastSound = 0;
    let keys = 0,
      firing = false,
      actions: Action[] = [],
      pointer = { x: 0, y: 0 },
      zoom = 0.65;
    const camera = cameraRef.current,
      random = new VisualRandom(match.seed);
    const send = (message: Record<string, unknown>) =>
      connection.send({ ...message, matchId: match.id });
    const stop = () => {
      if (!disposed) setStatus("本局已停止");
      launched = false;
      keys = 0;
      firing = false;
      actions = [];
      worker?.postMessage({ type: "stop" });
    };
    stopRef.current = stop;
    const fail = (reason: string) => {
      if (disposed) return;
      setError(reason);
      stop();
      send({ type: "fail", reason });
    };
    const loaded = () => {
      if (ready && workerReady && !disposed) {
        setStatus("已就绪，等待另一位玩家…");
        send({ type: "loaded" });
      }
    };
    const accept = (frame: CombatSnapshot) => {
      if (frame.tick <= appliedTick || (pending && frame.tick <= pending.tick))
        return;
      pending = frame;
      receivedAt = performance.now();
      if (launched && ready && engine)
        for (const event of (frame.sounds ?? []).slice(0, 64)) {
          if (!Number.isSafeInteger(event.id) || event.id <= lastSound)
            continue;
          lastSound = event.id;
          if (
            typeof event.key !== "string" ||
            !Object.hasOwn(sound.SOUND_MAP, event.key) ||
            !Number.isFinite(event.volume) ||
            !Number.isFinite(event.rate)
          )
            continue;
          const volume = Math.max(0, Math.min(1, event.volume)),
            rate = Math.max(0.25, Math.min(4, event.rate));
          if (event.pos?.length === 2 && event.pos.every(Number.isFinite))
            sound.playAtPos(
              event.key,
              { x: event.pos[0], y: event.pos[1] },
              engine.playerShip.pos,
              volume,
              rate,
            );
          else sound.play(event.key, volume, rate);
        }
    };
    const unsubscribe = connection.subscribe((m) => {
      if (disposed || m.matchId !== match.id) return;
      if (m.type === "input" && seat === 0)
        worker?.postMessage({ type: "input", seat: m.seat, input: m.input });
      if (m.type === "state" && seat === 1) {
        bytes = JSON.stringify(m.frame).length;
        accept(m.frame);
      }
      if (m.type === "launch") {
        launched = true;
        lastInput = 0;
        setStatus("战斗进行中");
        worker?.postMessage({ type: "start" });
      }
      if (m.type === "ended") stop();
    });
    try {
      engine = new CombatEngine(match.hulls[0], match.hulls[1], match.seed);
      if (seat === 1)
        [engine.playerShip, engine.enemyShip] = [
          engine.enemyShip,
          engine.playerShip,
        ];
      camera.copy(engine.playerShip.pos);
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        powerPreference: "high-performance",
      });
      if (!gl) throw Error("当前浏览器无法创建 WebGL2 战斗画面");
      renderer = new WebGLCombatRenderer(canvas, gl, {
        onContextLost: () => fail("显卡上下文丢失，请返回房间重试。"),
        onContextRestoreFailed: () => fail("显卡恢复失败"),
      });
      if (seat === 0) {
        worker = new Worker(new URL("./host.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onerror = (event) =>
          fail("计算 Worker 启动失败：" + event.message);
        worker.onmessage = (event) => {
          if (disposed) return;
          const m = event.data;
          if (m.type === "ready") {
            workerReady = true;
            loaded();
          }
          if (m.type === "error") fail(m.message);
          if (m.type === "snapshot") {
            accept(m.frame);
            bytes = JSON.stringify(m.frame).length;
            if (
              launched &&
              !send({ type: "state", seq: stateSeq++, frame: m.frame })
            )
              fail("网络发送积压，请检查连接后重试。");
          }
          if (m.type === "finished") {
            send({ type: "finish", winner: m.winner });
            stop();
          }
        };
        worker.postMessage({ type: "init", match });
      }
      void (async () => {
        try {
          await assetManager.ensureManifestLoaded();
          await contentManifestManager.ensureLoaded();
          if (disposed) return;
          await renderer!.prepareAssets(engine);
          if (disposed) return;
          setDisplayEngine(engine);
          ready = true;
          loaded();
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
        }
      })();
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
    const active = () =>
      launched &&
      !endedRef.current &&
      !inputBlockedRef.current &&
      document.visibilityState === "visible";
    const action = (kind: Action["kind"], value?: number) => {
      if (active() && actions.length < 16)
        actions.push({ id: ++actionId, kind, value });
    };
    actionRef.current = action;
    const clear = () => {
      keys = 0;
      firing = false;
      actions = [];
      if (launched) sendInput();
    };
    clearInputRef.current = clear;
    const sendInput = () => {
      if (!engine || !launched) return;
      const aim = clientToCombatWorld(pointer, canvas, camera, zoom);
      const input = { seq: ++seq, keys, aim: [aim.x, aim.y], firing, actions };
      if (send({ type: "input", input })) actions = [];
    };
    const down = (event: KeyboardEvent) => {
      if (
        !event.repeat &&
        !endedRef.current &&
        !inputBlockedRef.current &&
        ["Escape", "KeyH", "Space"].includes(event.code)
      ) {
        event.preventDefault();
        openMenu(event.code === "KeyH" ? "help" : "menu");
        return;
      }
      if (
        !active() ||
        (event.target instanceof Element &&
          event.target.closest(
            "input,select,textarea,[role=dialog],[contenteditable=true]",
          ))
      )
        return;
      let code = event.code;
      if (code === "ShiftRight") code = "ShiftLeft";
      const bit = KEY_CODES.indexOf(code as any);
      if (bit >= 0) {
        keys |= 1 << bit;
        event.preventDefault();
      }
      if (event.repeat) return;
      if (event.code === "KeyV") action("vent");
      if (event.code === "KeyF") action("system");
      if (/^Digit[1-7]$/.test(event.code))
        action("group", Number(event.code.slice(5)) - 1);
    };
    const up = (event: KeyboardEvent) => {
      const code = event.code === "ShiftRight" ? "ShiftLeft" : event.code;
      const bit = KEY_CODES.indexOf(code as any);
      if (bit >= 0) keys &= ~(1 << bit);
    };
    const move = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
    };
    const mouseDown = (event: MouseEvent) => {
      if (!active()) return;
      sound.play("ui_button_press", 0);
      pointer = { x: event.clientX, y: event.clientY };
      if (event.button === 0) firing = true;
      if (event.button === 2) action("shield");
    };
    const mouseUp = () => {
      firing = false;
    };
    const context = (event: MouseEvent) => event.preventDefault();
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (inputBlockedRef.current) return;
      zoom = Math.max(
        0.25,
        Math.min(1.4, zoom * (event.deltaY < 0 ? 1.1 : 0.9)),
      );
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mousedown", mouseDown);
    window.addEventListener("mouseup", mouseUp);
    canvas.addEventListener("contextmenu", context);
    canvas.addEventListener("wheel", wheel, { passive: false });
    const inputTimer = setInterval(() => {
      if (launched) {
        sendInput();
        lastInput = performance.now();
      }
    }, 1000 / 30);
    const frame = (now: number) => {
      if (disposed) return;
      frameId = requestAnimationFrame(frame);
      if (!ready || !renderer || !engine) return;
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      try {
        const rect = canvas.getBoundingClientRect(),
          ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(rect.width * ratio)),
          height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        // Renderer zoom is in backing pixels; DOM HUD positions are CSS pixels.
        hudZoomRef.current = zoom / (canvas.width / Math.max(1, rect.width));
        if (pending) {
          applyCombatSnapshot(engine, pending, seat);
          appliedTick = pending.tick;
          latest = pending;
          pending = null;
        }
        const alpha = Math.min(1, Math.max(0, (now - receivedAt) / 50));
        const focus = engine.playerShip.interpolatedPos(alpha);
        camera.x += (focus.x - camera.x) * (1 - Math.exp(-8 * dt));
        camera.y += (focus.y - camera.y) * (1 - Math.exp(-8 * dt));
        const frameContext = {
          visualTime: engine.combatTime,
          random,
          layers: LAYERS,
          damageEnabled: true,
        };
        renderer.updateVisual(engine, launched ? dt : 0, frameContext);
        renderer.render(engine, alpha, camera, zoom, frameContext);
        if (now - lastHUD > 100) {
          const p = engine.playerShip,
            e = engine.enemyShip;
          setHud({
            hp: p.hullHp,
            max: p.spec.hitpoints,
            enemy: e.hullHp,
            enemyMax: e.spec.hitpoints,
            flux: p.flux.totalFlux,
            capacity: p.flux.maxFlux,
            group: p.selectedGroupIndex + 1,
            tick: appliedTick,
            sim: latest?.simulationMs ?? 0,
            bytes,
            px: p.pos.x,
            py: p.pos.y,
          });
          lastHUD = now;
        }
        if (launched && receivedAt && now - receivedAt > 1200)
          setStatus("等待计算主机更新…");
        else if (launched && now - lastInput < 100) setStatus("战斗进行中");
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
        ready = false;
      }
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      stop();
      clearInterval(inputTimer);
      cancelAnimationFrame(frameId);
      unsubscribe();
      worker?.terminate();
      renderer?.dispose();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mouseup", mouseUp);
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [connection, match, seat, openMenu]);
  const returnToRoom = () => {
    if (!ended && !error)
      connection.send({
        type: "fail",
        matchId: match.id,
        reason: "玩家主动结束模拟",
      });
    stopRef.current();
    onReturn();
  };
  const finished = !!(error || ended);
  return (
    <main className="lan-battle">
      <canvas ref={canvasRef} className="lan-canvas" aria-label="局域网战场" />
      {hud && displayEngine && (
        <div
          className="lan-hud hud-overlay ui-font select-none"
          data-hud-density={density}
          data-combat-input-block
          inert={!!menu || finished}
          data-tick={hud.tick}
          data-player-x={hud.px.toFixed(2)}
          data-player-y={hud.py.toFixed(2)}
          data-hp={hud.hp.toFixed(1)}
          data-enemy-hp={hud.enemy.toFixed(1)}
          data-group={hud.group}
        >
          {displayEngine.capitalShips
            .filter((ship) => !ship.isDead)
            .map((ship) => (
              <FloatingShipHUD
                key={ship.id}
                ship={ship}
                isEnemy={ship.isPlayer !== displayEngine.playerShip.isPlayer}
                cameraPosRef={cameraRef}
                zoomRef={hudZoomRef}
                canvasRef={canvasRef}
              />
            ))}
          <div className="hud-console-anchor pointer-events-auto absolute z-20">
            <AuthenticTacticalConsole
              player={displayEngine.playerShip}
              engine={displayEngine}
              weaponControls={{
                onSelectGroup: (index) => actionRef.current("group", index),
                readOnlyFireModes: true,
              }}
            />
          </div>
          <div className="hud-radar-anchor pointer-events-none absolute z-20">
            <CombatRadar engine={displayEngine} />
          </div>
        </div>
      )}
      {!finished && (
        <div className="lan-battle-tools">
          <span>局域网对决 · {seat === 0 ? "主机" : "玩家"}</span>
          <NativeButton shortcut="Esc" onClick={() => openMenu("menu")}>
            菜单
          </NativeButton>
        </div>
      )}
      {!finished && status !== "战斗进行中" && (
        <NativeFrame className="lan-battle-status" surface="glass">
          <span role="status">{status}</span>
        </NativeFrame>
      )}
      {!finished && menu === "menu" && (
        <Modal
          title="联机菜单"
          eyebrow=""
          className="lan-combat-menu"
          onClose={closeMenu}
          initialFocus="panel"
        >
          <p className="lan-menu-note">
            战斗仍在继续。菜单只屏蔽你的操作，不会暂停对局。
          </p>
          <div className="combat-pause-layout">
            <section className="combat-pause-ship" aria-label="当前舰船">
              {displayEngine && (
                <>
                  <div className="combat-pause-ship-name">
                    <NativeBitmapText font="caption">
                      {displayEngine.playerShip.shipName}
                    </NativeBitmapText>
                  </div>
                  <div className="combat-pause-portrait">
                    <ShipStage spec={displayEngine.playerShip.spec} home />
                  </div>
                </>
              )}
            </section>
            <div className="combat-pause-actions">
              <NativeButton
                className="combat-pause-button"
                font="action"
                align="right"
                onClick={() => openMenu("help")}
              >
                操纵与联机说明
              </NativeButton>
              <div className="combat-pause-end-actions">
                <NativeButton
                  className="combat-pause-button"
                  font="action"
                  align="right"
                  onClick={() => openMenu("leave")}
                >
                  结束本局
                </NativeButton>
                <NativeButton
                  className="combat-pause-button"
                  font="action"
                  align="right"
                  onClick={closeMenu}
                >
                  返回游戏
                </NativeButton>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {!finished && menu === "help" && (
        <Modal
          title="操纵与联机说明"
          eyebrow=""
          onClose={closeMenu}
          footer={<NativeButton onClick={closeMenu}>返回游戏</NativeButton>}
        >
          <div className="lan-help">
            <dl className="lan-controls">
              <dt>
                <kbd>W / S</kbd>
              </dt>
              <dd>推进 / 倒车</dd>
              <dt>
                <kbd>A / D</kbd>
              </dt>
              <dd>转向</dd>
              <dt>
                <kbd>Q / E</kbd>
              </dt>
              <dd>侧向平移</dd>
              <dt>
                <kbd>Shift</kbd>
              </dt>
              <dd>鼠标转向</dd>
              <dt>
                <kbd>X</kbd>
              </dt>
              <dd>制动</dd>
              <dt>
                <kbd>鼠标左键 / 右键</kbd>
              </dt>
              <dd>开火 / 护盾</dd>
              <dt>
                <kbd>V / F</kbd>
              </dt>
              <dd>排能 / 舰船系统</dd>
              <dt>
                <kbd>1–7</kbd>
              </dt>
              <dd>选择武器组（也可点击控制台）</dd>
              <dt>
                <kbd>滚轮</kbd>
              </dt>
              <dd>缩放战场</dd>
              <dt>
                <kbd>Esc / 空格</kbd>
              </dt>
              <dd>联机菜单，不暂停对局</dd>
              <dt>
                <kbd>H</kbd>
              </dt>
              <dd>操纵说明</dd>
            </dl>
            <p className="lan-menu-note">
              联机使用预设射击模式和自动开火状态；这些按钮仅显示状态。任何玩家退出或断线都会结束本局。
            </p>
            <details>
              <summary>网络诊断</summary>
              {hud && (
                <p>
                  模拟步 {hud.tick} · 主机模拟 {hud.sim.toFixed(2)} ms/步 ·
                  完整快照约 {(hud.bytes / 1024).toFixed(1)} KB
                </p>
              )}
              <p>主机计算战斗，服务器转发状态。当前未启用本地预测。</p>
            </details>
          </div>
        </Modal>
      )}
      {!finished && menu === "leave" && (
        <Modal
          title="结束本局？"
          eyebrow=""
          width="small"
          onClose={() => openMenu("menu")}
          initialFocus="panel"
          footer={
            <>
              <NativeButton onClick={() => openMenu("menu")}>取消</NativeButton>
              <NativeButton onClick={returnToRoom}>结束并返回房间</NativeButton>
            </>
          }
        >
          <p className="lan-menu-note">
            这会结束双方的战斗。房间保留，可以重新准备后再开一局。
          </p>
        </Modal>
      )}
      {finished && (
        <Modal
          title={error ? "联机已停止" : ended}
          eyebrow=""
          width="small"
          initialFocus="panel"
          role="alertdialog"
          footer={<NativeButton onClick={returnToRoom}>返回房间</NativeButton>}
        >
          {error ? (
            <p className="lan-error">{error}</p>
          ) : (
            <p>本局已结束。返回房间后可重新选择舰船、准备对局。</p>
          )}
          {hud && (
            <div className="lan-result-summary">
              <p>
                己方舰体
                <br />
                <strong>
                  {Math.max(0, Math.round(hud.hp))} / {hud.max}
                </strong>
              </p>
              <p>
                敌方舰体
                <br />
                <strong>
                  {Math.max(0, Math.round(hud.enemy))} / {hud.enemyMax}
                </strong>
              </p>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
