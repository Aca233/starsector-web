/** Trusted cold compiler. Source constructors run once and are discarded before
 * the native authority accepts any hot tick or player command. */
import { LocalCombatKernel } from '../local/LocalCombatKernel';
import type { LocalCombatConfig } from '../local/LocalCombatContracts';
import type { Ship } from '../../simulation/Ship';
import type { CapitalShipAI } from '../../ai/CapitalShipAI';
import { deploymentCost } from '../../simulation/CombatDeployment';
import { captureCombatAudio } from '../../audio/CombatAudioEvents';
import type { CombatAudioEvent } from '../../audio/CombatAudioEvents';
import { compileRustContent, type RustCompiledContent } from './RustContentCompiler';
import type { RustSceneAdmission } from './RustSceneProtocol';
import type { RadioMessage } from '../../simulation/CombatTypes';
import type { RustBodyHandle } from './RustCoreProtocol';
import { manualWeaponShip } from '../ModuleFireControl';
export interface RustCombatStartup {
  readonly content: RustCompiledContent; readonly scene: RustSceneAdmission;
  readonly playerId: number; readonly enemyId: number; readonly radio: RadioMessage;
  readonly audio: readonly CombatAudioEvent[];
  readonly members: readonly { readonly memberId: string; readonly handle: RustBodyHandle }[];
}
export function compileRustCombatStartup(config: LocalCombatConfig): RustCombatStartup {
  const audio: CombatAudioEvent[] = [], releaseAudio = captureCombatAudio(event => audio.push(structuredClone(event)));
  let source: LocalCombatKernel | undefined;
  try {
    source = new LocalCombatKernel({ ...config, backend: 'typescript', multicore: false });
    const engine = source.engine, roots = [engine.playerShip, engine.enemyShip, ...engine.reinforcements];
    const handoff = (source as unknown as { handoff?: { bindings: Map<string, Ship> } }).handoff;
    const memberByShip = new Map([...(handoff?.bindings ?? [])].map(([id, ship]) => [ship, id]));
    const aiTargets = new Map<Ship, Ship | null>([[engine.playerShip, source.playerAI.targetShip], [engine.enemyShip, engine.enemyAI.targetShip]]);
    const reinforcement = (engine as unknown as { reinforcementAI: Map<string, CapitalShipAI> }).reinforcementAI;
    for (const ai of reinforcement.values()) aiTargets.set(ai.ship, ai.targetShip);
    const content = compileRustContent({ seed: config.encounter?.seed ?? config.seed,
      ships: roots.map(ship => ({ stableId: ship.id, spec: ship.spec, team: ship.teamId, player: ship.isPlayer,
        position: [ship.pos.x, ship.pos.y], facing: ship.facingRad, velocity: [ship.vel.x, ship.vel.y], shipName: ship.shipName,
        persistentMemberId: memberByShip.get(ship), transient: engine.isTransientCombatShip(ship),
        deployment: engine.deployment.isReserve(ship.id) ? 'reserve' : 'deployed', fireControlMode: ship.fireControlMode })),
    }, { roots, flight: engine.fighterSystem, random: engine.random, visual: engine.visualRandom,
      active: new Set(engine.ships), aiTargets });
    const identity = (ship: Ship) => { const item = content.entities.find(e => e.stableId === ship.id); if (!item) throw Error('Missing cold startup identity'); return item; };
    const player = identity(engine.playerShip), enemy = identity(engine.enemyShip);
    const deployment = engine.deployment as unknown as { automaticTeams: Set<number> };
    const scene: RustSceneAdmission = {
      enemy: enemy.handle, enabled: engine.deployment.enabled, limit: engine.deployment.limit,
      simulation: engine.isSimulation, simulationLimit: engine.simulationPointLimit,
      primaryEnemyDeployed: engine.allCapitalShips.includes(engine.enemyShip), multiTeam: engine.multiTeamBattle, open: engine.openBattlefield,
      autopilot: engine.playerShip.fireControlMode === 'AI', map:engine.isTacticalMap, commandRate: engine.playerShip.hullStats.commandPointRateFlat,
      manualWeapon: identity(manualWeaponShip(engine.playerShip, engine.ships)).handle, aiProfile: engine.aiDecisionProfile, multirate: engine.usesMultirateCombat,
      roots: roots.map(ship => ({ handle: identity(ship).handle, cost: deploymentCost(ship.spec), pending: engine.deployment.isReserve(ship.id),
        station: ship.isStation, radius: ship.deploymentRadius })), automaticTeams: [...deployment.automaticTeams],
      externallyControlled: roots.filter(ship => engine.externallyControlledShipIds.has(ship.id)).map(ship => identity(ship).handle),
      fullRate: roots.flatMap(ship => ship.assemblyShips.filter(part => engine.fullRateAIShipIds.has(part.id))).map(ship => identity(ship).handle),
    };
    if (engine.radioMessages.length !== 1) throw Error('Unsupported cold startup radio sequence');
    return { content, scene, playerId: player.id, enemyId: enemy.id, radio: structuredClone(engine.radioMessages[0]), audio: structuredClone(audio),
      members: [...memberByShip].map(([ship, memberId]) => ({ memberId, handle: identity(ship).handle })) };
  } finally { source?.dispose(); releaseAudio(); }
}
