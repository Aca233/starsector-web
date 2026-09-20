import {build} from 'esbuild';
import fs from 'node:fs/promises';
const out='artifacts/lockstep-20260920';await fs.mkdir(out,{recursive:true});
for(const kind of ['node','browser'])await build({entryPoints:['scripts/lockstep-replay-'+kind+'.mts'],outfile:out+'/replay-'+kind+'.mjs',bundle:true,platform:kind,format:'esm',target:'es2022',define:{__LAN_BUILD_ID__:'"lockstep-preflight"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'info'});
