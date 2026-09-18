import { useLayoutEffect, useState } from 'react';
import { ExitContext, UI_EXIT_MS, useMotionExiting } from './motion-state';
import type { ReactElement } from 'react';

/** Keep only the last dialog tree during exit, not a cloned/inaccessible DOM snapshot.
 * Callers commit actions immediately; Modal blocks interaction until unmount.
 * This boundary is for dialogs, never the simulation or an entire routed screen.
 */
export function MotionPresence({ children }: { children: ReactElement | null | false | undefined }) {
  const [retained, setRetained] = useState(children || null);
  const ancestorExiting = useMotionExiting();
  // Capture current props during render so a close in the same commit cannot retain
  // an older ship/confirmation. React retries before committing this component.
  if (children && children !== retained) setRetained(children);
  const exiting = !children && !!retained;
  useLayoutEffect(() => {
    if (!exiting) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => setRetained(null);
    if (media.matches) { finish(); return; }
    const timer = window.setTimeout(finish, UI_EXIT_MS);
    const preferenceChanged = () => { if (media.matches) finish(); };
    media.addEventListener('change', preferenceChanged);
    return () => { window.clearTimeout(timer); media.removeEventListener('change', preferenceChanged); };
  }, [exiting]);
  return <ExitContext.Provider value={ancestorExiting || exiting}>{children || retained}</ExitContext.Provider>;
}
