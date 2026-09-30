/** Retired with the v05 single hull; not a runtime system registration. */
import { ADUN_FX, adunFXTextures } from '../../visual/AdunFXAssets';
import type { ShipSystemDefinition } from './Types';
import { usableWeaponReason } from './Requirements';
import { advanceWeaponBoostAI } from './SystemAI';
import { ADUN_HULL_ID, ADUN_SYSTEM_ID } from '../../content/SpearOfAdunIds';
/** Web adaptation. Pure lifecycle modifiers; no untracked timers/private state. */
export const adunSolarForge:ShipSystemDefinition={
  id:ADUN_SYSTEM_ID,sourceIds:[],name:'太阳锻炉',iconUrl:ADUN_FX.core,resources:{textures:adunFXTextures},
  description:'亚顿之矛专属。0.8秒展开，持续6秒：能量伤害+40%、弹速+25%、载荷消耗+30%；航速-30%、耗散-25%。消耗4%容量硬载荷，冷却24秒。适合压盾后的重击窗口，不宜顶着高载荷强开。',
  implementationDetails:'Web主题改编，不是原作太阳核心战役面板。加减益随阶段淡入淡出，过载/排散遵循宿主系统规则；护盾不无敌，不清除硬载荷。',
  chargeUp:.8,active:6,chargeDown:.7,cooldown:24,fluxPerUseFraction:.04,hardFlux:true,
  installReason:spec=>(spec.sourceHullId??spec.id)===ADUN_HULL_ID?undefined:'需要亚顿之矛太阳核心',
  activationReason:ship=>usableWeaponReason(ship,'ENERGY','需要至少一门可用能量武器'),
  statusText:system=>system.isActive?'太阳锻炉：火力增强 · 散热/机动降低':undefined,
  modifiers:system=>({speedPercent:-30*system.effectLevel,dissipationMultiplier:1-.25*system.effectLevel,
    weapons:{ENERGY:{damageMultiplier:1+.4*system.effectLevel,projectileSpeedPercent:25*system.effectLevel,fluxCostMultiplier:1+.3*system.effectLevel}}}),
  advanceAI:context=>{if(context.ship.flux.fluxPercent<.45)advanceWeaponBoostAI(context,'ENERGY');},
};
