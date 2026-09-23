import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { MarketPanel, type MarketPanelProps } from './MarketPanel';
import { LogisticsHud } from "./LogisticsHud";
import { queryCargoQuickTransfer } from './CargoQuickTransfer';
import { useCargoHudPreview, type CargoHudDraft, type CargoPreviewQuery } from './useCargoHudPreview';
import { CargoPodPanel } from './CargoPodPanel';
import { CoreScreen, MapPanel, IntelPanel, ManagementPanel, type CorePanel } from './CoreScreens';
import { FleetPanel } from './FleetPanel';
import { CargoPanel, type CargoPanelControls } from './CargoPanel';
import { CampaignBodies } from './CampaignBodies';
import { mapPosition, worldPosition } from './BodyGeometry.mjs';
import { campaignAsset } from './BodyRenderer';
import { JumpPointCanvas } from './JumpPointCanvas';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignSession, FleetView, PointView, BodyView, CargoPodView } from './Protocol';
import { NativeBitmapText } from '../../ui/NativeBitmapText';
import { NativeButton } from '../../ui/NativeChrome';
import { Modal } from '../../ui/core/UI';

const graphics = '/game-assets/graphics/';
const phases: Record<string, string> = { start: '准备跳跃', approach: '接近入口', 'warp-out': '逐舰跃出', 'fade-out': '穿越边界', 'fade-in': '进入目标空间', 'warp-in': '逐舰跃入' };
type Panel = 'market' | 'fleet' | 'cargo' | 'map' | 'intel' | 'cooperation' | 'jump' | 'connection' | 'body' | 'management' | 'pod';
function isCorePanel(panel: string | null): panel is CorePanel { return panel !== null && ['fleet', 'cargo', 'market', 'map', 'intel', 'management'].includes(panel); }
interface Props {
  onMarketRead: MarketPanelProps['onRead']; onMarketQuote: MarketPanelProps['onQuote']; onMarketTrade: MarketPanelProps['onTrade']; marketReceipt: string;
  onCargoPreview: CargoPreviewQuery;
  jettisonReceipt: string; session: CampaignSession; fleet?: FleetView; locked: boolean; busy: boolean; pending: boolean; message: string; network: string;
  onSelectFleet: (id: string) => void; onRetry: () => void; onDisconnect: () => void;
  onApproach: (id: string) => void; onCourse: (position: [number, number]) => void; onStop: () => void; onJump: (pointId: string, index: number) => void;
  onFleetRepairs: (suspended: boolean) => void; onJettison: (items: Record<string, number>) => Promise<boolean>; onCollect: (id: string) => Promise<boolean>;
  onMothballed: (memberId: string, mothballed: boolean) => void;
  onRepairs: (memberId: string, suspended: boolean) => void; onInvite: (id: string) => void; onLeave: () => void;
  onInvitation: (id: string, accept: boolean) => void;
}
const tabs: { name: string; key: string; panel?: Panel; unavailable?: string }[] = [
  { name: '角色技能', key: 'C', unavailable: '生涯角色成长与技能尚未实现' },
  { name: '舰队管理', key: 'F', panel: 'fleet' },
  { name: '舰队改装', key: 'R', unavailable: '生涯改装事务尚未接入；不会跳转到不关联生涯资产的沙盒' },
  { name: '乘员 & 货物', key: 'I', panel: 'cargo' },
  { name: '星图', key: 'Tab', panel: 'map' },
  { name: '情报信息', key: 'E', panel: 'intel' },
  { name: '综合管理', key: 'D', panel: 'management' },
];
const abilities = [
  ['transponder', '应答器'], ['go_dark', '关闭应答'], ['sensor_burst', '主动传感器脉冲'],
  ['emergency_burn', '紧急加速'], ['travel_drive', '持续航行'], ['interdiction_pulse', '拦截脉冲'],
  ['scavenge', '打捞'], ['blank', '空能力槽'], ['blank', '空能力槽'], ['direct_jump', '横向跳跃'],
];
const names: Record<Panel, string> = { market: '市场交易', pod: '货物吊舱', management: '综合管理', body: '天体 / 空间设施', fleet: '舰队管理', cargo: '乘员 & 货物', map: '星图 / 局部导航', intel: '情报信息', cooperation: '联机 · 自愿编队', jump: '跳跃点', connection: '连接与开发状态' };
const number = (n: number | undefined, digits = 0) => n === undefined ? '—' : n.toLocaleString('zh-CN', { maximumFractionDigits: digits });

