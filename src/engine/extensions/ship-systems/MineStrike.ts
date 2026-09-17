import { sameTeam } from "../../simulation/CombatTeams";
import { Vector2 } from '../../math/Vector2';
import type { ShipSystemDefinition } from './Types';
export const mineStrike: ShipSystemDefinition = {
  id: 'MINE_STRIKE',
  resources:{textures:['/game-assets/graphics/missiles/heavy_mine3.png','/game-assets/graphics/missiles/heavy_mine3_glow.png'],sounds:['mine_teleport','mine_ping','mine_windup_heavy','mine_explosion']}, sourceIds: ['mine_strike', 'minestrike'], name: '空雷突袭',
  chargeUp: .25, active: 0, chargeDown: .25, cooldown: 0,
  charges: 5, chargeRegen: .2, fluxPerUseFraction: .1,
  onActive: (ship, world, system) => {
    let target = (system.activationInput?.point ?? ship.aimTargetWorld).clone();
    if (ship.fireControlMode === 'AI') {
      const enemy = ship.currentTargetShip ?? world.ships.find(s => !s.isDead && !sameTeam(s, ship) && s.isVisibleTo(ship.teamId));
      if (!enemy) return;
      // Existing Web targeting policy, not native BasicShipAI.
      const angle = enemy.facingRad + Math.PI + (world.combatRandom.next() - .5);
      target = enemy.pos.clone().add(Vector2.fromAngle(angle, 220 + world.combatRandom.next() * 100));
    }
    world.deployMine(target, ship, 1000 * ship.hullStats.systemRangeMultiplier);
  },
  advanceAI: ({ship, target, distance, tactical}) => {
    if (target.isDead || target.isPhased || tactical?.withdrawing || tactical?.waypoint) return;
    if (ship.flux.totalFlux + ship.system.fluxCostPerUse > ship.flux.maxFlux * .95) return;
    if (ship.system.charges > 0 && !ship.system.isCoolingDown && distance < 1000 * ship.hullStats.systemRangeMultiplier + 200) ship.system.activate();
  }
};
