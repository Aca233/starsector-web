import { MotionPresence } from '../ui/core/MotionPresence';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { Modal } from '../ui/core/UI';
import { data, hulls, createDesign, evaluate, type Design } from '../studio/DesignModel';
import { nativeVariantsForHull } from '../studio/NativeVariantCatalog';
import { LoadoutFlyout, type LoadoutFlyoutOption } from '../ui/LoadoutFlyout';
import { importNativeVariant } from '../studio/NativeVariantImport';
import { matchesRefitSearch, refitSearchRank, hullMatchesCategory, hullSearchAliases, hullAssemblyLabel } from '../studio/RefitSearch';
import { lanHullUnavailable, validateLanDesign } from './LanDesign';
import { roomTeams, teamName, teamColor, type LanConnection, type Room } from './protocol';
import type { AiFleetEdit } from './room-fleet.mjs';
import { submitAiFleet } from './LanAiSync';
import { LanHullThumbnail } from './LanHullThumbnail';
import { groupAiFleet, type AiFleetGroup } from './LanAiGroups';
import { LanDesignPicker } from './LanDesignPicker';
import { LanLoadoutDetails } from './LanLoadoutDetails';
import type { AiEditTarget } from './LanAiEditor';
import { LanAiTeamTabs } from './LanAiTeamTabs';
import { LanAiInspection } from './LanAiInspection';
import { useInspectionCodex, type OpenWeaponCodex } from '../studio/useInspectionCodex';
import { useDwellHover } from '../studio/useDwellHover';
import { DwellScope } from '../studio/DwellTooltip';
import { FactionFilter } from '../studio/FactionFilter';
import { factionIndex, matchesFaction } from '../studio/FactionModel';
import { RefitHint } from '../studio/RefitHint';
import './lan-ai-fleet.css';

const hullName = (hull: string) => data.ships[hull]?.name ?? hull;
type Selection = NonNullable<AiEditTarget['returnSelection']>;
interface AiFitOption { display: LoadoutFlyoutOption; selection: Selection | null }
function aiFitsForHull(hullId: string): AiFitOption[] {
  const native = nativeVariantsForHull(hullId);
  return (native.length ? native : [null]).map(choice => {
    const id = choice?.id ?? 'default-' + hullId, name = choice?.name ?? '舰体默认装配';
    try {
      const imported = choice ? importNativeVariant(choice.raw) : { design: createDesign(hullId), warnings: ['没有独立原版预设，使用舰体默认装配。'] };
      const { op } = evaluate(imported.design);
      let error = ''; try { validateLanDesign(imported.design); } catch (cause) { error = cause instanceof Error ? cause.message : '配装需要修正'; }
      return { selection: { design: imported.design, source: choice ? '原版预设配装' : '舰体默认装配', nativeId: id, warnings: imported.warnings },
        display: { id, name, detail: Object.values(imported.design.weapons).filter(Boolean).length + ' 门武器 · 电容 ' + imported.design.capacitors + ' · 耗散 ' + imported.design.vents,
          cost: op.used + ' OP', error } };
    } catch (cause) { return { selection: null, display: { id, name, detail: '', cost: '', error: cause instanceof Error ? cause.message : '配装不可用' } }; }
  });
}
type FleetChange = (edit: Omit<AiFleetEdit, 'assignment' | 'team'> & {team?:number}, message: string, keepPicker?:boolean) => Promise<boolean>;

/** Editing a number is a draft. Blur never changes the room. */
function FleetQuantity({ count, label, disabled, onCommit }: {
  count: number; label: string; disabled: boolean; onCommit: (count: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{ value: string; base: number } | null>(null);
  const value = draft?.base === count ? draft.value : String(count);
  const dirty = value !== String(count);
  const commit = async () => { if (dirty && !disabled && await onCommit(Number(value))) setDraft(null); };
  return <div className="lan-ai-quantity">
    <input type="number" min="1" step="1" aria-label={label} value={value} disabled={disabled}
      onChange={event => setDraft({ value: event.target.value, base: count })}
      onKeyDownCapture={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void commit(); } }}/>
    <span>艘</span>
    {dirty && <><NativeButton disabled={disabled} onClick={() => void commit()}>应用数量</NativeButton>
      <button type="button" disabled={disabled} onClick={() => setDraft(null)}>取消</button></>}
  </div>;
}

