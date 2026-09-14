import { Ship } from '../../Ship';
import { CombatFXSystem } from '../CombatFXSystem';
import { HulkFragment } from '../../CombatTypes';
import { ContrailEngine } from '../../ContrailEngine';
import { SimulationRandom } from '../../SimulationRandom';

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
}
