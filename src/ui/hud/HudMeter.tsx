import { forwardRef, useEffect, useRef, type CSSProperties } from 'react';

const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** renderers/A/I: solid fill, end cap, and two 3x1 hard-flux ticks. No frame/background. */
export const HudMeter = forwardRef<HTMLSpanElement, {
  value: number;
  minimum?: number;
  width?: number;
  height?: number;
  label: string;
  readFlash?: () => number;
}>(function HudMeter({ value, minimum, width = 80, height = 7, label, readFlash }, ref) {
  const inkRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const ink = inkRef.current;
    if (!readFlash || !ink) return;
    let frame = 0;
    let previous = -1;
    const update = () => {
      const brightness = clamp(readFlash());
      if (brightness !== previous) {
        // Source additive white over the opaque textFriendColor fill. Hard-flux
        // ticks are outside this wrapper and retain their affiliation color.
        ink.style.color = brightness ? `rgb(${Math.min(255, 155 + brightness * 255)} 255 ${brightness * 255})` : '';
        previous = brightness;
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => { cancelAnimationFrame(frame); ink.style.color = ''; };
  }, [readFlash]);
  return (
    <span ref={ref} className="hud-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamp(value) * 100)}
      style={{ width, height, '--meter-fill': `${(width - 1) * clamp(value)}px`, '--meter-minimum': `${Math.max(0, width * clamp(minimum ?? 0) - 3)}px` } as CSSProperties}>
      <span ref={inkRef} className="hud-meter-ink"><span className="hud-meter-fill" /><span className="hud-meter-cap" /></span>
      {minimum !== undefined && <span className="hud-meter-minimum" />}
    </span>
  );
});
