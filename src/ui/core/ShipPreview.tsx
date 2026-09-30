import React from 'react';
import type { ShipSpec } from '../../engine/content/ShipSpec';
import { AssemblyThumbnail } from './AssemblyThumbnail';
import { assemblySpriteLayout } from '../../engine/content/ModuleGeometry';
import { i18n } from '../../engine/i18n/LocalizationManager';

/** Blueprint view: source sprite and real mount positions, never a screenshot painted into the UI. */
export function ShipPreview({ spec, selectedSlot, onSelectSlot }: { spec: ShipSpec; selectedSlot?: string; onSelectSlot?: (slot: string) => void }) {
  const layout = React.useMemo(() => assemblySpriteLayout(spec), [spec]);
  return <div className="native-ship-stage">
    <div className="native-stage-caption">{i18n.t(spec.nameKey)}</div>
    <div className="native-ship-art" style={{ '--ship-aspect': layout.width / layout.height, aspectRatio: `${layout.width} / ${layout.height}`, maxWidth: layout.width * 1.25 } as React.CSSProperties}>
      <AssemblyThumbnail spec={spec} label={i18n.t(spec.nameKey)} />
      {onSelectSlot && spec.weaponSlots.map(slot => <button type="button" key={slot.slotId} className={`native-mount native-mount--${slot.slotSize.toLowerCase()} native-mount-type--${(slot.weaponType ?? 'UNIVERSAL').toLowerCase()}`} aria-label={`挂点 ${slot.slotId}`} aria-pressed={selectedSlot === slot.slotId}
        title={`${slot.slotId} · ${slot.defaultWeaponId || '空挂点'}`} onClick={() => onSelectSlot(slot.slotId)}
        style={{ left: `${100 * (slot.y-layout.minX) / layout.width}%`, top: `${100 * (-slot.x-layout.minY) / layout.height}%` }} />)}
    </div>
    <div className="native-stage-footer">{onSelectSlot ? spec.modules?.length ? '选择本体挂点查看装备' : '选择挂点查看装备' : '舰队战前状态'}<span>{layout.parts.reduce((total, part) => total + part.spec.weaponSlots.length, 0)} 挂点</span></div>
  </div>;
}
export function Readout({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="native-readout"><span>{label}</span><strong>{value}</strong></div>;
}
export function ConditionBar({ label, value, kind = 'hull' }: { label: string; value: number; kind?: 'hull' | 'cr' }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className="native-condition"><Readout label={label} value={`${percent}%`} /><div className={`native-condition-track native-condition--${kind}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div></div>;
}
