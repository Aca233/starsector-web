import bundledPolicy from './combat-policy.json';
import type { Ship } from '../../simulation/Ship';

/** Residual actions, never raw steering/fire commands. Safety remains in the controllers. */
export const POLICY_ACTIONS = ['BALANCED', 'PRESSURE', 'FINISH', 'CAUTIOUS'] as const;
export type PolicyAction = typeof POLICY_ACTIONS[number];
export const OBSERVATION = 'flux-hull-window-mobility-target-pressure-v2';
export const POLICY_STATES = 324;
export interface PolicyRow { q: number[]; visits: number[] }
export interface CombatPolicy {
  version: 2;
  observation: typeof OBSERVATION;
  actions: readonly PolicyAction[];
  enabled: boolean;
  minVisits: number;
  minAdvantage: number;
  rows: Record<string, PolicyRow>;
}
export const POLICY_TUNING = Object.freeze({
  BALANCED: { range: 1, pressure: 1, finish: 1 },
  PRESSURE: { range: .90, pressure: 1.6, finish: .8 },
  FINISH: { range: .94, pressure: .8, finish: 1.6 },
  CAUTIOUS: { range: 1.12, pressure: .8, finish: .8 },
});

/** Imported models are data only. Reject the whole model on schema/NaN/range errors. */
export function validateCombatPolicy(value: unknown): value is CombatPolicy {
  if (!value || typeof value !== 'object') return false;
  const p = value as CombatPolicy;
  if (p.version !== 2 || p.observation !== OBSERVATION || typeof p.enabled !== 'boolean'
    || !Array.isArray(p.actions) || p.actions.join('|') !== POLICY_ACTIONS.join('|')
    || !Number.isInteger(p.minVisits) || p.minVisits < 8 || p.minVisits > 1e9
    || !Number.isFinite(p.minAdvantage) || p.minAdvantage < .03 || p.minAdvantage > 100
    || !p.rows || typeof p.rows !== 'object' || Array.isArray(p.rows)) return false;
  return Object.entries(p.rows).every(([key, row]) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < POLICY_STATES
    && row && Array.isArray(row.q) && Array.isArray(row.visits)
    && row.q.length === POLICY_ACTIONS.length && row.visits.length === POLICY_ACTIONS.length
    && row.q.every(q => Number.isFinite(q) && Math.abs(q) <= 1000)
    && row.visits.every(n => Number.isInteger(n) && n >= 0 && n <= 1e9));
}

export function emptyCombatPolicy(): CombatPolicy {
  return { version: 2, observation: OBSERVATION, actions: [...POLICY_ACTIONS], enabled: false,
    minVisits: 8, minAdvantage: .03, rows: {} };
}
const fallback = emptyCombatPolicy();
const deployedPolicy: CombatPolicy = validateCombatPolicy(bundledPolicy) ? bundledPolicy : fallback;

function validContact(ship: Ship, target: Ship | null): target is Ship {
  return !!target && target !== ship && target.teamId !== ship.teamId && !target.isDead && !target.isRetreated
    && !target.isDocked && target.isVisibleTo(ship.teamId) && !ship.isDead;
}
/** Public hull class/readiness is a coarse local-pressure estimate, not omniscient DPS. */
export function observedPressure(ship: Ship, target: Ship): number {
  const roster = ship.combatShips.length ? ship.combatShips : [ship, target];
  const power = { FIGHTER: 0, FRIGATE: 1, DESTROYER: 2, CRUISER: 4, CAPITAL_SHIP: 8 };
  let friends = 0, enemies = 0;
  for (const other of roster) {
    if (other.isDead || other.isRetreated || other.isDocked || !other.isVisibleTo(ship.teamId)) continue;
    const weight = power[other.spec.hullSize] ?? 0;
    if (!weight || !Number.isFinite(other.hullHp / other.maxHullHp)) continue;
    const readiness = Math.max(.2, Math.min(1, other.hullHp / other.maxHullHp));
    const distance = ship.pos.distanceTo(other.pos);
    const influence = weight * readiness / (1 + distance / 1000);
    if (other.teamId === ship.teamId) friends += influence; else enemies += influence;
  }
  return enemies / Math.max(.1, friends);
}
/** Only a legal visible contact is observed: no hidden enemies, bullets or future state. */
export function combatObservation(ship: Ship, target: Ship | null): number | null {
  if (!validContact(ship, target)) return null;
  const values = [ship.flux.fluxPercent, ship.hullHp, ship.maxHullHp, target.flux.fluxPercent,
    ship.spec.maxSpeed, target.spec.maxSpeed, target.hullHp, target.maxHullHp];
  if (!values.every(Number.isFinite) || ship.maxHullHp <= 0 || target.maxHullHp <= 0) return null;
  const flux = ship.flux.fluxPercent >= .75 ? 2 : ship.flux.fluxPercent >= .45 ? 1 : 0;
  const hull = ship.hullHp / ship.maxHullHp < .4 ? 1 : 0;
  const window = target.flux.isOverloaded || target.flux.isVenting ? 2 : target.flux.fluxPercent >= .7 ? 1 : 0;
  const relativeSpeed = ship.spec.maxSpeed / Math.max(1, target.spec.maxSpeed);
  const mobility = relativeSpeed < .8 ? 0 : relativeSpeed > 1.25 ? 2 : 1;
  const weakTarget = target.hullHp / target.maxHullHp < .4 ? 1 : 0;
  const ratio = observedPressure(ship, target);
  const pressure = ratio < .65 ? 0 : ratio > 1.35 ? 2 : 1;
  return ((((flux * 2 + hull) * 3 + window) * 3 + mobility) * 2 + weakTarget) * 3 + pressure;
}

