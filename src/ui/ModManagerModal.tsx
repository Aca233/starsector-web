import { tacticalSystemIds } from '../engine/extensions/ship-systems/Loadout';
import { installedHullMods, effectiveHullStats } from '../engine/extensions/HullMods';
import { shipSystemDefinitions } from '../engine/extensions/ship-systems/Registry';
import React, { useState } from 'react';
import { modManager } from '../engine/modding/ModManager';
import { i18n } from '../engine/i18n/LocalizationManager';
import { contentRegistry } from '../engine/content/ContentRegistry';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import { effectiveWeaponRange } from '../engine/simulation/WeaponRange';
import { Button, Modal } from './core/UI';
import { Readout, ShipPreview } from './core/ShipPreview';

const sizes = { SMALL: '小型', MEDIUM: '中型', LARGE: '大型' };
const slots: Record<string, string> = { BALLISTIC:'实弹', ENERGY:'能量', MISSILE:'导弹', HYBRID:'混合', COMPOSITE:'复合', SYNERGY:'协同', UNIVERSAL:'通用', BUILT_IN:'内置' };
interface Props { isOpen: boolean; onClose: () => void; onSelectShip: (shipId: string) => void; allowSandboxSwitch?: boolean; currentShipId?: string }
export function ModManagerModal({ isOpen, onClose, onSelectShip, allowSandboxSwitch = true, currentShipId }: Props) {
  const ships = modManager.getAllShips();
  const [selectedId, setSelectedId] = useState(currentShipId ?? ships[0]?.id);
  const [slotId, setSlotId] = useState('');
  if (!isOpen) return null;
  const ship = modManager.getShip(selectedId), slot = ship?.weaponSlots.find(s => s.slotId === slotId);
  const stats = ship ? effectiveHullStats(ship) : undefined;
  const weapon = slot?.defaultWeaponId ? contentRegistry.getWeapon(slot.defaultWeaponId) : undefined;
  return <Modal title={allowSandboxSwitch ? "切换舰船" : "舰船资料"} width="console" onClose={onClose} footer={<>
    <span className="native-statusline">{allowSandboxSwitch ? '自定义沙盒预设 · 不改变存档舰队' : '舰队出击中，仅可查看'}</span>
    {allowSandboxSwitch && ship && <Button size="sm" variant="primary" onClick={() => { onSelectShip(ship.id); onClose(); }}>驾驶该舰</Button>}
  </>}>
    <div className="native-console">
      <nav className="native-roster" aria-label="舰船目录">{ships.map(s => <button type="button" className="native-roster-item" key={s.id} aria-pressed={s.id === selectedId} onClick={() => { setSelectedId(s.id); setSlotId(''); }}>
        <img src={runtimeAssetUrl(s.spriteUrl)} alt="" /><strong>{i18n.t(s.nameKey).split(' (')[0]}</strong>
      </button>)}</nav>
      {ship && <ShipPreview spec={ship} selectedSlot={slotId} onSelectSlot={setSlotId} />}
      <aside className="native-side">{ship && <>
        <h3>舰船参数</h3><Readout label="结构值" value={ship.hitpoints.toLocaleString()} /><Readout label="装甲值" value={stats!.armorRating.toLocaleString()} /><Readout label="幅能容量" value={stats!.maxFlux.toLocaleString()} /><Readout label="幅能耗散" value={stats!.fluxDissipation.toLocaleString()} /><Readout label="基础航速" value={ship.maxSpeed} />
        {tacticalSystemIds(ship).map((id, index) => <Readout key={index} label={'技能 ' + (index + 1)} value={shipSystemDefinitions.require(id).name} />)}
        {installedHullMods(ship).map(mod => <Readout key={mod.id} label={mod.status === 'implemented' ? '生效舰装' : '尚未实现'} value={mod.name} />)}
        <h3>{slot ? '挂点 ' + slot.slotId : '武器'}</h3>
        {slot ? <><Readout label="尺寸" value={sizes[slot.slotSize]} /><Readout label="兼容类型" value={slots[slot.weaponType ?? ''] ?? '未声明'} />
          {weapon ? <><p className="native-brief">{i18n.t(weapon.nameKey)}</p><Readout label="基础射程" value={weapon.range} /><Readout label="当前射程" value={Math.round(effectiveWeaponRange(ship,weapon))} /><Readout label={weapon.isBeam ? '基础每秒伤害' : '基础单发伤害'} value={weapon.isBeam ? weapon.damagePerSecond : weapon.damagePerShot} /><Readout label="伤害类型" value={i18n.t('damage.' + weapon.type.toLowerCase()).split(' (')[0]} /></> : <p className="ui-caption">空挂点</p>}
        </> : <p className="ui-caption">选择舰体挂点查看装备。</p>}
      </>}</aside>
    </div>
  </Modal>;
}
