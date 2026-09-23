import fs from 'node:fs';import path from 'node:path';
export function nativeApplyCandidate(source){
 const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Missing native apply anchor '+from);source=source.replace(from,()=>to);};
 if(source.includes('nativeProjection?: boolean;'))return source;
 replace('interface DecodeLayouts {', 'interface DecodeLayouts { nativeProjection?: boolean;');
 replace('  nativeTargeting?: boolean;',`  nativeTargeting?: boolean;
  /** Locally owned non-Proxy engine + ordinary decoded DTO frames only. No
   * custom accessors on either graph. Generic/mod callers must leave false. */
  nativeProjection?: boolean;`);
 replace('restoreCombatSnapshot(engine, frame, resetInterpolation, options?.nativeTargeting === true);','restoreCombatSnapshot(engine, frame, resetInterpolation, options?.nativeTargeting === true, options?.nativeProjection === true);');
 replace('  nativeTargeting: boolean,','  nativeTargeting: boolean,\n  nativeProjection = false,');
 replace('  const layouts = snapshotLayouts(frame.layouts, puffDecoder, particleDecoder);','  const layouts = snapshotLayouts(frame.layouts, puffDecoder, particleDecoder);\n  layouts.nativeProjection = nativeProjection;');
 replace('  for (const [k, v] of Object.entries(value)) {',`  // Network DTOs have no getters/Proxies. Avoid a temporary [key,value]
  // allocation per field; still restore EVERY retained field against the live
  // target. Arbitrary callers keep Object.entries and its eager read ordering.
  if (layouts.nativeProjection) {
    for (const k of Object.keys(value)) {
      if (SKIP.has(k)) continue;
      const v = value[k], previous = output[k];
      if (depth >= 64) throw Error("Snapshot nesting exceeds limit");
      output[k] = v === null || typeof v !== 'object' ? v : unpack(v, previous, ships, layouts, depth + 1);
    }
    return output;
  }
  for (const [k, v] of Object.entries(value)) {`);
 return source;
}
// Compare current API/callback semantics against its conservative expand+unpack
// path. The historical Phase32 codec predates component callbacks and readonly
// scalar restoration and is not an oracle for those newer contracts.
export function nativeApplyControl(source) {
 const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Missing unique native restore reference anchor: '+from);source=source.replace(from,()=>to);};
 replace('  if (nativeProjection) {\n    layouts.nativeRecords = new Map();','  if (false) {\n    layouts.nativeRecords = new Map();');
 replace('        if (layouts.nativeProjection) {\n          output[i] = layouts.particleDecoder.restoreInto','        if (false) {\n          output[i] = layouts.particleDecoder.restoreInto');
 replace('    if (layouts.nativeProjection) return layouts.puffDecoder.restoreInto','    if (false) return layouts.puffDecoder.restoreInto');
 replace('  const restorers = layouts.nativeProjection ? plan.templates.map','  const restorers = false ? plan.templates.map');
 return source;
}
export const nativeApplyPlugin={name:'native-apply-test',setup(build){
 const baseline=process.env.RESTORE_BASELINE;
 if(baseline){
  const frozen=new Set(['src/network/CombatSnapshot.ts','src/network/NativeRecordRestore.generated.ts','src/network/ExplosionPuffCodec.ts','src/engine/visual/DynamicParticleRecipe.ts']);
  build.onResolve({filter:/^native-apply-control$/},()=>({path:path.resolve('src/network/CombatSnapshot.ts'),namespace:'frozen-restore'}));
  build.onResolve({filter:/^\./,namespace:'frozen-restore'},args=>{
   const file=path.resolve(args.resolveDir,args.path)+(path.extname(args.path)==='.ts'?'':'.ts');
   if(frozen.has(path.relative(process.cwd(),file).replaceAll(path.sep,'/')))return {path:file,namespace:'frozen-restore'};
  });
  build.onLoad({filter:/.*/,namespace:'frozen-restore'},args=>{
   const file=path.relative(process.cwd(),args.path).replaceAll(path.sep,'__')+'.control.txt';
   return {contents:fs.readFileSync(path.resolve(baseline,file),'utf8'),loader:'ts',resolveDir:path.dirname(args.path)};
  });
 }

 build.onResolve({filter:/^native-apply-(candidate|control)$/},args=>({path:args.path,namespace:'native-apply'}));
 build.onLoad({filter:/.*/,namespace:'native-apply'},args=>({contents:(args.path.endsWith('control')?nativeApplyControl:nativeApplyCandidate)(fs.readFileSync('src/network/AuthorityCombatSnapshot.ts','utf8')),loader:'ts',resolveDir:path.resolve('src/network')}));
}};
