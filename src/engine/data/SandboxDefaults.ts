import selection from './content-selection.json';
if (selection.schemaVersion !== 1 || !selection.hulls.includes(selection.sandbox.player) || !selection.sandbox.opponents.length || selection.sandbox.opponents.some(id=>!selection.hulls.includes(id))) throw new Error('Invalid sandbox content selection');
export const DEFAULT_PLAYER_HULL = selection.sandbox.player;
export const DEFAULT_ENEMY_HULL = selection.sandbox.opponents[0];
/** Scenario policy is content data, not part of the simulation. */
export function defaultOpponent(hullId: string): string {
  const id = selection.sandbox.opponents.find(candidate => candidate !== hullId) ?? selection.sandbox.opponents[0];
  if (!id) throw new Error('Sandbox has no configured opponents');
  return id;
}
