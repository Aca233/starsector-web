import { useState } from 'react';
import type { ShipSpec, WeaponMountSlotConfig } from '../engine/content/ShipSpec';
import { contentRegistry } from '../engine/content/ContentRegistry';
import { Modal } from '../ui/core/UI';
import { MotionPresence } from '../ui/core/MotionPresence';
import { weaponName, type Design } from './DesignModel';
import { WeaponInformation } from './WeaponInformation';

export interface InspectedWeapon { draft: Design; spec: ShipSpec; slot: WeaponMountSlotConfig }
export type OpenWeaponCodex = (weapon: InspectedWeapon) => void;
/** Owned by the containing dialog, so making its hover chain inert cannot unmount the encyclopedia. */
export function useInspectionCodex() {
  const [entry, setEntry] = useState<InspectedWeapon | null>(null);
  const [showFitted, setShowFitted] = useState(false);
  const weapon = entry?.slot.defaultWeaponId ? contentRegistry.getWeapon(entry.slot.defaultWeaponId) : undefined;
  return { open: setEntry, isOpen: !!entry, content: <MotionPresence>{entry && weapon &&
    <Modal title={weaponName(weapon.id)} eyebrow="武器数据百科" onClose={() => setEntry(null)}>
      <article className="refit-weapon-encyclopedia source-weapon-details">
        <WeaponInformation candidate={weapon} draft={entry.draft} selected={entry.slot} shipSpec={entry.spec}
          showFitted={showFitted} onToggleFitted={() => setShowFitted(value => !value)} />
      </article>
    </Modal>}</MotionPresence> };
}
