import '../studio/system-loadout.css';
import { useState } from 'react';
import { NativeButton } from './NativeChrome';
import { bindingError, bindingKeyLabel, defaultSystemBindings, readSystemBindings, saveSystemBindings, type SystemBindings } from '../engine/runtime/SystemBindings';

export function SystemBindingSettings({ slotCount = 3, slotNames, value, onEdit, onChange }: {
  slotCount?: number; slotNames?: string[]; value?: SystemBindings; onEdit?: (next: SystemBindings) => void; onChange?: () => void;
}) {
  const [saved, setSaved] = useState<SystemBindings>(() => readSystemBindings());
  const [message, setMessage] = useState('');
  const [listening, setListening] = useState<number | null>(null);
  const bindings = value ?? saved;
  const count = Math.max(3, slotCount, bindings.slots.length);
  const apply = (next: SystemBindings) => {
    const error = bindingError(next);
    if (error) { setMessage(error); return; }
    if (onEdit) { onEdit(next); setMessage('按键已修改，应用更改后生效'); }
    else { saveSystemBindings(next); setSaved(next); setMessage('快捷键已保存'); }
    onChange?.();
  };
  const setKey = (index: number, code: string | null) => {
    const slots = Array.from({ length: count }, (_, i) => bindings.slots[i] ?? null);
    if (index >= 0) slots[index] = code;
    apply({ ...bindings, slots, ...(index < 0 ? { selectedKey: code } : {}) });
  };
  const field = (index: number, code: string | null | undefined) => <input
    aria-label={index < 0 ? '轮选技能释放键' : `技能槽 ${index + 1} 快捷键`}
    value={listening === index ? '请按键…' : bindingKeyLabel(code)} readOnly title="点击后按字母键绑定；Backspace / Delete 清除"
    onFocus={() => setListening(index)} onBlur={() => setListening(null)}
    onKeyDownCapture={event => {
      if (event.code === 'Tab') return;
      event.preventDefault(); event.stopPropagation(); if (event.repeat) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) { setMessage('请使用单个字母键，不覆盖浏览器组合键'); return; }
      if (event.code === 'Escape') { event.currentTarget.blur(); return; }
      setKey(index, ['Backspace', 'Delete'].includes(event.code) ? null : event.code);
      event.currentTarget.blur();
    }} />;
  return <section className="system-binding-settings" aria-label="舰船技能快捷键">
    <div className="system-binding-heading"><h3>直接释放</h3><span>按槽位绑定</span></div>
    <p className="system-binding-help">点击键帽，再按下要使用的字母键。Delete / Backspace 清除绑定。</p>
    <div className="system-binding-grid">{Array.from({ length: count }, (_, i) => <label className="system-binding-slot" key={i}><span><small>技能槽 {String(i + 1).padStart(2, '0')}</small><strong>{slotNames?.[i] ?? '释放此槽位技能'}</strong></span>{field(i, bindings.slots[i])}</label>)}</div>
    {count < 64 && <NativeButton font="body" className="system-reset" onClick={() => apply({ ...bindings, slots: [...Array.from({ length: count }, (_, i) => bindings.slots[i] ?? null), null] })}>增加绑定槽</NativeButton>}
    <div className="system-wheel-settings"><label className="system-wheel-toggle"><span><strong>滚轮选择技能</strong><small>按住 Shift 滚动，松开后按释放键使用</small></span><input type="checkbox" checked={bindings.wheelSelect} onChange={e => apply({ ...bindings, wheelSelect: e.target.checked })}/></label>
      {bindings.wheelSelect && <label className="system-selected-binding"><span>释放选中技能</span>{field(-1, bindings.selectedKey)}</label>}
      <p>普通滚轮仍然缩放视角。数字 1–7 保留给武器组。</p>
      <p>右键释放右键槽技能；Shift + 右键控制舰体护盾 / 相位。右键槽在舰船技能装配中修改。</p>
    </div>
    <div className="system-binding-footer"><NativeButton font="body" className="system-reset" onClick={() => apply(defaultSystemBindings())}>恢复默认 F / G / H</NativeButton><p role="status">{message}</p></div>
  </section>;
}
