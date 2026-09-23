import type { CombatDisplayReads } from './CombatDisplayReads';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { TacticalOrder } from '../simulation/CombatTypes';
import { sameTeam } from '../simulation/CombatTeams';
import { Vector2 } from '../math/Vector2';
import type { CommandResult } from './CombatCommands';

/** Observer-local selection/map state only; no combat authority is required. */
export type TacticalViewCommandSource = Readonly<Pick<CombatDisplayReads,
  'isTacticalMap' | 'toggleTacticalMap' | 'capitalShips' | 'playerShip' | 'selectUnit'
>>;
/** Wire input, not a simulation order: no mutable Ship/Vector2 or display-clock timestamp. */
export interface TacticalOrderInput {
  type: TacticalOrder['type'];
  targetShipId?: string;
  position?: readonly [number, number];
}
export type TacticalCommand =
  | { action: 'close' }
  | { action: 'select'; unitId: string | null }
  | { action: 'target' | 'cancel-target'; targetId: string }
  | { action: 'cancel'; unitId: string }
  | { action: 'order'; unitId: string; order: TacticalOrderInput }
  | { action: 'escort'; unitIds: readonly string[]; targetId: string }
  | { action: 'retreat'; unitIds: readonly string[]; full: boolean };
const reject = (reason: string): CommandResult => ({ accepted: false, reason });
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 4096 && value.every(id) && new Set(value).size === value.length;
const point = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v));
const orderTypes = new Set<TacticalOrder['type']>(['WAYPOINT', 'ENGAGE', 'ASSAULT', 'DEFEND', 'ESCORT', 'AVOID']);
function validOrder(order: TacticalOrderInput): boolean {
  return !!order && orderTypes.has(order.type)
    && (order.targetShipId === undefined || id(order.targetShipId))
    && (order.position === undefined || point(order.position))
    && (!['WAYPOINT', 'DEFEND'].includes(order.type) || point(order.position))
    && (!['ENGAGE', 'AVOID', 'ESCORT'].includes(order.type) || id(order.targetShipId));
}
/** Explicit display-only subset for the LAN observer map. Never dispatches combat writes. */
export function applyTacticalViewCommand(engine: TacticalViewCommandSource, command: TacticalCommand): CommandResult {
  if (!command || typeof command !== 'object') return reject('无效的地图命令。');
  if (command.action === 'close') {
    if (engine.isTacticalMap) engine.toggleTacticalMap();
  } else if (command.action === 'select') {
    if (command.unitId !== null && command.unitId !== 'fleet' && (!id(command.unitId)
      || !engine.capitalShips.some(s => s.id === command.unitId && sameTeam(s, engine.playerShip) && !s.isDead && !s.isRetreated && !s.isDocked)))
      return reject('该友舰已离开战场。');
    engine.selectUnit(command.unitId);
  } else return reject('联机地图仅提供观察、增援和撤退；战术指令尚未接入主机。');
  return { accepted: true };
}
/** Executed behind the host's tick barrier; all rule mutations stay on the authority. */
export function applyTacticalCommand(engine: CombatEngine, command: TacticalCommand): CommandResult {
  if (!command || typeof command !== 'object') return reject('无效的战术命令。');
  if (command.action === 'close' || command.action === 'select') return applyTacticalViewCommand(engine, command);
  if (engine.battleResult) return reject('战斗已结束。');
  const available = (ship: CombatEngine['playerShip']) => !ship.isDead && !ship.isRetreated && !ship.isDocked && ship.hullHp > 0;
  const friendly = (unitId: string) => engine.capitalShips.some(s => s.id === unitId && sameTeam(s, engine.playerShip) && available(s));
  const validTarget = (input: TacticalOrderInput) => !input.targetShipId || engine.ships.some(s => s.id === input.targetShipId && available(s)
    && (input.type === 'ESCORT' ? sameTeam(s, engine.playerShip) : !sameTeam(s, engine.playerShip) && s.isVisibleTo(engine.playerShip.teamId)));
  const owns = (unitId: string) => unitId === 'fleet' || engine.capitalShips.some(s => s.id === unitId && sameTeam(s, engine.playerShip));
  const order = (input: TacticalOrderInput): TacticalOrder => ({
    id: engine.commandSystem.allocateOrderId(), type: input.type, targetShipId: input.targetShipId,
    targetPos: input.position ? new Vector2(input.position[0], input.position[1]) : undefined, issuedTime: engine.combatTime,
  });
  switch (command.action) {
    case 'target':
      return id(command.targetId) && engine.setPlayerTarget(command.targetId) ? { accepted: true } : reject('目标已离开己方视野。');
    case 'cancel':
      if (!id(command.unitId) || !owns(command.unitId)) return reject('不能取消其他舰队的指令。');
      if (!engine.orders.has(command.unitId) && engine.orders.has('fleet')) return reject('该舰正在执行全舰指令；按 A 选择全舰后取消。');
      engine.cancelOrder(command.unitId); break;
    case 'cancel-target':
      if (!id(command.targetId)) return reject('无效的目标。');
      for (const [unitId, assignment] of engine.orders) if (owns(unitId) && assignment.targetShipId === command.targetId) engine.cancelOrder(unitId);
      break;
    case 'order':
      if (!id(command.unitId) || !owns(command.unitId) || !validOrder(command.order)) return reject('无效的战术指令。');
      if (!(command.unitId === 'fleet' ? engine.capitalShips.some(s => sameTeam(s, engine.playerShip) && available(s)) : friendly(command.unitId)) || !validTarget(command.order)) return reject('该舰或目标已离开战场。');
      if (!engine.issueOrder(command.unitId, order(command.order))) return reject(engine.commandPoints <= 0 ? '指挥点不足。每 120 秒战斗时间恢复 1 点。' : '该舰或目标已离开战场。');
      break;
    case 'escort':
      if (!ids(command.unitIds) || !command.unitIds.length || !command.unitIds.every(owns) || !id(command.targetId)) return reject('无效的护航编组。');
      if (!command.unitIds.every(friendly) || !friendly(command.targetId)) return reject('护航舰或目标已离开战场。');
      if (!engine.issueEscortGroup([...command.unitIds], order({ type: 'ESCORT', targetShipId: command.targetId }))) return reject('护航指令未生效，请检查指挥点或舰船状态。');
      break;
    case 'retreat':
      if (!engine.deployment.enabled) return reject('本场没有后备舰队撤退规则。');
      if (!ids(command.unitIds) || typeof command.full !== 'boolean') return reject('无效的撤退命令。');
      try { engine.deployment.requestRetreat(command.unitIds, engine.playerShip.teamId, command.full); }
      catch (error) { return reject(error instanceof Error ? error.message : String(error)); }
      break;
    default: return reject('未知的战术命令。');
  }
  return { accepted: true };
}
