import {onePassReference} from './one-pass-reference.mjs';
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
export const nativeApplyPlugin={name:'native-apply-test',setup(build){
 build.onResolve({filter:/^native-apply-(candidate|control)$/},args=>({path:args.path,namespace:'native-apply'}));
 build.onLoad({filter:/.*/,namespace:'native-apply'},args=>({contents:args.path.endsWith('control')?onePassReference('combat'):nativeApplyCandidate(fs.readFileSync('src/network/CombatSnapshot.ts','utf8')),loader:'ts',resolveDir:path.resolve('src/network')}));
}};
