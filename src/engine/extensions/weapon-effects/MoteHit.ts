import type { WeaponEffectDefinition } from './Types';
import { applyComponentDamage } from '../../simulation/systems/weapon/ComponentDamage';
import { pickEmpShipTarget } from '../../simulation/systems/weapon/TachyonLanceEffect';
import { damageToMissiles } from '../../simulation/systems/weapon/DamageToMissiles';
import { projectileOutgoingMultiplier } from '../../simulation/systems/weapon/OutgoingDamage';
import { highFrequencyMotes } from '../ship-systems/MoteState';
import { sound } from '../../audio/SoundManager';
export const moteHit:WeaponEffectDefinition={
  id:'com.fs.starfarer.api.impl.combat.MoteOnHitEffect',
  resources:{sounds:['mote_attractor_impact_emp_arc','mote_attractor_impact_normal','mote_attractor_impact_damage']},
  hit:(p,ship,impact,shield,source,ctx)=>{
    const high=source?highFrequencyMotes(source):p.specId==='motelauncher_hf';
    if(ship.spec.hullSize==='FIGHTER'){
      const amount=(high?1000:200)*projectileOutgoingMultiplier(p,ship,impact,ctx)*ship.crDamageTakenMultiplier;
      if(shield)ship.flux.increaseShieldFlux(amount*ship.system.getShieldDamageMultiplier()*ship.shield.efficiency*ship.shield.damageTakenMultiplierFor('ENERGY'),true);
      else{const local=impact.clone().sub(ship.pos).rotate(-ship.facingRad);const result=ship.armor.takeDamage(local,amount,'ENERGY');ship.applyHullDamage(result.hullDamage);applyComponentDamage(ship,local,result,0,source);}
    }else if(!shield||ctx.random.next()<ship.shieldPiercedMultiplier){
      const point=pickEmpShipTarget(ship,impact,ctx.random),end=point.local.clone().rotate(ship.facingRad).add(ship.pos);
      const result=ship.armor.takeDamage(point.local,p.damage*projectileOutgoingMultiplier(p,ship,impact,ctx)*ship.crDamageTakenMultiplier,'ENERGY');
      ship.applyHullDamage(result.hullDamage);applyComponentDamage(ship,point.local,result,p.empDamage??0,source);
      ctx.fx.spawnNativeEmpArc(impact,end,ship,20,high?[255,100,255,255]:[100,165,255,255],[255,255,255,255]);
      sound.playAtPos('mote_attractor_impact_emp_arc',end,ctx.playerShip.pos,1);
    }
    sound.playAtPos(high?'mote_attractor_impact_damage':'mote_attractor_impact_normal',impact,ctx.playerShip.pos,1);
  },
  hitProjectile:(p,target,point,source,ctx)=>{
    const high=source?highFrequencyMotes(source):p.specId==='motelauncher_hf';
    target.hitpoints=(target.hitpoints??100)-damageToMissiles((high?1000:200)*projectileOutgoingMultiplier(p,undefined,point,ctx),p.sourceShipId,ctx,source,target);
    sound.playAtPos(high?'mote_attractor_impact_damage':'mote_attractor_impact_normal',point,ctx.playerShip.pos,1);
  },
};
