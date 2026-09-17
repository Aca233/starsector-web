import { validateResources, validateHooks } from '../Dependencies';
import { DefinitionRegistry } from '../DefinitionRegistry';
import type { WeaponEffectDefinition } from './Types';
import { advanceTachyonLance } from '../../simulation/systems/weapon/TachyonLanceEffect';
import { advanceGravitonBeam } from '../../simulation/systems/weapon/GravitonBeamEffect';
import { sabotHit } from './SabotHit';
export const weaponEffects = new DefinitionRegistry<WeaponEffectDefinition>('weapon effect', d=>{
  validateResources(d.resources); validateHooks(d,['beam','hit','advance']);
  if (!d.beam && !d.hit && !d.advance) throw new Error(d.id + ': no effect hook');
});
weaponEffects.register({id:'com.fs.starfarer.api.impl.combat.TachyonLanceEffect', resources:{sounds:['tachyon_lance_emp_impact_01','tachyon_lance_emp_impact_02','tachyon_lance_emp_impact_03']}, beam:(beam,target,_mount,ctx)=>advanceTachyonLance(beam,target,ctx)});
weaponEffects.register({id:'com.fs.starfarer.api.impl.combat.GravitonBeamEffect', beam:(beam,target,mount)=>advanceGravitonBeam(beam,target,mount)});
weaponEffects.register(sabotHit);
export function requireWeaponEffect(id: string, hook: 'beam' | 'hit' | 'advance', owner: string): WeaponEffectDefinition {
  const definition = weaponEffects.require(id, owner);
  if (!definition[hook]) throw new Error(`${owner}: effect "${id}" does not implement ${hook}`);
  return definition;
}
