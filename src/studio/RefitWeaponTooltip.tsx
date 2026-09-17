import { useEffect, useLayoutEffect, useState } from 'react';
import type { ShipSpec, WeaponMountSlotConfig } from '../engine/content/ShipSpec';
import type { WeaponSpec } from '../engine/simulation/Weapon';
import { contentRegistry } from '../engine/content/ContentRegistry';
import { NativeBorder } from '../ui/NativeChrome';
import { Modal } from '../ui/core/UI';
import { isBuiltIn, sizes, types, weaponName } from './DesignModel';
import type { Design } from './DesignModel';
import { EquipmentTooltip } from './EquipmentTooltip';
import { useEquipmentHover } from './useEquipmentHover';
import { WeaponInformation } from './WeaponInformation';
import './refit-weapon-tooltip.css';

/** Inspect installed and empty mounts without opening the replacement picker. */
export function useRefitWeaponTooltip(draft: Design, spec: ShipSpec, enabled: boolean) {
  const hover = useEquipmentHover();
  const { hide } = hover;
  const [showFitted, setShowFitted] = useState(false);
  const [encyclopedia, setEncyclopedia] = useState<{ weapon: WeaponSpec; slot: WeaponMountSlotConfig } | null>(null);
  const [inspectedHullId, setInspectedHullId] = useState(draft.hullId);
  // A different hull must never inherit the previous hull's open encyclopedia.
  if (inspectedHullId !== draft.hullId) {
    setInspectedHullId(draft.hullId);
    setEncyclopedia(null);
  }
  const slot = enabled ? spec.weaponSlots.find(s => s.slotId === hover.active?.id) : undefined;
  const weapon = slot?.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
  useEffect(() => { hide(); }, [draft.hullId, hide]);
  useEffect(() => { if (!enabled) hide(); }, [enabled, hide]);
  useLayoutEffect(() => {
    if (!slot || encyclopedia) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); hide(); return; }
      if (!weapon || event.key !== 'F2' || event.repeat) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setEncyclopedia({ weapon, slot }); hide();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [slot, weapon, encyclopedia, hide]);
  const toggleFitted = () => setShowFitted(value => !value);
  return {
    hide,
    activeSlot: !encyclopedia ? slot : undefined,
    bind: (id: string) => enabled && !encyclopedia ? hover.bind(id) : {},
    content: <>
      {slot && !encyclopedia && <EquipmentTooltip key={slot.slotId} hover={hover} preferSide="left"
        positionAnchor={hover.active?.anchor.closest<HTMLElement>(".studio-ship")}
        className="source-weapon-details refit-weapon-tooltip">
        <NativeBorder />
        {weapon ? <WeaponInformation candidate={weapon} draft={draft} selected={slot}
          showFitted={showFitted} onToggleFitted={toggleFitted}
          onOpenCodex={() => { setEncyclopedia({ weapon, slot }); hide(); }} />
          : <><h3>空武器槽位</h3><p>安装类型：<mark>{sizes[slot.slotSize]}，{types[slot.weaponType ?? 'UNIVERSAL']}</mark></p>
            <p>可以安装兼容且不大于该槽位尺寸的武器。</p></>}
        <p className="refit-weapon-mount-info">{sizes[slot.slotSize]}{types[slot.weaponType ?? 'UNIVERSAL']} · {slot.mountType === 'HARDPOINT' ? '固定挂点' : '炮塔'} · {slot.arcDeg}° 射界</p>
        <p className="equipment-state">{isBuiltIn(draft.hullId, slot.slotId) ? '舰体内置，不能拆卸或替换' : weapon ? '左键更换武器 · 右键卸下' : '左键选择武器'}</p>
      </EquipmentTooltip>}
      {encyclopedia && <Modal title={weaponName(encyclopedia.weapon.id)} eyebrow="武器数据百科"
        onClose={() => { setEncyclopedia(null); hide(); }}>
        <article className="refit-weapon-encyclopedia source-weapon-details">
          <WeaponInformation candidate={encyclopedia.weapon} draft={draft} selected={encyclopedia.slot}
            showFitted={showFitted} onToggleFitted={toggleFitted} />
        </article>
      </Modal>}
    </>,
  };
}
