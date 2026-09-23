import { finite, integer, isRecord, jsonCopy, requireThat } from '../core/Values.mjs';

function repairArmor(armor, fraction) {
  if (armor === null) return null;
  integer(armor.cols, 'armor cols', 1); integer(armor.rows, 'armor rows', 1);
  requireThat(Array.isArray(armor.fractions) && armor.fractions.length === armor.cols * armor.rows,
    'INVALID_LOGISTICS', 'Invalid armor grid');
  const fractions = armor.fractions.map(n => finite(n, 'armor cell', 0, 1));
  let capacity = fraction * fractions.length;
  // Persisted flat grid is row-major (y * cols + x); native repair visits y descending, x ascending.
  for (let y = armor.rows - 1; y >= 0; y--) for (let x = 0; x < armor.cols; x++) {
    const i = y * armor.cols + x, needed = 1 - fractions[i];
    if (needed <= 0) continue;
    const used = Math.min(needed, capacity);
    fractions[i] = Math.min(1, fractions[i] + used); capacity -= used;
    // Native keeps a non-null full grid when capacity ran out exactly at the final damaged cell.
    if (capacity <= 0) return { ...armor, fractions };
  }
  return null;
}
/** One native advanceCRAndRepairs step. No large-step "proportional supply" approximation. */
export function advanceOriginalRecovery(condition, stats, days, hasSupplies) {
  requireThat(isRecord(condition) && isRecord(stats) && typeof hasSupplies === 'boolean', 'INVALID_LOGISTICS', 'Missing recovery state');
  finite(days, 'elapsed days', 0); finite(condition.hullFraction, 'hull', 0, 1);
  let cr = finite(condition.combatReadiness, 'base CR', 0, 1), losingCR = false;
  const maxCR = finite(stats.maxCR, 'maximum CR', 0, 1);
  const recovery = finite(stats.recoveryPerDay, 'recovery rate', 0);
  const decrease = finite(stats.baseRecoveryPercentPerDay, 'base CR rate', 0) * 0.01 * 0.5;
  const repairRate = finite(stats.repairRatePerDay, 'repair rate', 0);
  for (const flag of ['mothballed', 'suspendRepairs', 'aiCaptain']) requireThat(typeof stats[flag] === 'boolean', 'INVALID_LOGISTICS', `Missing ${flag}`);
  const before = cr, next = jsonCopy(condition);
  if (days === 0) return { condition: next, losingCR, shortageCRLoss: 0, repairsCompleted: false };
  if (!stats.mothballed) {
    if (cr > maxCR || !hasSupplies) {
      cr -= decrease * days;
      if (stats.aiCaptain && cr > maxCR) cr = maxCR;
      if (hasSupplies && cr < maxCR) cr = maxCR;
      losingCR = true;
    } else if (cr < maxCR && hasSupplies && !stats.suspendRepairs) cr = Math.min(maxCR, cr + recovery * days);
    cr = Math.max(0, Math.min(1, cr));
  }
  const neededRepairs = condition.hullFraction < 1 || condition.armor !== null;
  if (hasSupplies && neededRepairs && !stats.mothballed && !stats.suspendRepairs && stats.fighterCount === null && condition.status === 'ready') {
    next.hullFraction = Math.min(1, next.hullFraction + repairRate * days);
    next.armor = repairArmor(next.armor, repairRate * days);
  }
  next.combatReadiness = cr;
  return { condition: next, losingCR, shortageCRLoss: !hasSupplies ? Math.max(0, before - cr) : 0,
    repairsCompleted: neededRepairs && next.hullFraction === 1 && next.armor === null };
}
