import { useMemo, useState } from 'react';
import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { Modal } from '../core/UI';
import { NativeButton } from '../NativeChrome';
import { NativeBitmapText } from '../NativeBitmapText';
import { simulationRoster, registerSimulationOption, type SimulationOption } from './SimulationRoster';
import './simulation-deployment.css';

export function SimulationDeployment({ engine, onClose, onDeployed }: {
  engine: CombatEngine; onClose: () => void; onDeployed: () => void;
}) {
  const roster = useMemo(() => simulationRoster(), []);
  const [side, setSide] = useState<'ally' | 'enemy'>('enemy');
  const [selected, setSelected] = useState<{ ally: string[]; enemy: string[] }>({ ally: [], enemy: [] });
  const [hover, setHover] = useState<SimulationOption | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState('');
  const [limit, setLimit] = useState(engine.simulationPointLimit);
  const [error, setError] = useState('');
  const options = roster.filter(option => (!size || option.spec.hullSize === size) && (option.name + option.variantName + option.id).toLowerCase().includes(query.toLowerCase()));
  const picks = roster.filter(option => selected[side].includes(option.id));
  const cost = picks.reduce((sum, option) => sum + option.cost, 0);
  const deployed = engine.simulationDeployedPoints(side === 'ally');
  const over = deployed + cost > limit;
  const changeSide = (next: 'ally' | 'enemy') => { setSide(next); setHover(null); setError(''); };
  const toggle = (option: SimulationOption) => {
    if (option.errors.length) { setError(option.errors.join('；')); return; }
    setSelected(current => ({ ...current, [side]: current[side].includes(option.id) ? current[side].filter(id => id !== option.id) : [...current[side], option.id] }));
    setError('');
  };
  const deploy = () => {
    if (!picks.length || over) return;
    try {
      const entries = picks.map(option => ({ specId: registerSimulationOption(option), cost: option.cost }));
      engine.deploySimulationShips(entries, side === 'ally');
      onDeployed();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const all = () => {
    const available = options.filter(option => !option.errors.length).map(option => option.id);
    setSelected(current => ({ ...current, [side]: available.every(id => current[side].includes(id)) ? current[side].filter(id => !available.includes(id)) : [...new Set([...current[side], ...available])] }));
    setError('');
  };
  return <Modal title="模拟战斗舰船部署" className="simulation-deployment" onClose={onClose} initialFocus="panel" surface="glass"
    onShortcut={key => { if (key === 'q') changeSide('ally'); else if (key === 'w') changeSide('enemy'); else if (key === 'a') setAdvanced(value => !value); }}
    footer={<><div className="sim-deployment-meter" data-over={over} role="status" aria-label="部署点数"><i style={{ width: Math.min(100, (deployed + cost) / limit * 100) + '%' }} /><span>部署: {deployed + cost} / {limit}</span></div>
      <NativeButton disabled={!picks.length || over} onClick={deploy}>部署</NativeButton><NativeButton onClick={all}>全部</NativeButton><NativeButton onClick={onClose}>取消</NativeButton></>}>
    <div className="sim-deployment-tabs" role="tablist" aria-label="部署阵营">
      <NativeButton role="tab" aria-selected={side === 'ally'} shortcut="Q" onClick={() => changeSide('ally')}>盟军</NativeButton>
      <NativeButton role="tab" aria-selected={side === 'enemy'} shortcut="W" onClick={() => changeSide('enemy')}>敌军</NativeButton>
      <NativeButton className="sim-advanced-toggle" font="caption" shortcut="A" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced ? '隐藏高级选项 <<<' : '显示高级选项 >>>'}</NativeButton>
    </div>
    <div className="sim-deployment-intro">
      <h2 data-side={side}><NativeBitmapText font="action" color="currentColor">{side === 'enemy' ? '部署敌对舰船进行模拟作战' : '部署盟军舰船参与模拟作战'}</NativeBitmapText></h2>
      {advanced ? <div className="sim-deployment-options">
        <label>筛选舰船<input aria-label="筛选模拟舰船" value={query} onChange={e => setQuery(e.target.value)} placeholder="名称 / 装配方案" /></label>
        <label>舰级<select aria-label="筛选舰级" value={size} onChange={e => setSize(e.target.value)}><option value="">全部</option><option value="CAPITAL_SHIP">主力舰</option><option value="CRUISER">巡洋舰</option><option value="DESTROYER">驱逐舰</option><option value="FRIGATE">护卫舰</option></select></label>
        <label>每方部署上限<select aria-label="每方部署上限" value={limit} onChange={e => { const value = Number(e.target.value); if (engine.setSimulationPointLimit(value)) { setLimit(value); setError(''); } else setError('不能低于场上舰船已经占用的部署点。'); }}>{[120,240,400].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <p>高级选项为当前 Web 模拟器的筛选与预算设置；未移植原作军官和战役解锁设置。</p>
      </div> : hover ? <div className="sim-deployment-detail"><strong>{hover.name} · {hover.variantName}</strong><span>部署点 {hover.cost} · {hover.spec.designation ?? ''}</span><small>{hover.errors.length ? '此装配暂不可部署：' + hover.errors.join('；') : hover.warnings.length ? '原版装配基础适配；部分特殊效果尚未完整重现。' : '使用原版模拟战斗装配'}</small></div> : null}
    </div>
    <div className="sim-deployment-roster" aria-label={side === 'enemy' ? '敌军舰船名单' : '盟军舰船名单'}>
      {options.map(option => <button type="button" className="sim-deployment-ship" key={option.id} aria-label={option.name + ' · ' + option.variantName + ' · ' + option.cost + ' 部署点'} aria-pressed={selected[side].includes(option.id)} aria-disabled={!!option.errors.length}
        onMouseEnter={() => setHover(option)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(option)} onBlur={() => setHover(null)} onClick={() => toggle(option)}>
        <img src={runtimeAssetUrl(option.spec.spriteUrl)} alt="" draggable={false} style={{ width: option.spec.spriteWidth * Math.min(.2, 52 / option.spec.spriteWidth, 56 / option.spec.spriteHeight) + 'px', height: option.spec.spriteHeight * Math.min(.2, 52 / option.spec.spriteWidth, 56 / option.spec.spriteHeight) + 'px' }} />
        <b><NativeBitmapText font="caption" color="currentColor">{String(option.cost)}</NativeBitmapText></b>
      </button>)}
      {!options.length && <p className="sim-empty">没有符合筛选条件的舰船。</p>}
    </div>
    <div className="sim-deployment-feedback" role="status">{error || (over ? '超出部署上限，请取消部分选择或调整高级选项。' : picks.length ? '已选择 ' + picks.length + ' 艘 · 新增 ' + cost + ' 部署点 · 部署后保持暂停' : '')}</div>
  </Modal>;
}
