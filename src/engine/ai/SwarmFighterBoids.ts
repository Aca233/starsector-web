export interface SwarmFighterAgent {
  readonly id: number;
  readonly team: number;
  readonly role: 'INTERCEPTOR' | 'BOMBER';
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly maxSpeed: number;
}

export interface PointDefenseThreat {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly dangerRadius: number;
}

export interface StrikeTargetShip {
  readonly x: number;
  readonly y: number;
  readonly headingRad: number;
  readonly shieldRadius: number;
  readonly pdSaturationRatio: number; // [0..1] how busy enemy PD is tracking interceptors
}

export interface SwarmSteeringOutput {
  readonly desiredVx: number;
  readonly desiredVy: number;
  readonly deployChaffFlare: boolean;
  readonly releasePayloadNow: boolean;
}

/**
 * Swarm Boids Evasion & Coordinated Carrier Strike Controller.
 * Replaces rigid linear "suicide conga-line" fighter runs with:
 * 1. Boids Separation/Cohesion/Alignment.
 * 2. Point-Defense (PD) flak split-evasion weave.
 * 3. Interceptor chaff decoy screening + Bomber shield-blind-spot torpedo drop.
 */
export function computeSwarmFighterSteering(
  fighter: SwarmFighterAgent,
  wingmates: readonly SwarmFighterAgent[],
  pdThreats: readonly PointDefenseThreat[],
  target: StrikeTargetShip,
  simTimeSec: number
): SwarmSteeringOutput {
  let sepX = 0;
  let sepY = 0;
  let alignVx = 0;
  let alignVy = 0;
  let cohX = 0;
  let cohY = 0;
  let neighborCount = 0;

  for (let i = 0; i < wingmates.length; i++) {
    const m = wingmates[i];
    if (m.id === fighter.id || m.team !== fighter.team) continue;
    const dx = fighter.x - m.x;
    const dy = fighter.y - m.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0.001 && d2 < 85 * 85) {
      const d = Math.sqrt(d2);
      if (d < 36) {
        const repulse = (36 - d) / 36;
        sepX += (dx / d) * repulse * 140;
        sepY += (dy / d) * repulse * 140;
      }
      alignVx += m.vx;
      alignVy += m.vy;
      cohX += m.x;
      cohY += m.y;
      neighborCount += 1;
    }
  }

  let boidsVx = sepX;
  let boidsVy = sepY;
  if (neighborCount > 0) {
    boidsVx += (alignVx / neighborCount - fighter.vx) * 0.25;
    boidsVy += (alignVy / neighborCount - fighter.vy) * 0.25;
    const centerDx = cohX / neighborCount - fighter.x;
    const centerDy = cohY / neighborCount - fighter.y;
    boidsVx += centerDx * 0.18;
    boidsVy += centerDy * 0.18;
  }

  // Point-Defense (PD)弹幕 split-evasion vector
  let evadeX = 0;
  let evadeY = 0;
  let underHeavyPdFire = false;
  for (let i = 0; i < pdThreats.length; i++) {
    const t = pdThreats[i];
    const dx = fighter.x - t.x;
    const dy = fighter.y - t.y;
    const d2 = dx * dx + dy * dy;
    const r = Math.max(24, t.dangerRadius);
    if (d2 < r * r) {
      underHeavyPdFire = true;
      const d = Math.max(1, Math.sqrt(d2));
      // Lateral jink perpendicular to incoming PD velocity
      const spd = Math.max(1, Math.hypot(t.vx, t.vy));
      const sign = fighter.id % 2 === 0 ? 1 : -1;
      const latX = (-t.vy / spd) * sign;
      const latY = (t.vx / spd) * sign;
      const urgency = 1 - d / r;
      evadeX += (dx / d + latX * 1.4) * urgency * 220;
      evadeY += (dy / d + latY * 1.4) * urgency * 220;
    }
  }

  // Tactical Role Coordination:
  // - Interceptors orbit the frontal PD engagement zone & pop chaff flares to draw PD turrets.
  // - Bombers curve around to the target's rear/flank blind-spot (180 deg behind target heading).
  const targetCos = Math.cos(target.headingRad);
  const targetSin = Math.sin(target.headingRad);

  let anchorX: number;
  let anchorY: number;
  if (fighter.role === 'INTERCEPTOR') {
    const flankSign = fighter.id % 2 === 0 ? 1 : -1;
    anchorX =
      target.x +
      targetCos * (target.shieldRadius * 1.15) -
      targetSin * flankSign * (target.shieldRadius * 0.65);
    anchorY =
      target.y +
      targetSin * (target.shieldRadius * 1.15) +
      targetCos * flankSign * (target.shieldRadius * 0.65);
  } else {
    // Bomber targets the unshielded rear engines (-targetCos, -targetSin)
    anchorX = target.x - targetCos * (target.shieldRadius * 1.05);
    anchorY = target.y - targetSin * (target.shieldRadius * 1.05);
  }

  const toAnchorX = anchorX - fighter.x;
  const toAnchorY = anchorY - fighter.y;
  const anchorDist = Math.max(1, Math.hypot(toAnchorX, toAnchorY));

  const weavePhase = Math.sin(simTimeSec * 5.5 + fighter.id * 1.37) * 42;
  const perpX = -toAnchorY / anchorDist;
  const perpY = toAnchorX / anchorDist;

  let rawVx =
    (toAnchorX / anchorDist) * fighter.maxSpeed +
    perpX * weavePhase +
    boidsVx +
    evadeX;
  let rawVy =
    (toAnchorY / anchorDist) * fighter.maxSpeed +
    perpY * weavePhase +
    boidsVy +
    evadeY;

  const rawSpeed = Math.hypot(rawVx, rawVy);
  if (rawSpeed > fighter.maxSpeed) {
    const scale = fighter.maxSpeed / rawSpeed;
    rawVx *= scale;
    rawVy *= scale;
  }

  const distToTargetCenter = Math.hypot(target.x - fighter.x, target.y - fighter.y);
  const deployChaffFlare =
    fighter.role === 'INTERCEPTOR' &&
    (underHeavyPdFire || distToTargetCenter < target.shieldRadius * 1.6);

  const releasePayloadNow =
    fighter.role === 'BOMBER' &&
    anchorDist < target.shieldRadius * 1.25 &&
    (target.pdSaturationRatio >= 0.35 || distToTargetCenter < target.shieldRadius * 1.15);

  return {
    desiredVx: rawVx,
    desiredVy: rawVy,
    deployChaffFlare,
    releasePayloadNow,
  };
}