/** Sparse/unvisited rows cannot silently enable random behaviour. Stable ties favour baseline. */
export function policyAction(policy: CombatPolicy, state: number | null): PolicyAction {
  if (!policy.enabled || state === null) return 'BALANCED';
  const row = policy.rows[state];
  if (!row || row.visits[0] < policy.minVisits) return 'BALANCED';
  let best = 0;
  for (let i = 1; i < POLICY_ACTIONS.length; i++) {
    if (row.visits[i] >= policy.minVisits && row.q[i] > row.q[best] + 1e-9) best = i;
  }
  return best && row.q[best] - row.q[0] >= policy.minAdvantage ? POLICY_ACTIONS[best] : 'BALANCED';
}

// Serial offline training only: WeakMap entries cannot leak between encounters or worker realms.
// Live workers all import the SAME immutable, bundled JSON; never fetch a policy mid-battle.
const trainingActions = new WeakMap<Ship, PolicyAction>();
export function setTrainingAction(ship: Ship, action: PolicyAction | null): void {
  if (action === null) trainingActions.delete(ship);
  else {
    if (!POLICY_ACTIONS.includes(action)) throw new Error('Unknown combat learning action');
    trainingActions.set(ship, action);
  }
}
export function shipPolicyAction(ship: Ship, target: Ship | null = ship.currentTargetShip): PolicyAction {
  if (ship.fireControlMode !== 'AI' || !validContact(ship, target)) return 'BALANCED';
  const action = trainingActions.get(ship);
  if (action !== undefined) return action;
  // The default-disabled model must not add a fleet scan to every weapon/AI tick.
  if (!deployedPolicy.enabled) return 'BALANCED';
  return policyAction(deployedPolicy, combatObservation(ship, target));
}

/** One-step off-policy Q-learning. Trainer decides the reward, horizon and exploration. */
export function learnTransition(policy: CombatPolicy, state: number, action: PolicyAction,
  reward: number, nextState: number | null, terminal: boolean, alpha = .12, gamma = .97): void {
  if (!Number.isInteger(state) || state < 0 || state >= POLICY_STATES || !POLICY_ACTIONS.includes(action)
    || !Number.isFinite(reward) || !(alpha > 0 && alpha <= 1) || !(gamma >= 0 && gamma <= 1)
    || (nextState !== null && (!Number.isInteger(nextState) || nextState < 0 || nextState >= POLICY_STATES)))
    throw new Error('Invalid combat learning transition');
  const row = policy.rows[state] ??= { q: POLICY_ACTIONS.map(() => 0), visits: POLICY_ACTIONS.map(() => 0) };
  const next = nextState === null ? undefined : policy.rows[nextState];
  const future = terminal || !next ? 0 : Math.max(...next.q);
  const index = POLICY_ACTIONS.indexOf(action);
  row.q[index] += alpha * (reward + gamma * future - row.q[index]);
  row.visits[index]++;
}
