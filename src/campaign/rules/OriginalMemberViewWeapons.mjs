/** CampaignFleetMemberView.renderWeapons: campaign-specific order, not combat animation. */
import {requireThat} from '../core/Values.mjs';
import {ORIGINAL_FLEET_VIEW_INPUTS as R,originalMemberViewHull,createOriginalMemberViewSprite} from './OriginalMemberViewResources.mjs';
import {originalMemberViewSlotPosition} from './OriginalMemberViewModules.mjs';
import {originalFleetDrawSprite} from './OriginalFleetDraw.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_MEMBER_WEAPONS',m);
export function renderOriginalMemberViewWeapons(view,frame,position,alpha,services={},force=false){
 const member=view.member,slots=originalMemberViewHull(member.variant.hullId,services).slots,scale=view.scaleMult;
 for(const [id,weaponId]of member.variant.weapons){const slot=slots.find(s=>s.id===id);check(slot,'Fitted slot missing on actual hull: '+id);if(slot.type!=='DECORATIVE'&&!force)continue;
  const weapon=services.readMemberViewWeapon?services.readMemberViewWeapon(weaponId):R.weapons[weaponId];check(weapon&&typeof weapon.then!=='function','Actual weapon visual specification required: '+weaponId);if(weapon.hints.includes('NEVER_RENDER_IN_CAMPAIGN'))continue;
  const relative=originalMemberViewSlotPosition(slot,view.facing),at=[f(position[0]+f(relative[0]*scale)),f(position[1]+f(relative[1]*scale))],additive=weapon.hints.includes('RENDER_ADDITIVE'),angle=f(f(view.facing+slot.angle)-90);
  const draw=(path,pass,center=null,drawAngle=angle,drawPosition=at)=>{if(!path)return;const s=createOriginalMemberViewSprite(path,services);s.width=f(s.width*scale);s.height=f(s.height*scale);s.centerX=center===null?f(s.width/2):f(center[0]*scale);s.centerY=center===null?f(s.height/(slot.mount==='HARDPOINT'?4:2)):f(center[1]*scale);s.blendDest=additive?1:771;s.alphaMult=alpha;s.angle=drawAngle;originalFleetDrawSprite(frame,pass,s,drawPosition);};
  check(['HARDPOINT','TURRET','HIDDEN'].includes(slot.mount),'Actual native weapon mount required');
  if(slot.mount!=='HIDDEN')draw(slot.mount==='TURRET'?weapon.turretSprite:weapon.hardpointSprite,'weapon-base');
  if(weapon.specClass==='beam')continue;
  check(['projectile','pulse'].includes(weapon.specClass),'Actual projectile weapon class required');
  if(slot.mount!=='HIDDEN')draw(slot.mount==='TURRET'?weapon.turretGunSprite:weapon.hardpointGunSprite,'weapon-barrel');
  const loaded=weapon.hints.includes('RENDER_LOADED_MISSILES')||(slot.mount!=='HIDDEN'&&weapon.hints.includes('RENDER_LOADED_MISSILES_UNLESS_HIDDEN'));if(!loaded)continue;check(weapon.missile,'Loaded-missile hint needs actual missile HullSpec');
  // Native hidden mounts count hardpoint barrels, but fetch half-turret offsets and turret angles.
  const count=(slot.mount==='TURRET'?weapon.turretOffsets:weapon.hardpointOffsets).length;
  for(let i=0;i<count;i++){const offset=(slot.mount==='HARDPOINT'?weapon.hardpointOffsets:weapon.turretOffsets)[i],extra=(slot.mount==='HARDPOINT'?weapon.hardpointAngles:weapon.turretAngles)[i];check(offset&&Number.isFinite(extra),'Actual loaded missile barrel offset required');const local=slot.mount==='HIDDEN'?offset.map(n=>f(n*.5)):offset,face=f(f(view.facing+slot.angle)+extra),r=face/180*Math.PI,c=f(Math.cos(r)),s=f(Math.sin(r)),x=f(f(local[0]*c)-f(local[1]*s)),y=f(f(local[0]*s)+f(local[1]*c));draw(weapon.missile.path,'weapon-loaded-missile',weapon.missile.center,f(face-90),[f(at[0]+f(x*scale)),f(at[1]+f(y*scale))]);}
 }
}
