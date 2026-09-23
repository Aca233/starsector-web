import { useEffect, useRef, useState } from 'react';
import type { BodyView } from './Protocol';
import { BodyRenderer, type BodyDrawSpec } from './BodyRenderer';
import { createOriginalBodyVisuals } from '../content/OriginalBodyVisuals.mjs';
import reference from '../data/reference-body-visuals.json';
const visuals = createOriginalBodyVisuals(reference);
interface Props { bodies: BodyView[]; center: [number, number]; zoom: number; gameSeconds: number; running: boolean; worldId: string }
/** Rendering adapters are separate from the authoritative world and its mechanics providers. */
export function CampaignBodies(props: Props) {
  const main = useRef<HTMLCanvasElement>(null), glow = useRef<HTMLCanvasElement>(null), current = useRef(props);
  const [error, setError] = useState('');
  useEffect(() => { current.current = props; }, [props]);
  useEffect(() => {
    const canvas = main.current, glowCanvas = glow.current;
    if (!canvas || !glowCanvas) return;
    let renderer: BodyRenderer | undefined, additive: BodyRenderer | undefined;
    let stopped = false, suspended = false, raf = 0, signature = '', world = '', lastSeconds = -1, observed = performance.now(), generation = 0;
    let ready: { body: BodyView; visual: BodyDrawSpec }[] = [];
    const reset = () => {
      generation++; signature = ''; ready = [];
      canvas.dataset.ready = 'false'; canvas.dataset.bodyCount = '0';
      renderer?.dispose(); additive?.dispose(); renderer = additive = undefined;
    };
    const initialize = () => {
      reset();
      try {
        renderer = new BodyRenderer(canvas); additive = new BodyRenderer(glowCanvas);
        suspended = false;
        return true;
      } catch {
        reset(); suspended = true;
        setError('天体绘制需要 WebGL2，当前不可用。');
        return false;
      }
    };
    const frame = () => {
      if (stopped || suspended || !renderer || !additive) return;
      const p = current.current;
      const next = JSON.stringify([p.worldId, p.bodies.map(b => [b.id, b.presentation, b.surfacePhase, b.cloudPhase])]);
      if (next !== signature) {
        signature = next; const ticket = ++generation; ready = [];
        canvas.dataset.ready = 'false';
        try {
          const rows = p.bodies.map(body => {
            const visual = visuals.resolve(body.presentation);
            if (!visual) throw Error('未知天体绘制配置：' + body.presentation.nativeType);
            if (visual.kind === 'planet' && (body.surfacePhase === null || body.cloudPhase === null)) throw Error('存档缺少天体初始相位');
            return { body, visual };
          });
          const paths = rows.flatMap(({ visual }) => visual.kind === 'planet' ? [visual.texture, visual.cloudTexture, visual.glowTexture, visual.coronaTexture, 'graphics/planets/atmosphere2.png'] : [visual.sprite]).filter((s): s is string => s !== null);
          void Promise.all([renderer.load(paths), additive.load(paths)]).then(() => {
            if (stopped || ticket !== generation) return; ready = rows; setError(''); canvas.dataset.ready = 'true';
          }).catch(() => { if (!stopped && ticket === generation) setError('原版天体贴图加载失败；未使用替代贴图。'); });
        } catch (e) { setError(e instanceof Error ? e.message : '天体配置不可用'); }
      }
      if (world !== p.worldId || lastSeconds !== p.gameSeconds) { world = p.worldId; lastSeconds = p.gameSeconds; observed = performance.now(); }
      const seconds = p.gameSeconds + (p.running ? Math.min(.35, (performance.now() - observed) / 1000) : 0);
      renderer.begin(); additive.begin();
      const byId = new Map(p.bodies.map(b => [b.id, b]));
      for (const row of ready) {
        const body = byId.get(row.body.id); if (!body) continue;
        renderer.draw(body, row.visual, p.bodies, p.center, p.zoom, seconds);
        additive.draw(body, row.visual, p.bodies, p.center, p.zoom, seconds, true);
      }
      canvas.dataset.bodyCount = String(ready.length);
      raf = requestAnimationFrame(frame);
    };
    const onLost = (event: Event) => {
      event.preventDefault(); suspended = true; cancelAnimationFrame(raf); reset();
      setError('天体绘制上下文丢失，等待显卡恢复；世界状态未改变。');
    };
    const onRestored = () => {
      if (stopped || [canvas, glowCanvas].some(c => c.getContext('webgl2')?.isContextLost())) return;
      cancelAnimationFrame(raf);
      if (initialize()) raf = requestAnimationFrame(frame);
    };
    for (const c of [canvas, glowCanvas]) { c.addEventListener('webglcontextlost', onLost); c.addEventListener('webglcontextrestored', onRestored); }
    // Deferred initialization also lets React's development StrictMode cleanup run first.
    raf = requestAnimationFrame(() => { if (!stopped && initialize()) frame(); });
    return () => {
      stopped = true; cancelAnimationFrame(raf);
      for (const c of [canvas, glowCanvas]) { c.removeEventListener('webglcontextlost', onLost); c.removeEventListener('webglcontextrestored', onRestored); }
      reset();
    };
  }, []);
  return <><canvas ref={main} className="campaign-bodies" aria-hidden="true" /><canvas ref={glow} className="campaign-body-glow" aria-hidden="true" />{error && <span role="alert" className="campaign-effects-error">{error}</span>}</>;
}
