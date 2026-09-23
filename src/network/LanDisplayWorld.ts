import { findCombatHostile } from '../engine/runtime/CombatHostileQuery';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import { LanDisplayShip as Ship } from './display/LanDisplayShip';
import type { RenderHulk } from '../engine/render/ShipRenderState';
import { ContrailEngine } from '../engine/simulation/ContrailEngine';
import type { DeploymentState } from '../engine/simulation/CombatDeployment';
import { combatRenderView, type CombatRenderView } from '../engine/render/CombatRenderView';
import { sound } from '../engine/audio/SoundManager';
import { Vector2 } from '../engine/math/Vector2';
import { LanDisplayDeployment } from './LanDisplayDeployment';

/** Mutable receive/prediction world. Not a CombatEngine and not a replay checkpoint.
 * Initialized by authority-provided identities and display records only. No
 * simulation constructors, authority owners, AI, collision/weapon/fighter scheduler. */
export class LanDisplayWorld {
  readonly kind = 'lan-display-world';
  playerShip: Ship;
  enemyShip: Ship;
  readonly reinforcements: Ship[];
  readonly fighters: Ship[];
  readonly bombers: Ship[];
  readonly playerWings: CombatEngine['playerWings'];
  readonly enemyWings: CombatEngine['enemyWings'];
  readonly deployment: LanDisplayDeployment;
  readonly fxSystem: Pick<CombatEngine['fxSystem'],'particles'|'contrails'|'explosions'|'hitGlows'|'movingRayFades'|'empArcs'|'muzzleFlashes'|'muzzleParticles'|'floatingTexts'|'debris'|'shieldRipples'> & {hulkFragments:RenderHulk[]};
  readonly asteroidSystem: {asteroids:CombatEngine['asteroids']};
  readonly nebulaSystem: {nebulae:CombatEngine['nebulae']};
  readonly mineSystem: {mines:CombatEngine['mines']};
  readonly droneSystem: {drones:Ship[]};
  readonly contrailEngine: ContrailEngine;
  environment: CombatEngine['environment'];
  projectiles: CombatEngine['projectiles'];
  beams: CombatEngine['beams'];
  combatTime: number;
  cameraShakeIntensity: number;
  battleResult: CombatEngine['battleResult'];
  shipLossNotifications: CombatEngine['shipLossNotifications'];
  multiTeamBattle: boolean;
  openBattlefield: boolean;
  readonly isSimulation = false;
  simulationPointLimit: number;
  isTacticalMap: boolean;
  selectedUnitId: string | null;
  commandPoints: number;
  orders: CombatEngine['orders'];
  private selectionSerial = 0;

  constructor(readonly seat:number, ships:Ship[], controlled:ReadonlyMap<number,string>, deployment:DeploymentState) {
    const player=ships.find(ship=>ship.id===controlled.get(seat));
    if(!player)throw Error('Missing authority control seat');
    const enemy=ships.find(ship=>ship.teamId!==player.teamId);
    if(!enemy)throw Error('Missing opposing display fleet');
    this.playerShip=player;this.enemyShip=enemy;
    this.reinforcements=ships.filter(ship=>ship!==player&&ship!==enemy);
    this.fighters=[];this.bombers=[];this.playerWings=[];this.enemyWings=[];
    this.deployment=new LanDisplayDeployment(deployment,ships);
    this.fxSystem={particles:[],contrails:[],explosions:[],hitGlows:[],movingRayFades:[],empArcs:[],muzzleFlashes:[],muzzleParticles:[],floatingTexts:[],debris:[],shieldRipples:[],hulkFragments:[]};
    this.asteroidSystem={asteroids:[]};this.nebulaSystem={nebulae:[]};this.mineSystem={mines:[]};this.droneSystem={drones:[]};
    this.contrailEngine=new ContrailEngine();this.environment={backgroundUrl:"",starCount:0};this.projectiles=[];this.beams=[];
    this.combatTime=0;this.cameraShakeIntensity=0;this.battleResult=null;this.shipLossNotifications=[];
    this.simulationPointLimit=240;this.multiTeamBattle=true;this.openBattlefield=true;
    this.isTacticalMap=false;this.selectedUnitId=null;this.commandPoints=0;this.orders=new Map();
  }

  get allCapitalShips(): Ship[] { return [this.playerShip, this.enemyShip, ...this.reinforcements]; }
  get capitalShips(): Ship[] { return this.allCapitalShips.filter(ship => !this.deployment.isReserve(ship.id) && !ship.isRetreated); }
  get combatShips(): Ship[] { return this.capitalShips.flatMap(ship => ship.assemblyShips); }
  get ships(): Ship[] { return [...this.combatShips, ...this.fighters, ...this.bombers, ...this.droneSystem.drones].filter(ship => !ship.isRetreated); }
  findHostile(ship:Ship,targetId?:string,roster:readonly Ship[]=this.ships):Ship|undefined {
    return findCombatHostile(ship,targetId,roster);
  }

  get particles() { return this.fxSystem.particles; }
  get contrails() { return this.fxSystem.contrails; }
  get explosions() { return this.fxSystem.explosions; }
  get hitGlows() { return this.fxSystem.hitGlows; }
  get empArcs() { return this.fxSystem.empArcs; }
  get muzzleFlashes() { return this.fxSystem.muzzleFlashes; }
  get muzzleParticles() { return this.fxSystem.muzzleParticles; }
  get floatingTexts() { return this.fxSystem.floatingTexts; }
  get debris() { return this.fxSystem.debris; }
  get shieldRipples() { return this.fxSystem.shieldRipples; }
  get hulkFragments() { return this.fxSystem.hulkFragments; }
  get mines() { return this.mineSystem.mines; }
  get asteroids() { return this.asteroidSystem.asteroids; }
  get nebulae() { return this.nebulaSystem.nebulae; }
  get notificationTime(): number { return this.combatTime; }
  get isBattleResultReady(): boolean { return this.battleResult !== null && !this.explosions.some(explosion => explosion.visualKind === 'ship'); }
  simulationDeployedPoints(_isPlayer: boolean): number { return 0; } // LAN is never a local simulator.

  toggleTacticalMap(): void {
    this.isTacticalMap = !this.isTacticalMap;
    sound.play(this.isTacticalMap ? 'map_open' : 'map_close', .85);
  }
  selectUnit(unitId: string | null): void {
    if (this.selectedUnitId === unitId) return;
    this.selectedUnitId = unitId;
    if (unitId === null) { sound.play('command_deselect', .7); return; }
    sound.play('map_open', .8);
    const text = unitId === this.playerShip.id ? 'FLAGSHIP SELECTED' : unitId.includes('ftr') ? 'BROADSWORD WING SELECTED'
      : unitId.includes('bmr') ? 'DAGGER FLIGHT SELECTED' : 'UNIT SELECTED';
    this.floatingTexts.push({ id: --this.selectionSerial, pos: this.playerShip.pos.clone(), vel: new Vector2(0, -25), text, color: [80, 220, 255], size: 15, life: 1.5, maxLife: 1.5 });
  }

  /** Records already implement the shared renderer boundary. No projection of
   * simulation objects, compatibility fallback, or constructor is needed here. */
  renderView():CombatRenderView {return combatRenderView(this);}
}
