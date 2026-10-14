import { cloneElement, useContext, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { DwellContext } from './dwell-context';
import { DwellPopover } from './DwellTooltip';
import { useDwellHover, type HoverAnchor } from './useDwellHover';

export type HintTarget = HTMLAttributes<HoverAnchor> & { disabled?: boolean };
/** Enhance the actual control: no layout wrapper, nested buttons or changed click behavior. */
export function Tooltip({ text, content, children }: { text?: string; content?: ReactNode; children: ReactElement<HintTarget> }) {
  const parent = useContext(DwellContext);
  const hover = useDwellHover({ ownerId: parent && (parent.depth >= 0 || parent.linked) ? parent.ownerId : undefined, depth: parent ? parent.depth + 1 : 0,
    enabled: !!text && (!parent || (parent.locked && parent.depth < 2)) });
  if (!text || (parent && parent.depth >= 2)) return children;
  const props = children.props;
  const nonInteractive = typeof children.type === 'string' && !['button', 'input', 'select', 'textarea', 'a', 'summary'].includes(children.type);
  return <>{cloneElement(children, {
    tabIndex: props.tabIndex ?? (nonInteractive ? 0 : undefined),
    'aria-description': text,
    'aria-describedby': hover.active ? hover.tooltipId : props['aria-describedby'],
    onPointerEnter: event => { props.onPointerEnter?.(event); if (event.pointerType !== 'touch') hover.show(text, event.currentTarget); },
    onPointerLeave: event => { props.onPointerLeave?.(event); hover.leave(); },
    onFocus: event => { props.onFocus?.(event); if (event.target.matches(':focus-visible')) hover.show(text, event.target, true); },
    onBlur: event => { props.onBlur?.(event); hover.leave(); },
  })}<DwellPopover hover={hover} title="说明">{content ?? <p>{text}</p>}</DwellPopover></>;
}

