import React, { useMemo, useState } from 'react';
import type { CombatSession } from '../engine/runtime/CombatSession';

export interface VisualLabScene {
  id: string;
  title: string;
  ship: string;
  focus: string;
}

const VISUAL_LAB_SCENES: VisualLabScene[] = [
  { id: 'VIS-01', title: 'Onslaught hull / hardpoints', ship: 'onslaught', focus: 'hull' },
  { id: 'VIS-02', title: 'Onslaught engine plume', ship: 'onslaught', focus: 'engine' },
  { id: 'VIS-03', title: 'Onslaught shield', ship: 'onslaught', focus: 'shield' },
  { id: 'VIS-04', title: 'TPC charge / muzzle / projectile', ship: 'onslaught', focus: 'weapon' },
  { id: 'VIS-05', title: 'Ballistic weapon family', ship: 'onslaught', focus: 'weapon' },
  { id: 'VIS-06', title: 'Paragon beams', ship: 'paragon', focus: 'beam' },
  { id: 'VIS-07', title: 'Paragon fortress shield', ship: 'paragon', focus: 'shield' },
  { id: 'VIS-08', title: 'Doom phase cloak', ship: 'doom', focus: 'hull' },
  { id: 'VIS-09', title: 'Missiles / contrails', ship: 'onslaught', focus: 'trail' },
  { id: 'VIS-10', title: 'Impact / vent / explosion', ship: 'onslaught', focus: 'explosion' },
  { id: 'VIS-11', title: 'Broadsword / Dagger wings', ship: 'onslaught', focus: 'fighter' },
  { id: 'VIS-12', title: 'Full layer integration', ship: 'onslaught', focus: 'all' }
];

interface Props {
  session: CombatSession;
  isAutopilot: boolean;
  setIsAutopilot: React.Dispatch<React.SetStateAction<boolean>>;
  onShipChange: (shipId: string) => void;
  onZoomChange: (zoom: number) => void;
  onCameraLockChange: (enabled: boolean) => void;
  onDamageChange: (enabled: boolean) => void;
  onMotionChange: (enabled: boolean) => void;
  onLayerChange: (layer: string, enabled: boolean) => void;
  onRefresh: () => void;
}

const LAYERS = ['background', 'nebula', 'trail', 'hull', 'weapon', 'beam', 'shield', 'explosion'];

