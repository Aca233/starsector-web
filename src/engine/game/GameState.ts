import type { ShipSpec } from '../content/ShipSpec';
import type { CombatSkillLoadout } from '../extensions/CombatSkills';
import { decodeCombatOutcome, decodeCombatRequest, decodeFleetMember } from './GameStateCodec';

/** Serializable game-domain contracts. No React, renderer, Ship, or browser objects. */
export interface FleetMember {
  id: string;
  hullId: string;
  status: 'ready' | 'destroyed';
  hullFraction: number;
  combatReadiness: number;
  armor: { cols: number; rows: number; fractions: number[] } | null;
  /** Omitted only in legacy saves: inherit the authored hull loadout. */
  hullMods?: string[];
  captainSkills?: CombatSkillLoadout;
  fighterWings?: ShipSpec['fighterWings'];
  weaponGroups?: ShipSpec['defaultWeaponGroups'];
  weapons: { slotId: string; weaponId: string; ammo: number | null }[];
}

export interface CombatRequest {
  id: string;
  kind: 'sandbox' | 'fleet';
  seed: number;
  playerFleet: FleetMember[];
  enemyFleet: FleetMember[];
}

export interface CombatOutcome {
  encounterId: string;
  kind: CombatRequest['kind'];
  victory: boolean;
  duration: number;
  playerFleet: FleetMember[];
  enemyFleet: FleetMember[];
}

export interface GameState {
  schemaVersion: 1;
  gameId: string;
  revision: number;
  nextEncounter: number;
  fleet: FleetMember[];
  inventory: { credits: number; supplies: number; fuel: number; cargo: Record<string, number> };
  sandboxHullId: string;
  pendingCombat: CombatRequest | null;
  /** Bounded history, not the idempotency mechanism: only the pending ID can settle. */
  outcomes: CombatOutcome[];
}

export function createGameState(gameId: string, flagship: FleetMember): GameState {
  return {
    schemaVersion: 1, gameId, revision: 0, nextEncounter: 1,
    fleet: [structuredClone(flagship)],
    inventory: { credits: 0, supplies: 0, fuel: 0, cargo: {} },
    sandboxHullId: flagship.hullId, pendingCombat: null, outcomes: []
  };
}

export function beginCombat(state: GameState, request: CombatRequest): GameState {
  request = decodeCombatRequest(request);
  if (state.pendingCombat?.kind === 'fleet') throw new Error('舰队仍在出击，不能用另一场战斗覆盖。');
  if (request.id !== `${state.gameId}:${state.nextEncounter}`) throw new Error('出击编号已过期。');
  if (request.kind === 'fleet') {
    for (const member of request.playerFleet) {
      const owned = state.fleet.find(ship => ship.id === member.id);
      if (!owned || owned.status !== 'ready' || JSON.stringify(decodeFleetMember(owned)) !== JSON.stringify(decodeFleetMember(member))) {
        throw new Error('出击舰船不属于当前舰队，或战前状态已过期。');
      }
    }
  }
  return {
    ...state, revision: state.revision + 1, nextEncounter: state.nextEncounter + 1,
    sandboxHullId: request.kind === 'sandbox' ? request.playerFleet[0].hullId : state.sandboxHullId,
    pendingCombat: structuredClone(request)
  };
}

/** Pure, once-only writeback. Combat never receives a reference to the persistent fleet. */
export function settleCombat(state: GameState, outcome: CombatOutcome): GameState {
  const pending = state.pendingCombat;
  if (!pending || pending.id !== outcome.encounterId) return state;
  outcome = decodeCombatOutcome(outcome);
  if (pending.kind !== outcome.kind) throw new Error('战后结算模式不匹配。');
  for (const side of ['playerFleet', 'enemyFleet'] as const) {
    if (pending[side].length !== outcome[side].length) throw new Error('战后参战名单不完整。');
    for (const before of pending[side]) {
      const after = outcome[side].find(ship => ship.id === before.id);
      if (!after || before.hullId !== after.hullId
        || JSON.stringify(before.weapons.map(w => [w.slotId, w.weaponId])) !== JSON.stringify(after.weapons.map(w => [w.slotId, w.weaponId]))) {
        throw new Error('战后舰船身份或装备不匹配。');
      }
    }
  }
  const settled = structuredClone(outcome);
  return {
    ...state, revision: state.revision + 1, pendingCombat: null,
    fleet: outcome.kind === 'fleet'
      ? state.fleet.map(ship => settled.playerFleet.find(result => result.id === ship.id) ?? ship)
      : state.fleet,
    outcomes: [...state.outcomes.slice(-19), settled]
  };
}

export function freezeGameState(state: GameState): GameState {
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(state);
  return state;
}
