import type { ReactElement, ReactNode } from 'react';
import { Tooltip, type HintTarget } from '../ui/core/Tooltip';
import { DwellPopover } from './DwellTooltip';
import { useDwellHover } from './useDwellHover';
import { RefitExplanationText } from './RefitHoverTerms';

/** Domain vocabulary stays here; focus, hover lifetime and positioning belong to core. */
export function RefitHint({ text, children }: { text?: string; children: ReactElement<HintTarget> }) {
  return <Tooltip text={text} content={text && <p><RefitExplanationText text={text} /></p>}>{children}</Tooltip>;
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