export const VisualLabPanel: React.FC<Props> = ({
  session,
  isAutopilot,
  setIsAutopilot,
  onShipChange,
  onZoomChange,
  onCameraLockChange,
  onDamageChange,
  onMotionChange,
  onLayerChange,
  onRefresh
}) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initial = VISUAL_LAB_SCENES.find((scene) => scene.id === params.get('scene')) ?? VISUAL_LAB_SCENES[0];
  const [sceneId, setSceneId] = useState(initial.id);
  const [seed, setSeed] = useState(() => Number(params.get('seed') ?? 1337) || 1337);
  const [seek, setSeek] = useState(0);
  const [zoom, setZoom] = useState(0.65);
  const [, force] = useState(0);

  const refresh = () => { force((v) => v + 1); onRefresh(); };
  const perf = session.performance.snapshot;
  const applyScene = (id: string) => {
    const scene = VISUAL_LAB_SCENES.find((item) => item.id === id) ?? VISUAL_LAB_SCENES[0];
    setSceneId(scene.id);
    onShipChange(scene.ship);
    session.setSeed(seed);
    session.visualClock.seek(0);
    setSeek(0);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'visual-lab');
    url.searchParams.set('scene', scene.id);
    history.replaceState(null, '', url);
    refresh();
  };

  return (
    <aside className="absolute top-3 left-3 z-[80] w-[360px] max-h-[94vh] overflow-auto rounded border border-cyan-400/50 bg-slate-950/95 p-3 font-mono text-[11px] text-slate-200 shadow-2xl pointer-events-auto">
      <div className="mb-2 flex items-center justify-between"><strong className="text-cyan-300">Visual Lab · deterministic capture</strong><span>{session.visualClock.time.toFixed(3)}s</span></div>
      <select className="w-full bg-slate-900 border border-slate-700 p-1" value={sceneId} onChange={(e) => applyScene(e.target.value)}>
        {VISUAL_LAB_SCENES.map((scene) => <option key={scene.id} value={scene.id}>{scene.id} · {scene.title}</option>)}
      </select>
      <div className="mt-2 flex flex-wrap gap-1">
        <button className="bg-slate-800 px-2 py-1" onClick={() => { session.start(); refresh(); }}>Play</button>
        <button className="bg-slate-800 px-2 py-1" onClick={() => { session.pause(); refresh(); }}>Pause</button>
        <button className="bg-slate-800 px-2 py-1" onClick={() => { session.restart(); session.pause(); refresh(); }}>Replay</button>
        <button className="bg-slate-800 px-2 py-1" onClick={() => { session.pause(); session.step(); refresh(); }}>Step</button>
      </div>
      <label className="mt-2 block">Seek <input className="ml-2 w-24 bg-slate-900" type="number" min="0" step="0.1" value={seek} onChange={(e) => { const value = Math.max(0, Number(e.target.value) || 0); setSeek(value); session.visualClock.seek(value); refresh(); }} /></label>
      <label className="mt-1 block">Seed <input className="ml-2 w-24 bg-slate-900" type="number" value={seed} onChange={(e) => { const value = Number(e.target.value) || 0; setSeed(value); session.setSeed(value); refresh(); }} /></label>
      <label className="mt-1 block">Zoom {zoom.toFixed(2)} <input className="ml-2 w-40" type="range" min="0.3" max="1.5" step="0.05" value={zoom} onChange={(e) => { const value = Number(e.target.value); setZoom(value); onZoomChange(value); refresh(); }} /></label>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <label><input type="checkbox" checked={session.visualOptions.cameraLocked} onChange={(e) => { onCameraLockChange(e.target.checked); refresh(); }} /> camera lock</label>
        <label><input type="checkbox" checked={isAutopilot} onChange={(e) => setIsAutopilot(e.target.checked)} /> AI</label>
        <label><input type="checkbox" checked={session.visualOptions.damage} onChange={(e) => { onDamageChange(e.target.checked); refresh(); }} /> damage</label>
        <label><input type="checkbox" checked={session.visualOptions.motion} onChange={(e) => { onMotionChange(e.target.checked); refresh(); }} /> motion</label>
      </div>
      <div className="mt-2 border-t border-slate-700 pt-2">Layers</div>
      <div className="grid grid-cols-2 gap-1">{LAYERS.map((layer) => <label key={layer}><input type="checkbox" checked={session.visualOptions.layers.has(layer)} onChange={(e) => { onLayerChange(layer, e.target.checked); refresh(); }} /> {layer}</label>)}</div>
      <div className="mt-2 border-t border-slate-700 pt-2 text-[10px] text-slate-400">
        <div>sim {perf.simulationMs.toFixed(2)} ms · visual {perf.visualUpdateMs.toFixed(3)} ms</div>
        <div>prep {perf.renderPreparationMs.toFixed(3)} ms · submit {perf.drawSubmitMs.toFixed(2)} ms</div>
        <div>GPU {perf.gpuTimerAvailable && perf.gpuTimeMs != null ? `${perf.gpuTimeMs.toFixed(2)} ms` : 'timer unavailable'}</div>
        <div>draws {perf.drawCalls} · tex {perf.textureCount} · proj {perf.projectileCount} · particles {perf.particleCount}</div>
        <div>resource recreations {perf.resourceRecreations}{perf.memoryBytes != null ? ` · heap ${(perf.memoryBytes / 1048576).toFixed(1)} MiB` : ''}</div>
      </div>
    </aside>
  );
};
