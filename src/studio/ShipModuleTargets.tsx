import { useRef } from 'react';
import { DwellPopover } from './DwellTooltip';
import { RefitExplanationText } from './RefitHoverTerms';
import { useDwellHover } from './useDwellHover';

type ModuleTarget = { key: string; path: string[]; name: string; points: string; transform: string };
/** Padding is painted below ALL real hulls: an expanded edge cannot steal another hull's interior. */
export function ShipModuleTargets({ targets, activePath, width, height, onSelect }: {
  targets: ModuleTarget[]; activePath: string; width: number; height: number; onSelect: (path: string[]) => void;
}) {
  const hover = useDwellHover();
  const anchors = useRef(new Map<string, SVGPolygonElement>());
  const pointerTarget = useRef<string | null>(null);
  const active = targets.find(target => target.key === hover.active?.id);
  const enter = (key: string) => {
    if (pointerTarget.current === key) return;
    pointerTarget.current = key;
    const anchor = anchors.current.get(key); if (anchor) hover.show(key, anchor);
  };
  const leave = (key: string, next: EventTarget | null) => {
    if (next instanceof Element && next.closest('[data-module-target]')?.getAttribute('data-module-target') === key) return;
    pointerTarget.current = null; hover.leave();
  };
  const select = (path: string[]) => { hover.hide(); onSelect(path); };
  return <><svg className="assembly-hit-regions" viewBox={`0 0 ${width} ${height}`} aria-label="可改装的舰体模块">
    {targets.map(target => <polygon key={'edge:' + target.key} className="assembly-module-padding" aria-hidden="true"
      data-dwell-anchor={hover.active?.id === target.key ? hover.tooltipId : undefined} data-module-target={target.key} data-module-padding={JSON.stringify(target.path)} points={target.points} transform={target.transform}
      onMouseEnter={() => enter(target.key)} onMouseLeave={event => leave(target.key, event.relatedTarget)} onClick={() => select(target.path)} />)}
    {targets.map(target => <polygon key={target.key} role="button" tabIndex={0}
      ref={element => { if (element) anchors.current.set(target.key, element); else anchors.current.delete(target.key); }}
      aria-label={target.path.length ? `改装模块 ${target.path.join(' / ')} · ${target.name}` : '改装母舰'}
      aria-description="点击原位改装；只编辑选中部件，OP 独立计算。保存与战斗仍使用整舰。"
      aria-describedby={hover.active?.id === target.key ? hover.tooltipId : undefined}
      aria-pressed={JSON.stringify(target.path) === activePath}
      className={JSON.stringify(target.path) === activePath ? 'is-active-module' : undefined}
      data-dwell-anchor={hover.active?.id === target.key ? hover.tooltipId : undefined} data-module-path={JSON.stringify(target.path)} data-module-target={target.key} data-module-hovered={hover.active?.id === target.key}
      points={target.points} transform={target.transform}
      onMouseEnter={() => enter(target.key)} onMouseLeave={event => leave(target.key, event.relatedTarget)}
      onFocus={hover.bind(target.key).onFocus} onBlur={hover.leave}
      onClick={() => select(target.path)} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(target.path); }
      }} />)}
  </svg>{active && <DwellPopover hover={hover} title={active.path.length ? `模块 ${active.path.join(' / ')} · ${active.name}` : '母舰改装'}>
    <p><RefitExplanationText text="点击原位改装。只编辑选中部件，OP 独立计算；保存与战斗仍使用整舰。" /></p>
  </DwellPopover>}</>;
}
