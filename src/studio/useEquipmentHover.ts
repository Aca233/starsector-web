import { useCallback, useEffect, useId, useRef, useState } from 'react';
/** Shared hover/focus lifetime, including the short trip from a row into its card. */
export function useEquipmentHover() {
  const tooltipId = useId();
  const [active, setActive] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keep = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const hide = useCallback(() => { keep(); setActive(null); }, [keep]);
  const leave = useCallback(() => { keep(); timer.current = setTimeout(() => setActive(null), 140); }, [keep]);
  const show = useCallback((id: string, anchor: HTMLElement) => { keep(); setActive({ id, anchor }); }, [keep]);
  useEffect(() => () => keep(), [keep]);
  useEffect(() => {
    if (!active) return;
    const scroll = (e: Event) => { if (!(e.target instanceof Element) || !e.target.closest('[data-equipment-tooltip]')) hide(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', hide); window.addEventListener('blur', hide); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', hide); window.removeEventListener('blur', hide); window.removeEventListener('keydown', key); };
  }, [active, hide]);
  const bind = (id: string) => ({
    'aria-describedby': active?.id === id ? tooltipId : undefined,
    onMouseEnter: (e: { currentTarget: HTMLElement }) => show(id, e.currentTarget),
    onMouseLeave: leave,
    onFocus: (e: { currentTarget: HTMLElement }) => show(id, e.currentTarget),
    onBlur: leave,
  });
  return { active, tooltipId, bind, hide, keep, leave };
}
export type EquipmentHover = ReturnType<typeof useEquipmentHover>;

