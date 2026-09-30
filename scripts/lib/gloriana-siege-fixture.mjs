/** Shared, isolated production-engine scene for the existing Gloriana armory check.
 * One paid siege weapon, stationary custom target, no ambient combat. Not a balance fixture. */
export function createSiegeScene(m, shield = false, effect = true) {
  const siege = m.glorianaWeapons.find(w => w.id === m.GLORIANA_WEAPONS.siege);
  const base = structuredClone(m.modManager.requireShip('web_gloriana_p1'));
  const player = {...base, id:'siege-visual-source', sourceHullId:base.id, modules:[], moduleSlots:[],
    fighterWings:[], systemType:'NONE', systemTypes:[], hullMods:[], sMods:[], builtInHullMods:[],
    maxSpeed:0, maxTurnRateDeg:0, maxFlux:100000, fluxDissipation:0,
    weaponSlots:[{slotId:'SIEGE',mountType:'TURRET',slotSize:siege.mountSize,weaponType:'UNIVERSAL',x:0,y:0,baseAngleDeg:0,arcDeg:360,defaultWeaponId:siege.id}],
    defaultWeaponGroups:[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:['SIEGE']}]};
  const enemy = {...structuredClone(m.modManager.requireShip('web_zhuyuan')),
    id:'siege-visual-target', modules:[], moduleSlots:[], fighterWings:[], systemType:'NONE',systemTypes:[],
    hullMods:[],sMods:[],builtInHullMods:[],weaponSlots:[],defaultWeaponGroups:[], maxSpeed:0,maxTurnRateDeg:0};
  const engine = new m.CombatEngine('web_zhuyuan','web_zhuyuan',270927);
  engine.switchPlayerShip(player,enemy);engine.openBattlefield=true;engine.asteroids.length=0;engine.nebulae.length=0;
  const source=engine.playerShip,target=engine.enemyShip;
  source.pos.set(-300,0);source.prevPos.copy(source.pos);source.facingRad=source.prevFacingRad=0;
  source.fireControlMode='MANUAL';source.isFiringMain=false;source.selectedGroupIndex=0;
  // Synchronize the weapon controller after scenario placement; this is not a real hull turn.
  source.weaponControl.update(0,source,0,null,()=>{},()=>{});
  const mount=source.weapons[0];mount.currentAngleRad=0;mount.arcDeg=360;
  if(!effect)mount.spec={...mount.spec,onHitEffect:undefined};
  target.pos.set(430,0);target.prevPos.copy(target.pos);target.facingRad=target.prevFacingRad=Math.PI;
  target.fireControlMode='MANUAL';target.shield.isActive=shield;target.shield.currentArcDeg=shield?360:0;
  target.shield.facingAngleRad=Math.PI;target.aimTargetWorld.copy(source.pos);source.aimTargetWorld.copy(target.pos);
  // A stationary test target must not raise/lower its shield in response to the shot.
  engine.enemyAI.update=()=>{};source.isFiringMain=true;
  let fired=false;
  const step=()=>{engine.fixedUpdate(1/120);if(engine.projectiles.length){fired=true;source.isFiringMain=false;}};
  return {engine,source,target,mount,step,get fired(){return fired;}};
}
