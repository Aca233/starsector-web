import { useId, useRef, useState } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { NativeBitmapText } from '../ui/NativeBitmapText';
import { effectiveHullStats } from '../engine/extensions/HullMods';
import type { ShipSpec } from '../engine/content/ShipSpec';
import { shipSystemDefinitions } from '../engine/extensions/ship-systems/Registry';
import type { ShipSystemDefinition } from '../engine/extensions/ship-systems/Types';
import { defenseSystemId, tacticalSystemIds, systemLoadoutErrors } from '../engine/extensions/ship-systems/Loadout';
import { bindingError, bindingKeyLabel, readSystemBindings, saveSystemBindings, type SystemBindings } from '../engine/runtime/SystemBindings';
import { SystemBindingSettings } from '../ui/SystemBindingSettings';
import { Modal } from '../ui/core/UI';
import type { Design } from './DesignModel';
import './system-loadout.css';

const controlLabels: Partial<Record<keyof NonNullable<ShipSystemDefinition['controls']>, string>> = {
  blockWeapons: '禁止开火', blockShields: '关闭护盾', lockTurning: '锁定转向', forceForward: '持续前进',
  blockVenting: '无法排幅', blockStrafing: '无法横移', blockFluxDissipation: '暂停幅能耗散',
};
const seconds = (n: number) => Number.isFinite(n) ? `${n} s` : '持续';
function duration(definition: ShipSystemDefinition) {
  return definition.toggle ? '手动开关' : definition.active === 0 ? '瞬时生效' : seconds(definition.active);
}

