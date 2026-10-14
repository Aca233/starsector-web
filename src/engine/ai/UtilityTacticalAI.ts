export interface TacticalShipSnapshot {
  readonly id: string | number;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly rotRad: number;
  readonly radius: number;
  readonly hpRatio: number;
  readonly fluxRatio: number;
  readonly hardFluxRatio: number;
  readonly isOverloaded: boolean;
}

export interface TacticalWaypointOrder {
  readonly kind: 'MOVE_WAYPOINT' | 'FLANK_VECTOR' | 'FOCUS_TARGET';
  readonly x: number;
  readonly y: number;
  readonly targetShipId?: string | number;
}

export interface UtilityAiDecision {
  readonly posture: 'COMMIT_FINISH' | 'ENGAGE_OPTIMAL' | 'HOLD_LINE' | 'VENT_RETREAT';
  readonly utilityScore: number;
  readonly desiredHeadingRad: number;
  readonly thrustCommand: number; // [-1..1]
  readonly holdFireDueToFriendlyCorridor: boolean;
}

/**
 * Checks whether any allied ship lies inside the firing corridor between the shooter
 * and the current aim direction within `maxRange`.
 * Prevents friendly battleships from shooting allied frigates/cruisers in the back.
 */
export function isFriendlyInFireCorridor(
  shooter: TacticalShipSnapshot,
  aimDirX: number,
  aimDirY: number,
  maxRange: number,
  allShips: readonly TacticalShipSnapshot[],
  corridorPaddingPx = 18
): boolean {
  for (let i = 0; i < allShips.length; i++) {
    const ally = allShips[i];
    if (ally.id === shooter.id || ally.team !== shooter.team || ally.hpRatio <= 0) {
      continue;
    }
    const dx = ally.x - shooter.x;
    const dy = ally.y - shooter.y;
    const forwardProj = dx * aimDirX + dy * aimDirY;
    if (forwardProj <= 0 || forwardProj >= maxRange) {
      continue;
    }
    const perpDistSq = dx * dx + dy * dy - forwardProj * forwardProj;
    const safeRadius = ally.radius + corridorPaddingPx;
    if (perpDistSq < safeRadius * safeRadius) {
      return true;
    }
  }
  return false;
}

/**
 * Smooth Utility AI Evaluator with Hysteresis Commitment.
 * Eliminates the classic Starsector "Hesitation Loop" (oscillating forward/backward
 * at weapon range boundaries or retreating when an enemy is 1 shot from death).
 */
export class UtilityTacticalAI {
  private lastCommittedPosture = new Map<string | number, UtilityAiDecision['posture']>();
  private readonly shiftQueues = new Map<string | number, TacticalWaypointOrder[]>();

  /**
   * Appends (Shift+Click) or replaces tactical waypoint/focus orders for RTS-grade micro.
   */
  public issueWaypointOrder(
    shipId: string | number,
    order: TacticalWaypointOrder,
    appendWithShift = true
  ): readonly TacticalWaypointOrder[] {
    const queue = appendWithShift ? (this.shiftQueues.get(shipId) ?? []) : [];
    queue.push(order);
    this.shiftQueues.set(shipId, queue);
    return queue;
  }

  public getWaypointQueue(shipId: string | number): readonly TacticalWaypointOrder[] {
    return this.shiftQueues.get(shipId) ?? [];
  }

  public evaluateShipDecision(
    self: TacticalShipSnapshot,
    target: TacticalShipSnapshot,
    allShips: readonly TacticalShipSnapshot[],
    preferredRange = 460
  ): UtilityAiDecision {
    // 1. Check active RTS Shift-waypoint queue first
    const queue = this.shiftQueues.get(self.id);
    if (queue && queue.length > 0) {
      const head = queue[0];
      if (head.kind === 'MOVE_WAYPOINT' || head.kind === 'FLANK_VECTOR') {
        const wdx = head.x - self.x;
        const wdy = head.y - self.y;
        const wdist = Math.hypot(wdx, wdy);
        if (wdist <= Math.max(48, self.radius * 1.2)) {
          queue.shift();
        } else {
          const dirX = wdx / wdist;
          const dirY = wdy / wdist;
          const blocked = isFriendlyInFireCorridor(self, dirX, dirY, wdist, allShips);
          return {
            posture: 'ENGAGE_OPTIMAL',
            utilityScore: 0.85,
            desiredHeadingRad: Math.atan2(wdy, wdx),
            thrustCommand: 1.0,
            holdFireDueToFriendlyCorridor: blocked,
          };
        }
      }
    }

    // 2. Smooth Utility Threat & Kill-Opportunity Curve
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Opportunity rises nonlinearly as target HP drops or target overloads
    const killOpportunity =
      Math.pow(1 - Math.max(0, Math.min(1, target.hpRatio)), 1.6) * 0.75 +
      (target.isOverloaded ? 0.55 : 0) +
      target.fluxRatio * 0.25;

    // Self-risk rises sharply only when hard flux > 78%
    const selfFluxPenalty =
      Math.pow(Math.max(0, self.fluxRatio), 2.2) * 0.7 +
      Math.pow(Math.max(0, self.hardFluxRatio), 2.5) * 0.45 +
      (self.isOverloaded ? 1.2 : 0);

    // Hysteresis bonus prevents frame-to-frame flip-flopping ("Hesitation Loop")
    const prevPosture = this.lastCommittedPosture.get(self.id);
    const hysteresisBias =
      prevPosture === 'COMMIT_FINISH'
        ? 0.18
        : prevPosture === 'VENT_RETREAT'
          ? -0.14
          : 0.0;

    const utilityScore = 0.55 + killOpportunity - selfFluxPenalty + hysteresisBias;

    let posture: UtilityAiDecision['posture'];
    let thrustCommand: number;

    if (utilityScore >= 0.75 || (target.hpRatio < 0.22 && self.fluxRatio < 0.92)) {
      posture = 'COMMIT_FINISH';
      thrustCommand = dist > preferredRange * 0.55 ? 1.0 : 0.35;
    } else if (utilityScore >= 0.25) {
      posture = 'ENGAGE_OPTIMAL';
      thrustCommand =
        dist > preferredRange * 1.08
          ? 0.9
          : dist < preferredRange * 0.75
            ? -0.45
            : 0.15;
    } else if (utilityScore >= -0.05) {
      posture = 'HOLD_LINE';
      thrustCommand = -0.35;
    } else {
      posture = 'VENT_RETREAT';
      thrustCommand = -1.0;
    }

    this.lastCommittedPosture.set(self.id, posture);
    const holdFireDueToFriendlyCorridor = isFriendlyInFireCorridor(
      self,
      dirX,
      dirY,
      dist,
      allShips
    );

    return {
      posture,
      utilityScore,
      desiredHeadingRad: Math.atan2(dy, dx),
      thrustCommand,
      holdFireDueToFriendlyCorridor,
    };
  }
}
