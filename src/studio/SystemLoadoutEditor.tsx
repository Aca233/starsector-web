import { useState } from 'react';
import type { ShipSpec } from '../engine/content/ShipSpec';
import { shipSystemDefinitions } from '../engine/extensions/ship-systems/Registry';
import { tacticalSystemIds, systemLoadoutErrors } from '../engine/extensions/ship-systems/Loadout';
import { systemBindingLabel } from '../engine/runtime/SystemBindings';
import { SystemBindingSettings } from '../ui/SystemBindingSettings';
import { Modal } from '../ui/core/UI';
import type { Design } from './DesignModel';
import './system-loadout.css';

export function SystemLoadoutEditor({ draft, spec, disabled, onChange }: { draft: Design; spec: ShipSpec; disabled?: boolean; onChange: (draft: Design) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [, refreshBindings] = useState(0);
  const ids = tacticalSystemIds(spec);
  const setIds = (systemTypes: string[]) => { if (!disabled) onChange({ ...draft, systemTypes }); };
  return <>
    <button type="button" className="system-loadout-entry" disabled={disabled} onClick={() => setOpen(true)}>装配舰船技能 · {ids.length} 项</button>
    {open && <Modal title="舰船技能装配" onClose={() => setOpen(false)}>
      <div className="system-loadout-editor">
        <p>只修改当前自定义方案；不修改原版舰船。每个技能独立冷却、充能，共享舰船幅能。本版技能不消耗 OP。</p>
        <h3>已装配 · 顺序对应快捷键槽位</h3>
        {!ids.length && <p>未装配战术技能；独立防御不受影响。</p>}
        <ol>{ids.map((id, index) => <li key={id + index}>
          <span>{index + 1}. {shipSystemDefinitions.get(id)?.name ?? id} [{systemBindingLabel(index)}]</span>
          <button type="button" aria-label={`上移技能 ${index + 1}`} disabled={disabled || index === 0} onClick={() => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setIds(next); }}>↑</button>
          <button type="button" aria-label={`下移技能 ${index + 1}`} disabled={disabled || index === ids.length - 1} onClick={() => { const next = [...ids]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setIds(next); }}>↓</button>
          <button type="button" disabled={disabled} onClick={() => setIds(ids.filter((_, i) => i !== index))}>卸下</button>
        </li>)}</ol>
        <button type="button" disabled={disabled} onClick={() => onChange({ ...draft, systemTypes: undefined })}>恢复舰体默认技能</button>
        {systemLoadoutErrors(spec).map(error => <p role="alert" key={error}>{error}</p>)}
        <h3>独立技能库</h3>
        <input aria-label="搜索舰船技能" placeholder="搜索技能名称或 ID" value={filter} onChange={e => setFilter(e.target.value)}/>
        <div className="system-catalog">{shipSystemDefinitions.all().filter(d => d.id !== 'NONE' && !d.unavailable && (d.name + d.id).toLowerCase().includes(filter.toLowerCase())).map(definition => {
          const reason = ids.includes(definition.id) ? '已装配' : definition.id === spec.defenseSystemType ? '已在独立防御槽' : definition.installReason?.(spec);
          return <article key={definition.id}>
            <header><strong>{definition.name}</strong><button type="button" disabled={disabled || !!reason || ids.length >= 64} title={reason} onClick={() => setIds([...ids, definition.id])}>{reason ? '不可添加' : '添加'}</button></header>
            <p>{definition.description ?? '独立战术技能，沿用原版时序与效果。'}</p>
            <small>{definition.toggle ? '开关型' : `持续 ${definition.active}s`} · 冷却 {definition.cooldown}s{definition.charges ? ` · ${definition.charges} 次充能` : ''}</small>
            {reason && <p className="system-fit-reason">{reason}</p>}
          </article>;
        })}</div>
        <SystemBindingSettings slotCount={ids.length} onChange={() => refreshBindings(n => n + 1)}/>
      </div>
    </Modal>}
  </>;
}
