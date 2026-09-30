import type { WeaponSpec } from '../simulation/Weapon';
import { originalWeapon } from './OriginalDefaults';
import { ADUN_FX } from '../visual/AdunFXAssets';
import { ADUN_ARK_ART } from './AdunArkIds';
import art from './adun-ark-weapons-painted.json';
export const ARK_WEAPONS={lance:'web_ark_solar_lance',disruptor:'web_ark_phase_battery',ion:'web_ark_ion_battery',prism:'web_ark_guard_prism',air:'web_ark_air_prism',bomb:'web_ark_air_capacitor'} as const;
const W=ARK_WEAPONS;
function gun(id:string,size:'S'|'M'|'L'|undefined,beam:boolean,rules:Partial<WeaponSpec>):WeaponSpec {
 const a=size&&art[size].head;
 return {...originalWeapon(beam?'beam':'energy'),id,nameKey:'weapon.'+id+'.name',tags:['web_adun_ark'],color:[80,185,255],fringeColor:[40,140,255,235],coreColor:[225,250,255,255],glowColor:[90,190,255,190],minSpread:0,maxSpread:0,spreadPerShot:0,
 ...(a?{displayIconUrl:ADUN_ARK_ART+art[size!].icon,turretSpriteUrl:ADUN_ARK_ART+a.file,hardpointSpriteUrl:ADUN_ARK_ART+a.file,spriteWidth:a.width,spriteHeight:a.height,spritePivotX:a.pivotX,spritePivotY:a.pivotY,turretOffsets:a.offsets,hardpointOffsets:a.offsets}:{}),
 ...(beam?{}:{projSpriteUrl:ADUN_FX.lance}),...rules};
}
export const arkWeapons:WeaponSpec[]=[
 // The XL emitter is native hull geometry, not a generic turret glued onto it.
 gun(W.lance,undefined,false,{displayIconUrl:ADUN_ARK_ART+'solar-lance-detail-v12.png',mountSize:'EXTRA_LARGE',hardpointUsesHullSprite:true,ordnancePointCost:64,weaponType:'ENERGY',type:'ENERGY',damagePerShot:6800,damagePerSecond:6800/6.5,fluxPerShot:6200,range:3800,passThroughMissiles:true,passThroughFighters:true,passThroughFightersOnlyWhenDestroyed:true,terrainPenetration:{maxRadius:180,minDamageCost:300,wreckDamagePerRadius:6},chargeTime:1.5,refireDelay:5,turnRateDegPerSec:0,maxAmmo:3,ammoRegenPerSec:.1,autoCharge:true,interruptibleBurst:false,turretOffsets:[24.82,0],hardpointOffsets:[24.82,0],fadeTime:.55,projSpeed:2000,projRadius:18,projLength:160,projWidth:30,visualSpawnType:'BALLISTIC_AS_BEAM',hitGlowRadius:110}),
 gun(W.disruptor,'L',false,{mountSize:'LARGE',ordnancePointCost:32,weaponType:'ENERGY',type:'HIGH_EXPLOSIVE',damagePerShot:1600,damagePerSecond:3200/3,fluxPerShot:1350,range:3200,passThroughMissiles:true,passThroughFighters:true,passThroughFightersOnlyWhenDestroyed:true,chargeTime:.35,burstSize:2,burstDelay:.2,refireDelay:2.45,turnRateDegPerSec:22,projSpeed:1250,projRadius:11,projLength:48,projWidth:18,hitGlowRadius:64}),
 gun(W.ion,'M',false,{mountSize:'MEDIUM',ordnancePointCost:16,weaponType:'ENERGY',type:'KINETIC',damagePerShot:300,damagePerSecond:900/1.5,fluxPerShot:245,range:2800,burstSize:3,burstDelay:.12,refireDelay:1.26,turnRateDegPerSec:55,projSpeed:1700,projRadius:5,projLength:40,projWidth:8,visualSpawnType:'BALLISTIC_AS_BEAM',hitGlowRadius:30}),
 gun(W.prism,'S',true,{mountSize:'SMALL',ordnancePointCost:6,weaponType:'ENERGY',type:'ENERGY',isPointDefense:true,aiHints:['PD'],range:1050,damagePerSecond:230,fluxPerSecond:150,beamWidth:5,beamSpeed:5000,turnRateDegPerSec:200,hitGlowRadius:18}),
 gun(W.air,undefined,true,{textureType:'SMOOTH',textureScrollSpeed:64,pixelsPerTexel:3,hitGlowRadius:5,weaponType:'ENERGY',isPointDefense:true,aiHints:['PD'],range:550,damagePerSecond:90,fluxPerSecond:30,beamWidth:2.5,beamSpeed:5000,turnRateDegPerSec:150}),
 gun(W.bomb,undefined,false,{hardpointUsesHullSprite:true,projSpriteUrl:'/game-assets/graphics/fx/torpedoray32.png',aiHints:['STRIKE'],weaponType:'ENERGY',type:'HIGH_EXPLOSIVE',range:900,damagePerShot:1400,damagePerSecond:1400,fluxPerShot:80,maxAmmo:2,ammoRegenPerSec:0,refireDelay:.75,chargeTime:.2,projSpeed:1100,projRadius:7,projLength:28,projWidth:28,hitGlowRadius:20}),
];
const info:[string,string,number,string][]=[
 [W.lance,'太阳长矛 · 舰艏投射器',64,'内置XL固定投射器。1.5秒蓄能，6800能量/6200载荷，射程3800。3发电容、每10秒恢复1发；只向舰首发射，先对准再开火。不是炮塔；无法换装。可贯穿导弹和被击毁战机；击碎小行星或穿过小块残骸会消耗剩余能量，大块残骸、未击毁舰体和正常护盾仍可阻挡。'],
 [W.disruptor,'裂解双联阵列',32,'大型转动炮头，3200射程，双发各1600高爆/1350载荷。用离子炮压盾后集中破甲；有限外侧射界。'],
 [W.ion,'离子脉冲阵列',16,'中型转动炮头，2800射程，三连发各300动能/245载荷。制造硬载荷，为主炮和裂解炮创造破甲窗口。'],
 [W.prism,'折光近防棱镜',6,'小型转动近防，1050射程、230能量DPS。优先导弹/战机；无法替代对舰主炮。'],
 [W.air,'无人机折光束',0,'双侧翼尖的细束折光投射器。每束90能量DPS，优先截击导弹/战机；光束从蓝色翼尖发射，不是旋转炮塔。'],[W.bomb,'无人机等离子电容',0,'重型双体机的固定前向投射器，0.2秒炮口蓄能后释放短促等离子团。每发1400高爆、每架四发；耗尽返航重装。']];
export const arkArmoryRefit={weapons:Object.fromEntries(info.map(([id,name,op,description])=>[id,{name,op,description,manufacturer:'星灵 · Web方舟改编',builtInOnly:[W.lance,W.air,W.bomb].includes(id as typeof W.lance)}])),weaponStatus:Object.fromEntries(info.map(([id])=>[id,{level:'supported',reasons:['四档同档；三维实模炮头/真实枢轴，二维运行。']}]))};
export const arkArmoryStrings={zh_CN:Object.fromEntries(info.map(([id,name])=>['weapon.'+id+'.name',name])),en_US:Object.fromEntries(info.map(([id,name])=>['weapon.'+id+'.name',name]))};
