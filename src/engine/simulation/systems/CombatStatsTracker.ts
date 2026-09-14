import { DamageType } from '../ArmorGrid';
import { FleetCombatStats, BattleResult, BattleRank } from '../CombatStatistics';

/**
 * 全息战斗数据统计与战果裁决器 (CombatStatsTracker)
 */
export class CombatStatsTracker {
  public playerStats: FleetCombatStats = this.createEmptyStats();
  public enemyStats: FleetCombatStats = this.createEmptyStats();

  private createEmptyStats(): FleetCombatStats {
    return {
      totalDamageDealt: 0,
      kineticDamage: 0,
      heDamage: 0,
      energyDamage: 0,
      fragDamage: 0,
      shieldDamageAbsorbed: 0,
      armorDamageSoaked: 0,
      hullDamageDealt: 0,
      hullDamageTaken: 0,
      shotsFired: 0,
      shotsHit: 0,
      empDamageDealt: 0,
      missilesIntercepted: 0,
      fightersDestroyed: 0,
      fightersLost: 0,
      fightersRebuilt: 0,
      overloadsInflicted: 0,
      overloadsSuffered: 0
    };
  }

  public reset() {
    this.playerStats = this.createEmptyStats();
    this.enemyStats = this.createEmptyStats();
  }

  public recordShotFired(isPlayer: boolean) {
    if (isPlayer) this.playerStats.shotsFired++;
    else this.enemyStats.shotsFired++;
  }

  /** A firing cycle/projectile counts as a hit once, regardless of damage ticks or split armor/hull accounting. */
  public recordShotHit(isPlayerAttacker: boolean) {
    if (isPlayerAttacker) this.playerStats.shotsHit++;
    else this.enemyStats.shotsHit++;
  }

  public recordDamageDealt(
    isPlayerAttacker: boolean,
    type: DamageType,
    amount: number,
    targetArea: 'SHIELD' | 'ARMOR' | 'HULL',
    empAmount = 0
  ) {
    const attacker = isPlayerAttacker ? this.playerStats : this.enemyStats;
    const defender = isPlayerAttacker ? this.enemyStats : this.playerStats;

    attacker.totalDamageDealt += amount;
    if (empAmount > 0) attacker.empDamageDealt += empAmount;

    switch (type) {
      case 'KINETIC': attacker.kineticDamage += amount; break;
      case 'HIGH_EXPLOSIVE': attacker.heDamage += amount; break;
      case 'ENERGY': attacker.energyDamage += amount; break;
      case 'FRAGMENTATION': attacker.fragDamage += amount; break;
    }

    if (targetArea === 'SHIELD') {
      defender.shieldDamageAbsorbed += amount;
    } else if (targetArea === 'ARMOR') {
      defender.armorDamageSoaked += amount;
    } else if (targetArea === 'HULL') {
      attacker.hullDamageDealt += amount;
      defender.hullDamageTaken += amount;
    }
  }

  public recordMissileIntercepted(isPlayerInterceptor: boolean) {
    if (isPlayerInterceptor) this.playerStats.missilesIntercepted++;
    else this.enemyStats.missilesIntercepted++;
  }

  public recordFighterKill(isPlayerKiller: boolean) {
    if (isPlayerKiller) {
      this.playerStats.fightersDestroyed++;
      this.enemyStats.fightersLost++;
    } else {
      this.enemyStats.fightersDestroyed++;
      this.playerStats.fightersLost++;
    }
  }

  public recordFighterRebuilt(isPlayer: boolean) {
    if (isPlayer) this.playerStats.fightersRebuilt++;
    else this.enemyStats.fightersRebuilt++;
  }

  public recordOverload(isPlayerInflicter: boolean) {
    if (isPlayerInflicter) {
      this.playerStats.overloadsInflicted++;
      this.enemyStats.overloadsSuffered++;
    } else {
      this.enemyStats.overloadsInflicted++;
      this.playerStats.overloadsSuffered++;
    }
  }

  public finalizeBattle(
    isVictory: boolean,
    combatDuration: number,
    playerSpecId: string,
    enemySpecId: string,
    playerHullRatio: number
  ): BattleResult {
    let rank: BattleRank = 'D';
    if (isVictory) {
      if (playerHullRatio >= 0.8 && combatDuration <= 60 && this.playerStats.overloadsSuffered === 0) {
        rank = 'S';
      } else if (playerHullRatio >= 0.5) {
        rank = 'A';
      } else if (playerHullRatio >= 0.25) {
        rank = 'B';
      } else {
        rank = 'C';
      }
    } else {
      rank = 'D';
    }

    return {
      isVictory,
      combatDuration,
      rank,
      playerShipSpecId: playerSpecId,
      enemyShipSpecId: enemySpecId,
      playerStats: { ...this.playerStats },
      enemyStats: { ...this.enemyStats }
    };
  }
}
