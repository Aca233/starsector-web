import React from 'react';
import type { ShipSpec } from '../../engine/content/ShipSpec';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { i18n } from '../../engine/i18n/LocalizationManager';

/** Blueprint view: source sprite and real mount positions, never a screenshot painted into the UI. */
export function ShipPreview({ spec, selectedSlot, onSelectSlot }: { spec: ShipSpec; selectedSlot?: string; onSelectSlot?: (slot: string) => void }) {
  return <div className="native-ship-stage">
    <div className="native-stage-caption">{i18n.t(spec.nameKey)}</div>
    <div className="native-ship-art" style={{ '--ship-aspect': spec.spriteWidth / spec.spriteHeight, aspectRatio: `${spec.spriteWidth} / ${spec.spriteHeight}`, maxWidth: spec.spriteWidth * 1.25 } as React.CSSProperties}>
      <img src={runtimeAssetUrl(spec.spriteUrl)} alt={i18n.t(spec.nameKey)} draggable={false} />
      {onSelectSlot && spec.weaponSlots.map(slot => <button type="button" key={slot.slotId} className={`native-mount native-mount--${slot.slotSize.toLowerCase()} native-mount-type--${(slot.weaponType ?? 'UNIVERSAL').toLowerCase()}`} aria-label={`挂点 ${slot.slotId}`} aria-pressed={selectedSlot === slot.slotId}
        title={`${slot.slotId} · ${slot.defaultWeaponId || '空挂点'}`} onClick={() => onSelectSlot(slot.slotId)}
        style={{ left: `${100 * (spec.pivotX + slot.y) / spec.spriteWidth}%`, top: `${100 * (spec.pivotY - slot.x) / spec.spriteHeight}%` }} />)}
    </div>
    <div className="native-stage-footer">{onSelectSlot ? '选择挂点查看装备' : '舰队战前状态'}<span>{spec.weaponSlots.length} 挂点</span></div>
  </div>;
}
export function Readout({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="native-readout"><span>{label}</span><strong>{value}</strong></div>;
}
export function ConditionBar({ label, value, kind = 'hull' }: { label: string; value: number; kind?: 'hull' | 'cr' }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className="native-condition"><Readout label={label} value={`${percent}%`} /><div className={`native-condition-track native-condition--${kind}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div></div>;
}
