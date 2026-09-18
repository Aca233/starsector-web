import type { InspectedWeapon, OpenWeaponCodex } from './useInspectionCodex';
export type { OpenWeaponCodex } from './useInspectionCodex';
import { useState } from 'react';
import { contentRegistry } from '../engine/content/ContentRegistry';
import { isBuiltIn, sizes, types, weaponName } from './DesignModel';
import { RefitInspection, type InspectionTarget } from './RefitInspection';
import { WeaponInformation } from './WeaponInformation';
import { RefitHoverTerm } from './RefitHoverTerms';

export function WeaponInspection({ draft, spec, slot, children, onOpenCodex, enabled = true }: InspectedWeapon & {
  children: InspectionTarget; onOpenCodex: OpenWeaponCodex; enabled?: boolean;
}) {
  const [showFitted, setShowFitted] = useState(false);
  const weapon = slot.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
  if (!weapon) return children;
  const open = () => onOpenCodex({ draft, spec, slot });
  return <RefitInspection title={weaponName(weapon.id)} enabled={enabled} hideTitle
    className="source-weapon-details refit-inspection-weapon" onOpenCodex={open} content={<>
      <WeaponInformation candidate={weapon} draft={draft} selected={slot} shipSpec={spec}
        showFitted={showFitted} onToggleFitted={() => setShowFitted(value => !value)} onOpenCodex={open} />
      <p className="equipment-state">{slot.slotId} · {sizes[slot.slotSize]}{types[slot.weaponType ?? 'UNIVERSAL']} · <RefitHoverTerm term="mount">{slot.mountType === 'HARDPOINT' ? '固定挂点' : '炮塔'}</RefitHoverTerm> · {slot.arcDeg}° 射界</p>
      <p className="equipment-state">{slot.builtIn || isBuiltIn(draft.hullId, slot.slotId) ? '舰体内置 · ' : ''}仅查看，不会安装或更改编组。</p>
    </>}>{children}</RefitInspection>;
}
