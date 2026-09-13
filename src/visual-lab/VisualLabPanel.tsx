import React, { useEffect, useMemo, useState } from 'react';
import type { CombatSession } from '../engine/runtime/CombatSession';
import { VISUAL_SCENARIOS, type VisualScenarioController } from './VisualScenarioController';
import { HudGlyphSample } from '../ui/hud/HudGlyphSample';

interface Props {
  session: CombatSession;
  controller: VisualScenarioController;
  assetsReady: boolean;
  assetsError: string | null;
  isAutopilot: boolean;
  setIsAutopilot: React.Dispatch<React.SetStateAction<boolean>>;
  onZoomChange: (zoom: number) => void;
  onCameraLockChange: (enabled: boolean) => void;
  onDamageChange: (enabled: boolean) => void;
  onMotionChange: (enabled: boolean) => void;
  onLayerChange: (layer: string, enabled: boolean) => void;
  onRefresh: () => void;
}

const LAYERS = ['background', 'nebula', 'trail', 'hull', 'weapon', 'beam', 'shield', 'explosion', 'markers'];

export const VisualLabPanel: React.FC<Props> = ({
  session,
  controller,
  assetsReady,
  assetsError,
  isAutopilot,
  setIsAutopilot,
  onZoomChange,
  onCameraLockChange,
  onDamageChange,
  onMotionChange,
  onLayerChange,
  onRefresh
}) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initial = useMemo(() => VISUAL_SCENARIOS.find((scene) => scene.id === params.get('scene')) ?? VISUAL_SCENARIOS[0], [params]);
  const initialSeed = useMemo(() => Number(params.get('seed') ?? 1337) || 1337, [params]);
  const initialTime = useMemo(() => Math.max(0, Number(params.get('t') ?? 0) || 0), [params]);
  const initialPreviewShip = useMemo(() => {
    const value = params.get('profileShip');
    return value === 'onslaught' || value === 'paragon' || value === 'doom' ? value : '';
  }, [params]);
  const [sceneId, setSceneId] = useState(initial.id);
  const [seed, setSeed] = useState(initialSeed);
  const [previewShip, setPreviewShip] = useState(initialPreviewShip);
  const [zoom, setZoom] = useState(0.65);
  const [, force] = useState(0);

  useEffect(() => {
    controller.setPreviewShip(initialPreviewShip || null);
    controller.select(initial.id, initialSeed);
    if (initialTime > 0) controller.seek(initialTime);
  }, [controller, initial.id, initialSeed, initialPreviewShip, initialTime]);

  const refresh = () => {
    force((value) => value + 1);
    onRefresh();
  };

  const applyScene = (id: string) => {
    const scene = VISUAL_SCENARIOS.find((item) => item.id === id) ?? VISUAL_SCENARIOS[0];
    setSceneId(scene.id);
    controller.select(scene.id, seed);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'visual-lab');
    url.searchParams.set('scene', scene.id);
    url.searchParams.set('seed', String(seed));
    history.replaceState(null, '', url);
    refresh();
  };

  const applyPreviewShip = (shipId: string) => {
    setPreviewShip(shipId);
    controller.setPreviewShip(shipId || null);
    const url = new URL(window.location.href);
    if (shipId) url.searchParams.set('profileShip', shipId);
    else url.searchParams.delete('profileShip');
    history.replaceState(null, '', url);
    refresh();
  };

  const seekTo = (time: number) => {
    controller.seek(time);
    const url = new URL(window.location.href);
    url.searchParams.set('t', time.toFixed(2));
    history.replaceState(null, '', url);
    refresh();
  };

  const activeScene = VISUAL_SCENARIOS.find((scene) => scene.id === sceneId) ?? VISUAL_SCENARIOS[0];
  const perf = session.performance.snapshot;

  return (
    <aside className="absolute top-3 left-3 z-[80] w-[390px] max-h-[94vh] overflow-auto rounded border border-cyan-400/50 bg-slate-950/95 p-3 font-mono text-[11px] text-slate-200 shadow-2xl pointer-events-auto">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-cyan-300">Visual Lab · M3 fidelity scenes</strong>
        <span>{controller.time.toFixed(3)} / {activeScene.duration.toFixed(1)}s</span>
      </div>

      <select className="w-full bg-slate-900 border border-slate-700 p-1" value={sceneId} onChange={(event) => applyScene(event.target.value)}>
        {VISUAL_SCENARIOS.map((scene) => <option key={scene.id} value={scene.id}>{scene.id} · {scene.title}</option>)}
      </select>
      <div className="mt-1 min-h-8 text-[10px] leading-4 text-slate-400">{activeScene.description}</div>
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        <span className="text-slate-400">Hull profile</span>
        <select className="bg-slate-900 border border-slate-700 px-1 py-0.5" value={previewShip} onChange={(event) => applyPreviewShip(event.target.value)}>
          <option value="">scene default ({activeScene.shipId})</option>
          <option value="onslaught">Onslaught · low-tech</option>
          <option value="paragon">Paragon · high-tech</option>
          <option value="doom">Doom · phase/high-tech</option>
        </select>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
        <span>capture @</span>
        {activeScene.checkpoints.map((time) => (
          <button key={time} className="rounded border border-slate-700 bg-slate-900 px-1 text-cyan-200" onClick={() => seekTo(time)}>
            {time.toFixed(2)}s
          </button>
        ))}
      </div>
      {sceneId === 'VIS-11' && (
        <div className="mt-1 border-t border-slate-700 pt-1">
          <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">HUD glyph comparison strip</div>
          <HudGlyphSample />
        </div>
      )}
      {!assetsReady && !assetsError && <div className="mt-1 text-amber-300">preparing required textures…</div>}
      {assetsError && <div className="mt-1 text-red-300">asset error: {assetsError}</div>}

      <div className="mt-2 flex flex-wrap gap-1">
        <button disabled={!assetsReady} className="bg-slate-800 px-2 py-1 disabled:opacity-40" onClick={() => { controller.play(); refresh(); }}>Play</button>
        <button className="bg-slate-800 px-2 py-1" onClick={() => { controller.pause(); refresh(); }}>Pause</button>
        <button className="bg-slate-800 px-2 py-1" onClick={() => { controller.replay(); refresh(); }}>Replay</button>
        <button disabled={!assetsReady} className="bg-slate-800 px-2 py-1 disabled:opacity-40" onClick={() => { controller.step(); refresh(); }}>Step 1/60</button>
      </div>

      <label className="mt-2 block">
        Seek {controller.time.toFixed(2)}s
        <input
          className="ml-2 w-48 align-middle"
          type="range"
          min="0"
          max={activeScene.duration}
          step="0.0166667"
          value={Math.min(controller.time, activeScene.duration)}
          onChange={(event) => { controller.seek(Number(event.target.value)); refresh(); }}
        />
      </label>
      <label className="mt-1 block">
        Seed
        <input
          className="ml-2 w-24 bg-slate-900"
          type="number"
          value={seed}
          onChange={(event) => {
            const value = Number(event.target.value) || 0;
            setSeed(value);
            controller.setSeed(value);
            const url = new URL(window.location.href);
            url.searchParams.set('seed', String(value));
            history.replaceState(null, '', url);
            refresh();
          }}
        />
      </label>
      <label className="mt-1 block">
        Zoom {zoom.toFixed(2)}
        <input
          className="ml-2 w-40"
          type="range"
          min="0.3"
          max="1.5"
          step="0.05"
          value={zoom}
          onChange={(event) => {
            const value = Number(event.target.value);
            setZoom(value);
            onZoomChange(value);
            refresh();
          }}
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-1">
        <label><input type="checkbox" checked={session.visualOptions.cameraLocked} onChange={(event) => { onCameraLockChange(event.target.checked); refresh(); }} /> camera lock</label>
        <label title="启用后暂时让实时 AI/战斗接管；关闭后重建当前受控场景时间点"><input type="checkbox" checked={isAutopilot} onChange={(event) => { const enabled = event.target.checked; setIsAutopilot(enabled); if (!enabled) controller.seek(controller.time); refresh(); }} /> AI live</label>
        <label><input type="checkbox" checked={session.visualOptions.damage} onChange={(event) => { onDamageChange(event.target.checked); refresh(); }} /> damage</label>
        <label><input type="checkbox" checked={session.state === 'running'} onChange={(event) => { onMotionChange(event.target.checked); refresh(); }} /> motion</label>
      </div>

      <div className="mt-2 border-t border-slate-700 pt-2">Layers</div>
      <div className="grid grid-cols-2 gap-1">
        {LAYERS.map((layer) => (
          <label key={layer}><input type="checkbox" checked={session.visualOptions.layers.has(layer)} onChange={(event) => { onLayerChange(layer, event.target.checked); refresh(); }} /> {layer}</label>
        ))}
      </div>

      <div className="mt-2 border-t border-slate-700 pt-2 text-[10px] text-slate-400">
        <div>sim {perf.simulationMs.toFixed(2)} ms · visual {perf.visualUpdateMs.toFixed(3)} ms</div>
        <div>prep {perf.renderPreparationMs.toFixed(3)} ms · submit {perf.drawSubmitMs.toFixed(2)} ms</div>
        <div>GPU {perf.gpuTimerAvailable && perf.gpuTimeMs != null ? `${perf.gpuTimeMs.toFixed(2)} ms` : 'timer unavailable'}</div>
        <div>draws {perf.drawCalls} · tex {perf.textureCount} · proj {perf.projectileCount} · particles {perf.particleCount}</div>
        <div>backlog {(session.scheduler.backlogSeconds * 1000).toFixed(1)} ms · dropped {session.scheduler.droppedSimulationSeconds.toFixed(4)} s</div>
        <div>resource recreations {perf.resourceRecreations}{perf.memoryBytes != null ? ` · heap ${(perf.memoryBytes / 1048576).toFixed(1)} MiB` : ''}</div>
      </div>
    </aside>
  );
};
