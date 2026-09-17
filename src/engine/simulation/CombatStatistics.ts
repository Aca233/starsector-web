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


export interface BattleResult {
  isVictory: boolean;
  combatDuration: number;
  playerShipSpecId: string;
  enemyShipSpecId: string;
  playerHullDamageRatio: number;
  enemyHullDamageRatio: number;
  playerStats: FleetCombatStats;
  enemyStats: FleetCombatStats;
}
