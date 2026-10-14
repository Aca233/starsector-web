import selection from './content-selection.json';
import { contentRegistry } from '../content/ContentRegistry';
if (selection.schemaVersion !== 1 || !selection.hulls.includes(selection.sandbox.player) || !selection.sandbox.opponents.length || selection.sandbox.opponents.some(id=>!selection.hulls.includes(id))) throw new Error('Invalid sandbox content selection');
export const DEFAULT_PLAYER_HULL = selection.sandbox.player;
export const DEFAULT_ENEMY_HULL = selection.sandbox.opponents[0];
export function defaultPlayerHull(): string {
  if (contentRegistry.getShip(DEFAULT_PLAYER_HULL)) return DEFAULT_PLAYER_HULL;
  const hull = contentRegistry.getAllShips().find(ship => ship.hullSize !== 'FIGHTER' && !ship.isModuleHull);
  if (!hull) throw new Error('没有启用的舰船包，请先在游戏设置中启用或安装一个包。');
  return hull.id;
}
/** Scenario policy is content data, not part of the simulation. */
export function defaultOpponent(hullId: string): string {
  const candidates = selection.sandbox.opponents.filter(id => contentRegistry.getShip(id));
  const available = contentRegistry.getAllShips().filter(ship => ship.hullSize !== 'FIGHTER' && !ship.isModuleHull);
  const id = candidates.find(candidate => candidate !== hullId) ?? candidates[0]
    ?? available.find(ship => ship.id !== hullId)?.id ?? available[0]?.id;
  if (!id) throw new Error('Sandbox has no configured opponents');
  return id;
}
