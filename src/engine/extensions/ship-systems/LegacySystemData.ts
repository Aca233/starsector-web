import type { NativeVariant } from '../../content/NativeVariantSpec';
import type { LauncherSmokeSpec, ProjectileExplosionSpec } from '../../simulation/Weapon';
/** Reader contracts survive catalog removal. Empty data never becomes 'never', nor registers content. */
export interface DroneLauncherData {
  variant: NativeVariant;
  row: Record<string, string>;
  spec: {
    maxDrones: number; launchDelay: number; launchSpeed: number; allowFreeRoam: boolean;
    droneBehavior: { droneIndex: number[]; initialOrbitAngle: number; orbitRadius: number; orbitDir: number; orbitSpeed: number;
      defaultFacing: string; faceEnemy: boolean; freeRoamRange: number; holdRoamRange: number; targetPriority: string[] }[];
  };
}
interface LauncherWeapon { id: string; fireSoundTwo: string; smokeSpec: LauncherSmokeSpec }
export interface FlareSystemData {
  weapon: LauncherWeapon; row: Record<string, string>; engineStyle: { engineColor: [number, number, number, number] };
  projectile: {
    engineSlots: { loc: number[]; width: number; length: number }[]; missileType: string; sprite: string;
    behaviorSpec: { effectRange: number; effectChance: number }; collisionRadius: number; explosionColor: [number, number, number, number];
    flameoutTime: number; noEngineGlowTime: number; fadeTime: number; engineSpec: { acc: number; dec: number; turnRate: number; turnAcc: number };
    size: [number, number]; explosionRadius: number;
  };
}
export interface SystemWeaponData {
  weapon: LauncherWeapon; row: Record<string, string>;
  projectile: {
    sprite: string; size: [number, number]; collisionRadius: number; fizzleOnReachingWeaponRange: boolean;
    explosionRadius: number; explosionColor: [number, number, number, number]; explosionSpec: ProjectileExplosionSpec;
    behaviorSpec: { range: number; explosionSpec: ProjectileExplosionSpec & { sound: string } };
  };
}
