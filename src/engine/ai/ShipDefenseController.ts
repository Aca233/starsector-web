import type { Ship } from '../simulation/Ship';
import type { ThreatAssessment } from './ThreatAssessment';
import { tacticalPolicy as policy } from './TacticalWorld';

export class ShipDefenseController {
  public quietFor=0;
  private safeVentFor=0;
  public reset():void {this.quietFor=0;this.safeVentFor=0;}
  public observe(dt:number,threat:ThreatAssessment):void {
    this.quietFor=threat.imminentDamage>0?0:this.quietFor+dt;
    this.safeVentFor=threat.threats.length?0:this.safeVentFor+dt;
  }
  public update(ship:Ship,threat:ThreatAssessment):{ventSafe:boolean;state:'UP'|'DOWN'|'PHASE'|'VENTING'} {
    ship.defenseFacingRad=threat.facing??undefined;
    const committed=ship.weapons.some(m=>m.burstRemaining>0 || m.firingState==='CHARGING' || (m.spec.isBeam&&m.spec.beamVisualMode==='BURST'&&m.firingState==='ACTIVE'));
    const ventSafe=this.safeVentFor>=policy.calmBeforeLowering && ship.flux.baseDissipation>0 && !committed;
    if(ship.flux.isVenting)return {ventSafe,state:'VENTING'};
    if(ventSafe&&ship.flux.fluxPercent>=policy.ventFluxFraction&&!ship.shield.isPhaseEngaged&&!ship.flux.isOverloaded){
      if(ship.startVenting())return {ventSafe,state:'VENTING'};
    }
    if(!ship.canUseShields()) {ship.shield.setActive(false);return {ventSafe,state:'DOWN'};}
    const room=ship.flux.maxFlux-ship.flux.totalFlux;
    if(ship.shield.type==='PHASE'){
      const activation=ship.shield.isActive?0:ship.shield.phaseActivationCost;
      const reserve=activation+ship.shield.phaseUpkeepPerSecond*(ship.shield.phaseChargeDownDuration+policy.imminentWindow);
      const canSustain=room>reserve;
      if(!canSustain || this.quietFor>=policy.calmBeforeLowering)ship.shield.setActive(false);
      else if(threat.imminentDamage>0)ship.shield.setActive(true);
      return {ventSafe,state:ship.shield.isPhaseEngaged?'PHASE':'DOWN'};
    }
    const fluxNeeded=threat.imminentShieldFlux*ship.system.getShieldDamageMultiplier()
      +ship.shield.upkeepRate*ship.system.getShieldUpkeepMultiplier()*policy.imminentWindow;
    const canAbsorb=room>fluxNeeded;
    // A known lethal raw hit is preferable to certain immediate hull loss, even at overload risk.
    const mustProtect=threat.actualDamage>=ship.hullHp;
    if(threat.imminentDamage>0)ship.shield.setActive(canAbsorb||mustProtect);
    else if(this.quietFor>=policy.calmBeforeLowering)ship.shield.setActive(false);
    return {ventSafe,state:ship.shield.isActive?'UP':'DOWN'};
  }
}
