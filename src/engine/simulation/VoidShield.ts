/** Original Web adaptation, not canonical Warhammer shield-count/balance data. */
export interface VoidShieldSpec {
  layers: number;
  integrityPerLayer: number;
  rechargePerSecond: number;
  hitDelay: number;
  restartDelay: number;
}
/** Data only: transported as presentation state, never a client-side simulation. */
export interface VoidShieldState extends VoidShieldSpec {
  integrity: number;
  rebuild: number;
  quietRemaining: number;
  restartRemaining: number;
  armed: boolean;
  suppressed: boolean;
  breaks: number;
  /** Presentation envelopes advanced by simulation time, including worker/LAN views. */
  visualHitRemaining: number;
  visualHitAngle: number;
  visualHitStrength: number;
  visualBreakRemaining: number;
  visualRestartRemaining: number;
  visualShutdownRemaining: number;
  visualCollapse: boolean;
}
export function createVoidShield(spec: VoidShieldSpec): VoidShieldState {
  return { ...spec, integrity: spec.layers * spec.integrityPerLayer, rebuild: 0,
    quietRemaining: 0, restartRemaining: 0, armed: true, suppressed: false, breaks: 0,
    visualHitRemaining: 0, visualHitAngle: 0, visualHitStrength: 0,
    visualBreakRemaining: 0, visualRestartRemaining: 1.4, visualShutdownRemaining: 0, visualCollapse: false };
}
export function voidShieldContact(state: VoidShieldState | undefined): void {
  if (state) state.quietRemaining = state.hitDelay;
}
export function absorbVoidShield(state: VoidShieldState, damage: number, hitAngleRad = 0): { absorbed: number; remainingFraction: number } {
  if (!(damage > 0)) return { absorbed: 0, remainingFraction: 0 };
  voidShieldContact(state);
  const before = Math.ceil(state.integrity / state.integrityPerLayer);
  const absorbed = Math.min(state.integrity, damage);
  state.integrity = Math.max(0, state.integrity - absorbed);
  const broken = before - Math.ceil(state.integrity / state.integrityPerLayer);
  state.breaks += broken;
  if (absorbed > 0) {
    state.visualHitRemaining = .65;
    state.visualHitAngle = hitAngleRad;
    state.visualHitStrength = Math.min(1, .3 + Math.sqrt(absorbed / state.integrityPerLayer));
  }
  if (broken > 0) {
    state.visualBreakRemaining = 1.2;
    state.visualCollapse = state.integrity === 0;
  }
  if (absorbed > 0 && state.integrity === 0) { state.restartRemaining = state.restartDelay; state.rebuild = 0; }
  return { absorbed, remainingFraction: Math.max(0, 1 - absorbed / damage) };
}
export function advanceVoidShield(state: VoidShieldState, dt: number): void {
  if (!(dt > 0)) return;
  state.visualHitRemaining = Math.max(0, (state.visualHitRemaining ?? 0) - dt);
  state.visualBreakRemaining = Math.max(0, (state.visualBreakRemaining ?? 0) - dt);
  state.visualRestartRemaining = Math.max(0, (state.visualRestartRemaining ?? 0) - dt);
  state.visualShutdownRemaining = Math.max(0, (state.visualShutdownRemaining ?? 0) - dt);
  if (state.suppressed) return;
  const wait = Math.max(state.quietRemaining, state.restartRemaining);
  state.quietRemaining = Math.max(0, state.quietRemaining - dt);
  state.restartRemaining = Math.max(0, state.restartRemaining - dt);
  const recovering = Math.max(0, dt - wait);
  if (!recovering) return;
  let repair = recovering * state.rechargePerSecond;
  if (state.integrity === 0) {
    const need = state.integrityPerLayer - state.rebuild;
    if (repair < need) { state.rebuild += repair; return; }
    repair -= need; state.integrity = state.integrityPerLayer; state.rebuild = 0;
    state.visualRestartRemaining = Math.max(0, 1.4 - repair / state.rechargePerSecond);
  }
  state.integrity = Math.min(state.layers * state.integrityPerLayer, state.integrity + repair);
}
