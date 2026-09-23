/** Render-only field boundary for WebGLProjectilePass, MissileEngineVisuals and
 * MissileContrails and passive missile identification. NOT a simulation,
 * targeting-decision or mine-FX snapshot. No authority
 * object is written, no hit inferred, no ID/position precision lost here.
 * Keys include source-tail advance inputs for bounded presentation later.
 */
export const PROJECTILE_VISUAL_FIELDS = Object.freeze((
 'id specId teamId isPlayer renderTargetIndicator pos vel ballisticTail facingRad turnVelocityRad angularVelocityRad elapsedTime '
 + 'fadeProgress didDamage sourceMoveSpeed sourceVelocity rangeRemaining fadeTime '
 + 'color radius spawnType visualSpawnType textureType textureScrollSpeed pixelsPerTexel '
 + 'fringeColor coreColor glowColor glowRadius coreWidthMult movingRayMoveSpeed '
 + 'projSpriteUrl projLength projWidth isRocket isMine isFlare spriteAlphaOverride collisionDisabled isDisarmed '
 + 'hitpoints flightTimeRemaining missileFizzleTime missileEngineVisualSpec missileLifecycleSpec '
 + 'engineFlameColor missileTrailSpec flareBehavior flareFizzling flareLife'
).split(' '));
// Input is an already-detached declarative capture row. The event encoder
// validates and owns it before retaining a revision. Do not pass a native engine
// object: Vector2/undefined/reference semantics belong to CombatSnapshot.
export function projectProjectileVisual(row) {
 if(!row || typeof row!=='object' || Array.isArray(row) || !Number.isFinite(row.id) || typeof row.specId!=='string')throw Error('Invalid projectile visual row');
 const out={};for(const key of PROJECTILE_VISUAL_FIELDS)if(Object.hasOwn(row,key))out[key]=row[key];return out;
}
// Optional DISPLAY quantization, never valid as a simulation/complete-world
// projection: <=1/128 world-unit position/velocity error; <=1/131072 radians or
// seconds for angles/clocks. IDs, booleans, colors, specs and hit flags unchanged.
// Pure powers of two bound the error and make low float mantissa bits compressible.
export function quantizeProjectileVisual(row) {
 const out=projectProjectileVisual(row);
 const grid=(v,scale)=>{
  if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v*scale)>Number.MAX_SAFE_INTEGER)return v;
  return Math.round(v*scale)/scale;
 };
 for(const key of ['pos','vel','ballisticTail','sourceVelocity']){
  const value=out[key];if(value&&Object.keys(value).length===1&&Array.isArray(value.$vector)&&value.$vector.length===2)out[key]={$vector:value.$vector.map(v=>grid(v,64))};
 }
 for(const key of ['facingRad','turnVelocityRad','angularVelocityRad','elapsedTime','fadeProgress','flightTimeRemaining','missileFizzleTime','flareLife'])if(Object.hasOwn(out,key))out[key]=grid(out[key],65536);
 if(Object.hasOwn(out,'rangeRemaining'))out.rangeRemaining=grid(out.rangeRemaining,64);
 return out;
}
