import { fleetInspectionDesign, fleetShipCondition } from './FleetDeploymentRoster';
import { useMemo } from 'react';
import type { Ship } from '../../engine/simulation/Ship';
import type { ShipSpec } from '../../engine/content/ShipSpec';
import { data, nativeRefit, weaponName } from '../../studio/DesignModel';
import { LoadoutSection } from '../../studio/VariantInspection';
import { RefitInspection, type InspectionTarget } from '../../studio/RefitInspection';
import type { OpenWeaponCodex } from '../../studio/useInspectionCodex';
import { ModInformation } from '../../studio/HullModInformation';
import { WingInformation } from '../../studio/WingInformation';

export function FleetShipInspection({ ship, name, cost, status, children, enabled, onOpenCodex }: {
  ship: Ship; name: string; cost: number; status: string; children: InspectionTarget; enabled: boolean;
  onOpenCodex: OpenWeaponCodex;
}) {
  return <RefitInspection title={name} className="refit-loadout-inspection simulation-option-inspection" enabled={enabled}
    content={<FleetShipInformation ship={ship} cost={cost} status={status} onOpenCodex={onOpenCodex} />}>{children}</RefitInspection>;
}
function FleetShipInformation({ ship, cost, status, onOpenCodex }: { ship: Ship; cost: number; status: string; onOpenCodex: OpenWeaponCodex }) {
  const result = useMemo(() => {
    try { return { draft: fleetInspectionDesign(ship.spec), error: '' }; }
    catch (error) { return { draft: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [ship.spec]);
  return <>
    <p>{cost} DP · {status} · {fleetShipCondition(ship)}</p>
    <p className="refit-inspection-note">本场舰船的真实配装，只读。每一行是一艘独立舰船；点击行选择，再确认部署。</p>
    {result.draft ? <LoadoutSection draft={result.draft} spec={ship.spec} onOpenCodex={onOpenCodex} /> : <>
      <p className="equipment-state">{result.error}；以下仍列出实际装备，不替换为默认配装。</p>
      <FleetSpecEquipment spec={ship.spec} />
    </>}
  </>;
}
function FleetSpecEquipment({ spec }: { spec: ShipSpec }) {
  const mods = [...new Set([...(spec.builtInHullMods ?? []), ...(spec.hullMods ?? [])])];
  return <section className="refit-loadout-section">
    <h4>已装武器</h4><ul>{spec.weaponSlots.filter(slot => slot.defaultWeaponId).map(slot => <li key={slot.slotId}>{slot.slotId} · {weaponName(slot.defaultWeaponId!)}</li>)}</ul>
    <h4>船体插件</h4><ul>{mods.map(id => <li key={id}><RefitInspection title={id} content={<ModInformation id={id} />}><button className="refit-inspection-item" type="button">{data.hullmods[id]?.name ?? nativeRefit.hullmods?.[id]?.name ?? id}{spec.sMods?.includes(id) ? ' · S-mod' : ''}</button></RefitInspection></li>)}</ul>
    <h4>舰载机联队</h4><ul>{spec.fighterWings?.map((fit, index) => {
      const wing = Object.values(nativeRefit.wings ?? {}).find(item => item.specId === fit.specId && item.count === fit.count);
      return <li key={index}>{wing ? <RefitInspection title={wing.displayName ?? wing.name} content={<WingInformation wing={wing} />}><button className="refit-inspection-item" type="button">{wing.displayName ?? wing.name} ×{fit.count}</button></RefitInspection> : fit.specId + ' ×' + fit.count}</li>;
    })}</ul>
    {spec.modules?.map(mount => <section key={mount.slotId}><h4>模块 {mount.slotId}</h4><FleetSpecEquipment spec={mount.spec} /></section>)}
  </section>;
}
