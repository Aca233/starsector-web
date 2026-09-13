export interface FleetCombatStats {
  totalDamageDealt: number;
  kineticDamage: number;
  heDamage: number;
  energyDamage: number;
  fragDamage: number;
  shieldDamageAbsorbed: number;
  armorDamageSoaked: number;
  hullDamageDealt: number;
  hullDamageTaken: number;
  shotsFired: number;
  shotsHit: number;
  empDamageDealt: number;
  missilesIntercepted: number;
  fightersDestroyed: number;
  fightersLost: number;
  fightersRebuilt: number;
  overloadsInflicted: number;
  overloadsSuffered: number;
}

export type BattleRank = 'S' | 'A' | 'B' | 'C' | 'D';

export interface BattleResult {
  isVictory: boolean;
  combatDuration: number;
  rank: BattleRank;
  playerShipSpecId: string;
  enemyShipSpecId: string;
  playerStats: FleetCombatStats;
  enemyStats: FleetCombatStats;
}
