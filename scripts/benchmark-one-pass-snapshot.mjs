import {onePassReference} from './lib/one-pass-reference.mjs';
import {nativeApplyPlugin} from './lib/native-apply-candidate.mjs';
import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';import {onePassPlugin,control} from './lib/one-pass-candidate.mjs';
const out=path.resolve(process.env.ONEPASS_OUT??'artifacts/network-stream-20260921/phase32/benchmark');fs.mkdirSync(out,{recursive:true});const outfile=path.join(out,'benchmark.mjs');
const captureBaseline=process.env.CAPTURE_BASELINE;
if(!process.env.RESTORE_BASELINE && !process.env.DAMAGE_VIEW_BASELINE && !captureBaseline && control(fs.readFileSync('src/network/BinarySnapshot.mjs','utf8'))!==onePassReference('binary'))throw Error('Control is not frozen original');
const parserPlugin=process.env.RESTORE_BASELINE || process.env.DAMAGE_VIEW_BASELINE || captureBaseline ? {name:'same-current-parser',setup(build){build.onResolve({filter:/^onepass-(control|candidate)$/},()=>({path:path.resolve('src/network/BinarySnapshot.mjs')}));}} : onePassPlugin;
const damagePlugin={name:'frozen-capture-comparison',setup(build){
 build.onResolve({filter:/^native-apply-(control|candidate)$/},args=>args.path.endsWith('control')?{path:'damage-control',namespace:'damage-control'}:{path:path.resolve('src/network/AuthorityCombatSnapshot.ts')});
 build.onLoad({filter:/.*/,namespace:'damage-control'},()=>({contents:fs.readFileSync(path.join(captureBaseline??process.env.DAMAGE_VIEW_BASELINE,'src__network__CombatSnapshot.ts.control.txt'),'utf8'),loader:'ts',resolveDir:path.resolve('src/network')}));
}};
const r=await build({entryPoints:['scripts/benchmark-one-pass-snapshot.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[parserPlugin,process.env.DAMAGE_VIEW_BASELINE||captureBaseline?damagePlugin:nativeApplyPlugin],metafile:true,define:{__LAN_BUILD_ID__:'"one-pass-benchmark"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
if(Object.keys(r.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)))throw Error('Campaign import');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');const inputs=Object.keys(r.metafile.inputs).filter(p=>fs.existsSync(p)).map(p=>({file:p,sha256:sha(p)}));
fs.writeFileSync(path.join(out,'source.json'),JSON.stringify({bundleSha256:sha(outfile),inputs,captureBaseline:captureBaseline?sha(path.join(captureBaseline,'src__network__CombatSnapshot.ts.control.txt')):undefined,damageBaseline:process.env.DAMAGE_VIEW_BASELINE?sha(path.join(process.env.DAMAGE_VIEW_BASELINE,'src__network__CombatSnapshot.ts.control.txt')):undefined,baseline:process.env.RESTORE_BASELINE?Object.fromEntries(['src__network__CombatSnapshot.ts','src__network__NativeRecordRestore.generated.ts','src__network__ExplosionPuffCodec.ts','src__engine__visual__DynamicParticleRecipe.ts'].map(name=>{const file=path.resolve(process.env.RESTORE_BASELINE,name+'.control.txt');return [file,sha(file)];})):undefined},null,2));
await import(pathToFileURL(outfile).href);
