import { enableWorkerOwnedAimQueries } from '../../ai/AutofireController';
import { FireControlQueryRoster } from '../../ai/FireControlQueryBatch';
import { enableWorkerOwnedPositionReads } from '../../ai/TacticalPositioning';
import { enableWorkerOwnedThreatReads } from '../../ai/ThreatAssessment';
import { enableWorkerOwnedPhaseReads } from '../../simulation/Ship';
import type { CombatEngine } from '../../simulation/CombatEngine';
import { enableWorkerOwnedMotionReads } from '../../simulation/systems/ShipMotion';

/** Only the closed module Worker calls this in production. Mutable engines in
 * the UI/inline fallback never earn these read permissions implicitly. */
export function enableLocalCombatReadDomain(engine: CombatEngine): void {
  FireControlQueryRoster.ownForWorker(engine);
  enableWorkerOwnedPhaseReads();
  // One synchronous query only; no retained motion/range result or AI permission.
  enableWorkerOwnedMotionReads();
  enableWorkerOwnedAimQueries();
  enableWorkerOwnedThreatReads();
  enableWorkerOwnedPositionReads();
}

