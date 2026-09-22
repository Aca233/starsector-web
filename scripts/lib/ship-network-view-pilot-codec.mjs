// Test-only access to the current P1 codec. No application source is rewritten.
import fs from 'node:fs';
export const shipPilotCodecPlugin = {
 name:'ship-pilot-codec',setup(build){build.onLoad({filter:/[\\/]CombatSnapshot\.ts$/},args=>{
  const source=fs.readFileSync(args.path,'utf8');
  return{loader:'ts',contents:source+String.raw`
/** Test adapter: the same P1 pack/unpack, restricted to registered native ships.
 * Remainder shadow construction is intentional and included in candidate cost. */
export function pilotCaptureShips(engine: CombatEngine, selected: Ship[], tick: number,
 omitRoot?: ReadonlySet<string>, omitFlux?: ReadonlySet<string>) {
 const refs = new Map(engine.ships.map(s => [s.id,s]));
 const layouts = new SnapshotLayouts(true,true,true,true);
 const ships = selected.map(ship => {
  let source = ship;
  if (omitRoot) {
   source = Object.assign(Object.create(Object.getPrototypeOf(ship)),ship);
   for (const key of omitRoot) delete (source as any)[key];
   source.flux = Object.assign(Object.create(Object.getPrototypeOf(ship.flux)),ship.flux);
   for (const key of omitFlux ?? []) delete (source.flux as any)[key];
  }
  return {id:ship.id,state:pack(source,[],refs,layouts,true,CaptureProjection.Ship)};
 });
 return {tick,ships,layouts:layouts.keys,world:{},crafts:[],craftSpecs:[],acknowledged:{},simulationMs:0};
}
export function pilotApplyShips(engine: CombatEngine, frame: any, first: boolean, applyFields?: () => void) {
 let pd=puffDecoders.get(engine);if(!pd){pd=new ExplosionPuffDecoder();puffDecoders.set(engine,pd);}
 let dd=particleDecoders.get(engine);if(!dd){dd=new DynamicParticleDecoder();particleDecoders.set(engine,dd);}
 const layouts=snapshotLayouts(frame.layouts,pd,dd),ships=new Map(engine.ships.map(s=>[s.id,s]));
 const poses=frame.ships.map((row:any)=>{const s=ships.get(row.id);if(!s)throw Error('Unknown pilot ship');return {s,pos:s.pos.clone(),angle:s.facingRad,teleport:s.teleportSequence};});
 for(const row of frame.ships)unpack(row.state,ships.get(row.id),ships,layouts);
 applyFields?.();
 for(const {s,pos,angle,teleport} of poses){const snap=first||s.teleportSequence!==teleport;s.prevPos=snap?s.pos.clone():pos;s.prevFacingRad=snap?s.facingRad:angle;}
}
`};});}
};