function FleetGroupRow({ group, teams, team, revision, disabled, change, onEdit, onView, onReuse, onOpenCodex }: {
  group: AiFleetGroup; teams: number[]; team: number; revision: number; disabled: boolean; change: FleetChange;
  onOpenCodex: OpenWeaponCodex; onEdit: (group: AiFleetGroup, scope: 'group' | 'one') => void; onView: (group: AiFleetGroup) => void; onReuse:(group:AiFleetGroup)=>void;
}) {
  const [removing, setRemoving] = useState<number | null>(null), [more,setMore]=useState(false);
  const [destination, setDestination] = useState('');
  const others=teams.filter(t=>t!==team);
  const moveTo=destination!==''&&others.includes(Number(destination))?destination:others.length===1?String(others[0]):'';
  return <article className="lan-ai-roster-row" data-loadout-key={group.loadoutKey} aria-label={hullName(group.hull) + ' ' + group.name}>
    <header><LanAiInspection entry={{...group, defaultLoadout:true}} onOpenCodex={onOpenCodex}><button type="button" className="lan-ai-ship-inspect" aria-label={'查看 '+group.name+'的配装'} onClick={()=>onView(group)}>
      <LanHullThumbnail hull={group.hull} name={hullName(group.hull)}/></button></LanAiInspection>
      <LanAiInspection entry={{...group, defaultLoadout:true}} onOpenCodex={onOpenCodex}><div><strong>{hullName(group.hull)}</strong><span>{group.name}</span></div></LanAiInspection>
      <NativeButton disabled={disabled} onClick={()=>onEdit(group,'group')}>{group.count===1?'改装':'整组改装'}</NativeButton></header>
    <div className="lan-ai-row-controls">
      <NativeButton aria-label={(group.count===1?'移除最后一艘 ':'减少一艘 ')+group.name} disabled={disabled}
        title={group.count===1?'确认后移除最后一艘':'减少一艘'} onClick={()=>{if(group.count===1)setRemoving(revision);else void change({operation:'adjust',hull:group.loadoutKey,count:-1},'已减少 1 艘');}}>−</NativeButton>
      <FleetQuantity count={group.count} label={hullName(group.hull)+' '+group.name+'数量'} disabled={disabled}
        onCommit={count=>change({operation:'set-count',hull:group.loadoutKey,count},'数量已更新')}/>
      <NativeButton aria-label={'增加一艘 '+group.name} disabled={disabled} onClick={()=>void change({operation:'adjust',hull:group.loadoutKey,count:1},'已增加 1 艘')}>＋</NativeButton>
      <button type="button" disabled={disabled} onClick={()=>onReuse(group)}>复用配装</button>
      <button type="button" className="lan-ai-more" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'收起操作':'更多操作'}</button>
    </div>
    {more&&<div className="lan-ai-secondary-actions">
      <div className="lan-ai-row-actions"><button type="button" onClick={()=>onView(group)}>查看配装</button>
        {group.count>1&&<button type="button" disabled={disabled} onClick={()=>onEdit(group,'one')}>拆出 1 艘改装</button>}
        <button type="button" className="lan-ai-delete" disabled={disabled} onClick={()=>setRemoving(revision)}>删除整组</button></div>
      {others.length>0&&<div className="lan-ai-move"><label>目标队伍 <select aria-label={hullName(group.hull)+' '+group.name+'目标队伍'} disabled={disabled} value={moveTo} onChange={event=>setDestination(event.target.value)}>
        <option value="">请选择队伍</option>{others.map(t=><option value={t} key={t}>{teamName(t)}</option>)}</select></label>
        <button type="button" disabled={disabled||moveTo===''} onClick={()=>void change({operation:'add',team:Number(moveTo),hull:group.loadoutKey,count:group.count},'已复制 '+group.count+' 艘到 '+teamName(Number(moveTo))+'，原队保留')}>复制整组到{moveTo===''?'目标队':teamName(Number(moveTo))}</button>
        <button type="button" disabled={disabled||moveTo===''} onClick={()=>void change({operation:'move',hull:group.loadoutKey,targetTeam:Number(moveTo)},'已将 '+group.count+' 艘移至 '+teamName(Number(moveTo)))}>移动整组到{moveTo===''?'目标队':teamName(Number(moveTo))}</button>
      </div>}
    </div>}
    {removing===revision&&<div className="lan-ai-remove-note" role="group" aria-label="删除确认"><span>删除「{group.name}」全部 {group.count} 艘？</span>
      <NativeButton disabled={disabled} onClick={async()=>{if(await change({operation:'remove',hull:group.loadoutKey},'已删除该方案组'))setRemoving(null);}}>确认删除</NativeButton>
      <button type="button" disabled={disabled} onClick={()=>setRemoving(null)}>取消</button></div>}
  </article>;
}

