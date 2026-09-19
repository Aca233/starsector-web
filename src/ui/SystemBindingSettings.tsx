import '../studio/system-loadout.css';
import { useState } from 'react';
import { bindingError, bindingKeyLabel, defaultSystemBindings, readSystemBindings, saveSystemBindings, type SystemBindings } from '../engine/runtime/SystemBindings';

export function SystemBindingSettings({ slotCount = 3, onChange }: { slotCount?: number; onChange?: () => void }) {
  const [bindings, setBindings] = useState<SystemBindings>(() => readSystemBindings());
  const [message, setMessage] = useState('');
  const count = Math.max(3, slotCount, bindings.slots.length);
  const apply = (next: SystemBindings) => {
    const error = bindingError(next);
    if (error) { setMessage(error); return; }
    saveSystemBindings(next); setBindings(next); setMessage('快捷键已保存'); onChange?.();
  };
  const setKey = (index: number, code: string | null) => {
    const slots = Array.from({ length: count }, (_, i) => bindings.slots[i] ?? null);
    if (index >= 0) slots[index] = code;
    apply({ ...bindings, slots, ...(index < 0 ? { selectedKey: code } : {}) });
  };
  const field = (index: number, code: string | null | undefined) => <input
    aria-label={index < 0 ? '轮选技能释放键' : `技能槽 ${index + 1} 快捷键`}
    value={bindingKeyLabel(code)} readOnly title="点击后按字母键绑定；Backspace / Delete 清除"
    onKeyDownCapture={event => {
      if (event.code === 'Tab') return;
      event.preventDefault(); event.stopPropagation(); if (event.repeat) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) { setMessage('技能快捷键使用单个字母键，不覆盖浏览器组合键'); return; }
      if (event.code === 'Escape') { event.currentTarget.blur(); return; }
      setKey(index, ['Backspace', 'Delete'].includes(event.code) ? null : event.code);
    }} />;
  return <section className="system-binding-settings" aria-label="舰船技能快捷键">
    <h3>舰船技能快捷键</h3>
    <p>按槽位绑定，不随技能名称变化。点击键位后按字母键；Delete 清除。数字 1–7 留给武器组。</p>
    {Array.from({ length: count }, (_, i) => <label key={i}><span>技能槽 {i + 1}</span>{field(i, bindings.slots[i])}</label>)}
    {count < 64 && <button type="button" onClick={() => apply({ ...bindings, slots: [...Array.from({length: count}, (_, i) => bindings.slots[i] ?? null), null] })}>增加绑定槽</button>}
    <label><span>启用 Shift + 滚轮选择技能（普通滚轮仍缩放）</span><input type="checkbox" checked={bindings.wheelSelect} onChange={e => apply({ ...bindings, wheelSelect: e.target.checked })}/></label>
    {bindings.wheelSelect && <label><span>释放选中技能</span>{field(-1, bindings.selectedKey)}</label>}
    <button type="button" onClick={() => apply(defaultSystemBindings())}>恢复默认 F / G / H</button>
    <p role="status">{message}</p>
  </section>;
}
