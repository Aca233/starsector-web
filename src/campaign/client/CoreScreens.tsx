import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NativeBitmapText } from '../../ui/NativeBitmapText';
import type { BodyView, CampaignView, FleetView, PointView } from './Protocol';
import './CoreScreens.css';
export type CorePanel = 'market' | 'fleet' | 'cargo' | 'map' | 'intel' | 'management';

/** Core screens are nonmodal: native bottom navigation remains operable. */
export function CoreScreen({ panel, title, onClose, children, notice }: { panel: CorePanel; title: string; onClose: () => void; children: ReactNode; notice: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const launcher = document.activeElement;
    root.current?.focus({ preventScroll: true });
    return () => { if (launcher instanceof HTMLElement && launcher.isConnected) launcher.focus({ preventScroll: true }); };
  }, [panel]);
  return <section ref={root} tabIndex={-1} className={'campaign-core-screen campaign-core-' + panel} aria-label={title}>
    <button className="campaign-core-close" onClick={onClose} aria-label="返回航行 [Esc]" title="返回航行 [Esc]">×</button>
    <div className="campaign-core-content">{children}</div><div className="campaign-core-notice">{notice}</div>
  </section>;
}
function Tab({ children, selected = false, disabled = false, onClick, title }: { children: ReactNode; selected?: boolean; disabled?: boolean; onClick?: () => void; title?: string }) {
  return <button className={'campaign-page-tab' + (selected ? ' selected' : '')} aria-pressed={selected} disabled={disabled} onClick={onClick} title={title}>{typeof children === 'string' ? <NativeBitmapText font="caption">{children}</NativeBitmapText> : children}</button>;
}
interface MapProps { bodies: BodyView[]; points: PointView[]; fleet?: FleetView; name: string; unavailable: string | null }
export function SystemChart({ bodies, points, fleet, names = true, grid = true, onSelect, selected }: Omit<MapProps, 'name' | 'unavailable'> & { names?: boolean; grid?: boolean; selected?: string; onSelect?: (id: string) => void }) {
  const locations = [...bodies, ...points, ...(fleet ? [fleet] : [])];
  const extent = Math.max(600, ...locations.map(b => Math.max(Math.abs(b.position[0]), Math.abs(b.position[1])) + ('radius' in b ? b.radius : 0))) * 1.15;
  const unit = extent / 450;
  const transform = (p: [number, number]) => `translate(${p[0]},${-p[1]})`;
  return <svg className="campaign-system-chart" viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`} aria-label="当前星系示意图" role="img">
    {grid && <g className="chart-grid">{Array.from({ length: 25 }, (_, i) => (i - 12) * extent / 12).map(n => <g key={n}><path d={`M${n},${-extent}V${extent} M${-extent},${n}H${extent}`} /></g>)}</g>}
    <g className="chart-orbits">{bodies.map(body => { const focus = bodies.find(b => b.id === body.orbit?.focusId); return body.orbit && focus ? <circle key={body.id} cx={focus.position[0]} cy={-focus.position[1]} r={body.orbit.radius} /> : null; })}</g>
    {bodies.map(body => <g key={body.id} transform={transform(body.position)} className={'chart-entity ' + body.presentation.kind} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={body.name} onClick={() => onSelect?.(body.id)} onKeyDown={e => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(body.id); } }}>
      <title>{body.name}</title><circle className="chart-hit" r={14 * unit} />
      {body.presentation.kind === 'star' ? <><circle r={12 * unit} />{Array.from({ length: 24 }, (_, i) => <path key={i} transform={`rotate(${i * 15})`} d={`M0,${-14 * unit}v${-4 * unit}`} />)}</> : body.presentation.kind === 'planet' ? <circle r={Math.max(4, Math.min(7, body.radius / 50)) * unit} /> : <path d={`M0,${-4 * unit}L${4 * unit},0 0,${4 * unit} ${-4 * unit},0Z`} />}
      {selected === body.id && <rect className="chart-selection" x={-16 * unit} y={-16 * unit} width={32 * unit} height={32 * unit} />}
      {names && body.presentation.kind === 'planet' && <text y={-12 * unit} fontSize={13 * unit}>{body.name}</text>}
    </g>)}
    {points.map(point => <g key={point.id} className="chart-jump" transform={transform(point.position)} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={point.name} onClick={() => onSelect?.(point.id)} onKeyDown={e => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(point.id); } }}><title>{point.name}</title><circle className="chart-hit" r={14 * unit} /><circle r={5 * unit} /><path d={`M${-8 * unit},0H${8 * unit}M0,${-8 * unit}V${8 * unit}`} /></g>)}
    {fleet && <g transform={transform(fleet.position)} className="chart-player"><title>{fleet.name}</title><path d={`M0,${-7 * unit}L${4 * unit},${6 * unit} 0,${3 * unit} ${-4 * unit},${6 * unit}Z`} /></g>}
  </svg>;
}
export function MapPanel({ bodies, points, fleet, name, unavailable, locked, zoom, onZoom, onObserve, onPoint, onCourse, onStop }: MapProps & {
  locked: boolean; zoom: number; onZoom: (n: number) => void; onObserve: (body: BodyView) => void; onPoint: (id: string) => void; onCourse: (p: [number, number]) => void; onStop: () => void;
}) {
  const [selected, setSelected] = useState(''), [showNames, setNames] = useState(true), [grid, setGrid] = useState(true), [x, setX] = useState('240'), [y, setY] = useState('0');
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable=true]'))) return;
      if (event.key === '5') { event.preventDefault(); setNames(value => !value); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const entity = bodies.find(b => b.id === selected) ?? points.find(p => p.id === selected);
  const unavailableTitle = '完整星区、探测与地形生成尚未接入；不使用虚构星图';
  return <div className="campaign-map-core">
    <header><Tab disabled title={unavailableTitle}>星域 [Q]</Tab><Tab selected>星系 [W]</Tab><span>{name} 星系</span></header>
    <div className="campaign-map-frame"><SystemChart bodies={bodies} points={points} fleet={fleet} names={showNames} grid={grid} selected={selected} onSelect={setSelected} />
      <aside className="campaign-map-selection">{entity ? <><strong>{entity.name}</strong><p>坐标 {entity.position.map(v => v.toFixed(0)).join(' / ')}</p>{'presentation' in entity ? <button onClick={() => onObserve(entity)}>观测目标</button> : <button onClick={() => onPoint(entity.id)}>{unavailable || !entity.destinations.length ? '查看跳跃点' : '接近跳跃点'}</button>}</> : <p>选择天体查看信息</p>}</aside>
      <div className="campaign-map-boundary">{unavailable ?? '当前地点的已投影实体'} · 地形、传感器可见性与完整星区尚未接入</div>
    </div>
    <div className="campaign-chart-filters"><button aria-pressed={grid} onClick={() => setGrid(!grid)}>网格</button>{['星景 [1]', '续航距离 [2]', '探索状态 [3]', '有人居住 [4]'].map(s => <button key={s} disabled title={unavailableTitle}>{s}</button>)}<button aria-pressed={showNames} onClick={() => setNames(!showNames)}>名称 [5]</button><button disabled title={unavailableTitle}>星座名称 [6]</button></div>
    <details className="campaign-map-tools"><summary>开发导航 · 仅当前场景</summary><div>
      <p>观测只移动镜头，不移动舰队。打开界面不会暂停共享世界。</p>
      <label>航行画面缩放<input aria-label="地图缩放" type="range" min="0.05" max="2" step="0.05" value={zoom} onChange={e => onZoom(Number(e.target.value))} /></label>
      <div className="campaign-map-coordinate"><label>X<input aria-label="目的地 X" type="number" value={x} onChange={e => setX(e.target.value)} /></label><label>Y<input aria-label="目的地 Y" type="number" value={y} onChange={e => setY(e.target.value)} /></label><button disabled={locked || !!unavailable || !x.trim() || !y.trim() || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))} onClick={() => onCourse([Number(x), Number(y)])}>设置航向</button><button disabled={locked || !!unavailable} onClick={onStop}>停止航行</button></div>
      <div className="campaign-map-observe">{bodies.map(b => <button key={b.id} onClick={() => onObserve(b)}>{b.name} · 观测</button>)}{points.map(p => <button key={p.id} onClick={() => onPoint(p.id)}>{p.name}</button>)}</div>
    </div></details>
  </div>;
}
export function IntelPanel({ bodies, points, fleet, name }: MapProps) {
  return <div className="campaign-intel-core"><header><Tab selected>信息 [1]</Tab><Tab disabled title="星球调查尚未接入">星球 [2]</Tab><Tab disabled title="外交信息投影尚未接入">势力 [3]</Tab></header>
    <div className="campaign-intel-main"><aside><p>情报系统尚未接入</p><small>不把未同步的任务显示成“没有任务”。</small></aside><section><div className="campaign-intel-map-title">{name} · 当前星系示意图</div><SystemChart bodies={bodies} points={points} fleet={fleet} /><p>完整星区与超空间地图尚未生成</p></section></div>
    <div className="campaign-intel-filters">{['新消息', '重要', '故事', '重大事件', '殖民地威胁', '舰队日志', '已接受', '探索', '任务', '敌对活动', '星门', '赏金', '附近事件'].map((s, i) => <button key={s} disabled className={i === 0 ? 'selected' : ''} title="权威情报分类与计数尚未提供">{s} (—)</button>)}</div>
    <div className="campaign-intel-factions">{['卢德教会', '海盗', '英仙座联盟', '辛达强权', '速子科技', '霸主', '非势力团体'].map(s => <button key={s} disabled title="势力情报筛选尚未接入">{s} (—)</button>)}</div>
  </div>;
}
export function ManagementPanel({ view }: { view: CampaignView }) {
  return <div className="campaign-management-core"><header>{['殖民地 & 仓库 [1]', '订单 [2]', '收益 [3]', '舰队学说 & 蓝图 [4]', '蓝图生产 [5]'].map((s, i) => <Tab key={s} selected={i === 0} disabled={i > 0} title={i ? '权威管理功能尚未接入' : undefined}>{s}</Tab>)}</header>
    <div className="campaign-management-body"><section className="campaign-colony-table" aria-label="殖民地与仓库"><div className="campaign-colony-columns">{['名称', '环境', '位置', '稳定', '规模', '净收益', '科技', '管理员'].map(s => <span key={s}>{s}<i>▾</i></span>)}</div><div className="campaign-colony-empty"><p>殖民地与仓库数据尚未接入</p><small>当前舰长：{view.self.name} · 不以空列表断言没有殖民地</small></div></section>
    <aside><div className="campaign-colony-summary"><p>个人控制下的殖民地</p><strong>— / —</strong><p>行政增益</p><b>—</b></div><dl><div><dt>正在当值的管理员：</dt><dd>— / —</dd></div><div><dt>管理员总数：</dt><dd>—</dd></div><div><dt>AI 核心控制下的殖民地：</dt><dd>—</dd></div></dl><button disabled title="殖民地权限与管理员分配尚未实现">分配管理员 [W]</button><p className="campaign-colony-limit">所有权、管理授权与自愿编队互相独立；这里不会把队友资产自动合并。</p></aside></div>
  </div>;
}