/** Selection is local; only explicit, acknowledged commands mutate the room. */
export function LanAiFleet({ room, isHost, editable, connection, currentDesign, onEdit, openInitially = false, initialTeam = 1, initialQuery = '', initialHullClass = '', initialFaction = '', initialBatch = '1', initialSelection = null, initialScroll, openRequest, entryDisabled = false }: {
  room: Room; isHost: boolean; editable: boolean; connection: LanConnection; currentDesign: Design; onEdit: (target: AiEditTarget) => void;
  entryDisabled?: boolean;
  initialScroll?:AiEditTarget["returnScroll"];
  openRequest?: {sequence:number;team:number}; openInitially?: boolean; initialTeam?: number; initialQuery?: string; initialHullClass?: string; initialFaction?: string; initialBatch?: string; initialSelection?: Selection | null;
}) {
  const codex = useInspectionCodex();
  const [open, setOpen] = useState(!!openRequest||openInitially), [team, setTeam] = useState(openRequest?.team??initialTeam);
  const [lastOpenRequest,setLastOpenRequest]=useState(openRequest);
  if(lastOpenRequest!==openRequest){setLastOpenRequest(openRequest);if(openRequest){setTeam(openRequest.team);setOpen(true);}}
  const catalogElement=useRef<HTMLDivElement>(null), rosterElement=useRef<HTMLDivElement>(null);
  const scroll=useRef(initialScroll??{catalog:0,roster:0});
  useLayoutEffect(()=>{if(open){if(catalogElement.current)catalogElement.current.scrollTop=scroll.current.catalog;if(rosterElement.current)rosterElement.current.scrollTop=scroll.current.roster;}},[open]);
  const [query, setQuery] = useState(initialQuery), [batch, setBatch] = useState(initialBatch);
  const [hullClass, setHullClass] = useState(initialHullClass), [faction, setFaction] = useState(initialFaction);
  const searchElement = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection | null>(initialSelection);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [pending, setPending] = useState(false);
  const selectionErrors = useMemo(() => {
    if (!selection) return [];
    try { validateLanDesign(selection.design); return []; }
    catch (e) { return [e instanceof Error ? e.message : '此配装需要修正']; }
  }, [selection]);
  const loadoutStats = useMemo(() => {
    if (!selection) return null;
    try { return evaluate(selection.design).op; } catch { return null; }
  }, [selection]);
  const [viewing, setViewing] = useState<{ hull: string; name: string; design: Design | null; warnings?: string[] } | null>(null);
  // The selector is the enterable parent of the inspection chain, not a permanently pinned window.
  // Depth -1 leaves all three information levels available below it.
  const pickerHover = useDwellHover({ depth: -1, enabled: open });
  const { hide: closePicker, keep: cancelPickerClose, leave: leavePicker } = pickerHover;
  const picker = pickerHover.active ? { hullId: pickerHover.active.id, element: pickerHover.active.anchor as HTMLButtonElement } : null;
  const openPicker = (hullId: string, element: HTMLButtonElement, immediate: boolean) => {
    if (!pending && !codex.isOpen) pickerHover.show(hullId, element, immediate);
  };
  const pickerHull = pickerHover.active?.id;
  const pickerOptions = useMemo(() => pickerHull ? aiFitsForHull(pickerHull) : [], [pickerHull]);
  const busy = useRef(false), abort = useRef(new AbortController());
  useEffect(() => { const controller = new AbortController(); abort.current = controller; return () => controller.abort(); }, []);
  const solo = room.options.assignment === 'solo', activeTeam = solo ? 0 : Math.max(0, Math.min(team, room.options.aiHulls.length - 1));
  const canEdit = isHost && editable, disabled = !canEdit || pending;
  const allGroups = groupAiFleet(room.options), groups = allGroups.filter(g => solo || g.team === activeTeam);
  const total = allGroups.reduce((s, g) => s + g.count, 0), shown = groups.reduce((s, g) => s + g.count, 0);
  const teams = roomTeams(room.options), teamLabel = solo ? '个人战 · 每艘独立成队' : teamName(activeTeam);
  const searchMatches = hulls.filter(spec => matchesRefitSearch(query, spec.id, data.ships[spec.id].name, data.ships[spec.id].designation, data.ships[spec.id].manufacturer, hullSearchAliases(spec)));
  const factionMatches = searchMatches.filter(spec => matchesFaction(faction, factionIndex.hullFactions[spec.id]));
  const candidates = factionMatches.filter(spec => hullMatchesCategory(spec, hullClass))
    .sort((a, b) => refitSearchRank(query, data.ships[a.id].name, a.id) - refitSearchRank(query, data.ships[b.id].name, b.id));
  const filterChanged = () => { closePicker(); scroll.current.catalog = 0; if (catalogElement.current) catalogElement.current.scrollTop = 0; };
  const resetFilters = () => { filterChanged(); setQuery(''); setHullClass(''); setFaction(''); };
  const count = Number(batch), validCount = Number.isSafeInteger(count) && count > 0;
  const change: FleetChange = async (edit, message, keepPicker=false) => {
    if (!canEdit || busy.current) return false;
    if(!keepPicker)closePicker(); busy.current = true; setPending(true); setError(''); setNotice('');
    try {
      await submitAiFleet(connection, room.code, room.options, { ...edit, assignment: room.options.assignment, team: edit.team??activeTeam }, abort.current.signal);
      setNotice(message + ' · 服务器已确认'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '无法修改 AI 编成'); return false; }
    finally { busy.current = false; setPending(false); }
  };
  const selectDesign = (design: Design, source: string) => {
    try { closePicker(); setSelection({ design: validateLanDesign(design), source }); setError(''); setNotice(''); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '方案不可用'); return false; }
  };
  const reuseGroup=(group:AiFleetGroup)=>{
    try{if(selectDesign(group.design??createDesign(group.hull),'编成中复用的配装'))setNotice('已选用「'+group.name+'」；可切队或改数量后添加，现有编成不变。');}
    catch(e){setError(e instanceof Error?e.message:'无法复用此配装');}
  };
  const quickAdd=async(id:string,targetTeam:number)=>{
    if(disabled||busy.current||!validCount)return;
    if(!solo&&!teams.includes(targetTeam)){setError('目标队伍已变化，请重新选择');return;}
    const option=pickerOptions.find(option=>option.display.id===id);
    if(!option?.selection||option.display.error){setError(option?.display.error??'配装不可用');return;}
    setSelection(option.selection);cancelPickerClose();
    const destination=solo?'独立阵营':teamName(targetTeam);
    if(await change({operation:'add',team:solo?0:targetTeam,design:option.selection.design,count},'已添加 '+count+' 艘至 '+destination,true)&&!solo)setTeam(targetTeam);
  };
  const switchTeam=(next:number)=>{if(busy.current)return;closePicker();setTeam(next);setError('');setNotice('');};
  const returnState = () => ({ returnQuery: query, returnHullClass: hullClass, returnFaction: faction, returnBatch: batch, returnSelection: selection, returnScroll:{...scroll.current} });
  const editGroup = (group: AiFleetGroup, scope: 'group' | 'one') => {
    if (disabled) return;
    try {
      const design = group.design ?? createDesign(group.hull);
      onEdit({ design, hull: group.loadoutKey, scope, count: scope === 'one' ? 1 : group.count, team: activeTeam,
        assignment: room.options.assignment, baseRevision: room.options.aiRevision ?? 0, ...returnState() });
      closePicker(); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : '无法改装'); }
  };
  const createCustom = () => {
    if (disabled || !selection || !validCount) return;
    onEdit({ design: selection.design, scope: 'add', count, team: activeTeam, assignment: room.options.assignment,
      baseRevision: room.options.aiRevision ?? 0, ...returnState() });
    closePicker(); setOpen(false);
  };
  const close = () => { if (!busy.current) { closePicker(); setOpen(false); setError(''); setNotice(''); } };
  return <div className="lan-ai-summary">
    <NativeButton disabled={entryDisabled} onClick={() => setOpen(true)}>{isHost?"添加 / 批量管理 AI":"查看 AI 编成"} · {total} 艘</NativeButton>
    <small>{total ? (solo ? '每艘独立成队 · 按配装归组显示' : '同型舰按配装分组') : '未添加 AI · 不占真人席位'}</small>
    <MotionPresence>{open && <Modal title="AI 舰船编成" eyebrow="停留后移入 · 移出收起 · 点击目标队伍才添加" className="lan-ai-fleet-modal" surface="solid" width="wide" onClose={pending ? undefined : () => { if (picker) { const button = picker.element; closePicker(); button.focus(); closePicker(); } else close(); }}
      footer={<><span className="lan-ai-footer-note">全房间 {total} 艘 · 当前 {shown} 艘 / {groups.length} 个方案</span><NativeButton disabled={pending} onClick={close}>完成编成</NativeButton></>}>
      <div className="lan-ai-workbench">
        {solo?<strong className="lan-ai-solo-heading">{teamLabel}</strong>:<LanAiTeamTabs room={room} activeTeam={activeTeam} disabled={pending} onChange={switchTeam}/>}
        <div className="lan-ai-teambar"><label>每次添加 <input aria-label="每次添加数量" type="number" min="1" step="1" value={batch} disabled={disabled} onChange={event=>setBatch(event.target.value)}/> 艘</label>
          <div className="lan-ai-batch-presets" role="group" aria-label="常用添加数量">{[1,5,10].map(n=><button key={n} type="button" aria-pressed={batch===String(n)} disabled={disabled} onClick={()=>setBatch(String(n))}>{n} 艘</button>)}</div>
          <span>{solo?'每艘独立成队，不是友军。':'指向配装，再点右侧队伍；上方标签切换编成视图'}</span>
        </div>
        <div className="lan-ai-feedback" aria-live="polite" aria-atomic="true">
          {error ? <p className="lan-error" role="alert">{error}</p> : <p>{pending ? '正在提交，请等待服务器确认…' : notice || (!isHost ? '仅房主可修改；你可以选船、切队和查看配装。' : !editable ? '房间当前不可编辑，请等待连接恢复或对局结束。' : '选船不会添加；修改已确认后会取消全员准备。')}</p>}
        </div>
        <div className="lan-ai-panes" id="lan-ai-team-panel" role="tabpanel" aria-label={teamLabel}>
          <section className="lan-ai-picker-pane" aria-label="选择 AI 舰船方案">
            <h3>1 · 选择舰船 / 方案</h3>
            <div className="lan-ai-source-tools"><NativeButton disabled={pending} onClick={() => selectDesign(currentDesign, '我的当前设计副本')}>复制我的当前设计</NativeButton>
              <LanDesignPicker disabled={pending} onSelect={design => selectDesign(design, '已存 / 导入方案')} returnLabel="返回 AI 编成"/></div>
            <div className="refit-roster-filters lan-ai-catalog-filters" aria-label="AI 舰船筛选">
              <div className="refit-search-field">
                <input ref={searchElement} type="search" autoComplete="off" aria-label="搜索 AI 舰船" value={query}
                  onChange={event => { filterChanged(); setQuery(event.target.value); }} placeholder="搜索舰船名称 / ID"
                  onKeyDown={event => {
                    if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); filterChanged(); setQuery(''); }
                    if (event.key === 'ArrowDown') { event.preventDefault(); catalogElement.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }
                  }}/>
                {query && <button type="button" className="refit-search-clear" aria-label="清空 AI 舰船搜索" onClick={() => { filterChanged(); setQuery(''); searchElement.current?.focus(); }}>×</button>}
              </div>
              <div className="refit-class-chips" role="group" aria-label="AI 舰级筛选">
                {([['','全部'],['FRIGATE','护卫'],['DESTROYER','驱逐'],['CRUISER','巡洋'],['CAPITAL_SHIP','主力']] as const).map(([id, name]) =>
                  <RefitHint key={id} text={id ? name+'舰（'+factionMatches.filter(spec => spec.hullSize === id).length+' 艘）' : '显示所有舰级'}>
                    <NativeButton font="caption" aria-pressed={hullClass === id} onClick={() => { filterChanged(); setHullClass(id); }}>{name}</NativeButton>
                  </RefitHint>)}
              </div>
              <div className="refit-assembly-chips" role="group" aria-label="AI 模块化舰体筛选">
                {([['STATION','空间站'],['MODULAR','模块化']] as const).map(([id,name]) =>
                  <RefitHint key={id} text={'显示全部'+name+'舰体；同时清除名称和势力筛选'}>
                    <NativeButton font="caption" aria-pressed={hullClass === id} onClick={() => { filterChanged(); setHullClass(id); setQuery(''); setFaction(''); }}>{name} · {hulls.filter(spec => hullMatchesCategory(spec, id)).length}</NativeButton>
                  </RefitHint>)}
              </div>
              <FactionFilter label="AI 舰船势力筛选" value={faction} onChange={value => { filterChanged(); setFaction(value); }}
                memberships={searchMatches.filter(spec => hullMatchesCategory(spec, hullClass)).map(spec => factionIndex.hullFactions[spec.id] ?? [])}/>
              <div className="refit-filter-actions"><span role="status">{candidates.length} / {hulls.length} 种舰体</span>
                {(query || hullClass || faction) && <button type="button" onClick={resetFilters}>重置筛选</button>}
              </div>
            </div>
            <div className="lan-ai-catalog-grid" ref={catalogElement} onScroll={event=>{scroll.current.catalog=event.currentTarget.scrollTop;}}>
              {!candidates.length && <p className="lan-muted">没有匹配的舰船，请调整条件或重置筛选。</p>}
              {candidates.map(spec => { const reason = lanHullUnavailable(spec), fits = nativeVariantsForHull(spec.id);
                return <button type="button" className="lan-ai-catalog-choice" data-ai-loadout-anchor key={spec.id} disabled={pending || !!reason}
                  title={reason} aria-pressed={selection?.design.hullId === spec.id} aria-expanded={picker?.hullId === spec.id}
                  aria-controls={picker?.hullId === spec.id ? pickerHover.tooltipId : undefined} aria-label={'选择 ' + hullName(spec.id) + ' 舰体'}
                  onMouseEnter={event => openPicker(spec.id, event.currentTarget, false)} onMouseLeave={leavePicker}
                  onFocus={event => { if(event.currentTarget.matches(':focus-visible'))openPicker(spec.id, event.currentTarget, true); }} onBlur={leavePicker}
                  onClick={event => openPicker(spec.id, event.currentTarget, true)}>
                  <LanHullThumbnail hull={spec.id} name={hullName(spec.id)}/><span>{hullName(spec.id)}</span><small>{hullAssemblyLabel(spec) && hullAssemblyLabel(spec)+' · '}{fits.length || 1} 项配装</small>
                </button>;
              })}
            </div>
            <div className="lan-ai-selection" aria-label="待添加方案">
              {selection ? <>
                <div className="lan-ai-picked-heading"><strong>{selection.design.name}</strong>
                  <LanAiInspection entry={{hull:selection.design.hullId,name:selection.design.name,design:selection.design,warnings:selection.warnings}} onOpenCodex={codex.open}><button type="button" onClick={() => setViewing({ hull: selection.design.hullId, name: selection.design.name, design: selection.design, warnings: selection.warnings })}>查看配装{selection.warnings?.length ? ' / 适配说明' : ''}</button></LanAiInspection>
                  <button type="button" disabled={disabled || !validCount} onClick={createCustom}>改装</button></div>
                <p className="lan-ai-fit-stats" aria-label="待添加配装摘要">{Object.values(selection.design.weapons).filter(Boolean).length} 门武器 · 电容 {selection.design.capacitors} · 耗散 {selection.design.vents}{loadoutStats && ' · ' + loadoutStats.used + '/' + loadoutStats.total + ' OP'}</p>
                {!!selectionErrors.length && <p className="lan-error" role="alert">{selectionErrors.join('；')}。需先改装修正。</p>}
                <div className="lan-ai-add-controls"><span>{selection.source}</span>
                  <NativeButton disabled={disabled || !validCount || selectionErrors.length > 0} onClick={() => void change({ operation: 'add', design: selection.design, count }, '已添加 ' + count + ' 艘至 ' + teamLabel)}>
                    {validCount ? '添加 ' + count + ' 艘' + (solo ? ' · 各自成队' : '到 ' + teamName(activeTeam)) : '数量须为正整数'}</NativeButton></div>
              </> : <p>指向舰体，停留后移入配装框，再点目标队伍添加。也可点击舰体直接进入；移出会收起，已选方案保留。</p>}
            </div>
          </section>
          <section className="lan-ai-roster-pane" aria-label="当前 AI 编成"><h3>2 · {teamLabel}<span>{shown} 艘</span></h3>
            <div className="lan-ai-roster-list" ref={rosterElement} onScroll={event=>{scroll.current.roster=event.currentTarget.scrollTop;}}>
              {!groups.length && <div className="lan-ai-empty">此处还没有 AI 舰船。<br/>左侧选择方案，再点击「添加」。</div>}
              {groups.map(group => <FleetGroupRow key={group.key} group={group} teams={solo ? [] : teams} team={activeTeam} revision={room.options.aiRevision ?? 0}
                disabled={disabled} change={change} onEdit={editGroup} onView={setViewing} onReuse={reuseGroup} onOpenCodex={codex.open}/>) }
            </div>
          </section>
        </div>
      </div>
      {picker && <DwellScope hover={pickerHover} native><LoadoutFlyout dwell={pickerHover} element={picker.element} pinned={false} transient name={hullName(picker.hullId)} options={pickerOptions.map(option => option.display)}
        renderOption={(display, button) => {
          const fit = pickerOptions.find(option => option.display.id === display.id)?.selection;
          return <LanAiInspection entry={{hull:picker.hullId,name:display.name,design:fit?.design??null,warnings:fit?.warnings,error:display.error}}
            enabled={!pending && !codex.isOpen} onOpenCodex={codex.open}>{button}</LanAiInspection>;
        }}
        disabled={pending} destinations={isHost?{label:validCount?'添加 '+count+' 艘到':'数量须为正整数',disabled:disabled||!validCount,
          choices:solo?[{id:'0',name:'独立阵营',detail:'每艘独立成队，不是友军'}]:teams.map(target=>({id:String(target),name:teamName(target),color:teamColor(target),detail:(room.options.aiHulls[target]?.length??0)+' AI · '+room.members.filter(member=>member.team===target).length+' 人'})),
          onChoose:(id,target)=>void quickAdd(id,Number(target)),status:pending?'正在提交，请等待确认…':error||notice}:undefined}
        selected={selection?.nativeId ? [selection.nativeId] : []} onEnter={cancelPickerClose} onLeave={leavePicker} onClose={() => { const button = picker.element; closePicker(); button.focus(); closePicker(); }}
        onChoose={id => { if(pending)return;const option = pickerOptions.find(option => option.display.id === id); if (!option?.selection) { setError(option?.display.error ?? '配装不可用'); return; }
          setSelection(option.selection); setError(''); setNotice('');
          if(isHost){cancelPickerClose();}
          else {const button = picker.element; closePicker(); button.focus(); closePicker();} }}/></DwellScope>
      }
    </Modal>}</MotionPresence>
    {codex.content}
    <MotionPresence>{viewing && <LanLoadoutDetails member={viewing} warnings={viewing.warnings} returnLabel="返回 AI 编成" onClose={() => setViewing(null)}/>}</MotionPresence>
  </div>;
}
