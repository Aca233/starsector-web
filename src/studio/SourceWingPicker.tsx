import { RefitHint } from './RefitHint';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { NativeBitmapText } from '../ui/NativeBitmapText';
import { Modal } from '../ui/core/UI';
import { WingInformation } from './WingInformation';
import { budget, builtInWingIds, designWingSlots, nativeRefit } from './DesignModel';
import type { Design, RefitWing } from './DesignModel';
import { matchesRefitSearch, refitSearchRank } from './RefitSearch';
import { EquipmentTooltip } from './EquipmentTooltip';
import { useEquipmentHover } from './useEquipmentHover';
import { WingFormation } from './FighterDecks';
import './source-wing-picker.css';

const categories = [['INTERCEPTOR', '截击机'], ['FIGHTER', '战斗机'], ['BOMBER', '轰炸机']] as const;
const categoryOf = (wing: RefitWing) => wing.category ?? (wing.sourceRole === 'INTERCEPTOR' ? 'INTERCEPTOR' : wing.role);
const nameOf = (wing: RefitWing) => wing.displayName ?? wing.name.split(' · ')[0];
const roleOf = (wing: RefitWing) => wing.roleDescription || (wing.role === 'BOMBER' ? '轰炸机' : '战斗机');

export function SourceWingPicker({ draft, index, onEquip, onClose }: {
  draft: Design; index: number; onEquip: (id: string | null) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [libraryNote, setLibraryNote] = useState(false);
  const details = useEquipmentHover();
  const [comparing, setComparing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const slots = designWingSlots(draft);
  const currentId = slots[index];
  const current = currentId ? nativeRefit.wings?.[currentId] : undefined;
  const builtin = index < builtInWingIds(draft.hullId).length;
  const op = budget(draft);
  const allowance = op.remaining + (current?.op ?? 0);
  const wings = useMemo(() => Object.entries(nativeRefit.wings ?? {})
    .filter(([id, wing]) => id !== currentId && matchesRefitSearch(query, id, wing.name) && (!category || categoryOf(wing) === category) && (!affordableOnly || wing.op <= allowance))
    .sort(([aId, a], [bId, b]) => refitSearchRank(query, a.name, aId) - refitSearchRank(query, b.name, bId) || b.op - a.op || a.name.localeCompare(b.name, 'zh-CN') || aId.localeCompare(bId)),
  [query, category, affordableOnly, allowance, currentId]);
  const preview = details.active ? nativeRefit.wings?.[details.active.id] : undefined;
  const toggleCategory = (value: string) => {details.hide(); setCategory(previous => previous === value ? '' : value);};
  const reset = () => {setQuery(''); setCategory(''); setAffordableOnly(false); details.hide();};
  const filtered = !!(query || category || affordableOnly);
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query, category, affordableOnly]);
  useLayoutEffect(() => { if (advanced) search.current?.focus(); }, [advanced]);
  useLayoutEffect(() => {
    const panel = root.current?.closest<HTMLElement>('.ui-modal');
    if (!panel) return;
    const position = () => {
      const anchor = document.querySelector<HTMLElement>(`[data-deck-index="${index}"]`)?.getBoundingClientRect();
      const width = Math.min(386, window.innerWidth - 16);
      const height = Math.min(646, window.innerHeight - 24);
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, (anchor?.right ?? 240) + 9));
      const top = Math.max(12, Math.min((anchor?.top ?? 120) - 105, window.innerHeight - height - 12));
      panel.style.setProperty('--wing-picker-left', `${Math.round(left)}px`);
      panel.style.setProperty('--wing-picker-top', `${Math.round(top)}px`);
      panel.style.setProperty('--wing-picker-height', `${Math.round(height)}px`);

    };
    position(); window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [index]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Control') setComparing(e.type === 'keydown');
      // F opens and focuses search on keydown; suppress its default text insertion.
      if (e.type === 'keydown' && e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey && !(e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]'))) e.preventDefault();
    };
    const blur = () => setComparing(false);
    const backdrop = root.current?.closest('.ui-modal-backdrop');
    const dismiss = (e: MouseEvent) => { if (e.target === backdrop) onClose(); };
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true); window.addEventListener('blur', blur);
    backdrop?.addEventListener('mousedown', dismiss as EventListener);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true); window.removeEventListener('blur', blur); backdrop?.removeEventListener('mousedown', dismiss as EventListener); };
  }, [onClose]);
  const row = (id: string, wing: RefitWing, installed = false) => {
    const unavailable = builtin || (!installed && wing.op > allowance);
    return <button type="button" className={`native-wing-row${installed ? ' native-wing-installed' : ''}`} key={id}
      data-wing-choice={installed ? undefined : id} data-preview={details.active?.id === id} aria-disabled={unavailable}
      aria-label={`${installed ? builtin ? '内置联队' : '卸下' : '安装'}：${wing.name}，${wing.count} 架，${wing.op} OP`}
      {...details.bind(id)}
      onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[data-wing-choice]') ?? []); const i = buttons.indexOf(e.currentTarget); if (i >= 0) {e.preventDefault(); buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();} } }}
      onClick={e => { if (!unavailable && !e.ctrlKey && !comparing) onEquip(installed ? null : id); }}>
      <WingFormation id={id} />
      <span className="native-wing-info"><strong><NativeBitmapText font="body" color="currentColor">{`${nameOf(wing)} ${roleOf(wing)}`}</NativeBitmapText></strong>
        <span className="native-wing-role">{roleOf(wing)}</span>
        <span className="native-wing-quantity">{installed ? builtin ? '舰体内置' : '点击卸下' : `${wing.count} 架 / 联队`}</span>
        <small>{installed ? builtin ? '不可替换' : '当前装配' : unavailable ? '装配点不足' : `基础补充 ${wing.rebuildSeconds} 秒/架`}</small>
      </span>
      <span className="native-wing-op"><b>{builtin && installed ? 0 : wing.op}</b><small>装配点数</small></span>
    </button>;
  };
  return <Modal title={`战机甲板 ${index + 1} · 联队选择`} eyebrow="" initialFocus="panel" surface="solid" onClose={onClose}
    onShortcut={key => { if (builtin) return; if (['1','2','3'].includes(key)) toggleCategory(categories[Number(key)-1][0]); if (key === '0') reset(); if (key === '4') setLibraryNote(value => !value); if (key === 'f') setAdvanced(value => !value); }}>
    <div className="source-wing-picker native-wing-picker" ref={root}>
      <div className="native-wing-heading"><span>当前安装 - 按住 <kbd>Ctrl</kbd> 键进行对比</span><button type="button" aria-label="关闭战机选择" onClick={onClose}>×</button></div>
      {current && currentId ? row(currentId, current, true) : <div className="native-wing-empty-deck"><span>+</span><div><strong>战机甲板 {index + 1} · 未安装联队</strong><small>从下方选择战机编队</small></div></div>}
      {!builtin && <>
        <div className="native-wing-tabs" role="group" aria-label="战机类型筛选">{categories.map(([id, label], i) => <RefitHint key={id} text="点击单独筛选，再次点击显示全部类型"><NativeButton  font="body" shortcut={String(i+1)} data-category={id} aria-pressed={!category || category === id}  onClick={() => toggleCategory(id)}>{label}</NativeButton></RefitHint>)}</div>
        <div className="native-wing-sources" role="group" aria-label="联队来源">
          <RefitHint text="模拟装备库，不代表战役拥有库存"><NativeButton font="body" shortcut="4" aria-pressed="true" onClick={() => setLibraryNote(value => !value)} >模拟装备库</NativeButton></RefitHint>
          <RefitHint text="未接入战役市场，不能购买"><NativeButton font="body" shortcut="5" disabled >合法购买</NativeButton></RefitHint>
          <RefitHint text="未接入黑市，不能购买"><NativeButton font="body" shortcut="6" disabled >非法购买</NativeButton></RefitHint>
        </div>
        {advanced && <div className="native-wing-search"><div className="refit-search-field"><input ref={search} type="search" autoComplete="off" aria-label="搜索战机联队" placeholder="搜索名称 / ID" value={query} onChange={e => {details.hide(); setQuery(e.target.value);}} onKeyDown={e => {if (e.key === 'ArrowDown') {e.preventDefault(); list.current?.querySelector<HTMLButtonElement>('[data-wing-choice]')?.focus();}}} />{query && <button className="refit-search-clear" type="button" aria-label="清空战机搜索" onClick={() => {details.hide(); setQuery('');}}>×</button>}</div>
          <div><label><input type="checkbox" checked={affordableOnly} onChange={e => {details.hide(); setAffordableOnly(e.target.checked);}} />只看 OP 够用</label><button type="button" onClick={reset}>重置筛选</button></div>
        </div>}
        <div className="native-wing-list" ref={list}>{wings.map(([id, wing]) => row(id, wing))}{!wings.length && <div className="native-wing-no-results"><p>没有匹配的联队。</p><NativeButton font="body" onClick={reset}>重置筛选</NativeButton></div>}</div>
        <div className="native-wing-tools"><button type="button" onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}>搜索 / 预算 [F]{filtered ? ' · 已筛选' : ''}</button><span role="status">{wings.length} 种 · 可用 {allowance} OP</span></div>
      </>}
      {builtin && <p className="native-wing-notice">此联队属于舰体内置设备，不能卸下或替换，不占用装配点。</p>}
      {libraryNote && <p className="native-wing-notice">模拟装备库不扣除库存，不涉及购买；列出的数量是每个联队的战机数量。<button type="button" aria-label="关闭装备库说明" onClick={() => setLibraryNote(false)}>×</button></p>}
      {preview && <EquipmentTooltip hover={details} preferSide className="native-wing-tooltip">
        <h3>{nameOf(preview)} · {roleOf(preview)}</h3>
        <p className="equipment-state">{details.active?.id === currentId ? builtin ? '舰体内置 · 不可替换' : '当前安装 · 点击卸下' : preview.op > allowance ? '装配点不足' : '点击安装此联队'}</p>
        {comparing && <p className="equipment-state">对比当前：{current ? nameOf(current) : '空甲板'}</p>}
        <WingInformation wing={preview} current={current} comparing={comparing} />
        <p className="equipment-state">按住 <kbd>Ctrl</kbd> 对比当前联队。</p>
      </EquipmentTooltip>}
    </div>
  </Modal>;
}
