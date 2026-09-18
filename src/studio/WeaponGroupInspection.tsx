import type { ShipSpec } from '../engine/content/ShipSpec';
import { weaponName, type Design, type Group } from './DesignModel';
import { RefitHoverTerm } from './RefitHoverTerms';
import { RefitInspection, type InspectionTarget } from './RefitInspection';
import { WeaponInspection, type OpenWeaponCodex } from './WeaponInspection';

export function WeaponGroupInspection({ group, draft, spec, flux, children, onOpenCodex, enabled }: {
  group: Group; draft: Design; spec: ShipSpec; flux: number; children: InspectionTarget; onOpenCodex: OpenWeaponCodex; enabled: boolean;
}) {
  const members = group.weaponSlotIds.flatMap(id => {
    const slot = spec.weaponSlots.find(slot => slot.slotId === id && slot.defaultWeaponId);
    return slot ? [slot] : [];
  });
  return <RefitInspection title={'武器组 ' + (group.index + 1)} className="refit-group-inspection" enabled={enabled} content={<>
    <p><RefitHoverTerm term={group.mode === 'LINKED' ? 'linked' : 'alternating'}>{group.mode === 'LINKED' ? '同步射击' : '交替射击'}</RefitHoverTerm> · <RefitHoverTerm term="autofire">自动开火{group.isAutofire ? '开启' : '关闭'}</RefitHoverTerm></p>
    <p><RefitHoverTerm term="groupFlux">组幅能 / 秒</RefitHoverTerm> {flux}</p>
    <p className="refit-inspection-note">当前窗口中的待确认编组。确认后生效；取消不会保存修改。</p>
    <h4>组内武器 · {members.length} 门</h4>
    {members.length ? <ul className="refit-inspection-list">{members.map(slot => <li key={slot.slotId}>
      <WeaponInspection draft={draft} spec={spec} slot={slot} onOpenCodex={onOpenCodex}>
        <button type="button" className="refit-inspection-item"><span>{weaponName(slot.defaultWeaponId!)}</span><small>{slot.slotId} · {slot.mountType === 'HARDPOINT' ? '固定挂点' : '炮塔'}</small></button>
      </WeaponInspection>
    </li>)}</ul> : <p className="equipment-state">空武器组。在左侧网格点击此组对应的格子分配武器。</p>}
  </>}>{children}</RefitInspection>;
}
