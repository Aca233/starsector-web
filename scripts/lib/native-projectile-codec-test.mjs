import fs from 'node:fs';
// Rejected Phase30 capture/restore experiment. Injected into TEST bundles only;
// production CombatSnapshot has no branch, options or per-field overhead.
const additions = [
  [
    "interface DecodeLayouts { keys:",
    "interface DecodeLayouts { nativeProjectiles?: boolean; keys:"
  ],
  [
    "particleDecoder: DynamicParticleDecoder): DecodeLayouts",
    "particleDecoder: DynamicParticleDecoder, nativeProjectiles = false): DecodeLayouts"
  ],
  [
    "return { keys: value, puffDecoder,",
    "return { nativeProjectiles, keys: value, puffDecoder,"
  ],
  [
    "    if (nativeArray && Object.getPrototypeOf(value) === Array.prototype &&",
    "    const direct = nativeProjectileCaptureEnabled && capturePlansEnabled && nativeArray && nativeMembers\n      && projection === CaptureProjection.Projectiles && layouts.compactProjectiles\n      && !Object.hasOwn(value, 'constructor') && value.map === captureArrayMap && value.constructor === Array && Array[Symbol.species] === Array\n      ? captureNativeProjectileColumns(value, {\n        keys: row => nativeCaptureShape(row, Object.keys(row), CaptureProjection.Projectile)?.keys ?? null,\n        row: row => pack(row, seen, refs, layouts, false, CaptureProjection.Projectile),\n        compact: rows => compactProjectileColumns(rows, layouts.keys),\n        field: (field, owner) => {\n          seen.push(owner);\n          try { return pack(field, seen, refs, layouts); } finally { seen.pop(); }\n        },\n      }) : null;\n    if (direct) rows = direct.rows;\n    else if (nativeArray && Object.getPrototypeOf(value) === Array.prototype &&"
  ],
  [
    "const columns = projection ===",
    "const columns = direct ? direct.columns : projection ==="
  ],
  [
    "  const plan = projectileColumnPlan(value, layouts.keys);\n",
    "  const plan = projectileColumnPlan(value, layouts.keys);\n  const fixedBudget = { remaining: 8192 };\n  const fixed = layouts.nativeProjectiles ? plan.templates.map(t => t.keys.map((_, col) =>\n    !t.dynamic[col] && t.fixed[col] !== null && typeof t.fixed[col] === 'object'\n      ? compileProjectileFixed(t.fixed[col], layouts.keys, SKIP, 2, fixedBudget) : null)) : null;\n"
  ],
  [
    "      record[key] = item === null",
    "      const compiled = fixed?.[row[0]][col];\n      record[key] = compiled ? restoreProjectileFixed(compiled, prior) : item === null"
  ],
  [
    "export interface CombatSnapshotBatchOptions {",
    "export interface CombatSnapshotBatchOptions {\n  /** Native viewer AND parsed, plain non-Proxy frame. Restore every field; only\n   * repeated fixed-template interpretation is shared. Generic callers omit. */\n  nativeProjectiles?: boolean;"
  ],
  [
    "options?.nativeTargeting === true);",
    "options?.nativeTargeting === true, options?.nativeProjectiles === true);"
  ],
  [
    "  nativeTargeting: boolean,",
    "  nativeTargeting: boolean,\n  nativeProjectiles = false,"
  ],
  [
    "snapshotLayouts(frame.layouts, puffDecoder, particleDecoder)",
    "snapshotLayouts(frame.layouts, puffDecoder, particleDecoder, nativeProjectiles)"
  ]
];
const extra = "\nexport function projectileSliceForTest(engine:CombatEngine,tick:number) {\n const refs=new Map(engine.ships.map(s=>[s.id,s])),layouts=new SnapshotLayouts(true,true,true,true);\n const projectiles=pack(engine.projectiles,[],refs,layouts,false,CaptureProjection.Projectiles);\n return {tick,ships:[],crafts:[],craftSpecs:[],acknowledged:{},simulationMs:0,layouts:layouts.keys,world:{projectiles}};\n}\n";
function candidate(code) {
 for (const [original, added] of additions) {
  if (code.split(original).length !== 2) throw Error('Missing capture experiment anchor: '+original);
  code = code.replace(original, () => added);
 }
 return "import { compileProjectileFixed, restoreProjectileFixed } from './ProjectileFixedRestore';\nimport { captureNativeProjectileColumns } from './NativeProjectileCapture';\n" + 'const nativeProjectileCaptureEnabled = true;\n' + code;
}
export const nativeProjectileCodecPlugin={name:'native-projectile-codec-test',setup(build){
 build.onResolve({filter:/^projectiles-reference$/},()=>({path:'reference',namespace:'projectiles-reference'}));
 build.onLoad({filter:/.*/,namespace:'projectiles-reference'},()=>({contents:fs.readFileSync('src/network/AuthorityCombatSnapshot.ts','utf8')+extra,loader:'ts',resolveDir:process.cwd()+'/src/network'}));
 build.onLoad({filter:/[\\/]CombatSnapshot\.ts$/},args=>({contents:candidate(fs.readFileSync(args.path,'utf8'))+extra,loader:'ts'}));
}};
