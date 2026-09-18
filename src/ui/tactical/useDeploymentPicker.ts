import { useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { DWELL_SHOW_MS } from '../../studio/useDwellHover';

export interface DeploymentAnchor<T> { hull: T; element: HTMLButtonElement; pinned: boolean }
/** One hover/pin/reader lifecycle for simulator and persistent fleet deployment. */
export function useDeploymentPicker<T>(isCodexOpen: boolean, onClear: () => void) {
  const [picker, setPicker] = useState<DeploymentAnchor<T> | null>(null);
  const pinned = useRef(false), inspectionLocked = useRef(false), codexOpen = useRef(isCodexOpen);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSwitch = useCallback(() => { if (switchTimer.current !== null) { clearTimeout(switchTimer.current); switchTimer.current = null; } }, []);
  const cancelClose = useCallback(() => { if (closeTimer.current !== null) { clearTimeout(closeTimer.current); closeTimer.current = null; } }, []);
  const closePicker = useCallback(() => {
    cancelSwitch(); cancelClose(); pinned.current = false; inspectionLocked.current = false; setPicker(null); onClear();
  }, [cancelClose, cancelSwitch, onClear]);
  const leavePicker = useCallback(() => {
    cancelClose();
    if (pinned.current || inspectionLocked.current || codexOpen.current) return;
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && !inspectionLocked.current && !codexOpen.current) { setPicker(null); onClear(); }
    }, 350);
  }, [cancelClose, onClear]);
  const inspectionLockChanged = useCallback((locked: boolean) => {
    inspectionLocked.current = locked; cancelClose();
    if (!locked && !document.activeElement?.closest('.sim-loadout-picker') && !document.querySelector('.sim-loadout-picker:hover, .sim-deployment-ship[aria-expanded="true"]:hover')) leavePicker();
  }, [cancelClose, leavePicker]);
  useLayoutEffect(() => {
    const closing = codexOpen.current && !isCodexOpen; codexOpen.current = isCodexOpen;
    if (isCodexOpen) cancelClose(); else if (closing) inspectionLockChanged(false);
  }, [isCodexOpen, cancelClose, inspectionLockChanged]);
  useEffect(() => () => { cancelClose(); cancelSwitch(); }, [cancelClose, cancelSwitch]);
  useEffect(() => {
    if (!picker) return;
    const outside = (event: PointerEvent) => {
      if (codexOpen.current) return;
      if (event.target instanceof Element && !event.target.closest('.sim-loadout-picker, .sim-deployment-ship') && !(inspectionLocked.current && event.target.closest('[data-dwell-id]'))) closePicker();
    };
    document.addEventListener('pointerdown', outside);
    const observer = new MutationObserver(() => { if (!picker.element.isConnected) closePicker(); });
    if (picker.element.parentElement) observer.observe(picker.element.parentElement, { childList: true });
    return () => { document.removeEventListener('pointerdown', outside); observer.disconnect(); };
  }, [picker, closePicker]);
  const openPicker = (hull: T, element: HTMLButtonElement, pin: boolean, inspect: () => void) => {
    if ((pinned.current || codexOpen.current) && !pin) return;
    cancelSwitch();
    if (inspectionLocked.current && !pin) {
      // Crossing another tile on the way into a nested reader must not switch its source.
      switchTimer.current = setTimeout(() => {
        switchTimer.current = null;
        if (element.isConnected && element.matches(':hover') && !inspectionLocked.current) openPicker(hull, element, pin, inspect);
      }, DWELL_SHOW_MS);
      return;
    }
    cancelClose(); pinned.current = pin;
    setPicker(current => current?.element === element && current.pinned === pin ? current : { hull, element, pinned: pin }); inspect();
  };
  const hullButtonProps = (hull: T, inspect: () => void): HTMLAttributes<HTMLButtonElement> => ({
    onMouseEnter: event => openPicker(hull, event.currentTarget, false, inspect), onMouseLeave: leavePicker,
    onFocus: event => openPicker(hull, event.currentTarget, event.currentTarget.matches(':focus-visible'), inspect),
    onBlur: event => { if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest('.sim-loadout-picker')) leavePicker(); },
    onClick: event => openPicker(hull, event.currentTarget, true, inspect),
    onKeyDownCapture: event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault(); const element = event.currentTarget; openPicker(hull, element, true, inspect);
      requestAnimationFrame(() => { if (document.activeElement === element) document.querySelector<HTMLButtonElement>('.sim-loadout-option:not(:disabled)')?.focus(); });
    },
  });
  const dismissPicker = () => {
    if (!picker) return false;
    const element = picker.element; closePicker(); element.focus(); closePicker(); return true;
  };
  const onRosterScroll = () => { if (!pinned.current && !inspectionLocked.current && !codexOpen.current) closePicker(); };
  return { picker, closePicker, dismissPicker, hullButtonProps, onRosterScroll, cancelClose, leavePicker, inspectionLockChanged };
}
