import { useCallback, useEffect, useRef, useState } from 'react';
import { deploymentViewReason, deploymentViewUsed, type DeploymentViewSource } from '../../engine/runtime/DeploymentView';
import { useDeploymentView, useDeploymentSelection } from './useDeploymentView';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { matchesRefitSearch, hullMatchesCategory, hullSearchAliases } from '../../studio/RefitSearch';
import { RefitHint } from '../../studio/RefitHint';
import { useInspectionCodex } from '../../studio/useInspectionCodex';
import { Modal } from '../core/UI';
import { NativeButton } from '../NativeChrome';
import { NativeBitmapText } from '../NativeBitmapText';
import { LoadoutFlyout } from '../LoadoutFlyout';
import { DwellScope } from '../../studio/DwellTooltip';
import { useDeploymentPicker } from './useDeploymentPicker';
import { FleetShipInspection } from './FleetShipInspection';
import { fleetDeploymentRoster, fleetStatusLabels, fleetShipCondition } from './FleetDeploymentRoster';
import './simulation-deployment.css';
import './fleet-deployment.css';

const PAGE_SIZE = 80;
export function FleetDeployment({ source, team, onClose, onDeployed, onDeploy }: {
  source: DeploymentViewSource; team: number; onClose: () => void; onDeployed: () => void; onDeploy: (ids: string[]) => Promise<void>;
}) {
  const { view } = useDeploymentView(source);
  const [selected, setSelected] = useDeploymentSelection<string[]>(source, view.generation + ':' + team, []);
  const [error, setError] = useState('');
  const [busyOwner, setBusyOwner] = useState<{ source: DeploymentViewSource; generation: number; team: number } | null>(null);
  const busy = busyOwner?.source === source && busyOwner.generation === view.generation && busyOwner.team === team;
  const [query, setQuery] = useState(''), [size, setSize] = useState(''), [scope, setScope] = useState('reserve'), [page, setPage] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const pending = useRef(false), mounted = useRef(true), generation = useRef(0);
  const codex = useInspectionCodex();
  const clearHover = useCallback(() => setHoverId(null), []);
  const { picker, closePicker, dismissPicker, hullButtonProps, onRosterScroll, cancelClose, leavePicker, dwell } = useDeploymentPicker(codex.isOpen, clearHover, !busy);
  useEffect(() => {
    mounted.current = true; generation.current++; pending.current = false;
    return () => { mounted.current = false; };
  }, [source, team, view.generation]);
  const roster = fleetDeploymentRoster(view, team), entries = roster.flatMap(hull => hull.entries);
  const picks = entries.filter(entry => selected.includes(entry.id) && entry.status === 'reserve');
  const ids = picks.map(entry => entry.id), cost = picks.reduce((sum, entry) => sum + entry.cost, 0);
  const used = deploymentViewUsed(view, team), limit = view.fleetLimit, over = used + cost > limit;
  const reason = deploymentViewReason(view, ids, team);
  const hulls = roster.map(hull => ({ ...hull, entries: hull.entries.filter(entry =>
    (scope === 'all' || entry.status === scope) && hullMatchesCategory(entry.spec, size) &&
    matchesRefitSearch(query, hull.name, entry.name, hull.id, entry.spec.sourceVariantId ?? '', hullSearchAliases(entry.spec)))
  })).filter(hull => hull.entries.length);
  const pages = Math.max(1, Math.ceil(hulls.length / PAGE_SIZE)), shownPage = Math.min(page, pages - 1);
  // Resolve the open picker against fresh state, not the snapshot from the moment it was opened.
  const activeHull = picker ? hulls.find(hull => hull.id === picker.id) : undefined;
  const hover = entries.find(entry => entry.id === hoverId);
  const filtered = () => { setPage(0); closePicker(); };
  const toggle = (id: string) => {
    if (pending.current) return;
    const entry = entries.find(item => item.id === id);
    if (!entry || entry.status !== 'reserve') { setError('只能选择仍在待命的本队舰船。'); return; }
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); setError('');
  };
  const deploy = async () => {
    if (pending.current) return;
    const currentReason = deploymentViewReason(source.read(), ids, team);
    if (currentReason) { setError(currentReason); return; }
    const token = generation.current, viewGeneration = view.generation;
    const current = () => mounted.current && generation.current === token && source.read().generation === viewGeneration;
    pending.current = true; setBusyOwner({ source, generation: viewGeneration, team }); setError('');
    try {
      await onDeploy(ids);
      if (current()) onDeployed();
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (generation.current === token) pending.current = false; if (current()) setBusyOwner(null); }
  };
  return <><Modal title="舰队增援" className="simulation-deployment fleet-deployment" initialFocus="panel" surface="glass"
    onClose={() => { if (!pending.current && !dismissPicker()) onClose(); }}
    footer={<>
      <RefitHint text={busy ? '等待服务器确认；不会提前关闭或重复发出部署请求。' : reason ?? '确认后从本方边缘入场，并关闭地图。'}><NativeButton disabled={!!reason || busy} onClick={() => void deploy()}>{busy ? '等待部署确认…' : '部署友军'}</NativeButton></RefitHint>
      <NativeButton disabled={!ids.length || busy} onClick={() => { setSelected([]); setError(''); }}>清空选择</NativeButton>
      <NativeButton disabled={busy} onClick={onClose}>取消</NativeButton>
    </>}>
    <div className="sim-deployment-tabs fleet-deployment-team"><NativeBitmapText font="button" color="currentColor">本队舰队</NativeBitmapText><span>战前编成 · 真实后备舰</span></div>
    <div className="sim-deployment-intro"><h2 data-side="ally"><NativeBitmapText font="action" color="currentColor">选择本队增援舰船</NativeBitmapText></h2>
      {hover ? <div className="sim-deployment-detail"><strong>{hover.name}</strong><span>{hover.cost} DP · {fleetStatusLabels[hover.status]} · {fleetShipCondition(hover)}</span><small>保留本场实际武器、插件及联队配装</small></div>
        : <p className="sim-deployment-hint">停留后移入逐艘选择，移出自动收起；点击舰体可立即进入。确认部署后才入场。</p>}
    </div>
    <div className="sim-deployment-filters"><input aria-label="筛选本队舰船" placeholder="舰名 / 舰体ID / 装配" value={query} disabled={busy} onChange={event => { setQuery(event.target.value); filtered(); }} />
      <select aria-label="筛选舰级" value={size} disabled={busy} onChange={event => { setSize(event.target.value); filtered(); }}><option value="">全部舰级</option><option value="STATION">空间站</option><option value="MODULAR">模块化舰体</option><option value="CAPITAL_SHIP">主力舰</option><option value="CRUISER">巡洋舰</option><option value="DESTROYER">驱逐舰</option><option value="FRIGATE">护卫舰</option></select>
      <select aria-label="舰船状态" value={scope} disabled={busy} onChange={event => { setScope(event.target.value); filtered(); }}><option value="reserve">待命舰船</option><option value="all">全部本队舰船</option>{Object.entries(fleetStatusLabels).filter(([status]) => status !== 'reserve').map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>
    </div>
    <div className="sim-deployment-roster" aria-label="本队舰船名单" onScroll={onRosterScroll}>{hulls.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map(hull => {
      const spec = hull.entries[0].spec, count = hull.entries.filter(entry => ids.includes(entry.id)).length;
      const costs = [...new Set(hull.entries.map(entry => entry.cost))], price = costs.length === 1 ? String(costs[0]) : Math.min(...costs) + '–' + Math.max(...costs);
      return <button type="button" key={hull.id} className="sim-deployment-ship" disabled={busy} aria-label={hull.name + ' · ' + hull.entries.length + ' 艘' + (count ? ' · 已选 ' + count : '')}
        aria-pressed={count > 0} data-unavailable={hull.entries.every(entry => entry.status !== 'reserve')}
        {...hullButtonProps(hull.id, () => setHoverId(hull.entries[0].id))}>
        <img src={runtimeAssetUrl(spec.spriteUrl)} alt="" draggable={false} style={{ width: spec.spriteWidth * Math.min(.2, 52 / spec.spriteWidth, 56 / spec.spriteHeight) }} />
        <b>{price}</b><span className="sim-hull-fits">{count ? '已选 ' + count + '/' : ''}{hull.entries.length} 艘</span>
      </button>;
    })}{!hulls.length && <p className="sim-empty">{entries.some(entry => entry.status === 'reserve') ? '没有符合筛选条件的舰船。' : '本队没有待命后备舰。可切换状态查看已部署或已撤离的舰船。'}</p>}</div>
    {picker && activeHull && <DwellScope hover={dwell} native><LoadoutFlyout dwell={dwell} transient element={picker.element} pinned={false} name={activeHull.name} selected={ids} disabled={busy}
      options={activeHull.entries.map(entry => ({ id: entry.id, name: entry.name, cost: entry.cost + ' DP', detail: fleetStatusLabels[entry.status] + ' · ' + fleetShipCondition(entry), error: entry.status === 'reserve' ? undefined : fleetStatusLabels[entry.status] + '，不可再次部署' }))}
      onChoose={toggle} onInspect={setHoverId} onEnter={cancelClose} onLeave={leavePicker} onClose={() => dismissPicker()}
      renderOption={(option, button) => {
        const entry = activeHull.entries.find(item => item.id === option.id)!;
        return <FleetShipInspection ship={entry} name={entry.name} cost={entry.cost} status={fleetStatusLabels[entry.status]} enabled={!codex.isOpen}
          onOpenCodex={codex.open}>{button}</FleetShipInspection>;
      }} /></DwellScope>}
    <div className="sim-deployment-pages"><span>{hulls.length} 种舰体 · {hulls.reduce((sum, hull) => sum + hull.entries.length, 0)} 艘 · 本队待命 {entries.filter(entry => entry.status === 'reserve').length} 艘</span>
      <button type="button" disabled={shownPage === 0 || busy} onClick={() => { setPage(shownPage - 1); closePicker(); }}>上一页</button><span>{shownPage + 1} / {pages}</span><button type="button" disabled={shownPage + 1 >= pages || busy} onClick={() => { setPage(shownPage + 1); closePicker(); }}>下一页</button>
    </div>
    <div className="fleet-deployment-budget"><span>本队部署额度</span><div className="sim-deployment-meter" data-over={over} role="status" aria-label="本队部署点数"><i style={{ width: Math.min(100, (used + cost) / limit * 100) + '%' }} /><span>{used} + {cost} / {limit} DP</span></div></div>
    <div className="sim-deployment-feedback" role="status">{busy ? '部署请求已发送，等待确认…' : error || (ids.length ? reason || '已选择 ' + ids.length + ' 艘 · 本次 +' + cost + ' DP，确认后入场。' : '部署界面不会自动暂停。已撤离、撤退中和已损失舰船不能再次部署。')}</div>
  </Modal>{codex.content}</>;
}
