import {build} from 'esbuild';
import {componentWriteEsbuildPlugin} from './component-write-transform.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const referenceRoot=process.env.DISPLAY_RESTORE_BASELINE;
const definitionBaseline=process.env.DISPLAY_DEFINITION_BASELINE;
// Optional frozen source comparison inside this existing scenario bundle. All
// other classes stay shared, especially Vector2/PackedSnapshotNumbers identity.
const displayControl={name:'display-restore-control',setup(build){
 build.onResolve({filter:/^display-definition-control$/},()=>definitionBaseline
  ?{path:path.resolve(definitionBaseline),namespace:'definition-control'}
  :{path:path.resolve('src/network/display/DisplayDefinition.ts')});
 build.onLoad({filter:/.*/,namespace:'definition-control'},async args=>({contents:await fs.readFile(args.path,'utf8'),loader:'ts',resolveDir:path.resolve('src/network/display')}));
 build.onResolve({filter:/^display-(snapshot|codec)-control$/},args=>{
  const file=args.path==='display-snapshot-control'?'LanDisplaySnapshot.ts':'DisplaySnapshotCodec.ts';
  return referenceRoot?{path:path.resolve(referenceRoot,file),namespace:'display-control'}:{path:path.resolve('src/network',file)};
 });
 build.onResolve({filter:/^[.][/]DisplaySnapshotCodec$/,namespace:'display-control'},()=>({path:path.resolve(referenceRoot,'DisplaySnapshotCodec.ts'),namespace:'display-control'}));
 build.onLoad({filter:/.*/,namespace:'display-control'},async args=>({contents:await fs.readFile(args.path,'utf8'),loader:'ts',resolveDir:path.resolve('src/network')}));
}};
const outfile=path.resolve(process.env.NATIVE_CAPTURE_CHECK_OUT??'artifacts/guest-hz-20260920/check-native-capture.mjs');
await build({plugins:[componentWriteEsbuildPlugin(),displayControl],entryPoints:['scripts/check-native-capture.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{__LAN_BUILD_ID__:'"native-capture-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
