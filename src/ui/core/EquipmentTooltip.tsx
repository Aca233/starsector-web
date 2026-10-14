import { createPortal } from 'react-dom';
import type { DwellHover, HoverAnchor } from './useDwellHover';
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { DwellScope, DwellStatus } from './DwellTooltip';
import { placeDwellPopover, type HoverRect } from './placeDwellPopover';

export function EquipmentTooltip({ hover, children, className = '', preferSide = false, positionAnchor, avoidTargets }: {
  hover: DwellHover; children: ReactNode; className?: string; preferSide?: boolean | "left"; positionAnchor?: HoverAnchor | null;
  avoidTargets?: (anchor: HoverAnchor) => HoverRect[];
}) {
  const ref = useRef<HTMLElement>(null);
  const { active, hide } = hover;
  useLayoutEffect(() => {
    const card = ref.current, anchor = positionAnchor ?? active?.anchor;
    if (!card || !anchor?.isConnected) return;
    const position = () => {
      if (!anchor.isConnected) { hide(); return; }
      const a = anchor.getBoundingClientRect(), box = card.getBoundingClientRect();
      const targets = avoidTargets?.(anchor) ?? [];
      if (targets.length) {
        const viewport = window.visualViewport;
        const left = (viewport?.offsetLeft ?? 0) + 8, top = (viewport?.offsetTop ?? 0) + 8;
        const point = placeDwellPopover({ width: box.width, height: box.height, anchor: a,
          viewport: { left, top, right: left + (viewport?.width ?? window.innerWidth) - 16, bottom: top + (viewport?.height ?? window.innerHeight) - 16 },
          targets, cards: [], reading: [], headers: [] });
        card.style.left = `${point.x}px`; card.style.top = `${point.y}px`;
        return;
      }
      const maxX = window.innerWidth - box.width - 8, maxY = window.innerHeight - box.height - 8;
      let x = a.right - box.width, y = a.top - box.height - 6;
      if (preferSide === "left" && a.left - box.width - 8 >= 8) { x = a.left - box.width - 8; y = a.top; }
      else if (preferSide && a.right + box.width + 8 <= window.innerWidth - 8) { x = a.right + 8; y = a.top; }
      else if (preferSide && a.left - box.width - 8 >= 8) { x = a.left - box.width - 8; y = a.top; }
      else if (y < 8) y = a.bottom + 6;
      card.style.left = `${Math.round(Math.max(8, Math.min(x, maxX)))}px`;
      card.style.top = `${Math.round(Math.max(8, Math.min(y, maxY)))}px`;
    };
    position(); const observer = new ResizeObserver(position); observer.observe(card); observer.observe(anchor);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
    };
  }, [active, hide, preferSide, positionAnchor, avoidTargets]);
  if (!hover.active) return null;
  return createPortal(<aside ref={ref} id={hover.tooltipId} role="region" aria-label="装备详情"
    data-dwell-id={hover.tooltipId} data-dwell-depth={hover.depth} data-dwell-owner={hover.ownerId} data-dwell-locked={hover.locked} data-equipment-tooltip className={`equipment-tooltip ${className}`}
    onMouseEnter={hover.keep} onMouseLeave={hover.leave} onFocus={hover.keep} onBlur={hover.leave}><DwellScope hover={hover}><DwellStatus hover={hover} />{children}</DwellScope></aside>, hover.active.anchor.closest('.ui-modal') ?? document.body);
}
