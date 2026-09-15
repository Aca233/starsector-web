import { Ship } from '../../Ship';
import { Projectile } from '../../Weapon';
import { CombatFXSystem } from '../CombatFXSystem';
import { HulkFragment } from '../../CombatTypes';
import { ContrailEngine } from '../../ContrailEngine';
import { SimulationRandom } from '../../SimulationRandom';
import { AsteroidProjectileImpact } from '../AsteroidSystem';

/**
 * 武器仿真系统共享环境上下文 (WeaponSimContext)
 */
export interface WeaponSimContext {
  playerShip: Ship;
  enemyShip: Ship;
  fighters: Ship[];
  hulkFragments: HulkFragment[];
  fx: CombatFXSystem;
  statsTracker?: any;
  contrailEngine?: ContrailEngine;
  random: SimulationRandom;
  visualRandom: SimulationRandom;
  addRadioMessage: (sender: string, faction: 'PLAYER' | 'ENEMY' | 'HQ', text: string, color?: [number, number, number]) => void;
  addCameraShake: (intensity: number, duration: number) => void;
  handleShipDestruction: (ship: Ship) => void;
  /**
   * 小行星扫掠查询：返回本帧沿 prevPos→pos 最先接触的小行星交点 (含归一化 t)。
   * updateProjectiles() 会把它与舰船交点比较，只结算更早的那个，因此弹丸既不
   * 会穿过前方小行星击中后方舰船，也不会穿过前方舰船击中后方小行星。
   */
  queryAsteroidImpact?: (p: Projectile) => AsteroidProjectileImpact | null;
  commitAsteroidImpact?: (p: Projectile, impact: AsteroidProjectileImpact) => void;
}