/** Campaign-only presentation. The authoritative protocol and retry semantics live in CampaignApp. */
export function CampaignHud(props: Props) {
  const { session, fleet, locked, busy, pending, message, network } = props, { view } = session;
  const [requestedPanel, setRequestedPanel] = useState<Panel | null>(null), [selectedPoint, setSelectedPoint] = useState('');
  const [selectedMarket, setSelectedMarket] = useState('');
  const marketControls = useRef<CargoPanelControls>(null);
  const [marketActive, setMarketActive] = useState(false);
  const cargoControls = useRef<CargoPanelControls>(null);
  const [cargoActive, setCargoActive] = useState(false);
  const [cargoDraft, setCargoDraft] = useState<CargoHudDraft | null>(null);
  const previewScope = JSON.stringify([view.worldId, session.epoch, view.self.id, fleet?.id, props.jettisonReceipt]);
  const cargoHud = useCargoHudPreview(session, fleet, previewScope, requestedPanel === 'cargo' ? cargoDraft : null, props.onCargoPreview);
  // Every navigation path passes this guard, including resource buttons/hotkeys.
  const setPanel = useCallback((next: Panel | null) => {
    if (requestedPanel === 'market' && next !== 'market' && marketControls.current?.isPending()) return;
    if (requestedPanel === 'cargo' && next !== 'cargo' && cargoControls.current?.isPending()) return;
    setRequestedPanel(next);
  }, [requestedPanel]);
  const [camera, setCamera] = useState<{ locationId: string; center: [number, number] } | null>(null);
  const [selectedBody, setSelectedBody] = useState(''), [selectedPod, setSelectedPod] = useState('');
  const [contact, setContact] = useState('');
  const [dismissedInteraction, setDismissedInteraction] = useState('');
  const interaction = fleet?.navigation?.interaction;
  const interactionPort = view.ports?.find(port => port.anchorEntityId === interaction?.targetId);
  const panel = requestedPanel ?? (interaction?.arrived && interaction.orderId !== dismissedInteraction ? interactionPort ? 'body' : 'jump' : null);
  const [zoom, setZoom] = useState(1), [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  const location = view.locations.find(l => l.id === fleet?.locationId);
  const points = view.points.filter(p => p.locationId === fleet?.locationId), point = points.find(p => p.id === (requestedPanel === 'jump' ? selectedPoint : interaction?.targetId));
  const bodies = view.bodies.filter(b => b.locationId === fleet?.locationId), body = bodies.find(b => b.id === (requestedPanel === 'body' ? selectedBody : interaction?.targetId));
  const bodyPort = view.ports?.find(port => port.anchorEntityId === (requestedPanel === 'body' ? selectedBody : interaction?.targetId));
  const cargoPods = view.cargoPods.filter(p => p.locationId === fleet?.locationId), pod = cargoPods.find(p => p.id === selectedPod);
  const center = camera?.locationId === fleet?.locationId ? camera!.center : fleet?.position ?? [0, 0] as [number, number];
  const party = view.parties.find(p => p.id === fleet?.partyId);
  const status = session.simulation.status === 'running' ? '世界推进中' : session.simulation.status === 'error' ? '模拟错误：' + session.simulation.error?.code : '已暂停 · 由房主控制';
  const showMessage = dismissedMessage !== message;
  useEffect(() => { const t = setTimeout(() => setDismissedMessage(message), 6000); return () => clearTimeout(t); }, [message]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || (panel && !isCorePanel(panel)) || document.querySelector('[aria-modal="true"]')) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Tab keeps normal focus navigation when a control has focus. Letter hotkeys
      // still work after closing a modal and restoring focus to its launcher.
      if (event.key === 'Tab' && event.target instanceof HTMLElement && event.target.closest('button, [tabindex]')) return;
      if (panel === 'market' && marketControls.current?.keyDown(event)) { event.preventDefault(); return; }
      if (panel === 'cargo' && cargoControls.current?.keyDown(event)) { event.preventDefault(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.key === 'Escape' && isCorePanel(panel)) { event.preventDefault(); setPanel(panel === 'market' ? 'body' : null); return; }
      const tab = tabs.find(t => t.key.toLowerCase() === event.key.toLowerCase());
      if (tab?.panel) { event.preventDefault(); setPanel(panel === tab.panel ? null : tab.panel); }
      else if (event.key.toLowerCase() === 'l') { event.preventDefault(); setPanel('cooperation'); }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [panel, setPanel]);
  const selectPoint = (id: string) => {
    if (location?.navigationUnavailable || points.find(p => p.id === id)?.destinations.length === 0) { setSelectedPoint(id); setPanel('jump'); return; }
    setSelectedPoint(id);
    if (interaction?.targetId === id && interaction.arrived) setPanel('jump');
    else if (!locked) { setPanel(null); props.onApproach(id); }
  };
  const closePanel = () => { if (panel === 'market' && marketControls.current?.escape()) return; if (panel === 'cargo' && cargoControls.current?.escape()) return; if (panel === 'market') { setPanel('body'); return; } setPanel(null); if (panel === 'jump' || panel === 'body' && interactionPort) { setDismissedInteraction(interaction?.orderId ?? ''); if (!locked && interaction && !location?.navigationUnavailable) props.onStop(); } };
  const notice = <div className="campaign-notice" role="status">
    {network && <p className="campaign-warning">连接中断：{network} · 所示数据可能已过期</p>}
    {(showMessage || panel || pending) && message && <p>{message}</p>}
    {pending && <div className="campaign-warning">上次指令结果未确认；新操作已锁定。<NativeButton disabled={busy} onClick={props.onRetry}>重试同一请求</NativeButton></div>}
  </div>;
  const { cargo, logistics } = cargoHud;
  const underway = !!fleet?.navigation?.destination && (Math.hypot(...fleet.navigation.velocity) > 0 || fleet.navigation.destination.some((n, i) => n !== fleet.position[i]));
  return <main className="campaign-shell" onContextMenu={event => { if (!event.shiftKey && panel === 'market' && marketControls.current?.cancelHeld()) { event.preventDefault(); event.stopPropagation(); } if (!event.shiftKey && panel === 'cargo' && cargoControls.current?.cancelHeld()) { event.preventDefault(); event.stopPropagation(); } }} data-core-panel={isCorePanel(panel) ? panel : undefined}>
    <SpaceView inactive={!!panel} cargoPods={cargoPods} onPod={id => { setSelectedPod(id); setPanel('pod'); }} fleet={fleet} fleets={view.fleets} points={points} bodies={bodies} center={center} background={location?.background ?? null} onBody={id => { setSelectedBody(id); setPanel('body'); }} zoom={zoom} hyperspace={location?.space === 'hyperspace'} locked={locked || !!location?.navigationUnavailable}
      worldId={view.worldId} gameSeconds={view.clock.gameSeconds} running={session.simulation.status === 'running'} onZoom={setZoom} onCourse={props.onCourse} onPoint={selectPoint} onPan={p => { if (fleet) setCamera({ locationId: fleet.locationId, center: p }); }} />
    {location?.navigationUnavailable && <div className="campaign-world-limitation" role="status">{location.navigationUnavailable} · 当前为原版手工配置预览</div>}
    {camera?.locationId === fleet?.locationId && <button className="campaign-follow-fleet" onClick={() => setCamera(null)}>回到舰队</button>}
    <div className="campaign-top-decor" aria-hidden="true" />
    <div className="campaign-date" title={view.calendar ? view.calendar.dateString : '存档未配置星历纪元；不编造日期'} aria-label={view.calendar ? '日期 ' + view.calendar.shortDate : '日期未知'}>
      <small><span className="campaign-date-day"><NativeBitmapText font="tiny">{view.calendar?.dateLabel ?? '日期'}</NativeBitmapText><span className="campaign-day-progress" aria-hidden="true"><i style={{ width: ((view.calendar?.dayProgress ?? 0) * 100) + '%' }} /></span></span><span><NativeBitmapText font="tiny">{view.calendar?.cycleLabel ?? '星历年'}</NativeBitmapText></span></small>
      <strong><span><NativeBitmapText font="button">{view.calendar?.monthText ?? '—'}</NativeBitmapText></span><span><NativeBitmapText font="button">{view.calendar?.dayText ?? '—'}</NativeBitmapText></span><span><NativeBitmapText font="button">{view.calendar?.cycleText ?? '—'}</NativeBitmapText></span></strong>
    </div>
    <div className="campaign-connection"><button onClick={() => setPanel('connection')}>{session.development ? '开发星区' : '生涯开发入口'} · {status}</button>
      <button aria-label="打开联机编队" onClick={() => setPanel('cooperation')}>联机 [L]{view.invitations.some(i => i.canAccept) ? ' · 新邀请' : ''}</button></div>
    {!panel && <div className="campaign-toast">{notice}</div>}
    <aside className="campaign-event-feed" aria-label="航行情报">
      {view.invitations.filter(i => i.canAccept).map(i => <button key={i.id} className="campaign-feed-item" onClick={() => setPanel('cooperation')}><img src={runtimeAssetUrl(graphics + 'icons/abilities/transponder.png')} alt="" /><span>收到合作邀请<strong>{i.fromName}</strong><small>加入只共享导航，不转移指挥权</small></span></button>)}
      {fleet?.navigation?.jumpPhase && <div className="campaign-feed-item"><img src={runtimeAssetUrl(graphics + 'icons/abilities/direct_jump.png')} alt="" /><span>{phases[fleet.navigation.jumpPhase] ?? '跳跃中'}<small>服务器正在推进跳跃阶段</small></span></div>}
      {!fleet && <p>当前没有可指挥舰队。请在舰队管理中检查。</p>}
    </aside>
    <section className="campaign-bottom" aria-label="生涯控制台">
      <LogisticsHud cargo={cargo} logistics={logistics} status={cargoHud.status} description={cargoHud.description} expanded={panel === 'cargo' || panel === 'fleet' || panel === 'market'} fleet={fleet} onCargo={() => setPanel('cargo')} onFleet={() => setPanel('fleet')} />
      <div className="campaign-tripad-decor" aria-hidden="true" />
      <div className="campaign-abilities">
        <div className="campaign-course-status"><button onClick={() => setPanel('map')} title="打开局部导航">{fleet?.navigation?.jumpPhase ? phases[fleet.navigation.jumpPhase] : fleet?.encounterId ? '遭遇锁定' : interaction ? (interaction.arrived ? '等待交互' : interactionPort ? '正在接近市场' : '正在接近跳跃点') : underway ? '正在航行' : '航向待命'}</button><button disabled={locked || !fleet?.navigation?.destination} onClick={props.onStop}>停止航行</button></div>
        <div className="campaign-ability-slots" aria-label="能力栏（尚未接入）">{abilities.map(([icon, label], index) => <span className="campaign-ability-slot" key={index} title={label + ' · 尚未实现'}><button aria-label={label + ' · 尚未实现'} disabled><img src={runtimeAssetUrl(graphics + 'icons/abilities/' + icon + '.png')} alt="" /><small>{(index + 1) % 10}</small></button></span>)}</div>
        <div className="campaign-ability-footer"><span>上一页　下一页</span><span>能力尚未接入　□ 锁定</span></div>
      </div>
      <nav className="campaign-core-tabs" aria-label="生涯主菜单">{tabs.map(tab => <span key={tab.key} title={tab.unavailable ?? tab.name}><NativeButton font="caption" shortcut={tab.key} disabled={!tab.panel || ((panel === 'cargo' && cargoActive) || (panel === 'market' && marketActive))} aria-pressed={panel === tab.panel} onClick={() => tab.panel && setPanel(panel === tab.panel ? null : tab.panel)}>{tab.name}</NativeButton></span>)}</nav>
    </section>
    <Radar fleet={fleet} fleets={view.fleets} points={points} bodies={bodies} locationName={location?.name ?? '暂无可指挥舰队'} />
    {isCorePanel(panel) && <CoreScreen panel={panel} title={names[panel]} onClose={closePanel} notice={notice}>
      {panel === 'market' && <MarketPanel session={session} fleet={fleet} marketId={selectedMarket} locked={locked}
        controlsRef={marketControls} onActivityChange={setMarketActive} receiptKey={props.marketReceipt}
        onRead={props.onMarketRead} onQuote={props.onMarketQuote} onTrade={props.onMarketTrade} />}
      {panel === 'fleet' && <FleetPanel fleet={fleet} fleets={view.fleets} locked={locked} onSelectFleet={props.onSelectFleet} onRepairs={props.onRepairs} onFleetRepairs={props.onFleetRepairs} onMothballed={props.onMothballed} />}
      {panel === 'cargo' && <CargoPanel onQuickTransfer={(cargo, quick, signal) => queryCargoQuickTransfer(session, fleet, cargo, quick, props.onCargoPreview, signal)} previewScope={previewScope} previewDescription={cargoHud.description} onPreviewChange={setCargoDraft} controlsRef={cargoControls} onActivityChange={setCargoActive} receiptKey={props.jettisonReceipt} fleet={fleet} locked={locked} onJettison={props.onJettison} />}
      {panel === 'map' && <MapPanel fleet={fleet} bodies={bodies} points={points} name={location?.name ?? '未知地点'} unavailable={location?.navigationUnavailable ?? null} locked={locked} zoom={zoom} onZoom={setZoom} onCourse={props.onCourse} onStop={props.onStop} onPoint={selectPoint} onObserve={b => { setCamera({ locationId: b.locationId, center: [...b.position] }); setPanel(null); }} />}
      {panel === 'intel' && <IntelPanel fleet={fleet} bodies={bodies} points={points} name={location?.name ?? '未知地点'} unavailable={location?.navigationUnavailable ?? null} />}
      {panel === 'management' && <ManagementPanel view={view} />}
    </CoreScreen>}
    {panel && !isCorePanel(panel) && <Modal title={names[panel]} width="small" surface="solid" className="campaign-dialog" onClose={closePanel} footer={notice}>
      {panel === 'pod' && <CargoPodPanel pod={pod} fleet={fleet} locked={locked} navigationUnavailable={!!location?.navigationUnavailable} onCollect={id => { void props.onCollect(id).then(success => { if (success) setPanel(null); }); }} onCourse={p => { props.onCourse(p); setPanel(null); }} />}
      {panel === 'body' && <><h3>{body?.name ?? bodyPort?.name ?? '实体已不在当前空间'}</h3><p>{body?.presentation.kind === 'star' ? '恒星' : body?.presentation.kind === 'planet' ? '行星 / 卫星' : '空间设施'} · {body?.presentation.nativeType}</p><p>半径 {number(body?.radius)} · 坐标 {body?.position.map(v => number(v)).join(', ')}</p>{bodyPort && <><NativeButton disabled={locked || !!location?.navigationUnavailable || interaction?.targetId === bodyPort.anchorEntityId && interaction.arrived} onClick={() => { props.onApproach(bodyPort.anchorEntityId); setPanel(null); }}>接近市场</NativeButton><NativeButton disabled={locked} onClick={() => { setSelectedBody(bodyPort.anchorEntityId); setSelectedMarket(bodyPort.marketId); setPanel('market'); }}>进入商品交易</NativeButton></>}<p className="ui-muted">商品交易需要接触设施并通过服务器准入。完整入港菜单与其它设施互动尚未接入；没有经济数据时不会显示虚构库存。</p></>}
      {panel === 'jump' && <><h3>{point?.name ?? '跳跃点已不在当前空间'}</h3>{point?.destinations.map(d => <NativeButton key={d.index} disabled={locked} onClick={() => { props.onJump(point.id, d.index); setDismissedInteraction(interaction?.orderId ?? ''); setPanel(null); }}>跃迁至{d.locationName}</NativeButton>)}<p className="ui-muted">{!point?.destinations.length ? '此入口的原版目的地生成阶段尚未执行，不能跃迁；不会虚构一个出口。' : '已驶近入口。确认目的地才由服务器核算燃料并开始跳跃；仅靠近或打开入口不会扣取跳跃费用。关闭窗口取消交互目标，不暂停其他玩家。'}</p></>}
      {panel === 'cooperation' && <>
        <h3>{party ? '当前编队' : '独立行动'}</h3><p>{party ? party.fleetIds.length + ' 支舰队 · 共享位置，不共享资产或指挥权' : '可以各自航行，也可以自愿加入，再随时离开。'}</p>
        {party && <NativeButton disabled={locked} onClick={props.onLeave}>离开编队</NativeButton>}
        <label>联机名册<select aria-label="邀请目标" value={contact} onChange={e => setContact(e.target.value)}><option value="">选择舰队</option>{view.contacts.map(c => <option value={c.id} key={c.id}>{c.commander} · {c.name}</option>)}</select></label>
        <NativeButton disabled={locked || !contact || !view.contacts.some(c => c.id === contact)} onClick={() => props.onInvite(contact)}>发送合作邀请</NativeButton>
        {view.invitations.map(i => <div className="campaign-invitation" key={i.id}><p>{i.fromName} → {i.toName}</p>{i.canAccept && <NativeButton disabled={locked} onClick={() => props.onInvitation(i.id, true)}>接受邀请</NativeButton>} <NativeButton disabled={locked} onClick={() => props.onInvitation(i.id, false)}>{i.canAccept ? '拒绝邀请' : '撤回邀请'}</NativeButton></div>)}
      </>}
      {panel === 'connection' && <><h3>{view.self.name}</h3><p>{status}</p><p className="campaign-warning">{session.development ? '开发星区：仅用于航行与联机验证，不是原版开局。' : '生涯入口仍在开发中。'}</p><p className="ui-muted">星历与后勤来自服务器的版本化规则；开发场景采用显式测试纪元。传感器、经济、战斗结算、势力治理和殖民地尚未接入。能力栏只保留原版位置与素材，未实现项禁用。</p><p className="campaign-technical">世界 {view.worldId}<br />规则 {view.rules.id} / {view.rules.version}<br />模拟时间 {number(view.clock.gameSeconds, 2)} 秒 · rev {view.revision}</p><NativeButton disabled={busy} onClick={props.onDisconnect}>退出连接</NativeButton></>}
    </Modal>}
  </main>;
}

function SpaceView({ inactive, cargoPods, onPod, fleet, fleets, points, bodies, center, background, zoom, hyperspace, locked, worldId, gameSeconds, running, onZoom, onCourse, onPoint, onBody, onPan }: {
  inactive: boolean; cargoPods: CargoPodView[]; onPod: (id: string) => void; fleet?: FleetView; fleets: FleetView[]; points: PointView[]; bodies: BodyView[]; center: [number, number]; background: string | null; onBody: (id: string) => void; onPan: (p: [number, number]) => void; zoom: number; hyperspace: boolean; locked: boolean; worldId: string; gameSeconds: number; running: boolean;
  onZoom: (value: number) => void; onCourse: (p: [number, number]) => void; onPoint: (id: string) => void;
}) {
  const ref = useRef<SVGSVGElement>(null), [size, setSize] = useState({ width: 1440, height: 900 });
  useEffect(() => { if (!ref.current) return; const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const [cx, cy] = mapPosition(center), width = size.width / zoom, height = size.height / zoom;
  const pan = useRef<{ x: number; y: number; center: [number, number] } | null>(null);
  let image: string | undefined; try { if (background) image = 'url(' + JSON.stringify(campaignAsset(background)) + ')'; } catch { /* Unknown assets do not become arbitrary URLs. */ }
  return <div inert={inactive} aria-hidden={inactive} className={'campaign-space' + (hyperspace ? ' campaign-hyperspace' : '')} style={{ backgroundImage: image }}>
    <CampaignBodies bodies={bodies} center={center} zoom={zoom} gameSeconds={gameSeconds} running={running} worldId={worldId} />
    <JumpPointCanvas center={center} worldId={worldId} fleet={fleet} fleets={fleets} points={points} zoom={zoom} hyperspace={hyperspace} gameSeconds={gameSeconds} running={running} />
    <svg ref={ref} className="campaign-map" aria-label="生涯导航地图，点击空白处设置航向" onPointerDown={e => { if (e.button !== 1) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pan.current = { x: e.clientX, y: e.clientY, center: [...center] }; }} onPointerMove={e => { if (!pan.current) return; onPan([pan.current.center[0] - (e.clientX - pan.current.x) / zoom, pan.current.center[1] + (e.clientY - pan.current.y) / zoom]); }} onPointerUp={e => { if (pan.current) { pan.current = null; e.currentTarget.releasePointerCapture(e.pointerId); } }} onPointerCancel={() => { pan.current = null; }} viewBox={[cx - width / 2, cy - height / 2, width, height].join(' ')} onWheel={e => onZoom(Math.min(2, Math.max(0.05, zoom + (e.deltaY < 0 ? 0.1 : -0.1))))} onClick={e => {
      if (locked) return; const matrix = e.currentTarget.getScreenCTM(); if (!matrix) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()); onCourse(worldPosition([p.x, p.y]));
    }}>
      {fleet?.navigation?.destination && !fleet.navigation.interaction && <g pointerEvents="none"><path d={'M ' + mapPosition(fleet.position).join(' ') + ' L ' + mapPosition(fleet.navigation.destination).join(' ')} stroke="#58c55e" strokeOpacity=".65" strokeWidth={1 / zoom} /><circle cx={fleet.navigation.destination[0]} cy={-fleet.navigation.destination[1]} r={7 / zoom} fill="none" stroke="#80d880" /></g>}
      {bodies.map(b => <g key={b.id} className="campaign-map-body" data-body-id={b.id} transform={'translate(' + mapPosition(b.position).join(' ') + ')'} role="button" tabIndex={0} aria-label={b.name} onClick={e => { e.stopPropagation(); onBody(b.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onBody(b.id); } }}><circle r={Math.max(b.radius, 15 / zoom)} fill="transparent"/><text y={b.radius + 18 / zoom} fontSize={14 / zoom} textAnchor="middle">{b.name}</text></g>)}
      {cargoPods.map(p => <g key={p.id} role="button" tabIndex={0} className="campaign-cargo-pod" aria-label={p.name} data-pod-id={p.id} transform={'translate(' + mapPosition(p.position).join(' ') + ')'} onClick={e => { e.stopPropagation(); onPod(p.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPod(p.id); } }}>
        <circle r={Math.max(p.radius, 24 / zoom)} fill="transparent" /><image href={runtimeAssetUrl(graphics + 'icons/cargo_pod0.png')} x={-14 / zoom} y={-14 / zoom} width={28 / zoom} height={28 / zoom} /><text y={38 / zoom} textAnchor="middle" fontSize={13 / zoom}>{p.name}</text>
      </g>)}
      {points.map(p => <g key={p.id} className="campaign-map-point" data-point-id={p.id} data-selected={fleet?.navigation?.interaction?.targetId === p.id} role="button" tabIndex={0} aria-label={p.name} transform={'translate(' + mapPosition(p.position).join(' ') + ')'} onClick={e => { e.stopPropagation(); e.currentTarget.blur(); onPoint(p.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPoint(p.id); } }}>
        <circle className="campaign-point-hit" r={Math.max(24 / zoom, p.radius)} fill="transparent" /><text className="campaign-point-label" y={Math.max(22, p.radius) + 20 / zoom} fontSize={14 / zoom} textAnchor="middle">{p.name}</text>
      </g>)}
      {fleets.filter(f => f.locationId === fleet?.locationId).map(f => {
        const velocity = f.navigation?.velocity ?? [0, 0], heading = Math.hypot(...velocity) > 0.001 ? Math.atan2(-velocity[1], velocity[0]) * 180 / Math.PI + 90 : 0;
        const wolf = f.private?.members.length === 1 && f.private.members[0].hullId === 'wolf';
        return <g key={f.id} data-fleet-id={f.id} transform={'translate(' + mapPosition(f.position).join(' ') + ') scale(' + 1 / zoom + ')'} pointerEvents="none"><circle r="35" fill="none" stroke={f.canCommand ? '#81b4c6' : '#d7ae5d'} strokeOpacity=".7" strokeWidth="1.5" /><g transform={'rotate(' + heading + ')'}>{wolf ? <image href={runtimeAssetUrl(graphics + 'ships/wolf/wolf_base.png')} x="-11" y="-20" width="22" height="40" preserveAspectRatio="xMidYMid meet" /> : <path d="M 0 -12 L 8 8 L 0 4 L -8 8 Z" fill={f.canCommand ? '#8ebfc4' : '#d7ae5d'} />}</g>{f.id !== fleet?.id && <text y="52" textAnchor="middle" fontSize="13">{f.name}</text>}</g>;
      })}
    </svg>
  </div>;
}
function Radar({ fleet, fleets, points, bodies, locationName }: { fleet?: FleetView; fleets: FleetView[]; points: PointView[]; bodies: BodyView[]; locationName: string }) {
  const position = (p: [number, number]) => { const dx = (p[0] - (fleet?.position[0] ?? 0)) / 8, dy = (p[1] - (fleet?.position[1] ?? 0)) / 8, factor = Math.min(1, 80 / (Math.hypot(dx, dy) || 1)); return [100 + dx * factor, 100 - dy * factor]; };
  return <aside className="campaign-radar" aria-label="局部导航雷达" title="仅显示当前空间的已投影天体、跳跃点和自愿共享舰队；不代表原版探测范围">
    <svg viewBox="0 0 200 200" aria-label="导航投影"><circle cx="100" cy="100" r="88" fill="#071e28ee" stroke="#6794a6" strokeWidth="2" /><circle cx="100" cy="100" r="57" fill="none" stroke="#436673" /><circle cx="100" cy="100" r="25" fill="none" stroke="#436673" /><path d="M 100 12 V 188 M 12 100 H 188" stroke="#436673" />
      {bodies.map(b => { const [x, y] = position(b.position); return <circle key={b.id} cx={x} cy={y} r={b.presentation.kind === 'star' ? 5 : 3} fill={b.presentation.kind === 'star' ? '#ffc85e' : '#91c4d3'} />; })}
      {points.map(p => { const [x, y] = position(p.position); return <circle key={p.id} cx={x} cy={y} r="5" stroke="#c0afff" fill="none" />; })}
      {fleets.filter(f => f.locationId === fleet?.locationId).map(f => { const [x, y] = position(f.position); return <path key={f.id} d={'M ' + x + ' ' + (y - 5) + ' l 4 8 l -4 -2 l -4 2 Z'} fill={f.canCommand ? '#9bff00' : '#ffc151'} />; })}
    </svg><div className="campaign-location" data-testid="current-location">{locationName}</div>
  </aside>;
}
