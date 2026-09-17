import { sameTeam } from "../../simulation/CombatTeams";
import { nativeSystem } from './NativeSystemFactory';
import { spawnSystemProjectile } from './SystemProjectile';
import { contentRegistry } from '../../content/ContentRegistry';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
const drones = (ship: Ship) => [...ship.deployedWingCraft].filter(c=>!c.isDead&&!c.isDocked&&c.hullHp>0&&!!c.flightDeckWingId);
function targetFor(ship: Ship, system: ShipSystem): Ship | undefined {
  const valid=(s: Ship)=>!s.isDead&&!s.isRetreated&&s.isVisibleTo(ship.teamId)&&!sameTeam(s, ship);
  const selected=system.activationInput ? system.activationInput.target : ship.currentTargetShip;
  if(selected&&valid(selected))return selected;
  const enemies=ship.combatShips.filter(valid);
  const point=ship.fireControlMode==='MANUAL'?(system.activationInput?.point??ship.aimTargetWorld):(system.activationInput?.origin??ship.pos);
  let target=enemies.reduce<Ship|undefined>((best,s)=>!best||s.pos.distanceTo(point)<best.pos.distanceTo(point)?s:best,undefined);
  if(target?.spec.hullSize==='FIGHTER') target=enemies.find(s=>s.spec.hullSize!=='FIGHTER'&&s.pos.distanceTo(target!.pos)<=100)??target;
  return target;
}
export const droneStrike=nativeSystem('drone_strike',{
  description:'每次消耗600软幅能，将一架现有舰载机从联队分离并转化为终结导弹；母舰正常重建缺员。无人机仍可被击毁，不凭空生成免费弹药。',
  implementationDetails:'DroneStrikeStats：最近机体、原生terminator_missile、系统范围修正、EMP抗性10000、100%抗诱骗、机体/导弹生命周期绑定。飞行采用Web制导，转化抖动不是逐帧原生表现。',
  resources:{weapons:['terminator_missile'],sounds:['system_termination_sequence']},
  audio:{activate:'system_termination_sequence'},
  canActivate:ship=>drones(ship).length>0,
  statusText:system=>system.owner&&drones(system.owner).length===0?'无可用无人机':undefined,
  onActive:(ship,world,system)=>{
    if(!world.detachWingCraft||!world.retireCombatCraft||!world.addCombatEffect||!world.projectiles)throw new Error('Drone strike requires wing detachment and entity lifecycle');
    const target=targetFor(ship,system),available=drones(ship);
    if(target)available.sort((a,b)=>a.pos.distanceTo(target.pos)-b.pos.distanceTo(target.pos));
    else world.combatRandom.shuffle(available);
    const craft=available[0];if(!craft||!world.detachWingCraft(ship,craft))return;
    const base=contentRegistry.getWeapon('terminator_missile')!;
    const range=base.range*ship.hullStats.systemRangeMultiplier;
    const missile=spawnSystemProjectile(ship,base.id,craft.pos,craft.facingRad,world,{vel:craft.vel.clone(),rangeRemaining:range,totalRange:range,
      maxFlightTime:(base.flightTime??10)*range/base.range,flightTimeRemaining:(base.flightTime??10)*range/base.range,
      targetShipId:target?.id,empResistance:10000,eccmChance:1,spriteAlphaOverride:0});
    craft.runtimeModifiers.set('drone_strike',{disableWeapons:1,disableDefense:1,disableSystems:1,disableMotion:1});
    craft.shield.setActive(false);craft.clearInput();craft.isSystemDrone=true;
    world.spawnSystemArc?.(ship.pos,craft.pos,[255,100,100]);
    const projectiles=world.projectiles;
    world.addCombatEffect(()=>{
      const alive=projectiles.includes(missile)&&!missile.didDamage&&(missile.hitpoints??1)>0&&!missile.isDisarmed;
      if(craft.isDead||craft.hullHp<=0||!alive){
        // Native expiry/interception detonates; impact already applied its one explosion.
        if(!missile.didDamage){
          missile.vel.set(0,0);missile.isGuided=false;missile.isDisarmed=false;missile.hitpoints=1;
          missile.flightTimeRemaining=1;missile.rangeRemaining=1;missile.systemFuseSeconds=missile.elapsedTime;
          missile.collisionDisabled=true;if(!projectiles.includes(missile))projectiles.push(missile);
        }
        world.retireCombatCraft!(craft);return true;
      }
      craft.prevPos.copy(craft.pos);craft.prevFacingRad=craft.facingRad;
      craft.pos.copy(missile.pos);craft.vel.copy(missile.vel);craft.facingRad=missile.facingRad??craft.facingRad;
      return false;
    });
  },
  advanceAI:({ship,distance,tactical})=>{if(distance<=1500*ship.hullStats.systemRangeMultiplier&&!tactical?.withdrawing&&ship.flux.fluxPercent<.8)ship.system.activate();},
});
