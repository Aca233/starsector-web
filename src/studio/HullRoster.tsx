import { useLayoutEffect, useMemo, useRef } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import type { ShipSpec } from '../engine/content/ShipSpec';
import { data, hulls, nativeRefit } from './DesignModel';
import type { Design } from './DesignModel';
import { matchesRefitSearch, refitSearchRank } from './RefitSearch';
import { FactionFilter } from './FactionFilter';
import { factionIndex, matchesFaction } from './FactionModel';

export interface HullFilter { query: string; hullClass: string; faction: string }
const classes = [
  ['', '全部'], ['FRIGATE', '护卫'], ['DESTROYER', '驱逐'],
  ['CRUISER', '巡洋'], ['CAPITAL_SHIP', '主力'],
] as const;

/** Filter/scroll state belongs to StudioApp, so choosing a hull never resets the browser. */
export function HullRoster({ draft, spec, filter, onFilter, readScrollPosition, writeScrollPosition, onHull, inert, unavailableReason }: {
  unavailableReason?: (spec: ShipSpec) => string | null;
  draft: Design; spec: ShipSpec; filter: HullFilter; onFilter: (value: HullFilter) => void;
  readScrollPosition: () => number; writeScrollPosition: (value: number) => void; onHull: (id: string) => void; inert: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const locate = useRef(false);
  const matches = useMemo(() => hulls.filter(h => matchesRefitSearch(filter.query,
    h.id, data.ships[h.id].name, data.ships[h.id].designation, data.ships[h.id].manufacturer,
  )), [filter.query]);
  const factionMatches = useMemo(() => matches.filter(h => matchesFaction(filter.faction, factionIndex.hullFactions[h.id])), [matches, filter.faction]);
  const shown = useMemo(() => factionMatches.filter(h => !filter.hullClass || h.hullSize === filter.hullClass)
    .sort((a, b) => refitSearchRank(filter.query, data.ships[a.id].name, a.id) - refitSearchRank(filter.query, data.ships[b.id].name, b.id)), [factionMatches, filter]);
  const changeFilter = (next: HullFilter) => { writeScrollPosition(0); onFilter(next); };
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = inert ? 0 : readScrollPosition();
    if (locate.current && list.current) {
      locate.current = false;
      const row = Array.from(list.current.querySelectorAll<HTMLElement>('[data-hull-id]')).find(el => el.dataset.hullId === draft.hullId);
      if (row) { list.current.scrollTop += row.getBoundingClientRect().top - list.current.getBoundingClientRect().top; writeScrollPosition(list.current.scrollTop); }
    }
  }, [filter, draft.hullId, readScrollPosition, writeScrollPosition, inert]);
  const goToCurrent = () => { locate.current = true; changeFilter({query: '', hullClass: '', faction: ''}); };
  return <aside className="refit-roster refit-roster-filtered" aria-label="舰船列表" inert={inert}>
    <div className="refit-roster-filters">
      <div className="refit-filter-heading"><label htmlFor="refit-hull-search">选择舰船</label><span role="status">{shown.length} / {hulls.length} 艘</span></div>
      <div className="refit-search-field">
        <input ref={search} id="refit-hull-search" type="search" autoComplete="off" placeholder="搜索舰船名称 / ID" value={filter.query}
          onChange={e => changeFilter({...filter, query: e.target.value})}
          onKeyDown={e => {
            if (e.key === 'Escape' && filter.query) { e.preventDefault(); e.stopPropagation(); changeFilter({...filter, query: ''}); }
            if (e.key === 'ArrowDown') { e.preventDefault(); list.current?.querySelector<HTMLButtonElement>('button[data-hull-id]')?.focus(); }
          }} />
        {filter.query && <button type="button" className="refit-search-clear" aria-label="清空舰船搜索" onClick={() => {changeFilter({...filter, query: ''}); search.current?.focus();}}>×</button>}
      </div>
      <div className="refit-class-chips" role="group" aria-label="舰级筛选">
        {classes.map(([id, name]) => <NativeButton font="caption" key={id} aria-pressed={filter.hullClass === id}
          title={id ? `${name}舰（${factionMatches.filter(h => h.hullSize === id).length} 艘）` : '显示所有舰级'}
          onClick={() => changeFilter({...filter, hullClass: id})}>{name}</NativeButton>)}
      </div>
      <FactionFilter label="舰船势力筛选" value={filter.faction} onChange={faction => changeFilter({...filter, faction})}
        memberships={matches.filter(h => !filter.hullClass || h.hullSize === filter.hullClass).map(h => factionIndex.hullFactions[h.id] ?? [])} />
      <div className="refit-filter-actions">
        <button type="button" onClick={goToCurrent}>定位当前舰船</button>
        {(filter.query || filter.hullClass || filter.faction) && <button type="button" onClick={() => changeFilter({query: '', hullClass: '', faction: ''})}>重置筛选</button>}
      </div>
    </div>
    <div className="refit-roster-results" ref={list} onScroll={e => {if (!inert) writeScrollPosition(e.currentTarget.scrollTop);}}>
      {(inert ? [spec] : shown).map(h => {
        const active = h.id === draft.hullId;
        const unavailable = unavailableReason?.(h);
        return <button type="button" key={h.id} data-hull-id={h.id} className={'refit-roster-ship ' + (active ? 'is-current' : '')}
          disabled={!!unavailable} title={unavailable ?? undefined}
          aria-pressed={active} aria-label={'改装' + data.ships[h.id].name + '级'} onClick={() => {if (!active) onHull(h.id);}}>
          {/* Keep one image and sizing rule across selection; the detailed fitted ship belongs to the central stage. */}
          <img loading="lazy" draggable={false} className="refit-roster-thumbnail" src={runtimeAssetUrl(h.spriteUrl)} alt="" />
          <span><strong>{data.ships[h.id].name}</strong><small>{data.ships[h.id].designation}{active ? ' · 改装中' : ''}</small>
            {unavailable && <small className="refit-approx-label">{unavailable}</small>}
            {nativeRefit.shipStatus[h.id]?.level === 'approximate' && <small className="refit-approx-label">基础模拟</small>}
          </span>
        </button>;
      })}
      {!inert && !shown.length && <div className="refit-filter-empty"><strong>没有找到舰船</strong><p>试试其他名称、舰级或势力。</p><NativeButton onClick={() => changeFilter({query: '', hullClass: '', faction: ''})}>清除筛选</NativeButton></div>}
    </div>
  </aside>;
}
