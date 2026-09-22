import fs from 'node:fs';
import path from 'node:path';
/** TEST-ONLY longitudinal replacement until complete-pipeline gates pass. */
export function entityCandidate(code) {
  const replace=(from,to)=>{if(code.split(from).length!==2)throw Error('Missing unique entity anchor: '+from);code=code.replace(from,()=>to);};
  code="import {NativeProjectileCapsules, ProjectileCapsuleReceiver, restoreEntityValue} from './ProjectileEntityCapsule';\n"+code;
  replace('const WORLD_KEYS = [', `const entityPublishers = new WeakMap<CombatEngine, NativeProjectileCapsules>();
const entityReceivers = new WeakMap<CombatEngine, ProjectileCapsuleReceiver>();
const WORLD_KEYS = [`);
  replace('  const world: Record<string, unknown> = {};',`  let capsule = null;
  if (nativeCapture && compactProjectiles) {
    let source = entityPublishers.get(engine);
    if (!source) { source = new NativeProjectileCapsules(SKIP, key => omitCapturedField(CaptureProjection.Projectile, key)); entityPublishers.set(engine, source); }
    capsule = source.capture(engine.projectiles, tick, () => captureProjectileProjection(engine));
  }
  const world: Record<string, unknown> = {};`);
  replace('world[k] = engine[k];','world[k] = k === "projectiles" && capsule ? [] : engine[k];');
  replace('  const projectedWorld = project(world, CaptureProjection.World);','  const projectedWorld = project(world, CaptureProjection.World);\n  if (capsule) projectedWorld.projectiles = { $projectileEntityCapsule: capsule };');
  replace('  const previousTick = displayTicks.get(engine);', `  let entityRows: Record<string, any>[] | null = null;
  if (frame.world?.projectiles && Object.hasOwn(frame.world.projectiles, '$projectileEntityCapsule')) {
    if (Object.keys(frame.world.projectiles).length !== 1) throw Error('Invalid entity wrapper');
    let receiver = entityReceivers.get(engine);
    if (!receiver || resetInterpolation) { receiver = new ProjectileCapsuleReceiver(); entityReceivers.set(engine, receiver); }
    entityRows = receiver.decode(frame.world.projectiles.$projectileEntityCapsule, frame.tick);
  }
  const previousTick = displayTicks.get(engine);`);
  replace('  // Only permit presentation fields, never methods or subsystem ownership from the wire.', `  if (entityRows) {
    const old = new Map(engine.projectiles.map(p => [p.id, p]));
    engine.projectiles = entityRows.map(row => nativeTargeting ? restoreEntityValue(row, old.get(row.id)) : unpack(row, old.get(row.id), ships, layouts));
  }
  // Only permit presentation fields, never methods or subsystem ownership from the wire.`);
  replace('    if (Object.hasOwn(frame.world, key))','    if (Object.hasOwn(frame.world, key) && !(key === "projectiles" && entityRows))');
  return code;
}
export const entityCodecPlugin={name:'entity-candidate',setup(build){
  build.onResolve({filter:/^entity-candidate$/},()=>({path:'candidate',namespace:'entity-candidate'}));
  build.onLoad({filter:/.*/,namespace:'entity-candidate'},()=>({contents:entityCandidate(fs.readFileSync('src/network/CombatSnapshot.ts','utf8')),loader:'ts',resolveDir:path.resolve('src/network')}));
}};
