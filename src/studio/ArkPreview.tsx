import { useEffect, useRef, type CSSProperties } from 'react';
import { arkArt, type arkStaticDraws } from '../engine/visual/AdunArkArt';
import { ADUN_ARK_ART } from '../engine/content/AdunArkIds';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';

// Texture sampling is independent of authored mount/world coordinates.
const textureScale = 'textureScale' in arkArt ? Number(arkArt.textureScale) : 1;

type Draws = NonNullable<ReturnType<typeof arkStaticDraws>>;
interface Props {
  draws: Draws;
  minX: number;
  minY: number;
  stageWidth: number;
  stageHeight: number;
  animate: boolean;
}

/** Bitmap-only preview: atomically composite the same depth stack as combat.
 * Its clock never rerenders weapon mounts, selection, or the refit screen. */
export function ArkPreview({draws, minX, minY, stageWidth, stageHeight, animate}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stillRef = useRef<HTMLSpanElement>(null);
  const ownerKey = [...new Set(draws.map(draw => draw.owner))].sort().join(',');
  useEffect(() => {
    const canvas = canvasRef.current, still = stillRef.current;
    if (!animate || !canvas || !still) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const owners = new Set(ownerKey.split(','));
    const frames = arkArt.frames.map(frame => frame.filter(draw => owners.has(draw.owner)));
    const images = new Map<string, Promise<HTMLImageElement>>();
    let stopped = false, failed = false, pending = false, request = 0;
    let elapsed = 0, lastTime: number | undefined, displayedFrame = -1;
    still.style.visibility = 'visible';
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.animationState = 'loading';
    const load = (file: string) => {
      let image = images.get(file);
      if (!image) {
        const element = new Image();
        element.src = runtimeAssetUrl(ADUN_ARK_ART + file);
        image = element.decode().then(() => element);
        images.set(file, image);
      }
      return image;
    };
    const schedule = () => {
      if (!stopped && !failed && !document.hidden) request = requestAnimationFrame(tick);
    };
    const tick = (now: number) => {
      if (stopped || failed || document.hidden) return;
      if (lastTime !== undefined) elapsed += (now - lastTime) / 1000;
      lastTime = now;
      const frame = Math.floor(elapsed % arkArt.cycleSeconds / arkArt.cycleSeconds * frames.length);
      if (frame === displayedFrame) { schedule(); return; }
      pending = true;
      const current = frames[frame];
      // Only decode the current frame and two lookahead frames, not 417 assets at once.
      const ready = Promise.all(current.map(draw => load(draw.file)));
      for (let ahead = 1; ahead <= 2; ahead++) {
        for (const draw of frames[(frame + ahead) % frames.length]) void load(draw.file).catch(() => {});
      }
      void ready.then(loaded => {
        if (stopped || document.hidden) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        current.forEach((draw, index) => context.drawImage(loaded[index], draw.box[0] * textureScale, draw.box[1] * textureScale, draw.size[0] * textureScale, draw.size[1] * textureScale));
        still.style.visibility = 'hidden';
        displayedFrame = frame;
        canvas.dataset.frame = String(frame);
        canvas.dataset.animationState = 'playing';
      }).catch(() => {
        if (stopped) return;
        // Retain the last complete authored frame rather than flashing incomplete layers.
        failed = true;
        canvas.dataset.animationState = 'asset-error';
        canvas.title = '舰体动画资源加载失败，保留完整静帧；请刷新重试。';
      }).finally(() => { pending = false; schedule(); });
    };
    const visibility = () => {
      cancelAnimationFrame(request);
      lastTime = undefined;
      if (document.hidden) canvas.dataset.animationState = 'paused';
      else if (!pending) schedule();
    };
    document.addEventListener('visibilitychange', visibility);
    schedule();
    return () => {
      stopped = true;
      cancelAnimationFrame(request);
      document.removeEventListener('visibilitychange', visibility);
      images.clear();
      still.style.visibility = 'visible';
    };
  }, [animate, ownerKey]);

  const placement = (x: number, y: number, width: number, height: number): CSSProperties => ({
    position: 'absolute', pointerEvents: 'none', maxWidth: 'none',
    left: ((x - arkArt.parts.CORE.anchor[0]) * arkArt.scale - minX) / stageWidth * 100 + '%',
    top: ((y - arkArt.parts.CORE.anchor[1]) * arkArt.scale - minY) / stageHeight * 100 + '%',
    width: width * arkArt.scale / stageWidth * 100 + '%',
    height: height * arkArt.scale / stageHeight * 100 + '%',
  });
  return <>
    <span ref={stillRef} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}} aria-hidden="true">
      {draws.map((draw, index) => <img key={index} className="studio-ark-layer" src={runtimeAssetUrl(ADUN_ARK_ART + draw.file)}
        alt="" draggable={false} style={placement(draw.box[0], draw.box[1], draw.size[0], draw.size[1])} />)}
    </span>
    {animate && <canvas ref={canvasRef} className="studio-ark-animation" width={arkArt.canvas[0] * textureScale} height={arkArt.canvas[1] * textureScale}
      style={placement(0, 0, arkArt.canvas[0], arkArt.canvas[1])} role="img" aria-label="亚顿之矛舰体动画：中央环纵轴旋转" />}
  </>;
}
