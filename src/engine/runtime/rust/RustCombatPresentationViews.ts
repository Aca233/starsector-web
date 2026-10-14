import { assemblyParts } from '../../content/ModuleGeometry';
import type { HullSpritePart, HullPortraitPart } from '../HullPortraitView';
import type { DeploymentView } from '../DeploymentView';
import type { MapContact, MapFlagship, TacticalMapSnapshot } from '../TacticalMapView';
import type { CombatRenderView } from '../../render/CombatRenderView';
import type { RustPresentationFacts } from './RustCombatPresentationFacts';
import type { RustPresentationShipRecords } from './RustCombatPresentationShip';
type Records = RustPresentationShipRecords;
const point = (p: { readonly x: number; readonly y: number }) => ({ x: p.x, y: p.y });
export function rustHullSprites(root: Records, byId: ReadonlyMap<string, Records>): HullSpritePart[] {
  const r = root.render, c = Math.cos(r.facingRad), s = Math.sin(r.facingRad);
  return assemblyParts(r.spec).flatMap(part => {
    const id = r.id + part.key.split('/').slice(1).map(index => ':module:' + index).join('');
    const ship = part.key === 'root' ? r : byId.get(id)?.render;
    if (!ship || ship.isRetreated || ship.isDocked) return [];
    const spec = ship.spec, dx = ship.pos.x - r.pos.x, dy = ship.pos.y - r.pos.y;
    return [{ id, spec: { spriteUrl: spec.spriteUrl, spriteWidth: spec.spriteWidth, spriteHeight: spec.spriteHeight, pivotX: spec.pivotX, pivotY: spec.pivotY },
      x: ship.isDead ? part.x : dx * c + dy * s, y: ship.isDead ? part.y : -dx * s + dy * c,
      angle: ship.isDead ? part.angle : ship.facingRad - r.facingRad, isDead: ship.isDead }];
  });
}
export function rustHullPortrait(root: Records, byId: ReadonlyMap<string, Records>): HullPortraitPart[] {
  return rustHullSprites(root, byId).map(part => {
    const record = part.id === root.render.id ? root : byId.get(part.id)!;
    const ship = record.render;
    return { ...part, bounds: ship.spec.bounds, canControlWeapons: ship.weapons.length > 0, hullHp: ship.hullHp, maxHullHp: ship.maxHullHp,
      armor: record.hud.armor, damageVersion: ship.scorchMarkVersion,
      decals: ship.scorchMarks.map(mark => ({ url: `/game-assets/graphics/damage/damage_${mark.kind}48_${mark.variant}_base.png`,
        x: mark.localPos.x, y: mark.localPos.y, size: mark.size, rotation: mark.rotationRad, opacity: mark.opacity })) };
  });
}
export function rustDeployment(facts: RustPresentationFacts, records: ReadonlyMap<string, Records>, player: Records, generation: number): DeploymentView {
  const d = facts.deployment, usage: Record<string, number> = {};
  for (const row of d.rows) if (row.status === 'deployed' || row.status === 'retreating') usage[row.teamId] = (usage[row.teamId] ?? 0) + row.cost;
  const all = new Set(facts.rosters.allCapitalShips);
  return { generation, playerShipId: player.render.id, playerTeam: player.render.teamId, available: d.available, battleEnded: !!facts.battleResult,
    fleetEnabled: d.enabled, fleetLimit: d.limit, fleetUsage: usage,
    members: d.rows.flatMap(row => { const ship = all.has(row.id) ? records.get(row.id)?.hud : undefined;
      return ship ? [{ ...row, spec: ship.spec, hullHp: ship.hullHp, maxHullHp: ship.maxHullHp, currentCR: ship.currentCR }] : []; }),
    simulation: d.simulation, simulationLimit: d.simulationLimit, allyUsed: d.simulation ? d.allyUsed : 0, enemyUsed: d.simulation ? d.enemyUsed : 0 };
}
function contact(record: Records, byId: ReadonlyMap<string, Records>): MapContact {
  const ship = record.render, spec = ship.spec;
  return { hullSprites: rustHullSprites(record, byId), id: ship.id, teamId: ship.teamId, pos: point(ship.pos), facingRad: ship.facingRad,
    hullHp: ship.hullHp, maxHullHp: ship.maxHullHp, retreating: record.hud.retreating, flux: { fluxPercent: ship.flux.fluxPercent },
    spec: { nameKey: spec.nameKey, designationKey: spec.designationKey, spriteUrl: spec.spriteUrl, spriteWidth: spec.spriteWidth,
      spriteHeight: spec.spriteHeight, pivotX: spec.pivotX, pivotY: spec.pivotY, hullSize: spec.hullSize } };
}
export function rustTacticalMap(facts: RustPresentationFacts, records: ReadonlyMap<string, Records>, player: Records,
  view: CombatRenderView, deployment: DeploymentView, generation: number): TacticalMapSnapshot {
  const envelope = { generation, available: facts.tactical.available };
  if (!facts.tactical.available || !facts.tactical.isTacticalMap) return { ...envelope, map: null };
  const resolve = (id: string) => { const r = records.get(id); if (!r) throw Error('Unknown Rust map contact ' + id); return r; };
  const visible = (r: Records) => !r.render.isDead && !r.render.isRetreated && !r.render.isDocked;
  const ships = facts.rosters.ships.map(resolve), living = facts.rosters.capitalShips.map(resolve).filter(visible), team = player.render.teamId;
  const visibleById = new Map(ships.filter(visible).map(r => [r.render.id, r]));
  const wings = new Set<string>(), observers = ships.filter(r => {
    if (r.render.teamId !== team || !visible(r) || r.fact.isSystemDrone) return false;
    if (r.render.spec.hullSize !== 'FIGHTER' || !r.fact.flightDeckWingId) return true;
    if (wings.has(r.fact.flightDeckWingId)) return false; wings.add(r.fact.flightDeckWingId); return true;
  });
  const orders = Object.fromEntries([...facts.tactical.orders].map(([id, order]) => [id, { id: order.id, type: order.type,
    issuedTime: order.issuedTime, targetShipId: order.targetShipId, targetPos: order.targetPos ? point(order.targetPos) : undefined }]));
  const targetPositions: Record<string, { x: number; y: number }> = {};
  for (const order of facts.tactical.orders.values()) if (order.targetShipId && ['ENGAGE', 'ESCORT', 'AVOID'].includes(order.type)) {
    const target = records.get(order.targetShipId);
    if (target && visible(target)) Object.defineProperty(targetPositions, target.render.id, { value: point(target.render.pos), enumerable: true });
  }
  const hud = player.hud, armor = hud.armor;
  const playerShip: MapFlagship = { ...contact(player, records), currentCR: hud.currentCR, hullPortrait: rustHullPortrait(player, records),
    flux: { fluxPercent: hud.flux.fluxPercent, hardFlux: hud.flux.hardFlux, maxFlux: hud.flux.maxFlux, totalFlux: hud.flux.totalFlux },
    armor: { cols: armor.cols, rows: armor.rows, cellWidth: armor.cellWidth, cellHeight: armor.cellHeight,
      minX: armor.minX, minY: armor.minY, maxCellArmor: armor.maxCellArmor, cells: Array.from(armor.cells) } };
  return { ...envelope, map: { playerShip, capitalShips: living.map(r => contact(r, visibleById)),
    fighters: [...facts.rosters.fighters, ...facts.rosters.bombers].map(resolve).filter(visible)
      .map(r => ({ id: r.render.id, teamId: r.render.teamId, pos: point(r.render.pos), facingRad: r.render.facingRad })),
    observers: observers.map(r => ({ pos: point(r.render.pos), sightRadius: r.fact.sightRadius })), orders, targetPositions,
    selectedUnitId: facts.tactical.selectedUnitId, commandPoints: facts.tactical.commandPoints, battleEnded: !!facts.battleResult,
    openBattlefield: facts.openBattlefield, multiTeamBattle: facts.multiTeamBattle, isSimulation: deployment.simulation, deploymentEnabled: deployment.fleetEnabled,
    deployedCount: deployment.simulation ? deployment.allyUsed : deployment.fleetEnabled ? deployment.fleetUsage[team] ?? 0 : living.filter(r => r.render.teamId === team).length,
    environment: { backgroundUrl: view.environment.backgroundUrl }, nebulae: view.nebulae.map(n => ({ pos: point(n.pos), spriteUrl: n.spriteUrl,
      thickness: n.thickness, atlasColumn: n.atlasColumn, atlasRow: n.atlasRow })), asteroids: view.asteroids.map(a => ({ pos: point(a.pos), radius: a.radius })),
    hulkFragments: view.hulkFragments.map(h => ({ pos: point(h.pos) })) } };
}
