import { placeDwellPopover, type HoverRect } from './placeDwellPopover';
import { useContext, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DwellContext } from './dwell-context';
import type { DwellHover } from './useDwellHover';
import { NativeBorder, NativeMaterial, NativeButton } from '../ui/NativeChrome';
import './dwell-tooltip.css';

export function DwellScope({ hover, children, native }: { hover: DwellHover; children: ReactNode; native?: boolean }) {
  const parent = useContext(DwellContext);
  return <DwellContext.Provider value={{ ownerId: hover.ownerId, depth: hover.depth, locked: hover.locked, native: native ?? parent?.native, linked: true }}>{children}</DwellContext.Provider>;
}
/** Static readers are already enterable; their terms start a normal root tooltip. */
export function DwellReader({ children }: { children: ReactNode }) {
  const parent = useContext(DwellContext), ownerId = useId();
  return <DwellContext.Provider value={parent ?? { ownerId, depth: -1, locked: true }}>{children}</DwellContext.Provider>;
}
export function DwellStatus({ hover, native = false }: { hover: DwellHover; native?: boolean }) {
  if (native) return <div className="dwell-status native-dwell-status" data-locked={hover.locked}>
    <span>{hover.locked ? '已锁定 · 移出收起' : '停留锁定中…'}</span>
    {hover.locked ? <NativeButton font="body" aria-label="关闭悬停提示" onClick={hover.dismiss}>Esc</NativeButton>
      : <span className="dwell-progress" aria-hidden="true"><i /></span>}
  </div>;
  return <div className="dwell-status" data-locked={hover.locked}>
    <span>{hover.locked ? hover.depth >= 2 ? '移出收起 · Esc 返回上层' : '可移入阅读 · 移出收起' : '继续停留以锁定'}</span>
    {hover.locked ? <button type="button" aria-label="关闭悬停提示" onClick={hover.dismiss}>关闭 · Esc</button>
      : <span className="dwell-progress" aria-hidden="true"><i /></span>}
  </div>;
}
/** Portal stays in the current modal's focus/inert boundary, outside the parent's scroll clip. */
export function DwellPopover({ hover, title, children, className = '', hideTitle = false, native }: { hover: DwellHover; title: string; children: ReactNode; className?: string; hideTitle?: boolean; native?: boolean }) {
  const parent = useContext(DwellContext), nativeStyle = native ?? parent?.native ?? false;
  const ref = useRef<HTMLElement>(null);
  const { active, hide } = hover;
  useLayoutEffect(() => {
    const card = ref.current, anchor = active?.anchor;
    if (!card || !anchor) return;
    const position = () => {
      if (!anchor.isConnected) { hide(); return; }
      const a = anchor.getBoundingClientRect(), parent = anchor.closest('[data-dwell-id]');
      const parentRect = parent?.getBoundingClientRect();
      if (parentRect && (a.bottom <= parentRect.top || a.top >= parentRect.bottom || a.right <= parentRect.left || a.left >= parentRect.right)) { hide(); return; }
      // The choice window participates in hover lifetime, not in information-card avoidance.
      // Protecting its entire footer/row would push a reader hundreds of pixels from its source.
      const ancestors = Array.from(document.querySelectorAll<HTMLElement>('[data-dwell-id]'))
        .filter(el => el !== card && el.dataset.dwellOwner === hover.ownerId && Number(el.dataset.dwellDepth ?? 0) >= 0 && Number(el.dataset.dwellDepth ?? 0) < hover.depth)
        .sort((a, b) => Number(a.dataset.dwellDepth ?? 0) - Number(b.dataset.dwellDepth ?? 0));
      const reading: HoverRect[] = [], headers: HoverRect[] = [];
      const visibleIds = new Set([...ancestors, card].map(el => el.id));
      for (const ancestor of ancestors) {
        const r = ancestor.getBoundingClientRect();
        const status = ancestor.querySelector('.dwell-status')?.getBoundingClientRect();
        if (status) headers.push(status);
        for (const source of Array.from(ancestor.querySelectorAll<HTMLElement>('[aria-describedby]'))) {
          if (!source.getAttribute('aria-describedby')?.split(/\s+/).some(id => visibleIds.has(id))) continue;
          const line = source.getBoundingClientRect();
          // Protect the full reading line, not just the word beneath the pointer.
          reading.push({ left: r.left, right: r.right, top: Math.max(r.top, line.top - 4), bottom: Math.min(r.bottom, line.bottom + 4) });
        }
      }
      const b = card.getBoundingClientRect(), viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 8, top = (viewport?.offsetTop ?? 0) + 8;
      const point = placeDwellPopover({ width: b.width, height: b.height, anchor: a,
        viewport: { left, top, right: left + (viewport?.width ?? window.innerWidth) - 16, bottom: top + (viewport?.height ?? window.innerHeight) - 16 },
        cards: ancestors.map(el => el.getBoundingClientRect()), reading, headers });
      card.style.left = `${point.x}px`; card.style.top = `${point.y}px`;
    };
    position(); const observer = new ResizeObserver(position); observer.observe(card); observer.observe(anchor);
    const parent = anchor.closest('[data-dwell-id]'); if (parent) observer.observe(parent);
    window.addEventListener('scroll', position, true);
    return () => { observer.disconnect(); window.removeEventListener('scroll', position, true); };
  }, [active, hide, hover.ownerId, hover.depth]);
  if (!hover.active) return null;
  const host = hover.active.anchor.closest('.ui-modal') ?? document.body;
  return createPortal(<aside ref={ref} id={hover.tooltipId} role="region" aria-label={`${title}解释`}
    className={`dwell-popover ${nativeStyle ? 'native-frame native-chrome native-dwell' : ''} ${className}`} data-native-surface={nativeStyle ? 'solid' : undefined} data-dwell-id={hover.tooltipId} data-dwell-depth={hover.depth} data-dwell-owner={hover.ownerId} data-dwell-locked={hover.locked}
    onKeyDownCapture={event => {
      // Capture before the modal's native bubbling listener: reading a card must not apply a loadout.
      // Tab still reaches the modal focus trap; Escape and F2 are handled in capture phase.
      if (event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation();
    }}
    style={{ zIndex: 230 + hover.depth }} onMouseEnter={hover.keep} onMouseLeave={hover.leave} onFocus={hover.keep} onBlur={hover.leave}>
    {nativeStyle && <><NativeBorder /><NativeMaterial /></>}
    <DwellScope hover={hover} native={nativeStyle}>{nativeStyle ? <>
      <div className="native-dwell-content">{!hideTitle && <h3>{title}</h3>}{children}</div><DwellStatus hover={hover} native />
    </> : <><DwellStatus hover={hover} />{!hideTitle && <h3>{title}</h3>}{children}</>}</DwellScope>
  </aside>, host);
}