import { useCallback, useEffect, useRef, useState } from 'react';
import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { matchesRefitSearch, hullMatchesCategory, hullSearchAliases } from '../../studio/RefitSearch';
import { RefitHint } from '../../studio/RefitHint';
import { useInspectionCodex } from '../../studio/useInspectionCodex';
import { Modal } from '../core/UI';
import { NativeButton } from '../NativeChrome';
import { NativeBitmapText } from '../NativeBitmapText';
import { LoadoutFlyout } from '../LoadoutFlyout';
import { useDeploymentPicker } from './useDeploymentPicker';
import { FleetShipInspection } from './FleetShipInspection';
import { fleetDeploymentRoster, fleetStatusLabels, fleetShipCondition } from './FleetDeploymentRoster';
import './simulation-deployment.css';
import './fleet-deployment.css';

const PAGE_SIZE = 80;
export function FleetDeployment({ engine, team, onClose, onDeployed, onDeploy }: {
  engine: CombatEngine; team: number; onClose: () => void; onDeployed: () => void; onDeploy?: (ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [size, setSize] = useState(''), [scope, setScope] = useState('reserve'), [page, setPage] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const pending = useRef(false), mounted = useRef(true);
  const codex = useInspectionCodex();
  const clearHover = useCallback(() => setHoverId(null), []);
  const { picker, closePicker, dismissPicker, hullButtonProps, onRosterScroll, cancelClose, leavePicker, inspectionLockChanged } = useDeploymentPicker<string>(codex.isOpen, clearHover);
  const [, refresh] = useState(0);
  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => {
      refresh(n => n + 1);
      const available = new Set(engine.deployment.snapshot().rows.filter(row => row.teamId === team && row.status === 'reserve').map(row => row.id));
      setSelected(current => { const next = current.filter(id => available.has(id)); return next.length === current.length ? current : next; });
    }, 200);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [engine, team]);
  const roster = fleetDeploymentRoster(engine, team), entries = roster.flatMap(hull => hull.entries);
  const picks = entries.filter(entry => selected.includes(entry.id) && entry.status === 'reserve');
  const ids = picks.map(entry => entry.id), cost = picks.reduce((sum, entry) => sum + entry.cost, 0);
  const used = engine.deployment.used(team), limit = engine.deployment.limit, over = used + cost > limit;
  const reason = engine.deployment.reason(ids, team);
  const hulls = roster.map(hull => ({ ...hull, entries: hull.entries.filter(entry =>
    (scope === 'all' || entry.status === scope) && hullMatchesCategory(entry.ship.spec, size) &&
    matchesRefitSearch(query, hull.name, entry.name, hull.id, entry.ship.spec.sourceVariantId ?? '', hullSearchAliases(entry.ship.spec)))
  })).filter(hull => hull.entries.length);
  const pages = Math.max(1, Math.ceil(hulls.length / PAGE_SIZE)), shownPage = Math.min(page, pages - 1);
  // Resolve the open picker against fresh state, not the snapshot from the moment it was opened.
  const activeHull = picker ? hulls.find(hull => hull.id === picker.hull) : undefined;
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
    const currentReason = engine.deployment.reason(ids, team);
    if (currentReason) { setError(currentReason); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      if (onDeploy) await onDeploy(ids); else engine.deployment.deploy(ids, team);
      if (mounted.current) onDeployed();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
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
      {hover ? <div className="sim-deployment-detail"><strong>{hover.name}</strong><span>{hover.cost} DP · {fleetStatusLabels[hover.status]} · {fleetShipCondition(hover.ship)}</span><small>保留本场实际武器、插件及联队配装</small></div>
        : <p className="sim-deployment-hint">悬停预览配装，点击舰体固定窗口后逐艘选择。仅能部署本队待命舰船。</p>}
    </div>
    <div className="sim-deployment-filters"><input aria-label="筛选本队舰船" placeholder="舰名 / 舰体ID / 装配" value={query} disabled={busy} onChange={event => { setQuery(event.target.value); filtered(); }} />
      <select aria-label="筛选舰级" value={size} disabled={busy} onChange={event => { setSize(event.target.value); filtered(); }}><option value="">全部舰级</option><option value="STATION">空间站</option><option value="MODULAR">模块化舰体</option><option value="CAPITAL_SHIP">主力舰</option><option value="CRUISER">巡洋舰</option><option value="DESTROYER">驱逐舰</option><option value="FRIGATE">护卫舰</option></select>
      <select aria-label="舰船状态" value={scope} disabled={busy} onChange={event => { setScope(event.target.value); filtered(); }}><option value="reserve">待命舰船</option><option value="all">全部本队舰船</option>{Object.entries(fleetStatusLabels).filter(([status]) => status !== 'reserve').map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>
    </div>
    <div className="sim-deployment-roster" aria-label="本队舰船名单" onScroll={onRosterScroll}>{hulls.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map(hull => {
      const spec = hull.entries[0].ship.spec, count = hull.entries.filter(entry => ids.includes(entry.id)).length;
      const costs = [...new Set(hull.entries.map(entry => entry.cost))], price = costs.length === 1 ? String(costs[0]) : Math.min(...costs) + '–' + Math.max(...costs);
      return <button type="button" key={hull.id} className="sim-deployment-ship" disabled={busy} aria-label={hull.name + ' · ' + hull.entries.length + ' 艘' + (count ? ' · 已选 ' + count : '')}
        aria-expanded={activeHull?.id === hull.id} aria-controls={activeHull?.id === hull.id ? 'sim-loadout-picker' : undefined} aria-pressed={count > 0} data-unavailable={hull.entries.every(entry => entry.status !== 'reserve')}
        {...hullButtonProps(hull.id, () => setHoverId(hull.entries[0].id))}>
        <img src={runtimeAssetUrl(spec.spriteUrl)} alt="" draggable={false} style={{ width: spec.spriteWidth * Math.min(.2, 52 / spec.spriteWidth, 56 / spec.spriteHeight) }} />
        <b>{price}</b><span className="sim-hull-fits">{count ? '已选 ' + count + '/' : ''}{hull.entries.length} 艘</span>
      </button>;
    })}{!hulls.length && <p className="sim-empty">{entries.some(entry => entry.status === 'reserve') ? '没有符合筛选条件的舰船。' : '本队没有待命后备舰。可切换状态查看已部署或已撤离的舰船。'}</p>}</div>
    {picker && activeHull && <LoadoutFlyout element={picker.element} pinned={picker.pinned} name={activeHull.name} selected={ids} disabled={busy}
      options={activeHull.entries.map(entry => ({ id: entry.id, name: entry.name, cost: entry.cost + ' DP', detail: fleetStatusLabels[entry.status] + ' · ' + fleetShipCondition(entry.ship), error: entry.status === 'reserve' ? undefined : fleetStatusLabels[entry.status] + '，不可再次部署' }))}
      onChoose={toggle} onInspect={setHoverId} onEnter={cancelClose} onLeave={leavePicker} onClose={() => dismissPicker()}
      renderOption={(option, button) => {
        const entry = activeHull.entries.find(item => item.id === option.id)!;
        return <FleetShipInspection ship={entry.ship} name={entry.name} cost={entry.cost} status={fleetStatusLabels[entry.status]} enabled={!codex.isOpen}
          onLockChange={inspectionLockChanged} onOpenCodex={codex.open}>{button}</FleetShipInspection>;
      }} />}
    <div className="sim-deployment-pages"><span>{hulls.length} 种舰体 · {hulls.reduce((sum, hull) => sum + hull.entries.length, 0)} 艘 · 本队待命 {entries.filter(entry => entry.status === 'reserve').length} 艘</span>
      <button type="button" disabled={shownPage === 0 || busy} onClick={() => { setPage(shownPage - 1); closePicker(); }}>上一页</button><span>{shownPage + 1} / {pages}</span><button type="button" disabled={shownPage + 1 >= pages || busy} onClick={() => { setPage(shownPage + 1); closePicker(); }}>下一页</button>
    </div>
    <div className="fleet-deployment-budget"><span>本队部署额度</span><div className="sim-deployment-meter" data-over={over} role="status" aria-label="本队部署点数"><i style={{ width: Math.min(100, (used + cost) / limit * 100) + '%' }} /><span>{used} + {cost} / {limit} DP</span></div></div>
    <div className="sim-deployment-feedback" role="status">{busy ? '部署请求已发送，等待确认…' : error || (ids.length ? reason || '已选择 ' + ids.length + ' 艘 · 本次 +' + cost + ' DP，确认后入场。' : '部署界面不会自动暂停。已撤离、撤退中和已损失舰船不能再次部署。')}</div>
  </Modal>{codex.content}</>;
}
