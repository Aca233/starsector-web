import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {receiverFieldsReference} from './receiver-fields-reference.mjs';import {receiverFieldsExperiment} from './receiver-fields-experiment.mjs';
export function receiverFieldsPlugin(){
 const sources=new Map(process.env.RECEIVER_FIELDS_FROZEN?JSON.parse(fs.readFileSync(process.env.RECEIVER_FIELDS_FROZEN,'utf8')).files.map(row=>{if(createHash('sha256').update(row.code).digest('hex')!==row.sha256)throw Error('Frozen checksum '+row.file);return[path.resolve(row.file).toLowerCase(),row.code];}):[]);
 return {name:'receiver-fields-comparison',setup(build){
  build.onResolve({filter:/^\.\/NativeRecordRead\.generated$/},()=>({path:path.resolve('scripts/lib/native-record-readers-experiment.generated.ts')}));
  build.onResolve({filter:/^direct-particle-recipe$/},()=>({path:'direct-particle-recipe',namespace:'direct-particle-recipe'}));
  build.onLoad({filter:/.*/,namespace:'direct-particle-recipe'},()=>({contents:fs.readFileSync(process.env.DIRECT_PARTICLE_RECIPE_SOURCE,'utf8'),loader:'ts',resolveDir:path.resolve('src/engine/visual')}));
  build.onResolve({filter:/^capture-sink-codec$/},()=>({path:'capture-sink-codec',namespace:'capture-sink-codec'}));
  build.onLoad({filter:/.*/,namespace:'capture-sink-codec'},()=>({contents:fs.readFileSync(process.env.CAPTURE_SINK_CODEC_SOURCE,'utf8'),loader:'js',resolveDir:path.resolve('src/network')}));
  build.onResolve({filter:/^numeric-block-codec$/},()=>({path:'numeric-block-codec',namespace:'numeric-block-codec'}));
  build.onLoad({filter:/.*/,namespace:'numeric-block-codec'},()=>({contents:fs.readFileSync(process.env.NUMERIC_BLOCK_CODEC_SOURCE,'utf8'),loader:'js',resolveDir:path.resolve('src/network')}));
  build.onResolve({filter:/^receiver-fields-(control|candidate)$/},args=>({path:args.path,namespace:'receiver-fields'}));
  build.onLoad({filter:/.*/,namespace:'receiver-fields'},args=>({contents:args.path.endsWith('control')?(process.env.RECEIVER_FIELDS_CONTROL_SOURCE?fs.readFileSync(process.env.RECEIVER_FIELDS_CONTROL_SOURCE,'utf8'):receiverFieldsReference):process.env.RECEIVER_FIELDS_SOURCE?fs.readFileSync(process.env.RECEIVER_FIELDS_SOURCE,'utf8'):receiverFieldsExperiment,loader:'ts',resolveDir:path.resolve('src/network')}));
  build.onLoad({filter:/\.[cm]?[jt]sx?$/},args=>{const code=sources.get(args.path.toLowerCase());if(code===undefined)return;return {contents:code,loader:args.path.endsWith('tsx')?'tsx':/\.m?ts$/.test(args.path)?'ts':'js',resolveDir:path.dirname(args.path)};});
 }};
}
