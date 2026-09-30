import type { DeploymentView, DeploymentMemberView } from '../../engine/runtime/DeploymentView';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { budget, data, designFromModule, type Design } from '../../studio/DesignModel';
import type { ShipSpec } from '../../engine/content/ShipSpec';
export const fleetStatusLabels = { reserve: '待命', deployed: '已部署', retreating: '撤退中', retreated: '已撤离', destroyed: '已损失' };
export interface FleetDeploymentEntry extends DeploymentMemberView { name: string }
export interface FleetDeploymentHull { id: string; name: string; entries: FleetDeploymentEntry[] }
export function fleetDeploymentRoster(view: DeploymentView, team: number): FleetDeploymentHull[] {
  const hulls = new Map<string, FleetDeploymentHull>();
  for (const row of view.members) {
    if (row.teamId !== team) continue;
    const id = row.spec.sourceHullId ?? row.spec.id;
    let hull = hulls.get(id);
    if (!hull) { hull = { id, name: data.ships[id]?.name ?? i18n.t(row.spec.nameKey), entries: [] }; hulls.set(id, hull); }
    hull.entries.push({ ...row, name: i18n.t(row.spec.nameKey) + ' · #' + (hull.entries.length + 1) });
  }
  return [...hulls.values()];
}

/** Read the encounter's fitted spec, never a catalog preset or createDesign defaults. */
export function fleetInspectionDesign(spec: ShipSpec): Design {
  const hullId = spec.sourceHullId ?? spec.id;
  if (!data.ships[hullId]) throw Error('此舰体没有装配点资料');
  const draft = designFromModule({ ...spec, id: hullId });
  draft.name = i18n.t(spec.nameKey); draft.captainSkills = structuredClone(spec.captainSkills ?? {});
  if (draft.capacitors < 0 || draft.vents < 0) throw Error('不能从此舰体反推载荷投资');
  if ((spec.fighterWings ?? []).some((_, index) => !draft.wings?.[index])) throw Error('联队配装资料不完整');
  draft.modules = Object.fromEntries((spec.modules ?? []).map(mount => [mount.slotId, fleetInspectionDesign(mount.spec)]));
  budget(draft); // Validate availability before rendering the nested equipment reader.
  return draft;
}
export function fleetShipCondition(ship: Pick<DeploymentMemberView, 'maxHullHp' | 'hullHp' | 'currentCR'>) {
  return '结构 ' + Math.round(ship.maxHullHp > 0 ? ship.hullHp / ship.maxHullHp * 100 : 0) + '% · CR ' + Math.round(ship.currentCR * 100) + '%';
}