export function SystemLoadoutEditor({ draft, spec, disabled, onChange }: { draft: Design; spec: ShipSpec; disabled?: boolean; onChange: (draft: Design) => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'loadout' | 'keys'>('loadout');
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState<'all' | 'compatible' | 'equipped'>('compatible');
  const [pendingTypes, setPendingTypes] = useState<string[] | undefined>();
  const [pendingRightClick, setPendingRightClick] = useState<string | undefined>();
  const [bindings, setBindings] = useState<SystemBindings>(() => readSystemBindings());
  const [initialBindings, setInitialBindings] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [feedback, setFeedback] = useState('');
  const tabId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const currentIds = tacticalSystemIds(spec);
  const currentCount = currentIds.length + (defenseSystemId(spec) === 'NONE' ? 0 : 1);
  const editedSpec = { ...spec, systemTypes: pendingTypes, rightClickSystemType: pendingRightClick };
  const ids = tacticalSystemIds(editedSpec);
  const errors = systemLoadoutErrors(editedSpec);
  const selection = shipSystemDefinitions.get(selectedId);
  const installedIndex = ids.indexOf(selectedId);
  const defenseId = defenseSystemId(editedSpec);
  const installedRight = selectedId === defenseId && defenseId !== 'NONE';
  const shieldType = effectiveHullStats(editedSpec).shieldType;
  const hullDefenseName = shieldType === 'PHASE' ? '舰体相位潜航' : shieldType === 'NONE' ? '无舰体护盾' : '舰体护盾';
  const rightClickName = defenseId === 'NONE' ? hullDefenseName : shipSystemDefinitions.get(defenseId)?.name ?? defenseId;
  const reasonFor = (definition: ShipSystemDefinition) => definition.installReason?.(editedSpec);
  const reason = selection ? reasonFor(selection) : undefined;
  const skills = shipSystemDefinitions.all().filter(d => d.id !== 'NONE' && !d.unavailable);
  const results = skills.filter(d => (d.name + d.id).toLowerCase().includes(filter.toLowerCase().trim()) &&
    (scope === 'all' || (scope === 'equipped' ? ids.includes(d.id) || defenseId === d.id : !reasonFor(d) || ids.includes(d.id) || defenseId === d.id)));
  const typesDirty = JSON.stringify(pendingTypes) !== JSON.stringify(draft.systemTypes);
  const keysDirty = JSON.stringify(bindings) !== initialBindings;
  const rightClickDirty = pendingRightClick !== draft.rightClickSystemType;
  const dirty = typesDirty || rightClickDirty || keysDirty;
  const edit = () => {
    setPendingTypes(draft.systemTypes ? [...draft.systemTypes] : undefined);
    setPendingRightClick(draft.rightClickSystemType);
    const next = structuredClone(readSystemBindings());
    setBindings(next); setInitialBindings(JSON.stringify(next));
    setSelectedId(currentIds[0] ?? skills[0]?.id ?? '');
    setPage('loadout'); setFilter(''); setScope('compatible'); setFeedback(''); setOpen(true);
  };
  const move = (index: number, offset: number) => {
    const next = [...ids]; [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setPendingTypes(next); setFeedback('技能顺序已调整，应用后生效');
  };
  const remove = (id: string) => {
    setPendingTypes(ids.filter(value => value !== id));
    setFeedback(`已卸下${shipSystemDefinitions.get(id)?.name ?? id}，应用后生效`);
  };
  const equip = (rightClick: boolean) => {
    if (!selection || disabled || reason) return;
    if (rightClick) {
      if (installedIndex >= 0) setPendingTypes(ids.filter(id => id !== selection.id));
      setPendingRightClick(selection.id);
    } else {
      if (ids.length >= 64) return;
      if (installedRight) setPendingRightClick('NONE');
      setPendingTypes([...ids, selection.id]);
    }
    setFeedback(`已${installedIndex >= 0 || installedRight ? '移动' : '装配'}${selection.name}到${rightClick ? '右键' : '技能槽'}，应用后生效`);
  };
  const clearRightClick = () => {
    setPendingRightClick('NONE'); setFeedback(`已卸下右键技能${shieldType !== 'NONE' ? '，右键恢复' + hullDefenseName : ''}，应用后生效`);
  };
  const apply = () => {
    if (disabled || errors.length || bindingError(bindings)) return;
    if (typesDirty || rightClickDirty) onChange({ ...draft, systemTypes: pendingTypes ? [...pendingTypes] : undefined, rightClickSystemType: pendingRightClick });
    if (keysDirty) saveSystemBindings(bindings);
    setOpen(false);
  };
  return <>
    <NativeButton className="system-loadout-entry" aria-label={`装配舰船技能 · ${currentCount} 项`} disabled={disabled} onClick={edit}>
      <NativeBitmapText font="button">舰船技能</NativeBitmapText><span className="system-entry-action">{currentCount} 项 · 装配...</span>
    </NativeButton>
    {open && <Modal title="舰船技能装配" eyebrow={draft.name} width="wide" surface="solid" className="system-loadout-modal" initialFocus="panel" onClose={() => setOpen(false)} onShortcut={key => { if (key === 'g' && page === 'loadout') apply(); }}
      footer={<>
        <div className="system-editor-feedback" role="status"><span className={dirty ? 'is-pending' : ''}>{dirty ? '● 尚未应用' : '配置已同步'}</span><small>{feedback || '只修改当前方案，原版舰船不变。'}</small></div>
        <NativeButton className="system-button" shortcut="Esc" onClick={() => setOpen(false)}>取消</NativeButton>
        <NativeButton className="system-button system-button--primary" shortcut={page === 'loadout' ? 'G' : undefined} disabled={disabled || errors.length > 0 || !!bindingError(bindings)} onClick={apply}>{dirty ? '应用更改' : '完成'}</NativeButton>
      </>}>
      <div className="system-editor-tabs" role="tablist" aria-label="技能装配页面">
        <NativeButton id={`${tabId}-loadout`} aria-controls={`${tabId}-panel`} role="tab" aria-selected={page === 'loadout'} onClick={() => setPage('loadout')}>技能装配</NativeButton>
        <NativeButton id={`${tabId}-keys`} aria-controls={`${tabId}-panel`} role="tab" aria-selected={page === 'keys'} onClick={() => setPage('keys')}>快捷键</NativeButton>
        <span>独立冷却 · 共享幅能</span>
      </div>
      <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${page}`} className={`system-editor-page system-editor-page--${page}`}>
        {page === 'keys' ? <div className="system-editor-keypage"><header><h3><NativeBitmapText font="button">舰船技能快捷键</NativeBitmapText></h3><p>按键跟随槽位，不绑定某一个技能。这里的修改在「应用更改」后保存。</p></header>
          <SystemBindingSettings slotCount={ids.length} slotNames={ids.map(id => shipSystemDefinitions.get(id)?.name ?? id)} value={bindings} onEdit={setBindings}/></div> : <div className="system-workbench">
          <section className="system-equipped" aria-label="当前装配">
            <header className="system-pane-heading"><h3><NativeBitmapText font="body">当前装配</NativeBitmapText></h3><span>{ids.length} 键盘 · {defenseId === 'NONE' ? 0 : 1} 右键</span></header>
            <p className="system-pane-hint">键盘技能按顺序排列；右键可单独装配</p>
            <ol className="system-equipped-list">{ids.map((id, index) => <li key={id} className={selectedId === id ? 'is-selected' : ''}>
              <button type="button" className="system-slot-select" aria-label={`查看技能槽 ${index + 1}：${shipSystemDefinitions.get(id)?.name ?? id}`} aria-pressed={selectedId === id} onClick={() => setSelectedId(id)}>
                <kbd>[{bindingKeyLabel(bindings.slots[index])}]</kbd><span><small>技能槽 {String(index + 1).padStart(2, '0')}</small><strong><NativeBitmapText font="body">{shipSystemDefinitions.get(id)?.name ?? id}</NativeBitmapText></strong></span>
              </button>
              <div className="system-slot-actions"><button type="button" aria-label={`上移技能 ${index + 1}`} title="上移" disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button>
                <button type="button" aria-label={`下移技能 ${index + 1}`} title="下移" disabled={disabled || index === ids.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button type="button" aria-label={`卸下技能 ${index + 1}：${shipSystemDefinitions.get(id)?.name ?? id}`} title="卸下" disabled={disabled} onClick={() => remove(id)}>×</button></div>
            </li>)}</ol>
            <button type="button" className="system-slot-empty" onClick={() => { setScope('compatible'); setFilter(''); searchRef.current?.focus(); }}><b aria-hidden="true">+</b><span>{ids.length ? '继续从技能库添加' : '尚未装配技能'}<small>选择技能，查看详情后装配</small></span></button>
            {errors.length > 0 && <div className="system-loadout-errors" role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}
            <div className="system-equipped-bottom">
              <div className="system-right-click-slot" aria-label="右键槽">
                <button type="button" className="system-slot-select" aria-label={`更换右键技能：${rightClickName}`} onClick={() => { setSelectedId(defenseId !== 'NONE' ? defenseId : selectedId); setScope('compatible'); setFilter(''); setFeedback('在技能详情中选择「装配到右键」'); searchRef.current?.focus(); }}>
                  <kbd>[右键]</kbd><span><small>右键槽{pendingRightClick === undefined ? ' · 舰体默认' : ' · 自定义'}</small><strong><NativeBitmapText font="body">{rightClickName}</NativeBitmapText></strong></span>
                </button>
                <p>{defenseId !== 'NONE' && shieldType !== 'NONE' ? `Shift + 右键：${hullDefenseName}` : '选择技能，再点击「装配到右键」'}</p>
                <div className="system-right-click-actions">
                  <NativeButton font="body" disabled={disabled || defenseId === 'NONE'} onClick={clearRightClick}>卸下右键技能</NativeButton>
                  <NativeButton font="body" disabled={disabled || pendingRightClick === undefined} onClick={() => { setPendingRightClick(undefined); setFeedback('右键已恢复舰体默认，应用后生效'); }}>恢复默认</NativeButton>
                </div>
              </div>
              <button type="button" className="system-reset" disabled={disabled} onClick={() => { setPendingTypes(undefined); setPendingRightClick(undefined); setFeedback('已恢复舰体默认技能和右键，应用后生效'); }}>恢复舰体默认技能</button>
            </div>
          </section>
          <section className="system-library" aria-label="技能库">
            <header className="system-pane-heading"><h3><NativeBitmapText font="body">可用技能</NativeBitmapText></h3><span>{results.length} / {skills.length}</span></header>
            <div className="system-search"><input ref={searchRef} aria-label="搜索舰船技能" placeholder="搜索名称或 ID" value={filter} onChange={e => setFilter(e.target.value)}/>{filter && <button type="button" aria-label="清除技能搜索" onClick={() => setFilter('')}>×</button>}</div>
            <div className="system-library-filters" aria-label="技能筛选">{([['compatible', '可装配'], ['all', '全部'], ['equipped', '已装配']] as const).map(([value, label]) => <NativeButton font="body" key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</NativeButton>)}</div>
            <div className="system-library-list">{results.map(definition => {
              const installed = ids.includes(definition.id) || defenseId === definition.id, requirement = reasonFor(definition);
              return <button type="button" key={definition.id} className="system-library-item" aria-label={`查看技能：${definition.name}`} aria-pressed={selectedId === definition.id} onClick={() => setSelectedId(definition.id)}>
                <span className={`system-fit-icon ${installed ? 'is-installed' : requirement ? 'is-locked' : ''}`}>{installed ? '●' : requirement ? '×' : '·'}</span>
                <span><strong><NativeBitmapText font="body">{definition.name}</NativeBitmapText></strong><small>{installed ? defenseId === definition.id ? '已装配 · 右键' : '已装配 · 技能槽' : requirement ? '需要配套设备' : duration(definition)}</small></span><span className="system-row-arrow" aria-hidden="true">›</span>
              </button>;
            })}{!results.length && <div className="system-library-empty"><p>没有匹配的技能</p><button type="button" className="system-reset" onClick={() => { setFilter(''); setScope('all'); }}>清除筛选，查看全部</button></div>}</div>
          </section>
          <section className="system-detail" aria-label="技能详情">
            {selection ? <>
              <div className="system-detail-scroll" key={selection.id}><span className="system-section-kicker">技能详情</span><h3><NativeBitmapText font="button">{selection.name}</NativeBitmapText></h3><span className={`system-detail-state ${installedIndex >= 0 || installedRight ? 'is-installed' : reason ? 'is-locked' : ''}`}>{installedRight ? '已装配 · 右键' : installedIndex >= 0 ? `已装配 · 技能槽 ${installedIndex + 1}` : reason ? '装配条件未满足' : '可装配到当前舰船'}</span>
                <p className="system-detail-description">{selection.description ?? selection.implementationDetails ?? (selection.id === 'BURN_DRIVE' ? '预热后向前冲刺，快速接近目标。启动期间收起护盾、锁定转向，并保持向前推进。' : '沿用原版技能效果，独立计算冷却与充能。')}</p>
                <dl className="system-detail-stats"><div><dt>启动时间</dt><dd>{seconds(selection.chargeUp)}</dd></div><div><dt>持续方式</dt><dd>{duration(selection)}</dd></div><div><dt>冷却时间</dt><dd>{seconds(selection.cooldown)}</dd></div><div><dt>充能上限</dt><dd>{selection.charges !== undefined ? `${selection.charges} 次` : '不限次数'}</dd></div></dl>
                {selection.controls && Object.entries(controlLabels).some(([key]) => selection.controls?.[key as keyof typeof controlLabels]) && <div className="system-detail-controls"><h4>生效期间</h4><ul>{Object.entries(controlLabels).filter(([key]) => selection.controls?.[key as keyof typeof controlLabels]).map(([key, label]) => <li key={key}>{label}</li>)}</ul></div>}
                {selection.implementationDetails && selection.description && <details className="system-detail-more"><summary>实现说明</summary><p>{selection.implementationDetails}</p></details>}
                {reason && <div className="system-requirement"><span>{reason}</span></div>}
                <div className="system-detail-tip"><span>技能共享幅能，冷却和充能独立。每种技能只能装一份，换槽会移动而不是复制。右键装技能后，Shift + 右键仍控制舰体护盾或相位。</span></div>
              </div>
              <div className="system-detail-action">
                {installedIndex >= 0 ? <NativeButton className="system-button" disabled={disabled} onClick={() => remove(selection.id)}>卸下技能槽技能</NativeButton> : <NativeButton className="system-button" disabled={disabled || !!reason || ids.length >= 64} onClick={() => equip(false)}>{ids.length >= 64 ? '技能槽已达上限' : installedRight ? '移至键盘技能槽' : '装配到技能槽'}</NativeButton>}
                {installedRight ? <NativeButton className="system-button" disabled={disabled} onClick={clearRightClick}>卸下右键技能</NativeButton> : <NativeButton className="system-button system-button--primary" disabled={disabled || !!reason} onClick={() => equip(true)}>{installedIndex >= 0 ? '移至右键' : '装配到右键'}</NativeButton>}
              </div>
            </> : <div className="system-library-empty">选择一个技能查看详情</div>}
          </section>
        </div>}
      </div>
    </Modal>}
  </>;
}
