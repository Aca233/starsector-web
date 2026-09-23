import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  NativeColonyAction as NativeColonyQueueAction, NativeColonyBlocker, NativeColonyIndustry,
  NativeColonyManagementView, NativeColonyMarketRow, NativeColonyQueueItem,
} from '../../../server/campaign/native/ColonyManagement.mjs';
import type { OriginalColonyConstructionBuildInspection, OriginalColonyConstructionBuildOption } from '../rules/OriginalColonyConstructionCommands.mjs';
import type { DeepReadonly } from '../Types.js';
import { NativeBitmapText } from '../../ui/NativeBitmapText';
import { campaignAsset } from './BodyRenderer';
import { CoreScreen } from './CoreScreens';
import './NativeColonyManagement.css';

export type NativeColonyAction = NativeColonyQueueAction
  | { kind: 'inspect-build'; marketId: string }
  | { kind: 'build'; marketId: string; industryId: string; expectedCost: number };
export type NativeColonyManagementAction = NativeColonyAction;
export interface NativeColonyBuildOptions {
  marketId: string;
  /** The explicit mutation transaction result, never GET view.buildOptions. */
  inspection: DeepReadonly<OriginalColonyConstructionBuildInspection>;
}
type BuildOption = DeepReadonly<OriginalColonyConstructionBuildOption>;
export interface NativeColonyManagementProps {
  /** null = host has not configured management ownership; rows:[] = a real empty list. */
  view: NativeColonyManagementView | null;
  locked: boolean;
  pending?: boolean;
  buildOptions?: NativeColonyBuildOptions | null;
  /** Post-inspection world revision captured by the host alongside buildOptions. */
  quoteRevision?: number | null;
  /** Current authoritative world revision, not a local request counter. */
  revision?: number | null;
  /** Resolve only after authoritative refresh. false means rejected/deferred; never treat it as success. */
  onAction?: (action: NativeColonyAction) => void | Promise<unknown>;
  onClose: () => void;
  notice?: ReactNode;
}

const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const count = (value: number | null) => value !== null && Number.isFinite(value) ? integer.format(Math.trunc(value)) : '—';
const number = (value: number | null) => value !== null && Number.isFinite(value) ? decimal.format(value) : '—';
const unavailable = '权威投影未提供；不以零或空集合替代';
const commandUnavailable = '主线尚未接入此权威事务';
const blockerLabels: Readonly<Record<string, string>> = {
  NATIVE_COLONY_FINANCE_CONTEXT_UNAVAILABLE: '缺少已授权的付款或退款上下文',
  NATIVE_COLONY_PERMISSION_NOT_EVALUATED: '尚未核实建设管理权限',
  NATIVE_COLONY_PERMISSION_UNAVAILABLE: '无法读取建设管理权限',
  NATIVE_COLONY_QUEUE_NOT_ACTIONABLE: '待建队列身份或费用数据不完整',
  NATIVE_COLONY_QUEUE_NO_SWAP_TARGET: '没有其他可交换的待建项目',
  NATIVE_COLONY_MARKET_UNAVAILABLE: '实际市场对象不可用',
  NATIVE_COLONY_BUILD_NOT_EVALUATED: '尚未通过显式事务核实建设候选',
};
const explain = (reason: string) => blockerLabels[reason] ?? reason;
const tabs = ['殖民地 & 仓库 [1]', '订单 [2]', '收益 [3]', '舰队学说 & 蓝图 [4]', '蓝图生产 [5]'];
const columns = [
  ['名称', '原版按建立日期排序；建立时间与仓库分类尚未投影'],
  ['环境', '原版显示天然行星状况；当前只有星体类型ID与危险度，天然状况图标和排序尚未投影'],
  ['位置', '原版为相对于舰队的位置图；当前只提供星系名与超空间坐标，不伪造距离/燃料成本'],
  ['稳定', '稳定性。完整原版排序还需仓库分类和次级排序字段'],
  ['规模', '殖民地规模。人口增长百分比与完整排序字段未提供'],
  ['净收益', '当前每月净收益估计，不是已经结算的收入或玩家现金'],
  ['科技', '已安装的AI核心与特殊物品；未提供该列表，不能用科技等级代替'],
  ['管理员', '负责管理该殖民地的人物；分配与原版排序未接入'],
] as const;

