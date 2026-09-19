import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createDwellPointerBridge } from './dwell-pointer-bridge';
import { announceHover, hoverLockedElsewhere, registerHover } from '../ui/core/hover-layers';

export const DWELL_SHOW_MS = 220;
export const DWELL_LOCK_MS = 650;
/** Normal exit stays quick; a directional bridge separately protects travel toward a reader. */
export const DWELL_LEAVE_MS = 180;
export type HoverAnchor = HTMLElement | SVGElement;
type Anchor = { id: string; anchor: HoverAnchor };

/** Shared B interaction for refit information, equipment and nested terms. */
export function useDwellHover({ ownerId: parentOwner, depth = 0, enabled = true, enterableOnShow = false }: { ownerId?: string; depth?: number; enabled?: boolean; enterableOnShow?: boolean } = {}) {
  const tooltipId = useId(), ownerId = parentOwner ?? tooltipId;
  const [active, setActive] = useState<Anchor | null>(null);
  const [locked, setLocked] = useState(false);
  const activeRef = useRef<Anchor | null>(null), lockedRef = useRef(false), restoringFocus = useRef(false);
  const bridge = useRef(createDwellPointerBridge());
  const interaction = useRef<'pointer' | 'keyboard'>('pointer'), pointerOutside = useRef(false);
  const timers = useRef<{ show?: ReturnType<typeof setTimeout>; lock?: ReturnType<typeof setTimeout>; hide?: ReturnType<typeof setTimeout> }>({});
  const clearTimers = useCallback(() => {
    clearTimeout(timers.current.show); clearTimeout(timers.current.lock); clearTimeout(timers.current.hide);
    timers.current = {};
  }, []);
  const hide = useCallback(() => {
    bridge.current.reset(); clearTimers(); activeRef.current = null; lockedRef.current = false; setActive(null); setLocked(false);
  }, [clearTimers]);
  const dismiss = useCallback(() => {
    const anchor = activeRef.current?.anchor;
    const focused = document.activeElement;
    const returnFocus = focused instanceof Element && focused.closest('[data-dwell-id]')?.getAttribute('data-dwell-id') === tooltipId;
    hide();
    if (returnFocus && anchor?.isConnected && !anchor.closest('[inert]')) {
      const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]';
      const target = anchor.matches(focusable) ? anchor : anchor.querySelector<HoverAnchor>(focusable) ?? anchor;
      restoringFocus.current = true; target.focus({ preventScroll: true }); restoringFocus.current = false;
    }
  }, [hide, tooltipId]);
  const pin = useCallback(() => {
    if (!activeRef.current) return;
    clearTimeout(timers.current.lock); clearTimeout(timers.current.hide);
    lockedRef.current = true; setLocked(true);
  }, []);
  const keep = useCallback(() => { clearTimeout(timers.current.hide); timers.current.hide = undefined; }, []);
  const contains = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element) || !activeRef.current) return false;
    if (activeRef.current.anchor.contains(target) || target.closest('[data-dwell-anchor]')?.getAttribute('data-dwell-anchor') === tooltipId) return true;
    const card = target.closest('[data-dwell-id]');
    // A child reader keeps its ancestors, not unrelated siblings or an abandoned deeper card.
    return card?.getAttribute('data-dwell-owner') === ownerId && Number(card.getAttribute('data-dwell-depth') ?? 0) >= depth;
  }, [tooltipId, ownerId, depth]);
  const occupied = useCallback(() => {
    if (interaction.current === 'keyboard') return contains(document.activeElement);
    if (pointerOutside.current) return false;
    if (activeRef.current?.anchor.matches(':hover')) return true;
    return Array.from(document.querySelectorAll('[data-dwell-id], [data-dwell-anchor]')).some(element => element.matches(':hover') && contains(element));
  }, [contains]);
  const show = useCallback((id: string, anchor: HoverAnchor, immediate = false) => {
    if (!enabled || restoringFocus.current) return;
    interaction.current = immediate && anchor.matches(':focus-visible') ? 'keyboard' : 'pointer';
    pointerOutside.current = false;
    if (activeRef.current?.id === id && activeRef.current.anchor === anchor) { keep(); if (immediate) pin(); return; }
    if (!immediate && lockedRef.current && occupied()) return;
    keep(); clearTimeout(timers.current.show);
    clearTimeout(timers.current.lock);
    // Fast scanning must not leave the previous row's explanation on a new target.
    if (activeRef.current) hide();
    const reveal = () => {
      if (!anchor.isConnected || anchor.closest('[inert]')) return;
      // A previous card can still be crossing its gap. Recheck while this target is really hovered,
      // rather than losing the new target forever when its first reveal lands inside that grace period.
      if (!immediate && hoverLockedElsewhere(ownerId)) { timers.current.show = setTimeout(reveal, DWELL_LEAVE_MS); return; }
      announceHover(ownerId, depth, tooltipId);
      const rect = anchor.getBoundingClientRect(); bridge.current.inside({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
      activeRef.current = { id, anchor }; lockedRef.current = immediate || enterableOnShow;
      setActive(activeRef.current); setLocked(lockedRef.current);
    };
    if (immediate) reveal(); else timers.current.show = setTimeout(reveal, DWELL_SHOW_MS);
  }, [enabled, enterableOnShow, keep, pin, hide, occupied, ownerId, depth, tooltipId]);
  const leave = useCallback(() => {
    clearTimeout(timers.current.show);
    if (!lockedRef.current) { hide(); return; }
    // Lock means enterable. Leaving the source and this reader's descendant chain closes it.
    // Do not restart on every pointermove, otherwise moving outside would keep it open forever.
    if (timers.current.hide !== undefined) return;
    const expire = () => {
      timers.current.hide = undefined;
      if (occupied()) return;
      if (interaction.current === 'pointer' && !pointerOutside.current && bridge.current.alive()) {
        timers.current.hide = setTimeout(expire, DWELL_LEAVE_MS);
      } else hide();
    };
    timers.current.hide = setTimeout(expire, DWELL_LEAVE_MS);
  }, [hide, occupied]);
  useEffect(() => clearTimers, [clearTimers]);
  if (!enabled && active) { setActive(null); setLocked(false); }
  useLayoutEffect(() => {
    if (!enabled) { clearTimers(); activeRef.current = null; lockedRef.current = false; }
  }, [enabled, clearTimers]);
  useLayoutEffect(() => {
    if (!active) return;
    // Start the dwell countdown only after the actual card has mounted.
    if (!lockedRef.current) timers.current.lock = setTimeout(pin, DWELL_LOCK_MS);
    return () => clearTimeout(timers.current.lock);
  }, [active, pin]);
  useLayoutEffect(() => {
    if (!active) return;
    const unregister = registerHover({ id: tooltipId, owner: ownerId, depth, hide, dismiss, locked: () => lockedRef.current,
      visible: () => active.anchor.isConnected && !active.anchor.closest('[inert]') });
    // Installation, filtering and module navigation may remove the original target.
    const observer = new MutationObserver(() => {
      if (!active.anchor.isConnected || active.anchor.closest('[inert]')) hide();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
    return () => { unregister(); observer.disconnect(); };
  }, [active, tooltipId, ownerId, depth, hide, dismiss]);
  useEffect(() => {
    if (!active) return;
    const inside = (target: EventTarget | null) => target instanceof Element && target.closest('[data-dwell-owner]')?.getAttribute('data-dwell-owner') === ownerId;
    const outside = (event: PointerEvent) => { if (!inside(event.target) && !contains(event.target)) hide(); };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !activeRef.current) return;
      interaction.current = 'pointer'; pointerOutside.current = false;
      const point = { x: event.clientX, y: event.clientY };
      if (contains(event.target)) { bridge.current.inside(point); keep(); }
      else {
        const targets = [activeRef.current.anchor, ...Array.from(document.querySelectorAll<HTMLElement>('[data-dwell-id]')).filter(card =>
          card.getAttribute('data-dwell-owner') === ownerId && Number(card.getAttribute('data-dwell-depth') ?? 0) >= depth)];
        if (lockedRef.current) bridge.current.travel(point, targets.map(target => target.getBoundingClientRect()));
        leave();
      }
    };
    const exitWindow = (event: PointerEvent) => {
      if (event.relatedTarget !== null || event.pointerType === 'touch' || !activeRef.current) return;
      bridge.current.reset(); interaction.current = 'pointer'; pointerOutside.current = true; leave();
    };
    const focus = (event: FocusEvent) => {
      if (!activeRef.current || !(event.target instanceof Element) || !event.target.matches(':focus-visible')) return;
      bridge.current.reset(); interaction.current = 'keyboard';
      if (contains(event.target)) keep(); else leave();
    };
    const scroll = (event: Event) => { if (!inside(event.target)) hide(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('pointerover', pointer, true); document.addEventListener('pointermove', pointer, true);
    document.addEventListener('pointerout', exitWindow, true); document.addEventListener('focusin', focus, true);
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', hide); window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('pointerover', pointer, true); document.removeEventListener('pointermove', pointer, true);
      document.removeEventListener('pointerout', exitWindow, true); document.removeEventListener('focusin', focus, true);
      window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', hide); window.removeEventListener('blur', hide);
    };
  }, [active, ownerId, depth, hide, contains, keep, leave]);
  const bind = (id: string) => ({
    'aria-describedby': active?.id === id ? tooltipId : undefined,
    onMouseEnter: (event: { currentTarget: HoverAnchor }) => show(id, event.currentTarget),
    onMouseLeave: leave,
    onFocus: (event: { currentTarget: HoverAnchor; target: EventTarget }) => { if ((event.target instanceof HTMLElement || event.target instanceof SVGElement) && event.target.matches(':focus-visible')) show(id, event.target, true); },
    onBlur: leave,
  });
  return { active, tooltipId, ownerId, depth, locked, hide, dismiss, keep, leave, show, bind };
}
export type DwellHover = ReturnType<typeof useDwellHover>;
