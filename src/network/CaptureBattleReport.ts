import type { CombatEngine } from '../engine/simulation/CombatEngine';
import type { Ship } from '../engine/simulation/Ship';
import type { BattleReport } from './battle-report.mjs';
/** Called once by the authoritative worker, independently of droppable rendering snapshots. */
export function captureBattleReport(engine:CombatEngine, controlled:ReadonlyMap<number,Ship>, tick:number):BattleReport {
  const seats = new Map([...controlled].map(([seat,ship]) => [ship.id,seat]));
  const deployment = new Map(engine.deployment.snapshot().rows.map(row => [row.id,row]));
  return {tick, seconds:engine.combatTime, ships:engine.allCapitalShips.map(ship => {
    const row = deployment.get(ship.id);
    if (!row) throw Error('结算舰船不在部署名册中');
    return {id:ship.id, team:ship.teamId, seat:seats.get(ship.id) ?? null, name:ship.shipName.slice(0,120), cost:row.cost, status:row.status,
      hull:row.status === 'destroyed' ? 0 : Math.min(ship.maxHullHp,Math.max(0,ship.hullHp)), hullMax:ship.maxHullHp, cr:ship.currentCR};
  })};
}
