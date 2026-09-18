import { cloneElement, useContext, useLayoutEffect, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { DwellContext } from './dwell-context';
import { DwellPopover } from './DwellTooltip';
import { useDwellHover, type HoverAnchor } from './useDwellHover';
import './refit-inspection.css';

export type InspectionTarget = ReactElement<HTMLAttributes<HoverAnchor>>;
/** Information only: keep the actual grid/card control and its original click action. */
export function RefitInspection({ title, children, content, enabled = true, className = '', hideTitle = false, onOpenCodex, onLockChange, dismissOnClick = false, native }: {
  title: string; children: InspectionTarget; content: ReactNode; enabled?: boolean; className?: string;
  native?: boolean; hideTitle?: boolean; onOpenCodex?: () => void; onLockChange?: (locked: boolean) => void; dismissOnClick?: boolean;
}) {
  const parent = useContext(DwellContext);
  const hover = useDwellHover({ ownerId: parent && (parent.depth >= 0 || parent.linked) ? parent.ownerId : undefined,
    depth: parent ? parent.depth + 1 : 0, enabled: enabled && (!parent || (parent.locked && parent.depth < 2)) });
  const { active, hide, locked } = hover;
  useLayoutEffect(() => {
    if (!locked || !onLockChange) return;
    onLockChange(true);
    return () => onLockChange(false);
  }, [locked, onLockChange]);
  useLayoutEffect(() => {
    if (!active || !onOpenCodex) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'F2' || event.repeat || active.anchor.closest('[inert]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); onOpenCodex(); hide();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [active, hide, onOpenCodex]);
  if (parent && parent.depth >= 2) return children;
  const props = children.props;
  const nonInteractive = typeof children.type === 'string' && !['button', 'input', 'select', 'textarea', 'a', 'summary'].includes(children.type);
  return <>{cloneElement(children, {
    className: [props.className, 'refit-inspect-trigger'].filter(Boolean).join(' '),
    tabIndex: props.tabIndex ?? (nonInteractive ? 0 : undefined),
    'aria-describedby': hover.active ? hover.tooltipId : props['aria-describedby'],
    onPointerEnter: event => { props.onPointerEnter?.(event); if (event.pointerType !== 'touch') hover.show(title, event.currentTarget); },
    onPointerLeave: event => { props.onPointerLeave?.(event); hover.leave(); },
    onFocus: event => { props.onFocus?.(event); if (event.target.matches(':focus-visible')) hover.show(title, event.target, true); },
    onBlur: event => { props.onBlur?.(event); hover.leave(); },
    onKeyDownCapture: event => {
      props.onKeyDownCapture?.(event);
      if (!event.defaultPrevented && !props.onClick && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); event.stopPropagation(); hover.show(title, event.currentTarget, true);
      }
    },
    // A pure inspection button can also be opened by touch/Enter, but selection buttons keep their own action.
    onClick: event => {
      props.onClick?.(event);
      if (dismissOnClick) hide();
      else if (!props.onClick && children.type === 'button') hover.show(title, event.currentTarget, true);
    },
  })}<DwellPopover hover={hover} native={native} title={title} className={className} hideTitle={hideTitle}>{content}</DwellPopover></>;
}