function fieldReason(market: NativeColonyMarketRow, field: string) {
  const codes = market.blockers.filter(b => b.field === field || b.field.startsWith(field + '.')).map(b => b.code);
  return codes.length ? codes.join('；') : unavailable;
}
function Blockers({ blockers }: { blockers: readonly NativeColonyBlocker[] }) {
  if (!blockers.length) return null;
  return <details className="native-colony-blockers"><summary>未提供的数据与操作限制</summary><ul>
    {blockers.map((b, index) => <li key={String(b.marketId) + ':' + b.field + ':' + b.code + ':' + index}>{b.field}：{b.code}</li>)}
  </ul></details>;
}
/** Only actual projected asset paths. Missing/failed art is labelled, never replaced. */
function OriginalImage({ path, label, className }: { path: string | null; label: string; className?: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  let src: string | null = null;
  if (path !== null) { try { src = campaignAsset(path); } catch { /* Invalid resource is shown as unavailable below. */ } }
  if (src === null || failedPath === path) return <span className="native-colony-image-gap" title={path ?? unavailable}>原版图像未提供或无法载入</span>;
  return <img className={className} src={src} alt={label} draggable={false} onError={() => setFailedPath(path)} />;
}
function ColonyTable({ view, busy, select }: { view: NativeColonyManagementView | null; busy: boolean; select: (row: NativeColonyMarketRow) => void }) {
  return <><table className="native-colony-table" aria-label="殖民地与仓库">
    <colgroup>{[170, 200, 106, 60, 80, 120, 100, 80].map((width, i) => <col key={i} style={{ width: width / 916 * 100 + '%' }} />)}</colgroup>
    <thead><tr>{columns.map(([name, reason]) => <th key={name} scope="col"><button type="button" disabled title={reason}>{name}<i aria-hidden="true">▾</i></button></th>)}</tr></thead>
    <tbody>{view?.rows.map(market => <tr key={market.objectRef ?? market.marketId} onClick={() => { if (!busy) select(market); }}>
      <td><button type="button" className="native-colony-name" disabled={busy} title="查看该殖民地的产业与待建队列" onClick={event => { event.stopPropagation(); select(market); }}>
        <strong>{market.name ?? '—'}</strong><small>{market.factionId ?? '—'}</small>
      </button></td>
      <td title={market.hazard === null ? fieldReason(market, 'hazard') : '真实危险度；天然状况图标尚未提供'}><span title="原版星体类型ID，显示名及天然条件图标尚未投影">{market.location.planetType ?? '—'}</span><small>危险度 {market.hazard === null ? '—' : number(market.hazard * 100) + '%'}</small></td>
      <td title={market.location.systemName === null && market.location.hyperspace === null ? fieldReason(market, 'location') : '真实星系及超空间坐标；相对位置图与距离未提供'}><span>{market.location.systemName ?? '—'}</span><small>{market.location.hyperspace ? number(market.location.hyperspace.x) + ' / ' + number(market.location.hyperspace.y) : '位置未提供'}</small></td>
      <td title={market.stability === null ? fieldReason(market, 'stability') : '殖民地稳定性'}><span className="native-colony-number">{count(market.stability)}</span></td>
      <td title={market.size === null ? fieldReason(market, 'size') : '殖民地规模；增长百分比未提供'}><span className="native-colony-number">{count(market.size)}</span></td>
      <td title={market.finances.netIncome === null ? fieldReason(market, 'finances') : '当前每月净收益估计，非已结算收入'}><span className={market.finances.netIncome !== null && market.finances.netIncome < 0 ? 'native-colony-negative' : 'native-colony-number'}>{count(market.finances.netIncome)}</span></td>
      <td title={fieldReason(market, 'tech')} className="native-colony-unknown">—</td>
      <td title={market.administrator === null ? fieldReason(market, 'administrator') : '当前管理员；分配操作未接入'}>{market.administrator?.portrait && <OriginalImage path={market.administrator.portrait} label={market.administrator.name ?? '管理员'} className="native-colony-portrait" />}<small>{market.administrator?.name ?? '—'}</small></td>
    </tr>)}</tbody>
  </table>
  {view === null ? <div className="native-colony-empty"><p>尚未配置殖民地管理归属</p><small>host 尚未提供管理列表，不表示没有殖民地。请由主线配置服务端归属绑定。</small></div>
    : view.rows.length === 0 ? <div className="native-colony-empty"><p>没有任何殖民地与正在使用的租用仓库</p><small>当前服务端绑定的管理列表为空。</small></div> : null}</>;
}
function ActiveIndustry({ industry }: { industry: NativeColonyIndustry }) {
  const title = industry.title ?? industry.industryId;
  const state = industry.building === true ? industry.upgradeId === null ? '建造中' : '升级中' : industry.building === false ? '已建成' : '建造状态未提供';
  const progress = industry.construction;
  const percent = progress === null ? null : Math.max(0, Math.min(100, progress.fraction * 100));
  return <article className="native-colony-industry" data-industry-id={industry.industryId}>
    <h3 title={title}>{title}</h3>
    <button type="button" className="native-colony-industry-surface" disabled title="正在建造/已建成产业的取消、升级、拆除及特殊物品操作尚未接入；不要当作待建队列项处理">
      <OriginalImage path={industry.icon} label={title} />
      {(industry.building === true || industry.disrupted === true) && <span className="native-colony-industry-overlay"><strong>{industry.building ? state : '受干扰'}</strong>{industry.disrupted && industry.building && <small>受干扰</small>}</span>}
    </button>
    {progress && percent !== null ? <div className="native-colony-progress" role="progressbar" aria-label={title + ' 建造进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={'剩余 ' + number(progress.remainingDays) + ' 天'} title={number(progress.progressDays) + ' / ' + number(progress.totalDays) + ' 天'}>
      <span style={{ width: percent + '%' }} /><small>剩余 {number(progress.remainingDays)} 天</small>
    </div> : <div className="native-colony-industry-state">{state}{industry.building === true ? ' · 进度未提供' : ''}{industry.disrupted === true ? ' · 受干扰' : ''}</div>}
  </article>;
}
function queueStatus(market: NativeColonyMarketRow, item: NativeColonyQueueItem) {
  if (market.industries === null || market.industries.some(i => i.building === null)) return '待建项目';
  return item.index === 0 && !market.industries.some(i => i.building) ? '建造中' : '待建中';
}
/** Keyed by authoritative queue identity/order/cost/capabilities and lock state.
 * Any relevant server update discards the native remove/swap selection. */
function Industries({ market, busy, connected, act, requestBuild, buildDisabledReason }: { market: NativeColonyMarketRow; busy: boolean; connected: boolean; act: (action: NativeColonyQueueAction) => void; requestBuild: () => void; buildDisabledReason: string | null }) {
  const [armedId, setArmedId] = useState<string | null>(null);
  const armed = market.queue?.find(item => item.industryId === armedId) ?? null;
  const commonReason = busy ? '正在等待权威事务，请稍候' : !connected ? commandUnavailable : market.mutationBlocker;
  const reasonFor = (item: NativeColonyQueueItem) => {
    if (commonReason || item.mutationBlocker) return commonReason || item.mutationBlocker;
    if (armed === null) return item.canCancel || item.canSwap ? null : item.cancelBlocker ?? item.swapBlocker ?? '此待建项目不支持取消或交换';
    if (armed.industryId === item.industryId) return item.canCancel ? null : item.cancelBlocker ?? '此待建项目不能取消';
    return armed.canSwap && item.canSwap ? null : armed.swapBlocker ?? item.swapBlocker ?? '这两个待建项目不能交换';
  };
  function click(item: NativeColonyQueueItem) {
    if (reasonFor(item)) return;
    if (armed === null) { setArmedId(item.industryId); return; }
    act(armed.industryId === item.industryId
      ? { kind: 'cancel-construction', marketId: market.marketId, industryId: item.industryId }
      : { kind: 'swap-construction', marketId: market.marketId, industryId: armed.industryId, otherIndustryId: item.industryId });
    setArmedId(null);
  }
  return <>
    <p className="native-colony-detail-boundary">产业与待建队列 · 已建产业操作、完整市场概览及原版详情导航仍未接齐。</p>
    {market.industries === null && <p className="native-colony-detail-boundary" title={fieldReason(market, 'industries')}>产业数据未提供，不显示为零座产业。</p>}
    <div className="native-colony-industry-grid" aria-label="产业与待建队列" onContextMenu={event => {
      if (event.target instanceof Element && event.target.closest('[data-queued="true"]')) { event.preventDefault(); setArmedId(null); }
    }}>
      {market.industries?.map(industry => <ActiveIndustry key={industry.objectRef ?? industry.industryId} industry={industry} />)}
      {market.queue?.map(item => {
        const mode = armed === null ? 'normal' : armed.industryId === item.industryId ? 'remove' : 'swap';
        const reason = reasonFor(item), title = item.title ?? item.industryId;
        const operation = mode === 'remove' ? '点击移除待建项目' : mode === 'swap' ? '点击交换下次建造的项目' : '点击选择待建项目';
        return <article className="native-colony-industry" key={item.objectRef ?? item.industryId} data-queued="true" data-mode={mode} data-industry-id={item.industryId}>
          <h3 title={title}>{title}</h3><button type="button" className="native-colony-industry-surface" disabled={reason !== null} onClick={() => click(item)} title={reason ?? operation + '；右键退出选择'} aria-label={title + '：' + (reason ?? operation)} aria-pressed={mode === 'remove'}>
            <OriginalImage path={item.icon} label={title} />
            <span className="native-colony-industry-overlay">{mode !== 'normal' && <small>{reason ? explain(reason) : operation}</small>}<strong>{queueStatus(market, item)}</strong>{mode === 'remove' && <small className="native-colony-number">{count(item.cost)} 退款</small>}</span>
            {mode !== 'remove' && <span className="native-colony-industry-cost"><span title={item.buildTimeDays === null ? "建造天数未投影" : "原版设施工期"}>{count(item.buildTimeDays)} 天</span><span>{count(item.cost)}</span></span>}
          </button>
          <div className="native-colony-industry-state" title={reason ?? undefined}>{reason ? explain(reason) : (armed ? '右键退出选择' : '待建队列 ' + (item.index + 1))}</div>
        </article>;
      })}
    </div>
    {market.queue === null ? <p className="native-colony-detail-boundary" title={fieldReason(market, 'queue')}>待建队列未提供。</p>
      : market.queue.length === 0 ? <p className="native-colony-detail-boundary">没有待建项目。</p> : <p className="native-colony-detail-boundary">点击待建项目后，再点自身移除并退款，或点另一项目交换；右键退出选择。</p>}
    <button type="button" className="native-colony-build" disabled={buildDisabledReason !== null} title={buildDisabledReason ?? "通过真实事务读取建设选项"} onClick={requestBuild}>新建工业设施或建筑物...</button>
    <p className="native-colony-build-note">{buildDisabledReason ? explain(buildDisabledReason) : "点击后通过真实事务核实候选、权限和当前价格；选择项目后再点建造确认。"}</p>
  </>;
}
function buildOptionReason(option: BuildOption) {
  if (!Number.isSafeInteger(option.cost)) return '实际建造报价不可用';
  const reasons = option.reasons.map(reason => ({ unavailable: '当前不满足建造条件', 'industry-limit': '已达到工业设施上限', 'insufficient-credits': '星币不足' })[reason]);
  if (!option.available && !option.reasons.includes('unavailable')) reasons.push('当前不满足建造条件');
  if (!option.withinIndustryLimit && !option.reasons.includes('industry-limit')) reasons.push('已达到工业设施上限');
  if (!option.canAfford && !option.reasons.includes('insufficient-credits')) reasons.push('星币不足');
  return reasons.length ? reasons.join('；') : option.enabled ? null : '该建设选项未启用';
}
const buildColumns = [
  ['设施名称', 270], ['类型', 100], ['建造时间', 125], ['建造成本', 125], ['基础维护成本', 125], ['当前维护成本', 125],
] as const;
/** Proven IndustryPickerDialog contents, embedded in the detail pane. The native
 * holographic modal shell and grouped-choice pages remain explicitly unverified. */
function BuildPicker({ inspection, fresh, busy, refreshReason, refresh, leave, confirm }: {
  inspection: DeepReadonly<OriginalColonyConstructionBuildInspection> | null;
  fresh: boolean; busy: boolean; refreshReason: string | null;
  refresh: () => void; leave: () => void; confirm: (industryId: string, expectedCost: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = inspection?.options.find(option => option.industryId === selectedId) ?? null;
  const maySelect = fresh && !busy && inspection?.canOpenBuildDialog === true;
  const selectedReason = selected ? buildOptionReason(selected) : '请选择一个可用的工业设施或建筑物';
  const confirmReason = busy ? '正在等待权威事务' : !fresh ? '报价已过期或尚未收到本次事务结果，请重新核实' : !inspection?.canOpenBuildDialog ? '当前市场不允许新建' : selectedReason;
  return <section className="native-colony-build-picker" aria-label="新建工业设施或建筑物" aria-busy={busy}>
    <div className="native-colony-build-quote-status" role="status">
      <span>{busy ? '正在核实建设选项或提交建造…' : !fresh ? '报价尚未就绪或已过期；不能用旧价格建造。' : inspection?.canOpenBuildDialog ? '选择设施后点击建造。报价来自本次权威事务。' : '当前设施列表不允许新建。'}</span>
      <button type="button" disabled={refreshReason !== null} title={refreshReason ?? '显式重新读取候选；不会自动构造或轮询'} onClick={refresh}>重新核实选项</button>
    </div>
    <div className="native-colony-build-table-scroll" data-stale={!fresh}>
      <table className="native-colony-build-table" aria-label="可建工业设施与建筑物">
        <colgroup>{buildColumns.map(([name, width]) => <col key={name} style={{ width }} />)}</colgroup>
        <thead><tr>{buildColumns.map(([name]) => <th key={name} scope="col"><button type="button" disabled title="保持真实候选枚举顺序；完整原版列排序及动态显示字段未接齐">{name}<i aria-hidden="true">▾</i></button></th>)}</tr></thead>
        <tbody>{inspection?.options.map(option => {
          const reason = buildOptionReason(option), disabled = !maySelect || reason !== null;
          return <tr key={option.industryId} aria-selected={selectedId === option.industryId} data-disabled={disabled} onClick={() => { if (!disabled) setSelectedId(option.industryId); }} title={reason ?? (!fresh ? '报价无效，需重新核实' : undefined)}>
            <td><button type="button" className="native-colony-build-option" aria-label={option.name} disabled={disabled} onClick={event => { event.stopPropagation(); setSelectedId(option.industryId); }} aria-pressed={selectedId === option.industryId}>
              <span className="native-colony-build-image"><OriginalImage path={option.imageName} label={option.name} /></span><span className={option.available ? '' : 'native-colony-negative'}>{option.name}</span>
            </button></td>
            <td className="native-colony-unknown" title="候选未投影实际 isIndustry/isStructure，不从tags猜测插件行为">—</td>
            <td className="native-colony-unknown" title="候选未投影实际 getBuildTime">—</td>
            <td className={option.canAfford ? 'native-colony-number' : 'native-colony-negative'} title="真实候选getBuildCost的int报价，不是specCost">{count(option.cost)}</td>
            <td className="native-colony-unknown" title="候选未投影实际基础维护费用">—</td>
            <td className="native-colony-unknown" title="候选未投影实际当前维护费用">—</td>
          </tr>;
        })}</tbody>
      </table>
      {inspection === null ? <p className="native-colony-build-empty">等待本次显式建设候选事务结果</p> : inspection.options.length === 0 ? <p className="native-colony-build-empty">{inspection.unsupportedChoices.length ? '尚无可展示的已支持选项，另有未实现的候选。' : '没有可用的工业设施或其他设施'}</p> : null}
    </div>
    <footer className="native-colony-build-actions">
      <span className="native-colony-build-totals" title="实际玩家现金与工业设施计数/上限未投影；可见设施数不是工业上限">星币：—<br />工业设施：— / —</span>
      <button type="button" disabled title="原版返回按钮用于分组类别；分组候选尚未实现">返回</button>
      <button type="button" disabled={confirmReason !== null} title={confirmReason ?? '按所选实际报价确认建造'} onClick={() => { if (selected && confirmReason === null) confirm(selected.industryId, selected.cost); }}>建造</button>
      <button type="button" disabled={busy} onClick={leave}>离开</button>
    </footer>
    {selected && <p className="native-colony-build-selected" title={selectedReason ?? undefined}>{selected.name} · 建造成本 {count(selected.cost)}{selectedReason ? ' · ' + selectedReason : ''}</p>}
    <p className="native-colony-build-note">类型、工期与维护费尚未投影，未知不填零。当前使用已核实的原版选择表内容；原版全息弹层外框与快捷键仍待画面对照。</p>
    {!!inspection?.unsupportedChoices.length && <details className="native-colony-blockers" open><summary>未实现的建设候选（不能假装没有或直接建造）</summary><ul>{inspection.unsupportedChoices.map((choice, index) => <li key={choice.industryId + ':' + index}>{choice.industryId}：{choice.reason === 'grouped-choice' ? '原版分组选择尚未接入' : '该产业插件尚未实现'}</li>)}</ul></details>}
  </section>;
}
function Sidebar({ selected, blockers }: { selected: NativeColonyMarketRow | null; blockers: readonly NativeColonyBlocker[] }) {
  return <aside className="native-colony-sidebar" aria-label="殖民地管理信息">
    <div className="campaign-colony-summary" title="原版 OutpostStats 汇总未投影；不可将当前授权 rows 数当作全局玩家统计"><p>个人控制下的殖民地</p><strong>— / —</strong><p>行政增益</p><b>—</b></div>
    <dl><div><dt>正在当值的管理员：</dt><dd>— / —</dd></div><div><dt>管理员总数：</dt><dd>—</dd></div><div><dt>AI 核心控制下的殖民地：</dt><dd>—</dd></div></dl>
    <button type="button" disabled title="管理员分配与原版选择界面尚未接入">分配管理员 [W]</button>
    <p className="native-colony-summary-gap">全局管理统计尚未提供，不使用当前授权列表推算。</p>
    {selected && <><h3>{selected.name ?? '—'}</h3><dl>
      <div><dt>危险度</dt><dd>{selected.hazard === null ? '—' : number(selected.hazard * 100) + '%'}</dd></div>
      <div><dt>产业收入 / 月</dt><dd>{count(selected.finances.industryIncome)}</dd></div>
      <div><dt>出口收入 / 月</dt><dd>{count(selected.finances.exportIncome)}</dd></div>
      <div><dt>总收入 / 月</dt><dd>{count(selected.finances.grossIncome)}</dd></div>
      <div><dt>产业维护 / 月</dt><dd>{count(selected.finances.industryUpkeep)}</dd></div>
      <div><dt>短缺支出 / 月</dt><dd>{count(selected.finances.shortageCost)}</dd></div>
      <div><dt>人口激励 / 月</dt><dd>{count(selected.finances.incentiveCost)}</dd></div>
      <div><dt>总支出 / 月</dt><dd>{count(selected.finances.totalExpenses)}</dd></div>
      <div><dt>净收益 / 月</dt><dd>{count(selected.finances.netIncome)}</dd></div>
    </dl><p className="native-colony-summary-gap">当前月度估计，非已结算收入；产业图片/名称来自原版 spec，尚未执行所有插件的动态显示覆盖。</p></>}
    <Blockers blockers={blockers} />
  </aside>;
}

/** Pure view and intents. The host owns D/Escape, world locks, revisions and transactions.
 * No document/window listeners, fetch, pause, optimistic payment or GET-created candidates. */
export function NativeColonyManagement({ view, locked, pending = false, onAction, onClose, notice, buildOptions = null, quoteRevision = null, revision = null }: NativeColonyManagementProps) {
  const [selection, setSelection] = useState<{ marketId: string; objectRef: string | null } | null>(null);
  const [buildRequest, setBuildRequest] = useState<{ marketId: string; objectRef: string | null; afterRevision: number; serial: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), alive = useRef(true), nextRequest = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const selected = view?.rows.find(row => selection !== null && row.marketId === selection.marketId && row.objectRef === selection.objectRef) ?? null;
  const busy = locked || pending || sending;
  const validRevision = (value: number | null): value is number => value !== null && Number.isSafeInteger(value) && value >= 0;
  async function submit(action: NativeColonyAction): Promise<boolean> {
    if (busy || inFlight.current || !onAction) return false;
    inFlight.current = true; setSending(true); setError(null);
    try { const result = await onAction(action); return result !== false; }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { inFlight.current = false; if (alive.current) setSending(false); }
  }
  const buildDisabledReason = busy ? '正在等待权威事务，请稍候' : !onAction ? commandUnavailable : !validRevision(revision) ? '主线尚未提供当前世界修订版本' : selected?.mutationBlocker ?? null;
  const buildOpen = selected !== null && buildRequest !== null && selected.marketId === buildRequest.marketId && selected.objectRef === buildRequest.objectRef;
  const inspection = buildOpen && buildOptions !== null && selected !== null && buildOptions.marketId === selected.marketId ? buildOptions.inspection : null;
  // inspect-build is an actual mutation: its receipt must postdate this request's
  // source revision. Equality to the CURRENT revision rejects subsequent world changes.
  const freshQuote = buildOpen && inspection !== null && buildRequest !== null && validRevision(revision) && validRevision(quoteRevision) && quoteRevision === revision && quoteRevision > buildRequest.afterRevision;
  function requestBuild() {
    if (!selected || buildDisabledReason !== null || !validRevision(revision) || inFlight.current) return;
    setBuildRequest({ marketId: selected.marketId, objectRef: selected.objectRef, afterRevision: revision, serial: ++nextRequest.current });
    void submit({ kind: 'inspect-build', marketId: selected.marketId });
  }
  async function confirmBuild(industryId: string, expectedCost: number) {
    if (!selected || !freshQuote || busy || buildDisabledReason !== null || !inspection?.canOpenBuildDialog) return;
    const option = inspection.options.find(item => item.industryId === industryId);
    if (!option || option.cost !== expectedCost || buildOptionReason(option) !== null) return;
    const success = await submit({ kind: 'build', marketId: selected.marketId, industryId, expectedCost: option.cost });
    if (success && alive.current) setBuildRequest(null);
  }
  function backToList() { setSelection(null); setBuildRequest(null); setError(null); }
  const queueKey = selected ? JSON.stringify([selected.marketId, selected.objectRef, selected.queue, selected.mutationBlocker, busy, !!onAction]) : '';
  const quoteKey = JSON.stringify([buildRequest, quoteRevision, revision, inspection, busy]);
  return <CoreScreen panel="management" title="综合管理" onClose={onClose} notice={notice}>
    <div className="campaign-management-core native-colony-management" aria-busy={busy}>
      <header>{tabs.map((tab, index) => <button key={tab} type="button" className={'campaign-page-tab' + (index === 0 ? ' selected' : '')} aria-pressed={index === 0} disabled={index !== 0 || busy} title={index ? '该原版管理分页的权威数据与操作尚未接入' : undefined} onClick={backToList}><NativeBitmapText font="caption" color="currentColor">{tab}</NativeBitmapText></button>)}</header>
      <div className="campaign-management-body">
        <section className="native-colony-main" aria-label={selected ? '殖民地产业详情' : '殖民地与仓库'}>
          {selected ? <><div className="native-colony-detail-toolbar"><h2>{selected.name ?? selected.marketId} · {buildOpen ? '新建工业设施或建筑物' : '产业与建筑'}</h2><button type="button" disabled={busy} onClick={backToList}>返回殖民地与仓库</button></div>
            {buildOpen ? <BuildPicker key={quoteKey} inspection={inspection} fresh={freshQuote} busy={busy} refreshReason={buildDisabledReason} refresh={requestBuild} leave={() => { setBuildRequest(null); setError(null); }} confirm={(industryId, cost) => { void confirmBuild(industryId, cost); }} />
              : <Industries key={queueKey} market={selected} busy={busy} connected={!!onAction} act={action => { void submit(action); }} requestBuild={requestBuild} buildDisabledReason={buildDisabledReason} />}</>
            : <><ColonyTable view={view} busy={busy} select={row => { setSelection({ marketId: row.marketId, objectRef: row.objectRef }); setBuildRequest(null); setError(null); }} />{selection !== null && <p className="native-colony-detail-boundary">此前选择的殖民地已不在当前授权视图中，请重新选择。</p>}</>}
        </section>
        <Sidebar selected={selected} blockers={selected?.blockers ?? view?.blockers ?? []} />
      </div>
      <div className="native-colony-feedback" role={error ? 'alert' : 'status'} data-error={error !== null}>{error ?? (busy ? '正在等待权威事务…' : '仅显示服务端绑定的真实市场；— 表示未提供。')}</div>
    </div>
  </CoreScreen>;
}
