import { cloneElement, useContext, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { DwellContext } from './dwell-context';
import { DwellPopover } from './DwellTooltip';
import { useDwellHover, type HoverAnchor } from './useDwellHover';
import { RefitExplanationText } from './RefitHoverTerms';

type HintTarget = HTMLAttributes<HoverAnchor> & { disabled?: boolean };
/** Enhance the actual control: no layout wrapper, nested buttons or changed click behavior. */
export function RefitHint({ text, children }: { text?: string; children: ReactElement<HintTarget> }) {
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
  })}<DwellPopover hover={hover} title="说明"><p><RefitExplanationText text={text} /></p></DwellPopover></>;
}

/** Replace info-only inline disclosures, retaining their collapsed footprint. */
export function RefitInfoHover({ title, children, className = '', enabled = true, available }: {
  title: string; children: ReactNode; className?: string; enabled?: boolean; available?: boolean;
}) {
  const hover = useDwellHover({ enabled });
  return <><div className={className} data-available={available}>
    <button type="button" className="refit-info-trigger" {...hover.bind(title)} aria-expanded={!!hover.active}
      onClick={event => hover.show(title, event.currentTarget, true)}>{title}</button>
  </div><DwellPopover hover={hover} title={title}>{children}</DwellPopover></>;
}
