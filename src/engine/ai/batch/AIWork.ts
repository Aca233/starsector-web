/** D's default-path coverage witness. Counters describe actual entered solvers
 * and commits, not getter-cache hits or independent kernel benchmark calls.
 * Main heavy scenario must have phases/plans/fleetSolves/effects >0 and no
 * unexplained legacy fallback. No timing, sampling, RNG or candidate limits. */
export const aiDomainWork = {
  phaseAttempts:0, phases:0, plans:0, stoppedPlans:0, attachedPlans:0,
  legacyPlans:0, controls:0, effects:0, fleetSolves:0, fleetRows:0,
  threatSolves:0, fullForecastSolves:0, nearThreatSolves:0,
  projectileRows:0, beamRows:0, weaponRows:0,
  targetSolves:0, profileSolves:0, positionSolves:0, positionCandidates:0,
  navigationSolves:0, yieldSolves:0, avoidanceSolves:0, steeringSolves:0,
  effectCaptures:0, effectRecaptures:0, effectThreatSolves:0, effectForwardSolves:0,
  effectRowRefreshes:0, effectFamilyRefreshes:0, effectInvalidations:0,
  missingStage:0, missingAIColumns:0, customController:0, customWorld:0
};
export function resetAIDomainWork():void {
  for(const key of Object.keys(aiDomainWork) as (keyof typeof aiDomainWork)[])aiDomainWork[key]=0;
}
export function aiDomainCoverage():Readonly<typeof aiDomainWork> {return Object.freeze({...aiDomainWork});}
