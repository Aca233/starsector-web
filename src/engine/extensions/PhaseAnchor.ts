import type { Ship } from '../simulation/Ship';
import nativeFacts from './native-hull-facts.json';
import { sound } from '../audio/SoundManager';
interface State { emergency: boolean; progress: number; alpha: number; vanishing: boolean; enhanced: boolean }
const states = new WeakMap<Ship,State>();
const facts: Record<string,{deployCR:number}> = nativeFacts;
/** Actual structure interception. One emergency dive per encounter across BOTH sides. */
export function installPhaseAnchor(ship: Ship): void {
  const state:State = {emergency:false,progress:0,alpha:1,vanishing:false,enhanced:false};
  states.set(ship,state);
  ship.shield.phaseActivationCost = 0;
  ship.hullDamageInterceptors.add(damage=>{
    if (state.emergency) return true;
    const crLoss = ship.spec.deploymentCRCost ?? (facts[ship.spec.sourceHullId ?? ship.spec.id]?.deployCR ?? 0)/100;
    if (damage<ship.hullHp || ship.encounterEffects.emergencyPhaseDiveUsed || ship.currentCR<crLoss) return false;
    ship.encounterEffects.emergencyPhaseDiveUsed = true;
    ship.hullHp = 1; ship.pendingCombatCRLoss += crLoss; ship.retreating = true;
    state.emergency = true;
    if (!ship.isPhased) sound.play('phase_activate',1);
    ship.externalPhaseEffects.set(state,()=>Math.min(.25,state.alpha));
    ship.runtimeModifiers.set('phase_anchor_emergency',{hullDamageMultiplier:0});
    for (const system of ship.allSystems) system.deactivate();
    return true;
  });
}
export function advancePhaseAnchor(ship: Ship,dt: number): void {
  const state=states.get(ship);if(!state||ship.isDead||ship.isRetreated)return;
  if(state.emergency){
    ship.retreating=true;ship.isFiringMain=false;
    state.progress+=dt*ship.shield.phaseChargeUpDuration;
    ship.shield.forcedPhaseEffectLevel=Math.min(1,Math.max(ship.shield.phaseEffectLevel,state.progress));
    if(state.progress>=1){
      if(!state.vanishing){state.vanishing=true;sound.play('phase_anchor_vanish',1);state.alpha-=dt;}
      else state.alpha-=2*dt;
      if(state.alpha<=0){state.alpha=0;ship.retreatFromCombat();return;}
    }
  }
  const enhanced=ship.isPhased&&ship.shield.phaseState!=='OUT';
  if(enhanced===state.enhanced)return;
  state.enhanced=enhanced;
  if(enhanced)ship.runtimeModifiers.set('phase_anchor',{
    dissipationMultiplier:2,
    weapons:{BALLISTIC:{rateOfFireMultiplier:2,ammoRegenMultiplier:2},ENERGY:{rateOfFireMultiplier:2,ammoRegenMultiplier:2},MISSILE:{rateOfFireMultiplier:2,ammoRegenMultiplier:2}},
  });
  else ship.runtimeModifiers.delete('phase_anchor');
}
