import { useCallback, useEffect, type HTMLAttributes } from 'react';
import { useDwellHover } from '../../studio/useDwellHover';

/** The selector is an enterable parent, never a permanently pinned window. */
export function useDeploymentPicker(isCodexOpen: boolean, onClear: () => void, enabled = true) {
  const dwell = useDwellHover({ depth: -1, enabled: enabled && !isCodexOpen });
  const { active, hide, show, tooltipId } = dwell;
  const picker = active ? { id: active.id, element: active.anchor as HTMLButtonElement } : null;
  const closePicker = useCallback(() => { hide(); onClear(); }, [hide, onClear]);
  useEffect(() => { if (!active) onClear(); }, [active, onClear]);
  const openPicker = (id: string, element: HTMLButtonElement, immediate: boolean, inspect: () => void) => {
    if (!enabled || isCodexOpen) return;
    show(id, element, immediate); inspect();
  };
  const hullButtonProps = (id: string, inspect: () => void): HTMLAttributes<HTMLButtonElement> => ({
    'aria-expanded': active?.id === id,
    'aria-controls': active?.id === id ? tooltipId : undefined,
    onMouseEnter: event => openPicker(id, event.currentTarget, false, inspect), onMouseLeave: dwell.leave,
    onFocus: event => { if (event.currentTarget.matches(':focus-visible')) openPicker(id, event.currentTarget, true, inspect); },
    onBlur: dwell.leave,
    onClick: event => openPicker(id, event.currentTarget, true, inspect),
    onKeyDownCapture: event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault(); const element = event.currentTarget; openPicker(id, element, true, inspect);
      requestAnimationFrame(() => { if (document.activeElement === element) document.getElementById(tooltipId)?.querySelector<HTMLButtonElement>('.sim-loadout-option:not(:disabled)')?.focus(); });
    },
  });
  const dismissPicker = () => {
    if (!picker) return false;
    const element = picker.element; closePicker(); element.focus({ preventScroll: true }); closePicker(); return true;
  };
  return { picker, dwell, closePicker, dismissPicker, hullButtonProps, onRosterScroll: closePicker, cancelClose: dwell.keep, leavePicker: dwell.leave };
}
