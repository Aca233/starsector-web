// Paired capture probe: both captures read the SAME frozen native engine instance.
// The old module differs only in the five receiver-reconstructed endpoint fields.
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const dir=path.resolve('artifacts/network-stream-20260921');fs.mkdirSync(dir,{recursive:true});
const original=fs.readFileSync('src/network/CombatSnapshot.ts','utf8');
const before=original.replace("case CaptureProjection.Ship: return key === 'prevPos' || key === 'prevFacingRad';",'case CaptureProjection.Ship: return false;').replace("return key === 'prevPos' || key === 'prevBallisticTail' || key === 'prevFadeProgress'\n        || key === 'spawnLocation'", "return key === 'spawnLocation'");
if(before===original||before.includes("return key === 'prevPos'"))throw Error('Endpoint-only source substitution no longer matches');
const outfile=path.join(dir,'paired-endpoints.mjs');
await build({entryPoints:['scripts/benchmark-snapshot-endpoints.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'paired-old-capture',setup(b){b.onResolve({filter:/^old-combat-projection$/},()=>({path:'old-combat-projection',namespace:'paired'}));b.onLoad({filter:/.*/,namespace:'paired'},()=>({contents:before,loader:'ts',resolveDir:path.resolve('src/network')}));}}],define:{__LAN_BUILD_ID__:'"paired-endpoint-probe"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
